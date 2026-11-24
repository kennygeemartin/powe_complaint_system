# PowerResolve — Cloudflare-ready electricity complaints demo

**Status:** Cloudflare-ready deployment source, not an already provisioned live service. GitHub source is public; do **not** commit personal information, credentials or historical SQLite databases.

The existing local research prototype used Python/FastAPI/SQLite. **This is a new Cloudflare-compatible implementation** using Cloudflare Workers (JavaScript), D1 (SQLite-compatible persistent database), and the original responsive web interface. No object storage or image-upload service is required. The consumer, technician and administrator API endpoints remain compatible with the existing front-end. It does not build a native Flutter app or provide physical electricity repairs.

## Open PowerResolve on mobile or install it as an app

**Public Cloudflare Worker address:** [https://powe-complaint-system.powerresolve.workers.dev](https://powe-complaint-system.powerresolve.workers.dev)

The user's Cloudflare build log of 22 November 2026 reported that this Worker deployed successfully. The exact URL is supplied by that log; a separate live browser validation of the post-update PWA assets is still required after the latest GitHub commits deploy.

**Android (Chrome):** Visit the public link, choose **Install PowerResolve app** if the prompt is offered, or open Chrome's three-dot menu and select **Install app** or **Add to Home screen**. Launch PowerResolve from the new home-screen icon.

**iPhone (Safari):** Open the same link in Safari, tap **Share**, then **Add to Home Screen**.

The progressive web application provides a manifest, 192×192 and 512×512 icons, standalone display mode, and an offline information page. It does **not** store private user records, authorization responses, complaint lists, or API data in the service-worker cache. Reporting, tracking, and account login require an internet connection. The app does **not** dispatch electricity utility technicians.

The icon generation script runs automatically as `npm run build:pwa` before `npm run deploy` and before `npm test`, so generated icons are included in the static assets uploaded to Cloudflare. Android APK distribution remains a separate optional workflow.

## Registration issue repaired for Cloudflare Workers

A screenshot from the public site showed **Internal server error** after consumer registration. The previous Worker attempted to derive a password hash with 160,000 PBKDF2 iterations, but Cloudflare's production workerd runtime rejects any single PBKDF2 operation above 100,000 iterations. The new code uses exactly **100,000** for both password creation and verification. Regression tests simulate that production limit to catch accidental reintroduction; the same test fails with the former 160,000 setting and passes with 100,000. Cloudflare's runtime restriction is documented in [workerd issue #1346](https://github.com/cloudflare/workerd/issues/1346).

The latest administrator-dispatch version reports `"release":"admin-specialist-dispatch-v2"` at [`/api/health`](https://powe-complaint-system.powerresolve.workers.dev/api/health). Confirm this release marker and `"status":"ok"` before retrying registration with a **new demonstration alias**. A successful build is necessary but does not by itself verify a real user can register; if HTTP 500 persists, inspect Cloudflare Worker Observability logs for the actual exception and validate the D1 users table. Do not post passwords, session tokens, or API keys in reports.

## Mobile-first interface redesign (November 2026)

PowerResolve now uses an external shared design system in `public/styles.css` instead of the previous compact inline style block. The layout is intentionally restrained: neutral backgrounds, one deep-blue feature panel, high-contrast text, readable system fonts with no external font dependency, more spacious forms, clearly labeled status indicators, and consistent tap targets. Most body text is at least 15–16 px, and form controls use 16 px text to avoid auto-zoom on mobile browsers.

At narrow phone widths, the sidebar becomes a **labeled bottom navigation bar** with simple SVG icons, and the six-column complaint table becomes vertically stacked, labeled case cards rather than requiring horizontal scrolling. Registration, consumer complaints, technician actions, administrator views and the existing PWA install controls all use the same stylesheet. Keyboard focus indicators and reduced-motion preferences are supported.

**Check the deployed design:** Open [PowerResolve](https://powe-complaint-system.powerresolve.workers.dev/) after the newest Cloudflare build succeeds. If the previous style remains in a cached browser tab, refresh the page fully; installed PWAs should be closed and reopened after the deployment. These code changes do not add photo uploads or R2.

## Developer credit and branded public routing

The application displays the same accessible, responsive developer footer on public authentication and all logged-in pages:

- **Proudly built by Eze Annastasia Chinaza · PGD No. 735**
- **Phone:** [0813 234 8235](tel:08132348235)
- **Email:** [annastasiachinaza2@gmail.com](mailto:annastasiachinaza2@gmail.com)

The Cloudflare account-wide `workers.dev` subdomain has been changed by the account owner from `kennygeemartin` to `powerresolve`. The new published hostname supplied by the owner is `https://powe-complaint-system.powerresolve.workers.dev`. The old hostname should not be used for new installs or Android builds. The live response of the new endpoint must still be verified after publication.

For a dedicated, production-suitable branded hostname, use a **domain already owned and activated in the Cloudflare account**. The deployment script now accepts the optional build environment variable `POWERRESOLVE_CUSTOM_DOMAIN` with that exact hostname (e.g. `app.your-owned-domain.example`). On the next `npm run deploy`, it validates the hostname and configures `routes:[{pattern:<hostname>,custom_domain:true}]`. Cloudflare then handles the Custom Domain's DNS record and TLS certificate. No live branded domain is claimed until DNS ownership and a successful production deployment are confirmed.

The new `workers.dev` route is now the target for all Android v1.0.4 builds. The Android workflow explicitly uses the new HTTPS origin even if a stale repository variable exists. The PWA itself uses relative links and works directly under this hostname. Existing PWA installations tied to the old origin may need to be installed again from the new address. See [Cloudflare custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) and [workers.dev account subdomains](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

## One-time first-administrator provisioning (protected)

**Mobile-friendly setup page:** [https://powe-complaint-system.powerresolve.workers.dev/first-admin-setup.html](https://powe-complaint-system.powerresolve.workers.dev/first-admin-setup.html)

The Worker permits creating the initial administrator **only if** the production Cloudflare secret `BOOTSTRAP_KEY` matches the request and no administrator already exists. This page does **not** contain passwords, Cloudflare tokens or account-level bypasses. It generates a cryptographically random key inside the browser and submits the key and chosen administrator password to the existing same-origin `POST /api/setup/admin` endpoint. It does not store either value in browser storage. After provisioning, sign in at [`/admin`](https://powe-complaint-system.powerresolve.workers.dev/admin).

1. Open the setup page on a trusted device and choose **Generate private key**. Copy the random key.
2. In the [Cloudflare Dashboard](https://dash.cloudflare.com/), open **Workers & Pages → powe-complaint-system → Settings → Variables and Secrets → Add**. Create a **Secret** (not a plaintext variable) with name `BOOTSTRAP_KEY` and paste the generated key. Save and deploy/apply that secret.
3. Return to the setup page. With username `SuperAdmin`, supply the **same** private key and a private administrator password, then choose **Create administrator securely**.
4. Sign in at `/admin`. Once first-admin creation and login have succeeded, delete the one-time `BOOTSTRAP_KEY` secret from Cloudflare to disable further use of the setup route.

**Alternative terminal procedure:** On a trusted computer with Node.js and this repository checked out, run `npm run admin:key` to generate a key to paste into the Cloudflare secret, then `npm run admin:bootstrap`. The latter asks for the key and administrator password **without printing them**, creates `SuperAdmin` and verifies login. It reports a protected conflict if an administrator has already been provisioned. Never paste administrator passwords or secret keys into GitHub issues, commit messages, build variables, or chat. A password previously used in public tests is unsuitable for a production administrator.

**Not a recovery bypass:** When another administrator already exists, the protected endpoint returns HTTP 409 and does not replace it. Existing administrator recovery requires authenticated Cloudflare account access.

## Administrator console and automatic specialist assignment

**Admin portal:** [https://powe-complaint-system.powerresolve.workers.dev/admin](https://powe-complaint-system.powerresolve.workers.dev/admin)

The Administrator dashboard now provides all registered complaints, active technician workload, a priority-aware pending queue, manual case transfer, and a dedicated Staff directory. Technicians are categorized in six specialties: Outage, Meter fault, Billing, Safety hazard, Voltage fluctuation, and Transformer fault. New complaints are assigned to an **active** specialist with matching skills and available workload capacity, using least-loaded selection. When there is no qualified active technician, the complaint stays in the visible unassigned queue; it is never falsely marked as dispatched.

Administrators can create staff accounts with one-time random passwords, change specialties, control assignment capacity, suspend accounts, reset passwords and regenerate inactive placeholder accounts for missing specialties. Inactive placeholders **do not** receive cases until verified people take ownership and are activated. Every case transfer or status change is audited. New D1 migration `0002_specialist_dispatch.sql` is automatically applied by `npm run deploy`; database and existing complaint records are preserved.

**Security:** No universal administrator password or fake active field personnel are created. First administrator setup still uses the existing private `BOOTSTRAP_KEY` procedure. The platform records internal assignments only; it is not connected to the electricity distributor's physical dispatch operation. Full administration and implementation guide: [docs/ADMIN_DISPATCH_GUIDE.md](docs/ADMIN_DISPATCH_GUIDE.md).

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

Android v1.0.4 uses the new `powerresolve.workers.dev` service URL directly in its build workflow. A newly built APK opens the hosted application without requiring users to enter a server URL. The workflow must pass a real `/api/health` check before the APK is published.

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
