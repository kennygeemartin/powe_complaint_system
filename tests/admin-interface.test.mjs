import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const read=(p)=>fs.readFileSync(fileURLToPath(new URL('../'+p,import.meta.url)),'utf8');

test('Administrator console has working client-side functions and navigation',()=>{
  const html=read('public/index.html');
  const js=read('public/admin.js');
  assert.doesNotThrow(()=>new Function(js));
  const inline=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(inline,'PowerResolve application script not found');
  assert.doesNotThrow(()=>new Function(inline[1]));
  assert.match(html,/src="\/admin\.js"/);
  assert.match(html,/href="\/admin\.css"/);
  assert.match(html,/\['team','♧','Staff'\]/);
  assert.match(html,/adminDashboard\(stats,list,overview,staff\)/);
  assert.match(html,/staffPage\(staff,overview\)/);
  assert.match(html,/location\.pathname\.startsWith\('\/admin'\)/);
});

test('Admin dashboard includes backlog, capacity and staff management workflows',()=>{
  const js=read('public/admin.js');
  for(const action of ['adminDashboard','staffPage','manageCreateStaff','manageUpdateStaff',
      'createStarterStaff','runDispatch','reassignCase','resetStaffPassword']){
    assert.ok(js.includes('function '+action+'('),action);
  }
  for(const route of ['/staff','/dispatch/run','/staff/starter-accounts','/reset-password','/reassign']){
    assert.ok(js.includes(route),'Expected API route '+route);
  }
  assert.match(js,/Maximum active complaints/);
  assert.match(js,/Technical specialty/);
  assert.match(js,/One workspace for incoming reports/);
});

test('Staff credentials are one-time display only and never placed in browser storage',()=>{
  const js=read('public/admin.js');
  assert.match(js,/showStaffCredentials\(/);
  assert.match(js,/temporary_password/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(js,/defaultPassword|admin123|password123/);
});

test('Admin interface keeps responsive typography and preserves legacy user screens',()=>{
  const css=read('public/admin.css');
  const base=read('public/styles.css');
  const html=read('public/index.html');
  assert.match(css,/\.ops-stats/);
  assert.match(css,/\.ops-category-grid/);
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(base,/\.site-footer/);
  assert.match(html,/developerFooter\(\)/);
  assert.match(html,/function newPage\(\)/);
  assert.match(html,/function sendFeedback\(/);
  assert.doesNotMatch(html,/type=["']file["']|evidenceFile/);
});
