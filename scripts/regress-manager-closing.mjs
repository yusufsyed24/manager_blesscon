// Dependency-free regression checks for the v40 manager closing / manager expenses / Admin approval work.
// Run with:  node scripts/regress-manager-closing.mjs      (also wrapped by tests/manager-closing-local.test.js)
// It exercises the offline/practice engine (localApply) and statically checks the SQL migration and the
// deployment copies. It does NOT execute SQL - see tests/manager-closing-db.test.js for the pglite suite.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const { empty, localApply, managerClosingFigures, managerTeamIds } = await import(pathToFileURL(path.join(root, "js/store.js")).href);

const M = "11111111-1111-4111-8111-111111111111"; // manager
const A = "22222222-2222-4222-8222-222222222222"; // admin
const U = "33333333-3333-4333-8333-333333333333"; // salesman login
const date = "2026-10-17";
const mgr = { id: M, role: "manager", name: "Babar", practice: true };
const adm = { id: A, role: "admin", name: "Admin", practice: true };
const sls = { id: U, role: "salesman", name: "Seller", practice: true };
let n = 0;
const op = (kind, data) => ({ id: `op-${++n}`, kind, data });

function world() {
  const s = empty();
  s.products.push({ id: "P", name: "Candy", active: true });
  s.salesmen.push(
    { id: "S1", name: "One", active: true, manager_user_id: M },
    { id: "S2", name: "Two", active: true, manager_user_id: M },
    { id: "S3", name: "Other team", active: true, manager_user_id: null },
    { id: "S4", name: "Gone", active: true, deleted_at: "2026-01-01", manager_user_id: M },
  );
  const order = (id, sid, createdBy, total, d = date) => s.orders.push({ id, salesman_id: sid, created_by: createdBy, status: "confirmed", date: d, total_paisa: total });
  const pay = (id, oid, method, amt, d = date, voided = null) => {
    s.invoices.push({ id: "inv-" + id, order_id: oid });
    s.payments.push({ id, invoice_id: "inv-" + id, date: d, method, amount_paisa: amt, voided_at: voided });
  };
  order("o1", "S1", U, 150000); pay("p1", "o1", "Cash", 100000); pay("p1b", "o1", "Bank", 50000);
  order("o2", "S2", U, 30000); pay("p2", "o2", "Cash", 30000);
  order("o3", null, M, 20000); pay("p3", "o3", "Cash", 20000); // manager direct sale
  order("o4", "S3", U, 999900); pay("p4", "o4", "Cash", 999900); // outside the team
  order("o5", "S1", U, 10000, "2026-10-01"); pay("p5", "o5", "Cash", 5000); // older invoice paid today
  pay("p5v", "o5", "Cash", 7777, date, "2026-10-17T10:00:00Z"); // voided: ignored
  const exp = (id, sid, by, amt, extra = {}) => s.expenses.push({ id, date, category: "Misc", description: "", amount_paisa: amt, method: "Cash", salesman_id: sid, created_by: by, salary_period: null, deleted_at: null, ...extra });
  exp("e1", "S1", U, 10000); exp("e2", null, M, 5000); exp("e3", "S3", U, 77700);
  exp("e4", "S1", A, 123400, { salary_period: "2026-10" }); exp("e5", null, A, 88800);
  exp("e6", "S2", U, 2000, { method: "Bank" });
  const mv = (id, sid, kind, boxes, d = date) => s.salesman_stock_movements.push({ id, product_id: "P", salesman_id: sid, date: d, kind, boxes });
  mv("m1", "S1", "issue", 10); mv("m2", "S1", "sale", -3); mv("m3", "S2", "issue", 5); mv("m4", "S3", "issue", 50);
  return s;
}
const run = (s, o, u) => localApply(s, o, u);
const closing = (extra = {}) => ({ date, opening_cash_paisa: 0, cash_handed_over_paisa: 0, actual_cash_paisa: 140000 - 15000 + 5000 + 0, cash_in_bank_paisa: 0, cash_in_hand_paisa: 0, cash_in_easypaisa_paisa: 0, cash_in_jazzcash_paisa: 0, market_credit_paisa: 0, actual_stock: { P: 12 }, reason: "", notes: "", ...extra });
// cash received = 100000+30000+20000+5000 = 155000 ; cash expenses = 10000+5000 = 15000 ; expected = 140000
const goodClosing = (extra = {}) => closing({ actual_cash_paisa: 140000, ...extra });

const checks = [];
const test = (name, fn) => checks.push({ name, fn });
const throws = (fn, re) => assert.throws(fn, (e) => re.test(e.message), `expected error ${re}`);

