import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const read = relative => fs.readFileSync(fileURLToPath(new URL('../'+relative,import.meta.url)),'utf8');

test('photo upload is removed from browser interface and complaint API',()=>{
  const html=read('public/index.html');
  const worker=read('src/worker.js');
  assert.doesNotMatch(html,/type=["']file["']|evidenceFile|\\/evidence|formData\\.append\\(["']file["']/i);
  assert.doesNotMatch(worker,/EVIDENCE|\/evidence|FROM uploads|INSERT INTO uploads|\.formData\(/);
  assert.match(worker,/action\|feedback/);
});

test('Android removes camera and photo upload capabilities',()=>{
  const java=read('android/app/src/main/java/com/powerresolve/mobile/MainActivity.java');
  const manifest=read('android/app/src/main/AndroidManifest.xml');
  assert.doesNotMatch(java,/onShowFileChooser|ACTION_IMAGE_CAPTURE|ACTION_GET_CONTENT|MediaStore|capturedPhoto|imageCallback/);
  assert.doesNotMatch(manifest,/android\.hardware\.camera|CAMERA|READ_MEDIA_IMAGES|READ_EXTERNAL_STORAGE/);
  assert.match(manifest,/ACCESS_FINE_LOCATION/);
});

test('Cloudflare configuration and deployment do not require R2',()=>{
  const cfg=JSON.parse(read('wrangler.jsonc'));
  const deploy=read('scripts/deploy.mjs');
  assert.equal(cfg.r2_buckets,undefined);
  assert.equal(cfg.d1_databases[0].binding,'DB');
  assert.doesNotMatch(deploy,/wrangler.*r2 bucket|\['r2',\s*'bucket'/);
});
