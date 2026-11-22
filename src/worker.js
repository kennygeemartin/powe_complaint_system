/**
 * PowerResolve Cloudflare Workers + D1 implementation.
 * This is a research demonstration, not an integrated electricity utility dispatch service.
 * Real incidents must be reported through official channels.
 */
const CATEGORIES = new Set(['Outage','Meter fault','Billing','Safety hazard','Voltage fluctuation','Transformer fault']);
const STATUS = {
  review:['received','reviewed'], assign:['reviewed','assigned'],
  start:['assigned','in_progress'], resolve:['in_progress','resolved'],
  close:['resolved','closed'], reopen:['resolved','reopened'],
  resume:['reopened','in_progress']
};
// Cloudflare workerd rejects PBKDF2 iteration counts > 100,000 in production.
// Keep this same value for account creation and authentication. Existing passwords
// must not be silently re-hashed with a different iteration count.
const PBKDF2_ITERATIONS = 100000;
const enc = new TextEncoder();
const now = () => new Date().toISOString();
const isoLater = days => new Date(Date.now()+days*86400_000).toISOString();
const hex = array => Array.from(new Uint8Array(array),b=>b.toString(16).padStart(2,'0')).join('');
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const fail = (status, detail) => {throw Object.assign(new Error(detail),{httpStatus:status})};
const json = (value,status=200,extra={}) => new Response(JSON.stringify(value),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}
});
const clean = value => typeof value==='string' ? value.trim() : '';
const sha256 = async str => hex(await crypto.subtle.digest('SHA-256',enc.encode(str)));
async function passwordHash(password,salt) {
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:PBKDF2_ITERATIONS,hash:'SHA-256'},key,256));
}
async function secretEqual(a,b) {
  if(typeof a!=='string'||typeof b!=='string')return false;
  // Fixed-length SHA256 comparison avoids comparing attacker-selected length values.
  const [x,y]=await Promise.all([sha256(a),sha256(b)]);
  let difference=0;for(let i=0;i<x.length;i++)difference|=(x.charCodeAt(i)^y.charCodeAt(i));
  return difference===0;
}
async function readJSON(req) {
  if(!req.headers.get('content-type')?.toLowerCase().includes('application/json'))fail(415,'Expected JSON body');
  const text=await req.text();if(text.length>10000)fail(413,'Payload is too large');
  try {const obj=JSON.parse(text);if(!obj||typeof obj!=='object'||Array.isArray(obj))fail(422,'Expected an object');return obj;}
  catch(e){if(e.httpStatus)throw e;fail(400,'Invalid JSON document')}
}
function authFields(x){
  const alias=clean(x.alias),password=x.password;
  if(!/^[A-Za-z][A-Za-z0-9_-]{2,31}$/.test(alias))fail(422,'Alias must be 3–32 letters, numbers, dashes or underscores');
  if(typeof password!=='string'||password.length<8||password.length>128)fail(422,'Password must have 8–128 characters');
  return {alias,password};
}
async function addUser(env,alias,password,role='consumer'){
  const salt=randomHex(16),passHash=await passwordHash(password,salt);
  try {
    const r=await env.DB.prepare('INSERT INTO users(alias,pass_hash,salt,role,area) VALUES (?,?,?,?,?)')
      .bind(alias,passHash,salt,role,'Enugu').run();
    return r.meta.last_row_id;
  }catch(e){if(/UNIQUE|constraint/i.test(e.message))fail(409,'Alias already registered');throw e}
}
async function actor(req,env){
  const bearer=req.headers.get('authorization')||'';
  if(!bearer.startsWith('Bearer ')||bearer.length<16)fail(401,'Authentication required');
  const tokenHash=await sha256(bearer.slice(7));
  const user=await env.DB.prepare(`SELECT u.id,u.alias,u.role,u.area FROM users u
    JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`)
    .bind(tokenHash,now()).first();
  if(!user)fail(401,'Invalid or expired session');return user;
}
function rolecheck(a,roles){if(!roles.includes(a.role))fail(403,'Role not permitted')}
function access(a,c){
  if(a.role==='admin'||(a.role==='consumer'&&c.owner_id===a.id)||(a.role==='agent'&&c.assigned_to===a.id))return;
  fail(403,'Complaint belongs to a different account or agent');
}
function priority(category,hazard,affected){
  return (hazard||category==='Safety hazard')?'Emergency':
    (['Outage','Transformer fault','Voltage fluctuation'].includes(category)&&affected>=25?'High':'Routine');
}
function ensureInt(n,min,max,name){
  if(!Number.isInteger(n)||n<min||n>max)fail(422,`${name} must be an integer from ${min} to ${max}`);return n;
}
async function getCase(env,id){const c=await env.DB.prepare('SELECT * FROM complaints WHERE id=?').bind(id).first();if(!c)fail(404,'Complaint not found');return c}
async function route(req,env){
  const {pathname}=new URL(req.url),method=req.method;
  if(pathname==='/api/health'&&method==='GET'){
    if(!env.DB)fail(503,'Database binding unavailable');
    try {await env.DB.prepare('SELECT COUNT(*) AS total FROM users').first()}
    catch(e){console.error('D1 schema check failed',e?.message||'Unknown D1 error');fail(503,'Database not initialized. Apply the D1 migrations.')}
    return json({status:'ok',service:'PowerResolve Cloudflare demo',release:'auth-workers-pbkdf2-fix',timestamp:now()});
  }
  if(pathname==='/api/register'&&method==='POST'){
    const {alias,password}=authFields(await readJSON(req));return json({user_id:await addUser(env,alias,password)},200);
  }
  if(pathname==='/api/setup/admin'&&method==='POST'){
    if(!env.BOOTSTRAP_KEY)fail(404,'Admin setup disabled');
    if(!await secretEqual(req.headers.get('x-bootstrap-key'),env.BOOTSTRAP_KEY))fail(403,'Admin setup not authorized');
    const existing=await env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();
    if(existing)fail(409,'Admin already provisioned');
    const {alias,password}=authFields(await readJSON(req));
    return json({user_id:await addUser(env,alias,password,'admin'),message:'First administrator provisioned'},201);
  }
  if(pathname==='/api/login'&&method==='POST'){
    const x=await readJSON(req),alias=clean(x.alias);
    if(typeof x.password!=='string')fail(401,'Incorrect credentials');
    const u=await env.DB.prepare('SELECT * FROM users WHERE alias=?').bind(alias).first();
    if(!u||!await secretEqual(await passwordHash(x.password,u.salt),u.pass_hash))fail(401,'Incorrect credentials');
    const token=randomHex(32);
    await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,created,expires_at) VALUES (?,?,?,?)')
      .bind(await sha256(token),u.id,now(),isoLater(7)).run();
    return json({token,user:{id:u.id,alias:u.alias,role:u.role,area:u.area}});
  }
  if(pathname==='/api/logout'&&method==='POST'){
    const a=await actor(req,env);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=? AND user_id=?')
      .bind(await sha256(req.headers.get('authorization').slice(7)),a.id).run();
    return json({logged_out:true});
  }
  const a=await actor(req,env);
  if(pathname==='/api/me'&&method==='GET')return json(a);
  if(pathname==='/api/agents'&&method==='GET'){
    rolecheck(a,['admin']);
    const {results}=await env.DB.prepare("SELECT id,alias,area FROM users WHERE role='agent' ORDER BY alias").all();return json(results);
  }
  if(pathname==='/api/agents'&&method==='POST'){
    rolecheck(a,['admin']);
    const {alias,password}=authFields(await readJSON(req));
    const user_id=await addUser(env,alias,password,'agent');
    return json({user_id,alias,role:'agent'},201);
  }
  if(pathname==='/api/complaints'&&method==='POST'){
    rolecheck(a,['consumer']); const x=await readJSON(req);
    if(typeof x.request_id!=='string'||x.request_id.length<8||x.request_id.length>90)fail(422,'Invalid request identifier');
    if(!CATEGORIES.has(x.category))fail(422,'Unknown complaint category');
    const details=clean(x.details),address=clean(x.address);
    if(details.length<10||details.length>1200)fail(422,'Details must contain 10–1200 characters');
    if(address.length<6||address.length>250)fail(422,'Address must contain 6–250 characters');
    const affected=ensureInt(x.affected??1,1,100000,'Affected consumers');
    const hazard=x.hazard===true;
    if(hazard&&x.category==='Billing')fail(422,'Hazard indicator requires a technical category');
    const lat=x.lat??null,lon=x.lon??null;
    if((lat===null)!==(lon===null))fail(422,'Both coordinates are required');
    if(lat!==null && (typeof lat!=='number'||!Number.isFinite(lat)||lat< -90||lat>90||typeof lon!=='number'||!Number.isFinite(lon)||lon< -180||lon>180))fail(422,'Invalid coordinates');
    const old=await env.DB.prepare('SELECT id,reference FROM complaints WHERE owner_id=? AND request_id=?').bind(a.id,x.request_id).first();
    if(old)return json({id:old.id,reference:old.reference,duplicate:true});
    const ts=now(),pr=priority(x.category,hazard,affected),ref='PWR-'+randomHex(6).toUpperCase();
    try{
      const result=await env.DB.prepare(`INSERT INTO complaints
        (reference,owner_id,request_id,category,details,address,lat,lon,hazard,affected,priority,status,created_at,updated_at,updated_by,last_note)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,'received',?,?,?,?)`)
        .bind(ref,a.id,x.request_id,x.category,details,address,lat,lon,hazard?1:0,affected,pr,ts,ts,a.id,'Complaint submitted').run();
      return json({id:result.meta.last_row_id,reference:ref,priority:pr,status:'received',duplicate:false},201);
    }catch(e){
      if(/UNIQUE|constraint/i.test(e.message)){
        const duplicate=await env.DB.prepare('SELECT id,reference FROM complaints WHERE owner_id=? AND request_id=?').bind(a.id,x.request_id).first();
        if(duplicate)return json({id:duplicate.id,reference:duplicate.reference,duplicate:true});
        fail(409,'Duplicate complaint reference; retry safely');
      }throw e;
    }
  }
  if(pathname==='/api/complaints'&&method==='GET'){
    let sql=`SELECT c.*,u.alias AS consumer,ag.alias AS agent FROM complaints c
      JOIN users u ON u.id=c.owner_id LEFT JOIN users ag ON ag.id=c.assigned_to`;
    if(a.role==='consumer')sql+=' WHERE c.owner_id=?';
    else if(a.role==='agent')sql+=' WHERE c.assigned_to=?';
    sql+=' ORDER BY c.id DESC LIMIT 1000';
    const q=env.DB.prepare(sql),r=await (a.role==='admin'?q:q.bind(a.id)).all();return json(r.results);
  }
  if(pathname==='/api/stats'&&method==='GET'){
    let sql='SELECT status,priority FROM complaints',b=[];
    if(a.role==='consumer'){sql+=' WHERE owner_id=?';b=[a.id]}
    if(a.role==='agent'){sql+=' WHERE assigned_to=?';b=[a.id]}
    const {results}=await env.DB.prepare(sql).bind(...b).all(),counts={};
    for(const r of results)counts[r.status]=(counts[r.status]||0)+1;
    return json({total:results.length,by_status:counts,emergency:results.filter(r=>r.priority==='Emergency').length,
      high:results.filter(r=>r.priority==='High').length,resolved:results.filter(r=>['resolved','closed'].includes(r.status)).length});
  }
  const caseMatch=pathname.match(/^\/api\/complaints\/(\d+)(?:\/(action|feedback))?$/);
  if(caseMatch){
    const id=Number(caseMatch[1]),sub=caseMatch[2]||'',c=await getCase(env,id);access(a,c);
    if(!sub&&method==='GET'){
      const [events,feedback]=await Promise.all([
        env.DB.prepare(`SELECT e.*,u.alias AS actor FROM events e LEFT JOIN users u ON e.actor_id=u.id WHERE e.complaint_id=? ORDER BY e.id`).bind(id).all(),
        env.DB.prepare('SELECT id,complaint_id,cycle,rating,comment,submitted_at FROM feedback WHERE complaint_id=?').bind(id).all()
      ]);
      return json({...c,events:events.results,feedback:feedback.results});
    }
    if(sub==='action'&&method==='POST'){
      const x=await readJSON(req),rule=STATUS[x.action];
      if(!rule)fail(422,'Unknown action');
      const [from,to]=rule;
      if(c.status!==from)fail(409,`Invalid transition from ${c.status} by ${x.action}`);
      const expectedRoles=({review:['admin'],assign:['admin'],close:['admin'],
        start:['agent'],resolve:['agent'],resume:['agent'],reopen:['consumer']})[x.action];
      rolecheck(a,expectedRoles);
      const note=clean(x.note);
      if(['resolve','reopen'].includes(x.action)&&note.length<8)fail(422,`${x.action} note must contain at least 8 characters`);
      let agent=c.assigned_to;
      if(x.action==='assign'){
        agent=ensureInt(x.agent_id,1,2147483647,'Agent ID');
        if(!await env.DB.prepare("SELECT id FROM users WHERE id=? AND role='agent'").bind(agent).first())fail(422,'Assigned user is not a technician');
      }
      const ts=now(),timeCol=({review:'reviewed_at',assign:'assigned_at',start:'started_at',resolve:'resolved_at',close:'closed_at'})[x.action];
      // Conditional UPDATE preserves legal transitions under concurrent requests. D1 trigger handles the event log.
      let sql='UPDATE complaints SET status=?,updated_at=?,updated_by=?,last_note=?,assigned_to=?',params=[to,ts,a.id,note,agent];
      if(timeCol){sql+=`,${timeCol}=?`;params.push(ts)}
      if(x.action==='reopen')sql+=',cycle=cycle+1,resolved_at=NULL';
      sql+=' WHERE id=? AND status=? RETURNING id,status';params.push(id,from);
      const changed=await env.DB.prepare(sql).bind(...params).first();
      if(!changed)fail(409,'Case status changed; refresh and retry');
      return json({id,from_status:from,status:to,timestamp:ts});
    }
    if(sub==='feedback'&&method==='POST'){
      rolecheck(a,['consumer']);const x=await readJSON(req);
      if(c.status!=='resolved')fail(409,'Feedback is only accepted after resolution');
      const rating=ensureInt(x.rating,1,5,'Feedback rating');
      try{await env.DB.prepare('INSERT INTO feedback(complaint_id,owner_id,cycle,rating,comment,submitted_at) VALUES (?,?,?,?,?,?)')
        .bind(id,a.id,c.cycle,rating,clean(x.comment).slice(0,500),now()).run();}
      catch(e){if(/UNIQUE|constraint/i.test(e.message))fail(409,'Feedback already submitted for this resolution cycle');throw e}
      return json({saved:true});
    }

  }
  fail(404,'Unknown API route');
}
export default {
 async fetch(req,env){
   const path=new URL(req.url).pathname;
   if(!path.startsWith('/api/')){
     if(!env.ASSETS)return new Response('Static assets not configured',{status:503});
     return env.ASSETS.fetch(req);
   }
   try {return await route(req,env)}
   catch(e){
     if(e.httpStatus)return json({detail:e.message},e.httpStatus);
     console.error('PowerResolve server error',e?.message||'Unknown error');
     return json({detail:'Internal server error'},500);
   }
 }
};
