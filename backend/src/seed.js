require('dotenv').config();
const bcrypt = require('bcrypt');
const { query, initializeDatabase } = require('./config/database');

const ADMIN_EMAIL = 'lodzax@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123';

const USERS = [
  { name: 'lodzax', role: 'Admin', email: ADMIN_EMAIL, dept: 'Administration', password: ADMIN_PASSWORD }
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

async function purge() {
  await initializeDatabase();

  const adminResult = await query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
  if (adminResult.rows.length === 0) {
    console.log('Admin user not found — running seed first');
    await seed();
  }

  const otherUsers = await query('SELECT id, name, email, role FROM users WHERE email != $1', [ADMIN_EMAIL]);

  if (otherUsers.rows.length === 0) {
    console.log('No dummy users to purge — system is clean');
    return { purged: 0 };
  }

  const ids = otherUsers.rows.map(u => u.id);

  console.log(`Purging ${otherUsers.rows.length} dummy user(s):`);
  for (const u of otherUsers.rows) {
    console.log(`  - ${u.name} (${u.email}) [${u.role}]`);
  }

  // Nullify FK references, then delete
  await query(`UPDATE requisitions SET requestor_id = NULL WHERE requestor_id = ANY($1::int[])`, [ids]);
  await query(`UPDATE approvals SET user_id = NULL WHERE user_id = ANY($1::int[])`, [ids]);
  await query(`UPDATE audit_logs SET user_id = NULL WHERE user_id = ANY($1::int[])`, [ids]);
  await query(`DELETE FROM users WHERE id = ANY($1::int[])`, [ids]);

  console.log(`Purged ${otherUsers.rows.length} dummy user(s) successfully`);
  return { purged: otherUsers.rows.length };
}

// Run when invoked directly via `node src/seed.js`
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('purge')) {
    purge().then(() => process.exit(0)).catch(() => process.exit(1));
  } else {
    seed().then(() => process.exit(0)).catch(() => process.exit(1));
  }
}

module.exports = { seed, purge, USERS };
