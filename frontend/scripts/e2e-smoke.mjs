// End-to-end smoke test against a RUNNING ShelfStock stack (fresh database).
//
// Exercises the real HTTP API: register → checkout → stock decrement →
// price snapshotting → row-level authorization → customer self-cancel →
// admin order lifecycle → cancellation stock restore → ledger → analytics.
//
// Usage (from the repo root, with a fresh db volume):
//   docker compose up -d --wait db api
//   PROMOTE_CMD="docker compose exec -T db psql -U postgres -d shelfstock -c \"UPDATE users SET role='admin' WHERE email='{EMAIL}'\"" \
//   SQL_CMD="docker compose exec -T db psql -U postgres -d shelfstock -t -A -c \"{SQL}\"" \
//     node frontend/scripts/e2e-smoke.mjs
//   docker compose down -v
//
// (See .github/workflows/ci.yml for the exact invocation CI uses.)

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import crypto from "node:crypto";

const API = process.env.API_URL || "http://localhost:4000/api";
const email = `e2e-${Date.now()}@smoke.test`;
const password = "e2e-Smoke-Passw0rd!";
let step = 0;

const log = (msg) => console.log(`  [${++step}] ${msg}`);

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json };
}

const shipping = {
  name: "E2E Smoke",
  phone: "0917000000",
  address: "123 Smoke Test St",
  city: "Cebu",
};

// --- shopper flow -----------------------------------------------------------
// Every order mails the address given here, so an undeliverable one has to be
// refused at the door rather than discovered when the confirmation bounces.
const badEmail = await api("/auth/register", {
  method: "POST",
  body: { name: "E2E Smoke", email: "not-an-email", password },
});
assert.equal(badEmail.status, 400, `malformed email must be refused: ${JSON.stringify(badEmail.json)}`);
assert.equal(badEmail.json.error, "Enter a valid email address");
log("registration refuses a malformed email address");

const reg = await api("/auth/register", {
  method: "POST",
  body: { name: "E2E Smoke", email, password },
});
assert.equal(reg.status, 201, `register: ${JSON.stringify(reg.json)}`);
const token = reg.json.token;
assert.ok(token, "register returns a JWT");
log("registered shopper, JWT issued");

const before = await api("/products/1");
assert.equal(before.status, 200);
const stockBefore = before.json.stock;
const unitPrice = parseFloat(before.json.price);
assert.ok(stockBefore >= 3 && unitPrice > 0, "product 1 in stock");
log(`product 1: stock ${stockBefore}, price ${unitPrice}`);

const order1 = await api("/orders", {
  method: "POST",
  token,
  body: { items: [{ productId: 1, quantity: 2 }], shipping },
});
assert.equal(order1.status, 201, `checkout: ${JSON.stringify(order1.json)}`);
const order1Id = order1.json.id;
assert.equal(order1.json.status, "pending");
log(`order ${order1Id} placed (2 units), status pending`);

const afterOrder = await api("/products/1");
assert.equal(afterOrder.json.stock, stockBefore - 2, "stock decremented in the checkout transaction");
log(`stock decremented ${stockBefore} -> ${afterOrder.json.stock}`);

const mine = await api("/orders/my", { token });
const myOrder = mine.json.find((o) => o.id === order1Id);
assert.ok(myOrder, "order visible in /orders/my");
assert.equal(parseFloat(myOrder.total_amount), +(2 * unitPrice).toFixed(2), "total = 2 x DB price (client cannot set prices)");
assert.equal(parseFloat(myOrder.items[0].price_at_purchase), unitPrice, "price snapshotted at purchase time");
log(`total ${myOrder.total_amount} with price_at_purchase snapshot verified`);

// --- row-level authorization ------------------------------------------------
const intruder = await api("/auth/register", {
  method: "POST",
  body: { name: "E2E Intruder", email: `intruder-${Date.now()}@smoke.test`, password },
});
const stolen = await api(`/orders/${order1Id}`, { token: intruder.json.token });
assert.equal(stolen.status, 404, "another user cannot read my order (404, no id leak)");
log("row-level authorization holds: other users get 404 on my order");

// --- customer self-cancel ----------------------------------------------------
// A pending order can be cancelled by its owner (the web's /orders page). It
// runs through the same transition code as the admin's PATCH, so the unit
// comes back and the ledger says who cancelled. Anyone else gets 404 - the
// same non-answer as reading it - and a second attempt gets 409.
const customerToken = intruder.json.token;
const order3 = await api("/orders", {
  method: "POST",
  token: customerToken,
  body: { items: [{ productId: 1, quantity: 1 }], shipping },
});
assert.equal(order3.status, 201, `customer checkout: ${JSON.stringify(order3.json)}`);
const order3Id = order3.json.id;
assert.equal((await api("/products/1")).json.stock, stockBefore - 3, "the customer's unit is reserved");

