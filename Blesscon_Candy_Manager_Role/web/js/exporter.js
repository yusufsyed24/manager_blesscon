import { headerKey } from "./importer.js";
import { today, invoiceState } from "./domain.js";
const defaults = {
  Settings: { headerRow: 0, headers: ["Setting", "Value"] },
  "Price Codes": {
    headerRow: 2,
    headers: [
      "Product ID",
      "Product Name",
      "Boxes/Carton",
      "Cost / box",
      "Retail / box",
      "WH 1–5 / box",
      "WH 6–24 / box",
      "WH 25–49 / box",
      "WH 50+ / box",
    ],
  },
  Products: {
    headerRow: 0,
    headers: ["Product ID", "Product Name", "Opening Stock", "Expiry Date"],
  },
  "Stock Transactions": {
    headerRow: 0,
    headers: [
      "Transaction ID",
      "Date",
      "Product ID",
      "Type",
      "Total Boxes",
      "Notes",
    ],
  },
  Salesmen: {
    headerRow: 0,
    headers: [
      "Salesman ID",
      "Salesman",
      "Phone",
      "Joining Date",
      "Base Salary",
      "Monthly Target",
      "Status",
    ],
  },
  "Order Entry Form": {
    headerRow: 6,
    headers: [
      "Invoice ID",
      "Date",
      "Customer",
      "Phone",
      "Address",
      "Salesman ID",
      "Product ID",
      "Product Name",
      "Cartons",
      "Loose Boxes",
      "Total Boxes",
      "Rate / box",
      "Amount",
      "Received",
      "Discount",
      "Due Date",
      "Invoice cartons",
    ],
  },
  "Retail Addon": {
    headerRow: 6,
    headers: [
      "Invoice ID",
      "Date",
      "Customer",
      "Phone",
      "Address",
      "Salesman ID",
      "Product ID",
      "Product Name",
      "Cartons",
      "Loose Boxes",
      "Total Boxes",
      "Rate / box",
      "Amount",
      "Received",
      "Discount",
      "Due Date",
      "Invoice cartons",
    ],
  },
  Receipts: {
    headerRow: 6,
    headers: [
      "Transaction ID",
      "Invoice ID",
      "Date",
      "Amount",
      "Payment Method",
      "Reference",
      "Salesman",
    ],
  },
  Expenses: {
    headerRow: 0,
    headers: [
      "Expense ID",
      "Date",
      "Category",
      "Description",
      "Amount",
      "Payment Method",
      "Salesman ID",
    ],
  },
  "Daily Sales": {
    headerRow: 0,
    headers: [
      "Date",
      "Salesman ID",
      "Salesman",
      "Achieved Cartons",
      "Total Boxes",
      "Sales Amount",
    ],
  },
  "Addon Stock": {
    headerRow: 6,
    headers: [
      "Transaction ID",
      "Date",
      "Product ID",
      "Type",
      "Total Boxes",
      "Notes",
    ],
  },
  "Stock Summary": {
    headerRow: 0,
    headers: [
      "Product ID",
      "Product Name",
      "Balance Boxes",
      "Balance Cartons",
      "Expiry Date",
    ],
  },
  Dashboard: { headerRow: 0, headers: ["Metric", "Value"] },
};
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
export function workbookRows(s, name) {
  const active = (a) => a.filter((x) => !x.deleted_at),
    find = (t, id) => s[t].find((x) => x.id === id);
  switch (norm(name)) {
    case "settings":
      return Object.entries(s.settings)
        .filter(([k]) => !["workbook_layout", "signature_data"].includes(k))
        .map(([k, v]) => ({
          setting: k,
          value: typeof v === "object" ? JSON.stringify(v) : v,
        }));
    case "pricecodes":
      return active(s.products).map((p) => {
        const tiers = s.price_tiers
          .filter((t) => t.product_id === p.id && !t.deleted_at)
          .sort((a, b) => a.min_cartons - b.min_cartons);
        return {
          product_id: p.id,
          name: p.name,
          price_code: p.id,
          boxes_per_carton: p.boxes_per_carton,
          cost: p.cost_paisa / 100,
          retail: p.retail_paisa / 100,
          wh1: (tiers[0]?.rate_paisa ?? p.wholesale_paisa) / 100,
          wh6: (tiers[1]?.rate_paisa ?? p.wholesale_paisa) / 100,
          wh25: (tiers[2]?.rate_paisa ?? p.wholesale_paisa) / 100,
          wh50: (tiers[3]?.rate_paisa ?? p.wholesale_paisa) / 100,
          category: p.category,
        };
      });
    case "products":
      return active(s.products).map((p) => ({
        product_id: p.id,
        name: p.name,
        opening: s.stock_movements
          .filter((m) => m.product_id === p.id && m.kind === "opening")
          .reduce((a, m) => a + m.boxes, 0),
        expiry: p.expiry_date || "",
        boxes_per_carton: p.boxes_per_carton,
        cost: p.cost_paisa / 100,
        retail: p.retail_paisa / 100,
      }));
    case "stocktransactions":
    case "addonstock":
      return s.stock_movements
        .filter(
          (m) =>
            !["opening", "sale", "reversal"].includes(m.kind) &&
            (norm(name) === "addonstock"
              ? m.kind === "adjustment"
              : m.kind !== "adjustment"),
        )
        .map((m) => ({
          transaction_id: m.transaction_id,
          date: m.date,
          product_id: m.product_id,
          kind: m.kind,
          total_boxes: m.boxes,
          notes: m.note,
        }));
    case "salesmen":
      return active(s.salesmen).map((x) => ({
        salesman_id: x.id,
        salesman: x.name,
        name: x.name,
        phone: x.phone,
        joining: x.joining_date,
        salary: x.base_salary_paisa / 100,
        target: x.monthly_target,
        status: x.active ? "Active" : "Inactive",
      }));
    case "orderentryform":
    case "retailaddon":
      return s.orders
        .filter(
          (o) =>
            o.status === "confirmed" &&
            !o.deleted_at &&
            (norm(name) === "retailaddon"
              ? o.channel === "retail"
              : o.channel === "wholesale"),
        )
        .flatMap((o) => {
          const customer = find("customers", o.customer_id) || {},
            invoice = s.invoices.find((i) => i.order_id === o.id);
          const items = s.order_items.filter((l) => l.order_id === o.id),
            rani = items
              .filter((l) => /^Rani Candy/i.test(l.product_name))
              .reduce((a, l) => a + l.boxes / l.boxes_per_carton, 0);
          return items.map((l) => ({
            invoice: o.number,
            date: o.date,
            due: o.due_date,
            customer: customer.name,
            customer_id: customer.id,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            salesman_id: o.salesman_id,
            salesman: find("salesmen", o.salesman_id)?.name,
            product_id: l.product_id,
            name: l.product_name,
            cartons: l.cartons,
            loose: l.loose_boxes,
            total_boxes: l.boxes,
            rate: l.rate_paisa / 100,
            amount: l.amount_paisa / 100,
            cost: l.cost_paisa / 100,
            received: invoice
              ? invoiceState(invoice, s.payments).paid / 100
              : 0,
            discount: o.discount_paisa / 100,
            invoicecartons: rani,
            notes: o.notes,
            status: o.status,
          }));
        });
    case "receipts":
      return s.payments
        .filter((p) => !p.voided_at)
        .map((p) => ({
          transaction_id: p.transaction_id,
          invoice: find("invoices", p.invoice_id)?.number,
          date: p.date,
          amount: p.amount_paisa / 100,
          received: p.amount_paisa / 100,
          method: p.method,
          reference: p.reference,
          salesman: p.received_by,
        }));
    case "expenses":
      return active(s.expenses).map((e) => ({
        transaction_id: e.id,
        date: e.date,
        category: e.category,
        description: e.description,
        amount: e.amount_paisa / 100,
        method: e.method,
        salesman_id: e.salesman_id,
      }));
    case "dailysales":
      return s.salesman_daily_targets
        .filter((d) => d.date <= today())
        .map((d) => ({
          date: d.date,
          salesman_id: d.salesman_id,
          salesman: find("salesmen", d.salesman_id)?.name,
          achieved: d.achieved_cartons,
          cartons: d.achieved_cartons,
          total_boxes: d.achieved_boxes,
          amount: d.sales_amount / 100,
          basetarget: d.base_target,
          effectivetarget: d.effective_target,
          shortfall: d.shortfall,
        }));
    case "stocksummary":
      return active(s.products).map((p) => ({
        product_id: p.id,
        name: p.name,
        balanceboxes: s.stock.find((x) => x.product_id === p.id)?.boxes || 0,
        balancecartons:
          (s.stock.find((x) => x.product_id === p.id)?.boxes || 0) /
          p.boxes_per_carton,
        expiry: p.expiry_date,
      }));
    case "dashboard":
      return [
        {
          metric: "Confirmed orders",
          value: s.orders.filter((o) => o.status === "confirmed").length,
        },
        {
          metric: "Total sales PKR",
          value: s.orders
            .filter((o) => o.status === "confirmed")
            .reduce((a, o) => a + o.total_paisa / 100, 0),
        },
        {
          metric: "Outstanding PKR",
          value: s.invoices
            .filter((i) =>
              s.orders.some(
                (o) => o.id === i.order_id && o.status === "confirmed",
              ),
            )
            .reduce((a, i) => a + invoiceState(i, s.payments).balance / 100, 0),
        },
      ];
    default:
      return [];
  }
}
export function buildWorkbook(s, XLSX) {
  if (!XLSX) throw Error("Excel library unavailable");
  const wb = XLSX.utils.book_new(),
    layout = { ...defaults, ...s.settings.workbook_layout };
  for (const [name, def] of Object.entries(layout)) {
    const spec = def.headers?.length ? def : defaults[name];
    if (!spec) continue;
    const rows = (spec.preamble || []).map((r) => [...r]);
    while (rows.length < spec.headerRow) rows.push([]);
    rows[spec.headerRow] = spec.headers;
    for (const r of workbookRows(s, name))
      rows.push(spec.headers.map((h) => r[headerKey(h)] ?? ""));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = spec.headers.map((h) => ({
      wch: Math.max(14, Math.min(32, String(h).length + 4)),
    }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  return wb;
}
export function exportWorkbook(s, XLSX) {
  XLSX.writeFile(
    buildWorkbook(s, XLSX),
    "Blesscon_Connected_Export_" + today() + ".xlsx",
  );
}
