import { it, expect } from "vitest";
import * as XLSX from "xlsx";
import { database } from "./db-helper.js";
import { randomUUID } from "node:crypto";
import { importWorkbook } from "../js/importer.js";
it("one import transaction populates products, sales, invoices, payments and expense; repeat creates no duplicate business keys", async () => {
  const db = await database(),
    wb = XLSX.utils.book_new(),
    day = new Date().toISOString().slice(0, 10);
  const sheet = (name, rows) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  sheet("Price Codes", [
    [],
    [],
    [
      "Product ID",
      "Product Name",
      "Cost / box",
      "Retail / box",
      "WH 1–5 / box",
      "WH 6–24 / box",
      "WH 25–49 / box",
      "WH 50+ / box",
    ],
    ...Array.from({ length: 37 }, (_, i) => [
      "FIX-" + i,
      "Rani Candy - Fixture " + i,
      200,
      250,
      230,
      230,
      225,
      220,
    ]),
  ]);
  sheet("Products", [
    ["Product ID", "Opening Stock"],
    ["FIX-0", 1000],
  ]);
  sheet("Order Entry Form", [
    [],
    [],
    [],
    [],
    [],
    [],
    ["Invoice ID", "Customer", "Date", "Product ID", "Cartons", "Loose Boxes"],
    ["LEG-INV", "Test", day, "FIX-0", 1, 0],
  ]);
  sheet("Receipts", [
    [],
    [],
    [],
    [],
    [],
    [],
    ["Transaction ID", "Invoice ID", "Date", "Amount"],
    ["R1", "LEG-INV", day, 1000],
  ]);
  sheet("Expenses", [
    ["Expense ID", "Date", "Category", "Amount"],
    ["E1", day, "Rent", 20000],
  ]);
  const x = importWorkbook(wb, XLSX);
  expect(x.errors).toEqual([]);
  const run = async () => {
    const cursor = Number(
      (await db.query("select coalesce(max(id),0) n from public.audit_log"))
        .rows[0].n,
    );
    return db.query("select public.apply_command($1,$2,$3)", [
      randomUUID(),
      "import.batch",
      { ...x.data, audit_cursor: cursor },
    ]);
  };
  await run();
  await run();
  for (const [t, n] of [
    ["products", 37],
    ["price_tiers", 148],
    ["orders", 1],
    ["order_items", 1],
    ["invoices", 1],
    ["payments", 1],
    ["expenses", 1],
  ])
    expect(
      Number((await db.query("select count(*) n from " + t)).rows[0].n),
    ).toBe(n);
  expect(
    Number(
      (
        await db.query(
          "select sum(boxes) n from public.stock_movements where product_id='FIX-0'",
        )
      ).rows[0].n,
    ),
  ).toBe(976);
  x.data.stock_movements[0].boxes = 0;
  await run();
  expect(
    Number(
      (
        await db.query(
          "select sum(boxes) n from stock_movements where product_id='FIX-0'",
        )
      ).rows[0].n,
    ),
  ).toBe(-24);
  await db.close();
}, 30000);