const notMine = await api(`/orders/${order3Id}/cancel`, { method: "POST", token });
assert.equal(notMine.status, 404, "someone else cannot cancel my order (404, no id leak)");
assert.equal((await api("/products/1")).json.stock, stockBefore - 3, "a refused self-cancel restores nothing");

const selfCancel = await api(`/orders/${order3Id}/cancel`, { method: "POST", token: customerToken });
assert.equal(selfCancel.status, 200, `self-cancel: ${JSON.stringify(selfCancel.json)}`);
assert.equal(selfCancel.json.status, "cancelled");
assert.deepEqual(selfCancel.json.allowed_transitions, [], "cancelled is terminal, and the server says so");
assert.equal((await api("/products/1")).json.stock, stockBefore - 2, "self-cancel restores the customer's unit");

const again = await api(`/orders/${order3Id}/cancel`, { method: "POST", token: customerToken });
assert.equal(again.status, 409, "a cancelled order cannot be self-cancelled again");
log(`order ${order3Id}: customer self-cancel restored the unit; stranger 404, repeat 409`);

// --- admin lifecycle ---------------------------------------------------------
const promote = process.env.PROMOTE_CMD;
assert.ok(promote, "PROMOTE_CMD env var required (promotes the test user to admin)");
execSync(promote.replaceAll("{EMAIL}", email), { stdio: "pipe" });
const adminLogin = await api("/auth/login", { method: "POST", body: { email, password } });
const adminToken = adminLogin.json.token;
assert.ok(adminToken, "re-login as admin");
log("test user promoted to admin, re-authenticated");

const order2 = await api("/orders", {
  method: "POST",
  token: adminToken,
  body: { items: [{ productId: 1, quantity: 1 }], shipping },
});
const order2Id = order2.json.id;
log(`order ${order2Id} placed (1 unit) for the cancellation path`);

const shipped = await api(`/orders/${order1Id}/status`, { method: "PATCH", token: adminToken, body: { status: "shipped" } });
assert.equal(shipped.json.status, "shipped", `order ${order1Id} -> shipped`);

// The owner (this user placed order 1 before being promoted) may no longer
// self-cancel: the parcel is on its way, and that is the admin's call.
const tooLate = await api(`/orders/${order1Id}/cancel`, { method: "POST", token: adminToken });
assert.equal(tooLate.status, 409, `the owner cannot self-cancel once shipped: ${JSON.stringify(tooLate.json)}`);

const completed = await api(`/orders/${order1Id}/status`, { method: "PATCH", token: adminToken, body: { status: "completed" } });
assert.equal(completed.json.status, "completed", `order ${order1Id} -> completed`);
log(`order ${order1Id}: pending -> shipped (self-cancel refused, 409) -> completed`);

// An admin cannot use the customer route on someone else's order either;
// the admin's path is PATCH, which is logged as the admin's action.
const backDoor = await api(`/orders/${order3Id}/cancel`, { method: "POST", token: adminToken });
assert.equal(backDoor.status, 404, "the self-cancel route is not an admin back door");

// INV-13: every stock change writes a ledger row, and this one says who.
const history = await api("/products/1/stock-history", { token: adminToken });
assert.equal(history.status, 200, `stock history: ${JSON.stringify(history.json)}`);
const customerRow = history.json.adjustments.find(
  (row) => row.source === "cancel" && row.note === `Order #${order3Id} cancelled by the customer`
);
assert.ok(customerRow, "the ledger records the customer's cancellation with its note");
assert.equal(customerRow.delta, 1, "the ledger row restores exactly the cancelled unit");
log("ledger row for the customer's cancellation present, delta +1");

// The store's whole claim is that the listing matches the shelf. Order 1 is
// completed - delivered, cash collected - so its two units are with the
// customer. Cancelling it must be refused, and must not put them back.
const stockAtCompletion = (await api("/products/1")).json.stock;
const lateCancel = await api(`/orders/${order1Id}/status`, { method: "PATCH", token: adminToken, body: { status: "cancelled" } });
assert.equal(lateCancel.status, 400, `completed orders cannot be cancelled: ${JSON.stringify(lateCancel.json)}`);
const afterLateCancel = await api("/products/1");
assert.equal(afterLateCancel.json.stock, stockAtCompletion, "a refused cancellation restores no stock");
log(`completed is terminal: cancel refused (400), stock still ${afterLateCancel.json.stock}`);

