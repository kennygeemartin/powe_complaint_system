import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=relative=>fs.readFileSync(fileURLToPath(new URL('../'+relative,import.meta.url)));

test('PowerResolve is installable with valid manifest and generated Android icons',()=>{
  const manifest=JSON.parse(source('public/manifest.webmanifest').toString());
  assert.equal(manifest.name,'PowerResolve — Electricity Service Complaints');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.scope,'/');
  assert.deepEqual(manifest.icons.map(x=>x.sizes),['192x192','512x512']);
  for(const icon of manifest.icons){
    const filename=icon.src.replace(/^\//,'');
    const bytes=source('public/'+filename);
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    const size=Number(icon.sizes.split('x')[0]);
    assert.equal(bytes.readUInt32BE(16),size);
    assert.equal(bytes.readUInt32BE(20),size);
    assert.ok(bytes.length>500);
  }
});

test('Web page exposes install controls and registers safe service worker',()=>{
  const html=source('public/index.html').toString();
  assert.match(html,/rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html,/serviceWorker\.register\('\/sw\.js'/);
  assert.match(html,/beforeinstallprompt/);
  assert.match(html,/installPowerResolve\(/);
  assert.match(html,/Add to Home [Ss]creen/);
  assert.doesNotMatch(html,/type=["']file["']|evidenceFile/);
});

test('Service worker does not cache private API routes, sessions, or complaint records',()=>{
  const sw=source('public/sw.js').toString();
  assert.match(sw,/pathname\.startsWith\('\/api\/'\)\) return/);
  assert.doesNotMatch(sw,/cache\.put\(/);
  assert.doesNotMatch(sw,/localStorage|cookies|bearer|Authorization/);
  const offline=source('public/offline.html').toString();
  assert.match(offline,/You.re offline/);
  assert.match(offline,/Nothing has been sent/);
});
