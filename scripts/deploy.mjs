// PowerResolve Cloudflare preflight and release; never prints credentials.
// This wrapper is used by the GitHub workflow and can be used in Cloudflare Workers Builds.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const configPath = 'wrangler.jsonc';
const dbName = 'powerresolve-db';
const validUUID = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = message => { console.error('[PowerResolve deployment] ' + message); process.exit(1); };

function command(args, options = {}) {
  const r = spawnSync('npx', ['--no-install', 'wrangler', ...args], {
    encoding: 'utf8', env: process.env, maxBuffer: 4 * 1024 * 1024,
    ...(options.visible ? {stdio: 'inherit'} : {}), ...options
  });
  if (r.error || r.status !== 0) {
    if (options.visible) fail('Wrangler ' + args[0] + ' failed. Review its diagnostic messages.');
    fail('Cloudflare D1 lookup could not run with the current build credentials. Ensure the build token has D1 Read access, or set POWERRESOLVE_D1_DATABASE_ID in Cloudflare Build variables.');
  }
  return r.stdout ?? '';
}

function databaseFromWrangler() {
  let list;
  try {
    const raw = command(['d1','list','--json']).trim();
    const start = raw.indexOf('[');
    list = JSON.parse(start < 0 ? raw : raw.slice(start));
  } catch (err) { fail('D1 listing failed. Set POWERRESOLVE_D1_DATABASE_ID to the UUID shown on your D1 database page (not the Cloudflare account ID).'); }
  const entries = Array.isArray(list) ? list : (list?.result || list?.databases);
  if (!Array.isArray(entries)) fail('Unexpected response from wrangler d1 list --json.');
  const matches = entries.filter(x => x.name === dbName);
  if (matches.length !== 1) fail('Expected exactly one D1 database named "' + dbName + '". Create it in Cloudflare D1 or select its ID using POWERRESOLVE_D1_DATABASE_ID.');
  return matches[0].uuid || matches[0].id;
}

const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (cfg.name !== 'powe-complaint-system') fail('The Worker name must match the Cloudflare connected build.');
if (!Array.isArray(cfg.d1_databases) || cfg.d1_databases.length !== 1 || cfg.d1_databases[0].binding !== 'DB') fail('Missing the expected DB D1 binding.');
if (!Array.isArray(cfg.r2_buckets) || !cfg.r2_buckets.find(x => x.binding === 'EVIDENCE')) fail('Missing private R2 evidence storage binding.');

let uuid = process.env.POWERRESOLVE_D1_DATABASE_ID || cfg.d1_databases[0].database_id;
if (!validUUID(uuid)) uuid = databaseFromWrangler();
if (!validUUID(uuid)) fail('D1 database ID is invalid. Use the UUID belonging to "powerresolve-db", not the Cloudflare account ID.');
cfg.d1_databases[0].database_id = uuid;
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
console.log('[PowerResolve deployment] D1 ID resolved and Wrangler configuration validated.');

if (process.argv.includes('--prepare-only')) process.exit(0);
command(['d1','migrations','apply',dbName,'--remote'],{visible:true});
console.log('[PowerResolve deployment] Database migrations applied.');
command(['deploy'],{visible:true});
console.log('[PowerResolve deployment] Deployment command completed. Verify /api/health over HTTPS.');
