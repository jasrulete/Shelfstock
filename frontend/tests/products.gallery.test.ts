import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { pool } from '../server/db';
import { createApp } from '../server/app';
import { tokenFor } from './helpers';

const poolConnect = pool.connect as unknown as ReturnType<typeof vi.fn>;
const app = createApp();

const GALLERY_TABLE = 'product_images';

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * These cover the transactional path in POST/PUT /api/products, which the
 * existing product tests never reach - every one of them stops at validation.
 */
describe('PUT /api/products/:id (gallery transaction)', () => {
  it('replaces the gallery inside the same transaction as the product update', async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [{ id: 1 }] });
    poolConnect.mockResolvedValue({ query: clientQuery, release: vi.fn() });

    const res = await request(app)
      .put('/api/products/1')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ images: ['https://cdn/b.jpg', '   ', 'https://cdn/c.jpg'] });

    expect(res.status).toBe(200);
    const sql = clientQuery.mock.calls.map(([s]) => s as string);
    expect(sql[0]).toBe('BEGIN');
    expect(sql.at(-1)).toBe('COMMIT');
    expect(sql.some((s) => s.includes(GALLERY_TABLE) && s.startsWith('DELETE'))).toBe(true);

    // Blank entries are dropped and position follows the submitted order.
    const inserts = clientQuery.mock.calls.filter(([s]) =>
      (s as string).includes(`INSERT INTO ${GALLERY_TABLE}`)
    );
    expect(inserts).toHaveLength(2);
    expect(inserts[0][1]).toEqual([1, 'https://cdn/b.jpg', 0]);
    expect(inserts[1][1]).toEqual([1, 'https://cdn/c.jpg', 1]);
  });

  it('rolls back and releases the connection when the product does not exist', async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    poolConnect.mockResolvedValue({ query: clientQuery, release });

    const res = await request(app)
      .put('/api/products/999')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ images: ['https://cdn/b.jpg'] });

    expect(res.status).toBe(404);
    expect(clientQuery.mock.calls.map(([s]) => s)).toContain('ROLLBACK');
    // The early 404 return still has to hand the connection back to the pool.
    expect(release).toHaveBeenCalled();
  });

  it('leaves the gallery untouched when images is omitted', async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [{ id: 1 }] });
    poolConnect.mockResolvedValue({ query: clientQuery, release: vi.fn() });

    await request(app)
      .put('/api/products/1')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ stock: 5 });

    expect(
      clientQuery.mock.calls.some(([s]) => (s as string).includes(GALLERY_TABLE))
    ).toBe(false);
  });

  it('clears the gallery when images is an empty array', async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [{ id: 1 }] });
    poolConnect.mockResolvedValue({ query: clientQuery, release: vi.fn() });

    await request(app)
      .put('/api/products/1')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ images: [] });

    const touched = clientQuery.mock.calls.filter(([s]) =>
      (s as string).includes(GALLERY_TABLE)
    );
    // Exactly the removal, and nothing inserted back.
    expect(touched).toHaveLength(1);
    expect(touched[0][0]).toContain('DELETE');
  });
});
