# Development

**Canonical.** How to set up, how work is expected to be done, and what "done"
means here.

---

## 1. Local setup

```bash
docker compose up -d --wait db
```

```bash
cd frontend && npm install && cp .env.example .env.local
```

Then set `DATABASE_URL` and `JWT_SECRET` in `.env.local`, and:

```bash
cd frontend && npm run migrate:up
```

```bash
cd frontend && npm run dev
```

App **and** API on http://localhost:3000. Postgres is on host port **5433**.

**`npm run migrate:up` is not optional.** Postgres'
`docker-entrypoint-initdb.d` mount is gone on purpose, so a fresh `db`
container has no schema and no seed until migrations run. A storefront with no
products and a login that 500s is what forgetting this looks like.

Whole stack in Docker instead — compose runs the one-shot `migrate` service
before `web`, so no separate step:

```bash
docker compose up -d --wait --build
```

## 2. The loop

```bash
cd frontend && npm test
```

```bash
cd frontend && npm run lint
```

```bash
cd frontend && npx tsc --noEmit
```

CI runs all three plus `npm run build`, a Dockerised end-to-end smoke test, and
`npm audit --omit=dev --audit-level=high`. Everything must be green before
merge.

**Never run `next build` while a dev server is running.** They share `.next`
and it corrupts into misleading "syntax errors" in unrelated files.

## 3. Definition of done

A change is done when all of these hold. Not when it looks right.

1. **It has a test that fails without it.** For a bugfix, the test reproduces
   the bug first.
2. **The behavioural claim was mutation-checked** — break the production code
   on purpose and confirm the right tests, and only those, go red. A test that
   passes against broken code is worse than no test.
