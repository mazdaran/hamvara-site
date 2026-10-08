"""Shared, static growth components and an editorial article archive."""
from pathlib import Path
from html import escape as E
from urllib.parse import urlparse
import json
R=Path(__file__).resolve().parents[1]
D=json.loads((R/'_site-preview-source/articles/content.json').read_text())
POSTS=json.loads((R/'_site-preview-source/articles/posts.json').read_text())
def base(lang,kind='articles'):return '/'+kind+'/'+('' if lang=='en' else lang+'/')
def txt(d,k):return f'<span data-gx="{k}">{E(d[k])}</span>'
def assets():return '<link rel="stylesheet" href="/articles/assets/growth.css?v=20261008-1"><script src="/articles/assets/growth.js?v=20261008-1" defer></script>'
def navigator(lang):
 d=D[lang];n=d['needs'][0]
 opts=''.join(f'<button type="button" data-need="{a[0]}" aria-pressed="{"true" if i==0 else "false"}">{E(a[1])}</button>' for i,a in enumerate(d['needs']))
 return f'''<section class="gx gx-nav" id="find-tool" aria-labelledby="need-title"><div class="gx-heading"><span class="gx-kicker">HAMVARA / START HERE</span><h2 id="need-title" data-gx="choose">{E(d['choose'])}</h2><p data-gx="chooseLead">{E(d['chooseLead'])}</p></div><div class="gx-choices" role="group" aria-labelledby="need-title">{opts}</div><div class="gx-result" aria-live="polite" aria-atomic="true"><div><small data-gx="recommended">{E(d['recommended'])}</small><h3 data-need-title>{E(n[2])}</h3><p data-need-description>{E(n[3])}</p></div><div class="gx-actions"><a class="gx-button" data-need-open href="{n[4]}">{txt(d,'open')} ↗</a><a data-need-guide href="{base(lang,'guides')}{n[5]}.html">{txt(d,'guide')}</a></div></div><div class="gx-sample"><a class="gx-button gx-outline" href="/sku-bridge/?demo=1">{txt(d,'sample')} →</a><p data-gx="sampleNote">{E(d['sampleNote'])}</p></div><noscript><p><a href="/sku-bridge/">SKU Bridge</a> · <a href="/bom-costwatch/">BOM CostWatch</a> · <a href="/loadfit/">LoadFit</a> · <a href="/po-chaser/">PO Chaser</a></p></noscript></section>'''
def request(lang):
 d=D[lang]
 return f'''<section class="gx gx-request" id="request-demo"><div class="gx-heading"><span class="gx-kicker">HAMVARA / LET’S TALK</span><h2 data-gx="request">{E(d['request'])}</h2><p data-gx="requestLead">{E(d['requestLead'])}</p></div><form data-demo-form hidden><label for="demo-problem" data-gx="problem">{E(d['problem'])}</label><textarea id="demo-problem" name="problem" required maxlength="800" rows="3"></textarea><label for="demo-time" data-gx="time">{E(d['time'])}</label><input id="demo-time" name="time" maxlength="120" placeholder="{E(d['timeHint'])}"><div class="gx-actions"><button class="gx-button" type="submit" data-gx="prepare">{E(d['prepare'])}</button></div><p class="gx-small" data-gx="requestNote">{E(d['requestNote'])}</p><div data-request-result hidden><p role="status" data-gx="requestReady">{E(d['requestReady'])}</p><div class="gx-actions"><a class="gx-button" data-request-email href="mailto:info@hamvara.com">{txt(d,'prepare')}</a><a class="gx-button gx-outline" data-request-wa href="https://wa.me/905369247371" target="_blank" rel="noopener noreferrer">{txt(d,'whatsapp')}</a></div></div></form><noscript><a href="mailto:info@hamvara.com">info@hamvara.com</a> · <a href="https://wa.me/905369247371">WhatsApp</a></noscript></section>'''
