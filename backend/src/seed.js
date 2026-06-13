require('dotenv').config();
const bcrypt = require('bcrypt');
const { query, initializeDatabase } = require('./config/database');

const USERS = [
  { name: 'lodzax', role: 'Admin', email: 'lodzax@gmail.com', dept: 'Administration', password: 'password123' }
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

// Run when invoked directly via `node src/seed.js`
if (require.main === module) {
  seed().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { seed, USERS };
