import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const load=(name)=>fs.readFileSync(fileURLToPath(new URL('../'+name,import.meta.url)),'utf8');
const target='https://powe-complaint-system.powerresolve.workers.dev';
const legacy='https://powe-complaint-system.kennygeemartin.workers.dev';

test('Android Gradle config defaults to new Cloudflare account subdomain',()=>{
  const gradle=load('android/app/build.gradle');
  assert.match(gradle,/versionName '1\.0\.4-powerresolve'/);
  assert.match(gradle,/versionCode 4/);
  assert.ok(gradle.includes(target),'New origin missing from Android build');
  assert.ok(!gradle.includes(legacy),'Old origin remains in Android Gradle config');
});
test('Official Android build always verifies and embeds new service origin',()=>{
  const workflow=load('.github/workflows/android-apk.yml');
  assert.ok(workflow.includes('POWERRESOLVE_SERVICE_URL: '+target));
  assert.equal(workflow.split('POWERRESOLVE_SERVICE_URL: '+target).length-1,2);
  assert.ok(workflow.includes('android-v1.0.4-powerresolve'));
  assert.ok(workflow.includes('gh release upload'));
  assert.ok(!workflow.includes(legacy));
});
test('Cloudflare post-deploy health check uses new hostname',()=>{
  const workflow=load('.github/workflows/deploy.yml');
  assert.ok(workflow.includes('SERVICE_URL: '+target));
  assert.ok(!workflow.includes(legacy));
});
test('PWA launch stays origin-relative and has no photo uploads',()=>{
  const html=load('public/index.html');
  const manifest=JSON.parse(load('public/manifest.webmanifest'));
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.scope,'/');
  assert.ok(!html.includes(legacy));
  assert.doesNotMatch(html,/evidenceFile|type=["']file["']/i);
});
