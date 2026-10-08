from pathlib import Path
from html import escape
import json
from growth import assets as growth_assets, navigator as need_navigator, teaser as article_teaser, request as demo_request, D as GROWTH_COPY
from experience import X, process, guide_cards, ai_help, offline_guide

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
    nav = ''.join(f'<a href="{href(lang)}#{key}">{E(label)}</a>' for key,label in zip(['products','how-we-work','guides','about','pricing','contact'],X[lang]['nav']))
    nav += f'<a href="/articles/{"" if lang=="en" else lang+"/"}">{E(GROWTH_COPY[lang]["articles"])}</a>'
    return f'''<!doctype html>
<html lang="{lang}" dir="{'rtl' if lang=='fa' else 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="description" content="{E(description)}"><meta name="theme-color" content="#102b3b"><title>{E(title)} — Hamvara</title><link rel="stylesheet" href="/site-preview/assets/site.css?v=20261008-1"><link rel="stylesheet" href="/site-preview/assets/experience.css?v=20261008-1"><script src="/site-preview/assets/site.js?v=20261008-1" defer></script><script src="/site-preview/assets/experience.js?v=20261008-1" defer></script>{growth_assets()}<link rel="stylesheet" href="/site-preview/assets/readable-theme.css?v=20261008-2"></head><body class="readable-theme">
<a class="skip-link" href="#main">{E(d['skip'])}</a>
<div class="review-strip"><div class="shell"><span class="review-dot"></span><strong>{E(d['preview'])}</strong><span>{E(d['previewNote'])}</span></div></div>
<header class="site-header"><div class="shell header-inner"><a class="brand" href="{href(lang)}" aria-label="Hamvara"><span class="brand-mark">{icon('grid')}</span>Hamvara<span class="brand-dot">.</span></a><nav class="main-nav" aria-label="{E(d['navigation'])}">{nav}</nav><div class="language-switch" aria-label="{E(d['language'])}">{languages}</div>{link(href(lang)+'#products', d['getStarted'], 'button compact')}</div></header>'''

def footer(lang):
    d=DATA[lang]
    links=''.join(f'<a href="{href(lang,key)}">{E(d["legalNames"][key])}</a>' for key in ['terms','privacy','refunds'])
    return f'''<footer class="site-footer"><div class="shell footer-top"><a class="brand" href="{href(lang)}"><span class="brand-mark">{icon('grid')}</span>Hamvara<span class="brand-dot">.</span></a><p>{E(d['footerTag'])}</p><nav aria-label="{E(d['legalNav'])}">{link(href(lang,'tools'),d['allTools'],'text-link')}{link(href(lang,'guides'),X[lang]['nav'][2],'text-link')}{link(href(lang,'about'),X[lang]['nav'][3],'text-link')}{links}<a href="{href(lang)}#contact">{E(d['nav']['contact'])}</a></nav></div><div class="shell footer-bottom"><span>© 2026 Mohammad Bagher Yahya Mazdarani</span><span>{E(d['location'])}</span><span>{E(d['preview'])} · 08 Oct 2026</span></div></footer></body></html>'''

def feature_list(items):
    return '<ul class="feature-list">'+''.join(f'<li>{icon("check")}<span>{E(item)}</span></li>' for item in items)+'</ul>'

