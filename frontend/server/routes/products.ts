import { Router } from 'express';
import { pool } from '../db';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { adminOnly } from '../middleware/adminOnly';
import { CLIENT_STOCK_SOURCES, recordStockAdjustment, type StockSource } from '../stockLedger';
import reviewsRouter from './reviews';
import {
  ProductListParams,
  getProductById,
  listLowStock,
  listProducts,
} from '../queries/products';

const router = Router();

// Nested resource: /api/products/:productId/reviews. A two-segment path can
// never collide with the one-segment '/:id' below, but it is mounted first so
// the nesting is obvious when reading the file top to bottom.
router.use('/:productId/reviews', reviewsRouter);

/**
 * Rating aggregate joined onto product reads.
 *
 * Grouped once in a subquery rather than a correlated subquery per row, and
 * left-joined so a product with no reviews still comes back (as 0/0) instead
 * of disappearing from the listing.
 */
const RATING_JOIN = `
  LEFT JOIN (
    SELECT product_id, AVG(rating) AS average, COUNT(*) AS total
    FROM reviews
    GROUP BY product_id
  ) r ON r.product_id = p.id
`;

const RATING_COLUMNS = `
  COALESCE(r.average, 0)::float AS rating_average,
  COALESCE(r.total, 0)::int AS rating_count
`;

const SORTABLE_COLUMNS = new Set(['price', 'name', 'created_at']);

function parseId(raw: string): number | null {
  // Reject anything that isn't a plain positive integer so bad ids become
  // a 404, never a pg cast error surfacing as a 500.
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// pg raises 23505 on unique violations; the constraint name tells us which
// column so other unique constraints keep their own error handling.
function isBarcodeConflict(err: any): boolean {
  return err?.code === '23505' && String(err?.constraint ?? '').includes('barcode');
}

// Shared field validation for create/update. Returns an error message or
// null. For updates, missing (undefined) fields are allowed and left as-is.
function validateProductFields(body: any, requireAll: boolean): string | null {
  const { name, description, price, category, stock, image_url, barcode } = body ?? {};

  if (requireAll && (name === undefined || price === undefined || category === undefined)) {
    return 'name, price, and category are required';
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 255)) {
    return 'name must be a non-empty string (max 255 chars)';
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return 'description must be a string';
  }
  if (price !== undefined && (typeof price !== 'number' || !Number.isFinite(price) || price < 0)) {
    return 'price must be a non-negative number';
  }
  if (category !== undefined && (typeof category !== 'string' || !category.trim() || category.length > 100)) {
    return 'category must be a non-empty string (max 100 chars)';
  }
  if (stock !== undefined && (!Number.isSafeInteger(stock) || stock < 0)) {
    return 'stock must be a non-negative whole number';
  }
  if (image_url !== undefined && image_url !== null && typeof image_url !== 'string') {
    return 'image_url must be a string';
  }
  if (barcode !== undefined && barcode !== null && (typeof barcode !== 'string' || !barcode.trim() || barcode.trim().length > 64)) {
    return 'barcode must be a non-empty string (max 64 chars)';
  }
  if (body?.images !== undefined) {
    if (!Array.isArray(body.images) || body.images.some((u: unknown) => typeof u !== 'string')) {
      return 'images must be an array of strings';
    }
    if (body.images.length > 8) {
      return 'a product can have at most 8 gallery images';
    }
  }
  return null;
}

/**
 * Replaces a product's gallery with `images`, in the given order.
 *
 * Delete-then-insert rather than diffing: the list is at most eight rows and
 * ordering is part of the payload, so reconciling in place would be more code
 * for no benefit. Runs on a caller-supplied client so it joins the caller's
 * transaction - a product whose gallery half-updated would be worse than one
 * that didn't update at all.
 */
async function replaceGallery(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  productId: number,
  images: string[]
): Promise<void> {
  await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
  const urls = images.map((u) => u.trim()).filter(Boolean);
  for (let i = 0; i < urls.length; i++) {
    await client.query(
      'INSERT INTO product_images (product_id, url, position) VALUES ($1, $2, $3)',
      [productId, urls[i], i]
    );
  }
}

/**
 * GET /api/products
 * Query params: search, category, minPrice, maxPrice, sort, order, page, limit
 *
 * Pagination is done in SQL with LIMIT/OFFSET rather than fetching every row
 * and slicing in JS. That keeps memory flat and query time proportional to
 * the page size regardless of how large the products table gets.
 */
