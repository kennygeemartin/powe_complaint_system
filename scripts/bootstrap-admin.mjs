#!/usr/bin/env node
/**
 * PowerResolve first-admin bootstrap helper.
 *
 * No administrator password or Cloudflare secret is stored in source control,
 * command-line arguments, URLs, environment variables, or process logs.
 *
 * npm run admin:key       Generate a one-time secret to add in Cloudflare.
 * npm run admin:bootstrap Prompt securely and provision/verify SuperAdmin.
 */
import { randomBytes } from 'node:crypto';

const ORIGIN = 'https://powe-complaint-system.powerresolve.workers.dev';
const ADMIN_ALIAS = 'SuperAdmin';
const TIMEOUT_MS = 20000;

if (process.argv.includes('--generate-key')) {
  process.stdout.write(randomBytes(48).toString('base64url') + '\n');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  process.stdout.write(`PowerResolve protected administrator setup

  npm run admin:key
    Generate a private BOOTSTRAP_KEY. In Cloudflare's powe-complaint-system
    Worker > Settings > Variables and Secrets, create a Secret named
    BOOTSTRAP_KEY with that value. Deploy/apply the secret.

  npm run admin:bootstrap
    Prompt for the private key and the first administrator password.
    Creates the SuperAdmin account only if no administrator exists.
    Tests login and revokes its temporary test session.

The key and password are never printed, written to disk or supplied as
command-line arguments. Do not run this on an untrusted device.
`);
  process.exit(0);
}

function hiddenInput(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Run this command directly in an interactive terminal (not redirected input).');
  }
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdout.write(label);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    function cleanup() {
      process.stdin.off('data', receive);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    }
    function receive(input) {
      for (const ch of input) {
        if (ch === '\u0003') {
          cleanup();
          reject(new Error('Cancelled'));
          return;
        }
        if (ch === '\r' || ch === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0,-1);
          continue;
        }
        if (ch >= ' ' && ch !== '\u007f') value += ch;
      }
    }
    process.stdin.on('data', receive);
  });
}

async function request(route, payload, extraHeaders = {}) {
  const response = await fetch(ORIGIN + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'error',
  });
  let data;
  try { data = await response.json(); }
  catch { data = { detail:'Unexpected server response' }; }
  return { status:response.status, data };
}

async function verifyCredentials(password) {
  const login = await request('/api/login', { alias:ADMIN_ALIAS, password });
  if (login.status !== 200 || login.data?.user?.role !== 'admin') return false;
  const token = login.data.token;
  if (typeof token === 'string' && token.length > 10) {
    try {
      await request('/api/logout', {}, { Authorization:'Bearer ' + token });
    } catch {
      // The login token expires server-side. Never print it.
    }
  }
  return true;
}

async function main() {
  process.stdout.write('PowerResolve first administrator | ' + ORIGIN + '\n');
  process.stdout.write('Alias: ' + ADMIN_ALIAS + '\n');
  const bootstrapKey = await hiddenInput('Cloudflare BOOTSTRAP_KEY (hidden): ');
  const password = await hiddenInput('Administrator password (hidden): ');
  if (!bootstrapKey || !password) throw new Error('Both secret and password are required.');
  if (password.length < 8 || password.length > 128) {
    throw new Error('Administrator password must contain between 8 and 128 characters.');
  }

  const result = await request('/api/setup/admin',
    { alias:ADMIN_ALIAS, password },
    { 'x-bootstrap-key':bootstrapKey });
  if (result.status === 200 || result.status === 201) {
    if (await verifyCredentials(password)) {
      process.stdout.write('SUCCESS: SuperAdmin created and administrator sign-in verified.\n');
    } else {
      process.stdout.write('Administrator creation was accepted, but login verification failed. Investigate before use.\n');
      process.exitCode = 1;
    }
    return;
  }
  if (result.status === 409) {
    if (await verifyCredentials(password)) {
      process.stdout.write('SUCCESS: The existing SuperAdmin account signs in with this password.\n');
    } else {
      throw new Error('An administrator already exists, but these credentials were rejected. A secure existing-admin recovery is required.');
    }
    return;
  }
  if (result.status === 404) throw new Error('BOOTSTRAP_KEY is not configured in the live Cloudflare Worker, or the setup route is unavailable.');
  if (result.status === 403) throw new Error('BOOTSTRAP_KEY does not match the Cloudflare secret for this Worker.');
  if (result.status === 503) throw new Error('Cloudflare D1 database schema is not ready. Apply the current migrations.');
  throw new Error('Administrator creation was rejected (HTTP ' + result.status + '): ' +
    String(result.data?.detail || 'Server error').slice(0,180));
}

main().catch(error => {
  process.stderr.write('SETUP NOT COMPLETED: ' + error.message + '\n');
  process.exitCode = 1;
});
