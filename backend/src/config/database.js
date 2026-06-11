const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false
    });

    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
  }
  return pool;
}

async function query(text, params) {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

async function transaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function initializeDatabase() {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      role VARCHAR(50) NOT NULL,
      department VARCHAR(255),
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS requisitions (
      id SERIAL PRIMARY KEY,
      req_id VARCHAR(50) UNIQUE NOT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      department VARCHAR(255),
      requestor_id INTEGER REFERENCES users(id),
      currency VARCHAR(10) NOT NULL,
      status VARCHAR(100) NOT NULL DEFAULT 'Pending',
      rejection_reason TEXT,
      total_amount DECIMAL(12,2) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      requisition_id INTEGER REFERENCES requisitions(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      category VARCHAR(100),
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(12,2) NOT NULL,
      total_price DECIMAL(12,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id SERIAL PRIMARY KEY,
      requisition_id INTEGER REFERENCES requisitions(id) ON DELETE CASCADE,
      stage VARCHAR(100),
      action VARCHAR(50) NOT NULL,
      user_id INTEGER REFERENCES users(id),
      reason TEXT,
      signature TEXT,
      public_key_pem TEXT,
      timestamp TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS emails (
      id SERIAL PRIMARY KEY,
      from_address VARCHAR(255),
      to_address VARCHAR(255),
      recipient_name VARCHAR(255),
      subject TEXT,
      body TEXT,
      req_id VARCHAR(50),
      target_role VARCHAR(50),
      read BOOLEAN DEFAULT false,
      timestamp TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      user_name VARCHAR(255) NOT NULL,
      user_role VARCHAR(50) NOT NULL,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50),
      entity_id VARCHAR(50),
      details TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_requisitions_status ON requisitions(status);
    CREATE INDEX IF NOT EXISTS idx_requisitions_requestor ON requisitions(requestor_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_requisition ON approvals(requisition_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
  `;

  await query(schema);
  console.log('Database schema initialized successfully');
}

module.exports = {
  getPool,
  query,
  transaction,
  initializeDatabase
};
