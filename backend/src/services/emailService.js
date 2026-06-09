const { query } = require('../config/database');

const FROM_EMAIL = 'purchasing-alert@copperbeltmining.co.zm';
const FINANCE_EMAIL = 'finance@copperbeltmining.co.zm';
const RECONCILIATION_EMAIL = 'reconciliation@copperbeltmining.co.zm';

async function createEmail({ from, to, recipientName, subject, body, reqId, targetRole }) {
  const result = await query(
    `INSERT INTO emails (from_address, to_address, recipient_name, subject, body, req_id, target_role, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [from, to, recipientName, subject, body, reqId, targetRole]
  );
  return result.rows[0];
}

async function notifyNextApprover(req) {
  const { STATUS_ACTOR_MAP } = require('../utils/constants');

  const nextActorRole = STATUS_ACTOR_MAP[req.status];
  if (!nextActorRole) return null;

  let targetRole = nextActorRole;
  if (req.status === '1st Approver stage' && req.type === 'Shop Use') {
    targetRole = 'Final Approver';
  }

  const userResult = await query('SELECT * FROM users WHERE role = $1 LIMIT 1', [targetRole]);
  if (userResult.rows.length === 0) return null;

  const recipient = userResult.rows[0];
  const symbol = req.currency === 'ZMW' ? 'K' : '$';
  const formattedAmount = `${symbol}${parseFloat(req.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const email = await createEmail({
    from: FROM_EMAIL,
    to: recipient.email,
    recipientName: recipient.name,
    subject: `Review Required: Requisition ${req.req_id} moved to ${req.status}`,
    body: `Dear ${recipient.name},\n\nRequisition ${req.req_id} ("${req.title}") is now awaiting your action in the ${req.status} stage.\n\nDetails:\n- Requester: ${req.requestor_name || 'N/A'}\n- Total Value: ${formattedAmount}\n\nPlease log in to the CMES Requisitions Desk to action this.`,
    reqId: req.req_id,
    targetRole
  });

  return email;
}

async function notifyRejection(req) {
  const userResult = await query('SELECT * FROM users WHERE id = $1', [req.requestor_id]);
  if (userResult.rows.length === 0) return null;

  const recipient = userResult.rows[0];

  const approvalResult = await query(
    'SELECT * FROM approvals WHERE requisition_id = $1 AND action = $2 ORDER BY timestamp DESC LIMIT 1',
    [req.id, 'Rejected']
  );

  const rejector = approvalResult.rows[0];

  const email = await createEmail({
    from: FROM_EMAIL,
    to: recipient.email,
    recipientName: recipient.name,
    subject: `REJECTED: Requisition ${req.req_id} - ${req.title}`,
    body: `Dear ${recipient.name},\n\nYour Requisition ${req.req_id} has been rejected.\n\nReason for Rejection:\n"${req.rejection_reason || 'No reason provided'}"\n\nPlease adjust the details and resubmit a new requisition if required.`,
    reqId: req.req_id,
    targetRole: 'Requestor'
  });

  return email;
}

async function notifyDisbursement(req) {
  const userResult = await query('SELECT * FROM users WHERE id = $1', [req.requestor_id]);
  if (userResult.rows.length === 0) return null;

  const recipient = userResult.rows[0];

  const email = await createEmail({
    from: FINANCE_EMAIL,
    to: recipient.email,
    recipientName: recipient.name,
    subject: `Disbursement Completed: Requisition ${req.req_id}`,
    body: `Dear ${recipient.name},\n\nFunds have been disbursed for Requisition ${req.req_id} ("${req.title}").\n\nAction Required:\nPlease file your receipts and return any unused cash change, then submit expenses in the portal.`,
    reqId: req.req_id,
    targetRole: 'Requestor'
  });

  return email;
}

async function notifyClearanceRequired(req) {
  const userResult = await query("SELECT * FROM users WHERE role = 'Treasurer' LIMIT 1");
  if (userResult.rows.length === 0) return null;

  const recipient = userResult.rows[0];

  const lastApproval = await query(
    'SELECT * FROM approvals WHERE requisition_id = $1 ORDER BY timestamp DESC LIMIT 1',
    [req.id]
  );

  const details = lastApproval.rows[0]?.reason || 'Receipts submitted';

  const email = await createEmail({
    from: RECONCILIATION_EMAIL,
    to: recipient.email,
    recipientName: recipient.name,
    subject: `Audit Clearance Required: Requisition ${req.req_id} Receipts Filed`,
    body: `Dear ${recipient.name},\n\nRequestor has submitted expenses and returned change for ${req.req_id}.\n\nDetails:\n"${details}"\n\nPlease review and clear the ledger.`,
    reqId: req.req_id,
    targetRole: 'Treasurer'
  });

  return email;
}

module.exports = {
  createEmail,
  notifyNextApprover,
  notifyRejection,
  notifyDisbursement,
  notifyClearanceRequired
};
