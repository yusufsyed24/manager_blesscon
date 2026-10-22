// @vitest-environment jsdom
import { beforeAll, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import axe from "axe-core";
import { empty } from "../js/store.js";
let app;
beforeAll(async () => {
  const html = await fs.readFile(process.cwd() + "/index.html", "utf8");
  document.documentElement.innerHTML = html.replace(/<!doctype html>/i, "");
  document.documentElement.lang = "en";
  HTMLCanvasElement.prototype.getContext = () => null;
  window.APP_CONFIG = {};
  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  globalThis.confirm = () => true;
  globalThis.prompt = () => "";
  app = await import("../js/app.js");
});
it("login embeds logo, labels inputs and has no serious/critical axe violations", async () => {
  expect(document.querySelector(".login img").src).toMatch(/^data:image/);
  const r = await axe.run(document, {
    rules: { "color-contrast": { enabled: false } },
  });
  expect(
    r.violations
      .filter((v) => ["serious", "critical"].includes(v.impact))
      .map((v) => v.id),
  ).toEqual([]);
});
it("practice workspace navigates every sidebar page without DOM errors", async () => {
  app.practice();
  const tableHeaders = [...document.querySelectorAll(".table-wrap thead th")];
  const tableCells = [...document.querySelectorAll(".table-wrap tbody td")];
  expect(tableCells.length).toBeGreaterThan(0);
  expect(tableCells.every((cell) => cell.dataset.label)).toBe(true);
  expect(tableCells[0].dataset.label).toBe(tableHeaders[0].textContent);
  const pages = [
    "dashboard",
    "dsr",
    "closing",
    "cashbook",
    "orders",
    "invoices",
    "quotes",
    "ledger",
    "stock",
    "products",
    "staff",
    "expenses",
    "pnl",
    "import",
    "settings",
    "users",
    "audit",
  ];
  for (const p of pages) {
    document.querySelector(`[data-page="${p}"]`).click();
    expect(document.querySelector("#page h1"), `page ${p} should render a heading`).not.toBeNull();
    if (p === "cashbook") expect(document.querySelector("#page h1").textContent).toContain("Cash & Bank Book");
  }
  expect(document.querySelector(".brand img").src).toMatch(/^data:image/);
});
it("order editor reprices mixed flavours live and has labelled controls", async () => {
  app.openEditor(false);
  expect(document.querySelector('#document-form [name="salesman_id"]').value).toBe("");
  expect(document.querySelector('#document-form [name="salesman_id"] option').textContent).toBe("Manager / direct sale");
  document.querySelector('[data-act="add-line"]').click();
  document.querySelector("#line-p-1").value = "DEMO-RANI-2";
  document
    .querySelector("#line-p-1")
    .dispatchEvent(new Event("input", { bubbles: true }));
  for (const id of ["line-c-0", "line-c-1"]) {
    document.getElementById(id).value = "3";
    document
      .getElementById(id)
      .dispatchEvent(new Event("input", { bubbles: true }));
  }
  expect(document.getElementById("line-note-0").textContent).toContain("6–24");
  expect(document.getElementById("line-r-0").value).toBe("230");
  const r = await axe.run(document.getElementById("modal"), {
    rules: { "color-contrast": { enabled: false } },
  });
  expect(
    r.violations
      .filter((v) => ["serious", "critical"].includes(v.impact))
      .map((v) => v.id),
  ).toEqual([]);
});
it("practice sale confirms, invoice shows unpaid stamp and stock changes", async () => {
  document
    .querySelector("#document-form")
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() =>
    expect(document.querySelector("#modal").open).toBe(false),
  );
  const s = JSON.parse(
    localStorage.getItem("blesscon:v2:practice.local:practice-owner"),
  ).base;
  expect(s.orders).toHaveLength(1);
  expect(s.order_items.reduce((a, l) => a + l.boxes, 0)).toBe(144);
  app.showDocument(s.orders[0].id);
  expect(document.querySelector(".stamp").textContent).toContain("UNPAID");
  expect(s.stock.find((x) => x.product_id === "DEMO-RANI-1").boxes).toBe(2328);
});

it("product save form always reaches app validation and can create a product in practice mode", async () => {
  app.practice();
  document.querySelector('[data-page="products"]').click();
  document.querySelector('[data-act="add-product"]').click();
  const form = document.querySelector("#master-form");
  expect(form).not.toBeNull();
  expect(form.noValidate).toBe(true);
  expect(form.querySelector('button[type="submit"]')?.textContent).toContain("Save product");
  form.elements.name.value = "UI Save Test Candy";
  form.elements.category.value = "Test";
  form.elements.boxes_per_carton.value = "24";
  form.elements.cost.value = "1.00";
  form.elements.retail.value = "2.50";
  form.elements.wholesale.value = "2.30";
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(document.querySelector("#modal").open).toBe(false));
  expect(document.querySelector("#page").textContent).toContain("UI Save Test Candy");
});

it("overview groups similar candy names and respects each product carton size", () => {
  localStorage.clear();
  const state = empty();
  state.products = [
    { id: "A", name: "Rani Candy - Strawberry", category: "Sweet", boxes_per_carton: 24, active: true },
    { id: "B", name: "Rani Candy - Orange", category: "Variant", boxes_per_carton: 12, active: true },
    { id: "C", name: "Sour Chew (Mango)", category: "Chew", boxes_per_carton: 10, active: true },
  ];
  state.stock = [
    { product_id: "A", boxes: 50 },
    { product_id: "B", boxes: 25 },
    { product_id: "C", boxes: 5 },
  ];
  localStorage.setItem(
    "blesscon:v2:practice.local:practice-owner",
    JSON.stringify({ base: state, queue: [] }),
  );
  app.practice();
  const cards = [...document.querySelectorAll(".stock-family-card")];
  expect(cards).toHaveLength(2);
  const rani = cards.find((card) => card.querySelector("h3")?.textContent === "Rani Candy");
  const sourChew = cards.find((card) => card.querySelector("h3")?.textContent === "Sour Chew");
  expect([...rani.querySelectorAll(".stock-family-totals div")].map((metric) => [
    metric.querySelector("b").textContent,
    metric.querySelector("span").textContent,
  ])).toEqual([
    ["4", "cartons"],
    ["3", "loose boxes"],
    ["75", "total boxes"],
  ]);
  expect(rani.textContent).toContain("24 boxes / carton");
  expect(rani.textContent).toContain("12 boxes / carton");
  expect([...sourChew.querySelectorAll(".stock-family-totals div")].map((metric) => [
    metric.querySelector("b").textContent,
    metric.querySelector("span").textContent,
  ])).toEqual([
    ["0", "cartons"],
    ["5", "loose boxes"],
    ["5", "total boxes"],
  ]);
});
