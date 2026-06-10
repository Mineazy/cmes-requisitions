const bcrypt = require('bcrypt');
const { query } = require('../config/database');

const SALT_ROUNDS = 12;

async function getStats(req, res) {
  try {
    const [userCount, reqCount, statusCounts, recentReqs] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM requisitions'),
      query('SELECT status, COUNT(*) as count FROM requisitions GROUP BY status ORDER BY status'),
      query(`
        SELECT r.req_id, r.title, r.status, r.type, r.total_amount, r.created_at,
               u.name as requestor_name
        FROM requisitions r
        JOIN users u ON r.requestor_id = u.id
        ORDER BY r.created_at DESC LIMIT 5
      `)
    ]);

    res.json({
      stats: {
        totalUsers: parseInt(userCount.rows[0].count),
        totalRequisitions: parseInt(reqCount.rows[0].count),
        byStatus: statusCounts.rows,
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

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await query(
      `INSERT INTO users (name, email, role, department, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, department, created_at`,
      [name, email, role, department || '', hash]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateUser(req, res) {
  try {
    const userId = req.params.id;
    const { name, email, role, department } = req.body;

    const existing = await query('SELECT id FROM users WHERE id = $1', [userId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (email) {
      const emailConflict = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
      if (emailConflict.rows.length > 0) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    const result = await query(
      `UPDATE users SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        role = COALESCE($3, role),
        department = COALESCE($4, department),
        updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, email, role, department, created_at`,
      [name || null, email || null, role || null, department !== undefined ? department : null, userId]
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function resetPassword(req, res) {
  try {
    const userId = req.params.id;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await query('SELECT id FROM users WHERE id = $1', [userId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);

    res.json({ message: 'Password reset successfully' });
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
    let paramIdx = 1;

    if (req.query.status) {
      sql += ` AND r.status = $${paramIdx++}`;
      params.push(req.query.status);
    }
    if (req.query.type) {
      sql += ` AND r.type = $${paramIdx++}`;
      params.push(req.query.type);
    }
    if (req.query.requestor_id) {
      sql += ` AND r.requestor_id = $${paramIdx++}`;
      params.push(req.query.requestor_id);
    }
    if (req.query.search) {
      sql += ` AND (r.title ILIKE $${paramIdx} OR r.req_id ILIKE $${paramIdx} OR u.name ILIKE $${paramIdx})`;
      params.push(`%${req.query.search}%`);
      paramIdx++;
    }

    sql += ' ORDER BY r.created_at DESC';

    const result = await query(sql, params);
    const requisitions = await Promise.all(result.rows.map(async (r) => {
      const itemsResult = await query('SELECT * FROM items WHERE requisition_id = $1', [r.id]);
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
  } catch (err) {
    console.error('Admin report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getStats, listUsers, createUser, updateUser, resetPassword, getAllRequisitions, downloadReport };