const cancel = await api(`/orders/${order2Id}/status`, { method: "PATCH", token: adminToken, body: { status: "cancelled" } });
assert.equal(cancel.json.status, "cancelled");
const restored = await api("/products/1");
assert.equal(restored.json.stock, stockBefore - 2, "cancellation restores the cancelled unit's stock");
log(`order ${order2Id} cancelled, stock restored to ${restored.json.stock}`);

const terminal = await api(`/orders/${order2Id}/status`, { method: "PATCH", token: adminToken, body: { status: "pending" } });
assert.equal(terminal.status, 400, "cancelled orders are terminal");
log("cancelled is terminal (400 on further transitions)");

// --- analytics ---------------------------------------------------------------
const summary = await api("/analytics/summary", { token: adminToken });
assert.equal(summary.json.total_orders, 1, "analytics counts only completed orders");
assert.equal(parseFloat(summary.json.total_revenue), +(2 * unitPrice).toFixed(2), "revenue excludes cancelled orders");
log(`analytics: ${summary.json.total_orders} completed order, revenue ${summary.json.total_revenue}`);

// --- password reset ----------------------------------------------------------
// Runs last, because it changes this user's password out from under everything
// above. The JWTs already issued keep working - they are stateless, which is
// itself the limitation this flow deliberately does not fix.
const sqlCmd = process.env.SQL_CMD;
assert.ok(sqlCmd, "SQL_CMD env var required (runs one statement against the database)");

// Shell interpolation is safe here and only here: every value substituted below
// is generated by this script (a timestamped @smoke.test address, a hex digest),
// never read from input. Same shape as PROMOTE_CMD above. Do not reach for this
// helper with anything that came from outside the file.
const sql = (statement) =>
  execSync(sqlCmd.replaceAll("{SQL}", statement), { encoding: "utf8" }).trim();

const rowsFor = (addr) =>
  parseInt(
    sql(`SELECT count(*) FROM password_resets r JOIN users u ON u.id = r.user_id WHERE u.email = '${addr}'`),
    10
  );

// An address nobody has registered must look exactly like one that is.
const unknownAsk = await api("/auth/forgot-password", {
  method: "POST",
  body: { email: `ghost-${Date.now()}@smoke.test` },
});
const knownBefore = rowsFor(email);
const knownAsk = await api("/auth/forgot-password", { method: "POST", body: { email } });

assert.equal(knownAsk.status, unknownAsk.status, "forgot-password status must not vary");
assert.deepEqual(knownAsk.json, unknownAsk.json, "forgot-password body must not vary");
assert.equal(rowsFor(email), knownBefore + 1, "a token is issued for a real account");
log("forgot-password: identical answer for known and unknown, token issued only for the real one");

// The raw token only ever exists in the email, so plant a known one directly.
// That is the point of storing a hash: the database cannot hand it back.
const rawToken = crypto.randomBytes(32).toString("base64url");
const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
sql(
  `INSERT INTO password_resets (user_id, token_hash, expires_at) SELECT id, '${tokenHash}', now() + interval '1 hour' FROM users WHERE email = '${email}'`
);

const newPassword = "e2e-Reset-Passw0rd!";
const used = await api("/auth/reset-password", {
  method: "POST",
  body: { token: rawToken, password: newPassword },
});
assert.equal(used.status, 200, `reset should succeed: ${JSON.stringify(used.json)}`);

// The real proof is not the 200 - it is that the credentials actually changed.
const withNew = await api("/auth/login", { method: "POST", body: { email, password: newPassword } });
assert.equal(withNew.status, 200, "the new password works");
const withOld = await api("/auth/login", { method: "POST", body: { email, password } });
assert.equal(withOld.status, 401, "the old password stops working");
log("reset-password: password changed, old one rejected");

const replay = await api("/auth/reset-password", {
  method: "POST",
  body: { token: rawToken, password: "another-Passw0rd!" },
});
assert.equal(replay.status, 400, "a reset token is single use");
const stillNew = await api("/auth/login", { method: "POST", body: { email, password: newPassword } });
assert.equal(stillNew.status, 200, "a replayed token changed nothing");
log("reset tokens are single use; a replay changes nothing");

console.log("\nE2E SMOKE: ALL CHECKS PASSED");