def teaser(lang):
 d=D[lang]
 cards=''.join(f'<article class="gx-card"><span class="gx-kicker" data-gx="{p["category"]}">{E(d[p["category"]])}</span><h3><a href="{base(lang)}{p["slug"]}.html" data-post-link="{p["slug"]}" data-post-title="{p["slug"]}">{E(p["translations"][lang]["title"])}</a></h3><p data-post-summary="{p["slug"]}">{E(p["translations"][lang]["summary"])}</p></article>' for p in POSTS[:2])
 return f'<section class="gx" id="articles"><div class="gx-heading"><h2 data-gx="newArticles">{E(d["newArticles"])}</h2><p data-gx="newLead">{E(d["newLead"])}</p></div><div class="gx-cards">{cards}</div><a class="gx-button gx-outline" href="{base(lang)}" data-articles-link>{txt(d,"archive")} →</a></section>'
def head(lang,p=None):
 d=D[lang];title=p['translations'][lang]['title'] if p else d['articles'];desc=p['translations'][lang]['summary'] if p else d['lead'];suffix=p['slug']+'.html' if p else '';url='https://hamvara.com'+base(lang)+suffix
 alts=''.join(f'<link rel="alternate" hreflang="{l}" href="https://hamvara.com{base(l)}{suffix}">' for l in D)
 langs=''.join(f'<a href="{base(l)}{suffix}" lang="{l}" hreflang="{l}" aria-current="{"page" if l==lang else "false"}">{v}</a>' for l,v in [('en','EN'),('fa','فارسی'),('tr','TR')])
 schema={'@context':'https://schema.org','@type':'Article' if p else 'CollectionPage','headline':title,'description':desc,'url':url,'inLanguage':lang}
 if p:schema.update(datePublished=p['date'],author={'@type':'Organization','name':'Hamvara'},publisher={'@type':'Organization','name':'Hamvara'},mainEntityOfPage=url)
 return f'''<!doctype html><html lang="{lang}" dir="{'rtl' if lang=='fa' else 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{E(title)} | Hamvara</title><meta name="description" content="{E(desc)}"><link rel="canonical" href="{url}">{alts}<meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}"><meta property="og:url" content="{url}"><meta property="og:type" content="{'article' if p else 'website'}"><meta property="og:site_name" content="Hamvara">{assets()}<script type="application/ld+json">{json.dumps(schema,ensure_ascii=False).replace('<','&lt;')}</script></head><body class="gx-page"><a class="gx-skip" href="#main">{E(d['articles'])}</a><header class="gx-top"><a class="gx-brand" href="/">Hamvara<span>.</span></a><nav><a href="/">{E(d['home'])}</a><a href="{base(lang)}">{E(d['articles'])}</a><a href="{base(lang,'guides')}">{E(d['guides'])}</a></nav><nav aria-label="Language">{langs}</nav></header>'''
def foot(lang):return '<footer class="gx-footer">© 2026 Hamvara · <a href="mailto:info@hamvara.com">info@hamvara.com</a></footer><script src="/support/widget.js?v=20261008-1" defer></script></body></html>'
def hub(lang):
 d=D[lang];cards=''
 for p in POSTS:
  t=p['translations'][lang]
  cards+=f'<article class="gx-card" data-article data-category="{p["category"]}"><div class="gx-meta"><span>{E(d[p["category"]])}</span><time datetime="{p["date"]}">{p["date"]}</time><span>{p["minutes"]} {E(d["minutes"])}</span></div><h2><a href="{base(lang)}{p["slug"]}.html">{E(t["title"])}</a></h2><p>{E(t["summary"])}</p><span class="gx-small">{E(d["original"] if not p.get("source") else p["source"]["name"])}</span><a class="gx-read" href="{base(lang)}{p["slug"]}.html">{E(d["read"])} →</a></article>'
 opts=''.join(f'<option value="{k}">{E(d[k])}</option>' for k in ['all','production','data'])
 return head(lang)+f'<main id="main" class="gx-container"><div class="gx-intro"><span class="gx-kicker">HAMVARA / JOURNAL</span><h1>{E(d["articles"])}</h1><p>{E(d["lead"])}</p></div><div class="gx-search"><label>{E(d["search"])}<input type="search" data-article-search></label><label>{E(d["all"])}<select data-article-category>{opts}</select></label></div><div class="gx-cards">{cards}</div><p role="status" data-article-empty hidden>{E(d["empty"])}</p></main>'+foot(lang)
