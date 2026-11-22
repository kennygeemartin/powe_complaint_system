# PowerResolve — Cloudflare-ready electricity complaints demo

**Status:** Cloudflare-ready deployment source, not an already provisioned live service. GitHub source is public; do **not** commit user records, credentials, R2 data or historical SQLite databases.

The existing local research prototype used Python/FastAPI/SQLite. **This is a new Cloudflare-compatible implementation** using Cloudflare Workers (JavaScript), D1 (SQLite-compatible persistent database), R2 (private evidence images), and the original responsive web interface. The consumer, technician and administrator API endpoints remain compatible with the existing front-end. It does not build a native Flutter app or provide physical electricity repairs.

## Implemented functionality

Consumer account registration/login, 7-day server sessions and logout; role-scoped complaint lists; GPS coordinate and category validation; deduplicated complaint submissions; server-calculated Emergency/High/Routine priority; admin review, staff assignment, agent progress/resolution notes, admin closure, consumer reopening and feedback; immutable state-event history via database triggers; private evidence uploads to R2 (PNG/JPEG/WEBP, max 2 MB); admin statistics. No default admin or technician credentials are committed.

## Cloudflare Workers Builds: first-time automatic provisioning

The original Cloudflare build error `Invalid _redirects configuration` was fixed by removing `public/_redirects`. The subsequent `binding DB ... valid database_id [10021]` resulted from an unresolved D1 database binding.

**Only two Cloudflare-side prerequisites are necessary before automated provisioning can run:**

1. Open the existing Worker **`powe-complaint-system` → Settings → Build**, and change **Deploy command** from `npx wrangler deploy` to **`npm run deploy`**. This Cloudflare dashboard setting is not read from `wrangler.jsonc`; changing code on GitHub cannot update it. 
2. Give the Cloudflare **Build API token** sufficient permissions to list/create D1 databases, query/apply D1 migrations, list/create R2 buckets, and deploy Workers. The default token does **not** automatically include D1 permissions. Configure authorization in Cloudflare itself; do not share a token in chat or commit it to GitHub. R2 service activation may also be needed.

The command `npm run deploy` invokes `scripts/deploy.mjs` which: (i) discovers or creates the **`powerresolve-db`** D1 database, (ii) writes its UUID to the *temporary checkout's* Wrangler configuration, (iii) verifies or creates the private **`powerresolve-evidence`** R2 bucket, (iv) applies D1 migrations to the production database, and (v) deploys the Worker.

The committed `wrangler.jsonc` may retain `REPLACE_WITH_YOUR_D1_DATABASE_ID`; the deployment script resolves it **at build time**. You do **not** need to manually paste a UUID if the build token can list D1 resources.

After the build succeeds, find the public `workers.dev` URL in Cloudflare's Worker details; check `<PUBLIC_URL>/api/health`. Bootstrap your first administrator securely using the procedure below. Finally set the GitHub Actions repository variable `POWERRESOLVE_SERVICE_URL` to that verified HTTPS origin and build a **new** Android APK. The APK will open the configured service directly, without a server address prompt. Existing installed APKs cannot auto-connect retroactively.

If the deployment fails, the script will stop with the first unauthorized or unavailable Cloudflare resource and print a diagnostic. It cannot overcome Cloudflare account restrictions, disabled R2, missing token scopes, or an unchanged Cloudflare deploy command.

Official references: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/) and [R2 Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/r2/).

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

## Alternative: deploy from an authorized workstation

If Cloudflare Workers Builds cannot be granted D1 and R2 permissions, a trusted operator can sign in locally using `npx wrangler login` and run `npm run deploy` from this repository. The same script then creates/verifies resources, migrates the database and deploys. Avoid changing both deployment mechanisms simultaneously.

**First administrator setup is intentionally manual and requires a unique runtime secret:** run `npx wrangler secret put BOOTSTRAP_KEY` from an authorized workstation after the initial Worker exists. Generate and retain the secret privately, then call `POST /api/setup/admin` once with `{"alias":"YourAdminAlias","password":"your-unique-strong-password"}` and the `X-Bootstrap-Key` header. Do not transmit the secret in chat or put it in the public GitHub repository. Remove the bootstrap secret after the administrator has been created.

After administrator login, the admin interface can create technician accounts inside a case assignment panel. The server verifies the administrator role.

**Deployment is not operational authorization.** PowerResolve remains a research demonstration; it is not connected to an electricity utility or an emergency dispatch channel. Do not enter real consumer details or rely on it for safety incidents until security, privacy, and operational validation are complete.

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
