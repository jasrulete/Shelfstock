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
