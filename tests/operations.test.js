import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { A, B, as, database } from "./db-helper.js";

it("reconciles salesman stock issue, sale, saleable return and approved cash closing", async () => {
  const db = await database();
  const run = async (kind, data, operational = false) =>
    (
      await db.query(
        `select public.${operational ? "apply_operational_command" : "apply_command"}($1,$2,$3) result`,
        [randomUUID(), kind, data],
      )
    ).rows[0].result;
  const date = "2026-10-15";
  await run("master.save", {
    table: "products",
    record: {
      id: "P",
      name: "Operational Test Candy",
      boxes_per_carton: 24,
      cost_paisa: 20000,
      retail_paisa: 55000,
      wholesale_paisa: 50000,
    },
  });
  await run("master.save", {
    table: "salesmen",
    record: { id: "S", name: "Test Seller", user_id: B },
  });
  await run("master.save", {
    table: "customers",
    record: { id: "C", name: "Test Shop", salesman_id: "S" },
  });
  const sellerSnapshot = await as(db, B, async () =>
    (await db.query("select public.business_snapshot() snapshot")).rows[0]
      .snapshot,
  );
  expect(sellerSnapshot.products[0].cost_paisa).toBeUndefined();
  expect(sellerSnapshot.salesmen[0].base_salary_paisa).toBeUndefined();
  expect(sellerSnapshot.settings.base_salary_paisa).toBeUndefined();
  expect(sellerSnapshot.settings.incentives).toEqual([]);
  const sellerSettings = await as(db, B, async () =>
    (await db.query("select public.app_settings() settings")).rows[0].settings,
  );
  expect(sellerSettings.base_salary_paisa).toBeUndefined();
  expect(sellerSettings.incentives).toEqual([]);
  await expect(
    as(db, B, () => db.query("select cost_paisa from public.products")),
  ).rejects.toThrow();
  const adminSnapshot = await as(db, A, async () =>
    (await db.query("select public.business_snapshot() snapshot")).rows[0]
      .snapshot,
  );
  expect(Number(adminSnapshot.products[0].cost_paisa)).toBe(20000);
  expect(Number(adminSnapshot.salesmen[0].base_salary_paisa)).toBe(4_500_000);
  await run("stock.add", {
    transaction_id: "OPEN-P",
    product_id: "P",
    date,
    boxes: 1000,
    kind: "opening",
  });
  const issue = {
    transaction_id: "ISSUE-S-1",
    salesman_id: "S",
    product_id: "P",
    date,
    boxes: 240,
    reference: "V-001",
  };
  await run("stock.issue", issue, true);
  await run("stock.issue", issue, true);
  await expect(
    run(
      "stock.issue",
      { ...issue, transaction_id: "ISSUE-S-OTHER" },
      true,
    ),
  ).rejects.toThrow();
  let balances = await db.query(
    "select * from public.stock_balances() where product_id='P'",
  );
  expect(Number(balances.rows[0].boxes)).toBe(760);
  balances = await db.query(
    "select boxes from public.salesman_stock_balances() where product_id='P' and salesman_id='S'",
  );
  expect(Number(balances.rows[0].boxes)).toBe(240);

  const order = await run("order.save", {
    id: randomUUID(),
    customer_id: "C",
    salesman_id: "S",
    date,
    due_date: date,
    channel: "wholesale",
    items: [{ product_id: "P", cartons: 2, loose_boxes: 0 }],
  });
  expect(Number(order.total_paisa)).toBe(2_400_000);
  await run("payment.add", {
    transaction_id: "RECEIPT-S-1",
    invoice_id: order.id,
    date,
    amount_paisa: 800_000,
    method: "Cash",
    received_by: "Test Seller",
  });
  await run("master.save", {
    table: "expenses",
    record: {
      id: "EXP-S-1",
      date,
      category: "Fuel",
      description: "Route fuel",
      amount_paisa: 150_000,
      method: "Cash",
      salesman_id: "S",
    },
  });
  await run(
    "stock.return",
    {
      transaction_id: "RETURN-S-1",
      salesman_id: "S",
      product_id: "P",
      date,
      boxes: 48,
      condition: "saleable",
      reference: "R-001",
    },
    true,
  );
  await run(
    "stock.return",
    {
      transaction_id: "RETURN-S-1",
      salesman_id: "S",
      product_id: "P",
      date,
      boxes: 48,
      condition: "saleable",
      reference: "R-001",
    },
    true,
  );
  balances = await db.query(
    "select * from public.stock_balances() where product_id='P'",
  );
  expect(Number(balances.rows[0].boxes)).toBe(808);
  balances = await db.query(
    "select boxes from public.salesman_stock_balances() where product_id='P' and salesman_id='S'",
  );
  expect(Number(balances.rows[0].boxes)).toBe(144);
  await run(
    "stock.return",
    {
      transaction_id: "RETURN-S-DAMAGED",
      salesman_id: "S",
      product_id: "P",
      date,
      boxes: 24,
      condition: "damaged",
      note: "Damaged during route",
    },
    true,
  );
  balances = await db.query(
    "select * from public.stock_balances() where product_id='P'",
  );
  expect(Number(balances.rows[0].boxes)).toBe(808);
  balances = await db.query(
    "select boxes from public.salesman_stock_balances() where product_id='P' and salesman_id='S'",
  );
  expect(Number(balances.rows[0].boxes)).toBe(120);

  const submitted = await as(db, B, () =>
    run(
      "closing.submit",
      {
        salesman_id: "S",
        date,
        opening_cash_paisa: 200_000,
        cash_handed_over_paisa: 700_000,
        actual_cash_paisa: 150_000,
        actual_stock: { P: 120 },
        notes: "End of route",
      },
      true,
    ),
  );
  expect(submitted.status).toBe("submitted");
  expect(Number(submitted.cash_received_paisa)).toBe(800_000);
  expect(Number(submitted.cash_expenses_paisa)).toBe(150_000);
  expect(Number(submitted.expected_cash_paisa)).toBe(150_000);
  expect(Number(submitted.cash_variance_paisa)).toBe(0);
  expect(submitted.stock_variances).toEqual({});

  const approved = await as(db, A, () =>
    run(
      "closing.approve",
      { id: submitted.id, expected_version: submitted.version },
      true,
    ),
  );
  expect(approved.status).toBe("approved");
  await expect(
    as(db, A, () =>
      run(
        "stock.return",
        {
          transaction_id: "RETURN-AFTER-CLOSE",
          salesman_id: "S",
          product_id: "P",
          date,
          boxes: 1,
          condition: "saleable",
        },
        true,
      ),
    ),
  ).rejects.toThrow(/reopen the closing/i);
  await db.close();
}, 30000);

it("requires a reason for cash or stock discrepancies and blocks salesman approval", async () => {
  const db = await database();
  const run = async (kind, data) =>
    (
      await db.query(
        "select public.apply_operational_command($1,$2,$3) result",
        [randomUUID(), kind, data],
      )
    ).rows[0].result;
  await db.query(
    "insert into public.salesmen(id,name,user_id) values('S','Test Seller',$1)",
    [B],
  );
  const discrepant = {
    salesman_id: "S",
    date: "2026-10-15",
    opening_cash_paisa: 0,
    actual_cash_paisa: 10_000,
    actual_stock: {},
  };
  await expect(
    as(db, B, () => run("closing.submit", discrepant)),
  ).rejects.toThrow(/reason is required/i);
  const submitted = await as(db, B, () =>
    run("closing.submit", { ...discrepant, reason: "Cash count mismatch" }),
  );
  expect(submitted.status).toBe("submitted");
  await expect(
    as(db, B, () =>
      run("closing.approve", {
        id: submitted.id,
        expected_version: submitted.version,
      }),
    ),
  ).rejects.toThrow(/management approval/i);
  await db.close();
}, 30000);