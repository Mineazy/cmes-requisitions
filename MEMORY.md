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
