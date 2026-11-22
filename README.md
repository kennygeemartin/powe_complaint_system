# PowerResolve — Cloudflare-ready electricity complaints demo

**Status:** Cloudflare-ready deployment source, not an already provisioned live service. GitHub source is public; do **not** commit personal information, credentials or historical SQLite databases.

The existing local research prototype used Python/FastAPI/SQLite. **This is a new Cloudflare-compatible implementation** using Cloudflare Workers (JavaScript), D1 (SQLite-compatible persistent database), and the original responsive web interface. No object storage or image-upload service is required. The consumer, technician and administrator API endpoints remain compatible with the existing front-end. It does not build a native Flutter app or provide physical electricity repairs.

## Open PowerResolve on mobile or install it as an app

**Public Cloudflare Worker address:** [https://powe-complaint-system.kennygeemartin.workers.dev](https://powe-complaint-system.kennygeemartin.workers.dev)

The user's Cloudflare build log of 22 November 2026 reported that this Worker deployed successfully. The exact URL is supplied by that log; a separate live browser validation of the post-update PWA assets is still required after the latest GitHub commits deploy.

**Android (Chrome):** Visit the public link, choose **Install PowerResolve app** if the prompt is offered, or open Chrome's three-dot menu and select **Install app** or **Add to Home screen**. Launch PowerResolve from the new home-screen icon.

**iPhone (Safari):** Open the same link in Safari, tap **Share**, then **Add to Home Screen**.

The progressive web application provides a manifest, 192×192 and 512×512 icons, standalone display mode, and an offline information page. It does **not** store private user records, authorization responses, complaint lists, or API data in the service-worker cache. Reporting, tracking, and account login require an internet connection. The app does **not** dispatch electricity utility technicians.

The icon generation script runs automatically as `npm run build:pwa` before `npm run deploy` and before `npm test`, so generated icons are included in the static assets uploaded to Cloudflare. Android APK distribution remains a separate optional workflow.

## Implemented functionality

Consumer account registration/login, 7-day server sessions and logout; role-scoped complaint lists; GPS coordinate and category validation; deduplicated complaint submissions; server-calculated Emergency/High/Routine priority; admin review, staff assignment, agent progress/resolution notes, admin closure, consumer reopening and feedback; immutable state-event history via database triggers; admin statistics. Complaints are text and location based; photo uploads are not supported. No default admin or technician credentials are committed.

## Cloudflare Workers Builds: D1-only deployment

PowerResolve uses **Cloudflare Workers and D1 only**. The consumer interface, the backend API, the Android application and the deployment script no longer support photo uploads. **Cloudflare R2 does not need to be activated, configured or paid for.**

Earlier build errors involving redirects and the D1 database ID have been corrected. The D1 database ID is configured in `wrangler.jsonc`, and the Worker name is `powe-complaint-system`.

To deploy from the Cloudflare connected GitHub build:

1. Under the Worker's build configuration, use **`npm run deploy`** as the deploy command. The repository's deployment script performs the remote D1 migration and then runs Wrangler deployment.
2. Ensure the authorized build token has Workers and D1 permissions. Do not share the token in chat or store it in this public repository.
3. Start a new build and inspect its deployment log. Verify the public `/api/health` URL; it checks that the D1 schema is ready.

The deployment script no longer calls R2 APIs. It rejects any obsolete `r2_buckets` configuration instead of re-enabling uploads.

After the live Worker URL is verified, add its HTTPS origin to GitHub Actions repository variable `POWERRESOLVE_SERVICE_URL`. Build a new Android APK using the repository's workflow. The configured APK opens the hosted application without requiring users to enter a server URL.

Official references: [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/).

## Test without a Cloudflare account

Requires Node.js 22+ (for `node:sqlite` local test simulation):

```bash
npm test
```

The automated tests run the genuine Worker API handler against a SQLite-backed emulation of D1; they do not prove remote Cloudflare deployment or push notification delivery. Local development with Wrangler additionally needs `npm install`:

```bash
npm install
# Use the configured D1 database ID from wrangler.jsonc.
npm run db:local
npm run dev
```

## Alternative: deploy from an authorized workstation

If Cloudflare Workers Builds cannot be granted the necessary D1 permissions, a trusted operator can sign in locally using `npx wrangler login` and run `npm run deploy` from this repository. The same script then creates/verifies resources, migrates the database and deploys. Avoid changing both deployment mechanisms simultaneously.

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

This repository contains two workflows: `ci.yml` validates source on every push; `deploy.yml` publishes only after you explicitly opt in. Under GitHub repository **Settings → Secrets and variables → Actions**, add the secrets `CLOUDFLARE_API_TOKEN` (a narrowly scoped Cloudflare Workers/D1 deployment token) and `CLOUDFLARE_ACCOUNT_ID`; add the **repository variable** `CF_DEPLOY_ENABLED`=`true` only after D1 configuration and token permissions are complete. Then run **Actions → Deploy PowerResolve to Cloudflare → Run workflow**. Do not enable automatic deployment of unreviewed contributions.

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

## Limitations and security follow-up

Do not claim these scripted workflows show faster electricity repair or real consumer adoption. The website is a research demonstration, not an emergency reporting channel. Before public operational use, introduce WAF/rate-limiting and account recovery, account verification, explicit terms/privacy policy, log redaction, monitoring/alerting, secure backups/retention, recovery/disaster procedures, accessible interactions and end-to-end Cloudflare tests. Browser sessions are stored in localStorage; for production consider secure HttpOnly cookie sessions, a CSRF strategy and a content security policy that does not rely on inline scripts. Geo-coordinates are sensitive. Avoid putting real records into demonstration accounts.

**Prior localhost research results:** The 160-case synthetic dataset and prior Python test logs are deliberately **not** published to GitHub. They establish only local-prototype behavior; Cloudflare port results must be measured separately.
