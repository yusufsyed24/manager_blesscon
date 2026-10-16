import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { A, B, as, database } from "./db-helper.js";

it("reconciles salesman stock issue, sale, saleable return and approved cash closing", async () => {
  const db = await database();
  const run = async (kind, data, operational = false, operationId = randomUUID()) =>
    (
      await db.query(
        `select public.${operational ? "apply_operational_command" : "apply_command"}($1,$2,$3) result`,
        [operationId, kind, data],
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
    table: "products",
    record: {
      id: "Q",
      name: "Sour Chew Test Candy",
      boxes_per_carton: 12,
      cost_paisa: 10000,
      retail_paisa: 30000,
      wholesale_paisa: 25000,
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
  expect(sellerSnapshot.products.find((product) => product.id === "P").cost_paisa).toBeUndefined();
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
  expect(Number(adminSnapshot.products.find((product) => product.id === "P").cost_paisa)).toBe(20000);
  expect(Number(adminSnapshot.salesmen[0].base_salary_paisa)).toBe(4_500_000);
  await run("stock.add", {
    transaction_id: "OPEN-P",
    product_id: "P",
    date,
    boxes: 1000,
    kind: "opening",
  });
  await run("stock.add", {
    transaction_id: "OPEN-Q",
    product_id: "Q",
    date,
    boxes: 600,
    kind: "opening",
  });
  const issue = {
    salesman_id: "S",
    date,
    reference: "V-001",
    items: [
      { transaction_id: "ISSUE-S-1", product_id: "P", boxes: 240 },
      { transaction_id: "ISSUE-S-2", product_id: "Q", boxes: 120 },
    ],
  };
  const issueOperation = randomUUID();
  await run("stock.issue", issue, true, issueOperation);
  await run("stock.issue", issue, true, issueOperation);
  await expect(
    run(
      "stock.issue",
      { ...issue, reference: "V-001" },
      true,
    ),
  ).rejects.toThrow(/voucher reference already exists/i);
  let balances = await db.query(
    "select * from public.stock_balances() where product_id='P'",
  );
  expect(Number(balances.rows[0].boxes)).toBe(760);
  balances = await db.query(
    "select boxes from public.salesman_stock_balances() where product_id='P' and salesman_id='S'",
  );
  expect(Number(balances.rows[0].boxes)).toBe(240);
  const issuedQ = await db.query(
    "select boxes from public.salesman_stock_balances() where product_id='Q' and salesman_id='S'",
  );
  expect(Number(issuedQ.rows[0].boxes)).toBe(120);
  const voucherLines = await db.query(
    "select count(*)::integer n from public.salesman_stock_movements where reference='V-001' and kind='issue'",
  );
  expect(voucherLines.rows[0].n).toBe(2);

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
  const returnOperation = randomUUID();
  await run(
    "stock.return",
    {
      transaction_id: "RETURN-S-1",
      salesman_id: "S",
      date,
      condition: "saleable",
      reference: "R-001",
      items: [
        { transaction_id: "RETURN-S-1", product_id: "P", boxes: 48 },
        { transaction_id: "RETURN-S-2", product_id: "Q", boxes: 24 },
      ],
    },
    true,
    returnOperation,
  );
  await run(
    "stock.return",
    {
      transaction_id: "RETURN-S-1",
      salesman_id: "S",
      date,
      condition: "saleable",
      reference: "R-001",
      items: [
        { transaction_id: "RETURN-S-1", product_id: "P", boxes: 48 },
        { transaction_id: "RETURN-S-2", product_id: "Q", boxes: 24 },
      ],
    },
    true,
    returnOperation,
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
        actual_stock: { P: 120, Q: 96 },
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

it("manager role can record direct sales and view company target inputs without cost access", async () => {
  const db = await database();
  const managerId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const run = (kind, data) =>
    db.query("select public.apply_command($1,$2,$3) result", [
      randomUUID(),
      kind,
      data,
    ]);
  await db.query("insert into auth.users(id,email) values($1,'manager@test.test')", [managerId]);
  await db.query("insert into public.profiles(id,display_name) values($1,'Manager')", [managerId]);
  await db.query("insert into public.user_roles(user_id,role) values($1,'manager')", [managerId]);
  await run("master.save", {
    table: "products",
    record: {
      id: "M-P",
      name: "Manager Direct Test Candy",
      boxes_per_carton: 24,
      cost_paisa: 10000,
      retail_paisa: 25000,
      wholesale_paisa: 20000,
    },
  });
  await run("master.save", {
    table: "customers",
    record: { id: "M-C", name: "Manager Shop", salesman_id: null },
  });
  await run("stock.add", {
    transaction_id: "M-OPEN",
    product_id: "M-P",
    date: "2026-10-15",
    boxes: 1000,
    kind: "opening",
  });
  const snapshot = await as(db, managerId, async () =>
    (await db.query("select public.business_snapshot() snapshot")).rows[0]
      .snapshot,
  );
  expect(snapshot.orders).toEqual([]);
  expect(snapshot.products.find((product) => product.id === "M-P").cost_paisa).toBeUndefined();
  const order = await as(db, managerId, async () =>
    (
      await db.query(
        "select public.apply_command($1,'order.save',$2) result",
        [
          randomUUID(),
          {
            id: randomUUID(),
            customer_id: "M-C",
            salesman_id: null,
            date: "2026-10-15",
            due_date: "2026-10-22",
            channel: "wholesale",
            items: [{ product_id: "M-P", cartons: 3, loose_boxes: 0 }],
          },
        ],
      )
    ).rows[0].result,
  );
  expect(order.salesman_id).toBeNull();
  const managerSnapshot = await as(db, managerId, async () =>
    (await db.query("select public.business_snapshot() snapshot")).rows[0]
      .snapshot,
  );
  expect(managerSnapshot.orders).toHaveLength(1);
  expect(managerSnapshot.order_items[0].cost_paisa).toBeUndefined();
  await expect(
    as(db, managerId, () => db.query("select cost_paisa from public.products")),
  ).rejects.toThrow();
  await db.close();
}, 30000);