router.get('/', async (req, res) => {
  try {
    res.json(await listProducts(req.query as ProductListParams));
  } catch (err) {
    console.error('List products error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * GET /api/products/low-stock
 *
 * Public, unlike the admin dashboard's /api/analytics/low-stock. The storefront
 * uses this to merchandise scarcity, so it deliberately excludes sold-out items
 * - there is nothing to sell in a "0 left" row. It exposes nothing a shopper
 * can't already read off a product card.
 *
 * MUST stay above the '/:id' route below: Express matches in declaration order,
 * and '/:id' would otherwise swallow '/low-stock' and 404 on parseId().
 */
router.get('/low-stock', async (req, res) => {
  try {
    res.json(await listLowStock(req.query as { threshold?: string; limit?: string }));
  } catch (err) {
    console.error('Low stock products error:', err);
    res.status(500).json({ error: 'Failed to fetch low stock products' });
  }
});

/**
 * GET /api/products/:id/related
 *
 * Same category, excluding the product itself and anything sold out - a
 * "you might also like" row that leads to an out-of-stock page is a dead end.
 * Two-segment path, so it can't collide with '/:id'.
 */
router.get('/:id/related', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ error: 'Product not found' });
  }
  const limit = Math.min(8, Math.max(1, parseInt((req.query.limit as string) ?? '4', 10) || 4));

  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.description, p.price, p.category, p.stock, p.image_url,
              p.created_at,
              ${RATING_COLUMNS}
       FROM products p
       ${RATING_JOIN}
       WHERE p.category = (SELECT category FROM products WHERE id = $1)
         AND p.id <> $1
         AND p.stock > 0
       ORDER BY r.average DESC NULLS LAST, p.created_at DESC
       LIMIT $2`,
      [id, limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Related products error:', err);
    res.status(500).json({ error: 'Failed to fetch related products' });
  }
});

/**
 * GET /api/products/barcode/:code - admin lookup used by the companion
 * app's scanner. Registered before '/:id' so the literal path wins.
 */
router.get('/barcode/:code', requireAuth, adminOnly, async (req, res) => {
  const code = req.params.code.trim();
  if (!code || code.length > 64) {
    return res.status(400).json({ error: 'Invalid barcode' });
  }
  try {
    const result = await pool.query('SELECT * FROM products WHERE barcode = $1', [code]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'No product with this barcode' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Barcode lookup error:', err);
    res.status(500).json({ error: 'Failed to look up barcode' });
  }
});

// optionalAuth, not requireAuth: the product page is public, but a signed-in
// admin also gets the barcode because the companion's edit form round-trips it.
router.get('/:id', optionalAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ error: 'Product not found' });
  }

  try {
    const product = await getProductById(id, { includeBarcode: req.user?.role === 'admin' });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.post('/', requireAuth, adminOnly, async (req, res) => {
  const validationError = validateProductFields(req.body, true);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { name, description, price, category, stock, image_url, images, barcode } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO products (name, description, price, category, stock, image_url, barcode)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name.trim(), description ?? null, price, category.trim(), stock ?? 0, image_url || null, barcode ? barcode.trim() : null]
    );
    if (Array.isArray(images)) {
      await replaceGallery(client, result.rows[0].id, images);
    }
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (isBarcodeConflict(err)) {
      return res.status(409).json({ error: 'A product with this barcode already exists' });
    }
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  } finally {
    client.release();
  }
});

router.put('/:id', requireAuth, adminOnly, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const validationError = validateProductFields(req.body, false);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const body = req.body ?? {};
  const { name, description, price, category, stock, image_url, images, barcode } = body;

  // description, image_url, and barcode are nullable columns, so "key absent"
  // and "key present with null" must be distinguishable - COALESCE alone
  // can't tell them apart. A CASE WHEN driven by presence lets an explicit
  // null through while an omitted key still leaves the column untouched.
  const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');
  const hasImageUrl = Object.prototype.hasOwnProperty.call(body, 'image_url');
  const hasBarcode = Object.prototype.hasOwnProperty.call(body, 'barcode');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Setting stock through the form is a stock change like any other, and
    // the ledger has to see it or it is only a partial log. The row is locked
    // first so the before/after pair is exact even against a concurrent
    // checkout - the same lock POST /orders takes.
    let stockBefore: number | null = null;
    if (stock !== undefined) {
      const current = await client.query('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [id]);
      stockBefore = current.rows[0]?.stock ?? null;
    }
    const result = await client.query(
      `UPDATE products
       SET name = COALESCE($1, name),
           description = CASE WHEN $2 THEN $3 ELSE description END,
           price = COALESCE($4, price),
           category = COALESCE($5, category),
           stock = COALESCE($6, stock),
           image_url = CASE WHEN $7 THEN $8 ELSE image_url END,
           barcode = CASE WHEN $9 THEN $10 ELSE barcode END
       WHERE id = $11
       RETURNING *`,
      [
        name,
        hasDescription,
        hasDescription ? description : null,
        price,
        category,
        stock,
        hasImageUrl,
        hasImageUrl ? image_url : null,
        hasBarcode,
        hasBarcode ? (barcode ? barcode.trim() : null) : null,
        id,
      ]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }
    if (stock !== undefined && typeof stockBefore === 'number' && stock !== stockBefore) {
      await recordStockAdjustment(client, {
        productId: id,
        delta: stock - stockBefore,
        newStock: stock,
        source: 'web-admin',
        userId: req.user!.userId,
        note: `Set to ${stock} in the product form`,
      });
    }
    // Omitting `images` leaves the gallery alone; sending [] clears it. Same
    // contract as the COALESCE fields above - absent means "don't touch".
    if (Array.isArray(images)) {
      await replaceGallery(client, id, images);
    }
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (isBarcodeConflict(err)) {
      return res.status(409).json({ error: 'A product with this barcode already exists' });
    }
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  } finally {
    client.release();
  }
});

const DELTA_MAX = 10_000;
const NOTE_MAX = 200;

/**
 * POST /api/products/:id/adjust-stock  { delta, source, note? }
 *
 * Moves stock by a delta, atomically, and writes the ledger row in the same
 * transaction. This is the only correct way for a client to nudge a count:
 * "read 12, send 13" through PUT silently swallows any order that decremented
 * the same product in between, and both steppers were one refactor away from
 * doing exactly that.
 *
 * Rejects rather than clamps. A -5 against a stock of 3 is a 409 carrying the
 * current count - not a silent floor at 0 with a ledger row that claims -5. A
 * clamped adjustment that still logs is a lie in an audit table.
 *
 * `source` is declared by the client and limited to the two client values;
 * 'order' and 'cancel' are written only by the server from the routes that
 * actually move stock for those reasons.
 */
router.post('/:id/adjust-stock', requireAuth, adminOnly, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const { delta, source, note } = req.body ?? {};
  if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > DELTA_MAX) {
    return res
      .status(400)
      .json({ error: `delta must be a non-zero whole number no larger than ${DELTA_MAX} either way` });
  }
  if (!CLIENT_STOCK_SOURCES.includes(source as StockSource)) {
    return res.status(400).json({ error: `source must be one of: ${CLIENT_STOCK_SOURCES.join(', ')}` });
  }
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > NOTE_MAX)) {
    return res.status(400).json({ error: `note must be a string of at most ${NOTE_MAX} characters` });
  }
  const cleanNote = typeof note === 'string' ? note.trim() || null : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [id]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }
    const before: number = current.rows[0].stock;
    const after = before + delta;
    if (after < 0) {
      await client.query('ROLLBACK');
      return res
        .status(409)
        .json({ error: `Only ${before} in stock; cannot remove ${-delta}`, stock: before });
    }

    await client.query('UPDATE products SET stock = $1 WHERE id = $2', [after, id]);
    const adjustment = await recordStockAdjustment(client, {
      productId: id,
      delta,
      newStock: after,
      source: source as StockSource,
      userId: req.user!.userId,
      note: cleanNote,
    });
    await client.query('COMMIT');
    res.json({ stock: after, adjustment });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Adjust stock error:', err);
    res.status(500).json({ error: 'Failed to adjust stock' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/products/:id/stock-history - the last 20 ledger rows, newest
 * first, with the acting user's email. What lets the web admin say where a
 * number came from instead of just what it is.
 */
router.get('/:id/stock-history', requireAuth, adminOnly, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ error: 'Product not found' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.delta, a.new_stock, a.source, a.note, a.created_at, u.email AS user_email
         FROM stock_adjustments a
         LEFT JOIN users u ON u.id = a.user_id
        WHERE a.product_id = $1
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 20`,
      [id]
    );
    res.json({ adjustments: rows });
  } catch (err) {
    console.error('Stock history error:', err);
    res.status(500).json({ error: 'Failed to fetch stock history' });
  }
});

router.delete('/:id', requireAuth, adminOnly, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ error: 'Product not found' });
  }

  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(204).send();
  } catch (err: any) {
    // 23503 = foreign key violation: the product appears in order_items.
    // Deleting it would orphan historical orders, so we refuse instead of
    // cascading. Setting stock to 0 effectively retires a product.
    if (err?.code === '23503') {
      return res.status(409).json({
        error: 'This product has existing orders and cannot be deleted. Set its stock to 0 to retire it instead.',
      });
    }
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;
