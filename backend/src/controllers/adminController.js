const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { logAudit, getAuditLogs } = require('../services/auditService');

const SALT_ROUNDS = 12;
const VALID_ROLES = ['Admin', 'Purchasing HOD', 'Accounts HOD', 'Director', 'Operations HOD', 'Treasurer', 'Requestor'];
const PASSWORD_MIN_LENGTH = 8;

function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

async function getStats(req, res) {
  try {
    const [
      userCount, reqCount, statusCounts, recentReqs,
      zmwTotal, usdTotal, roleCounts
    ] = await Promise.all([
      query('SELECT COUNT(*) as count FROM users'),
      query('SELECT COUNT(*) as count FROM requisitions'),
      query('SELECT status, COUNT(*) as count FROM requisitions GROUP BY status ORDER BY status'),
      query(`
        SELECT r.req_id, r.title, r.status, r.type, r.total_amount, r.created_at,
               u.name as requestor_name
        FROM requisitions r
        JOIN users u ON r.requestor_id = u.id
        ORDER BY r.created_at DESC LIMIT 5
      `),
      query("SELECT COALESCE(SUM(total_amount), 0) as total FROM requisitions WHERE currency = 'ZMW'"),
      query("SELECT COALESCE(SUM(total_amount), 0) as total FROM requisitions WHERE currency = 'USD'"),
      query('SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY role')
    ]);

    res.json({
      stats: {
        totalUsers: parseInt(userCount.rows[0].count),
        totalRequisitions: parseInt(reqCount.rows[0].count),
        totalZmw: parseFloat(zmwTotal.rows[0].total),
        totalUsd: parseFloat(usdTotal.rows[0].total),
        byStatus: statusCounts.rows,
        usersByRole: roleCounts.rows,
        recentRequisitions: recentReqs.rows
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function listUsers(req, res) {
  try {
    const result = await query(
      `SELECT id, name, email, role, department, created_at, updated_at
       FROM users ORDER BY id`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function createUser(req, res) {
  try {
    const { name, email, role, department, password } = req.body;

    if (!name || !email || !role || !password) {
      return res.status(400).json({ error: 'Name, email, role, and password are required' });
    }

    if (!isValidRole(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` });
    }

    const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await query(
      `INSERT INTO users (name, email, role, department, password_hash)
       VALUES (?, ?, ?, ?, ?)`,
      [name, email, role, department || '', hash]
    );

    const userId = result.insertId;
    const userRes = await query(
      'SELECT id, name, email, role, department, created_at FROM users WHERE id = ?',
      [userId]
    );

    res.status(201).json({ user: userRes.rows[0] });

    await logAudit({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'CREATE_USER', entityType: 'user', entityId: String(userId),
      details: `Created user "${name}" (${role})`
    });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateUser(req, res) {
  try {
    const userId = req.params.id;
    const { name, email, role, department } = req.body;

    const existing = await query('SELECT id, name FROM users WHERE id = ?', [userId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (role && !isValidRole(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }

    if (email) {
      const emailConflict = await query('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
      if (emailConflict.rows.length > 0) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    await query(
      `UPDATE users SET
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        role = COALESCE(?, role),
        department = COALESCE(?, department),
        updated_at = NOW()
       WHERE id = ?`,
      [name || null, email || null, role || null, department !== undefined ? department : null, userId]
    );

    const userRes = await query(
      'SELECT id, name, email, role, department, created_at FROM users WHERE id = ?',
      [userId]
    );

    res.json({ user: userRes.rows[0] });

    await logAudit({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'UPDATE_USER', entityType: 'user', entityId: String(userId),
      details: `Updated user "${name || existing.rows[0].name}"`
    });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function resetPassword(req, res) {
  try {
    const userId = req.params.id;
    const { password } = req.body;

    if (!password || password.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` });
    }

    const existing = await query('SELECT id FROM users WHERE id = ?', [userId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hash, userId]);

    res.json({ message: 'Password reset successfully' });

    await logAudit({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'RESET_PASSWORD', entityType: 'user', entityId: String(userId),
      details: `Password reset for user ID ${userId}`
    });
  } catch (err) {
    console.error('Admin reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getAllRequisitions(req, res) {
  try {
    let sql = `
      SELECT r.*, u.name as requestor_name
      FROM requisitions r
      JOIN users u ON r.requestor_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (req.query.status) {
      sql += ` AND r.status = ?`;
      params.push(req.query.status);
    }
    if (req.query.type) {
      sql += ` AND r.type = ?`;
      params.push(req.query.type);
    }
    if (req.query.requestor_id) {
      sql += ` AND r.requestor_id = ?`;
      params.push(req.query.requestor_id);
    }
    if (req.query.search) {
      sql += ` AND (r.title LIKE ? OR r.req_id LIKE ? OR u.name LIKE ?)`;
      const p = `%${req.query.search}%`;
      params.push(p, p, p);
    }

    sql += ' ORDER BY r.created_at DESC';

    const result = await query(sql, params);
    const requisitions = await Promise.all(result.rows.map(async (r) => {
      const itemsResult = await query('SELECT * FROM items WHERE requisition_id = ?', [r.id]);
      return { ...r, items: itemsResult.rows };
    }));

    res.json({ requisitions });
  } catch (err) {
    console.error('Admin list all requisitions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function downloadReport(req, res) {
  try {
    const result = await query(`
      SELECT r.req_id, r.title, r.type, r.department, r.currency, r.total_amount,
             r.status, r.created_at, r.updated_at, r.rejection_reason,
             u.name as requestor_name, u.email as requestor_email
      FROM requisitions r
      JOIN users u ON r.requestor_id = u.id
      ORDER BY r.department, r.status, r.req_id
    `);

    const rows = result.rows;
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    const header = 'Req ID,Title,Type,Branch/Department,Currency,Amount,Status,Requestor,Requestor Email,Created,Updated,Rejection Reason';
    const csvLines = rows.map(r =>
      [r.req_id, r.title, r.type, r.department, r.currency, r.total_amount,
       r.status, r.requestor_name, r.requestor_email,
       r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
       r.updated_at ? new Date(r.updated_at).toISOString().split('T')[0] : '',
       r.rejection_reason || ''].map(esc).join(',')
    );

    const csv = '\uFEFF' + header + '\n' + csvLines.join('\n');
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cmes-requisitions-report-${dateStr}.csv"`);
    res.send(csv);

    logAudit({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'DOWNLOAD_REPORT', entityType: 'report',
      details: `Downloaded CSV report (${rows.length} requisitions)`
    });
  } catch (err) {
    console.error('Admin report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteUser(req, res) {
  try {
    const userId = req.params.id;

    const existing = await query('SELECT id, name, role FROM users WHERE id = ?', [userId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (existing.rows[0].role === 'Admin') {
      return res.status(403).json({ error: 'Cannot delete an Admin user' });
    }

    await query('UPDATE requisitions SET requestor_id = NULL WHERE requestor_id = ?', [userId]);
    await query('UPDATE approvals SET user_id = NULL WHERE user_id = ?', [userId]);
    await query('UPDATE audit_logs SET user_id = NULL WHERE user_id = ?', [userId]);

    await query('DELETE FROM users WHERE id = ?', [userId]);

    await logAudit({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'DELETE_USER', entityType: 'user', entityId: String(userId),
      details: `Deleted user "${existing.rows[0].name}" (${existing.rows[0].role})`
    });

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getAuditLogsCtrl(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const result = await getAuditLogs({ limit, offset });
    res.json(result);
  } catch (err) {
    console.error('Admin audit logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function purgeDummyUsers(req, res) {
  try {
    const { purge } = require('../seed');
    const result = await purge();
    res.json({ message: `Purged ${result.purged} dummy user(s)`, purged: result.purged });
    logAudit({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'PURGE_USERS', entityType: 'user',
      details: `Purged ${result.purged} dummy user(s) from the system`
    });
  } catch (err) {
    console.error('Purge users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getStats, listUsers, createUser, updateUser, resetPassword, deleteUser, getAllRequisitions, downloadReport, getAuditLogs: getAuditLogsCtrl, purgeDummyUsers };