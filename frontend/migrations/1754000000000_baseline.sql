-- Baseline: the schema as it stood when migrations were introduced.
--
-- Every statement is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING /
-- guarded UPDATEs), which is what makes adopting an existing database safe:
-- running this against production, which already has all of it, changes
-- nothing and simply records the migration as applied. There is no separate
-- "baseline" or "fake apply" step to get wrong.
--
-- Forward-only, deliberately: no Down section here or in any later migration.
-- A down migration for this file would drop every table in the store, and for
-- a later one would drop the column it added - destroying the data in it. The
-- recovery path for a bad migration is a database restore, not a DROP that
-- runs perfectly and loses the rows anyway.
--
-- Migrations from here on should contain schema changes only. The seed data
-- below is here because it is what this file already did.


CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  price       NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  category    VARCHAR(100) NOT NULL,
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders: total_amount/currency describe the order as a whole.
-- We never join order_items back to products.price for historical totals -
-- see order_items.price_at_purchase below.
-- Amounts are always stored in USD; other currencies are a display-time
-- conversion on the frontend. Storing mixed currencies in one column would
-- make analytics SUMs meaningless.
CREATE TABLE IF NOT EXISTS orders (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_amount     NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
  currency         VARCHAR(10) NOT NULL DEFAULT 'USD',
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_method   VARCHAR(30) NOT NULL DEFAULT 'cod',
  shipping_name    TEXT,
  shipping_phone   TEXT,
  shipping_address TEXT,
  shipping_city    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upgrade path for databases created before the checkout/lifecycle rework.
-- All statements are idempotent so re-running this file is always safe.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) NOT NULL DEFAULT 'cod';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_city TEXT;
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'shipped', 'completed', 'cancelled'));

-- order_items.price_at_purchase is a deliberate denormalization / snapshot.
-- If we instead stored only product_id and joined to products.price at read
-- time, every historical order would silently reprice itself whenever a
-- product's price changed later. Snapshotting the price at the moment of
-- purchase is what makes an "order history" actually historical.
CREATE TABLE IF NOT EXISTS order_items (
  id                SERIAL PRIMARY KEY,
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        INTEGER NOT NULL REFERENCES products(id),
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  price_at_purchase NUMERIC(10, 2) NOT NULL CHECK (price_at_purchase >= 0)
);

-- Additional product photography.
--
-- products.image_url stays the cover shot: it's what listings, the cart and
-- search results use, and every one of those wants exactly one image. This
-- table holds the *extra* angles the detail page shows, so adding a gallery
-- never risks changing which image a product card picks.
--
-- position orders the strip; ties fall back to id so the order is stable.
CREATE TABLE IF NOT EXISTS product_images (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  position   SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id
  ON product_images(product_id, position);

-- Product reviews.
--
-- UNIQUE (product_id, user_id) is the anti-spam rule: one review per person
-- per product, enforced by the database rather than by a check the API could
-- forget. Editing a review is an UPDATE, not a second row.
--
-- verified_purchase follows the Amazon model: anyone signed in may review, and
-- whether they actually bought the item is recorded and displayed rather than
-- used to block them. It is computed once at write time from the order history
-- because it describes the moment the review was written - recomputing it later
-- would let a cancelled order silently un-verify an honest review.
CREATE TABLE IF NOT EXISTS reviews (
  id                SERIAL PRIMARY KEY,
  product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating            SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body              TEXT,
  verified_purchase BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);

-- Every product card and listing asks "what is this product's average?", so the
-- aggregate is grouped by product_id on read.
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);

-- One row per win-back email sent. The win-back job only emails a customer
-- if no row exists newer than their last order, so each lapse gets at most
-- one email no matter how often the job runs.
CREATE TABLE IF NOT EXISTS winback_emails (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_winback_emails_user_id ON winback_emails(user_id);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);

