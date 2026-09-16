#!/usr/bin/env python3
"""Browser display regression checks. Default: offline-rendered checkout, no APIs.
Optional --base-url tests an already-running LOCAL static server instead.
External fonts/analytics are excluded for deterministic rendering.
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

VIEWPORTS = [(1920,1080),(1440,900),(1366,768),(1024,768),(768,1024),(390,844),(320,568),(844,390)]
LANGUAGES = ['en','fa','tr']

def fixture(root: Path, script_enabled: bool = True) -> str:
    source = (root/'index.html').read_text(encoding='utf-8')
    def script(match):
        src = match.group(1)
        url = urlsplit(src)
        if url.scheme or url.netloc or not script_enabled:
            return ''
        content = (root / url.path.lstrip('/')).read_text(encoding='utf-8')
        if '</script' in content.lower():
            raise ValueError('Cannot safely inline script in offline fixture')
        return '<script>' + content + '</script>'
    source = re.sub(r'<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*</script>',script,source)
    return re.sub(r'<link\b[^>]*\bhref="https://[^>]*>','',source)

def main(opts) -> dict:
    records = []
    failures = []
    out = opts.output; out.mkdir(parents=True, exist_ok=True)
    root = opts.root.resolve()
    if opts.base_url and urlsplit(opts.base_url).hostname not in ('localhost','127.0.0.1','[::1]','::1'):
        raise ValueError('--base-url must be a local static server; this suite must not alter production')
    def need(condition, message):
        if not condition: raise AssertionError(message)
    with sync_playwright() as pw:
        launch = {'headless': True}
        if opts.browser_path: launch['executable_path'] = opts.browser_path
        browser = pw.chromium.launch(**launch)
        def load(page, script_enabled=True):
            if opts.base_url:
                response = page.goto(opts.base_url.rstrip('/')+'/',wait_until='load')
                need(response is not None and response.ok,'Homepage HTTP response failed')
                if script_enabled: page.wait_for_function('!document.getElementById("lang").disabled')
            else:
                page.set_content(fixture(root,script_enabled),wait_until='load')
        def context(width=390,height=844,motion='reduce',js=True):
            ctx = browser.new_context(viewport={'width':width,'height':height},locale='en-US',reduced_motion=motion,java_script_enabled=js)
            def route(request):
                host=urlsplit(request.request.url).hostname
                if host in ('127.0.0.1','localhost','::1'): request.continue_()
                else: request.abort()
            ctx.route('**/*',route)
            return ctx
        selected = VIEWPORTS[:4] if opts.group == 'desktop' else VIEWPORTS[4:] if opts.group == 'mobile' else VIEWPORTS
        for width,height in selected:
            for language in LANGUAGES:
                label = f'{width}x{height}-{language}'
                ctx=context(width,height);page=ctx.new_page();page.set_default_timeout(3000)
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                try:
                    load(page)
                    need(page.locator('#lang option').count()==3,'Expected three static language options')
                    page.select_option('#lang',language)
                    need(page.locator('html').get_attribute('lang')==language,'Language did not switch')
                    need(page.locator('html').get_attribute('dir')==('rtl' if language=='fa' else 'ltr'),'Wrong text direction')
                    empty=page.locator('[data-t], [data-t-html]').evaluate_all('(nodes)=>nodes.filter(n=>!n.textContent.trim()).map(n=>n.dataset.t||n.dataset.tHtml)')
                    need(not empty,f'Empty texts: {empty}')
                    need(page.locator('.prods .prod').count()==16,'Expected all 16 product cards')
                    need(page.locator('.prods a[href="/bidcompare/"]').count()==1,'Missing/duplicate BidCompare card')
                    need(page.locator('.prods a[href="/specpack/"]').count()==1,'SpecPack was lost')
                    menu_paths=page.locator('.menu-panel a').evaluate_all('(ns)=>ns.map(n=>n.getAttribute("href"))')
                    card_paths=page.locator('.prods a').evaluate_all('(ns)=>ns.map(n=>n.getAttribute("href"))')
                    need(not set(menu_paths)-set(card_paths),'A menu product is absent from the cards')
                    overflow=page.evaluate('document.documentElement.scrollWidth-window.innerWidth')
                    need(overflow<=1,f'Page horizontal overflow {overflow}px')
                    page.locator('.site-menu summary').click()
                    panel=page.locator('.menu-panel')
                    bounds=panel.bounding_box();need(bounds is not None,'Menu is hidden')
                    need(bounds['x']>=-1 and bounds['x']+bounds['width']<=width+1,'Menu clipped horizontally')
                    need(bounds['y']>=0 and bounds['y']+bounds['height']<=height,'Menu clipped vertically')
                    need(panel.evaluate('(e)=>["auto","scroll"].includes(getComputedStyle(e).overflowY)'),'Menu cannot scroll internally')
                    # Native keyboard focus must expose every menu link, including the last one.
                    for link in page.locator('.menu-panel a').all():
                        link.focus()
                        visible=link.evaluate('e=>{let a=e.getBoundingClientRect(),b=e.closest(".menu-panel").getBoundingClientRect();let hit=document.elementFromPoint((a.left+a.right)/2,(a.top+a.bottom)/2);return a.top>=b.top-1&&a.bottom<=b.bottom+1&&!!hit&&e.contains(hit)}')
                        need(visible,f'Unreachable menu link {link.get_attribute("href")}')
                    need(panel.evaluate('(e)=>e.scrollTop')>0,'Menu did not scroll to lower links')
                    if (width,height,language) in [(390,844,'en'),(390,844,'fa'),(1366,768,'en')]:
                        page.screenshot(path=str(out/f'menu-bottom-{label}.png'))
                    page.keyboard.press('Escape')
                    need(not page.locator('.site-menu').evaluate('e=>e.open'),'Escape did not close menu')
                    need(page.locator('.site-menu summary').evaluate('e=>e===document.activeElement'),'Escape did not restore focus')
                    page.locator('.site-menu summary').click()
                    page.mouse.click(width-2, 2)
                    need(not page.locator('.site-menu').evaluate('e=>e.open'),'Outside click did not close menu')
                    page.locator('.site-menu summary').click()
                    # Stop navigation only; verify the actual link-click close handler.
                    page.evaluate('document.addEventListener("click",e=>{if(e.target.closest(".menu-panel a"))e.preventDefault()},{capture:true,once:true})')
                    page.locator('.menu-panel a').last.click()
                    need(not page.locator('.site-menu').evaluate('e=>e.open'),'Product selection did not close menu')
                    for i in range(4):
                        page.locator(f'[data-scene="{i}"]').click()
                        need(page.locator('.command-slide.on').get_attribute('data-scene-panel')==str(i),'Scene click did not update the tour')
                        need(page.locator(f'[data-scene="{i}"]').get_attribute('aria-pressed')=='true','Active scene not reflected in accessibility state')
                        bottom=page.locator('.command-slide.on').evaluate('e=>{let s=e.closest(".command-stage").getBoundingClientRect();return Math.max(...Array.from(e.children).map(n=>n.getBoundingClientRect().bottom))-s.bottom}')
                        need(bottom<=1,f'Tour content clipped by {bottom}px')
                    need(not errors,f'JavaScript errors: {errors}')
                    if (width,height,language) in [(390,844,'en'),(1366,768,'en')]:
                        page.locator('[data-scene="0"]').click();page.evaluate('window.scrollTo(0,0)')
                        page.screenshot(path=str(out/f'homepage-{label}.png'))
                    print('PASS',label,flush=True)
                    records.append({'case':label,'status':'pass','text_fields':page.locator('[data-t],[data-t-html]').count(),'empty_text_fields':0,'product_cards':16,'menu_links_reachable':len(menu_paths),'scenes_checked':4,'horizontal_overflow_px':overflow,'page_errors':errors,'menu_bounds':bounds})
                except Exception as error:
                    failures.append({'case':label,'error':str(error)})
                    print('FAIL',label,str(error),flush=True)
                    page.screenshot(path=str(out/f'failure-{label}.png'))
                finally: ctx.close()
        # Demonstrate that essential page content and the native menu survive disabled JS.
        ctx=context(js=False);page=ctx.new_page()
        try:
            load(page,False)
            need(page.locator('[data-t]').evaluate_all('(ns)=>ns.every(n=>n.textContent.trim())'),'No-JS fallback is empty')
            need(page.locator('#lang').is_disabled(),'No-JS language picker falsely appears functional')
            page.locator('.site-menu summary').click();page.locator('.menu-panel a').last.focus()
            need(page.locator('.menu-panel').evaluate('e=>e.scrollTop')>0,'No-JS native menu cannot scroll')
            page.screenshot(path=str(out/'javascript-disabled-menu.png'))
            records.append({'case':'javascript-disabled','status':'pass','content_preserved':True,'menu_scrolls':True})
        except Exception as error: failures.append({'case':'javascript-disabled','error':str(error)})
        finally:ctx.close()
        # Normal auto-play and reduced-motion preference are checked separately.
        for motion in ['no-preference','reduce']:
            ctx=context(motion=motion);page=ctx.new_page()
            try:
                load(page)
                if motion=='no-preference':
                    page.wait_for_function('document.querySelector(".command-slide.on").dataset.scenePanel !== "0"',timeout=6500)
                else:
                    page.wait_for_timeout(4700)
                    need(page.locator('.command-slide.on').get_attribute('data-scene-panel')=='0','Reduced motion should not auto-play')
                records.append({'case':'tour-motion-'+motion,'status':'pass'})
            except Exception as error:failures.append({'case':'tour-motion-'+motion,'error':str(error)})
            finally:ctx.close()
        browser.close()
    return {'status':'pass' if not failures else 'fail','mode':'local-http' if opts.base_url else 'offline-rendered-exact-checkout','external_fonts_and_analytics':'excluded','real_devices_tested':False,'passed_cases':len(records),'failed_cases':len(failures),'results':records,'failures':failures}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
    parser.add_argument('--output',type=Path,default=Path('artifacts/homepage'))
    parser.add_argument('--browser-path')
    parser.add_argument('--base-url')
    parser.add_argument('--group',choices=['all','desktop','mobile'],default='all')
    opts=parser.parse_args()
    result=main(opts)
    (opts.output/'browser-results.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='results'},indent=2,ensure_ascii=False))
    sys.exit(0 if result['status']=='pass' else 1)
