# PowerResolve — Cloudflare-ready electricity complaints demo

**Status:** Cloudflare-ready deployment source, not an already provisioned live service. GitHub source is public; do **not** commit user records, credentials, R2 data or historical SQLite databases.

The existing local research prototype used Python/FastAPI/SQLite. **This is a new Cloudflare-compatible implementation** using Cloudflare Workers (JavaScript), D1 (SQLite-compatible persistent database), R2 (private evidence images), and the original responsive web interface. The consumer, technician and administrator API endpoints remain compatible with the existing front-end. It does not build a native Flutter app or provide physical electricity repairs.

## Implemented functionality

Consumer account registration/login, 7-day server sessions and logout; role-scoped complaint lists; GPS coordinate and category validation; deduplicated complaint submissions; server-calculated Emergency/High/Routine priority; admin review, staff assignment, agent progress/resolution notes, admin closure, consumer reopening and feedback; immutable state-event history via database triggers; private evidence uploads to R2 (PNG/JPEG/WEBP, max 2 MB); admin statistics. No default admin or technician credentials are committed.

## Resolve the Cloudflare Build error `database_id` [10021]

The earlier `public/_redirects` infinite-loop issue has been removed. A later failed build reported `binding DB of type d1 must have a valid database_id`. This is because the original `wrangler.jsonc` contains the literal `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

**Cloudflare connected build (recommended):** Open your Worker `powe-complaint-system` → **Settings → Build**, and change **Deploy command** from `npx wrangler deploy` to **`npm run deploy`**. The new `scripts/deploy.mjs` runs a preflight, resolves the database ID, applies migrations on the remote D1 database, then deploys the Worker. The original Cloudflare command bypasses this script and will keep failing.

1. Under Cloudflare **Storage & databases → D1**, ensure a database named `powerresolve-db` exists. Copy its **Database ID** (a UUID), **not** the Cloudflare account ID.
2. In **Worker → Settings → Build → Build variables and secrets**, set **`POWERRESOLVE_D1_DATABASE_ID`** to that database UUID. This is an identifier, not a password. Alternatively, the deploy script attempts to find the database by name using `wrangler d1 list --json` if the build token permits D1 Read.
3. The Cloudflare **Build API token** must be authorized for D1 operations: at minimum Workers Scripts Edit, **D1 Edit**, and the relevant R2 resource access. The default Workers Builds token may not include D1 permissions. Select or update an appropriately scoped token under **Settings → Build → API token**; **never commit or send the token**.
4. Confirm the private R2 bucket `powerresolve-evidence` exists. Retry the production build, then verify the public `/api/health` route. The route now checks the real `users` table and returns 503 when migrations are missing.
5. Set the runtime `BOOTSTRAP_KEY` secret only through Cloudflare **Settings → Variables & Secrets**; use the documented one-time admin provisioning flow, and remove the bootstrap key afterwards. The admin screen can then create technician accounts without manual SQL updates.
6. When the public Worker URL works, set `POWERRESOLVE_SERVICE_URL` as a **GitHub Actions repository variable** to that HTTPS origin and build a fresh Android APK. Older APKs cannot auto-connect retroactively.

**Do not put the Cloudflare account ID in `database_id`**; they are different identifiers. You can also replace the placeholder in `wrangler.jsonc` with the real UUID and use the original deploy command, but that does not automatically run migrations.

Cloudflare references: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) and [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/).

## Test without a Cloudflare account

Requires Node.js 22+ (for `node:sqlite` local test simulation):

```bash
npm test
```

The automated tests run the genuine Worker API handler against a SQLite-backed emulation of D1; they do not prove remote Cloudflare deployment or push notification delivery. Local development with Wrangler additionally needs `npm install`:

```bash
npm install
# First edit wrangler.jsonc to replace its D1 placeholder ID (see below).
npm run db:local
npm run dev
```

## Provision resources on your Cloudflare account

Cloudflare login is required to complete these steps. **Never share API tokens or login passwords in issues, commits, or chat.**

1. Install packages and authenticate: `npm install` and `npx wrangler login`.
2. Create D1: `npx wrangler d1 create powerresolve-db`.
3. Copy its `database_id` into `wrangler.jsonc`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
4. Create a private evidence bucket: `npx wrangler r2 bucket create powerresolve-evidence` (R2 availability/account requirements may vary).
5. Apply migration: `npm run db:remote`.
6. Set a unique bootstrap secret: `npx wrangler secret put BOOTSTRAP_KEY` (paste it securely at the prompt). Provision this **before any first-admin request**; if Wrangler requires an initial Worker deployment before it accepts the secret, deploy then add the secret.
7. Publish: `npm run deploy`.
8. Verify `https://<YOUR_WORKER>.workers.dev/api/health` and load `https://<YOUR_WORKER>.workers.dev/`.
9. Create the first admin with a one-time `POST /api/setup/admin` containing `{"alias":"YourAdminAlias","password":"long-unique-password"}`, header `X-Bootstrap-Key` containing the secret. Once an admin exists, this endpoint refuses subsequent admin creation. **Remove or rotate BOOTSTRAP_KEY** after initialization.
10. After the administrator is signed in, review a received case and use **Create technician** in its assignment panel to create an agent account; the server checks the administrator role.

