# Hai Nguyen — portfolio site

Live: https://hai-portfolio.haing-penn.workers.dev (Cloudflare Worker `hai-portfolio`).

## How it works
- `public/` — the page (`index.html`, `app.js`, `style.css`, self-hosted OFL fonts in `fonts/`). `src/worker.js` — serves it plus `/api/*`.
- **Wording lives in Cloudflare KV, not in code** (namespace `hai-portfolio-content`): `published` (live), `draft`
  (owner's working copy), `history` (last 20 published versions). Deploying code never overwrites it.
- `content.default.json` only seeds an empty store and fills in fields a newer code version adds. Changing a value
  there does NOT change the live site once content exists; edit through the site instead.
- Owner sign-in: email `ADMIN_EMAIL` (wrangler.toml) + password from the `ADMIN_PASSWORD` repo secret, or the
  password set with "Password" on the site (stored as a PBKDF2 hash in KV, takes priority). 5 failed attempts per IP
  lock sign-in for 15 minutes. Changing the password signs out other devices.

## Deploy
Push to `main` → `.github/workflows/deploy.yml` finds/creates the KV namespace, deploys, sets the password secret.
Repo secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts + Workers KV Storage: Edit), `CLOUDFLARE_ACCOUNT_ID`, `ADMIN_PASSWORD`.

## Local
`npm i && echo ADMIN_PASSWORD=local-test-pass-123 > .dev.vars && npx wrangler dev`, then `npm test`.
