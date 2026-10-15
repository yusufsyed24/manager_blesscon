import { it, expect } from "vitest";
import * as XLSX from "xlsx";
import { importWorkbook } from "../js/importer.js";
function fixture() {
  let w = XLSX.utils.book_new();
  const a = [
    ["Synthetic acceptance fixture — NOT business data"],
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
      "Boxes/Carton",
    ],
  ];
  for (let i = 0; i < 37; i++)
    a.push([
      "TEST-" + i,
      "Rani Candy - Fixture " + i,
      200,
      250,
      230,
      230,
      225,
      220,
      24,
    ]);
  const p = XLSX.utils.aoa_to_sheet(a);
  p.C4 = { t: "n", f: "100+100", v: 200 };
  XLSX.utils.book_append_sheet(w, p, "Price Codes");
  const s = XLSX.utils.aoa_to_sheet([
    ["Product ID", "Opening Stock", "Expiry Date"],
    ["TEST-0", 1000, "2027-01-01"],
  ]);
  for (let i = 3; i <= 503; i++) s["A" + i] = { t: "s", f: 'IF(1=2,"x","")' };
  s["!ref"] = "A1:C503";
  XLSX.utils.book_append_sheet(w, s, "Products");
  const o = XLSX.utils.aoa_to_sheet([
    ["Orders"],
    [],
    [],
    [],
    [],
    [],
    [
      "Invoice ID",
      "Date",
      "Customer",
      "Product ID",
      "Cartons",
      "Loose Boxes",
      "Rate / box",
    ],
    ["INV-OLD", "2026-10-14", "Test Customer", "TEST-0", 3, 0, 230],
    ["INV-OLD", "2026-10-14", "Test Customer", "TEST-1", 3, 0, 230],
  ]);
  delete o.G9.v;
  o.G9.f = "LOOKUP(...)";
  XLSX.utils.book_append_sheet(w, o, "Order Entry Form");
  return w;
}
it("detects row 3/7 headers, imports 37 SYNTHETIC products + 148 tiers, keeps cached formulas and recomputes missing rates", () => {
  const r = importWorkbook(fixture(), XLSX);
  expect(r.errors).toEqual([]);
  expect(r.data.products).toHaveLength(37);
  expect(r.data.price_tiers).toHaveLength(148);
  expect(r.data.orders).toHaveLength(1);
  expect(r.data.orders[0].items[1].rate_paisa).toBe(23000);
  expect(r.data.products[0].cost_paisa).toBe(20000);
  expect(
    r.data.settings.value.workbook_layout["Order Entry Form"].headerRow,
  ).toBe(6);
});
it("re-import stable IDs creates zero new records; empty formula rows are skipped", () => {
  const a = importWorkbook(fixture(), XLSX);
  const b = importWorkbook(fixture(), XLSX, a.data);
  for (const s of Object.values(b.summary)) expect(s.created).toBe(0);
  expect(b.data.products).toHaveLength(37);
});
export { fixture };

it("processes the supplied business workbook and ignores informational sheets", async () => {
  const fs = await import("node:fs/promises");
  const path = process.cwd().includes("Blesscon_Candy_Manager") ? "/mnt/data/Blesscon_Candy_Connected_Workbook.xlsx" : "../Blesscon_Candy_Connected_Workbook.xlsx";
  const wb = XLSX.read(await fs.readFile(path), { type: "buffer", cellFormula: true });
  const r = importWorkbook(wb, XLSX);
  expect(r.data.products.length).toBe(37);
  expect(r.data.price_tiers.length).toBeGreaterThanOrEqual(148);
  for (const name of ["START HERE", "Order Entry Guide", "Addon Summary", "Dashboard", "Stock Summary"])
    expect(r.warnings.some(w => w.startsWith(name + ":"))).toBe(false);
});

it("ignores the legacy informational Salary Rule row in Settings instead of warning", () => {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([
    ["Company Name", "Blesscon Candy"],
    ["Monthly Target (Cartons)", 130],
    ["Salary Rule", "Total Salary = Base Salary + Incentive based on Target Achievement %"],
  ]), "Settings");
  const r = importWorkbook(w, XLSX);
  expect(r.warnings.some(w => /unrecognised key Salary Rule/i.test(w))).toBe(false);
  expect(r.data.settings.value.company_name).toBe("Blesscon Candy");
});
