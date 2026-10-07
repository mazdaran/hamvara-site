// Deliberately small, fixed-schema XLSX exporter. No Excel/CDN/npm dependency on the server.
// SpreadsheetML structure: https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document
// This is an output writer only; it never opens untrusted ZIP archives or executes formulas.
import { deflateRawSync, crc32 } from 'node:zlib';
import { COLUMNS, parseNumber } from '../../sku-bridge/core.mjs';

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const numeric = new Set(['price', 'stock', 'min', 'max']);

function text(value) {
  // Escape literal OOXML escape sequences before encoding CR (XML would otherwise normalize it).
  return value.replace(/_x([0-9a-f]{4})_/gi, '_x005F_x$1_').replace(/\r/g, '_x000D_')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function cell(ref, value, style = 1) {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${text(value)}</t></is></c>`;
}

// ZIP 2.0, raw deflate, fixed ASCII entry names, no data descriptors/ZIP64 required for this bounded exporter.
function zip(entries) {
  const local = [], central = []; let offset = 0;
  for (const [name, content] of entries) {
    const path = Buffer.from(name), raw = Buffer.from(XML + content), data = deflateRawSync(raw), crc = crc32(raw);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4);
    h.writeUInt16LE(8, 8); h.writeUInt16LE(33, 12); // 1980-01-01, deterministic archive date
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(path.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6);
    c.writeUInt16LE(8, 10); c.writeUInt16LE(33, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(path.length, 28); c.writeUInt32LE(offset, 42);
    local.push(h, path, data); central.push(c, path); offset += h.length + path.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

// Caller must authorize payment and validate the rows before reaching this function.
export function serializeXlsx(rows) {
  const endRow = rows.length + 1;
  const header = '<row r="1" ht="26" customHeight="1">' + COLUMNS.map((key, i) => cell(`${String.fromCharCode(65 + i)}1`, key, 3)).join('') + '</row>';
  const data = rows.map((row, i) => '<row r="' + (i + 2) + '">' + COLUMNS.map((key, j) => {
    const ref = `${String.fromCharCode(65 + j)}${i + 2}`, value = row[key];
    if (!numeric.has(key)) return cell(ref, value);
    if (!value) return `<c r="${ref}" s="2"/>`;
    const parsed = parseNumber(value, 'canonical');
    // Excel cannot retain values below its minimum normal positive double; fail rather than silently round to zero.
    if (!parsed.ok || (/[^0.\-]/.test(value) && Math.abs(parsed.number) < 2.2250738585072014e-308)) throw Error('xlsx_number_range');
    return `<c r="${ref}" s="2" t="n"><v>${parsed.value}</v></c>`;
  }).join('') + '</row>').join('');
  const widths = [26, 48, 25, 15, 20, 13, 20, 24, 20, 20];
  const sheet = `<worksheet xmlns="${NS}"><dimension ref="A1:J${endRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>` + widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('') + `</cols><sheetData>${header}${data}</sheetData><autoFilter ref="A1:J${endRow}"/></worksheet>`;
  const styles = `<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176B52"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return zip([
    ['[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets><sheet name="Approved SKU" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles],
    ['xl/worksheets/sheet1.xml', sheet]
  ]);
}
