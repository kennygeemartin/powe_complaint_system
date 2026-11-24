import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = p => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('First-administrator setup page is mobile-friendly and never embeds credentials',()=>{
  const page=read('public/first-admin-setup.html');
  assert.match(page,/name="viewport"/);
  assert.match(page,/name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(page,/value="SuperAdmin"/);
  assert.match(page,/id="bootstrap" type="password"/);
  assert.match(page,/id="password" type="password"/);
  assert.match(page,/getRandomValues\(new Uint8Array\(40\)\)/);
  assert.match(page,/X-Bootstrap-Key/);
  assert.match(page,/fetch\('\/api\/setup\/admin'/);
  assert.match(page,/response\.status===409/);
  assert.doesNotMatch(page,/DemoPass2026!|localStorage\.|sessionStorage\.|pass_hash|BOOTSTRAP_KEY\s*=\s*["']/);
  const script=page.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script);
  assert.doesNotThrow(()=>new Function(script[1]));
});
test('Local bootstrap key generator uses randomness and does not transmit the key',()=>{
  const script=fileURLToPath(new URL('../scripts/bootstrap-admin.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script,'--generate-key'],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout.trim(),/^[A-Za-z0-9_-]{64}$/);
  assert.equal(result.stderr,'');
});
test('CLI provisioning does not embed a public test password or leak secrets in argv',()=>{
  const cli=read('scripts/bootstrap-admin.mjs');
  assert.doesNotMatch(cli,/DemoPass2026!|Password123!|process\.argv\[[2-9]\].*password|localStorage/);
  assert.match(cli,/hiddenInput\('Cloudflare BOOTSTRAP_KEY/);
  assert.match(cli,/hiddenInput\('Administrator password/);
  assert.match(cli,/process\.stdin\.setRawMode\(true\)/);
  assert.match(cli,/verifyCredentials\(password\)/);
  assert.match(cli,/ADMIN_ALIAS = 'SuperAdmin'/);
});
