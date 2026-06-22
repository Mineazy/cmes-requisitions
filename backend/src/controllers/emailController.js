const { query } = require('../config/database');

async function listEmails(req, res) {
  try {
    const result = await query(
      `SELECT e.* FROM emails e
       WHERE e.target_role = ?
          OR e.to_address = (SELECT email FROM users WHERE id = ?)
       ORDER BY e.timestamp DESC`,
      [req.user.role, req.user.id]
    );

    res.json({ emails: result.rows });
  } catch (err) {
    console.error('List emails error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function markAsRead(req, res) {
  try {
    await query(
      `UPDATE emails SET is_read = true WHERE id = ?`,
      [req.params.id]
    );

    const result = await query('SELECT * FROM emails WHERE id = ?', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.json({ email: result.rows[0] });
  } catch (err) {
    console.error('Mark email read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { listEmails, markAsRead };