-- Product search.
--
-- Trigrams, because the storefront searches with ILIKE '%term%' so that typing
-- "board" still finds "Keyboard". A btree index cannot serve a leading
-- wildcard and a tsvector index cannot serve a substring at all, so without
-- pg_trgm every search is a sequential scan.
--
-- Full text as well, so that "keyboards" finds "Keyboard" - trigrams match
-- characters and have no idea the two are the same word.
--
-- The previous index here was GIN (to_tsvector('english', name)): name only,
-- and nothing ever queried in a form that could use it, so it was pure write
-- cost. Its replacement covers the description too and IS queried. The
-- expression below has to stay character-for-character identical to
-- SEARCH_VECTOR in server/queries/products.ts, or the planner silently
-- ignores the index and the search goes back to a sequential scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DROP INDEX IF EXISTS idx_products_name;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm
  ON products USING GIN (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_search_fts
  ON products USING GIN (to_tsvector('english', name || ' ' || coalesce(description, '')));
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Seed categories
INSERT INTO categories (name) VALUES
  ('Electronics'), ('Home & Kitchen'), ('Books'), ('Apparel'), ('Toys')
ON CONFLICT (name) DO NOTHING;

-- Seed a handful of products so the app isn't empty on first run.
-- Guarded by "table is empty" (products has no natural unique key, so an
-- ON CONFLICT clause can't prevent duplicates on re-runs).
INSERT INTO products (name, description, price, category, stock, image_url)
SELECT * FROM (
  VALUES
    ('Wireless Mouse', 'Ergonomic 2.4GHz wireless mouse with USB receiver.', 19.99, 'Electronics', 150, 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=800&h=800&q=80'),
    ('Mechanical Keyboard', 'Hot-swappable mechanical keyboard, brown switches.', 79.99, 'Electronics', 60, 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=800&h=800&q=80'),
    ('Stainless Steel Water Bottle', 'Insulated 750ml bottle, keeps drinks cold 24h.', 24.50, 'Home & Kitchen', 200, 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&h=800&q=80'),
    ('The Pragmatic Programmer', 'Classic software engineering book.', 34.00, 'Books', 80, 'https://images.unsplash.com/photo-1580121441575-41bcb5c6b47c?auto=format&fit=crop&w=800&h=800&q=80'),
    ('Cotton T-Shirt', 'Plain crew-neck cotton t-shirt.', 12.99, 'Apparel', 300, 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&h=800&q=80'),
    ('Building Blocks Set', '250-piece creative building blocks.', 29.99, 'Toys', 90, 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=800&h=800&q=80')
) AS seed(name, description, price, category, stock, image_url)
WHERE NOT EXISTS (SELECT 1 FROM products);

-- Databases seeded before this change still hold placehold.co grey boxes, and
-- the INSERT above is skipped once products exist. This backfills real
-- photography for those rows only: the LIKE guard means it never touches an
-- image an admin has since set by hand, and re-running it is a no-op.
UPDATE products SET image_url = seed.url
FROM (
  VALUES
    ('Wireless Mouse', 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=800&h=800&q=80'),
    ('Mechanical Keyboard', 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=800&h=800&q=80'),
    ('Stainless Steel Water Bottle', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&h=800&q=80'),
    ('The Pragmatic Programmer', 'https://images.unsplash.com/photo-1580121441575-41bcb5c6b47c?auto=format&fit=crop&w=800&h=800&q=80'),
    ('Cotton T-Shirt', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&h=800&q=80'),
    ('Building Blocks Set', 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=800&h=800&q=80')
) AS seed(name, url)
WHERE products.name = seed.name
  AND products.image_url LIKE '%placehold.co%';

-- Gallery seed.
--
-- Only the building blocks get a second shot, and that is deliberate. These
-- are stock photographs, so a "second angle" of the keyboard or the bottle is
-- in fact a different keyboard and a different bottle - which on a store whose
-- whole claim is that the listing matches the shelf would be the worst
-- possible thing to fake. Loose coloured bricks are generic enough that two
-- photographs honestly depict the same product.
--
-- Everything else carries one image until real photography exists; the gallery
-- renders a single image without a thumbnail strip.
INSERT INTO product_images (product_id, url, position)
SELECT p.id, seed.url, seed.position
FROM (
  VALUES
    ('Building Blocks Set', 'https://images.unsplash.com/photo-1633469924738-52101af51d87?auto=format&fit=crop&w=800&h=800&q=80', 1)
) AS seed(name, url, position)
JOIN products p ON p.name = seed.name
WHERE NOT EXISTS (
  SELECT 1 FROM product_images pi WHERE pi.product_id = p.id AND pi.url = seed.url
);
