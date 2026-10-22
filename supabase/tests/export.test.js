import { it, expect } from "vitest";
import * as XLSX from "xlsx";
import { empty } from "../js/store.js";
import { buildWorkbook } from "../js/exporter.js";
import { importWorkbook } from "../js/importer.js";
it("exports preserved sheet header positions and values that reimport without duplicate sale deductions", () => {
  const s = empty();
  s.products = [
    {
      id: "P",
      name: "Rani Candy - Test",
      boxes_per_carton: 24,
      cost_paisa: 20000,
      retail_paisa: 25000,
      wholesale_paisa: 23000,
      active: true,
    },
  ];
  s.customers = [{ id: "C", name: "Test" }];
  s.stock_movements = [
    {
      id: "M",
      transaction_id: "O",
      product_id: "P",
      kind: "opening",
      date: "2026-10-14",
      boxes: 100,
    },
  ];
  s.orders = [
    {
      id: "ORD",
      number: "INV-OLD",
      customer_id: "C",
      date: "2026-10-14",
      due_date: "2026-10-21",
      channel: "wholesale",
      status: "confirmed",
      subtotal_paisa: 552000,
      discount_paisa: 0,
      total_paisa: 552000,
    },
  ];
  s.order_items = [
    {
      id: "I",
      order_id: "ORD",
      product_id: "P",
      product_name: "Rani Candy - Test",
      cartons: 1,
      loose_boxes: 0,
      boxes: 24,
      boxes_per_carton: 24,
      rate_paisa: 23000,
      cost_paisa: 20000,
      amount_paisa: 552000,
    },
  ];
  s.invoices = [
    { id: "INV", order_id: "ORD", number: "INV-OLD", total_paisa: 552000 },
  ];
  const w = buildWorkbook(s, XLSX);
  expect(w.Sheets["Order Entry Form"].A7.v).toBe("Invoice ID");
  const r = importWorkbook(w, XLSX);
  expect(r.errors).toEqual([]);
  expect(r.data.orders).toHaveLength(1);
  expect(r.data.stock_movements).toHaveLength(1);
  expect(r.data.stock_movements[0].boxes).toBe(100);
  expect(r.data.orders[0].items[0].rate_paisa).toBe(23000);
});
