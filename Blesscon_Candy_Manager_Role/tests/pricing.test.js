import { it, expect } from "vitest";
import { priceLines, DEFAULTS, getRate } from "../js/domain.js";
const products = ["Strawberry", "Orange"].map((s, i) => ({
  id: "" + i,
  name: "Rani Candy - " + s,
  boxes_per_carton: 24,
  retail_paisa: 25000,
  cost_paisa: 20000,
  wholesale_paisa: 23000,
}));
it.each([
  [3, 3, 23000],
  [25, 0, 22500],
  [50, 0, 22000],
  [4, 0, 23000],
])("invoice total cartons %s + %s prices all lines", (a, b, rate) => {
  const lines = [
    { product_id: "0", cartons: a, loose_boxes: 0 },
    ...(b ? [{ product_id: "1", cartons: b, loose_boxes: 0 }] : []),
  ];
  expect(
    priceLines(lines, products, "wholesale").every(
      (l) => l.rate_paisa === rate,
    ),
  ).toBe(true);
});
it("retail, loose boxes, editable thresholds and non-Rani wholesale", () => {
  expect(getRate(products[0], 50, "retail").rate_paisa).toBe(25000);
  expect(
    priceLines(
      [{ product_id: "0", cartons: 24, loose_boxes: 24 }],
      products,
      "wholesale",
    )[0].rate_paisa,
  ).toBe(22500);
  expect(
    getRate(
      { ...products[0], name: "Other", wholesale_paisa: 39000 },
      100,
      "wholesale",
    ).rate_paisa,
  ).toBe(39000);
  expect(
    getRate(products[0], 10, "wholesale", {
      ...DEFAULTS,
      tiers: [{ min: 0, rate_paisa: 10000, label: "Custom" }],
    }).rate_paisa,
  ).toBe(10000);
});
it("forbids salesman overrides", () =>
  expect(() =>
    priceLines(
      [
        {
          product_id: "0",
          cartons: 1,
          loose_boxes: 0,
          rate_paisa: 100,
          override_reason: "test",
        },
      ],
      products,
      "wholesale",
    ),
  ).toThrow("Admin"));
