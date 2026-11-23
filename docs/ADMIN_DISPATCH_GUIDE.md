# PowerResolve — Administrator and Specialist Dispatch Guide

## Scope and entry point

**Administrator login:** `https://powe-complaint-system.powerresolve.workers.dev/admin`

PowerResolve uses one authenticated sign-in system. Server-side account roles determine which workspace opens:
- **Administrator:** Operations overview, all complaint cases, specialist staff directory, queue reconciliation, assignment and transfers.
- **Technician:** Only complaints assigned to that technician, action notes, and permitted status updates.
- **Consumer:** Their own reports, tracking, reopening, and feedback.

Staff and administrator accounts **must not** be created through public consumer registration. To provision the first administrator, use the existing `BOOTSTRAP_KEY`-protected `POST /api/setup/admin` flow. No public default admin credentials or universal technician passwords are included in the project. An account already provisioned as admin continues to work.

## Specialties and routing

New D1 migration: `0002_specialist_dispatch.sql`. It adds `staff_profiles` linked to existing agent users, with a legal specialty, active flag, and maximum assigned workload. Existing complaints and account passwords are preserved.

| Complaint category | Matching technician specialty |
|---|---|
| Outage | Outage |
| Meter fault | Meter fault |
| Billing | Billing |
| Safety hazard | Safety hazard |
| Voltage fluctuation | Voltage fluctuation |
| Transformer fault | Transformer fault |

A new complaint is first saved with its unique reference and initial audit event. The dispatch algorithm then selects **only active technicians** with the matching specialty and spare capacity. Among eligible staff, it picks the lowest current number of assigned/in-progress/reopened cases and uses staff ID to break ties. The assignment is made by a conditional D1 update with a repeated capacity check, and recorded in the audit event log.

**No matching staff member or no remaining capacity:** the complaint remains in the **Needs assignment** queue and is visible to the administrator. It is not falsely shown as dispatched. The queue is automatically revisited when a matching technician is created or activated, or when a case is resolved. Administrators may also use **Assign queued complaints** to process the next batch, or manually assign/transfer a case to a valid specialist. Emergency cases take precedence when processing the backlog.

Assignment refers to an internal software work queue. This research system does **not** automatically contact a physical electricity distribution company, dispatch a vehicle, or guarantee repairs.

## Staff accounts and safe credentials

On **Staff**, administrators can add a real technician's name, sign-in alias, exact specialty, maximum workload (1–100), and active status. If the password field is left blank, the server generates a cryptographically random password, returns it **only in the administrator's response**, and stores only its salted PBKDF2 hash. Share generated credentials privately with the intended staff member; they are not recoverable afterward.

**Generate starter accounts** creates up to six **inactive** placeholders for missing specialties (one per category), with unique random credentials. They must be assigned to verified real technicians and explicitly activated before they can log in or receive any complaint. The action is idempotent when a specialty is already present. It is intentionally *not* run automatically on a public deployment, to avoid inventing staff identities or enabling fictional staff to receive customer cases.

Administrators may edit a staff display name, specialty, active status and workload. If a technician is deactivated or changes specialty, assigned-but-not-started cases are returned to the pending queue, and in-progress cases block that change until they are completed or transferred. A staff account can also have its password reset; this invalidates its prior sessions and presents the new password one time.

## Core API access

| Route | Role | Purpose |
|---|---|---|
| `GET /api/staff` | Admin | All technician accounts, specialty, active flag, workload |
| `POST /api/staff` | Admin | Create a specialty account; optional random one-time password |
| `PATCH /api/staff/:id` | Admin | Activate/deactivate and update specialization/capacity |
| `POST /api/staff/:id/reset-password` | Admin | Rotate technician password and revoke sessions |
| `POST /api/staff/starter-accounts` | Admin | Create inactive credentialed placeholders for missing specialties |
| `GET /api/dispatch/overview` | Admin | Queue totals by category/priority and number of active specialists |
| `POST /api/dispatch/run` | Admin | Assign a batch of pending cases |
| `POST /api/complaints/:id/reassign` | Admin | Transfer assigned work to another eligible specialist, audited |
| `GET /api/complaints?limit=120&offset=120` | Authenticated, role-filtered | Browse older cases in pages; admin sees all, other roles see only authorized cases |

The original role-controlled complaint status actions are retained. Staff can only read cases assigned to their user ID; customers can only read their own cases. All new staff and assignment endpoints enforce administrator authorization on the server.

## Deployment and verification

The deployment command `npm run deploy` **automatically applies the new migration** remotely before publishing the Worker. The public `GET /api/health` checks both user records and the new staff table and reports HTTP 503 if migrations have not run. No R2, photo upload, or new physical storage service is needed.

Tests cover account authorization, inactive staff, exact-specialty matching, capacity, backlog matching after activation, automatic assignment on resolution, reassignment audit, password rotation, and administrator interface structure.

After Cloudflare confirms deployment, sign in at `/admin` using an already-authorized administrator account. If no administrator exists, the initial protected bootstrap step is still required. Do not publish bootstrap secrets or technician passwords in GitHub, screenshots, or shared chat logs.
