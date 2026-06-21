const { query } = require('../config/database');

async function listUsers(req, res) {
  try {
    const result = await query(
      'SELECT id, name, email, role, department, created_at FROM users ORDER BY id'
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getUserById(req, res) {
  try {
    const result = await query(
      'SELECT id, name, email, role, department, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { listUsers, getUserById };