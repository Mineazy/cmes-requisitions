require('dotenv').config();
const bcrypt = require('bcrypt');
const { query, initializeDatabase } = require('./config/database');
const crypto = require('crypto');

const USERS = [
  { name: 'Chansa Mwape', role: 'Requestor', email: 'chansa.mwape@copperbeltmining.co.zm', dept: 'Logistics & Stores - Kitwe', password: 'password123' },
  { name: 'Mutale Chilufya', role: '1st Approver', email: 'mutale.chilufya@copperbeltmining.co.zm', dept: 'Administration - Ndola Head Office', password: 'password123' },
  { name: 'Kondwelani Banda', role: '2nd Approver', email: 'kondwelani.banda@copperbeltmining.co.zm', dept: 'Operations - Solwezi Mine Hub', password: 'password123' },
  { name: 'Sibongile Phiri', role: '3rd Approver', email: 'sibongile.phiri@copperbeltmining.co.zm', dept: 'Operations - Solwezi Mine Hub', password: 'password123' },
  { name: 'Mwansa Kabwe', role: 'Final Approver', email: 'mwansa.kabwe@copperbeltmining.co.zm', dept: 'Administration - Ndola Head Office', password: 'password123' },
  { name: 'Bwalya Tembo', role: 'Treasurer', email: 'bwalya.tembo@copperbeltmining.co.zm', dept: 'Finance - Lusaka Headquarters', password: 'password123' }
];