**Important:** This research application is not integrated with a utility; the initial launch is for demonstration only. Obtain explicit authorization, data-protection review, and conduct additional live security and integration tests before real consumer use.

### Adding technician accounts

Only consumer registration is public. The administrator can now create technician accounts using `POST /api/agents` or the admin assignment panel, with server-verified administrator authorization. If you must repair an older installation, a trusted and authenticated Cloudflare D1 console command remains an option:

```bash
npx wrangler d1 execute powerresolve-db --remote --command "UPDATE users SET role='agent' WHERE alias='TheTechnicianAlias' AND role='consumer'"
```

Use the Cloudflare dashboard for audit/authorization of such changes. Never permit users to choose `admin`/`agent` roles during open registration. Do not give an admin account to a technician.

## GitHub Actions deployment

This repository contains two workflows: `ci.yml` validates source on every push; `deploy.yml` publishes only after you explicitly opt in. Under GitHub repository **Settings → Secrets and variables → Actions**, add the secrets `CLOUDFLARE_API_TOKEN` (a narrowly scoped Cloudflare Workers/D1/R2 deployment token) and `CLOUDFLARE_ACCOUNT_ID`; add the **repository variable** `CF_DEPLOY_ENABLED`=`true` only after D1/R2 provisioning, migration, and `wrangler.jsonc` configuration are complete. Then run **Actions → Deploy PowerResolve to Cloudflare → Run workflow**. Do not enable automatic deployment of unreviewed contributions.

Cloudflare documentation: [Workers settings](https://developers.cloudflare.com/workers/wrangler/configuration/), [D1 setup](https://developers.cloudflare.com/d1/get-started/), and [GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

## Route contract

| Endpoint | Method | Permission |
|---|---|---|
| `/api/register`, `/api/login` | POST | public consumer registration and login |
| `/api/setup/admin` | POST | only with configured bootstrap secret, before first administrator |
| `/api/logout` | POST | logged-in account |
| `/api/health` | GET | public diagnostic |
| `/api/me`, `/api/stats`, `/api/complaints` | GET | authenticated, role-filtered |
| `/api/agents` | GET, POST | administrator list/create technician |
| `/api/complaints` | POST | consumer |
| `/api/complaints/:id` | GET | owner, assigned technician or admin |
| `/api/complaints/:id/action` | POST | authorized role and legal status transition |
| `/api/complaints/:id/feedback` | POST | owner of resolved case |
| `/api/complaints/:id/evidence` | POST | consumer/owner with private R2 bucket |

## Limitations and security follow-up

Do not claim these scripted workflows show faster electricity repair or real consumer adoption. The website is a research demonstration, not an emergency reporting channel. Before public operational use, introduce WAF/rate-limiting and account recovery, account verification, explicit terms/privacy policy, log redaction, monitoring/alerting, secure backups/retention, advanced file-content scanning, recovery/disaster procedures, accessible interactions and end-to-end Cloudflare tests. Browser sessions are stored in localStorage; for production consider secure HttpOnly cookie sessions, a CSRF strategy and a content security policy that does not rely on inline scripts. Geo-coordinates are sensitive. Avoid putting real records into demonstration accounts.

**Prior localhost research results:** The 160-case synthetic dataset and prior Python test logs are deliberately **not** published to GitHub. They establish only local-prototype behavior; Cloudflare port results must be measured separately.
