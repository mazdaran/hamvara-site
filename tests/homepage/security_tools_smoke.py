#!/usr/bin/env python3
"""Run isolated browser regression checks for public tools against this checkout.

No production URLs are loaded; non-local network requests are blocked.
"""
from __future__ import annotations
import json
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ATTACK = '"><img src=x onerror=alert(1)>'

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass

def local_requests_only(route):
    host = urlsplit(route.request.url).hostname
    if host in {"127.0.0.1", "localhost", "::1"}:
        route.continue_()
    else:
        route.abort()

def ensure(test, msg):
    if not test:
        raise AssertionError(msg)

def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0),
        partial(QuietHandler, directory=str(ROOT)))
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{port}"
    results = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(accept_downloads=True)
            ctx.route("**/*", local_requests_only)
            for name in ("shipdocs", "growth", "decision-center"):
                page = ctx.new_page()
                errors = []
                page.on("pageerror", lambda err, bag=errors: bag.append(str(err)))
                try:
                    if name == "shipdocs":
                        response = page.goto(base + "/shipdocs/", wait_until="load")
                        ensure(response is not None and response.ok, "ShipDocs did not load")
                        ensure(page.locator("#itemRows tr").count() == 3, "Demo rows missing")
                        sku = page.locator('#itemRows tr').first.locator('input[data-key="sku"]')
                        sku.fill(ATTACK)
                        sku.press("Tab")  # Triggers change and persistence.
                        ensure(sku.input_value() == ATTACK, "SKU field changed unexpectedly")
                        page.reload(wait_until="load")
                        sku = page.locator('#itemRows tr').first.locator('input[data-key="sku"]')
                        ensure(sku.input_value() == ATTACK, "Persisted SKU value not restored")
                        ensure(page.locator("#itemRows img").count() == 0, "ShipDocs interpreted saved SKU as HTML")
                        page.locator("#addRow").click()
                        ensure(page.locator("#itemRows tr").count() == 4, "Add row failed")
                        page.locator("#itemRows .remove").last.click()
                        ensure(page.locator("#itemRows tr").count() == 3, "Remove row failed")
                        ensure(page.locator("#docTotals tr").count() == 1, "Document totals missing")
                        ensure(page.locator("#docTotals td").count() == 6, "Document totals columns changed")
                        ensure(page.locator("#docTotals img").count() == 0, "Totals interpreted text as HTML")
                        page.locator("#generatedBy").fill("QA checker")
                        page.locator("#generatedBy").press("Tab")
                        page.locator("#company").fill("QA Company")
                        page.locator("#company").press("Tab")
                        page.locator("#factsConfirmed").check()
                        ensure(page.locator("#approve").is_enabled(), "Approved draft cannot be reviewed")
                        page.locator("#approve").click()
                        ensure("REVIEWED" in page.locator("#documentStatus").inner_text(), "Approval workflow changed")
                        with page.expect_download() as download_event:
                            page.locator("#csv").click()
                        ensure(download_event.value.suggested_filename.endswith(".csv"), "CSV download did not work")
                    elif name == "growth":
                        entry = [{
                            "url": "https://hamvara.com/",
                            "strategy": ATTACK,
                            "fetchedAt": "2026-10-14T12:00:00Z",
                            "scores": {"performance": ATTACK, "accessibility": 85,
                                       "best-practices": 88, "seo": 90}
                        }]
                        page.add_init_script(
                            "localStorage.setItem('hamvara.growth.auditHistory.v1',"
                            + json.dumps(json.dumps(entry, ensure_ascii=False)) + ");"
                        )
                        response = page.goto(base + "/growth/", wait_until="load")
                        ensure(response is not None and response.ok, "Growth did not load")
                        page.locator('[data-view="history"]').click()
                        ensure(page.locator("#historyList .history-item").count() == 1,
                               "Growth history entry missing")
                        ensure(page.locator("#historyList img").count() == 0,
                               "Growth interpreted stored text as HTML")
                        ensure(ATTACK in page.locator("#historyList").inner_text(),
                               "Growth altered saved text")
                        page.locator("#clearHistory").click()
                        ensure(page.locator("#historyList .history-item").count() == 0,
                               "Growth clear history failed")
                    else:
                        response = page.goto(base + "/decision-center/", wait_until="load")
                        ensure(response is not None and response.ok, "Decision Center did not load")
                        page.locator("#quoteBtn").click()
                        ensure(page.locator(".proposal-overlay").count() == 1, "Proposal popup did not open")
                        ensure(page.locator(".proposal-actions a.primary").get_attribute("href").startswith("mailto:"),
                               "Proposal email action missing")
                        page.locator(".proposal-close").click()
                        ensure(page.locator(".proposal-overlay").count() == 0, "Proposal close did not work")
                        page.evaluate("""payload => {
                          document.getElementById('planName').textContent = payload;
                          document.getElementById('priceValue').textContent = payload;
                        }""", ATTACK)
                        page.locator("#quoteBtn").click()
                        ensure(page.locator(".proposal-dialog img").count() == 0,
                               "Decision Center interpreted input as HTML")
                        ensure(ATTACK in page.locator("#proposal-title").inner_text(),
                               "Proposal title lost text")
                        ensure(ATTACK in page.locator('[data-proposal-field="price"]').inner_text(),
                               "Proposal price lost text")
                    ensure(not errors, f"{name} JavaScript runtime errors: {errors}")
                    results.append({"name": name, "result": "pass", "page_errors": 0})
                    print("PASS", name, flush=True)
                except Exception as exc:
                    results.append({"name": name, "result": "fail", "error": str(exc)})
                    print("FAIL", name, str(exc), flush=True)
                finally:
                    page.close()
            ctx.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    output = ROOT / "artifacts/homepage/security-tools-results.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    failed = [x for x in results if x["result"] == "fail"]
    print("Summary:", len(results) - len(failed), "passed,", len(failed), "failed")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main())
