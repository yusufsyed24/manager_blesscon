import { it, expect } from "vitest";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { A, B, C, as, database } from "./db-helper.js";

// Executes supabase/manager_closing_expenses_v40.sql against a real Postgres engine (PGlite) and checks
// the backend rules: team scope, no dummy salesman, Admin-only decisions, manager expense permissions.
const M = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DATE = "2026-10-17";
const file = (f) => fs.readFile(new URL(`../supabase/${f}`, import.meta.url), "utf8");

async function world() {
  const db = await database();
  for (const f of ["manager_role.sql", "manager_closing_fix_v39.sql", "manager_closing_expenses_v40.sql"]) await db.exec(await file(f));
  await db.exec(`
    insert into auth.users values('${M}','manager@test.test');
    insert into public.profiles(id,display_name) values('${M}','Babar');
    insert into public.user_roles(user_id,role) values('${M}','manager');
    insert into public.products(id,name,boxes_per_carton,cost_paisa,retail_paisa,wholesale_paisa) values('P','Candy',24,100,200,150);
    insert into public.salesmen(id,name,user_id,manager_user_id) values('S1','One','${B}','${M}'),('S2','Two','${C}',null);
    insert into public.customers(id,name,salesman_id) values('C1','Shop','S1');
    insert into public.salesman_stock_movements(transaction_id,product_id,salesman_id,date,boxes,kind,reference) values('T1','P','S1','${DATE}',10,'issue','R1'),('T2','P','S2','${DATE}',99,'issue','R2');
    insert into public.orders(id,number,customer_id,salesman_id,date,due_date,channel,status,total_paisa,created_by) values('00000000-0000-4000-8000-0000000000a1','ORD-1','C1','S1','${DATE}','2026-10-30','retail','confirmed',150000,'${B}');
    insert into public.invoices(id,order_id,number,total_paisa) values('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000a1','INV-1',150000);
    insert into public.payments(transaction_id,invoice_id,date,amount_paisa,method,received_by,created_by) values('PAY-1','00000000-0000-4000-8000-0000000000b1','${DATE}',100000,'Cash','One','${B}');
  `);
  return db;
}
const cmd = (db, id, kind, data) => as(db, id, async () => (await db.query("select public.manager_closing_command($1,$2,$3) r", [randomUUID(), kind, data])).rows[0].r);
const save = (db, id, record) => as(db, id, async () => (await db.query("select public.apply_command($1,'master.save',$2) r", [randomUUID(), { table: "expenses", record }])).rows[0].r);
const payload = (extra = {}) => ({ date: DATE, opening_cash_paisa: 0, cash_handed_over_paisa: 0, actual_cash_paisa: 100000, cash_in_bank_paisa: 0, cash_in_hand_paisa: 0, cash_in_easypaisa_paisa: 0, cash_in_jazzcash_paisa: 0, market_credit_paisa: 0, actual_stock: { P: 10 }, reason: "", notes: "", ...extra });

it("manager submits one consolidated team closing; Admin decides; salesman cannot", async () => {
  const db = await world();
  const salesmenBefore = (await db.query("select count(*)::int n from public.salesmen")).rows[0].n;
  await expect(cmd(db, B, "closing.manager_submit", payload())).rejects.toThrow(/Only a manager/);
  const row = await cmd(db, M, "closing.manager_submit", payload());
  expect(row).toMatchObject({ status: "submitted", manager_user_id: M, sales_total_paisa: 150000, cash_received_paisa: 100000, expected_cash_paisa: 100000, cash_variance_paisa: 0 });
  expect(row.team_salesman_ids).toEqual(["S1"]); // S2 is not assigned: its 99 boxes are excluded
  expect(row.expected_stock).toEqual({ P: 10 });
  expect((await db.query("select count(*)::int n from public.salesmen")).rows[0].n).toBe(salesmenBefore);
  await expect(cmd(db, M, "closing.manager_submit", payload())).rejects.toThrow(/already submitted or changed/);
  await expect(cmd(db, M, "closing.manager_approve", { id: row.id, expected_version: row.version })).rejects.toThrow(/Admin approval required/);
  await expect(cmd(db, A, "closing.manager_reject", { id: row.id, expected_version: row.version })).rejects.toThrow(/rejection reason/);
  const approved = await cmd(db, A, "closing.manager_approve", { id: row.id, expected_version: row.version });
  expect(approved).toMatchObject({ status: "approved", approved_by: A, decision_by: A });
  expect(approved.decision_at).toBeTruthy();
  const snap = async (id) => as(db, id, async () => (await db.query("select public.business_snapshot() s")).rows[0].s);
  expect((await snap(A)).manager_daily_closings).toHaveLength(1);
  expect((await snap(M)).manager_daily_closings).toHaveLength(1);
  expect((await snap(B)).manager_daily_closings).toHaveLength(0);
});

