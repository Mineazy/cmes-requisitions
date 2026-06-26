# Session Summary

## 1. Fix Delete User 500 Errors
- Nullified FK references (`requestor_id`, `user_id`, `audit_logs.user_id`) before `DELETE` to avoid constraint violations.
- **Files:** `backend/src/controllers/adminController.js`

## 2. Remove Precoded Users — Only lodzax as Admin
- Replaced all 7 demo users with a single user: `lodzax@gmail.com` (Admin).
- Removed all 5 sample requisitions, approval histories, and seeded emails from `seed.js`.
- Removed pre-filled demo credentials from the login form.
- **Files:** `backend/src/seed.js`, `index.html`

## 3. Email Notifications (Remove Simulation)
- Renamed "Corporate Email Simulation" → "Email Notifications" in UI.
- Removed all hardcoded SMTP fallback credentials from source code (now only in `.env`).
- SMTP errors are logged but don't block the API response (fire-and-forget with `.catch()`).
- **Files:** `index.html`, `app.js`, `backend/src/services/emailService.js`

## 4. Production Hardening
- **Helmet** — security headers with CSP in production.
- **Compression** — gzip response compression.
- **Rate limiting** — 200 req/15min general API, 20 req/15min for login.
- **Morgan** — HTTP request logging (`combined` in prod, `dev` in dev).
- **Env validation** — startup fails fast if `DATABASE_URL`, `JWT_SECRET`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` are missing.
- **Trust proxy** — `app.set('trust proxy', 1)` for reverse proxy deployments.
- **Error handler** — stack traces hidden in production.
- **CORS** — supports comma-separated multi-origin in production.
- **JWT secret** — no fallback default; crashes on startup if unset.
- **Files:** `backend/src/index.js`, `backend/src/middleware/auth.js`, `backend/package.json`

## 5. Live Admin Metrics
- Added ZMW and USD totals to stats endpoint (SQL `SUM` aggregations).
- Added `usersByRole` breakdown.
- Frontend auto-refreshes stats every 15 seconds via `setInterval` (cleared on navigation away).
- Pending card now shows live breakdown by status in subtitle.
- Added gold/silver accent colors for new metric cards.
- Grid expanded from 4 → 6 cards using `repeat(3, 1fr)`.
- **Files:** `backend/src/controllers/adminController.js`, `index.html`, `index.css`, `app.js`

## 6. Profile Page
- New sidebar nav item (person icon, visible to all roles).
- Two-column layout: Account Information (name, email, role, dept, member since) + Change Password form.
- Backend endpoint `POST /api/auth/change-password` validates current password, enforces 6-char minimum, logs to audit trail.
- Moved inline styles to CSS with responsive breakpoints.
- **Files:** `index.html`, `index.css`, `app.js`, `backend/src/controllers/authController.js`, `backend/src/routes/auth.js`

## 7. Content Security Policy Fix
- Added `fonts.googleapis.com` to `style-src`, `fonts.gstatic.com` to `font-src`, `cdnjs.cloudflare.com` to `connect-src` in production CSP.
- **Files:** `backend/src/index.js`

## 8. Purge Dummy Users + Production Hardening
- Added `purge()` function to `seed.js` — deletes all non-admin users with FK nullification (`npm run purge`).
- Admin password now configurable via `ADMIN_PASSWORD` env var (defaults to `password123`).
- Added `VALID_ROLES` whitelist to `adminController.js` — `createUser`/`updateUser` reject invalid roles.
- Password minimum length raised from 6 → 8 across all auth endpoints.
- Added `purge` npm script to `package.json`.
- Updated `.env.example` with required SMTP vars and `ADMIN_PASSWORD` hint.
- Removed insecure `JWT_SECRET` fallback default from `docker-compose.yml` (now required via `${JWT_SECRET?}`).
- **Files:** `backend/src/seed.js`, `backend/src/controllers/adminController.js`, `backend/src/controllers/authController.js`, `backend/package.json`, `backend/.env.example`, `docker-compose.yml`

## 9. Profile & Mobile Overhaul (Current Session)
### Approver Restructuring
- **Admin** (3 approvers): Purchasing HOD → Accounts HOD → Director → Treasurer
- **Shop Use** (1 approver): Operations HOD → Treasurer
- Removed `1st/2nd/3rd Approver` and `Final Approver` roles.
- Added `Purchasing HOD`, `Accounts HOD`, `Director`, `Operations HOD` roles.
- Updated `STATUS_FLOW`, `STATUS_ACTOR_MAP`, `VALID_ROLES`, all frontend/backend logic, tests, CSS avatar colors, and HTML role dropdowns.
- **Files:** `backend/src/utils/constants.js`, `backend/src/controllers/adminController.js`, `backend/src/controllers/requisitionController.js`, `backend/src/services/emailService.js`, `app.js`, `index.html`, `index.css`, `backend/tests/api.test.js`, `backend/tests/cryptoService.test.js`

### Profile View Overhaul
- Completely redesigned from two-column grid layout → centered hero card design.
- Avatar with user initials on copper gradient, name heading, role badge pill, metadata tags (email, dept, member since).
- Change Password panel below hero card.
- Added `.profile-container` with `max-width: 640px; margin: 0 auto` for centered layout.
- **Files:** `index.html`, `index.css`, `app.js`

### Mobile Experience
- Sidebar changed from horizontal strip → overlay drawer sliding in from left.
- Added dark backdrop when sidebar is open; tapping backdrop closes sidebar.
- Header compacted to 56px on mobile with hamburger, logo, actions on one row.
- JS updated to manage backdrop visibility.
- **Files:** `index.html`, `index.css`, `app.js`

## 10. PostgreSQL → TiDB (MySQL) Database Migration
- Replaced `pg` with `mysql2` in `package.json`.
- Rewrote `database.js`: `pg` Pool → `mysql2/promise` pool, SSL support, wrapped `query()`/`transaction()` for compatible `{ rows }` interface.
- Rewrote all SQL queries across 10 files:
  - `$N` numbered params → `?` positional placeholders
  - `ILIKE` → `LIKE`
  - `RETURNING *` / `RETURNING id,...` → `insertId` + separate `SELECT`
  - `ON CONFLICT ... DO UPDATE` → `ON DUPLICATE KEY UPDATE`
  - `ON CONFLICT ... DO NOTHING` → `INSERT IGNORE`
  - `EXCLUDED.col` → `VALUES(col)`
  - `ANY($1)` / `$1::int[]` → dynamic `IN (?,?,?)` with generated placeholders
  - Dynamic `$${paramIdx++}` → `?` relying on array order
- Updated DDL: `SERIAL` → `INT AUTO_INCREMENT`, `BOOLEAN` → `TINYINT(1)`, added `CHARSET=utf8mb4`, `ON UPDATE CURRENT_TIMESTAMP`.
- Updated `DATABASE_URL` format from `postgresql://` → `mysql://` in `.env.example`.
- Updated `docker-compose.yml` — removed PostgreSQL service, added `DATABASE_URL` / `JWT_SECRET` / SMTP env passthrough.
- Updated tests (`setup.js`, `api.test.js`) for MySQL-compatible SQL.
- **Files:** `backend/package.json`, `backend/src/config/database.js`, `backend/src/controllers/adminController.js`, `backend/src/controllers/authController.js`, `backend/src/controllers/requisitionController.js`, `backend/src/controllers/userController.js`, `backend/src/controllers/emailController.js`, `backend/src/services/emailService.js`, `backend/src/services/auditService.js`, `backend/src/seed.js`, `backend/.env.example`, `docker-compose.yml`, `backend/tests/setup.js`, `backend/tests/api.test.js`

