"""CI-only browser checks of article and sample-demo flows; all routes are local fixtures."""
from pathlib import Path
from urllib.parse import urlsplit,unquote
import json,mimetypes
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
def route_local(route):
 u=urlsplit(route.request.url)
 if u.hostname!='hamvara.test':route.abort();return
 path=ROOT/unquote(u.path).lstrip('/')
 if path.is_dir():path/= 'index.html'
 if not path.is_file() or ROOT not in path.resolve().parents:route.fulfill(status=404,body='Missing');return
 route.fulfill(status=200,body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream')
with sync_playwright() as p:
 browser=p.chromium.launch()
 for width in [320,1280]:
  for lang in ['en','fa','tr']:
   context=browser.new_context(viewport={'width':width,'height':900},reduced_motion='reduce');context.route('**/*',route_local)
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   suffix='' if lang=='en' else lang+'/'
   page.goto('https://hamvara.test/articles/'+suffix)
   assert page.locator('[data-article]:visible').count()==2
   page.locator('[data-article-category]').select_option('data')
   assert page.locator('[data-article]:visible').count()==1
   page.locator('[data-article-search]').fill('zzzz-no-match')
   assert page.locator('[data-article-empty]').is_visible()
   page.locator('[data-article-search]').fill('')
   page.locator('[data-article]:visible .gx-read').click()
   assert 'clean-sku-before-import.html' in page.url
   assert page.locator('html').get_attribute('lang')==lang
   assert json.loads(page.locator('script[type="application/ld+json"]').text_content())['@type']=='Article'
   assert page.locator('.gx-next a').get_attribute('href')=='/guides/'+suffix+'sku-bridge.html'
   assert page.evaluate('document.documentElement.scrollWidth-innerWidth')<=1
   assert not errors,errors
   print('PASS articles',width,lang,flush=True);context.close()
 for width in [320,1280]:
  for lang in ['en','fa','tr']:
   context=browser.new_context(viewport={'width':width,'height':900},reduced_motion='reduce');context.route('**/*',route_local)
   page=context.new_page();suffix='' if lang=='en' else lang+'/'
   page.goto('https://hamvara.test/site-preview/'+suffix)
   assert page.locator('body').evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(255, 255, 255)'
   for selector in ['.hero h1','.hero h1 span','.hero-lead','.gx-heading h2','.showcase-copy h2']:
    for item in page.locator(selector).all():
     style=item.evaluate('e=>({color:getComputedStyle(e).color,font:getComputedStyle(e).fontFamily})')
     assert style['color']=='rgb(0, 0, 0)',(selector,style)
     assert 'Times New Roman' in style['font'],(selector,style)
   assert page.evaluate('document.documentElement.scrollWidth-innerWidth')<=1
   print('PASS white/black Times theme',width,lang,flush=True)
   context.close()
 context=browser.new_context(reduced_motion='reduce');context.route('**/*',route_local);page=context.new_page()
 page.goto('https://hamvara.test/sku-bridge/?demo=1')
 assert page.locator('#mappingPanel').is_visible()
 assert '6 rows' in page.locator('#filemeta').inner_text()
 page.locator('#analyze').click()
 assert page.locator('#resultsPanel').is_visible()
 page.locator('#reset').click()
 assert page.locator('#mappingPanel').is_hidden()
 print('PASS SKU sample deep link and reset',flush=True)
 context.close();browser.close()
