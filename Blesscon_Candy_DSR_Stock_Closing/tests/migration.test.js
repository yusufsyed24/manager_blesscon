import { it, expect } from "vitest";
import fs from "node:fs/promises";
import { database } from "./db-helper.js";
it("migrates supplied-starter legacy JSON shapes, preserves historical rate and stock snapshot, safe second run", async () => {
  const db = await database();
  await db.exec(
    "create table public.business_sections(section text primary key,payload jsonb)",
  );
  const day = new Date().toISOString().slice(0, 10);
  const payloads = {
    products: [
      {
        code: "OLD-RANI",
        name: "Rani Candy - Strawberry",
        cost: 200,
        retail: 250,
        wholesale: 230,
        perCarton: 24,
        stock: 50,
      },
    ],
    staff: [{ id: "OLD-SP", name: "Person", salary: 45000 }],
    orders: [
      {
        id: "INV-OLD-1",
        date: day,
        customer: "Shop",
        staffId: "OLD-SP",
        type: "Wholesale",
        total: 5280,
        paid: 1000,
        lines: [
          {
            code: "OLD-RANI",
            name: "Rani Candy - Strawberry",
            cartons: 1,
            boxes: 0,
            units: 24,
            rate: 220,
            total: 5280,
          },
        ],
      },
    ],
    expenses: [{ id: "OLD-E", date: day, category: "Rent", amount: 20000 }],
  };
  for (const [section, payload] of Object.entries(payloads))
    await db.query("insert into business_sections values($1,$2)", [
      section,
      payload,
    ]);
  const sql = await fs.readFile(
    new URL("../supabase/migration_from_blob.sql", import.meta.url),
    "utf8",
  );
  await db.exec(sql);
  expect(
    (await db.query("select error from private.migration_errors")).rows,
  ).toEqual([]);
  expect(
    Number(
      (await db.query("select rate_paisa from order_items")).rows[0].rate_paisa,
    ),
  ).toBe(22000);
  expect(
    Number(
      (await db.query("select sum(boxes) n from stock_movements")).rows[0].n,
    ),
  ).toBe(50);
  await db.exec(sql);
  expect(
    Number((await db.query("select count(*) n from orders")).rows[0].n),
  ).toBe(1);
  expect(
    Number(
      (await db.query("select sum(boxes) n from stock_movements")).rows[0].n,
    ),
  ).toBe(50);
  await db.close();
}, 30000);
