import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNumericText,parseLocalizedNumber} from '../../mrp/numbers.js';

test('normalizes Persian and Arabic-Indic digits',()=>{
  assert.equal(normalizeNumericText('۱۲۳٫۴۵'),'123.45');
  assert.equal(normalizeNumericText('١٢٣٫٤٥'),'123.45');
});

test('parses localized decimal and thousands separators',()=>{
  assert.equal(parseLocalizedNumber('۱٬۲۳۴٫۵'),1234.5);
  assert.equal(parseLocalizedNumber('13,5'),13.5);
});
