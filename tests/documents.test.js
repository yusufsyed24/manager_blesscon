import { it, expect } from "vitest";
import fs from "node:fs/promises";
import { jsPDF } from "jspdf";
import { documentHTML, makePDF } from "../js/documents.js";
import { LOGO } from "../js/brand.js";
import { DEFAULTS } from "../js/domain.js";
export const payload = {
  type: "invoice",
  settings: DEFAULTS,
  document: {
    id: "test",
    number: "TEST-INV-0001",
    date: "2026-10-14",
    due_date: "2026-10-21",
    channel: "wholesale",
    subtotal_paisa: 10000000,
    discount_paisa: 0,
    total_paisa: 10000000,
    notes: "SYNTHETIC QA DOCUMENT",
    status: "confirmed",
  },
  customer: {
    name: "Example Shop (test only)",
    phone: "",
    address: "Test customer",
  },
  salesman: "Test Salesman",
  items: [
    {
      product_id: "TEST-RC",
      product_name: "Rani Candy - Strawberry",
      cartons: 16,
      loose_boxes: 16,
      boxes: 400,
      boxes_per_carton: 24,
      rate_paisa: 25000,
      cost_paisa: 20000,
      amount_paisa: 10000000,
      tier_label: "Manual test rate",
    },
  ],
  payments: [],
};
it("unpaid/partial/paid documents have correct stamp and signature blocks and embedded offline logo", () => {
  const unpaid = documentHTML(payload);
  expect(unpaid).toContain("UNPAID / CREDIT SALE");
  expect(unpaid).toContain("I acknowledge receipt");
  expect(unpaid).not.toContain("Authorised signature:");
  const partial = documentHTML({
    ...payload,
    payments: [{ date: "2026-10-14", amount_paisa: 4000000, method: "Cash" }],
  });
  expect(partial).toContain("PART PAID");
  expect(partial).toContain("Rs. 60,000");
  expect(partial).toContain("Receiver of goods");
  const paid = documentHTML({
    ...payload,
    payments: [{ date: "2026-10-14", amount_paisa: 10000000, method: "Bank" }],
  });
  expect(paid).toContain("Authorised signature: Blesscon Candy");
  expect(paid).toContain("Received with thanks");
  expect(paid).toContain(LOGO);
  expect(Buffer.from(LOGO.split(",")[1], "base64").length).toBeLessThan(60000);
});
it("generates real multipage PDF bytes with embedded logo and quotation acceptance block", async () => {
  await fs.mkdir("tests/output", { recursive: true });
  for (const [name, p] of [
    ["unpaid", payload],
    [
      "partial",
      {
        ...payload,
        payments: [
          { date: "2026-10-14", amount_paisa: 4000000, method: "Cash" },
        ],
      },
    ],
    [
      "paid",
      {
        ...payload,
        payments: [
          { date: "2026-10-14", amount_paisa: 10000000, method: "Bank" },
        ],
      },
    ],
    [
      "quotation",
      {
        ...payload,
        type: "quote",
        document: {
          ...payload.document,
          number: "TEST-QT-0001",
          valid_until: "2026-10-21",
          revision: 1,
          status: "Draft",
        },
      },
    ],
  ]) {
    const pdf = makePDF(p, jsPDF);
    const bytes = pdf.output("arraybuffer");
    expect(bytes.byteLength).toBeGreaterThan(30000);
    expect(Buffer.from(bytes).toString("latin1")).toContain("/Subtype /Image");
    await fs.writeFile("tests/output/" + name + ".pdf", Buffer.from(bytes));
  }
  const long = makePDF(
    {
      ...payload,
      items: Array.from({ length: 100 }, (_, i) => ({
        ...payload.items[0],
        product_name: "Test product " + i,
      })),
    },
    jsPDF,
  );
  expect(long.getNumberOfPages()).toBeGreaterThan(2);
  await fs.writeFile(
    "tests/output/multipage.pdf",
    Buffer.from(long.output("arraybuffer")),
  );
});
