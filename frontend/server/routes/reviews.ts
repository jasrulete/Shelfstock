import { Router } from 'express';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';

// mergeParams so ':productId' from the parent mount in routes/products.ts is
// visible here.
const router = Router({ mergeParams: true });

const MAX_BODY = 2000;

function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * A public, non-identifying name for a reviewer.
 *
 * Users are only ever identified by email in this schema, and publishing those
 * on a product page would leak every customer's address to anyone browsing.
 * Prefer the name they shipped an order to, reduced to "Jeric R."; otherwise
 * mask the email local part. Neither form is reversible to an address.
 */
export function displayName(shippingName: string | null, email: string): string {
  const name = shippingName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  }
  const local = email.split('@')[0] ?? 'someone';
  return `${local.slice(0, 2)}***`;
}

/**
 * GET /api/products/:productId/reviews
 * Public. Newest first, with the same page/limit convention as every other
 * list in this API.
 */
router.get('/', async (req, res) => {
  const productId = parseId((req.params as { productId: string }).productId);
  if (productId === null) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? '10', 10) || 10));
  const offset = (page - 1) * limit;

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(AVG(rating), 0)::float AS average
       FROM reviews WHERE product_id = $1`,
      [productId]
    );
    const { total, average } = countResult.rows[0] as { total: number; average: number };

    const result = await pool.query(
      `SELECT r.id, r.rating, r.body, r.verified_purchase, r.created_at,
              u.email,
              latest.shipping_name
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN LATERAL (
         SELECT shipping_name FROM orders
         WHERE user_id = r.user_id AND shipping_name IS NOT NULL
         ORDER BY created_at DESC LIMIT 1
       ) latest ON true
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [productId, limit, offset]
    );

    res.json({
      reviews: result.rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        body: row.body,
        verified_purchase: row.verified_purchase,
        created_at: row.created_at,
        // Email never leaves the server.
        reviewer: displayName(row.shipping_name, row.email),
      })),
      summary: { average, total },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('List reviews error:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

/**
 * POST /api/products/:productId/reviews
 *
 * Upserts: posting again replaces your own review rather than 409-ing or
 * stacking a second one. The UNIQUE (product_id, user_id) constraint is what
 * makes that safe under concurrent submits.
 */
router.post('/', requireAuth, async (req, res) => {
  const productId = parseId((req.params as { productId: string }).productId);
  if (productId === null) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const { rating, body } = req.body ?? {};
  if (!Number.isSafeInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'rating must be a whole number from 1 to 5' });
  }
  if (body !== undefined && body !== null && typeof body !== 'string') {
    return res.status(400).json({ error: 'body must be a string' });
  }
  const trimmedBody = typeof body === 'string' ? body.trim() : null;
  if (trimmedBody && trimmedBody.length > MAX_BODY) {
    return res.status(400).json({ error: `body must be ${MAX_BODY} characters or fewer` });
  }

  const userId = req.user!.userId;

  try {
    const product = await pool.query('SELECT id FROM products WHERE id = $1', [productId]);
    if (product.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Cancelled orders don't count - the goods went back on the shelf, so the
    // purchase they'd be verifying never completed.
    const purchased = await pool.query(
      `SELECT 1
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.user_id = $1 AND oi.product_id = $2 AND o.status <> 'cancelled'
       LIMIT 1`,
      [userId, productId]
    );
    const verified = purchased.rows.length > 0;

    const result = await pool.query(
      `INSERT INTO reviews (product_id, user_id, rating, body, verified_purchase)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (product_id, user_id)
       DO UPDATE SET rating = EXCLUDED.rating,
                     body = EXCLUDED.body,
                     verified_purchase = EXCLUDED.verified_purchase,
                     created_at = now()
       RETURNING id, rating, body, verified_purchase, created_at`,
      [productId, userId, rating, trimmedBody || null, verified]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create review error:', err);
    res.status(500).json({ error: 'Failed to save review' });
  }
});

export default router;
