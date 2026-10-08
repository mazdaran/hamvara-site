# Hamvara articles and discovery

The public archive is `/articles/`, `/articles/fa/`, `/articles/tr/`. Existing preview homes also link here; pricing/legal drafts remain in the preview.

Edit `posts.json` to add a post. Each entry has a stable slug, ISO publication date, category (`production` or `data`), relevant guide slug, estimated reading minutes, and English/Persian/Turkish titles, summaries and section pairs. The initial articles are original Hamvara educational writing, not customer case studies or imported LinkedIn posts.

Use `source: null` for original site writing. For an authorized republished post, use `source: {"name":"LinkedIn", "url":"https://www.linkedin.com/..."}` with the real original URL. The article page links to it. Publish only reviewed content; do not invent a source, client quote, performance metric or earlier publication date. New posts are added manually; there is no automatic LinkedIn sync or CMS login.

Rebuild from the repository root:

```sh
python _site-preview-source/growth.py
python _site-preview-source/build.py
python _site-preview-source/build-manuals.py
python tests/homepage/check_source.py
node --check articles/assets/growth.js
```

The generator updates article pages, the marked homepage components, shared JavaScript and article sitemap entries. Commit source and generated output. Keep other homepage content outside the marked blocks. `content.json` holds shared interface translations. `growth.js` is the source template; `articles/assets/growth.js` is generated.

Need selection is browser-local. The SKU sample link uses `?demo=1`, which loads the application's existing sample without uploading a file or invoking AI. The request form only builds mailto/WhatsApp links after validation; it stores nothing, submits nothing itself, and makes no booking. It is hidden without JavaScript; contact links remain available.

No advertising campaign, remarketing tracker, checkout, new discount, live-chat service or calendar integration is activated by this change. The existing homepage CI covers languages, viewport containment, need selection and message preparation; source checks validate linked pages and scripts.