def article(lang,p):
 d=D[lang];t=p['translations'][lang];url='https://hamvara.com'+base(lang)+p['slug']+'.html'
 sections=''.join(f'<section><h2>{E(h)}</h2><p>{E(body)}</p></section>' for h,body in t['sections'])
 src=p.get('source');source=''
 if src:
  assert urlparse(src['url']).scheme=='https'
  source=f'<p>{E(d["source"])}: <a href="{E(src["url"])}" rel="noopener noreferrer" target="_blank">{E(src["name"])}</a></p>'
 return head(lang,p)+f'<main id="main" class="gx-reading"><a href="{base(lang)}">← {E(d["archive"])}</a><article><header class="gx-intro"><span class="gx-kicker" data-gx="{p["category"]}">{E(d[p["category"]])}</span><h1>{E(t["title"])}</h1><p>{E(t["summary"])}</p><div class="gx-meta"><span>{E(d["team"])}</span><time datetime="{p["date"]}">{p["date"]}</time><span>{p["minutes"]} {E(d["minutes"])}</span></div>{source}<button class="gx-button gx-outline" type="button" data-copy-link="{url}">{E(d["copy"])}</button><p data-copy-status role="status"></p></header>{sections}<aside class="gx-next"><h2>{E(d["related"])}</h2><a class="gx-button" href="{base(lang,"guides")}{p["guide"]}.html">{E(d["guide"])} →</a></aside></article></main>'+foot(lang)
def build():
 for lang in D:
  dest=R/base(lang).strip('/');dest.mkdir(parents=True,exist_ok=True)
  (dest/'index.html').write_text(hub(lang))
  for p in POSTS:(dest/(p['slug']+'.html')).write_text(article(lang,p))
 template=(R/'_site-preview-source/articles/growth.js').read_text()
 (R/'articles/assets/growth.js').write_text(template.replace('__COPY__',json.dumps(D,ensure_ascii=False)).replace('__POSTS__',json.dumps(POSTS,ensure_ascii=False)))
 # Replace only marked components, preserving the existing home and product applications.
 import re
 home=R/'index.html';s=home.read_text()
 for name,markup in [('navigator',navigator('en')),('articles',teaser('en')),('request',request('en'))]:
  marker=f'<!-- growth:{name} -->';end=f'<!-- /growth:{name} -->'
  block=marker+markup+end
  if marker in s:s=re.sub(re.escape(marker)+'.*?'+re.escape(end),lambda m:block,s,flags=re.S)
  elif name=='navigator':s=s.replace('<section id="products"',block+'\n<section id="products"',1)
  elif name=='articles':s=s.replace('<section id="contact"',block+'\n<section id="contact"',1)
  else:s=s.replace('</main>',block+'\n</main>',1)
 if '/articles/assets/growth.css' not in s:s=s.replace('</head>',assets()+'</head>',1)
 home.write_text(s)
 sitemap=R/'sitemap.xml';xml=sitemap.read_text();entries=[]
 for lang in D:
  for suffix in ['']+[p['slug']+'.html' for p in POSTS]:
   url='https://hamvara.com'+base(lang)+suffix
   if '<loc>'+url+'</loc>' not in xml:entries.append('<url><loc>'+url+'</loc></url>')
 sitemap.write_text(xml.replace('</urlset>','\n'.join(entries)+'\n</urlset>') if entries else xml)
 print('Built article archive, 6 articles and shared homepage components.')
if __name__=='__main__':build()
