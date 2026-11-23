import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import worker from '../src/worker.js';

function mockEnv(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(fs.readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 sqlite.exec(fs.readFileSync(new URL('../migrations/0002_specialist_dispatch.sql',import.meta.url),'utf8'));
 const DB={
  prepare(sql){
   const stmt=sqlite.prepare(sql);
   let args=[];
   return {
    bind(...x){args=x;return this},
    async first(){return stmt.get(...args)??null},
    async all(){return {results:stmt.all(...args)}},
    async run(){const r=stmt.run(...args);return {success:true,meta:{last_row_id:Number(r.lastInsertRowid),changes:Number(r.changes)}}}
   };
  }
 };
 const ASSETS={fetch:async()=>new Response('<h1>PowerResolve</h1>',{headers:{'Content-Type':'text/html'}})};
 return {DB,ASSETS,BOOTSTRAP_KEY:'long-test-bootstrap-secret',sqlite};
}
async function call(env,path,method='GET',payload,token,headers={}){
 const opts={method,headers:{...headers}};
 if(token)opts.headers.Authorization=`Bearer ${token}`;
 if(payload!==undefined){
  if(payload instanceof FormData){opts.body=payload}
  else {opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(payload)}
 }
 const res=await worker.fetch(new Request(`https://test.example${path}`,opts),env);
 return {status:res.status,body:await res.json().catch(()=>null)};
}
async function register(env,alias){return call(env,'/api/register','POST',{alias,password:'DemoPass2026!'})}
async function login(env,alias){const r=await call(env,'/api/login','POST',{alias,password:'DemoPass2026!'});assert.equal(r.status,200);return r.body}

// All records and actors in this file are fictitious, local-only evaluation fixtures.
test('Cloudflare Worker: authentication, complaint workflow and authorization',async t=>{
 const env=mockEnv(),ok=(name,fn)=>t.test(name,fn);
 await ok('public health reflects reachable D1',async()=>{const r=await call(env,'/api/health');assert.equal(r.status,200);assert.equal(r.body.status,'ok')});
 await ok('production PBKDF2 limit permits new account registration and login',async()=>{
   const subtle=crypto.subtle;
   const original=subtle.deriveBits;
   const iterations=[];
   subtle.deriveBits=async function(params,key,length){
     if(params.name==='PBKDF2'){
       iterations.push(params.iterations);
       if(params.iterations>100000)throw new DOMException('iteration counts above 100000 are not supported','NotSupportedError');
     }
     return original.call(this,params,key,length);
   };
   try{
     const registered=await register(env,'CloudflareLimitCase');
     assert.equal(registered.status,200);
     const signedIn=await login(env,'CloudflareLimitCase');
     assert.equal(signedIn.user.role,'consumer');
     assert.deepEqual(iterations,[100000,100000]);
   } finally {subtle.deriveBits=original}
 });

 await ok('health reports missing DB as unavailable',async()=>{
   const r=await call({...env,DB:null},'/api/health');
   assert.equal(r.status,503);
 });
 await ok('browser interface served',async()=>{const r=await worker.fetch(new Request('https://test.example/'),env);assert.equal(r.status,200);assert.match(await r.text(),/PowerResolve/)});
 await ok('registration input constraints enforced',async()=>{assert.equal((await call(env,'/api/register','POST',{alias:'x',password:'bad'})).status,422)});
 const r1=await register(env,'ConsumerAlpha');assert.equal(r1.status,200);
 const r2=await register(env,'ConsumerBeta');assert.equal(r2.status,200);
 const rt=await register(env,'AgentBruno');assert.equal(rt.status,200);
 env.sqlite.prepare("UPDATE users SET role='agent' WHERE alias='AgentBruno'").run();
 const boot=await call(env,'/api/setup/admin','POST',{alias:'SuperAdmin',password:'DemoPass2026!'},null,{'X-Bootstrap-Key':env.BOOTSTRAP_KEY});
 assert.equal(boot.status,201);
 await ok('first administrator may only be bootstrapped once',async()=>{
  assert.equal((await call(env,'/api/setup/admin','POST',{alias:'SecondAdmin',password:'DemoPass2026!'},null,{'X-Bootstrap-Key':env.BOOTSTRAP_KEY})).status,409);
  assert.equal((await call(env,'/api/setup/admin','POST',{alias:'ThirdAdmin',password:'DemoPass2026!'},null,{'X-Bootstrap-Key':'guess'})).status,403);
 });
 await ok('duplicate registration is rejected',async()=>{assert.equal((await register(env,'ConsumerAlpha')).status,409)});
 await ok('wrong password is denied',async()=>{assert.equal((await call(env,'/api/login','POST',{alias:'ConsumerAlpha',password:'wrong-Pass2026!'})).status,401)});
 const u=await login(env,'ConsumerAlpha'),other=await login(env,'ConsumerBeta'),a=await login(env,'SuperAdmin'),ag=await login(env,'AgentBruno');
 await ok('role assignments are server-enforced',async()=>{
  assert.equal((await call(env,'/api/agents','GET',undefined,u.token)).status,403);
  assert.equal((await call(env,'/api/agents','GET',undefined,a.token)).status,200);
  assert.equal((await call(env,'/api/me','GET',undefined,ag.token)).body.role,'agent');
 });
 await ok('only administrators can provision technician accounts',async()=>{
   assert.equal((await call(env,'/api/agents','POST',{alias:'NewTechOne',password:'LongPass123!'},u.token)).status,403);
   assert.equal((await call(env,'/api/agents','POST',{alias:'x',password:'weak'},a.token)).status,422);
   const created=await call(env,'/api/agents','POST',{alias:'NewTechOne',password:'LongPass123!'},a.token);
   assert.equal(created.status,201);
   assert.equal(created.body.role,'agent');
   const loggedIn=await call(env,'/api/login','POST',{alias:'NewTechOne',password:'LongPass123!'});
   assert.equal(loggedIn.status,200);
   assert.equal(loggedIn.body.user.role,'agent');
   const staff=await call(env,'/api/agents','GET',undefined,a.token);
   assert.equal(staff.body.some(x=>x.alias==='NewTechOne'),true);
 });
 await ok('invalid hazard in billing category denied',async()=>{
  const r=await call(env,'/api/complaints','POST',{request_id:'sample-request-1',category:'Billing',details:'Meter shows excessive charges',address:'Street 24, Enugu',hazard:true},u.token);
  assert.equal(r.status,422);
 });
 await ok('incomplete coordinates rejected',async()=>{
  const r=await call(env,'/api/complaints','POST',{request_id:'sample-request-2',category:'Outage',details:'Power has gone off for hours',address:'Street 24, Enugu',lat:6.4},u.token);
  assert.equal(r.status,422);
 });
 const p={request_id:'request-0000001',category:'Safety hazard',details:'Reported exposed live electrical infrastructure nearby',address:'Street 24, Enugu',hazard:true,affected:3,lat:6.45,lon:7.51};
 const created=await call(env,'/api/complaints','POST',p,u.token);
 await ok('valid complaint created as Emergency with reference',async()=>{
  assert.equal(created.status,201);assert.equal(created.body.priority,'Emergency');assert.match(created.body.reference,/^PWR-[0-9A-F]+$/);
 });
 const id=created.body.id;
 await ok('request id deduplicates repeated submission',async()=>{
  const r=await call(env,'/api/complaints','POST',p,u.token);
  assert.equal(r.status,200);assert.equal(r.body.duplicate,true);assert.equal(r.body.id,id);
 });
 await ok('consumer cannot create admin status update',async()=>{
  assert.equal((await call(env,`/api/complaints/${id}/action`,'POST',{action:'review'},u.token)).status,403);
 });
 await ok('a second consumer cannot see the complaint',async()=>{
  assert.equal((await call(env,`/api/complaints/${id}`,'GET',undefined,other.token)).status,403);
  assert.equal((await call(env,'/api/complaints','GET',undefined,other.token)).body.length,0);
 });
 await ok('unassigned technician cannot read case',async()=>{assert.equal((await call(env,`/api/complaints/${id}`,'GET',undefined,ag.token)).status,403)});
 await ok('only administrators may review',async()=>{
  const r=await call(env,`/api/complaints/${id}/action`,'POST',{action:'review'},a.token);assert.equal(r.body.status,'reviewed');
 });
 await ok('cannot skip assignment to resolve',async()=>{
  assert.equal((await call(env,`/api/complaints/${id}/action`,'POST',{action:'resolve',note:'Repair completed'},a.token)).status,409)
 });
 await ok('admin assigns authorized agent',async()=>{
  const r=await call(env,`/api/complaints/${id}/action`,'POST',{action:'assign',agent_id:ag.user.id},a.token);assert.equal(r.body.status,'assigned');
 });
 await ok('assigned technician receives the record',async()=>{
  const r=await call(env,`/api/complaints/${id}`,'GET',undefined,ag.token);assert.equal(r.status,200);assert.equal(r.body.assigned_to,ag.user.id);
 });
 await ok('technician starts work',async()=>{
  assert.equal((await call(env,`/api/complaints/${id}/action`,'POST',{action:'start'},ag.token)).body.status,'in_progress');
 });
 await ok('resolution requires a sufficiently detailed work note',async()=>{
  assert.equal((await call(env,`/api/complaints/${id}/action`,'POST',{action:'resolve',note:'short'},ag.token)).status,422);
 });
 await ok('technician resolves test case with note',async()=>{
  assert.equal((await call(env,`/api/complaints/${id}/action`,'POST',{action:'resolve',note:'Synthetic resolution action only'},ag.token)).body.status,'resolved');
 });
 await ok('consumer feedback recorded once per cycle',async()=>{
  assert.equal((await call(env,`/api/complaints/${id}/feedback`,'POST',{rating:5,comment:'Synthetic feedback'},u.token)).status,200);
  assert.equal((await call(env,`/api/complaints/${id}/feedback`,'POST',{rating:5},u.token)).status,409);
 });
 await ok('status audit log follows six state events',async()=>{
  const r=await call(env,`/api/complaints/${id}`,'GET',undefined,u.token);
  assert.deepEqual(r.body.events.map(e=>e.to_status),['received','reviewed','assigned','in_progress','resolved']);
 });
 await ok('consumer reopens resolved case',async()=>{
  const r=await call(env,`/api/complaints/${id}/action`,'POST',{action:'reopen',note:'Issue was not fixed in synthetic scenario'},u.token);
  assert.equal(r.body.status,'reopened');
  assert.equal((await call(env,`/api/complaints/${id}`,'GET',undefined,u.token)).body.cycle,2);
 });
 await ok('technician resumes reopened case',async()=>{
  assert.equal((await call(env,`/api/complaints/${id}/action`,'POST',{action:'resume'},ag.token)).body.status,'in_progress');
 });
 await ok('photo-upload endpoint is not supported',async()=>{
   const form=new FormData();
   form.append('file',new File(['image data'],'image.png',{type:'image/png'}));
   const response=await call(env,`/api/complaints/${id}/evidence`,'POST',form,u.token);
   assert.equal(response.status,404);
 });
 await ok('complaint details contain no image evidence fields',async()=>{
   const response=await call(env,`/api/complaints/${id}`,'GET',undefined,u.token);
   assert.equal(response.status,200);
   assert.equal(Object.hasOwn(response.body,'evidence'),false);
 });
 await ok('statistics are scoped to the current role',async()=>{
  assert.equal((await call(env,'/api/stats','GET',undefined,u.token)).body.total,1);
  assert.equal((await call(env,'/api/stats','GET',undefined,other.token)).body.total,0);
  assert.equal((await call(env,'/api/stats','GET',undefined,a.token)).body.total,1);
 });
 await ok('logout revokes token from persistent sessions',async()=>{
  assert.equal((await call(env,'/api/logout','POST',undefined,u.token)).status,200);
  assert.equal((await call(env,'/api/me','GET',undefined,u.token)).status,401);
 });
 await ok('admin cannot submit consumer complaints',async()=>{
  assert.equal((await call(env,'/api/complaints','POST',p,a.token)).status,403);
 });
 await ok('responses do not expose password hashes',async()=>{
  const r=await call(env,'/api/me','GET',undefined,a.token);assert.equal('pass_hash' in r.body,false);
 });
 await ok('unknown API route returns not found',async()=>{
  assert.equal((await call(env,'/api/not-real','GET',undefined,a.token)).status,404);
 });
});
