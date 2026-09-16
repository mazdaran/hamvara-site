# Homepage display regression checks

These checks do not write to production, call business APIs, send messages, or use credentials.

```sh
# Node 22 and Python 3.12+; no pip dependency for this first check.
python tests/homepage/check_source.py

python -m pip install -r tests/homepage/requirements.txt
python -m playwright install chromium
python tests/homepage/smoke.py --output artifacts/homepage
```

Use `--browser-path /usr/bin/chromium` with an existing local Chromium installation.
`--group desktop` and `--group mobile` split the viewport matrix; each group also runs the no-JavaScript and motion-preference checks.

The default browser mode renders the exact HTML/CSS and replaces local external script tags with their checked-out JavaScript bytes. External fonts and analytics are excluded. This permits offline, deterministic regression testing but does not validate production DNS, HTTP delivery, cache behavior, CSP, or real hardware. The static check independently verifies local script and stylesheet references.

To test actual static-server delivery, start a **local** static server and supply `--base-url http://127.0.0.1:8765`. Non-local base URLs are rejected to keep automated interactions away from production. HTTPS, backend APIs, authentication, email/WhatsApp delivery and ERP workflows remain outside this suite.

Coverage: eight viewport sizes in English, Persian/RTL and Turkish; nonempty translated content; all sixteen product cards; all fifteen menu links; viewport-bounded menu with internal scrolling; keyboard reachability; closing on Escape, outside click and link selection; all four tour scenes without clipped content; JavaScript-disabled fallback; autoplay and reduced-motion behavior.

`Homepage Display Check` is a read-only GitHub Actions workflow. Adding it does **not** by itself block GitHub Pages deployments; requiring its success would need a separately approved deployment/branch-rule change. The workflow has not been run remotely until the files are pushed and a run completes.
