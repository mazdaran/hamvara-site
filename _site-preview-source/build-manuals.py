"""Generate public beginner manuals and self-contained offline copies."""
from pathlib import Path
from html import escape as e
import json, csv, io
R=Path(__file__).resolve().parents[1];OUT=R/'guides'
DATA={code:json.loads((Path(__file__).parent/'manuals'/f'{code}.json').read_text()) for code in ['en','fa','tr']}
SLUG={'mrp':'mrp-saas','sku':'sku-bridge'}
def base(lang):return '/guides/'+('' if lang=='en' else lang+'/')
def page_url(lang,key):return base(lang)+(SLUG[key]+'.html' if key else '')
def header(lang,key,offline=False):
 d=DATA[lang];title=d[key]['title'] if key else d['help'];lead=d[key]['lead'] if key else d['hubLead']
 langs=''.join(f'<a href="https://hamvara.com{page_url(c,key)}" lang="{c}" hreflang="{c}" aria-current="{"page" if c==lang else "false"}">{v}</a>' for c,v in [('en','EN'),('fa','فارسی'),('tr','TR')])
 assets=('<style>'+(OUT/'assets/manual.css').read_text()+'</style>') if offline else '<link rel="stylesheet" href="/guides/assets/manual.css?v=20261008-1">'
 return f'<!doctype html><html lang="{lang}" dir="{"rtl" if lang=="fa" else "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(title)} | Hamvara</title><meta name="description" content="{e(lead)}"><link rel="canonical" href="https://hamvara.com{page_url(lang,key)}">{assets}</head><body><a class="skip" href="#main">{e(d["contents"])}</a><header class="top"><div class="shell"><a class="brand" href="https://hamvara.com/">Hamvara<span>.</span></a><nav class="header-links"><a href="https://hamvara.com/">{e(d["home"])}</a><a href="https://hamvara.com{base(lang)}">{e(d["help"])}</a></nav><nav class="languages" aria-label="Language">{langs}</nav></div></header>'
def footer(lang,offline=False):
 script=('<script>'+(OUT/'assets/manual.js').read_text()+'</script>') if offline else '<script src="/guides/assets/manual.js?v=20261008-1" defer></script>'
 return '<footer class="footer"><div class="shell">© 2026 Hamvara · <a href="mailto:info@hamvara.com">info@hamvara.com</a> · <a href="tel:+905369247371"><bdi>+90 536 924 73 71</bdi></a></div></footer>'+script+'</body></html>'