test("figures cover the assigned team + manager direct sales/expenses only", () => {
  const f = managerClosingFigures(world(), M, date);
  assert.deepEqual(f.team, ["S1", "S2"]);
  assert.equal(f.salesCount, 3);
  assert.equal(f.salesTotal, 150000 + 30000 + 20000);
  assert.deepEqual(f.collectionsByMethod, { Cash: 155000, Bank: 50000 });
  assert.equal(f.cashReceived, 155000);
  assert.equal(f.expensesTotal, 10000 + 5000 + 2000);
  assert.equal(f.cashExpenses, 15000);
  assert.deepEqual(f.expectedStock, { P: 12 });
  assert.deepEqual(f.stockMovements, { P: { issue: 15, sale: -3 } });
});
test("manager submits ONE consolidated closing without any salesman record", () => {
  const s = world(); const before = s.salesmen.length;
  const r = run(s, op("closing.manager_submit", goodClosing()), mgr);
  const row = r.state.manager_daily_closings[0];
  assert.equal(r.state.salesmen.length, before, "no dummy salesman created");
  assert.equal(row.salesman_id, undefined);
  assert.equal(row.manager_user_id, M);
  assert.equal(row.status, "submitted");
  assert.equal(row.expected_cash_paisa, 140000);
  assert.equal(row.cash_variance_paisa, 0);
  assert.deepEqual(row.team_salesman_ids, ["S1", "S2"]);
  assert.equal(r.state.daily_closings.length, 0, "salesman closings untouched");
});
test("cash or stock variance needs a reason", () => {
  const s = world();
  throws(() => run(s, op("closing.manager_submit", goodClosing({ actual_cash_paisa: 139000 })), mgr), /reason is required/);
  throws(() => run(s, op("closing.manager_submit", goodClosing({ actual_stock: { P: 11 } })), mgr), /reason is required/);
  const ok = run(s, op("closing.manager_submit", goodClosing({ actual_cash_paisa: 139000, actual_stock: { P: 11 }, reason: "Damaged box" })), mgr);
  const row = ok.state.manager_daily_closings[0];
  assert.equal(row.cash_variance_paisa, -1000);
  assert.deepEqual(row.stock_variances, { P: { expected: 12, actual: 11, variance: -1 } });
});
test("only a manager can submit; negative amounts rejected; one closing per day", () => {
  const s = world();
  throws(() => run(s, op("closing.manager_submit", goodClosing()), adm), /Only a manager/);
  throws(() => run(s, op("closing.manager_submit", goodClosing()), sls), /Only a manager/);
  throws(() => run(s, op("closing.manager_submit", goodClosing({ cash_in_bank_paisa: -1 })), mgr), /cannot be negative/);
  const once = run(s, op("closing.manager_submit", goodClosing()), mgr).state;
  throws(() => run(once, op("closing.manager_submit", goodClosing()), mgr), /already submitted or changed/);
});
test("Admin sees submitted closing; approve/reject/reopen are Admin-only and recorded", () => {
  let s = run(world(), op("closing.manager_submit", goodClosing()), mgr).state;
  const row = s.manager_daily_closings[0];
  throws(() => run(s, op("closing.manager_approve", { id: row.id, expected_version: row.version }), mgr), /Admin approval required/);
  const approved = run(s, op("closing.manager_approve", { id: row.id, expected_version: row.version }), adm).state.manager_daily_closings[0];
  assert.equal(approved.status, "approved");
  assert.equal(approved.approved_by, A); assert.equal(approved.decision_by, A);
  assert.ok(approved.decision_at && approved.approved_at);
  throws(() => run(s, op("closing.manager_approve", { id: row.id, expected_version: 99 }), adm), /changed/);
  // reject needs a reason and records it
  throws(() => run(s, op("closing.manager_reject", { id: row.id, expected_version: row.version }), adm), /rejection reason/);
  const rejected = run(s, op("closing.manager_reject", { id: row.id, expected_version: row.version, reason: "Recount cash" }), adm).state;
  const rj = rejected.manager_daily_closings[0];
  assert.equal(rj.status, "rejected"); assert.equal(rj.decision_reason, "Recount cash"); assert.equal(rj.decision_by, A); assert.equal(rj.approved_by, null);
  // manager may resubmit a rejected closing with the current version
  const again = run(rejected, op("closing.manager_submit", goodClosing({ expected_version: rj.version, notes: "recounted" })), mgr).state.manager_daily_closings[0];
  assert.equal(again.status, "submitted"); assert.equal(again.version, rj.version + 1); assert.equal(again.decision_reason, "");
  // approved closings can be reopened only with a reason
  const ap = run(s, op("closing.manager_approve", { id: row.id, expected_version: row.version }), adm).state;
  const a = ap.manager_daily_closings[0];
  throws(() => run(ap, op("closing.manager_reopen", { id: a.id, expected_version: a.version }), adm), /reopening reason/);
  assert.equal(run(ap, op("closing.manager_reopen", { id: a.id, expected_version: a.version, reason: "Late invoice" }), adm).state.manager_daily_closings[0].status, "reopened");
});
test("opening cash must match the previous approved closing", () => {
  let s = run(world(), op("closing.manager_submit", goodClosing()), mgr).state;
  const row = s.manager_daily_closings[0];
  s = run(s, op("closing.manager_approve", { id: row.id, expected_version: row.version }), adm).state;
  const next = { ...goodClosing(), date: "2026-10-18", opening_cash_paisa: 1, actual_cash_paisa: 1 };
  throws(() => run(s, op("closing.manager_submit", next), mgr), /Opening cash must match/);
});
test("managers can add daily expenses locally; team-only visibility helper", () => {
  const s = world();
  const saved = run(s, op("master.save", { table: "expenses", record: { id: "EXP-X", date, category: "Transport", description: "Fuel", amount_paisa: 2500, method: "Cash", salesman_id: null }, expected_version: undefined }), mgr).state;
  assert.equal(saved.expenses.find((e) => e.id === "EXP-X").created_by, M);
  assert.deepEqual(managerTeamIds(s, M), ["S1", "S2"]);
});
test("v39 regression: root and web store allow a manager to close for any active salesman", () => {
  for (const f of ["js/store.js", "web/js/store.js"]) {
    const src = read(f);
    assert.ok(!src.includes("their manager, or Admin may submit"), f + " still has the old message");
    assert.ok(!/row\.manager_user_id === user\.id && row\.active && !row\.deleted_at,\n\s*\);\n\s*if \(!admin && !ownsSeller/.test(src), f + " still requires assignment for salesman closing");
  }
});
test("deployment copies: root and web are identical", () => {
  for (const f of ["js/store.js", "js/app.js", "sw.js", "index.html"]) {
    assert.equal(read(f), read("web/" + f), `${f} differs between root and web/`);
  }
  for (const f of ["manager_closing_expenses_v40.sql", "manager_closing_fix_v39.sql"]) {
    assert.ok(fs.existsSync(path.join(root, "supabase", f)), f + " missing");
  }
});
test("RPC routing and sync path cover manager closing commands", () => {
  const src = read("js/store.js");
  assert.match(src, /startsWith\("closing\.manager_"\) \? "manager_closing_command"/);
  assert.match(src, /kind\.startsWith\("closing\.manager_"\)\) && this\.client/);
});
test("migration defines the table, command, scope rules and Admin-only decisions", () => {
  const sql = read("supabase/manager_closing_expenses_v40.sql");
  for (const needle of [
    "create table if not exists public.manager_daily_closings", "unique (manager_user_id, business_date)",
    "create or replace function public.manager_closing_command", "closing.manager_submit", "closing.manager_approve",
    "closing.manager_reject", "closing.manager_reopen", "Admin approval required", "manager_expense_visible",
    "manager_expense_rules", "Managers cannot post salary expenses", "assigned salesmen", "manager_closing_read",
    "alter table public.manager_daily_closings enable row level security", "revoke all on public.manager_daily_closings from anon, authenticated",
  ]) assert.ok(sql.includes(needle), "migration is missing: " + needle);
  assert.ok(!/dummy|insert into public\.salesmen/i.test(sql.replace(/--.*$/gm, "")), "migration must not create salesmen");
  assert.equal((sql.match(/\$mig\$/g) || []).length % 2, 0, "unbalanced $mig$ blocks");
  assert.equal((sql.match(/\$q\$/g) || []).length % 2, 0, "unbalanced $q$ strings");
  assert.equal((sql.match(/\$\$/g) || []).length % 2, 0, "unbalanced $$ blocks");
});
test("UI wiring: closing page, approval actions and expenses access exist", () => {
  const app = read("js/app.js");
  for (const needle of ["new-manager-closing", "approve-manager-closing", "reject-manager-closing", "reopen-manager-closing", 'case "manager-closing-form"', "managerClosingPanel()", '"staff","expenses"]']) {
    assert.ok(app.includes(needle), "app.js is missing: " + needle);
  }
});

export async function runRegression() {
  const out = [];
  for (const c of checks) {
    try { await c.fn(); out.push({ name: c.name, ok: true }); }
    catch (error) { out.push({ name: c.name, ok: false, error: error.message }); }
  }
  return out;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const results = await runRegression();
  for (const r of results) console.log((r.ok ? "PASS " : "FAIL ") + r.name + (r.ok ? "" : "\n     " + r.error));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
