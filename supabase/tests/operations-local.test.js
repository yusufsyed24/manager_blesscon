import { it, expect } from "vitest";
import { empty, localApply } from "../js/store.js";
import { uid, today } from "../js/domain.js";

it("keeps warehouse availability stable when an issued salesman sells and returns stock", () => {
  let state = empty();
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
    reference: "V-001",
  });
  expect(state.stock[0].boxes).toBe(760);
  expect(() =>
    apply("stock.issue", {
      transaction_id: "ISSUE-2",
      salesman_id: "S",
      product_id: "P",
      date: today(),
      boxes: 240,
      reference: "V-001",
    }),
  ).toThrow(/voucher reference already exists/i);

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

it("issues and receives multiple products under one local voucher", () => {
  let state = empty();
  const user = { id: uid(), role: "admin", practice: true };
  state.products.push(
    { id: "P24", name: "Rani Candy - Orange", active: true, boxes_per_carton: 24, cost_paisa: 0, retail_paisa: 100, wholesale_paisa: 80 },
    { id: "P12", name: "Sour Chew - Mango", active: true, boxes_per_carton: 12, cost_paisa: 0, retail_paisa: 100, wholesale_paisa: 80 },
  );
  state.salesmen.push({ id: "S", name: "Seller", active: true });
  state.stock_movements.push(
    { id: uid(), transaction_id: "OPEN-24", product_id: "P24", date: today(), boxes: 240, kind: "opening" },
    { id: uid(), transaction_id: "OPEN-12", product_id: "P12", date: today(), boxes: 120, kind: "opening" },
  );
  state.stock = [
    { product_id: "P24", boxes: 240 },
    { product_id: "P12", boxes: 120 },
  ];
  const apply = (kind, data) => {
    state = localApply(state, { id: uid(), kind, data }, user).state;
  };
  apply("stock.issue", {
    reference: "V-100",
    salesman_id: "S",
    date: today(),
    items: [
      { transaction_id: "I-24", product_id: "P24", boxes: 48 },
      { transaction_id: "I-12", product_id: "P12", boxes: 24 },
    ],
  });
  expect(state.stock_vouchers).toHaveLength(1);
  expect(state.stock_vouchers[0].reference).toBe("V-100");
  expect(state.salesman_stock_movements.filter((row) => row.kind === "issue")).toHaveLength(2);
  expect(state.stock.map((row) => row.boxes)).toEqual([192, 96]);

  apply("stock.return", {
    reference: "V-101",
    salesman_id: "S",
    date: today(),
    condition: "saleable",
    items: [
      { transaction_id: "R-24", product_id: "P24", boxes: 24 },
      { transaction_id: "R-12", product_id: "P12", boxes: 12 },
    ],
  });
  expect(state.stock_vouchers).toHaveLength(2);
  expect(state.stock_vouchers[1].condition).toBe("saleable");
  expect(state.stock.map((row) => row.boxes)).toEqual([216, 108]);
  expect(state.salesman_stock_movements.map((row) => row.reference)).toEqual([
    "V-100",
    "V-100",
    "V-101",
    "V-101",
  ]);
});