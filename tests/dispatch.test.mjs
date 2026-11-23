import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.js';

function fixture() {
  const sqlite=new DatabaseSync(':memory:');
  for(const name of ['0001_initial.sql','0002_specialist_dispatch.sql']){
    sqlite.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  }
  const DB={
    prepare(sql){
      const stmt=sqlite.prepare(sql);let args=[];
      return {
        bind(...x){args=x;return this;},
        async first(){return stmt.get(...args)??null;},
        async all(){return {results:stmt.all(...args)};},
        async run(){const result=stmt.run(...args);return {success:true,meta:{last_row_id:Number(result.lastInsertRowid),changes:Number(result.changes)}};}
      };
    }
  };
  return {DB,sqlite,ASSETS:{fetch:async()=>new Response('PowerResolve')},BOOTSTRAP_KEY:'safe-fixture-bootstrap-key'};
}
async function call(env,path,method='GET',data,token,headers={}){
  const options={method,headers:{...headers}};
  if(token)options.headers.Authorization='Bearer '+token;
  if(data!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(data);}
  const response=await worker.fetch(new Request('https://test.example'+path,options),env);
  return {status:response.status,body:await response.json().catch(()=>null)};
}
async function setup(){
  const env=fixture();
  const first=await call(env,'/api/setup/admin','POST',{alias:'AdminOne',password:'SecretAdmin123!'},null,
    {'X-Bootstrap-Key':env.BOOTSTRAP_KEY});
  assert.equal(first.status,201,JSON.stringify(first.body));
  await call(env,'/api/register','POST',{alias:'CustomerOne',password:'CustomerPass123!'});
  const admin=await call(env,'/api/login','POST',{alias:'AdminOne',password:'SecretAdmin123!'});
  const customer=await call(env,'/api/login','POST',{alias:'CustomerOne',password:'CustomerPass123!'});
  assert.equal(admin.status,200);assert.equal(customer.status,200);
  return {env,admin:admin.body.token,consumer:customer.body.token};
}
async function createStaff(specialty,env,admin,extra={}){
  const name='Staff'+specialty.replace(/[^A-Za-z]/g,'').slice(0,15);
  const result=await call(env,'/api/staff','POST',{
    alias:name,display_name:name+' specialist',specialty,
    max_open_cases:12,...extra
  },admin);
  assert.equal(result.status,201,JSON.stringify(result.body));
  return result.body;
}
async function complain(env,token,category,num){
  return call(env,'/api/complaints','POST',{
    request_id:'route-request-'+num+'-test',category,
    details:'Synthetic electrical service fault record '+num,
    address:'Test Location, Enugu State',affected:5
  },token);
}

test('specialty staff creation is administrator-only, with one-time generated credentials',async()=>{
  const {env,admin,consumer}=await setup();
  assert.equal((await call(env,'/api/staff','GET',undefined,consumer)).status,403);
  assert.equal((await call(env,'/api/staff','POST',{
    alias:'UnauthorizedTech',display_name:'Unauthorized Tech',specialty:'Outage'
  },consumer)).status,403);
  const tech=await createStaff('Meter fault',env,admin,{alias:'MeterPerson01'});
  assert.equal(tech.role,'agent');
  assert.ok(tech.temporary_password?.length>=24);
  assert.equal(tech.specialty,'Meter fault');
  const list=await call(env,'/api/staff','GET',undefined,admin);
  assert.equal(list.status,200);
  assert.equal(list.body[0].display_name,'StaffMeterfault specialist');
  assert.equal(list.body[0].active,true);
  assert.equal(list.body[0].open_cases,0);
  const signed=await call(env,'/api/login','POST',{alias:'MeterPerson01',password:tech.temporary_password});
  assert.equal(signed.status,200);
  assert.equal(signed.body.user.role,'agent');
});

test('automatic routing assigns by specialty, retains pending when there is no suitable staff',async()=>{
  const {env,admin,consumer}=await setup();
  const tech=await createStaff('Outage',env,admin);
  const outage=await complain(env,consumer,'Outage',1);
  assert.equal(outage.status,201,JSON.stringify(outage.body));
  assert.equal(outage.body.auto_assigned,true);
  assert.equal(outage.body.assigned_to,tech.id);
  assert.equal(outage.body.status,'assigned');
  const billing=await complain(env,consumer,'Billing',2);
  assert.equal(billing.status,201);
  assert.equal(billing.body.auto_assigned,false);
  assert.equal(billing.body.status,'received');
  const overview=await call(env,'/api/dispatch/overview','GET',undefined,admin);
  assert.equal(overview.status,200);
  assert.equal(overview.body.pending_total,1);
  assert.equal(overview.body.active_staff,1);
  const detail=await call(env,'/api/complaints/'+outage.body.id,'GET',undefined,consumer);
  assert.deepEqual(detail.body.events.map(e=>e.to_status),['received','assigned']);
  assert.match(detail.body.events[1].note,/Automatically assigned/);
  const team=await call(env,'/api/staff','GET',undefined,admin);
  assert.equal(team.body[0].open_cases,1);
});

