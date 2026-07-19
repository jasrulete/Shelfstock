// End-to-end smoke test against a RUNNING ShelfStock stack (fresh database).
//
// Exercises the real HTTP API: register → checkout → stock decrement →
// price snapshotting → row-level authorization → admin order lifecycle →
// cancellation stock restore → analytics.
//
// Usage (from the repo root, with a fresh db volume):
//   docker compose up -d --wait db api
//   PROMOTE_CMD="docker compose exec -T db psql -U postgres -d shelfstock -c \"UPDATE users SET role='admin' WHERE email='{EMAIL}'\"" \
//     node backend/scripts/e2e-smoke.mjs
//   docker compose down -v
//
// (See .github/workflows/ci.yml for the exact invocation CI uses.)

import assert from "node:assert/strict";
import { execSync } from "node:child_process";

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

for (const status of ["shipped", "completed"]) {
  const r = await api(`/orders/${order1Id}/status`, { method: "PATCH", token: adminToken, body: { status } });
  assert.equal(r.json.status, status, `order ${order1Id} -> ${status}`);
}
log(`order ${order1Id}: pending -> shipped -> completed`);

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

console.log("\nE2E SMOKE: ALL CHECKS PASSED");
