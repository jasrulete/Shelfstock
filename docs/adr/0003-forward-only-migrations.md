# 0003 — Forward-only migrations, no down scripts

**Status:** Accepted

## Context

Schema lived in a single `schema.sql` applied through Postgres'
`docker-entrypoint-initdb.d` mount. That mount only runs on an **empty** data
directory, so it was silently useless against any database that already
existed. "What schema is this database on?" had no answer.

The baseline had one useful property: every statement in it was already
idempotent (`CREATE TABLE IF NOT EXISTS`, and so on).

## Decision

`node-pg-migrate`, with ordered SQL files under `frontend/migrations/` tracked
in a `pgmigrations` table. The baseline migration is the old `schema.sql`
verbatim.

**Forward-only. No down migrations.**

Postgres' initdb mount is removed. A one-shot `migrate` compose service runs
before `web`, so one code path applies schema everywhere.

## Consequences

- **An existing database adopts the baseline by just running `migrate up`** —
  no fake-apply step, because every statement is idempotent. Proved by dropping
  `pgmigrations` from a populated database and re-running: the baseline
  replayed harmlessly, recorded itself, and left all six products and the same
  six indexes.
- **A bad migration is fixed by writing another one**, never by rolling back.
- **Migrations are not automatic on Vercel.** Run them against the target
  database *before* merging the code that depends on them — a merge deploys
  instantly. See [OPERATIONS.md §3](../OPERATIONS.md#3-migrations).
- Every migration must keep the idempotence property, or the adoption path
  above stops working for the next fresh database.
- `docker compose up --wait --build` needs no separate schema step.

## Alternatives considered

**Down migrations.** Rejected concretely: a down migration for the baseline
would drop every table. The button exists to be pressed at 2am, and there is no
scenario in this project where pressing it is the right move — the database is
a free-tier Neon instance whose recovery story is a branch, not a rollback.

**Keep `schema.sql` and apply it by hand.** Rejected: that is the state that
made "what is this database on?" unanswerable.

**An ORM with generated migrations (Prisma, Drizzle).** Rejected as a large
rewrite of a working `pg`-based query layer for no gain the project needs. The
hand-written SQL is also what makes [INV-12](../ARCHITECTURE.md#inv-12--the-search-expression-must-stay-byte-identical-to-the-indexed-one)
possible to state and test at all.
