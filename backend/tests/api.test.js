const request = require('supertest');
const app = require('../src/index');
const { query, initializeDatabase, getPool } = require('../src/config/database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Integration tests require PostgreSQL.
// Set RUN_DB_TESTS=1 to enable them when a database is available.
let dbAvailable = process.env.RUN_DB_TESTS === '1';

let testUserToken = '';
let testUserId = null;
let testReqId = '';

if (dbAvailable) {
  beforeAll(async () => {
    await initializeDatabase();

    const hash = await bcrypt.hash('testpass123', 12);
    const userResult = await query(
      `INSERT INTO users (name, email, role, department, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      ['Test Requestor', 'test.requestor@test.co.zm', 'Requestor', 'Test Dept', hash]
    );

    testUserId = userResult.rows[0]?.id || (await query("SELECT id FROM users WHERE email = 'test.requestor@test.co.zm'")).rows[0].id;

    const roles = ['1st Approver', '2nd Approver', '3rd Approver', 'Final Approver', 'Treasurer'];
    for (const role of roles) {
      const h = await bcrypt.hash('testpass123', 12);
      const email = `test.${role.toLowerCase().replace(/\s+/g, '.')}@test.co.zm`;
      await query(
        `INSERT INTO users (name, email, role, department, password_hash)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
        [`Test ${role}`, email, role, 'Test Dept', h]
      );
    }
  });

  afterAll(async () => {
    try {
      await query('DELETE FROM approvals WHERE requisition_id IN (SELECT id FROM requisitions WHERE requestor_id = $1)', [testUserId]);
      await query('DELETE FROM items WHERE requisition_id IN (SELECT id FROM requisitions WHERE requestor_id = $1)', [testUserId]);
      await query('DELETE FROM requisitions WHERE requestor_id = $1', [testUserId]);
      await query("DELETE FROM users WHERE email LIKE 'test.%'");
    } catch (err) { /* ignore cleanup errors */ }
  });
}

function itIf(condition) {
  return condition ? test : test.skip;
}

const conditionalDescribe = dbAvailable ? describe : describe.skip;

if (!dbAvailable) {
  beforeAll(() => {
    console.warn('WARN: Database not available - API integration tests are skipped.');
    console.warn(`  To run all tests, start PostgreSQL at: ${process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/cmes_requisitions'}`);
  });
}

// ─── Tests ──────────────────────────────────────────────

describe('API Health', () => {
  test('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('2.0.0');
  });
});

conditionalDescribe('Authentication', () => {
  test('POST /api/auth/login with valid credentials returns token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test.requestor@test.co.zm', password: 'testpass123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('Requestor');
    testUserToken = res.body.token;
  });

  test('POST /api/auth/login with invalid password returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test.requestor@test.co.zm', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('POST /api/auth/login with missing fields returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test.requestor@test.co.zm' });
    expect(res.status).toBe(400);
  });

  test('GET /api/auth/profile returns user profile', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${testUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test.requestor@test.co.zm');
  });

  test('GET /api/auth/profile without token returns 401', async () => {
    const res = await request(app).get('/api/auth/profile');
    expect(res.status).toBe(401);
  });
});

