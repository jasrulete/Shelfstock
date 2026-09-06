import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../server/mail', () => ({ sendWinback: vi.fn() }));

import { pool } from '../server/db';
import { sendWinback } from '../server/mail';
import { runWinbackJob } from '../server/jobs/winback';

const query = pool.query as unknown as ReturnType<typeof vi.fn>;
const send = sendWinback as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  query.mockReset();
  send.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

/**
 * Roadmap Phase 3, tests item. The job's two guarantees live in different
 * places - the dedup in SQL, the "only record what Resend accepted" in the
 * loop - and neither had a test.
 */
describe('win-back job', () => {
  it('dedups in SQL: a winback row newer than the last order excludes the customer, and the batch is capped', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await runWinbackJob();

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(
      /NOT EXISTS \(\s*SELECT 1 FROM winback_emails w\s*WHERE w\.user_id = u\.id AND w\.sent_at > s\.last_order_at\s*\)/
    );
    expect(sql).toContain("o.status <> 'cancelled'");
    expect(sql).toContain("interval '120 days'");
    expect(sql).toContain("interval '60 days'");
    expect(params).toEqual([50]);
    expect(send).not.toHaveBeenCalled();
  });

  it('records a send only when Resend accepted it, so a failure is retried on the next run', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          { id: 7, email: 'ana@example.test', shipping_name: 'Ana' },
          { id: 8, email: 'bo@example.test', shipping_name: null },
        ],
      })
      .mockResolvedValue({ rows: [] });
    send.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await runWinbackJob();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, 'ana@example.test', 'Ana', expect.any(String));
    const inserts = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO winback_emails'));
    expect(inserts).toEqual([['INSERT INTO winback_emails (user_id) VALUES ($1)', [8]]]);
  });
});
