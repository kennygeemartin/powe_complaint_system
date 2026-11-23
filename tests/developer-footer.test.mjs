import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const read = path => fs.readFileSync(fileURLToPath(new URL('../'+path, import.meta.url)), 'utf8');
const html=read('public/index.html');
const css=read('public/styles.css');

test('Professional developer footer is shared by all public and signed-in screens',()=>{
  assert.match(html,/function developerFooter\(\)/);
  assert.equal((html.match(/\$\{developerFooter\(\)\}/g)||[]).length,2);
  assert.match(html,/<footer class="site-footer" aria-label="Application developer and contact">/);
  assert.match(html,/Proudly built by/);
  assert.match(html,/Eze Annastasia Chinaza/);
  assert.match(html,/PGD No\. 735/);
});

test('Developer phone and email are accessible, actionable and accurate',()=>{
  assert.match(html,/href="tel:08132348235"/);
  assert.match(html,/href="mailto:annastasiachinaza2@gmail\.com"/);
  assert.match(html,/aria-label="Call Eze Annastasia Chinaza at 08132348235"/);
  assert.match(html,/aria-label="Email Eze Annastasia Chinaza at annastasiachinaza2@gmail\.com"/);
});

test('Footer stays aligned on mobile and authentication pages',()=>{
  assert.match(css,/\.site-footer\s*\{/);
  assert.match(css,/\.site-footer__identity/);
  assert.match(css,/\.site-footer__contact/);
  assert.match(css,/\.authbox \.site-footer\s*\{/);
  assert.match(css,/@media \(max-width: 760px\)/);
  assert.match(css,/\.site-footer__contact a\s*\{/);
});

test('PWA installation and the text-only complaint form remain unchanged',()=>{
  assert.match(html,/function installPowerResolve\(\)/);
  assert.match(html,/function initNew\(\)/);
  assert.doesNotMatch(html,/type=["']file["']|evidenceFile|onShowFileChooser/);
});
