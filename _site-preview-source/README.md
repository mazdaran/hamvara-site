# Hamvara website review

This buildless, static review lives at `/site-preview/` (English), `/site-preview/fa/` (Persian) and `/site-preview/tr/` (Turkish).

It is a presentation of launch content for owner review. It does not enable checkout, accounts, an export API, or changes to the ERP/Worker/D1 database. Pricing and legal drafts are clearly labeled. The app links point to the current public versions, whose status is explained beside the links. Sample data is identified as illustrative.

The existing homepage contact updates are preserved: international WhatsApp `+90 536 924 73 71` and the public LinkedIn company path `/company/145269324/`.

## Rebuild

Run from the repository root:

```sh
python3 _site-preview-source/build.py
node --check site-preview/assets/site.js
```

The builder produces fifteen complete HTML pages from three language files. All pages have `noindex,nofollow`; do not promote the preview to the main landing page without finalizing the product availability, policies and business information.

Legal copy is a draft, not a compliance certification. References checked on 2026-10-07:
- https://www.paddle.com/help/start/account-verification/what-is-domain-verification
- https://www.paddle.com/legal/refund-policy
- https://www.paddle.com/help/manage/your-customers/buyers-refunds

The preview contains no analytics or data-submission backend. Pricing controls and catalog search/filter run locally in the page, and language changes use static links.

## 08 October review update

The review now restores the original four-scene MRP tour, adds an original 24-second SKU Bridge H.264 introduction, and places a directional process under each product. The customer journey is a separate four-stage section. About and Guides pages are available in English, Persian and Turkish, with nine self-contained offline HTML guides and a sample product CSV. Pricing is expandable and the full toolbox remains on its dedicated page.

`experience.py` owns the additional localized copy. `mrp-tour.html` preserves the original homepage tour markup. `site-preview/assets/experience.css` and `experience.js` implement the layout, pause/replay, reduced-motion behavior, pricing reveal and guide prompt controls.

To regenerate the original promotional media (Pillow, DejaVu Sans and ffmpeg required):

```sh
python3 _site-preview-source/render-sku-video.py
```

The video is silent, with English, Persian and Turkish WebVTT captions and an on-page transcript. Its workflow is labeled illustrative; public beta availability disclosures remain in place.

Advanced AI guidance prepares a local prompt from a selected guide and opens ChatGPT separately. It does not claim an embedded AI service or send customer data. Guides describe version-aware starting workflows; they are not a replacement for version-specific product manuals. Installer requests use the existing contact channel rather than an unverified executable download.

This update targets `/site-preview/` for owner review. The main landing page, ERP logic, Worker, D1 and payment activation are unchanged.
