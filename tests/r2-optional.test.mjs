import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const script=path.join(root,'scripts/deploy.mjs');
const id='690bcbd3-1028-4ac2-81e9-e1473c368c58';

function runScenario(withDisabledR2){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'powerresolve-r2-optional-'));
 try{
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8'));
  cfg.d1_databases[0].database_id=id;
  if(withDisabledR2)cfg.r2_buckets=[{binding:'EVIDENCE',bucket_name:'powerresolve-evidence'}];
  else delete cfg.r2_buckets;
  fs.writeFileSync(path.join(dir,'wrangler.jsonc'),JSON.stringify(cfg));
  const bin=path.join(dir,'bin');fs.mkdirSync(bin);
  const stub=path.join(bin,'npx');
  fs.writeFileSync(stub,[
   '#!/bin/sh',
   'echo "$*" >> .commands',
   'case "$*" in',
   '  *"r2 bucket info"*) echo "Please enable R2 through the Cloudflare Dashboard. [code: 10042]" >&2; exit 1 ;;',
   '  *"d1 migrations apply"*) exit 0 ;;',
   '  *"wrangler deploy"*) exit 0 ;;',
   '  *) echo "Unexpected test command" >&2; exit 5 ;;',
   'esac'
  ].join('\n')+'\n',{mode:0o755});
  const result=spawnSync(process.execPath,[script],{
    cwd:dir,encoding:'utf8',timeout:15000,
    env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,POWERRESOLVE_D1_DATABASE_ID:id}
  });
  const finalConfig=JSON.parse(fs.readFileSync(path.join(dir,'wrangler.jsonc'),'utf8'));
  const cmds=fs.readFileSync(path.join(dir,'.commands'),'utf8').trim().split('\n');
  return {result,finalConfig,cmds};
 } finally {fs.rmSync(dir,{recursive:true,force:true})}
}

test('D1-only deployment skips R2 entirely',()=>{
 const x=runScenario(false);
 assert.equal(x.result.status,0,x.result.stderr);
 assert.equal(x.finalConfig.r2_buckets,undefined);
 assert.equal(x.cmds.length,2);
 assert.match(x.cmds[0],/d1 migrations apply/);
 assert.match(x.cmds[1],/wrangler deploy/);
});

test('R2 activation error 10042 triggers D1-only fallback',()=>{
 const x=runScenario(true);
 assert.equal(x.result.status,0,x.result.stderr);
 assert.equal(x.finalConfig.r2_buckets,undefined);
 assert.match(x.result.stderr,/R2 is not activated/);
 assert.ok(x.cmds.some(v=>v.includes('r2 bucket info')));
 assert.ok(x.cmds.some(v=>v.includes('d1 migrations apply')));
 assert.ok(x.cmds.some(v=>v.includes('wrangler deploy')));
 assert.ok(!x.cmds.some(v=>v.includes('r2 bucket create')));
});
