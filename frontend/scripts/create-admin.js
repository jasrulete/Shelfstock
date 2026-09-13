// Promote an existing user to admin.
// Usage: node scripts/create-admin.js user@example.com
// (register the account through the app first, then run this)
require('dotenv').config();
const { Pool } = require('pg');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/create-admin.js <email>');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
// Same rule as server/db/index.ts: local Postgres speaks plaintext, a hosted
// one gets TLS with the certificate verified. This script carries the
// credential that can promote an account to admin, so it is the last place to turn verification off.
const isLocal =
  connectionString?.includes('localhost') ||
  connectionString?.includes('127.0.0.1') ||
  connectionString?.includes('@db:');

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: true },
});

pool
  .query(`UPDATE users SET role = 'admin' WHERE email = $1 RETURNING id, email, role`, [
    email.trim().toLowerCase(),
  ])
  .then((result) => {
    if (result.rows.length === 0) {
      console.error(`No user found with email "${email}". Register the account first.`);
      process.exit(1);
    }
    console.log(`${result.rows[0].email} is now an admin.`);
    return pool.end();
  })
  .catch((err) => {
    console.error('Failed to promote user:', err.message);
    process.exit(1);
  });