it("variance needs a reason; rejected closing can be resubmitted; approved day is locked", async () => {
  const db = await world();
  await expect(cmd(db, M, "closing.manager_submit", payload({ actual_cash_paisa: 90000 }))).rejects.toThrow(/reason is required/);
  const row = await cmd(db, M, "closing.manager_submit", payload({ actual_cash_paisa: 90000, reason: "Short cash" }));
  expect(row.cash_variance_paisa).toBe(-10000);
  const rejected = await cmd(db, A, "closing.manager_reject", { id: row.id, expected_version: row.version, reason: "Recount" });
  expect(rejected).toMatchObject({ status: "rejected", decision_reason: "Recount", decision_by: A });
  const again = await cmd(db, M, "closing.manager_submit", payload({ expected_version: rejected.version }));
  expect(again.status).toBe("submitted");
  await cmd(db, A, "closing.manager_approve", { id: again.id, expected_version: again.version });
  await expect(save(db, A, { id: "EXP-L", date: DATE, category: "Misc", amount_paisa: 100, method: "Cash", salesman_id: "S1" })).rejects.toThrow(/manager closing/);
});

it("manager expenses: add own daily expenses, team-only links, no salary, no editing others", async () => {
  const db = await world();
  await save(db, A, { id: "EXP-A", date: "2026-10-10", category: "Rent", amount_paisa: 900, method: "Bank" });
  const mine = await save(db, M, { id: "EXP-M", date: "2026-10-16", category: "Fuel", amount_paisa: 2500, method: "Cash" });
  expect(mine.created_by).toBe(M);
  await save(db, M, { id: "EXP-M2", date: "2026-10-16", category: "Fuel", amount_paisa: 700, method: "Cash", salesman_id: "S1" });
  await expect(save(db, M, { id: "EXP-M3", date: "2026-10-16", category: "Fuel", amount_paisa: 700, method: "Cash", salesman_id: "S2" })).rejects.toThrow(/assigned salesmen/);
  await expect(save(db, M, { id: "EXP-M4", date: "2026-10-16", category: "Salary", amount_paisa: 700, method: "Cash", salary_period: "2026-10" })).rejects.toThrow(/salary/i);
  await expect(save(db, M, { id: "EXP-M5", date: "2099-01-01", category: "Fuel", amount_paisa: 700, method: "Cash" })).rejects.toThrow(/future/);
  await expect(save(db, M, { id: "EXP-A", date: "2026-10-10", category: "Rent", amount_paisa: 1, method: "Bank" })).rejects.toThrow(/another user|CONFLICT/);
  await expect(save(db, B, { id: "EXP-B", date: "2026-10-16", category: "Misc", amount_paisa: 5, method: "Cash" })).rejects.toThrow(/permission required/);
  const snap = await as(db, M, async () => (await db.query("select public.business_snapshot() s")).rows[0].s);
  expect(snap.expenses.map((e) => e.id).sort()).toEqual(["EXP-M", "EXP-M2"]); // not the Admin's EXP-A
});
