/* PowerResolve operations console. Functions share the existing protected API client.
 * Every staff mutation is authorized by the server, never by a browser role check.
 * Account passwords are not persisted in browser storage or activity records.
 */
function adminDashboard(stats,cases,overview,staff){
  const pending=cases.filter(c=>!c.assigned_to&&['received','reviewed'].includes(c.status));
  const active=staff.filter(s=>s.active).length;
  const alert=overview.pending_total
    ? '<span class="ops-flag">'+overview.pending_total+' awaiting technician</span>'
    : '<span class="ops-ready">All received complaints routed</span>';
  return `<div class="eyebrow">ADMINISTRATOR / OPERATIONS</div>
    <div class="ops-heading"><div><h1>Complaint operations</h1>
      <p class="sub">One workspace for incoming reports, specialist staff and accountable case assignments.</p></div>
      <button class="action secondary" onclick="navTo('team')">Manage staff</button></div>
    <div class="stats ops-stats">
      <div class="stat"><label>Total registered cases</label><strong>${stats.total}</strong><em>All complaint statuses</em></div>
      <div class="stat"><label>Needs assignment</label><strong>${overview.pending_total}</strong><em>Specialist queue</em></div>
      <div class="stat"><label>Active technicians</label><strong>${active}</strong><em>${staff.length} staff accounts</em></div>
      <div class="stat"><label>Emergency priorities</label><strong>${stats.emergency}</strong><em>Require immediate attention</em></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Automatic assignment</h2>
        <p class="sub">Complaints match an active technician with the correct specialty and available capacity.</p></div>
        ${alert}</div>
      <div class="ops-toolbar">
        <button class="action" onclick="runDispatch()">Assign queued complaints</button>
        <button class="action outline" onclick="navTo('team')">View specialties & capacity</button>
      </div>
      <div class="ops-category-grid">${CATS.map(c=>{
        const total=overview.pending.filter(p=>p.category===c).reduce((n,p)=>n+p.total,0);
        const matching=staff.filter(s=>s.active&&s.specialty===c).length;
        return `<div class="ops-category"><span>${esc(c)}</span><strong>${total} queued</strong>
          <small>${matching} active specialist${matching===1?'':'s'}</small></div>`
      }).join('')}</div>
      <p class="smallnote">Assignment is recorded within PowerResolve. It does not notify an external electricity provider or dispatch a real field crew.</p>
    </div>
    <div class="two-col"><div class="panel">
      <div class="panel-head"><h2>Unassigned complaints</h2>
        <button class="textbtn" onclick="navTo('complaints')">All complaints</button></div>
      ${pending.length?pending.slice(0,9).map(c=>`<div class="list-card">
        <div><div class="case-title">${esc(c.category)} · ${esc(c.reference)}</div>
          <div class="case-meta">${esc(c.address)} · ${fmtDate(c.created_at)}</div></div>
        <div>${priPill(c.priority)} <button class="textbtn" onclick="openCase(${c.id})">Review</button></div>
      </div>`).join(''):'<p class="sub">No unassigned cases in the most recent records.</p>'}
      ${overview.pending_total>pending.length?'<p class="smallnote">Additional queued cases exist outside the current page of results.</p>':''}
    </div><div class="panel">
      <h2>Team workload</h2>
      ${staff.length?staff.slice(0,10).map(s=>`<div class="ops-person">
        <div><strong>${esc(s.display_name||s.alias)}</strong>
          <span>${esc(s.specialty||'Specialty not set')} · ${s.active?'Active':'Inactive'}</span></div>
        <b>${s.open_cases||0}${s.max_open_cases?'/'+s.max_open_cases:''}</b>
      </div>`).join(''):'<p class="sub">No technician accounts yet. Create specialist accounts on the Staff page.</p>'}
      <button class="action secondary" onclick="navTo('team')">Open staff directory</button>
    </div></div>`;
}
function staffPage(staff,overview){
  const active=staff.filter(x=>x.active).length;
  return `<div class="eyebrow">ADMINISTRATOR / STAFF DIRECTORY</div>
    <div class="ops-heading"><div><h1>Staff & specializations</h1>
      <p class="sub">Create individual technician accounts, define their specialty, and control availability and workload.</p>
    </div><button class="action outline" onclick="navTo('dashboard')">Operations overview</button></div>
    <div class="stats ops-stats">
      <div class="stat"><label>Total staff accounts</label><strong>${staff.length}</strong><em>Technician role only</em></div>
      <div class="stat"><label>Active staff</label><strong>${active}</strong><em>Eligible for matching</em></div>
      <div class="stat"><label>Pending cases</label><strong>${overview.pending_total}</strong><em>Awaiting available specialist</em></div>
      <div class="stat"><label>Specialties covered</label><strong>${new Set(staff.filter(x=>x.active).map(x=>x.specialty)).size}</strong><em>Of ${CATS.length} categories</em></div>
    </div>
    <div class="two-col ops-management"><div class="panel">
      <h2>Create a staff account</h2>
      <p class="sub">Use verified staff identities only. A secure password will be generated if you leave the password field blank.</p>
      <form id="staffCreateForm" onsubmit="manageCreateStaff(event)">
        <div class="field"><label for="staffDisplayName">Staff name</label>
          <input id="staffDisplayName" required minlength="3" maxlength="90" autocomplete="off" placeholder="e.g. Chika Okafor"/></div>
        <div class="field"><label for="staffAlias">Sign-in username</label>
          <input id="staffAlias" required minlength="3" maxlength="32" autocomplete="off" pattern="[A-Za-z][A-Za-z0-9_-]{2,31}" placeholder="e.g. MeterTech01"/></div>
        <div class="field"><label for="staffSpecialty">Technical specialty</label>
          <select id="staffSpecialty">${CATS.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label for="staffCapacity">Maximum active complaints</label>
          <input id="staffCapacity" type="number" min="1" max="100" value="12" required/></div>
        <div class="field"><label for="staffPassword">Temporary password (optional)</label>
          <input id="staffPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="Automatically generated if blank"/></div>
        <label class="ops-check"><input id="staffActive" type="checkbox" checked/> Enable automatic assignment for this staff member</label>
        <button class="action" style="width:100%" type="submit">Create staff account</button>
      </form>
      <hr class="ops-divider"/>
      <h3>Initialize specialty accounts</h3>
      <p class="smallnote">Create inactive starter accounts for missing specialties. Each receives a random one-time password. Activate only after a real technician has accepted the credentials.</p>
      <button class="action secondary" onclick="createStarterStaff()">Generate starter accounts</button>
      <div id="issuedCredentials" role="status" aria-live="polite"></div>
    </div><div class="panel">
      <div class="panel-head"><h2>Technician directory</h2><span class="smallnote">${staff.length} accounts</span></div>
      ${staff.length?staff.map(s=>`<form class="ops-staff-card" id="staffRecord-${s.id}" onsubmit="manageUpdateStaff(event,${s.id})">
        <div class="ops-person"><div><strong>${esc(s.display_name||s.alias)}</strong>
          <span>@${esc(s.alias)} · ${s.active?'Available':'Inactive'}</span></div>
          <span class="${s.active?'ops-ready':'ops-flag'}">${s.open_cases||0}${s.max_open_cases?'/'+s.max_open_cases:''} open</span></div>
        <div class="field"><label for="staffName-${s.id}">Staff name</label>
          <input id="staffName-${s.id}" value="${esc(s.display_name||s.alias)}" minlength="3" maxlength="90" required/></div>
        <div class="grid2"><div class="field"><label for="staffSpec-${s.id}">Specialty</label>
          <select id="staffSpec-${s.id}">${CATS.map(c=>`<option value="${esc(c)}" ${s.specialty===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
          <div class="field"><label for="staffMax-${s.id}">Case limit</label>
          <input id="staffMax-${s.id}" type="number" value="${s.max_open_cases||12}" min="1" max="100" required/></div></div>
        <label class="ops-check"><input type="checkbox" id="staffEnabled-${s.id}" ${s.active?'checked':''}/> Active and assignable</label>
        <button class="action outline" type="submit">Save staff changes</button>
      </form>`).join(''):'<p class="sub">There are no technician accounts yet.</p>'}
    </div></div>`;
}
function showStaffCredentials(issued){
  const box=document.getElementById('issuedCredentials');
  if(!box||!issued.length)return;
  box.innerHTML=`<div class="ops-credentials"><strong>Save these credentials securely now</strong>
    <p class="smallnote">Passwords are only displayed once and are not stored in the browser.</p>
    ${issued.map(item=>`<div class="ops-credential"><span>${esc(item.alias)}<small>${esc(item.specialty)}</small></span>
      <code>${esc(item.temporary_password||'Password supplied by administrator')}</code></div>`).join('')}</div>`;
}
async function manageCreateStaff(event){
  event.preventDefault();
  const button=event.submitter;if(button)button.disabled=true;
  try{
    const payload={
      alias:document.getElementById('staffAlias').value.trim(),
      display_name:document.getElementById('staffDisplayName').value.trim(),
      specialty:document.getElementById('staffSpecialty').value,
      max_open_cases:Number(document.getElementById('staffCapacity').value),
      active:document.getElementById('staffActive').checked
    };
    const pass=document.getElementById('staffPassword').value;
    if(pass)payload.password=pass;
    const created=await api('/staff','POST',payload);
    await render();
    showStaffCredentials([created]);
    alertMsg('Staff account created. '+created.backlog_assigned+' queued cases assigned.');
  }catch(e){alertMsg(e.message,true)}
  finally{if(button&&button.isConnected)button.disabled=false}
}
async function createStarterStaff(){
  if(!confirm('Create inactive accounts for the missing specialties? Credentials are displayed once to the administrator.'))return;
  try{
    const result=await api('/staff/starter-accounts','POST',{});
    await render();
    showStaffCredentials(result.staff.filter(s=>!s.skipped));
    alertMsg(result.created+' inactive specialist accounts created.');
  }catch(e){alertMsg(e.message,true)}
}
async function manageUpdateStaff(event,id){
  event.preventDefault();
  const button=event.submitter;if(button)button.disabled=true;
  try{
    const result=await api('/staff/'+id,'PATCH',{
      display_name:document.getElementById('staffName-'+id).value.trim(),
      specialty:document.getElementById('staffSpec-'+id).value,
      max_open_cases:Number(document.getElementById('staffMax-'+id).value),
      active:document.getElementById('staffEnabled-'+id).checked
    });
    await render();
    alertMsg('Staff updated. '+result.backlog_assigned+' queued cases assigned.');
  }catch(e){alertMsg(e.message,true)}
  finally{if(button&&button.isConnected)button.disabled=false}
}
async function runDispatch(){
  try{
    const result=await api('/dispatch/run','POST',{});
    await render();
    alertMsg('Checked '+result.examined+' pending cases; assigned '+result.assigned+'.');
  }catch(e){alertMsg(e.message,true)}
}
async function reassignCase(id){
  const select=document.getElementById('agentPick');
  if(!select?.value)return alertMsg('Choose an active matching technician.',true);
  try{
    await api('/complaints/'+id+'/reassign','POST',{agent_id:Number(select.value)});
    await render();alertMsg('Case successfully reassigned.');
  }catch(e){alertMsg(e.message,true)}
}
