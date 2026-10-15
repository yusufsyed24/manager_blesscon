import { it, expect } from "vitest";
import { empty, localApply } from "../js/store.js";
import { uid, today } from "../js/domain.js";

it("keeps warehouse availability stable when an issued salesman sells and returns stock", () => {
  const state = empty();
  const user = { id: uid(), role: "admin", name: "Manager", practice: true };
  state.products.push({
    id: "P",
    name: "Local Test Candy",
    active: true,
    boxes_per_carton: 24,
    cost_paisa: 100,
    retail_paisa: 200,
    wholesale_paisa: 150,
  });
  state.salesmen.push({ id: "S", name: "Seller", active: true });
  state.customers.push({ id: "C", name: "Shop" });
  state.stock_movements.push({
    id: uid(),
    transaction_id: "OPEN",
    product_id: "P",
    date: today(),
    boxes: 1000,
    kind: "opening",
  });
  state.stock.push({ product_id: "P", boxes: 1000 });
  const apply = (kind, data) => {
    state = localApply(state, { id: uid(), kind, data }, user).state;
  };

  apply("stock.issue", {
    transaction_id: "ISSUE-1",
    salesman_id: "S",
    product_id: "P",
    date: today(),
    boxes: 240,
  });
  expect(state.stock[0].boxes).toBe(760);

  apply("order.save", {
    id: "ORDER-1",
    customer_id: "C",
    salesman_id: "S",
    date: today(),
    due_date: today(),
    channel: "wholesale",
    items: [{ product_id: "P", cartons: 2, loose_boxes: 0 }],
  });
  expect(state.stock[0].boxes).toBe(760);
  expect(
    state.salesman_stock_movements.reduce((sum, row) => sum + row.boxes, 0),
  ).toBe(192);

  apply("stock.return", {
    transaction_id: "RETURN-1",
    salesman_id: "S",
    product_id: "P",
    date: today(),
    boxes: 48,
    condition: "saleable",
  });
  expect(state.stock[0].boxes).toBe(808);
  expect(
    state.salesman_stock_movements.reduce((sum, row) => sum + row.boxes, 0),
  ).toBe(144);

  apply("stock.return", {
    transaction_id: "RETURN-2",
    salesman_id: "S",
    product_id: "P",
    date: today(),
    boxes: 24,
    condition: "damaged",
  });
  expect(state.stock[0].boxes).toBe(808);
  expect(
    state.salesman_stock_movements.reduce((sum, row) => sum + row.boxes, 0),
  ).toBe(120);
});