const { query } = require('../config/database');

async function listEmails(req, res) {
  try {
    // Return emails where the recipient role matches the user's role
    // or if the user is a Requestor, emails for them specifically
    const result = await query(
      `SELECT e.* FROM emails e
       WHERE e.target_role = $1
          OR e.to_address = (SELECT email FROM users WHERE id = $2)
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
    const result = await query(
      `UPDATE emails SET read = true WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

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
