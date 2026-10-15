import { it, expect } from "vitest";
import { dailySalesReport } from "../js/reports.js";

it("keeps old-invoice recovery separate from today's credit sale", () => {
  const state = {
    orders: [
      {
        id: "old-order",
        customer_id: "shop",
        salesman_id: "seller",
        date: "2026-10-14",
        due_date: "2026-10-14",
        status: "confirmed",
        total_paisa: 500_000,
      },
      {
        id: "today-order",
        customer_id: "shop",
        salesman_id: "seller",
        date: "2026-10-15",
        due_date: "2026-10-22",
        status: "confirmed",
        total_paisa: 1_000_000,
      },
    ],
    invoices: [
      { id: "old-invoice", order_id: "old-order", total_paisa: 500_000 },
      { id: "today-invoice", order_id: "today-order", total_paisa: 1_000_000 },
    ],
    payments: [
      {
        id: "old-payment",
        invoice_id: "old-invoice",
        date: "2026-10-15",
        amount_paisa: 300_000,
        method: "Cash",
      },
    ],
    expenses: [],
    products: [{ id: "candy", name: "Candy" }],
    order_items: [
      {
        order_id: "today-order",
        product_id: "candy",
        product_name: "Candy",
        boxes: 48,
        amount_paisa: 1_000_000,
      },
    ],
    salesman_stock_movements: [
      { product_id: "candy", salesman_id: "seller", date: "2026-10-14", boxes: 100, kind: "issue" },
      { product_id: "candy", salesman_id: "seller", date: "2026-10-15", boxes: 240, kind: "issue" },
      { product_id: "candy", salesman_id: "seller", date: "2026-10-15", boxes: -48, kind: "sale" },
      { product_id: "candy", salesman_id: "seller", date: "2026-10-15", boxes: -24, kind: "return_saleable" },
      { product_id: "candy", salesman_id: "seller", date: "2026-10-15", boxes: -1, kind: "return_damaged" },
    ],
  };
  const report = dailySalesReport(state, "2026-10-15", "seller");
  expect(report.sales_paisa).toBe(1_000_000);
  expect(report.collected_paisa).toBe(300_000);
  expect(report.previous_recovery_paisa).toBe(300_000);
  expect(report.same_day_collection_paisa).toBe(0);
  expect(report.new_credit_paisa).toBe(1_000_000);
  expect(report.outstanding_paisa).toBe(1_200_000);
  expect(report.overdue_paisa).toBe(200_000);
  expect(report.products).toEqual([
    {
      product_id: "candy",
      product_name: "Candy",
      boxes: 48,
      amount_paisa: 1_000_000,
    },
  ]);
  expect(report.stock_by_product).toEqual([
    {
      product_id: "candy",
      product_name: "Candy",
      opening_boxes: 100,
      issued_boxes: 240,
      sold_boxes: 48,
      returned_boxes: 24,
      damaged_boxes: 1,
      closing_boxes: 267,
    },
  ]);
  expect(report.stock_issued_boxes).toBe(240);
  expect(report.stock_returned_boxes).toBe(25);
});

it("keeps an invoice partially outstanding after a payment", () => {
  const state = {
    orders: [
      {
        id: "sale",
        customer_id: "shop",
        salesman_id: "seller",
        date: "2026-10-14",
        due_date: "2026-10-14",
        status: "confirmed",
        total_paisa: 2_000_000,
      },
    ],
    invoices: [{ id: "invoice", order_id: "sale", total_paisa: 2_000_000 }],
    payments: [
      {
        invoice_id: "invoice",
        date: "2026-10-15",
        amount_paisa: 500_000,
        method: "Cash",
      },
    ],
    expenses: [],
    order_items: [],
  };
  const report = dailySalesReport(state, "2026-10-15", "seller");
  expect(report.collected_paisa).toBe(500_000);
  expect(report.previous_recovery_paisa).toBe(500_000);
  expect(report.outstanding_paisa).toBe(1_500_000);
});