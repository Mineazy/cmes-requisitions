const { query, transaction } = require('../config/database');
const { STATUS_FLOW, STATUS_ACTOR_MAP, getNextActorRole } = require('../utils/constants');
const { generateReqId, formatTimestamp, currencySymbol } = require('../utils/helpers');
const cryptoService = require('../services/cryptoService');
const emailService = require('../services/emailService');
const { logAudit } = require('../services/auditService');
const fs = require('fs');
const path = require('path');

async function list(req, res) {
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

    if (req.query.my === 'true') {
      sql += ` AND r.requestor_id = ?`;
      params.push(req.user.id);
    }

    if (req.query.type) {
      sql += ` AND r.type = ?`;
      params.push(req.query.type);
    }

    sql += ' ORDER BY r.created_at DESC';

    const result = await query(sql, params);

    const requisitions = await Promise.all(result.rows.map(async (r) => {
      const itemsResult = await query('SELECT * FROM items WHERE requisition_id = ?', [r.id]);
      const attachCount = (await query('SELECT COUNT(*) as count FROM attachments WHERE requisition_id = ?', [r.id])).rows[0].count;
      return { ...r, items: itemsResult.rows, attachment_count: parseInt(attachCount) };
    }));

    res.json({ requisitions });
  } catch (err) {
    console.error('List requisitions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getById(req, res) {
  try {
    const result = await query(
      `SELECT r.*, u.name as requestor_name
       FROM requisitions r
       JOIN users u ON r.requestor_id = u.id
       WHERE r.req_id = ?`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Requisition not found' });
    }

    const r = result.rows[0];
    const itemsResult = await query('SELECT * FROM items WHERE requisition_id = ?', [r.id]);
    const attachmentsResult = await query('SELECT * FROM attachments WHERE requisition_id = ?', [r.id]);
    const approvalsResult = await query(
      `SELECT a.*, u.name as user_name, u.role as user_role
       FROM approvals a
       JOIN users u ON a.user_id = u.id
       WHERE a.requisition_id = ?
       ORDER BY a.timestamp ASC`,
      [r.id]
    );

    res.json({
      requisition: {
        ...r,
        items: itemsResult.rows,
        attachments: attachmentsResult.rows,
        history: approvalsResult.rows
      }
    });
  } catch (err) {
    console.error('Get requisition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function create(req, res) {
  try {
    const parsedItems = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items;
    const { type, title, department, currency } = req.body;

    if (!title || !type || !department || !currency || !parsedItems || parsedItems.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (req.user.role !== 'Requestor') {
      return res.status(403).json({ error: 'Only Requestors can create requisitions' });
    }

    const totalAmount = parsedItems.reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0);

    const countResult = await query('SELECT COUNT(*) as count FROM requisitions');
    const count = parseInt(countResult.rows[0].count) + 1;
    const reqId = generateReqId('2026', count);

    const files = req.files || [];

    const r = await transaction(async (client) => {
      const reqResult = await client.query(
        `INSERT INTO requisitions (req_id, type, title, department, requestor_id, currency, status, total_amount)
         VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)`,
        [reqId, type, title, department, req.user.id, currency, totalAmount]
      );

      const dbReq = await client.query(
        'SELECT * FROM requisitions WHERE id = ?',
        [reqResult.insertId]
      );
      const requisition = dbReq.rows[0];

      for (const it of parsedItems) {
        await client.query(
          `INSERT INTO items (requisition_id, description, category, quantity, unit_price, total_price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [requisition.id, it.description, it.category, it.quantity, it.unitPrice, it.quantity * it.unitPrice]
        );
      }

      for (const f of files) {
        await client.query(
          `INSERT INTO attachments (requisition_id, file_name, original_name, mime_type, file_size)
           VALUES (?, ?, ?, ?, ?)`,
          [requisition.id, f.filename, f.originalname, f.mimetype, f.size]
        );
      }

      await client.query(
        `INSERT INTO approvals (requisition_id, stage, action, user_id, timestamp)
         VALUES (?, 'Pending', 'Created', ?, NOW())`,
        [requisition.id, req.user.id]
      );

      return { ...requisition, items: parsedItems };
    });

    const fullReq = (await query(
      `SELECT r.*, u.name as requestor_name FROM requisitions r JOIN users u ON r.requestor_id = u.id WHERE r.id = ?`,
      [r.id]
    )).rows[0];
    fullReq.items = parsedItems;

    await emailService.notifyNextApprover(fullReq);

    res.status(201).json({
      message: `Requisition ${reqId} created successfully`,
      requisition: r
    });

    logAudit({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'CREATE_REQUISITION', entityType: 'requisition', entityId: reqId,
      details: `Created ${type} requisition "${title}" (${currency} ${totalAmount}) with ${files.length} attachment(s)`
    });
  } catch (err) {
    console.error('Create requisition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function processApproval(req, res) {
  try {
    const { action, reason } = req.body;
    const reqId = req.params.id;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approve" or "reject"' });
    }

    const result = await query(
      `SELECT r.*, u.name as requestor_name
       FROM requisitions r
       JOIN users u ON r.requestor_id = u.id
       WHERE r.req_id = ?`,
      [reqId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Requisition not found' });
    }

    const requisition = result.rows[0];

    if (requisition.status === 'Rejected') {
      return res.status(400).json({ error: 'Requisition is already rejected' });
    }
    if (requisition.status === 'Change Cleared') {
      return res.status(400).json({ error: 'Requisition is already closed' });
    }

    const flow = STATUS_FLOW[requisition.type];
    const currentIndex = flow.indexOf(requisition.status);

    if (currentIndex === -1) {
      return res.status(400).json({ error: 'Invalid current status' });
    }

    if (action === 'reject') {
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'A reason is required for rejection' });
      }

      await query(
        `UPDATE requisitions SET status = 'Rejected', rejection_reason = ?, updated_at = NOW() WHERE id = ?`,
        [reason, requisition.id]
      );

      await query(
        `INSERT INTO approvals (requisition_id, stage, action, user_id, reason, timestamp)
         VALUES (?, ?, 'Rejected', ?, ?, NOW())`,
        [requisition.id, requisition.status, req.user.id, reason]
      );

      requisition.rejection_reason = reason;
      requisition.status = 'Rejected';
      await emailService.notifyRejection(requisition);

      res.json({ message: `Requisition ${reqId} rejected`, status: 'Rejected' });

      logAudit({
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        action: 'REJECT_REQUISITION', entityType: 'requisition', entityId: reqId,
        details: `Rejected "${requisition.title}" - ${reason}`
      });

      return;
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex >= flow.length) {
      return res.status(400).json({ error: 'No further approval stages' });
    }

    const nextState = flow[nextIndex];
    const timestamp = formatTimestamp();

    const sig = cryptoService.createVerificationPayload(
      reqId,
      req.user.name,
      req.user.role,
      requisition.status,
      timestamp
    );

    await query(`UPDATE requisitions SET status = ?, updated_at = NOW() WHERE id = ?`, [nextState, requisition.id]);

    await query(
      `INSERT INTO approvals (requisition_id, stage, action, user_id, signature, public_key_pem, timestamp, reason)
       VALUES (?, ?, 'Approved', ?, ?, ?, NOW(), ?)`,
      [
        requisition.id,
        requisition.status,
        req.user.id,
        sig.signature,
        sig.publicKeyPem,
        reason || ''
      ]
    );

    requisition.status = nextState;
    await emailService.notifyNextApprover(requisition);

    res.json({
      message: `Requisition ${reqId} approved`,
      status: nextState,
      signature: sig
    });

    logAudit({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'APPROVE_REQUISITION', entityType: 'requisition', entityId: reqId,
      details: `Approved "${requisition.title}" → ${nextState}`
    });
  } catch (err) {
    console.error('Approval error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function queueDisbursement(req, res) {
  try {
    const reqId = req.params.id;

    const result = await query(
      `SELECT r.*, u.name as requestor_name
       FROM requisitions r
       JOIN users u ON r.requestor_id = u.id
       WHERE r.req_id = ?`,
      [reqId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Requisition not found' });
    }

    const requisition = result.rows[0];

    if (requisition.status !== 'Director' && requisition.status !== 'Operations HOD') {
      return res.status(400).json({ error: 'Requisition must be at Director or Operations HOD stage' });
    }

    await query(`UPDATE requisitions SET status = 'Pending Disbursement', updated_at = NOW() WHERE id = ?`, [requisition.id]);

    await query(
      `INSERT INTO approvals (requisition_id, stage, action, user_id, timestamp)
       VALUES (?, ?, 'Queued for Disbursement', ?, NOW())`,
      [requisition.id, requisition.status, req.user.id]
    );

    requisition.status = 'Pending Disbursement';
    await emailService.notifyNextApprover(requisition);

    res.json({ message: `Requisition ${reqId} queued for disbursement`, status: 'Pending Disbursement' });

    logAudit({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'QUEUE_DISBURSEMENT', entityType: 'requisition', entityId: reqId,
      details: `Queued "${requisition.title}" for disbursement`
    });
  } catch (err) {
    console.error('Queue disbursement error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function disburse(req, res) {
  try {
    const reqId = req.params.id;

    const result = await query(
      `SELECT r.*, u.name as requestor_name
       FROM requisitions r
       JOIN users u ON r.requestor_id = u.id
       WHERE r.req_id = ?`,
      [reqId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Requisition not found' });
    }

    const requisition = result.rows[0];

    if (requisition.status !== 'Pending Disbursement') {
      return res.status(400).json({ error: 'Requisition must be at Pending Disbursement stage' });
    }

    await query(`UPDATE requisitions SET status = 'Issued', updated_at = NOW() WHERE id = ?`, [requisition.id]);

    await query(
      `INSERT INTO approvals (requisition_id, stage, action, user_id, timestamp)
       VALUES (?, 'Pending Disbursement', 'Disbursed', ?, NOW())`,
      [requisition.id, req.user.id]
    );

    requisition.status = 'Issued';
    await emailService.notifyDisbursement(requisition);

    res.json({ message: `Funds disbursed for ${reqId}`, status: 'Issued' });

    logAudit({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'DISBURSE', entityType: 'requisition', entityId: reqId,
      details: `Disbursed funds for "${requisition.title}"`
    });
  } catch (err) {
    console.error('Disburse error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function submitReceipts(req, res) {
  try {
    const reqId = req.params.id;
    const { notes } = req.body;

    const result = await query(
      `SELECT r.*, u.name as requestor_name
       FROM requisitions r
       JOIN users u ON r.requestor_id = u.id
       WHERE r.req_id = ?`,
      [reqId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Requisition not found' });
    }

    const requisition = result.rows[0];

    if (requisition.status !== 'Issued') {
      return res.status(400).json({ error: 'Requisition must be in Issued status' });
    }
    if (requisition.requestor_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the original requestor can submit receipts' });
    }

    await query(`UPDATE requisitions SET status = 'Change Returned/Pending', updated_at = NOW() WHERE id = ?`, [requisition.id]);

    await query(
      `INSERT INTO approvals (requisition_id, stage, action, user_id, reason, timestamp)
       VALUES (?, 'Issued', 'Expenses Submitted', ?, ?, NOW())`,
      [requisition.id, req.user.id, notes || 'Receipts submitted']
    );

    requisition.status = 'Change Returned/Pending';
    await emailService.notifyClearanceRequired(requisition);

    res.json({ message: `Expenses filed for ${reqId}`, status: 'Change Returned/Pending' });

    logAudit({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'SUBMIT_RECEIPTS', entityType: 'requisition', entityId: reqId,
      details: `Expenses submitted for "${requisition.title}"`
    });
  } catch (err) {
    console.error('Submit receipts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function clearRequisition(req, res) {
  try {
    const reqId = req.params.id;

    const result = await query(
      `SELECT r.*, u.name as requestor_name
       FROM requisitions r
       JOIN users u ON r.requestor_id = u.id
       WHERE r.req_id = ?`,
      [reqId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Requisition not found' });
    }

    const requisition = result.rows[0];

    if (requisition.status !== 'Change Returned/Pending') {
      return res.status(400).json({ error: 'Requisition must be at Change Returned/Pending stage' });
    }

    await query(`UPDATE requisitions SET status = 'Change Cleared', updated_at = NOW() WHERE id = ?`, [requisition.id]);

    await query(
      `INSERT INTO approvals (requisition_id, stage, action, user_id, timestamp)
       VALUES (?, 'Change Returned/Pending', 'Cleared', ?, NOW())`,
      [requisition.id, req.user.id]
    );

    res.json({ message: `Requisition ${reqId} fully cleared and closed`, status: 'Change Cleared' });

    logAudit({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'CLEAR_REQUISITION', entityType: 'requisition', entityId: reqId,
      details: `Cleared and closed "${requisition.title}"`
    });
  } catch (err) {
    console.error('Clear error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function pendingActions(req, res) {
  try {
    const userRole = req.user.role;

    let sql = `
      SELECT r.*, u.name as requestor_name
      FROM requisitions r
      JOIN users u ON r.requestor_id = u.id
      WHERE r.status != 'Rejected'
      AND r.status != 'Change Cleared'
    `;

    const statuses = Object.values(STATUS_ACTOR_MAP)
      .flatMap(typeMap => Object.entries(typeMap))
      .filter(([_, role]) => role === userRole)
      .map(([status]) => status);

    if (statuses.length === 0) {
      if (userRole === 'Requestor') {
        sql += ` AND r.status = 'Issued' AND r.requestor_id = ?`;
        const result = await query(sql, [req.user.id]);
        return res.json({ requisitions: result.rows });
      }
      return res.json({ requisitions: [] });
    }

    const placeholders = statuses.map(() => '?').join(', ');
    sql += ` AND r.status IN (${placeholders})`;

    if (userRole === 'Requestor') {
      sql += ` AND r.requestor_id = ?`;
      const result = await query(sql, [...statuses, req.user.id]);
      return res.json({ requisitions: result.rows });
    }

    const result = await query(sql, statuses);
    res.json({ requisitions: result.rows });
  } catch (err) {
    console.error('Pending actions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function downloadAttachment(req, res) {
  try {
    const result = await query(
      'SELECT * FROM attachments WHERE id = ? AND requisition_id = (SELECT id FROM requisitions WHERE req_id = ?)',
      [req.params.fileId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    const att = result.rows[0];
    const filePath = path.resolve(__dirname, `../../uploads/attachments/${att.file_name}`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${att.original_name}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error('Download attachment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function verifyQR(req, res) {
  try {
    const { qrData } = req.body;

    if (!qrData) {
      return res.status(400).json({ error: 'QR data is required' });
    }

    const result = cryptoService.verifyQRCode(qrData);
    res.json(result);
  } catch (err) {
    console.error('QR verification error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
}

module.exports = {
  list,
  getById,
  create,
  processApproval,
  queueDisbursement,
  disburse,
  submitReceipts,
  clearRequisition,
  pendingActions,
  verifyQR,
  downloadAttachment
};