/**
 * PowerResolve deployment bootstrap for authorized Cloudflare CI builds.
 *
 * Creates the D1 database, optionally sets up R2, applies D1 migrations,
 * then deploys the Worker. The authenticated Cloudflare build token must have the
 * necessary D1, R2, and Workers permissions. No credentials are printed or saved.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const configPath = 'wrangler.jsonc';
const databaseName = 'powerresolve-db';
const bucketName = 'powerresolve-evidence';
const workerName = 'powe-complaint-system';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = message => {
  console.error('[PowerResolve deployment] ' + message);
  process.exit(1);
};

const cli = (args, { visible = false, optional = false } = {}) => {
  const r = spawnSync('npx', ['--no-install', 'wrangler', ...args], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 4 * 1024 * 1024,
    ...(visible ? { stdio: 'inherit' } : {})
  });
  if (r.error) fail('Wrangler could not start: ' + r.error.message);
  if (r.status !== 0 && !optional) {
    if (!visible) {
      const last = (r.stderr || r.stdout || '').trim().slice(-800);
      console.error(last);
    }
    fail('Command failed: wrangler ' + args.join(' ') + '. Check Cloudflare build token permissions and account resource activation.');
  }
  return r;
};

function parseCloudflareJson(output) {
  const raw = output.trim();
  try { return JSON.parse(raw); } catch {}
  // Wrangler occasionally prefixes diagnostic messages to JSON output.
  const candidates = [raw.indexOf('['), raw.indexOf('{')].filter(i => i >= 0).sort((a, b) => a - b);
  for (const position of candidates) {
    try { return JSON.parse(raw.slice(position)); } catch {}
  }
  fail('Could not read Wrangler JSON output; check current Wrangler version.');
}

function listDatabases() {
  const result = cli(['d1', 'list', '--json'], { optional: true });
  if (result.status !== 0) fail(
    'Cannot list Cloudflare D1 databases. The connected build token needs D1 Read/Edit permissions. ' +
    'Provide an authorized Cloudflare build token; do not share the token in chat or GitHub.'
  );
  const parsed = parseCloudflareJson(result.stdout || '');
  const list = Array.isArray(parsed) ? parsed : (parsed.result || parsed.databases);
  if (!Array.isArray(list)) fail('Cloudflare D1 list returned an unexpected result.');
  return list;
}

const getDatabaseId = list => {
  const matches = list.filter(db => db.name === databaseName);
  if (matches.length > 1) fail('Multiple D1 databases have the configured name; select the correct one manually.');
  return matches[0] ? (matches[0].uuid || matches[0].id) : null;
};

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (config.name !== workerName) fail('Worker name must match ' + workerName + ', found ' + config.name);
if (config.d1_databases?.length !== 1 || config.d1_databases[0].binding !== 'DB') {
  fail('Expected exactly one Cloudflare D1 database binding named DB.');
}
const r2Requested = config.r2_buckets?.some(r => r.binding === 'EVIDENCE' && r.bucket_name === bucketName) || false;
if (config.r2_buckets?.length && !r2Requested) {
  fail('Unexpected R2 binding; expected EVIDENCE -> powerresolve-evidence.');
}

const suppliedId = process.env.POWERRESOLVE_D1_DATABASE_ID?.trim();
if (suppliedId && !uuidPattern.test(suppliedId)) {
  fail('POWERRESOLVE_D1_DATABASE_ID must be a D1 database UUID, not an account ID.');
}
let id = suppliedId || config.d1_databases[0].database_id;
const isDryRun = process.argv.includes('--prepare-only');

// The isolated preflight verifies config without making Cloudflare API calls.
if (!uuidPattern.test(id) && isDryRun) {
  fail('The D1 ID is missing. Supply POWERRESOLVE_D1_DATABASE_ID for a local --prepare-only test.');
}
if (!uuidPattern.test(id)) {
  console.log('[PowerResolve deployment] Discovering existing D1 database.');
  id = getDatabaseId(listDatabases());
  if (!id) {
    console.log('[PowerResolve deployment] Creating D1 database: ' + databaseName);
    cli(['d1', 'create', databaseName, '--no-update-config'], { visible: true });
    id = getDatabaseId(listDatabases());
  }
}
if (!uuidPattern.test(id)) fail('Could not resolve the newly created D1 database ID.');
config.d1_databases[0].database_id = id;
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log('[PowerResolve deployment] D1 configuration validated.');
if (isDryRun) process.exit(0);

// R2 is an optional enhancement. Core complaints must deploy without it.
if (!r2Requested) {
  console.log('[PowerResolve deployment] R2 disabled; deploying core service without photo uploads.');
} else {
  const info=cli(['r2','bucket','info',bucketName,'--json'],{optional:true});
  if(info.status!==0){
    const disabled=/(?:10042|enable R2|R2 subscription)/i.test((info.stderr||'')+(info.stdout||''));
    if(disabled){
      console.warn('[PowerResolve deployment] R2 is not activated; omitting its optional binding.');
      delete config.r2_buckets;
      fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\\n');
    }else{
      const create=cli(['r2','bucket','create',bucketName,'--no-update-config'],{optional:true});
      if(create.status!==0){
        const error=(create.stderr||'')+(create.stdout||'');
        if(/(?:10042|enable R2|R2 subscription)/i.test(error)){
          console.warn('[PowerResolve deployment] R2 activation required; continuing without photo uploads.');
          delete config.r2_buckets;
          fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\\n');
        }else{
          console.error(error.slice(-1000));
          fail('R2 initialization failed for a reason other than subscription activation.');
        }
      }
    }
  }
}
console.log('[PowerResolve deployment] Applying database migrations.');
cli(['d1', 'migrations', 'apply', databaseName, '--remote'], { visible: true });
console.log('[PowerResolve deployment] Database migrated; deploying Worker.');
cli(['deploy'], { visible: true });
console.log('[PowerResolve deployment] Wrangler deployment finished; verify the public /api/health endpoint.');