conditionalDescribe('Requisitions CRUD', () => {
  let createdReqId = '';

  test('POST /api/requisitions creates new requisition', async () => {
    const res = await request(app)
      .post('/api/requisitions')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send({
        type: 'Admin', title: 'Test Requisition - Office Supplies',
        department: 'Test Department', currency: 'ZMW',
        items: [
          { description: 'Test Item 1', category: 'Office Admin', quantity: 2, unitPrice: 1500 },
          { description: 'Test Item 2', category: 'Consumables', quantity: 5, unitPrice: 300 }
        ]
      });
    expect(res.status).toBe(201);
    expect(res.body.requisition.req_id).toMatch(/^REQ-/);
    expect(res.body.requisition.status).toBe('Pending');
    createdReqId = res.body.requisition.req_id;
    testReqId = createdReqId;
  });

  test('POST /api/requisitions without Requestor role returns 403', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test.1st.approver@test.co.zm', password: 'testpass123' });
    const approverToken = loginRes.body.token;

    const res = await request(app)
      .post('/api/requisitions')
      .set('Authorization', `Bearer ${approverToken}`)
      .send({ type: 'Admin', title: 'Should Fail', department: 'Test', currency: 'ZMW',
        items: [{ description: 'Item', category: 'Office Admin', quantity: 1, unitPrice: 100 }] });
    expect(res.status).toBe(403);
  });

  test('GET /api/requisitions lists requisitions', async () => {
    const res = await request(app)
      .get('/api/requisitions')
      .set('Authorization', `Bearer ${testUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.requisitions.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/requisitions/:id returns single requisition', async () => {
    const res = await request(app)
      .get(`/api/requisitions/${createdReqId}`)
      .set('Authorization', `Bearer ${testUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.requisition.req_id).toBe(createdReqId);
    expect(res.body.requisition.items).toBeDefined();
    expect(res.body.requisition.items.length).toBe(2);
    expect(res.body.requisition.history).toBeDefined();
  });
});

