const { query } = require('../config/database');
const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT) || 465,
    secure: true,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
  return transporter;
}

async function sendEmail({ to, subject, body }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await getTransporter().sendMail({ from, to, subject, text: body });
}

const FROM_EMAIL = process.env.SMTP_FROM || process.env.SMTP_USER;
const FINANCE_EMAIL = process.env.SMTP_FROM || process.env.SMTP_USER;
const RECONCILIATION_EMAIL = process.env.SMTP_FROM || process.env.SMTP_USER;

async function createEmail({ from, to, recipientName, subject, body, reqId, targetRole }) {
  const result = await query(
    `INSERT INTO emails (from_address, to_address, recipient_name, subject, body, req_id, target_role, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [from, to, recipientName, subject, body, reqId, targetRole]
  );

  const emailResult = await query('SELECT * FROM emails WHERE id = ?', [result.insertId]);

  sendEmail({ to, subject, body }).catch(err => {
    console.error(`SMTP send failed for "${subject}" to ${to}:`, err.message);
  });

  return emailResult.rows[0];
}

async function notifyNextApprover(req) {
  const { STATUS_ACTOR_MAP } = require('../utils/constants');

  const nextActorRole = STATUS_ACTOR_MAP[req.status];
  if (!nextActorRole) return null;

  const userResult = await query('SELECT * FROM users WHERE role = ? LIMIT 1', [nextActorRole]);
  if (userResult.rows.length === 0) return null;

  const recipient = userResult.rows[0];
  const symbol = req.currency === 'ZMW' ? 'K' : '$';
  const formattedAmount = `${symbol}${parseFloat(req.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const email = await createEmail({
    from: FROM_EMAIL,
    to: recipient.email,
    recipientName: recipient.name,
    subject: `Review Required: Requisition ${req.req_id} moved to ${req.status}`,
    body: `Dear ${recipient.name},\n\nRequisition ${req.req_id} ("${req.title}") is now awaiting your action in the ${req.status} stage.\n\nDetails:\n- Requester: ${req.requestor_name || 'N/A'}\n- Total Value: ${formattedAmount}\n\nPlease log in to the EazyTools Zambia Requisitions Desk to action this.`,
    reqId: req.req_id,
    targetRole
  });

  return email;
}

async function notifyRejection(req) {
  const userResult = await query('SELECT * FROM users WHERE id = ?', [req.requestor_id]);
  if (userResult.rows.length === 0) return null;

  const recipient = userResult.rows[0];

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
  const userResult = await query('SELECT * FROM users WHERE id = ?', [req.requestor_id]);
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
    'SELECT * FROM approvals WHERE requisition_id = ? ORDER BY timestamp DESC LIMIT 1',
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