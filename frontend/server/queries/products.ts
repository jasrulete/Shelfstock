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
 * `%` and `_` are wildcards inside LIKE, so a shopper searching for "50%" or
 * "t_shirt" would otherwise get a pattern rather than the text they typed.
 * Backslash is LIKE's default escape character, so escaping these three is
 * enough - no ESCAPE clause needed.
 */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * The indexed full text vector for a product.
 *
 * MUST stay character-for-character identical to the expression in
 * `idx_products_search_fts` (see frontend/migrations). Postgres only uses an expression
 * index when the query repeats the expression exactly; a stray space here
 * turns the search back into the sequential scan this whole change exists to
 * remove, and nothing fails loudly when it does.
 */
export const SEARCH_VECTOR = `to_tsvector('english', name || ' ' || coalesce(description, ''))`;

/**
 * Relevance score for a search term.
 *
 * Matching finds rows two ways - trigrams for substrings, full text for word
 * forms - and neither knows which hit is better. So the matched rows are
 * ranked here, with the name weighted above the description: a product called
 * "Mechanical Keyboard" should outrank one that merely mentions keyboards in
 * its blurb.
 *
 * Deliberately a different expression from SEARCH_VECTOR: ranking wants the
 * two fields weighted separately, and it runs only over rows the indexes have
 * already returned, so it needs no index of its own.
 */
function relevanceExpression(placeholder: number): string {
  return `ts_rank(
             setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
             setweight(to_tsvector('english', coalesce(description, '')), 'B'),
             plainto_tsquery('english', $${placeholder})
           )`;
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

  // Set when there is a search term, so the ORDER BY can reuse the same bound
  // parameter rather than binding the term twice.
  let searchTermPlaceholder = 0;

  if (search) {
    values.push(likePattern(search));
    const like = values.length;
    values.push(search);
    searchTermPlaceholder = values.length;

    // Three ways to match, all index-backed:
    //   - name/description trigram, so "board" finds "Keyboard"
    //   - full text, so "keyboards" finds "Keyboard" and "running" finds "run"
    // Description is included because "book" and "usb" appear only in blurbs,
    // and a search that misses them looks broken to whoever typed them.
    conditions.push(
      `(name ILIKE $${like} OR description ILIKE $${like}
        OR ${SEARCH_VECTOR} @@ plainto_tsquery('english', $${searchTermPlaceholder}))`
    );
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

  // Relevance leads the ordering only when the shopper has not asked for a
  // particular one. Picking "Price: low to high" and getting relevance order
  // anyway would be the control quietly not working; leaving relevance out
  // when they have simply typed a search would bury the best match.
  const orderBy: string[] = [];
  if (search && params.sort === undefined) {
    orderBy.push(`${relevanceExpression(searchTermPlaceholder)} DESC`);
  }
  orderBy.push(`${sortColumn} ${sortOrder}`);
  // Trigram-only matches all score 0, so without a unique tiebreaker their
  // order is whatever the plan happens to produce - which can differ between
  // page 1 and page 2 and silently drop or repeat a row.
  orderBy.push('id DESC');

  values.push(limitNum, offset);
  const dataResult = await pool.query(
    `SELECT p.id, p.name, p.description, p.price, p.category, p.stock, p.image_url,
              p.created_at,
              ${RATING_COLUMNS}
       FROM products p
       ${RATING_JOIN}
       ${whereClause}
       ORDER BY ${orderBy.join(', ')}
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