3. **Lint, typecheck, unit tests and build are green locally**, not just in CI.
4. **No invariant in [ARCHITECTURE.md §3](ARCHITECTURE.md#3-invariants) was
   broken**, or one was and there is an ADR saying so.
5. **The docs that this change makes wrong are updated in the same commit.**
   See [§6](#6-keeping-the-docs-true).
6. **The commit message says why, not what.** The diff already says what.

## 4. The verification standard

Every claim gets checked against something real. This is not ceremony — real
bugs have been caught this way that a "looks right" pass would have shipped: a
leaked pool connection in the product `PUT`, an `aria-current` on the wrong
breadcrumb, and test files importing a path that no longer existed after a
migration.

What "real" has meant in practice:

| Claim | How it was actually checked |
|---|---|
| "The index is used" | `EXPLAIN ANALYZE` — 8.9ms vs 1039ms |
| "The fallback fires" | A deliberately-404 image URL |
| "bcryptjs reads native hashes" | A `$2b$` hash written by native bcrypt, before the swap |
| "The seed works from nothing" | A fresh database volume |
| "The credential is dead" | The live API started 500ing the moment it rotated |
| "Preview cannot reach production" | Pointed the preview credential at the production host and watched it be rejected |
| "It renders" | Computed styles and the accessibility tree, not a glance |

If you cannot state how you verified something, you have not verified it.

## 5. Branching and PRs

- Branch from `main`. Never commit to `main` directly.
- One PR per coherent change. CI must be green.
- **Merging to `main` deploys to production** ([OPERATIONS.md](OPERATIONS.md)).
  Treat merge as release.
- **A schema change migrates before it merges**, not after.

**Stacked PRs: retarget the child before merging the parent.** Merging with
`--delete-branch` deletes the base branch, which **auto-closes** any PR
pointing at it — and a closed PR's base cannot be changed. Recovery is to push
the deleted ref back, reopen, then retarget. This has bitten this project
before.

### Running two agent sessions at once — give each its own worktree

**One working tree cannot be shared by two sessions.** Learned the hard way,
twice in one day: uncommitted work appeared in a session that had not written
it, and a branch was switched out from under a running command so a `git pull`
landed on someone else's feature branch. The failure is silent — if both write
the same file, one just wins.

**The main tree belongs to whoever is already in it.** Everyone else gets a
worktree:

```bash
git worktree add .claude/worktrees/<name> -b <branch> origin/main
```

- Each worktree needs its **own `npm install`** — a few minutes and a few
  hundred MB. Skip it for documentation-only work.
- `.env.local` is **per-worktree** too, because it is gitignored.
- **Removing one on Windows is not `git worktree remove`.** That fails with
  `Filename too long` on deep `node_modules` paths, leaving the worktree
  deregistered but still on disk. Mirror an empty directory over it first:

```bash
robocopy "$env:TEMP\empty" ".claude\worktrees\<name>" /MIR; git worktree remove --force ".claude\worktrees\<name>"; git worktree prune
```

A folder that will not delete even when empty is usually still some process's
working directory — including the session trying to delete it.

## 6. Keeping the docs true

The failure mode this documentation set exists to prevent is **a document that
describes a system nobody built**. It has happened here more than once:
`README.md` claimed security headers that did not exist, `.env.example` set the
one variable [INV-2](ARCHITECTURE.md#inv-2--there-is-no-next_public_api_url)
forbids, and the companion carried a copy of the order lifecycle that had
drifted from the server's (fixed 2026-09-05 by serving it instead).

So:

| If you change | Update |
|---|---|
| A route, its auth level, or its response shape | [API.md](API.md) |
| A migration | [DATA-MODEL.md](DATA-MODEL.md) |
| An env var, or anything about deploy | [OPERATIONS.md](OPERATIONS.md) |
| A control, or accept a new weakness | [SECURITY.md](SECURITY.md) |
| An invariant, or a decision with a real alternative | An [ADR](adr/) **and** [ARCHITECTURE.md](ARCHITECTURE.md) |

**Prose is the weakest form of enforcement.** Prefer, in order: a type, a test,
a served value, then a document. The order-lifecycle drift was the worked
example — the fix was not to correct the companion's copy, it was to
[serve the matrix](API.md#7-known-client-drift) so no copy exists. That is
what shipped.

## 7. Testing

Two Vitest projects (`npm test` prints the current count): `*.test.ts` on Node, `*.test.tsx` on a
DOM. Plus a Dockerised end-to-end smoke test in CI that runs against real
Postgres.

What is worth a test here:

- **Contracts both clients depend on** — the JSON error shape, the barcode
  projection across every caller shape, the order matrix.
- **Invariants that fail silently** — the search expression matching its index,
  the pool not being built at import.
- **Things that already broke once** — clearing a nullable product field, the
  gallery wipe, push scoping.

## 8. Gotchas that have cost real time

- **This is Windows.** The shell is PowerShell; `&&` is a parse error there.
  `pkill` does not kill Node servers — use
  `Get-NetTCPConnection -LocalPort N | Stop-Process`. PowerShell's
  `Set-Content -Encoding utf8` writes a **BOM**, which silently corrupts the
  first key in a `.env` file.
- **`npm audit`'s `fixAvailable` lied.** It reported `next@14.2.35,
  isSemVerMajor: false` for an advisory whose range was `9.5.0 – 15.5.20` — a
  version still inside the vulnerable range. Always re-audit after upgrading.
- **A `.tsx` test will not parse without the React plugin.** `tsconfig.json`
  sets `"jsx": "preserve"` because Next does its own transform; Vite reads that
  and fails with *"content contains invalid JS syntax"*. Setting `esbuild.jsx`
  does nothing — Vite 8 transforms with **oxc**, not esbuild. `plugins:
  [react()]` in `vitest.config.ts` is the fix. Separately, JSX inside a
  `vi.mock` factory also fails, because Vitest hoists those above the imports —
  use `createElement` with `await import('react')` inside the factory.
- **Vitest's worker-start timeout is a hardcoded 60s.** On a cold Vite dep
  cache the DOM worker can take ~100s to come up and every run dies with
  *"Timeout waiting for worker to respond"*, which reads like a broken
  environment rather than a slow one. It is not configurable. Run the suite
  again — warm, it starts in ~9s. Swapping jsdom for happy-dom changes nothing.
- **The browser preview pane does not composite frames**, so screenshots fail
  and `loading="lazy"` images are never requested — they sit at
  `complete: false` forever. Verify lazy-loading on an eager/`priority` image
  instead.
- **`frontend/` used to contain its own `.git`**, a second repository pointing
  at the pre-serverless `Shelfstock-frontend` (HEAD `41b0eee`). It was deleted
  on 2026-09-03 after confirming it held no unpushed commits and nothing the
  monorepo lacks; that GitHub repo is archived. If a fresh clone ever shows two
  repositories again, someone restored it — there is one repo, this one.
