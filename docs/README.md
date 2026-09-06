# ShelfStock documentation

**This directory is the source of truth for how ShelfStock works and why.**

It covers both repositories: the web app and API
([`Shelfstock`](https://github.com/jasrulete/Shelfstock), this one) and the
Android companion
([`shelfstock-companion`](https://github.com/jasrulete/shelfstock-companion)).
Cross-repo decisions live **here**, in one place, because a contract documented
twice is a contract that drifts.

---

## Start here

**New to the project?** [ARCHITECTURE.md](ARCHITECTURE.md), then the ADR index.
Between them they explain every part of this codebase that looks wrong until
you know why.

**About to write code?** [DEVELOPMENT.md](DEVELOPMENT.md) — setup, the
definition of done, and the verification standard.

**About to deploy, migrate, or fix something broken?**
[OPERATIONS.md](OPERATIONS.md).

## The set

| Document | Owns |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | The system shape and **the 13 invariants**. The anchor document. |
| [API.md](API.md) | The HTTP contract. **Canonical for both clients.** |
| [DATA-MODEL.md](DATA-MODEL.md) | Tables, indexes, migration rules. |
| [SECURITY.md](SECURITY.md) | Trust boundaries, controls, and every known weakness with its compensating control. |
| [OPERATIONS.md](OPERATIONS.md) | Environments, deploys, migrations, runbook. |
| [OWNER-RUNBOOK.md](OWNER-RUNBOOK.md) | The steps only the owner can do — production migration, EAS build, device verification, screenshots, CSP promotion — with what done looks like. |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Setup, workflow, definition of done, testing, gotchas. |
| [adr/](adr/) | Decisions that had a real alternative, and why it lost. |
| [ROADMAP.md](ROADMAP.md) | What is next, in order, and what was rejected. |

Each document owns its topic. If two say the same thing, one of them is about
to be wrong — delete the copy and link instead.

## When a doc and the code disagree

**Assume neither. Check, then fix whichever is wrong, in the same PR.**

Documentation here is not decoration, and it has been wrong before in ways that
cost real time:

- `README.md` claimed security headers the app did not serve.
- `.env.example` set `NEXT_PUBLIC_API_URL` — the one variable
  [INV-2](ARCHITECTURE.md#inv-2--there-is-no-next_public_api_url) forbids.
- The documented setup steps installed in the same directory twice, and pointed
  at a `schema.sql` that no longer existed.
- The companion carried an order lifecycle that had **drifted from the
  server's**, with a passing test holding the drift in place — fixed by
  serving the lifecycle rather than correcting the copy
  ([ADR-0007](adr/0007-server-owns-the-order-lifecycle.md)).

That last one is the reason this directory exists in its current form.

**Prose is the weakest form of enforcement.** Prefer, in order: a type, a test,
a served value, then a document. Where a doc is the only thing holding a rule
up, say so in the doc — every invariant in ARCHITECTURE.md names what enforces
it, and the ones enforced by nothing but prose are marked as such.

## Changing things

| If you change | Update |
|---|---|
| A route, its auth level, or its response shape | [API.md](API.md) |
| A migration | [DATA-MODEL.md](DATA-MODEL.md) |
| An env var, or anything about deploy | [OPERATIONS.md](OPERATIONS.md) |
| A control, or accept a new weakness | [SECURITY.md](SECURITY.md) |
| An invariant, or a decision with a real alternative | An [ADR](adr/) **and** [ARCHITECTURE.md](ARCHITECTURE.md) |

Never edit an accepted ADR's decision. Supersede it with a new record and mark
the old one.

## Also in this repository

[`HANDOVER.md`](../HANDOVER.md) is a **historical session log**, not a
specification. Where it overlaps with anything here, this directory wins.
