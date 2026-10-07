from pathlib import Path
from html import escape
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'site-preview'
DATA = {lang: json.loads((Path(__file__).parent / f'content-{lang}.json').read_text()) for lang in ['en','fa','tr']}
E = lambda x: escape(str(x), quote=True)

def base(lang):
    return '/site-preview/' + (lang + '/' if lang != 'en' else '')

def href(lang, page='index'):
    return base(lang) + ('' if page == 'index' else page + '.html')

def icon(name):
    paths = {
      'arrow': '<path d="M5 12h14M13 6l6 6-6 6"/>',
      'check': '<path d="m5 12 4 4L19 6"/>',
      'mail': '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
      'phone': '<path d="M7 3 4 5c-2 7 8 17 15 15l2-3-5-3-2 2-6-6 2-2-3-5Z"/>',
      'whatsapp': '<path d="M20 11a8 8 0 0 1-12 7l-5 2 2-5a8 8 0 1 1 15-4Z"/><path d="M8 7c0 5 4 8 8 8"/>',
      'linkedin': '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 10v7m4 0v-7m0 3a3 3 0 0 1 6 0v4"/><circle cx="7" cy="7" r=".8"/>',
      'instagram': '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".6"/>',
      'grid': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      'file': '<path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>',
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>'

def link(url, text, cls='button', external=False):
    attrs = ' target="_blank" rel="noopener noreferrer"' if external else ''
    return f'<a class="{cls}" href="{E(url)}"{attrs}>{E(text)}{icon("arrow")}</a>'

def head(lang, page, title, description):
    d = DATA[lang]
    languages = ''.join(f'<a href="{href(code,page)}" lang="{code}" hreflang="{code}" aria-current="{"page" if lang==code else "false"}">{label}</a>' for code,label in [('en','EN'),('fa','فارسی'),('tr','TR')])
    nav = ''.join(f'<a href="{href(lang)}#{key}">{E(d["nav"][key])}</a>' for key in ['products','pricing','workflow','contact'])
    return f'''<!doctype html>
<html lang="{lang}" dir="{'rtl' if lang=='fa' else 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="description" content="{E(description)}"><meta name="theme-color" content="#102b3b"><title>{E(title)} — Hamvara</title><link rel="stylesheet" href="/site-preview/assets/site.css?v=20261007-1"><script src="/site-preview/assets/site.js?v=20261007-1" defer></script></head><body>
<a class="skip-link" href="#main">{E(d['skip'])}</a>
<div class="review-strip"><div class="shell"><span class="review-dot"></span><strong>{E(d['preview'])}</strong><span>{E(d['previewNote'])}</span></div></div>
<header class="site-header"><div class="shell header-inner"><a class="brand" href="{href(lang)}" aria-label="Hamvara"><span class="brand-mark">{icon('grid')}</span>Hamvara<span class="brand-dot">.</span></a><nav class="main-nav" aria-label="{E(d['navigation'])}">{nav}</nav><div class="language-switch" aria-label="{E(d['language'])}">{languages}</div>{link(href(lang)+'#products', d['getStarted'], 'button compact')}</div></header>'''

def footer(lang):
    d=DATA[lang]
    links=''.join(f'<a href="{href(lang,key)}">{E(d["legalNames"][key])}</a>' for key in ['terms','privacy','refunds'])
    return f'''<footer class="site-footer"><div class="shell footer-top"><a class="brand" href="{href(lang)}"><span class="brand-mark">{icon('grid')}</span>Hamvara<span class="brand-dot">.</span></a><p>{E(d['footerTag'])}</p><nav aria-label="{E(d['legalNav'])}">{link(href(lang,'tools'),d['allTools'],'text-link')}{links}<a href="{href(lang)}#contact">{E(d['nav']['contact'])}</a></nav></div><div class="shell footer-bottom"><span>© 2026 Mohammad Bagher Yahya Mazdarani</span><span>{E(d['location'])}</span><span>{E(d['preview'])} · 07 Oct 2026</span></div></footer></body></html>'''

def feature_list(items):
    return '<ul class="feature-list">'+''.join(f'<li>{icon("check")}<span>{E(item)}</span></li>' for item in items)+'</ul>'

def demo(lang):
    d=DATA[lang]['demo']
    rows=[('RAW-100','4006381333931','12,500','ready'),('PKG-020','—','200','ready'),('ZERO-1','—','0','ready'),('raw-100','—','45','duplicate')]
    trs=''.join(f'<tr class="{"issue-row" if state=="duplicate" else ""}"><td><code>{sku}</code></td><td><bdi>{barcode}</bdi></td><td><bdi>{stock}</bdi></td><td><span class="row-status {state}">{E(d[state])}</span></td></tr>' for sku,barcode,stock,state in rows)
    return f'''<div class="demo-board"><div class="board-top"><div class="product-avatar">{icon('file')}</div><div><strong>SKU Bridge</strong><span>{E(d['label'])}</span></div><span class="demo-badge">{E(d['sample'])}</span></div><div class="board-heading"><span class="eyebrow">{E(d['eyebrow'])}</span><h2>{E(d['title'])}</h2><p>{E(d['subtitle'])}</p></div><div class="board-stats"><div><strong>04</strong><span>{E(d['rows'])}</span></div><div><strong>03</strong><span>{E(d['ready'])}</span></div><div class="warning-stat"><strong>01</strong><span>{E(d['needsReview'])}</span></div></div><div class="table-scroll" tabindex="0" role="region" aria-label="{E(d['tableLabel'])}"><table><caption class="sr-only">{E(d['tableLabel'])}</caption><thead><tr><th>SKU</th><th>{E(d['barcode'])}</th><th>{E(d['stock'])}</th><th>{E(d['status'])}</th></tr></thead><tbody>{trs}</tbody></table></div><div class="board-note"><span class="note-icon">!</span><p>{E(d['note'])}</p></div><div class="board-bottom"><span>{icon('check')}{E(d['export'])}</span><bdi>XLSX / CSV</bdi></div></div>'''

def products(lang):
    d=DATA[lang]
    cards=''
    for i,key in enumerate(['sku','mrp']):
        p=d[key]
        url='/sku-bridge/' if key=='sku' else '/mrp/'
        cards+=f'''<article class="product-card {key}"><div class="card-kicker"><span class="product-avatar">{icon('file' if key=='sku' else 'grid')}</span><span>{E(p['eyebrow'])}</span><span class="product-index">0{i+1}</span></div><h3>{E(p['name'])}</h3><p class="product-promise">{E(p['promise'])}</p><p>{E(p['description'])}</p>{feature_list(p['features'])}<div class="card-actions">{link(url,p['cta'],'button '+('dark' if key=='mrp' else ''))}{link(href(lang)+'#pricing',d['viewPricing'],'text-link')}</div><p class="fine-print">{E(p['availability'])}</p></article>'''
    return f'''<section id="products" class="section shell"><div class="section-heading"><div><span class="eyebrow">{E(d['productsEyebrow'])}</span><h2>{E(d['productsTitle'])}</h2></div><p>{E(d['productsLead'])}</p></div><div class="product-grid">{cards}</div></section>'''

def workflow(lang):
    d=DATA[lang]['workflow']
    steps=''.join(f'<li><span class="step-number">0{i+1}</span><h3>{E(s[0])}</h3><p>{E(s[1])}</p></li>' for i,s in enumerate(d['steps']))
    return f'''<section id="workflow" class="workflow-section"><div class="shell"><div class="section-heading"><div><span class="eyebrow">{E(d['eyebrow'])}</span><h2>{E(d['title'])}</h2></div><p>{E(d['lead'])}</p></div><ol class="workflow-steps">{steps}</ol><div class="workflow-bottom"><span>{icon('check')}{E(d['bottom'])}</span>{link('/sku-bridge/',d['cta'],'text-link light')}</div></div></section>'''

def pricing(lang):
    d=DATA[lang]; p=d['pricing']
    return f'''<section id="pricing" class="section shell"><div class="section-heading"><div><span class="eyebrow">{E(p['eyebrow'])}</span><h2>{E(p['title'])}</h2></div><p>{E(p['lead'])}</p></div><div class="pricing-notice">{E(p['notice'])}</div><div class="billing-toggle" role="group" aria-label="{E(p['choosePeriod'])}"><button type="button" data-billing="monthly" aria-pressed="true">{E(p['monthly'])}</button><button type="button" data-billing="annual" aria-pressed="false">{E(p['annual'])}<span>{E(p['save'])}</span></button></div><div class="pricing-grid"><article class="price-card featured"><span class="eyebrow">{E(p['skuBadge'])}</span><h3>SKU Bridge</h3><p>{E(p['skuLead'])}</p><div data-period="monthly"><div class="price"><bdi>$12</bdi><span>{E(p['perMonth'])}</span></div><p class="billing-line">{E(p['monthlyNote'])}</p></div><div data-period="annual" hidden><div class="price"><bdi>$120</bdi><span>{E(p['perYear'])}</span></div><p class="billing-line">{E(p['annualNote'])}</p></div>{feature_list(p['skuFeatures'])}{link('mailto:info@hamvara.com?subject=SKU%20Bridge%20launch',p['askSku'],'button wide')}<p class="fine-print">{E(p['skuFine'])}</p></article><article class="price-card"><span class="eyebrow">{E(p['mrpBadge'])}</span><h3>Hamvara MRP SaaS</h3><p>{E(p['mrpLead'])}</p><div class="price"><bdi>$590</bdi><span>{E(p['perYear'])}</span></div><p class="billing-line">{E(p['mrpNote'])}</p>{feature_list(p['mrpFeatures'])}{link('mailto:info@hamvara.com?subject=Hamvara%20MRP%20demo',p['askMrp'],'button outline wide')}<p class="fine-print">{E(p['mrpFine'])}</p></article></div><p class="price-footnote">{E(p['tax'])} <a href="{href(lang,'refunds')}">{E(d['legalNames']['refunds'])}</a></p><noscript><p class="pricing-notice">{E(p['noScript'])}</p></noscript></section>'''

def tool_cards(lang, featured=False):
    d=DATA[lang]; items=d['tools']['items'][:6] if featured else d['tools']['items']
    return ''.join(f'<a class="tool-card" href="/{E(t[0])}/" data-tool data-category="{E(t[1])}"><span class="tool-category">{E(d["tools"]["categories"][t[1]])}</span><h3>{E(t[2])}{icon("arrow")}</h3><p>{E(t[3])}</p><span class="tool-open">{E(d["tools"]["open"])} ↗</span></a>' for t in items)

def tools_teaser(lang):
    d=DATA[lang]['tools']
    return f'<section class="tools-section"><div class="shell"><div class="section-heading"><div><span class="eyebrow">{E(d["eyebrow"])}</span><h2>{E(d["title"])}</h2></div><p>{E(d["lead"])}</p></div><div class="tools-grid">{tool_cards(lang,True)}</div><div class="section-end">{link(href(lang,"tools"),d["browse"],"button outline")}</div></div></section>'

def faq(lang):
    d=DATA[lang]['faq']
    rows=''.join(f'<details><summary>{E(q)}<span aria-hidden="true">+</span></summary><p>{E(a)}</p></details>' for q,a in d['items'])
    return f'<section class="section shell faq-section"><div><span class="eyebrow">{E(d["eyebrow"])}</span><h2>{E(d["title"])}</h2><p>{E(d["lead"])}</p></div><div class="faq-list">{rows}</div></section>'

def contact(lang):
    d=DATA[lang]['contact']
    channels=[('mail','mailto:info@hamvara.com',d['email'],'info@hamvara.com',False),('phone','tel:+905526281004',d['phone'],'+90 552 628 10 04',False),('whatsapp','https://wa.me/905369247371',d['waIntl'],'+90 536 924 73 71',True),('whatsapp','https://wa.me/905526281004',d['waTr'],'+90 552 628 10 04',True),('instagram','https://www.instagram.com/hamvaramrp/','Instagram','Hamvara',True),('linkedin','https://www.linkedin.com/company/145269324/','LinkedIn','Hamvara',True)]
    cards=''.join(f'<a class="contact-link" href="{url}"'+(' target="_blank" rel="noopener noreferrer"' if ext else '')+f'><span class="contact-icon">{icon(ic)}</span><span><small>{E(label)}</small><strong><bdi>{E(value)}</bdi></strong></span><span class="contact-arrow">↗</span></a>' for ic,url,label,value,ext in channels)
    return f'<section id="contact" class="contact-section"><div class="shell contact-grid"><div><span class="eyebrow">{E(d["eyebrow"])}</span><h2>{E(d["title"])}</h2><p>{E(d["lead"])}</p><p class="contact-note">{E(d["note"])}</p></div><div class="contact-links">{cards}</div></div></section>'

def home(lang):
    d=DATA[lang]; h=d['hero']
    trust=''.join(f'<span>{icon("check")}{E(x)}</span>' for x in h['trust'])
    audience=''.join(f'<span>{E(x)}</span>' for x in d['audience'])
    return head(lang,'index',d['pageTitle'],h['lead'])+f'''<main id="main"><section class="hero"><div class="shell hero-grid"><div class="hero-copy"><span class="eyebrow"><span class="tiny-line"></span>{E(h['eyebrow'])}</span><h1>{E(h['title'])}<span>{E(h['accent'])}</span></h1><p class="hero-lead">{E(h['lead'])}</p><div class="hero-actions">{link('#products',h['primary'],'button')}{link('#workflow',h['secondary'],'button ghost')}</div><div class="hero-trust">{trust}</div></div><div class="hero-visual">{demo(lang)}<span class="visual-caption">{E(h['caption'])}</span></div></div><div class="shell audience-line"><span class="audience-label">{E(d['builtFor'])}</span>{audience}</div></section>{products(lang)}{workflow(lang)}{pricing(lang)}{tools_teaser(lang)}{faq(lang)}{contact(lang)}</main>'''+footer(lang)

def tools_page(lang):
    d=DATA[lang]; t=d['tools']
    filters=''.join(f'<button type="button" data-filter="{key}" aria-pressed="{"true" if key=="all" else "false"}">{E(value)}</button>' for key,value in t['categories'].items())
    return head(lang,'tools',t['pageTitle'],t['lead'])+f'''<main id="main" class="catalog-main shell"><div class="page-intro"><span class="eyebrow">{E(t['eyebrow'])}</span><h1>{E(t['title'])}</h1><p>{E(t['catalogLead'])}</p></div><div class="catalog-controls"><label class="search-label">{E(t['search'])}<input type="search" data-tool-search placeholder="{E(t['placeholder'])}" autocomplete="off"></label><div class="filter-buttons" role="group" aria-label="{E(t['filter'])}">{filters}</div></div><p class="catalog-count" data-catalog-count aria-live="polite" data-template="{E(t['count'])}">{E(t['count'].replace('{n}',str(len(t['items']))))}</p><div class="tools-grid">{tool_cards(lang)}</div><p class="empty-state" data-empty hidden>{E(t['empty'])}</p><div class="section-end">{link(href(lang)+'#products',d['backProducts'],'button outline')}</div></main>'''+footer(lang)

def legal_page(lang, kind):
    d=DATA[lang]; p=d['legal'][kind]
    sections=''.join(f'<section><h2>{E(title)}</h2><p>{E(body)}</p></section>' for title,body in p['sections'])
    notes=''.join(f'<li>{E(x)}</li>' for x in p['decisions'])
    source=''
    if kind=='refunds':
        source=f'<p class="reference-links"><a href="https://www.paddle.com/legal/refund-policy" target="_blank" rel="noopener noreferrer">{E(d["paddlePolicy"])}</a> · <a href="https://paddle.net" target="_blank" rel="noopener noreferrer">Paddle.net</a></p>'
    return head(lang,kind,d['legalNames'][kind],p['lead'])+f'''<main id="main" class="legal-main shell"><div class="page-intro"><span class="eyebrow">{E(d['draftLabel'])}</span><h1>{E(d['legalNames'][kind])}</h1><p>{E(p['lead'])}</p></div><div class="draft-notice"><strong>{E(d['draftNoticeTitle'])}</strong><p>{E(d['draftNotice'])}</p></div><div class="legal-layout"><article class="legal-copy">{sections}{source}</article><aside class="decision-box"><span class="eyebrow">{E(d['ownerReview'])}</span><h2>{E(d['decisionsTitle'])}</h2><ul>{notes}</ul>{link('mailto:info@hamvara.com',d['contactSupport'],'text-link')}</aside></div></main>'''+footer(lang)

def build():
    OUT.mkdir(parents=True,exist_ok=True)
    for lang in DATA:
        dest=OUT / (lang if lang!='en' else '')
        dest.mkdir(exist_ok=True)
        (dest/'index.html').write_text(home(lang),encoding='utf-8')
        (dest/'tools.html').write_text(tools_page(lang),encoding='utf-8')
        for kind in ['terms','privacy','refunds']:
            (dest/(kind+'.html')).write_text(legal_page(lang,kind),encoding='utf-8')
    print('Built 15 HTML pages in three languages.')

if __name__=='__main__':
    build()
