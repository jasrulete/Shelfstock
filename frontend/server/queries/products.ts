import { pool } from '../db';

/**
 * Product reads, shared by the Express API and the Server Components that
 * render the storefront.
 *
 * The pages cannot go through the HTTP API: `lib/api.ts` deliberately uses
 * relative URLs (see the comment there), so there is no absolute base a
 * server render could fetch. Rather than let the pages grow a second copy of
 * this SQL - the exact duplication that let the admin UI and the order route
 * disagree about which status transitions existed - both callers come here.
 *
 * Every function takes the raw string params a URL gives you and does its own
 * clamping and whitelisting, so the limits are properties of the query layer
 * rather than of whichever caller happened to remember them.
 */

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

// Interpolated into ORDER BY, so this whitelist is the only thing standing
// between a query string and SQL injection. Never widen it to a raw column.
const SORTABLE_COLUMNS = new Set(['price', 'name', 'created_at']);

export interface ProductListParams {
  search?: string;
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  order?: string;
  page?: string;
  limit?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Rejects anything that isn't a plain positive integer so a bad id becomes a
 * 404, never a pg cast error surfacing as a 500.
 */
export function parseProductId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Pagination is done in SQL with LIMIT/OFFSET rather than fetching every row
 * and slicing in JS. That keeps memory flat and query time proportional to
 * the page size regardless of how large the products table gets.
 */
export async function listProducts(
  params: ProductListParams
): Promise<{ products: any[]; pagination: Pagination }> {
  const { search, category, minPrice, maxPrice, sort = 'created_at', order = 'desc' } = params;

  const sortColumn = SORTABLE_COLUMNS.has(sort ?? '') ? sort : 'created_at';
  const sortOrder = order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const pageNum = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(params.limit ?? '12', 10) || 12));
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`name ILIKE $${values.length}`);
  }
  if (category) {
    values.push(category);
    conditions.push(`category = $${values.length}`);
  }
  if (minPrice) {
    values.push(Number(minPrice));
    conditions.push(`price >= $${values.length}`);
  }
  if (maxPrice) {
    values.push(Number(maxPrice));
    conditions.push(`price <= $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM products ${whereClause}`,
    values
  );
  const total = countResult.rows[0].total as number;

  values.push(limitNum, offset);
  const dataResult = await pool.query(
    `SELECT p.id, p.name, p.description, p.price, p.category, p.stock, p.image_url,
              p.created_at,
              ${RATING_COLUMNS}
       FROM products p
       ${RATING_JOIN}
       ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  return {
    products: dataResult.rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

/**
 * Returns the product with its gallery already assembled, or null if the id
 * is malformed or unknown - callers turn both into the same 404 so a stranger
 * cannot tell a bad id from a missing one.
 */
export async function getProductById(id: number): Promise<any | null> {
  const result = await pool.query(
    `SELECT p.*, ${RATING_COLUMNS}
       FROM products p
       ${RATING_JOIN}
       WHERE p.id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  const product = result.rows[0];

  // The cover image leads the gallery, then the extra angles in order. Sent
  // as one ready-to-render array so the client isn't left stitching
  // image_url onto a separate list and getting the order wrong.
  const gallery = await pool.query(
    `SELECT url FROM product_images
       WHERE product_id = $1
       ORDER BY position ASC, id ASC`,
    [id]
  );
  const images = [product.image_url, ...gallery.rows.map((r) => r.url as string)].filter(
    (url): url is string => Boolean(url)
  );

  return { ...product, images };
}

/**
 * Excludes sold-out items on purpose: there is nothing to sell in a "0 left"
 * row, and the storefront uses this to merchandise scarcity.
 */
export async function listLowStock(raw: {
  threshold?: string;
  limit?: string;
}): Promise<any[]> {
  const threshold = Math.min(20, Math.max(1, parseInt(raw.threshold ?? '5', 10) || 5));
  const limit = Math.min(12, Math.max(1, parseInt(raw.limit ?? '4', 10) || 4));

  const result = await pool.query(
    `SELECT id, name, price, stock, image_url
       FROM products
       WHERE stock > 0 AND stock <= $1
       ORDER BY stock ASC, name ASC
       LIMIT $2`,
    [threshold, limit]
  );
  return result.rows;
}

/**
 * The union of the seeded categories table and any category an admin has
 * typed onto a product, so the storefront filter always reflects what is
 * actually purchasable.
 */
export async function listCategories(): Promise<string[]> {
  const result = await pool.query(
    `SELECT name FROM categories
       UNION
       SELECT DISTINCT category FROM products
       ORDER BY name`
  );
  return result.rows.map((r) => r.name as string);
}
