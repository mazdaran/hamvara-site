# Product manuals

Edit en.json, fa.json and tr.json here, then run from repository root:

```sh
python _site-preview-source/build-manuals.py
python _site-preview-source/build.py
node tests/sku-bridge-guide.cjs
python tests/homepage/check_source.py
```

Commit both sources and generated guides. Guides target the existing SaaS interface and SKU Bridge beta; check actual labels and behavior before documenting new features. The MRP exercise assumes an isolated training workspace. No live customer data is required for documentation checks. Offline downloads are self-contained HTML; print/save PDF uses the browser.