async function seed() {
  try {
    console.log('Initializing database...');
    await initializeDatabase();

    console.log('Seeding users...');
    for (const u of USERS) {
      const hash = await bcrypt.hash(u.password, 12);
      await query(
        `INSERT INTO users (name, email, role, department, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, department = EXCLUDED.department`,
        [u.name, u.email, u.role, u.dept, hash]
      );
    }
    console.log('Users seeded successfully');

    // Get seeded user IDs
    const userResult = await query('SELECT * FROM users ORDER BY id');
    const users = userResult.rows;

    const chansa = users.find(u => u.role === 'Requestor');
    const mutale = users.find(u => u.role === '1st Approver');
    const kondwelani = users.find(u => u.role === '2nd Approver');
    const sibongile = users.find(u => u.role === '3rd Approver');
    const mwansa = users.find(u => u.role === 'Final Approver');
    const bwalya = users.find(u => u.role === 'Treasurer');

    // Check if requisitions already exist
    const existingReqs = await query('SELECT COUNT(*) FROM requisitions');
    if (parseInt(existingReqs.rows[0].count) > 0) {
      console.log('Requisitions already seeded, skipping...');
      return { users: USERS };
    }

    console.log('Seeding sample requisitions...');

    // REQ-0001: Admin - IT Upgrades (at 2nd Approver Stage)
    const req1 = await createRequisition({
      reqId: 'REQ-2026-0001', type: 'Admin', title: 'Kitwe Headquarters IT Upgrades',
      department: 'Administration - Ndola Head Office', requestorId: chansa.id,
      currency: 'ZMW', totalAmount: 62500,
      items: [
        { desc: 'Business Laptops (Core i7, 16GB)', cat: 'Office Admin', qty: 3, price: 18500 },
        { desc: 'Gigabit Ethernet Switch 24-Port', cat: 'Office Admin', qty: 2, price: 3500 }
      ],
      history: [
        { stage: 'Pending', action: 'Created', userId: chansa.id },
        { stage: 'Pending', action: 'Approved', userId: mutale.id },
        { stage: '1st Approver stage', action: 'Approved', userId: kondwelani.id }
      ],
      status: '2nd Approver Stage'
    });

    // REQ-0002: Shop Use - Drill Bits (at 1st Approver stage)
    const req2 = await createRequisition({
      reqId: 'REQ-2026-0002', type: 'Shop Use', title: 'Diamond-Core Drill Bits replenishment',
      department: 'Operations - Solwezi Mine Hub', requestorId: chansa.id,
      currency: 'USD', totalAmount: 14200,
      items: [
        { desc: 'Sandvik 46mm Diamond Drill Bits', cat: 'Drills & Tools', qty: 20, price: 650 },
        { desc: 'High-Pressure Drilling Coolant (20L)', cat: 'Consumables', qty: 8, price: 150 }
      ],
      history: [
        { stage: 'Pending', action: 'Created', userId: chansa.id },
        { stage: 'Pending', action: 'Approved', userId: mutale.id }
      ],
      status: '1st Approver stage'
    });

    // REQ-0003: Admin - PPE (at Change Returned/Pending)
    const req3 = await createRequisition({
      reqId: 'REQ-2026-0003', type: 'Admin', title: 'Warehouse Safety Gear & PPE Stocking',
      department: 'Logistics & Stores - Kitwe', requestorId: chansa.id,
      currency: 'ZMW', totalAmount: 18750,
      items: [
        { desc: 'Heavy Duty Steel-toe Boots', cat: 'Safety Wear (PPE)', qty: 15, price: 850 },
        { desc: 'High-Visibility Reflective Jackets', cat: 'Safety Wear (PPE)', qty: 30, price: 200 }
      ],
      history: [
        { stage: 'Pending', action: 'Created', userId: chansa.id },
        { stage: 'Pending', action: 'Approved', userId: mutale.id },
        { stage: '1st Approver stage', action: 'Approved', userId: kondwelani.id },
        { stage: '2nd Approver Stage', action: 'Approved', userId: sibongile.id },
        { stage: '3rd Approver Stage', action: 'Approved', userId: mwansa.id },
        { stage: 'Final Approver', action: 'Queued for Disbursement', userId: bwalya.id },
        { stage: 'Pending Disbursement', action: 'Disbursed', userId: bwalya.id },
        { stage: 'Issued', action: 'Expenses Submitted', userId: chansa.id, reason: 'Receipts attached. Returned change: K1,250 cash to stores vault.' }
      ],
      status: 'Change Returned/Pending'
    });

    // REQ-0004: Shop Use - Rejected
    const req4 = await createRequisition({
      reqId: 'REQ-2026-0004', type: 'Shop Use', title: 'Solwezi Site Hydraulic Pump Seal Kit',
      department: 'Operations - Solwezi Mine Hub', requestorId: chansa.id,
      currency: 'ZMW', totalAmount: 9400,
      rejectReason: 'Incorrect kit serial number specified for the Komatsu PC2000 excavators.',
      items: [
        { desc: 'Hydraulic Seal Kit PC2000', cat: 'Heavy Equipment', qty: 2, price: 4700 }
      ],
      history: [
        { stage: 'Pending', action: 'Created', userId: chansa.id },
        { stage: 'Pending', action: 'Rejected', userId: mutale.id, reason: 'Incorrect kit serial number specified for the Komatsu PC2000 excavators.' }
      ],
      status: 'Rejected'
    });

    // REQ-0005: Admin - Stationery (Change Cleared)
    const req5 = await createRequisition({
      reqId: 'REQ-2026-0005', type: 'Admin', title: 'Ndola Office Stationery & Consumables',
      department: 'Administration - Ndola Head Office', requestorId: chansa.id,
      currency: 'ZMW', totalAmount: 4300,
      items: [
        { desc: 'A4 Laser Printing Paper cartons', cat: 'Office Admin', qty: 5, price: 650 },
        { desc: 'Heavy Duty Stapler & Staples', cat: 'Office Admin', qty: 3, price: 350 }
      ],
      history: [
        { stage: 'Pending', action: 'Created', userId: chansa.id },
        { stage: 'Pending', action: 'Approved', userId: mutale.id },
        { stage: '1st Approver stage', action: 'Approved', userId: kondwelani.id },
        { stage: '2nd Approver Stage', action: 'Approved', userId: sibongile.id },
        { stage: '3rd Approver Stage', action: 'Approved', userId: mwansa.id },
        { stage: 'Final Approver', action: 'Queued for Disbursement', userId: bwalya.id },
        { stage: 'Pending Disbursement', action: 'Disbursed', userId: bwalya.id },
        { stage: 'Issued', action: 'Expenses Submitted', userId: chansa.id, reason: 'Receipts filed. K0.00 change returned.' },
        { stage: 'Change Returned/Pending', action: 'Cleared', userId: bwalya.id }
      ],
      status: 'Change Cleared'
    });

    // Seed emails for pending actions
    console.log('Seeding notification emails...');

    // Email for REQ-0001 awaiting 3rd Approver
    await query(
      `INSERT INTO emails (from_address, to_address, recipient_name, subject, body, req_id, target_role, read, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())`,
      ['purchasing-alert@copperbeltmining.co.zm', sibongile.email, sibongile.name,
       'Action Required: Requisition REQ-2026-0001 Awaiting 3rd Approval',
       `Dear ${sibongile.name},\n\nRequisition REQ-2026-0001 ("Kitwe Headquarters IT Upgrades") has been approved by the 2nd Approver and is now awaiting your review in the 3rd Approver Stage.\n\nTotal: K62,500.00\n\nPlease log in to CMES Requisitions Desk to action this.`,
       'REQ-2026-0001', '3rd Approver']
    );

    // Email for REQ-0002 awaiting Final Approver (Shop Use)
    await query(
      `INSERT INTO emails (from_address, to_address, recipient_name, subject, body, req_id, target_role, read, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())`,
      ['purchasing-alert@copperbeltmining.co.zm', mwansa.email, mwansa.name,
       'Action Required: Shop Use Requisition REQ-2026-0002 Awaiting Final Approval',
       `Dear ${mwansa.name},\n\nShop Use Requisition REQ-2026-0002 ("Diamond-Core Drill Bits replenishment") has passed 1st Approval and is now awaiting your Final Approval.\n\nTotal: $14,200.00 USD\n\nPlease review the itemized lists and submit your final decision.`,
       'REQ-2026-0002', 'Final Approver']
    );

    console.log('Seed data created successfully!');
    console.log('');
    console.log('=== Login Credentials ===');
    for (const u of USERS) {
      console.log(`  ${u.role}: ${u.email} / ${u.password}`);
    }
    console.log('========================');

    return { users: USERS };
  } catch (err) {
    console.error('Seed failed:', err);
    throw err;
  }
}

async function createRequisition(data) {
  const reqResult = await query(
    `INSERT INTO requisitions (req_id, type, title, department, requestor_id, currency, status, rejection_reason, total_amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [data.reqId, data.type, data.title, data.department, data.requestorId, data.currency, data.status, data.rejectReason || null, data.totalAmount]
  );

  const req = reqResult.rows[0];

  for (const it of data.items) {
    await query(
      `INSERT INTO items (requisition_id, description, category, quantity, unit_price, total_price)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.id, it.desc, it.cat, it.qty, it.price, it.qty * it.price]
    );
  }

  for (const h of data.history) {
    const sig = h.action === 'Approved' ? crypto.randomBytes(16).toString('hex') : null;
    await query(
      `INSERT INTO approvals (requisition_id, stage, action, user_id, reason, signature, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [req.id, h.stage, h.action, h.userId, h.reason || null, sig]
    );
  }

  return req;
}

// Run when invoked directly via `node src/seed.js`
if (require.main === module) {
  seed().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { seed, USERS };
