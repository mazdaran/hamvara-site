# Hamvara Growth API

Cloudflare Worker for real PageSpeed/Lighthouse audits and secure OAuth connections.

## Local setup

1. Copy `wrangler.toml.example` to `wrangler.toml`.
2. Run `npm install`.
3. Create D1: `npx wrangler d1 create hamvara-growth` and place its ID in `wrangler.toml`.
4. Apply schema: `npx wrangler d1 execute hamvara-growth --file schema.sql --remote`.
5. Add secrets with `npx wrangler secret put NAME`.
6. Run `npm run dev` or `npm run deploy`.

After deployment, set `growth/config.js` `apiBase` to the Worker URL (later `https://api.hamvara.com`).

OAuth callback URLs follow this pattern:

`https://api.hamvara.com/api/oauth/{provider}/callback`

Providers: `google`, `meta`, `linkedin`, `wordpress`.

No OAuth token is sent to the browser. Tokens are encrypted with AES-GCM before being stored in D1.
