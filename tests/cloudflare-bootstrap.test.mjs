import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const deployScript = path.join(projectRoot, 'scripts/deploy.mjs');
const uuid = '12345678-1234-4123-8123-123456789abc';

test('authorized deployment provisions D1 and R2, migrates and deploys without duplicates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'powerresolve-bootstrap-'));
  try {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const fakeNpx = path.join(bin, 'npx');
    const workerConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'wrangler.jsonc'), 'utf8'));
    workerConfig.d1_databases[0].database_id = 'REPLACE_WITH_YOUR_D1_DATABASE_ID';
    fs.writeFileSync(path.join(dir, 'wrangler.jsonc'), JSON.stringify(workerConfig));
    const mock = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dir = process.cwd();
const args = process.argv.slice(2);
if (args[0] !== '--no-install' || args[1] !== 'wrangler') process.exit(4);
const cmd = args.slice(2);
const key = cmd.slice(0,2).join(' ');
const db = path.join(dir, '.created_db');
const bucket = path.join(dir, '.created_bucket');
const log = path.join(dir, '.commands');
fs.appendFileSync(log, cmd.join(' ') + '\\n');
if(key==='d1 list') {
 console.log(fs.existsSync(db) ? JSON.stringify([{name:'powerresolve-db',uuid:'12345678-1234-4123-8123-123456789abc'}]) : '[]');
} else if(key==='d1 create') {
 fs.writeFileSync(db,'true');
} else if(cmd.slice(0,3).join(' ')==='r2 bucket info') {
 if(!fs.existsSync(bucket))process.exit(1);
 console.log('{"name":"powerresolve-evidence"}');
} else if(cmd.slice(0,3).join(' ')==='r2 bucket create') {
 fs.writeFileSync(bucket,'true');
} else if(key==='d1 migrations') {
 if(!fs.existsSync(db))process.exit(5);
} else if(cmd[0]==='deploy') {
 if(!fs.existsSync(db)||!fs.existsSync(bucket))process.exit(6);
} else {
 console.error('Unexpected CLI:',cmd.join(' '));process.exit(9);
}
`;
    fs.writeFileSync(fakeNpx, mock, {mode:0o755});
    const env={...process.env, PATH:bin+path.delimiter+process.env.PATH, CI:'true'};
    delete env.POWERRESOLVE_D1_DATABASE_ID;
    const run=()=>spawnSync(process.execPath,[deployScript],{cwd:dir,env,encoding:'utf8',timeout:15000});
    const first=run();
    assert.equal(first.status,0,first.stderr);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'wrangler.jsonc'),'utf8')).d1_databases[0].database_id,uuid);
    assert.ok(fs.existsSync(path.join(dir,'.created_db')));
    assert.ok(fs.existsSync(path.join(dir,'.created_bucket')));
    const second=run();
    assert.equal(second.status,0,second.stderr);
    const history=fs.readFileSync(path.join(dir,'.commands'),'utf8').split('\\n');
    assert.equal(history.filter(x=>x.startsWith('d1 create ')).length,1);
    assert.equal(history.filter(x=>x.startsWith('r2 bucket create ')).length,1);
    assert.equal(history.filter(x=>x==='deploy').length,2);
    assert.equal(history.filter(x=>x==='d1 migrations apply powerresolve-db --remote').length,2);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
