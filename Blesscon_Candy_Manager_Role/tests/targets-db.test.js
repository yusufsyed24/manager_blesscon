import { it, expect } from "vitest";
import { database } from "./db-helper.js";
import { randomUUID } from "node:crypto";
it("database target recalculation gives 5/7/5 and removes achievements after cancellation", async () => {
  const db = await database(),
    run = async (kind, data) =>
      (
        await db.query("select public.apply_command($1,$2,$3) r", [
          randomUUID(),
          kind,
          data,
        ])
      ).rows[0].r;
  const master = (table, record) => run("master.save", { table, record });
  let set = (await db.query("select * from settings where id='business'"))
    .rows[0];
  await run("master.save", {
    table: "settings",
    record: {
      id: "business",
      value: { ...set.value, holidays: ["2026-10-31"] },
    },
    expected_version: 1,
  });
  await master("products", {
    id: "P",
    name: "Rani Candy Test",
    boxes_per_carton: 24,
    cost_paisa: 20000,
    retail_paisa: 25000,
    wholesale_paisa: 23000,
  });
  await master("salesmen", {
    id: "S",
    name: "Test",
    joining_date: "2026-10-01",
    monthly_target: 130,
  });
  await master("customers", { id: "C", name: "Shop" });
  await run("stock.add", {
    transaction_id: "OPEN",
    product_id: "P",
    date: "2026-10-01",
    boxes: 10000,
    kind: "opening",
  });
  let orders = [];
  for (const [date, cartons] of [
    ["2026-10-01", 3],
    ["2026-10-02", 7],
  ])
    orders.push(
      await run("order.save", {
        id: randomUUID(),
        customer_id: "C",
        salesman_id: "S",
        date,
        due_date: date,
        channel: "wholesale",
        items: [{ product_id: "P", cartons, loose_boxes: 0 }],
      }),
    );
  const values = await db.query(
    "select effective_target::float n from salesman_daily_targets where date between '2026-10-01' and '2026-10-03' order by date",
  );
  expect(values.rows.map((x) => x.n)).toEqual([5, 7, 5]);
  await run("order.cancel", { id: orders[0].id, version: 1 });
  const after = await db.query(
    "select achieved_cartons::float n from salesman_daily_targets where date='2026-10-01'",
  );
  expect(after.rows[0].n).toBe(0);
  await db.close();
}, 30000);