def demo(lang):
    d=DATA[lang]['demo']
    rows=[('RAW-100','4006381333931','12,500','duplicate'),('PKG-020','—','200','ready'),('ZERO-1','—','0','ready'),('raw-100','—','45','duplicate')]
    trs=''.join(f'<tr class="{"issue-row" if state=="duplicate" else ""}"><td><code>{sku}</code></td><td><bdi>{barcode}</bdi></td><td><bdi>{stock}</bdi></td><td><span class="row-status {state}">{E(d[state])}</span></td></tr>' for sku,barcode,stock,state in rows)
    return f'''<div class="demo-board"><div class="board-top"><div class="product-avatar">{icon('file')}</div><div><strong>SKU Bridge</strong><span>{E(d['label'])}</span></div><span class="demo-badge">{E(d['sample'])}</span></div><div class="board-heading"><span class="eyebrow">{E(d['eyebrow'])}</span><h2>{E(d['title'])}</h2><p>{E(d['subtitle'])}</p></div><div class="board-stats"><div><strong>04</strong><span>{E(d['rows'])}</span></div><div><strong>02</strong><span>{E(d['ready'])}</span></div><div class="warning-stat"><strong>02</strong><span>{E(d['needsReview'])}</span></div></div><div class="table-scroll" tabindex="0" role="region" aria-label="{E(d['tableLabel'])}"><table><caption class="sr-only">{E(d['tableLabel'])}</caption><thead><tr><th>SKU</th><th>{E(d['barcode'])}</th><th>{E(d['stock'])}</th><th>{E(d['status'])}</th></tr></thead><tbody>{trs}</tbody></table></div><div class="board-note"><span class="note-icon">!</span><p>{E(d['note'])}</p></div><div class="board-bottom"><span>{icon('check')}{E(d['export'])}</span><bdi>XLSX / CSV</bdi></div></div>'''

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
    channels=[('mail','mailto:info@hamvara.com',d['email'],'info@hamvara.com',False),('phone','tel:+905369247371',d['phone'],'+90 536 924 73 71',False),('whatsapp','https://wa.me/905369247371','WhatsApp','+90 536 924 73 71',True),('instagram','https://www.instagram.com/hamvaramrp/','Instagram','Hamvara',True),('linkedin','https://www.linkedin.com/company/145269324/','LinkedIn','Hamvara',True)]
    cards=''.join(f'<a class="contact-link" href="{url}"'+(' target="_blank" rel="noopener noreferrer"' if ext else '')+f'><span class="contact-icon">{icon(ic)}</span><span><small>{E(label)}</small><strong><bdi>{E(value)}</bdi></strong></span><span class="contact-arrow">↗</span></a>' for ic,url,label,value,ext in channels)
    return f'<section id="contact" class="contact-section"><div class="shell contact-grid"><div><span class="eyebrow">{E(d["eyebrow"])}</span><h2>{E(d["title"])}</h2><p>{E(d["lead"])}</p><p class="contact-note">{E(d["note"])}</p></div><div class="contact-links">{cards}</div></div></section>'

def mrp_tour(lang):
    x=X[lang]
    tour=(Path(__file__).parent/'mrp-tour.html').read_text()
    tour=tour.replace('● AUTO TOUR','● SAMPLE TOUR')
    return f'<div class="tour-wrapper">{tour}<div class="tour-footer"><span>{E(x["tourNote"])}</span><button type="button" data-tour-toggle data-play="{E(x["play"])}" data-pause="{E(x["pause"])}" aria-pressed="true">{E(x["pause"])}</button></div></div>'

def help_section(lang):
    x=X[lang]
    return f'<section id="guides" class="section shell"><div class="section-heading"><div><span class="eyebrow">{E(x["guideKicker"])}</span><h2>{E(x["guideTitle"])}</h2></div><p>{E(x["guideLead"])}</p></div>{guide_cards(lang,base(lang))}<div class="download-bar"><div><p>{E(x["downloadNote"])}</p></div><a class="button outline" href="/site-preview/downloads/hamvara-products-sample.csv" download>{E(x["sample"])}</a>{link(href(lang,"guides")+"#ai-help",x["aiTitle"],"text-link")}</div></section>'

def about_teaser(lang):
    x=X[lang]
    return f'<section id="about" class="about-section"><div class="shell about-grid"><div><span class="eyebrow">{E(x["aboutKicker"])}</span><h2>{E(x["aboutTitle"])}</h2></div><div><p>{E(x["aboutLead"])}</p><p>{E(x["aboutExperience"])}</p>{link(href(lang,"about"),x["aboutMore"],"text-link")}</div></div></section>'

