# Hamvara website

Static multilingual website served from GitHub Pages at `hamvara.com`.

## Hamvara Growth

- Frontend: `/growth/`
- Secure API: `/worker/`
- Live URL analysis: Google PageSpeed Insights / Lighthouse
- Planned production API hostname: `api.hamvara.com`

The Growth frontend can run immediately in direct PageSpeed mode. OAuth integrations require the Worker, D1 database, provider applications and server-side secrets described in `worker/README.md`.

## Hamvara MRP SaaS

- Frontend: `/mrp/`
- Tenant-isolated API: `/api/mrp/`
- Persistent state: Cloudflare D1 with revision control and audit log
- Workspace access: hashed per-user Access Keys