conditionalDescribe('Full Approval Workflow', () => {
  let firstApproverToken = '', secondApproverToken = '', thirdApproverToken = '', finalApproverToken = '', treasurerToken = '';

  beforeAll(async () => {
    const users = [
      { email: 'test.1st.approver@test.co.zm', role: '1st Approver' },
      { email: 'test.2nd.approver@test.co.zm', role: '2nd Approver' },
      { email: 'test.3rd.approver@test.co.zm', role: '3rd Approver' },
      { email: 'test.final.approver@test.co.zm', role: 'Final Approver' },
      { email: 'test.treasurer@test.co.zm', role: 'Treasurer' }
    ];
    for (const u of users) {
      const res = await request(app).post('/api/auth/login').send({ email: u.email, password: 'testpass123' });
      if (u.role === '1st Approver') firstApproverToken = res.body.token;
      if (u.role === '2nd Approver') secondApproverToken = res.body.token;
      if (u.role === '3rd Approver') thirdApproverToken = res.body.token;
      if (u.role === 'Final Approver') finalApproverToken = res.body.token;
      if (u.role === 'Treasurer') treasurerToken = res.body.token;
    }
  });

  test('Step 1: 1st Approver approves (Pending -> 1st Approver stage)', async () => {
    const res = await request(app)
      .post(`/api/requisitions/${testReqId}/approve`).set('Authorization', `Bearer ${firstApproverToken}`)
      .send({ action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('1st Approver stage');
    expect(res.body.signature).toBeDefined();
  });

  test('Step 2: 2nd Approver approves (1st Approver stage -> 2nd Approver Stage)', async () => {
    const res = await request(app)
      .post(`/api/requisitions/${testReqId}/approve`).set('Authorization', `Bearer ${secondApproverToken}`)
      .send({ action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('2nd Approver Stage');
    expect(res.body.signature).toBeDefined();
  });

  test('Step 3: 3rd Approver approves (2nd Approver Stage -> 3rd Approver Stage)', async () => {
    const res = await request(app)
      .post(`/api/requisitions/${testReqId}/approve`).set('Authorization', `Bearer ${thirdApproverToken}`)
      .send({ action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('3rd Approver Stage');
  });

  test('Step 4: Final Approver approves (3rd Approver Stage -> Final Approver)', async () => {
    const res = await request(app)
      .post(`/api/requisitions/${testReqId}/approve`).set('Authorization', `Bearer ${finalApproverToken}`)
      .send({ action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Final Approver');
  });

  test('Step 5: Treasurer queues (Final Approver -> Pending Disbursement)', async () => {
    const res = await request(app)
      .post(`/api/requisitions/${testReqId}/queue-disbursement`).set('Authorization', `Bearer ${treasurerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Pending Disbursement');
  });

  test('Step 6: Treasurer disburses (Pending Disbursement -> Issued)', async () => {
    const res = await request(app)
      .post(`/api/requisitions/${testReqId}/disburse`).set('Authorization', `Bearer ${treasurerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Issued');
  });

  test('Step 7: Requestor submits receipts (Issued -> Change Returned/Pending)', async () => {
    const res = await request(app)
      .post(`/api/requisitions/${testReqId}/submit-receipts`).set('Authorization', `Bearer ${testUserToken}`)
      .send({ notes: 'All receipts filed.' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Change Returned/Pending');
  });

  test('Step 8: Treasurer clears (Change Returned/Pending -> Change Cleared)', async () => {
    const res = await request(app)
      .post(`/api/requisitions/${testReqId}/clear`).set('Authorization', `Bearer ${treasurerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Change Cleared');
  });

  test('Step 9: Verify closed requisition', async () => {
    const res = await request(app)
      .get(`/api/requisitions/${testReqId}`).set('Authorization', `Bearer ${testUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.requisition.status).toBe('Change Cleared');
    expect(res.body.requisition.history.length).toBeGreaterThanOrEqual(9);
  });
});

conditionalDescribe('Rejection Flow', () => {
  let reqId = '';

  test('Create and reject a requisition', async () => {
    const createRes = await request(app)
      .post('/api/requisitions').set('Authorization', `Bearer ${testUserToken}`)
      .send({ type: 'Shop Use', title: 'Test Rejection Flow', department: 'Test', currency: 'ZMW',
        items: [{ description: 'Test Item', category: 'Consumables', quantity: 1, unitPrice: 500 }] });
    reqId = createRes.body.requisition.req_id;

    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'test.1st.approver@test.co.zm', password: 'testpass123' });

    const res = await request(app)
      .post(`/api/requisitions/${reqId}/approve`).set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({ action: 'reject', reason: 'Incorrect item specification' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Rejected');
  });

  test('Rejected requisition cannot be approved again', async () => {
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'test.1st.approver@test.co.zm', password: 'testpass123' });

    const res = await request(app)
      .post(`/api/requisitions/${reqId}/approve`).set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({ action: 'approve' });
    expect(res.status).toBe(400);
  });

  test('Rejection without reason fails', async () => {
    const createRes = await request(app)
      .post('/api/requisitions').set('Authorization', `Bearer ${testUserToken}`)
      .send({ type: 'Admin', title: 'Test No Reason', department: 'Test', currency: 'USD',
        items: [{ description: 'Item', category: 'Office Admin', quantity: 1, unitPrice: 100 }] });

    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'test.1st.approver@test.co.zm', password: 'testpass123' });

    const res = await request(app)
      .post(`/api/requisitions/${createRes.body.requisition.req_id}/approve`)
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({ action: 'reject', reason: '' });
    expect(res.status).toBe(400);
  });
});

conditionalDescribe('QR Verification API', () => {
  test('POST /api/requisitions/verify-qr validates a genuine QR', async () => {
    const cryptoService = require('../src/services/cryptoService');
    const vp = cryptoService.createVerificationPayload('REQ-VALID-001', 'Mutale Chilufya', '1st Approver', 'Pending', '2026-06-09 14:00');

    const res = await request(app)
      .post('/api/requisitions/verify-qr').set('Authorization', `Bearer ${testUserToken}`)
      .send({ qrData: vp.qrData });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.payload.signer).toBe('Mutale Chilufya');
  });

  test('POST /api/requisitions/verify-qr rejects tampered QR', async () => {
    const cryptoService = require('../src/services/cryptoService');
    const vp = cryptoService.createVerificationPayload('REQ-TAMPER-001', 'Bwalya Tembo', 'Treasurer', 'Final Approver', '2026-06-09 15:00');

    const parsed = JSON.parse(vp.qrData);
    parsed.role = 'Hacker';
    const tampered = JSON.stringify(parsed);

    const res = await request(app)
      .post('/api/requisitions/verify-qr').set('Authorization', `Bearer ${testUserToken}`)
      .send({ qrData: tampered });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
  });
});

conditionalDescribe('Shop Use Workflow (skips 2nd/3rd Approver)', () => {
  let shopReqId = '';
  let firstApproverToken = '';
  let finalApproverToken = '';
  let treasurerToken = '';

  beforeAll(async () => {
    const r1 = await request(app).post('/api/auth/login').send({ email: 'test.1st.approver@test.co.zm', password: 'testpass123' });
    firstApproverToken = r1.body.token;
    const r2 = await request(app).post('/api/auth/login').send({ email: 'test.final.approver@test.co.zm', password: 'testpass123' });
    finalApproverToken = r2.body.token;
    const r3 = await request(app).post('/api/auth/login').send({ email: 'test.treasurer@test.co.zm', password: 'testpass123' });
    treasurerToken = r3.body.token;
  });

  test('Create Shop Use requisition', async () => {
    const res = await request(app)
      .post('/api/requisitions').set('Authorization', `Bearer ${testUserToken}`)
      .send({ type: 'Shop Use', title: 'Test Shop Use - Drill Bits', department: 'Test', currency: 'USD',
        items: [{ description: 'Diamond Drill Bit', category: 'Drills & Tools', quantity: 10, unitPrice: 650 }] });
    expect(res.status).toBe(201);
    shopReqId = res.body.requisition.req_id;
  });

  test('1st Approver approves (Pending -> 1st Approver stage)', async () => {
    const res = await request(app)
      .post(`/api/requisitions/${shopReqId}/approve`).set('Authorization', `Bearer ${firstApproverToken}`)
      .send({ action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('1st Approver stage');
  });

  test('2nd Approver CANNOT approve Shop Use', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'test.2nd.approver@test.co.zm', password: 'testpass123' });
    const res = await request(app)
      .post(`/api/requisitions/${shopReqId}/approve`).set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({ action: 'approve' });
    expect(res.status).toBe(403);
  });

  test('Final Approver directly approves (skips 2nd/3rd)', async () => {
    const res = await request(app)
      .post(`/api/requisitions/${shopReqId}/approve`).set('Authorization', `Bearer ${finalApproverToken}`)
      .send({ action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Final Approver');
  });

  test('Complete Shop Use cycle to cleared', async () => {
    let res = await request(app)
      .post(`/api/requisitions/${shopReqId}/queue-disbursement`).set('Authorization', `Bearer ${treasurerToken}`);
    expect(res.status).toBe(200);

    res = await request(app)
      .post(`/api/requisitions/${shopReqId}/disburse`).set('Authorization', `Bearer ${treasurerToken}`);
    expect(res.status).toBe(200);

    res = await request(app)
      .post(`/api/requisitions/${shopReqId}/submit-receipts`).set('Authorization', `Bearer ${testUserToken}`)
      .send({ notes: 'Filed' });
    expect(res.status).toBe(200);

    res = await request(app)
      .post(`/api/requisitions/${shopReqId}/clear`).set('Authorization', `Bearer ${treasurerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Change Cleared');
  });
});

conditionalDescribe('Pending Actions', () => {
  test('GET /api/requisitions/pending returns pending items', async () => {
    const res = await request(app)
      .get('/api/requisitions/pending').set('Authorization', `Bearer ${testUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.requisitions).toBeDefined();
  });
});

conditionalDescribe('Users API', () => {
  test('GET /api/users lists users', async () => {
    const res = await request(app)
      .get('/api/users').set('Authorization', `Bearer ${testUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThanOrEqual(6);
  });
});

conditionalDescribe('Emails API', () => {
  test('GET /api/emails returns emails for user role', async () => {
    const res = await request(app)
      .get('/api/emails').set('Authorization', `Bearer ${testUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.emails).toBeDefined();
  });
});