## 11. Returns Requisition Type
- Added `Returns Requisition` as third requisition type alongside Admin and Shop Use.
- Approval flow: Pending → Operations HOD → Accounts HOD → Pending Disbursement → Issued → Change Returned/Pending → Change Cleared.
- Restructured `STATUS_ACTOR_MAP` from flat `{status: role}` to nested `{type: {status: role}}` to support per-type actor resolution.
- Added `getNextActorRole(status, type)` helper to both backend (`constants.js`) and frontend (`app.js`).
- Email notifications and `pendingActions` query updated to use per-type actor lookup.
- Frontend `renderApprovalFlow()` uses `getNextActorRole()` to build per-type approval stepper.
- **Files:** `backend/src/utils/constants.js`, `backend/src/controllers/requisitionController.js`, `backend/src/services/emailService.js`, `app.js`, `index.html`

## 12. Theme Color Experiment (Reverted)
- Attempted change to blue (#0000FE) / yellow (#FFFF00) / light (#EAF2EF) / dark (#172121) palette.
- Commit `9d047b9` applied the change to CSS vars, JS theme references, HTML.
- Commit `93bb2ec` reverted back to original copper (#E37622) / emerald (#10B981) / dark navy (#060D1A) theme.
- Current state is the original copper/emerald/dark-navy theme — no net change.
- **Files (reverted):** `index.css`, `index.html`, `app.js`

## 13. File Attachments for Requisitions
- Added ability to attach documents (PDF, images, DOC, XLS, TXT, ZIP, RAR) when creating a new requisition.
- **Backend:**
  - New `attachments` table: `id`, `requisition_id`, `file_name`, `original_name`, `mime_type`, `file_size`, `uploaded_at`.
  - Installed `multer` for multipart form handling with disk storage to `backend/uploads/attachments/`.
  - Whitelist-based file type filtering and 10MB per-file limit.
  - Route `POST /` now uses `upload.array('attachments', 10)` before the controller.
  - `create()` controller parses `items` from JSON string (since multipart), stores file metadata inside the transaction.
  - `getById()` returns `attachments[]` with full metadata.
  - `list()` returns `attachment_count` per requisition.
  - New `GET /:id/attachments/:fileId` endpoint serves files with proper Content-Type and Content-Disposition.
  - `/uploads/` served statically in `index.js`.
- **Frontend:**
  - Drag-and-drop file upload zone with click-to-browse fallback.
  - File list with name, size display, and remove button.
  - `handleFormSubmit()` switched from `apiFetch` (JSON) to raw `fetch` with `FormData`.
  - Details modal shows attachments as clickable links (open in new tab).
  - Queue/dashboard cards show paperclip indicator + file count when attachments exist.
  - Resubmit clears attachment list for fresh upload.
  - CSS: `.file-drop-zone`, `.file-item`, `.attachment-link`, `.modal-attachments-section` styles.
- **Files:** `backend/package.json` (multer), `backend/src/middleware/upload.js` (new), `backend/src/config/database.js`, `backend/src/controllers/requisitionController.js`, `backend/src/routes/requisitions.js`, `backend/src/index.js`, `app.js`, `index.html`, `index.css`

## 14. Reviewer Stage & Role
- Added `Reviewer` as the first approval stage after submission (before the existing approval chain).
- Updated all flows:
  - **Admin:** Pending → **Reviewer** → Purchasing HOD → Accounts HOD → Director → ...
  - **Shop Use:** Pending → **Reviewer** → Operations HOD → ...
  - **Returns Requisition:** Pending → **Reviewer** → Operations HOD → Accounts HOD → ...
- Added `Reviewer` role to `VALID_ROLES`, admin user dropdown, test setup, and CSS avatar colors (purple `#6b21a8`).
- Updated frontend `STATUS_FLOW`, `STATUS_ACTOR_MAP`, labels, `ROLE_INITIALS` (`RV`), and `STATUS_ORDER`.
- **Files:** `backend/src/utils/constants.js`, `backend/src/controllers/adminController.js`, `backend/tests/api.test.js`, `app.js`, `index.html`, `index.css`

## 15. Download Approved Requisition PDF
- Added "Download PDF" button in the requisition details modal header, visible once the requisition has passed all approval stages (status index >= "Pending Disbursement" in `STATUS_FLOW`).
- Frontend-only PDF generation using jsPDF + jspdf-autotable (already loaded via CDN).
- PDF layout:
  - Company branding header (EazyTools Zambia)
  - Info box with req ID, type, status, title, requestor, department, date, currency
  - Items table with auto-calculated grand total
  - Approval trail table (action, stage, user, role, timestamp)
  - Digital signatures section for signed approvals
  - Footer with generation timestamp
- Button styled with emerald green to indicate approval completion.
- **Files:** `app.js`, `index.html`, `index.css`
