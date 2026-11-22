import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

function read(path){return fs.readFileSync(fileURLToPath(new URL('../'+path,import.meta.url)),'utf8')}
const html=read('public/index.html');
const css=read('public/styles.css');

function luminance(hex){
  const r=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const linear=r.map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
  return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
}
function contrast(a,b){
  const vals=[luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (vals[0]+.05)/(vals[1]+.05);
}

test('PowerResolve uses the accessible shared stylesheet and legible base type',()=>{
  assert.match(html,/rel="stylesheet" href="\/styles\.css"/);
  assert.doesNotMatch(html,/<style>/);
  assert.match(css,/font: 400 1rem\/1\.6/);
  assert.match(css,/\.field label \{/);
  assert.match(css,/font-size: 1rem/);
  assert.match(css,/@media \(max-width: 760px\)/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
});

test('Accessible contrast is maintained for primary text, secondary text and main action',()=>{
  assert.ok(contrast('#192a40','#ffffff')>=7);
  assert.ok(contrast('#56677d','#ffffff')>=4.5);
  assert.ok(contrast('#245ac2','#ffffff')>=4.5);
  assert.ok(contrast('#ffffff','#1b3b61')>=7);
});

test('Mobile case cards have descriptive labels and no forced horizontal scrolling',()=>{
  assert.match(html,/class="cases-table"/);
  for(const label of ['Reference','Issue / location','Priority','Status','Submitted / assigned','Actions']){
    assert.ok(html.includes('data-label="'+label+'"'),label);
  }
  assert.match(css,/\.cases-table td::before/);
  assert.match(css,/content: attr\(data-label\)/);
  assert.match(css,/\.tablewrap \{overflow-x: visible\}/);
  assert.match(html,/aria-label="Filter complaints by status"/);
});

test('Primary form inputs and navigation remain explicitly labeled',()=>{
  for(const id of ['alias','password','category','details','address','lat','lon','affected']){
    assert.ok(html.includes('for="'+id+'"'),'Missing field label for '+id);
  }
  assert.match(html,/aria-current="page"/);
  assert.match(html,/function navIcon\(name\)/);
  assert.match(html,/aria-live="polite"/);
  assert.doesNotMatch(html,/type=["']file["']|evidenceFile/);
});
