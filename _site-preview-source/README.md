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
