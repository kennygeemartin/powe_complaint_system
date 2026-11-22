import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const workerRoot=fileURLToPath(new URL('../',import.meta.url));
const script=fileURLToPath(new URL('../scripts/deploy.mjs',import.meta.url));
const sample=fs.readFileSync(path.join(workerRoot,'wrangler.jsonc'),'utf8');
const uuid='6b1c95a0-1155-4ec7-9aac-f2906e376102';

function prepare(configuration){
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'powerresolve-preflight-'));
  try{
    fs.writeFileSync(path.join(cwd,'wrangler.jsonc'),configuration);
    const run=spawnSync(process.execPath,[script,'--prepare-only'],{
      cwd,encoding:'utf8',timeout:15000,env:{...process.env,POWERRESOLVE_D1_DATABASE_ID:uuid}
    });
    const actual=JSON.parse(fs.readFileSync(path.join(cwd,'wrangler.jsonc'),'utf8'));
    return {run,actual};
  } finally {fs.rmSync(cwd,{recursive:true,force:true})}
}

test('Cloudflare deploy preflight replaces invalid placeholder using configured D1 ID',()=>{
  const {run,actual}=prepare(sample);
  assert.equal(run.status,0,run.stderr);
  assert.equal(actual.d1_databases[0].database_id,uuid);
  assert.equal(actual.name,'powe-complaint-system');
});

test('Cloudflare deploy preflight rejects a mismatched Worker name',()=>{
  const bad=JSON.parse(sample);
  bad.name='unexpected-production-service';
  const {run}=prepare(JSON.stringify(bad));
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/Worker name must match/);
});
