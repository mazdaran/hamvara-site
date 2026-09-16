#!/usr/bin/env python3
"""No third-party Python dependencies; requires Node for JavaScript syntax checks."""
from __future__ import annotations
import argparse
import json
import re
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

class Entry(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.scripts: list[dict] = []
        self.assets: list[str] = []
        self.links: list[str] = []
        self.active: dict | None = None
        self.end_html = False
        self.end_body = False
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script':
            self.active = {'src': attrs.get('src'), 'type': attrs.get('type', ''), 'code': ''}
            self.scripts.append(self.active)
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs['href'])
        if tag == 'link' and attrs.get('rel') == 'stylesheet' and attrs.get('href'):
            self.assets.append(attrs['href'])
    def handle_data(self, data):
        if self.active is not None:
            self.active['code'] += data
    def handle_endtag(self, tag):
        if tag == 'script': self.active = None
        if tag == 'body': self.end_body = True
        if tag == 'html': self.end_html = True

def text(path: Path) -> str:
    value = path.read_bytes().decode('utf-8', errors='strict')
    if '\ufffd' in value or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', value):
        raise ValueError(f'Corrupt/control characters in {path}')
    return value

def local(root: Path, source: Path, url: str) -> Path | None:
    url = urlsplit(url)
    if url.scheme or url.netloc or not url.path:
        return None
    p = (root / unquote(url.path).lstrip('/') if url.path.startswith('/') else source.parent / unquote(url.path)).resolve()
    p.relative_to(root.resolve())  # reject paths outside the checkout
    return p

def check(root: Path) -> dict:
    home = root / 'index.html'
    parser = Entry(); parser.feed(text(home)); parser.close()
    entries = {home}
    for href in parser.links:
        p = local(root, home, href)
        if p is None: continue
        if p.is_dir(): p /= 'index.html'
        if p.suffix == '.html':
            if not p.is_file(): raise ValueError(f'Missing linked page: {p}')
            entries.add(p)
    checked_js: set[Path] = set()
    inline_count = 0
    with tempfile.TemporaryDirectory() as temp:
        for entry in sorted(entries):
            doc = Entry(); doc.feed(text(entry)); doc.close()
            if not doc.end_html or not doc.end_body or doc.active is not None:
                raise ValueError(f'Truncated/unclosed HTML or script: {entry}')
            for href in doc.assets:
                asset = local(root, entry, href)
                if asset is not None and not asset.is_file():
                    raise ValueError(f'Missing stylesheet: {asset}')
            for i, script in enumerate(doc.scripts):
                if script['type'] not in ('', 'module', 'text/javascript', 'application/javascript'):
                    continue
                if script['src']:
                    asset = local(root, entry, script['src'])
                    if asset is None or asset in checked_js: continue
                    code = text(asset); checked_js.add(asset)
                    suffix = '.mjs' if script['type'] == 'module' else '.js'
                else:
                    code = script['code']; inline_count += 1
                    suffix = '.mjs' if script['type'] == 'module' else '.js'
                candidate = Path(temp) / ('syntax-check' + suffix)
                candidate.write_text(code, encoding='utf-8')
                result = subprocess.run(['node', '--check', str(candidate)], text=True, capture_output=True, timeout=15)
                if result.returncode:
                    raise ValueError(f'{entry}, script {i}: {result.stderr.strip()}')
    return {'status': 'pass', 'entry_pages': len(entries), 'external_local_scripts': len(checked_js),
            'inline_scripts': inline_count, 'pages': [str(p.relative_to(root)) for p in sorted(entries)]}

if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    args.add_argument('--output', type=Path)
    opts = args.parse_args()
    try:
        result = check(opts.root.resolve())
        code = 0
    except Exception as error:
        result = {'status': 'fail', 'error': str(error)}; code = 1
    rendered = json.dumps(result, indent=2, ensure_ascii=False)
    print(rendered)
    if opts.output:
        opts.output.parent.mkdir(parents=True, exist_ok=True)
        opts.output.write_text(rendered + '\n', encoding='utf-8')
    sys.exit(code)
