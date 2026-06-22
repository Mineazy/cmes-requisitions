const mysql = require('mysql2/promise');

let pool = null;

function getPoolConfig() {
  const url = process.env.DATABASE_URL || '';
  const dbUser = process.env.DB_USER;
  const dbPass = process.env.DB_PASSWORD;
  const dbHost = process.env.DB_HOST;
  const dbPort = process.env.DB_PORT || '4000';
  const dbName = process.env.DB_NAME || 'cmes_requisitions';

  const base = {
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  };

  let config;
  let sslEnabled = false;

  if (dbUser && dbPass && dbHost) {
    config = { ...base, host: dbHost, port: parseInt(dbPort), user: dbUser, password: dbPass, database: dbName };
    sslEnabled = process.env.DB_SSL === 'true';
  } else if (url) {
    config = { ...base, uri: url };
    sslEnabled = url.includes('tidbcloud.com') || url.includes('ssl=') || process.env.DB_SSL === 'true';
  } else {
    config = { ...base, host: 'localhost', port: 3306, user: 'root', password: '', database: 'cmes_requisitions' };
  }

  if (sslEnabled) {
    config.ssl = { rejectUnauthorized: true };
  }
  return { config, dbName };
}

function getPool() {
  if (!pool) {
    const { config } = getPoolConfig();
    pool = mysql.createPool(config);
    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
  }
  return pool;
}

async function query(sql, params) {
  const [rowsOrResult] = await getPool().query(sql, params);
  if (Array.isArray(rowsOrResult)) {
    return { rows: rowsOrResult };
  }
  return { rows: [], insertId: rowsOrResult.insertId, affectedRows: rowsOrResult.affectedRows };
}

async function transaction(callback) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const wrappedQuery = async (sql, params) => {
      const [rowsOrResult] = await conn.query(sql, params);
      if (Array.isArray(rowsOrResult)) {
        return { rows: rowsOrResult };
      }
      return { rows: [], insertId: rowsOrResult.insertId, affectedRows: rowsOrResult.affectedRows };
    };
    const result = await callback({ query: wrappedQuery, connection: conn });
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function initializeDatabase() {
  // Bootstrap: ensure database exists (connect without a specific database)
  const { config, dbName } = getPoolConfig();
  const { database: _, ...bootstrapConfig } = config;
  const bootstrapConn = await mysql.createConnection(bootstrapConfig);
  try {
    await bootstrapConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`Database "${dbName}" ensured`);
  } catch (err) {
    console.warn('Could not auto-create database:', err.message);
  }
  await bootstrapConn.end();

  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      role VARCHAR(50) NOT NULL,
      department VARCHAR(255),
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS requisitions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      req_id VARCHAR(50) UNIQUE NOT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      department VARCHAR(255),
      requestor_id INT,
      currency VARCHAR(10) NOT NULL,
      status VARCHAR(100) NOT NULL DEFAULT 'Pending',
      rejection_reason TEXT,
      total_amount DECIMAL(12,2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requisition_id INT,
      description TEXT NOT NULL,
      category VARCHAR(100),
      quantity INT NOT NULL,
      unit_price DECIMAL(12,2) NOT NULL,
      total_price DECIMAL(12,2) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS approvals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requisition_id INT,
      stage VARCHAR(100),
      action VARCHAR(50) NOT NULL,
      user_id INT,
      reason TEXT,
      signature TEXT,
      public_key_pem TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS emails (
      id INT AUTO_INCREMENT PRIMARY KEY,
      from_address VARCHAR(255),
      to_address VARCHAR(255),
      recipient_name VARCHAR(255),
      subject TEXT,
      body TEXT,
      req_id VARCHAR(50),
      target_role VARCHAR(50),
      read TINYINT(1) DEFAULT 0,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      user_name VARCHAR(255) NOT NULL,
      user_role VARCHAR(50) NOT NULL,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50),
      entity_id VARCHAR(50),
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  const statements = schema.split(';').filter(s => s.trim());
  for (const stmt of statements) {
    try {
      await query(stmt);
    } catch (err) {
      console.error('Schema init error:', err.message);
      throw err;
    }
  }

  // Create indexes separately (IF NOT EXISTS for indexes is MySQL 8+; TiDB supports it)
  try {
    await query('CREATE INDEX IF NOT EXISTS idx_requisitions_status ON requisitions(status)');
    await query('CREATE INDEX IF NOT EXISTS idx_requisitions_requestor ON requisitions(requestor_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_approvals_requisition ON approvals(requisition_id)');
  } catch (err) {
    console.warn('Index creation note:', err.message);
  }

  console.log('Database schema initialized successfully');
}

module.exports = {
  getPool,
  query,
  transaction,
  initializeDatabase
};