def manual(lang,key,offline=False):
 d=DATA[lang];m=d[key];slug=SLUG[key]
 toc=''.join(f'<a href="#{c["id"]}">{e(c["title"])}</a>' for c in m['chapters'])
 glossary=''.join(f'<div><dt>{e(t)}</dt><dd>{e(v)}</dd></div>' for t,v in m['glossary'])
 table='<div class="table-scroll" tabindex="0" role="region" aria-label="'+e(m['practiceTitle'])+'"><table><thead><tr>'+''.join('<th scope="col">'+e(c)+'</th>' for c in m['practiceHeaders'])+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+e(c)+'</td>' for c in row)+'</tr>' for row in m['practiceRows'])+'</tbody></table></div>'
 sample=f'<div class="actions"><a class="button secondary" href="https://hamvara.com/guides/downloads/sku-bridge-practice.csv" download>{e(d["sample"])}</a></div>' if key=='sku' else ''
 chapters=''
 for c in m['chapters']:
  steps=''.join('<li>'+e(t)+'</li>' for t in c['steps'])
  chapters+=f'<section class="chapter" id="{c["id"]}" data-chapter><h2>{e(c["title"])}</h2><span class="where">{e(c["where"])}</span><p class="section-label">{e(d["steps"])}</p><ol>{steps}</ol><div class="expected"><strong>{e(d["expected"])}</strong>{e(c["expected"])}</div><aside class="note"><strong>{e(d["note"])}</strong>{e(c["note"])}</aside><label class="completion"><input type="checkbox" data-complete>{e(d["done"])}</label></section>'
 faq=''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q,a in m['faq'])
 app='https://hamvara.com/'+('mrp/' if key=='mrp' else 'sku-bridge/')
 ai='https://hamvara.com/site-preview/'+('' if lang=='en' else lang+'/')+'guides.html#ai-help'
 return header(lang,key,offline)+f'''<main id="main" class="shell"><div class="intro"><span class="kicker">HAMVARA / USER GUIDE / {"SAAS" if key=="mrp" else "WEB BETA"}</span><h1>{e(m['title'])}</h1><p class="lead">{e(m['lead'])}</p><p class="scope">{e(m['scope'])}</p><p class="meta">{e(d['updated'])}</p>{('<p class="meta">'+e(d['offline'])+'</p>') if offline else ''}<div class="actions"><a class="button" href="{app}" target="_blank" rel="noopener noreferrer">{e(d['open'])} ↗</a><button class="button secondary" type="button" data-print>{e(d['print'])}</button><a class="button secondary" href="https://hamvara.com/guides/downloads/{slug}-{lang}.html" download>{e(d['download'])}</a></div><p class="goal">{e(m['goal'])}</p></div><div class="manual-layout"><aside class="toc"><h2>{e(d['contents'])}</h2><label for="manual-search">{e(d['search'])}</label><input id="manual-search" data-manual-search type="search" placeholder="{e(d['searchHint'])}"><button class="search-reset" data-clear-search type="button">{e(d['clear'])}</button><nav><a href="#terms">{e(d["glossaryTitle"])}</a><a href="#practice">{e(d['practice'])}</a>{toc}<a href="#questions">{e(m['faqTitle'])}</a></nav><progress value="0" max="{len(m['chapters'])}" aria-label="{e(d['progress'])}"></progress><p class="progress-text"><bdi data-progress-count>0 / {len(m['chapters'])}</bdi> {e(d['progress'])}</p></aside><article class="manual-content"><section id="terms" class="reference"><h2>{e(d["glossaryTitle"])}</h2><dl class="glossary">{glossary}</dl></section><section id="practice" class="exercise"><span class="kicker">DEMO</span><h2>{e(m['practiceTitle'])}</h2><p>{e(m['practiceLead'])}</p>{table}{sample}</section><p class="empty" data-empty role="status" hidden>{e(d['empty'])}</p>{chapters}<section class="faq" id="questions"><h2>{e(m['faqTitle'])}</h2>{faq}</section><section class="advanced"><h2>{e(m['advancedTitle'])}</h2><p>{e(m['advanced'])}</p><a href="{ai}">ChatGPT ↗</a></section><div class="support"><h2>{e(d['contact'])}</h2><p><a href="mailto:info@hamvara.com?subject={slug}%20guide%20help">info@hamvara.com</a> · <a href="https://wa.me/905369247371" target="_blank" rel="noopener noreferrer"><bdi>+90 536 924 73 71</bdi></a></p></div></article></div></main>'''+footer(lang,offline)
def hub(lang):
 d=DATA[lang]
 cards=''.join(f'<article class="hub-card"><span class="kicker">{"MRP SAAS" if key=="mrp" else "SKU BRIDGE"}</span><h2>{e(d[key]["title"])}</h2><p>{e(d[key]["lead"])}</p><p class="goal">{e(d[key]["goal"])}</p><a class="button" href="{page_url(lang,key)}">{e(d["read"])} →</a></article>' for key in ['mrp','sku'])
 return header(lang,None)+f'<main id="main" class="shell"><div class="intro"><span class="kicker">HAMVARA / HELP CENTER</span><h1>{e(d["hubTitle"])}</h1><p class="lead">{e(d["hubLead"])}</p></div><div class="hub-grid">{cards}</div><div class="hub-extra"><h2>{e(d["website"])}</h2><p>{e(d["websiteLead"])}</p><a href="/site-preview/{"" if lang=="en" else lang+"/"}guides.html#website">{e(d["read"])}</a></div></main>'+footer(lang)
def build():
 for lang in DATA:
  dest=OUT/('' if lang=='en' else lang);dest.mkdir(parents=True,exist_ok=True)
  (dest/'index.html').write_text(hub(lang))
  for key,slug in SLUG.items():
   (dest/(slug+'.html')).write_text(manual(lang,key))
   (OUT/'downloads'/f'{slug}-{lang}.html').write_text(manual(lang,key,True))
 rows=[['SKU','Description','UOM','Price','Currency','Stock','Warehouse'],['DEMO-SCREW','Practice screw','piece','0.20','TRY','30','Raw Materials'],['DEMO-BOX','Practice box','piece','1.00','TRY','10','Packaging'],['demo-screw','Duplicate practice screw','piece','0.25','TRY','5','Raw Materials'],['','Practice tape','roll','','TRY','2','Packaging']]
 with (OUT/'downloads/sku-bridge-practice.csv').open('w',newline='',encoding='utf-8-sig') as f:csv.writer(f).writerows(rows)
 print('Built 6 user manuals, 3 help-center pages, 6 self-contained offline guides and practice CSV.')
if __name__=='__main__':build()