def home(lang):
    d=DATA[lang]; h=d['hero']; x=X[lang]
    trust=''.join(f'<span>{icon("check")}{E(t)}</span>' for t in h['trust'])
    steps=process(x['service'],x['serviceLead'],'service')
    tracks=''.join(f'<track kind="captions" srclang="{code}" label="{label}" src="/site-preview/assets/media/sku-bridge-{code}.vtt"{(" default" if code==lang else "")}>' for code,label in [('en','English'),('fa','فارسی'),('tr','Türkçe')])
    return head(lang,'index',d['pageTitle'],h['lead'])+f'''<main id="main">
<section class="hero" id="products"><div class="shell"><div class="hero-intro"><span class="eyebrow">{E(h['eyebrow'])}</span><h1>{E(h['title'])} <span>{E(h['accent'])}</span></h1><p class="hero-lead">{E(h['lead'])}</p><div class="journey-shortcut"><a href="#how-we-work">{E(x['serviceTitle'])} ↓</a><a href="#guides">{E(x['nav'][2])} ↗</a></div></div>{need_navigator(lang)}<div class="product-showcase" id="mrp-demo"><div class="showcase-copy"><span class="eyebrow">{E(x['mrpKicker'])}</span><h2>{E(x['mrpTitle'])}</h2><p>{E(x['mrpLead'])}</p>{feature_list(d['mrp']['features'])}<div class="hero-actions">{link('/mrp/',d['mrp']['cta'])}{link(href(lang,'guides')+'#mrp',x['readGuide'],'text-link')}</div></div>{mrp_tour(lang)}</div>{process(x['mrpFlow'],x['flowTitle'])}</div></section>
<section class="sku-showcase" id="sku-demo"><div class="shell"><div class="product-showcase"><div class="showcase-copy"><span class="eyebrow">{E(x['skuKicker'])}</span><h2>{E(x['skuTitle'])}</h2><p>{E(x['skuLead'])}</p><div class="hero-actions">{link('/sku-bridge/',d['sku']['cta'])}{link(href(lang,'guides')+'#sku',x['readGuide'],'text-link')}</div><p class="fine-print">{E(d['sku']['availability'])}</p></div><figure class="promo-video"><video controls playsinline preload="none" poster="/site-preview/assets/media/sku-bridge-poster.jpg" aria-label="SKU Bridge"><source src="/site-preview/assets/media/sku-bridge-intro.mp4" type="video/mp4">{tracks}<a href="/site-preview/assets/media/sku-bridge-intro.mp4">SKU Bridge MP4</a></video><figcaption>{E(x['videoNote'])}</figcaption><details><summary>{E(x['transcript'])}</summary><p>{E(x['videoText'])}</p></details></figure></div>{process(x['skuFlow'],x['flowTitle'])}</div></section>
<section id="how-we-work" class="workflow-section"><div class="shell"><div class="section-heading"><div><span class="eyebrow">{E(x['serviceKicker'])}</span><h2>{E(x['serviceTitle'])}</h2></div></div>{steps}{link('#contact',x['serviceCta'],'button')}</div></section>
{help_section(lang)}{about_teaser(lang)}{article_teaser(lang)}
<div class="shell compact-extras"><details id="pricing" class="pricing-details"><summary>{E(x['priceSummary'])}<span aria-hidden="true">＋</span></summary>{pricing(lang).replace('id="pricing"','id="pricing-content"')}</details><div class="toolbox-link"><p>{E(x['toolsSummary'])}</p>{link(href(lang,'tools'),d['allTools'],'text-link')}</div></div>{faq(lang)}{contact(lang)}{demo_request(lang)}</main>'''+footer(lang)

def about_page(lang):
    x=X[lang]
    sections=''.join('<section><h2>'+E(section[0])+'</h2>'+''.join('<p>'+E(t)+'</p>' for t in section[1:])+'</section>' for section in x['aboutSections'])
    return head(lang,'about',x['nav'][3],x['aboutLead'])+f'<main id="main" class="legal-main shell"><div class="page-intro"><span class="eyebrow">{E(x["aboutKicker"])}</span><h1>{E(x["aboutTitle"])}</h1></div><article class="legal-copy about-copy"><p>{E(x["aboutLead"])}</p><p>{E(x["aboutExperience"])}</p>{sections}<p><a href="mailto:info@hamvara.com">info@hamvara.com</a><br><a href="tel:+905369247371"><bdi>+90 536 924 73 71</bdi></a></p>{link(href(lang)+"#how-we-work",x["serviceCta"],"button")}</article></main>'+footer(lang)

def guides_page(lang):
    x=X[lang]
    quick=''.join(f'<a href="#{key}">{E(title)}</a>' for key,title,_ in x['guides'])
    return head(lang,'guides',x['nav'][2],x['guideLead'])+f'<main id="main" class="guides-main shell"><div class="page-intro"><span class="eyebrow">{E(x["guideKicker"])}</span><h1>{E(x["guideTitle"])}</h1><p>{E(x["guideLead"])}</p><p class="fine-print">{E(x["guideVersion"])}</p></div><nav class="guide-index" aria-label="{E(x["nav"][2])}">{quick}<a href="#ai-help">{E(x["aiTitle"])}</a></nav><div class="download-bar"><p>{E(x["downloadNote"])}</p><a class="button outline" href="/site-preview/downloads/hamvara-products-sample.csv" download>{E(x["sample"])}</a>{link("mailto:info@hamvara.com?subject=Hamvara%20software%20version",x["installer"],"text-link")}<button class="button outline" type="button" data-print>{E(x["print"])}</button></div>{guide_cards(lang,base(lang),True)}{ai_help(lang)}</main>'+footer(lang)

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
        (dest/'about.html').write_text(about_page(lang),encoding='utf-8')
        (dest/'guides.html').write_text(guides_page(lang),encoding='utf-8')
        downloads=OUT/'downloads'
        downloads.mkdir(exist_ok=True)
        for key,title,_ in X[lang]['guides']:
            (downloads/f'hamvara-{key}-guide-{lang}.html').write_text(offline_guide(lang,key,title),encoding='utf-8')
        for kind in ['terms','privacy','refunds']:
            (dest/(kind+'.html')).write_text(legal_page(lang,kind),encoding='utf-8')
    print('Built 21 HTML pages and 9 offline guides in three languages.')

if __name__=='__main__':
    build()
