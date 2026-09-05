import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { pool } from '../server/db';
import { createApp } from '../server/app';
import { tokenFor } from './helpers';

const poolQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

let app: ReturnType<typeof createApp>;

const PRODUCT = {
  id: 1,
  name: 'Wireless Mouse',
  price: '19.99',
  stock: 4,
  image_url: null,
  barcode: '4006381333931',
};

beforeEach(() => {
  vi.clearAllMocks();
  app = createApp();
});

/**
 * barcode exists only so the companion app can scan a physical item. It is an
 * internal stock-keeping code and has no business on the public storefront,
 * but the by-id route reads `p.*` so it shipped to everyone.
 */
describe('barcode exposure on product reads', () => {
  it('is absent from the public list projection', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] }).mockResolvedValueOnce({
      rows: [{ ...PRODUCT, barcode: undefined }],
    });

    await request(app).get('/api/products');

    // Assert on the SQL, since the mock decides what comes back: the column
    // must not be requested at all.
    const dataSql = poolQuery.mock.calls.map(([sql]) => sql as string).join('\n');
    expect(dataSql).not.toMatch(/p\.barcode/);
  });

  it('is absent from GET /:id for an anonymous visitor', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [{ ...PRODUCT }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/products/1');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Wireless Mouse');
    expect(res.body).not.toHaveProperty('barcode');
  });

  it('is absent from GET /:id for a signed-in customer', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [{ ...PRODUCT }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/products/1')
      .set('Authorization', `Bearer ${tokenFor(9, 'customer')}`);

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('barcode');
  });

  /**
   * The companion's ProductForm seeds itself from this response. Drop the
   * field for admins too and editing a product on the phone blanks the
   * barcode input, then saves that blank back over a good value.
   */
  it('is present on GET /:id for an admin, so the phone edit form round-trips', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [{ ...PRODUCT }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/products/1')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.barcode).toBe('4006381333931');
  });

  it('treats an expired or malformed token as anonymous rather than 401ing', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [{ ...PRODUCT }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/products/1')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('barcode');
  });
});

/**
 * Roadmap 3.4. The printable barcode sheet is an admin page that lists the
 * whole catalogue with each product's code, so the admin list projection has
 * to carry barcode for an admin - and still never for anyone else.
 */
describe('barcode on the admin list projection', () => {
  it('is present on GET / for an admin', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] }).mockResolvedValueOnce({ rows: [{ ...PRODUCT }] });

    const res = await request(app).get('/api/products').set('Authorization', `Bearer ${tokenFor(1, 'admin')}`);

    expect(res.status).toBe(200);
    const dataSql = poolQuery.mock.calls.map(([sql]) => sql as string).join('\n');
    expect(dataSql).toMatch(/p\.barcode/);
    expect(res.body.products[0].barcode).toBe('4006381333931');
  });

  it('is still absent on GET / for a signed-in customer', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] }).mockResolvedValueOnce({ rows: [{ ...PRODUCT }] });

    await request(app).get('/api/products').set('Authorization', `Bearer ${tokenFor(2, 'customer')}`);

    const dataSql = poolQuery.mock.calls.map(([sql]) => sql as string).join('\n');
    expect(dataSql).not.toMatch(/p\.barcode/);
  });
});

/**
 * POST /api/products/:id/assign-barcode gives a product the store's own
 * EAN-13 (GS1 prefix 200, the internal-use range, then the id) so the scan
 * demo works against a printed sheet without physical stock. It never
 * overwrites: a product that already has a code keeps it.
 */
describe('POST /api/products/:id/assign-barcode', () => {
  const admin = () => `Bearer ${tokenFor(1, 'admin')}`;

  it('is admin-only', async () => {
    expect((await request(app).post('/api/products/6/assign-barcode')).status).toBe(401);
    expect(
      (await request(app).post('/api/products/6/assign-barcode').set('Authorization', `Bearer ${tokenFor(2, 'customer')}`))
        .status
    ).toBe(403);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('404s a malformed id without querying', async () => {
    const res = await request(app).post('/api/products/abc/assign-barcode').set('Authorization', admin());
    expect(res.status).toBe(404);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('writes 200 + the zero-padded id + check digit, only where no barcode exists yet', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ ...PRODUCT, id: 6, barcode: '2000000000060' }] });

    const res = await request(app).post('/api/products/6/assign-barcode').set('Authorization', admin());

    expect(res.status).toBe(200);
    expect(res.body.barcode).toBe('2000000000060');
    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE products/);
    expect(sql).toMatch(/barcode IS NULL/);
    expect(params).toEqual(['2000000000060', 6]);
  });

  it('409s, with the existing code, when the product already has one', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 6, barcode: '4006381333931' }] });

    const res = await request(app).post('/api/products/6/assign-barcode').set('Authorization', admin());

    expect(res.status).toBe(409);
    expect(res.body.barcode).toBe('4006381333931');
    expect(res.body.error).toMatch(/already/);
  });

  it('404s when the product does not exist', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/products/6/assign-barcode').set('Authorization', admin());

    expect(res.status).toBe(404);
  });

  it('409s when the computed code is somehow taken by another product', async () => {
    poolQuery.mockRejectedValueOnce({ code: '23505', constraint: 'products_barcode_key' });

    const res = await request(app).post('/api/products/6/assign-barcode').set('Authorization', admin());

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/barcode/);
  });
});