test('backlog is allocated when the correct specialist joins or is activated',async()=>{
  const {env,admin,consumer}=await setup();
  const c1=await complain(env,consumer,'Transformer fault',11);
  assert.equal(c1.body.status,'received');
  const added=await createStaff('Transformer fault',env,admin,{active:false});
  assert.equal(added.active,false);
  const blocked=await call(env,'/api/login','POST',{alias:added.alias,password:added.temporary_password});
  assert.equal(blocked.status,403);
  const state=await call(env,'/api/complaints/'+c1.body.id,'GET',undefined,consumer);
  assert.equal(state.body.status,'received');
  const enable=await call(env,'/api/staff/'+added.id,'PATCH',{active:true},admin);
  assert.equal(enable.status,200,JSON.stringify(enable.body));
  assert.equal(enable.body.backlog_assigned,1);
  const updated=await call(env,'/api/complaints/'+c1.body.id,'GET',undefined,consumer);
  assert.equal(updated.body.status,'assigned');
  assert.equal(updated.body.assigned_to,added.id);
});

test('per-staff capacity prevents overload and resolution releases the next slot',async()=>{
  const {env,admin,consumer}=await setup();
  const a=await createStaff('Billing',env,admin,{alias:'BillingStaffA',max_open_cases:1});
  const b=await createStaff('Billing',env,admin,{alias:'BillingStaffB',max_open_cases:1});
  const first=await complain(env,consumer,'Billing',21);
  const second=await complain(env,consumer,'Billing',22);
  const third=await complain(env,consumer,'Billing',23);
  assert.equal(first.body.assigned_to,a.id);
  assert.equal(second.body.assigned_to,b.id);
  assert.equal(third.body.status,'received');
  assert.equal((await call(env,'/api/dispatch/overview','GET',undefined,admin)).body.pending_total,1);
  const login=await call(env,'/api/login','POST',{alias:a.alias,password:a.temporary_password});
  assert.equal(login.status,200);
  const token=login.body.token;
  assert.equal((await call(env,'/api/complaints/'+first.body.id+'/action','POST',{action:'start'},token)).body.status,'in_progress');
  assert.equal((await call(env,'/api/complaints/'+first.body.id+'/action','POST',{action:'resolve',note:'Work completed in synthetic test'},token)).body.status,'resolved');
  const pending=await call(env,'/api/complaints/'+third.body.id,'GET',undefined,consumer);
  assert.equal(pending.body.status,'assigned');
  assert.equal(pending.body.assigned_to,a.id);
});

test('manual reassignment is audited and cannot target an unrelated specialty',async()=>{
  const {env,admin,consumer}=await setup();
  const left=await createStaff('Meter fault',env,admin,{alias:'MeterStaffA'});
  const right=await createStaff('Meter fault',env,admin,{alias:'MeterStaffB'});
  const wrong=await createStaff('Outage',env,admin,{alias:'OutageStaffC'});
  const c=await complain(env,consumer,'Meter fault',31);
  assert.equal(c.body.assigned_to,left.id);
  assert.equal((await call(env,'/api/complaints/'+c.body.id+'/reassign','POST',{agent_id:wrong.id},admin)).status,422);
  assert.equal((await call(env,'/api/complaints/'+c.body.id+'/reassign','POST',{agent_id:right.id},consumer)).status,403);
  const transfer=await call(env,'/api/complaints/'+c.body.id+'/reassign','POST',{agent_id:right.id},admin);
  assert.equal(transfer.status,200,JSON.stringify(transfer.body));
  const detail=await call(env,'/api/complaints/'+c.body.id,'GET',undefined,consumer);
  assert.equal(detail.body.assigned_to,right.id);
  assert.equal(detail.body.events.at(-1).to_status,'assigned');
  assert.match(detail.body.events.at(-1).note,/Administrator reassigned/);
});

test('administrator can safely seed inactive specialist accounts without fixed passwords',async()=>{
  const {env,admin,consumer}=await setup();
  assert.equal((await call(env,'/api/staff/starter-accounts','POST',{},consumer)).status,403);
  const result=await call(env,'/api/staff/starter-accounts','POST',{},admin);
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.created,6);
  const created=result.body.staff;
  assert.equal(new Set(created.map(x=>x.specialty)).size,6);
  assert.equal(new Set(created.map(x=>x.temporary_password)).size,6);
  assert.ok(created.every(x=>!x.active));
  const repeat=await call(env,'/api/staff/starter-accounts','POST',{},admin);
  assert.equal(repeat.body.created,0);
});

test('deactivating an available technician requeues untouched cases, not in-progress work',async()=>{
  const {env,admin,consumer}=await setup();
  const a=await createStaff('Safety hazard',env,admin,{alias:'SafetyActiveA'});
  const c=await complain(env,consumer,'Safety hazard',41);
  assert.equal(c.body.assigned_to,a.id);
  const update=await call(env,'/api/staff/'+a.id,'PATCH',{active:false},admin);
  assert.equal(update.status,200,JSON.stringify(update.body));
  const detail=await call(env,'/api/complaints/'+c.body.id,'GET',undefined,consumer);
  assert.equal(detail.body.status,'received');
  assert.equal(detail.body.assigned_to,null);
  const second=await call(env,'/api/staff','POST',{alias:'SafetyActiveB',
    display_name:'Second safety technician',specialty:'Safety hazard'},admin);
  assert.equal(second.status,201);
  assert.equal(second.body.backlog_assigned,1);
  const rechecked=await call(env,'/api/complaints/'+c.body.id,'GET',undefined,consumer);
  assert.equal(rechecked.body.assigned_to,second.body.id);
});
