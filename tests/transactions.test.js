import { beforeAll, afterAll, it, expect } from "vitest";
import { database, A, B, C, as } from "./db-helper.js";
import { randomUUID } from "node:crypto";
let db;
const day = new Date().toISOString().slice(0, 10);
const cmd = async (kind, data, op = randomUUID()) =>
  (
    await db.query("select public.apply_command($1,$2,$3) as r", [
      op,
      kind,
      data,
    ])
  ).rows[0].r;
const master = (table, record, expected_version) =>
  cmd("master.save", { table, record, expected_version });
beforeAll(async () => {
  db = await database();
  await master("products", {
    id: "P1",
    name: "Rani Candy - Strawberry",
    boxes_per_carton: 24,
    cost_paisa: 20000,
    retail_paisa: 25000,
    wholesale_paisa: 23000,
  });
  await master("salesmen", {
    id: "S1",
    name: "One",
    user_id: B,
    joining_date: day,
  });
  await master("salesmen", {
    id: "S2",
    name: "Two",
    user_id: C,
    joining_date: day,
  });
  await master("customers", {
    id: "CU1",
    name: "Test Customer",
    salesman_id: "S1",
  });
  await master("customers", {
    id: "CU2",
    name: "Other Customer",
    salesman_id: "S2",
  });
  await cmd("stock.add", {
    transaction_id: "OPEN",
    product_id: "P1",
    date: day,
    boxes: 10000,
    kind: "opening",
  });
}, 30000);
afterAll(async () => {
  await db?.close();
});
const doc = (extra = {}) => ({
  id: randomUUID(),
  customer_id: "CU1",
  salesman_id: "S1",
  date: day,
  due_date: day,
  valid_until: "2099-01-01",
  channel: "wholesale",
  discount_paisa: 0,
  items: [{ product_id: "P1", cartons: 1, loose_boxes: 0, rate_paisa: 23000 }],
  ...extra,
});
it("order confirms atomically, retries deduct once, stale edit fails, cancellation reverses stock", async () => {
  let before = (
    await db.query(
      "select sum(boxes)::int n from public.stock_movements where product_id='P1'",
    )
  ).rows[0].n;
  let d = doc(),
    id = randomUUID();
  let o = await cmd("order.save", d, id);
  await cmd("order.save", d, id);
  expect(
    (
      await db.query(
        "select sum(boxes)::int n from public.stock_movements where product_id='P1'",
      )
    ).rows[0].n,
  ).toBe(before - 24);
  await expect(cmd("order.save", { ...d, version: 0 })).rejects.toThrow(
    "CONFLICT",
  );
  await cmd("order.cancel", { id: o.id, version: o.version });
  expect(
    (
      await db.query(
        "select sum(boxes)::int n from public.stock_movements where product_id='P1'",
      )
    ).rows[0].n,
  ).toBe(before);
  expect(
    (await db.query("select status from public.orders where id=$1", [o.id]))
      .rows[0].status,
  ).toBe("cancelled");
});
it("stock check rolls back the entire order and invoice", async () => {
  const d = doc({
    items: [{ product_id: "P1", cartons: 10000, loose_boxes: 0 }],
  });
  await expect(cmd("order.save", d)).rejects.toThrow("Insufficient stock");
  expect(
    (await db.query("select * from public.orders where id=$1", [d.id])).rows,
  ).toHaveLength(0);
});
it("payments 0 -> 40,000 -> 100,000, overpayment rejected and payments protect cancellation", async () => {
  const o = await cmd(
    "order.save",
    doc({
      items: [
        {
          product_id: "P1",
          cartons: 0,
          loose_boxes: 400,
          rate_paisa: 25000,
          override_reason: "Agreed test rate",
        },
      ],
    }),
  );
  const i = (
    await db.query("select * from public.invoices where order_id=$1", [o.id])
  ).rows[0];
  expect(Number(i.total_paisa)).toBe(10000000);
  let p = { invoice_id: i.id, date: day, method: "Bank", received_by: "Admin" };
  await cmd("payment.add", {
    ...p,
    transaction_id: "PAY1",
    amount_paisa: 4000000,
  });
  expect(
    Number(
      (
        await db.query(
          "select sum(amount_paisa) p from public.payments where invoice_id=$1",
          [i.id],
        )
      ).rows[0].p,
    ),
  ).toBe(4000000);
  await cmd("payment.add", {
    ...p,
    transaction_id: "PAY2",
    amount_paisa: 6000000,
  });
  await expect(
    cmd("payment.add", { ...p, transaction_id: "PAY3", amount_paisa: 1 }),
  ).rejects.toThrow("Overpayment");
  await expect(
    cmd("order.cancel", { id: o.id, version: o.version }),
  ).rejects.toThrow("Void/refund");
});
it("quotation create/edit/convert keeps rates, stock reduces once, second conversion blocked, draft soft and hard delete", async () => {
  let q = await cmd("quote.save", doc());
  q = await cmd("quote.save", {
    ...doc(),
    id: q.id,
    version: q.version,
    notes: "Revision two",
  });
  expect(q.revision).toBe(2);
  let stock = Number(
    (await db.query("select sum(boxes) n from public.stock_movements")).rows[0]
      .n,
  );
  const o = await cmd("quote.convert", { id: q.id, version: q.version });
  expect(
    Number(
      (await db.query("select sum(boxes) n from public.stock_movements"))
        .rows[0].n,
    ),
  ).toBe(stock - 24);
  await expect(
    cmd("quote.convert", { id: q.id, version: q.version }),
  ).rejects.toThrow("already converted");
  expect(
    (
      await db.query("select quotation_id from public.orders where id=$1", [
        o.id,
      ])
    ).rows[0].quotation_id,
  ).toBe(q.id);
  let draft = await cmd("quote.save", doc());
  draft = await cmd("quote.delete", { id: draft.id, version: draft.version });
  expect(draft.deleted_at).toBeTruthy();
  await cmd("quote.delete", {
    id: draft.id,
    version: draft.version,
    hard: true,
  });
  expect(
    (await db.query("select * from public.quotations where id=$1", [draft.id]))
      .rows,
  ).toHaveLength(0);
});
it("salesman RLS isolates orders and customers, denies settings and direct writes, ownership spoof, override and deletion", async () => {
  await cmd("order.save", doc({ salesman_id: "S2", customer_id: "CU2" }));
  await as(db, B, async () => {
    const visible = (await db.query("select * from public.orders")).rows;
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((o) => o.salesman_id === "S1")).toBe(true);
    expect((await db.query("select * from public.settings")).rows).toHaveLength(
      0,
    );
    expect(
      (await db.query("select * from public.customers")).rows.map((c) => c.id),
    ).not.toContain("CU2");
    await expect(
      db.query("update public.orders set total_paisa=1"),
    ).rejects.toThrow("permission denied");
    await expect(
      cmd("order.save", doc({ salesman_id: "S2", customer_id: "CU2" })),
    ).rejects.toThrow("Cannot use");
    await expect(
      cmd(
        "order.save",
        doc({
          items: [
            {
              product_id: "P1",
              cartons: 1,
              loose_boxes: 0,
              rate_paisa: 1,
              override_reason: "hack",
            },
          ],
        }),
      ),
    ).rejects.toThrow("PRICE_CHANGED");
    await expect(cmd("quote.delete", { id: randomUUID() })).rejects.toThrow(
      "Admin required",
    );
    const saved = await cmd("order.save", doc());
    expect(saved.salesman_id).toBe("S1");
  });
});
it("share tokens read only a redacted document and revocation invalidates access", async () => {
  const o = await cmd("order.save", doc());
  const i = (
    await db.query("select * from public.invoices where order_id=$1", [o.id])
  ).rows[0];
  const share = await cmd("share.create", { id: i.id, type: "invoice" });
  await db.exec("set role anon");
  let d = (await db.query("select public.shared_document($1) d", [share.token]))
    .rows[0].d;
  expect(d.document.number).toBe(o.number);
  expect(d.items[0].cost_paisa).toBeUndefined();
  await expect(db.query("select * from public.orders")).rejects.toThrow(
    "permission denied",
  );
  await db.exec("reset role");
  await cmd("share.revoke", { id: i.id, type: "invoice" });
  await expect(
    db.query("select public.shared_document($1)", [share.token]),
  ).rejects.toThrow("expired");
});
