/**
 * Specialty matching, capacity-aware dispatch and audit-safe state transitions.
 * Cases without an eligible active staff member stay visible to admins in the
 * pending queue. Assignment is an application record, not real-world dispatch.
 */
export const SPECIALTIES = Object.freeze([
  'Outage', 'Meter fault', 'Billing', 'Safety hazard',
  'Voltage fluctuation', 'Transformer fault'
]);
const OPEN_STATUSES = "'assigned','in_progress','reopened'";

export async function eligibleStaff(env, specialty) {
  if (!SPECIALTIES.includes(specialty)) return [];
  const {results}=await env.DB.prepare(`
    SELECT p.user_id AS id, u.alias, p.display_name, p.specialty, p.max_open_cases,
      (SELECT COUNT(*) FROM complaints c
       WHERE c.assigned_to=p.user_id AND c.status IN (${OPEN_STATUSES})) AS open_cases
    FROM staff_profiles p JOIN users u ON u.id=p.user_id
    WHERE u.role='agent' AND p.active=1 AND p.specialty=?
    ORDER BY open_cases ASC, p.user_id ASC
  `).bind(specialty).all();
  return results.filter(s=>s.open_cases<s.max_open_cases);
}

/**
 * The capacity check is repeated in the conditional UPDATE so simultaneous
 * submissions cannot both consume the final technician slot.
 */
export async function assignCase(env, complaintId, specialty) {
  const staff=await eligibleStaff(env,specialty);
  for (const p of staff) {
    const ts=new Date().toISOString();
    const changed=await env.DB.prepare(`
      UPDATE complaints SET
        status='assigned', assigned_to=?, assigned_at=?, updated_at=?,
        updated_by=NULL, last_note=?
      WHERE id=? AND status IN ('received','reviewed') AND assigned_to IS NULL
        AND category=?
        AND EXISTS (
          SELECT 1 FROM staff_profiles sp JOIN users u ON u.id=sp.user_id
          WHERE sp.user_id=? AND sp.active=1 AND sp.specialty=?
            AND u.role='agent'
            AND (SELECT COUNT(*) FROM complaints active
                 WHERE active.assigned_to=sp.user_id
                 AND active.status IN (${OPEN_STATUSES})) < sp.max_open_cases
        )
      RETURNING id
    `).bind(
      p.id,ts,ts,'Automatically assigned to '+p.alias+' ('+specialty+')',
      complaintId,specialty,p.id,specialty
    ).first();
    if (changed) return {assigned:true,staff_id:p.id,staff_alias:p.alias,status:'assigned'};
  }
  return {assigned:false,staff_id:null,status:'received'};
}

export async function assignPending(env, specialty=null, limit=60) {
  const cap=Math.max(1,Math.min(150,Math.trunc(limit)||60));
  const query=`
    SELECT id,category FROM complaints
    WHERE assigned_to IS NULL AND status IN ('received','reviewed')
    ${specialty ? 'AND category=?' : ''}
    ORDER BY CASE priority WHEN 'Emergency' THEN 0 WHEN 'High' THEN 1 ELSE 2 END,
             created_at ASC, id ASC
    LIMIT ?
  `;
  const q=env.DB.prepare(query);
  const rows=(await (specialty ? q.bind(specialty,cap):q.bind(cap)).all()).results;
  const assigned=[];
  for(const c of rows) {
    const r=await assignCase(env,c.id,c.category);
    if(r.assigned)assigned.push({complaint_id:c.id,staff_id:r.staff_id});
  }
  return {examined:rows.length,assigned:assigned.length,pending:rows.length-assigned.length,assignments:assigned};
}
