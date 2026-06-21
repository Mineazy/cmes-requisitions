const { query } = require('../config/database');

async function logAudit({ userId, userName, userRole, action, entityType, entityId, details }) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId || null, userName || 'System', userRole || 'System', action, entityType || null, entityId || null, details || null]
    );
  } catch (err) {
    console.error('Audit log insert error:', err);
  }
}

async function getAuditLogs({ limit = 50, offset = 0 } = {}) {
  const result = await query(
    `SELECT id, user_id, user_name, user_role, action, entity_type, entity_id, details, created_at
     FROM audit_logs
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  const countResult = await query('SELECT COUNT(*) as count FROM audit_logs');
  return { logs: result.rows, total: parseInt(countResult.rows[0].count) };
}

module.exports = { logAudit, getAuditLogs };