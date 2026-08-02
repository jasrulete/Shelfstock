// Seed two demo accounts so reviewers can try both sides of the app:
//   admin@shelfstock.demo   / ShelfAdmin123    (admin  — dashboard, order mgmt)
//   shopper@shelfstock.demo / ShelfShopper123  (customer — browse, checkout)
//
// Idempotent: re-running only resets these two demo accounts' passwords, never
// touches real users, products, or orders. Run it wherever DATABASE_URL points:
//   local:   node scripts/seed-demo-users.js
//   Railway: railway run node scripts/seed-demo-users.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DEMO_USERS = [
  { email: 'admin@shelfstock.demo', password: 'ShelfAdmin123', role: 'admin' },
  { email: 'shopper@shelfstock.demo', password: 'ShelfShopper123', role: 'customer' },
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  for (const u of DEMO_USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email)
       DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
      [u.email, hash, u.role]
    );
    console.log(`seeded ${u.role.padEnd(8)} ${u.email}  /  ${u.password}`);
  }
  await seedDemoActivity();

  await pool.end();
  console.log('\nDemo accounts ready.');
}

/**
 * Reviews need reviewers, and one review per product is a thin demonstration -
 * UNIQUE (product_id, user_id) means a single account can only ever leave one.
 * So the demo gets three shoppers rather than one.
 *
 * Each also gets a completed order containing what they reviewed. That isn't
 * padding: it's what makes verified_purchase true and gives the review a real
 * name instead of a masked email, so the trust signals on the page are the
 * genuine article rather than a hardcoded badge. It also gives the admin
 * dashboard, CRM segments and revenue chart something to show.
 */
const DEMO_SHOPPERS = [
  {
    email: 'shopper@shelfstock.demo',
    name: 'Demo Shopper',
    city: 'Cebu City',
    reviews: [
      { product: 'Mechanical Keyboard', rating: 5, body: 'Typing on it all day and the brown switches are perfect for an open office. Hot-swap meant I could try three switch types without soldering anything.' },
      { product: 'Wireless Mouse', rating: 4, body: 'Battery has lasted two months on one charge. Slightly small if you have large hands.' },
    ],
  },
  {
    email: 'maria@shelfstock.demo',
    name: 'Maria Reyes',
    city: 'Quezon City',
    reviews: [
      { product: 'Mechanical Keyboard', rating: 4, body: 'Great board overall. Knocked one star off because the keycaps feel a bit thin for the price.' },
      { product: 'Stainless Steel Water Bottle', rating: 5, body: 'Still had ice in it after a full day in the car. Does exactly what it claims.' },
    ],
  },
  {
    email: 'aldrin@shelfstock.demo',
    name: 'Aldrin Cruz',
    city: 'Davao City',
    reviews: [
      { product: 'The Pragmatic Programmer', rating: 5, body: 'Worth re-reading every couple of years. The chapter on orthogonality alone paid for the book.' },
      { product: 'Cotton T-Shirt', rating: 3, body: 'Fabric is decent but it shrank about half a size in the wash. Size up.' },
    ],
  },
];

async function seedDemoActivity() {
  let orders = 0;
  let reviews = 0;

  for (const shopper of DEMO_SHOPPERS) {
    const hash = await bcrypt.hash('ShelfShopper123', 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'customer')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [shopper.email, hash]
    );
    const userId = rows[0].id;
    const productNames = shopper.reviews.map((r) => r.product);

    // One order per shopper, created only once. Stock is decremented in the
    // same transaction the order is written in, exactly like a real checkout -
    // seeding orders without touching stock would leave the inventory numbers
    // this store is built around quietly wrong.
    const existing = await pool.query('SELECT 1 FROM orders WHERE user_id = $1 LIMIT 1', [userId]);
    if (existing.rows.length === 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const items = await client.query(
          `SELECT id, price FROM products WHERE name = ANY($1::text[]) AND stock > 0 FOR UPDATE`,
          [productNames]
        );
        if (items.rows.length > 0) {
          const total = items.rows.reduce((sum, p) => sum + Number(p.price), 0);
          const order = await client.query(
            `INSERT INTO orders (user_id, total_amount, currency, status, payment_method,
                                 shipping_name, shipping_phone, shipping_address, shipping_city)
             VALUES ($1, $2, 'USD', 'completed', 'cod', $3, '+63 900 000 0000', '1 Demo Street', $4)
             RETURNING id`,
            [userId, total.toFixed(2), shopper.name, shopper.city]
          );
          for (const p of items.rows) {
            await client.query(
              `INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
               VALUES ($1, $2, 1, $3)`,
              [order.rows[0].id, p.id, p.price]
            );
            await client.query('UPDATE products SET stock = stock - 1 WHERE id = $1', [p.id]);
          }
          orders++;
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    for (const r of shopper.reviews) {
      const result = await pool.query(
        `INSERT INTO reviews (product_id, user_id, rating, body, verified_purchase)
         SELECT p.id, $1, $2, $3,
                EXISTS (
                  SELECT 1 FROM order_items oi
                  JOIN orders o ON o.id = oi.order_id
                  WHERE o.user_id = $1 AND oi.product_id = p.id AND o.status <> 'cancelled'
                )
         FROM products p WHERE p.name = $4
         ON CONFLICT (product_id, user_id) DO NOTHING`,
        [userId, r.rating, r.body, r.product]
      );
      reviews += result.rowCount ?? 0;
    }
  }

  console.log(`seeded ${orders} demo order(s) and ${reviews} review(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
