import {
  DEFAULTS,
  paisa,
  priceLines,
  diffRecords,
  today,
  addDays,
} from "./domain.js";
export const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9]/g, "");
const aliases = {
  product_id: ["Product ID", "Product Code", "SKU", "Code"],
  name: ["Product Name", "Product", "Name", "Item", "Product / flavour", "Product Name (auto)", "Product name (auto)"],
  price_code: ["Price Code", "Rate Code"],
  boxes_per_carton: [
    "Boxes/Carton",
    "Boxes per Carton",
    "Box per carton",
    "Packing",
  ],
  cost: ["Cost / box", "Cost per Box", "Cost Price", "Cost"],
  retail: ["Retail / box", "Retail Price", "Retail"],
  wh1: ["WH 1–5 / box", "WH 1-5", "Wholesale / box", "Wholesale"],
  wh6: ["WH 6–24 / box", "WH 6-24"],
  wh25: ["WH 25–49 / box", "WH 25-49"],
  wh50: ["WH 50+ / box", "WH 50+"],
  opening: ["Opening Stock", "Opening Boxes", "Opening Stock Boxes", "Opening"],
  expiry: ["Expiry Date", "Expiry"],
  invoice: ["Invoice ID", "Invoice No", "Invoice Number", "Invoice"],
  date: ["Date", "Sale Date", "Order Date", "Payment Date", "Transaction Date"],
  due: ["Due Date"],
  customer: ["Customer", "Customer Name", "Shop", "Shop Name", "Party Name"],
  customer_id: ["Customer ID"],
  phone: ["Phone", "Contact", "Mobile"],
  address: ["Address", "Shop Address", "Area"],
  email: ["Email"],
  salesman: ["Salesman", "Salesman Name", "Salesperson", "Name"],
  salesman_id: ["Salesman ID", "Salesperson ID", "Staff ID"],
  joining: ["Joining Date", "Join Date"],
  salary: ["Base Salary", "Salary", "Basic Salary"],
  target: [
    "Monthly Target",
    "Monthly Target Cartons",
    "Target Cartons",
    "Target",
  ],
  cartons: ["Cartons", "Quantity Cartons", "Qty Cartons"],
  loose: ["Loose Boxes", "Boxes Loose", "Loose", "Boxes"],
  total_boxes: ["Total Boxes", "Quantity Boxes", "Qty Boxes", "Quantity"],
  rate: ["Rate / box", "Rate per Box", "Box Price", "Rate", "Price per Box"],
  amount: ["Amount", "Total", "Line Total", "Sales Amount", "Amount Rs"],
  received: ["Received", "Received*", "Paid", "Amount Received"],
  discount: ["Discount", "Discount Rs"],
  transaction_id: [
    "Transaction ID",
    "Receipt ID",
    "Payment ID",
    "ID",
    "Expense ID",
  ],
  method: ["Payment Method", "Method"],
  reference: ["Reference", "Ref", "Note"],
  kind: ["Type", "Transaction Type", "Movement Type"],
  category: ["Category", "Expense Category"],
  description: ["Description", "Details", "Particulars"],
  boxes_in: ["Stock In", "In Boxes", "Boxes In"],
  boxes_out: ["Stock Out", "Out Boxes", "Boxes Out"],
  achieved: ["Achieved Cartons", "Sold Cartons", "Cartons Sold"],
  setting: ["Setting", "Key", "Parameter"],
  value: ["Value"],
  notes: ["Notes", "Remarks"],
  status: ["Status"],
};
export const headerKey = (h) =>
  Object.entries(aliases).find(([, v]) =>
    v.some((x) => norm(x) === norm(h)),
  )?.[0] || norm(h);
export function stableId(s) {
  let a = 2166136261,
    b = 2246822507,
    c = 3266489909,
    d = 668265263;
  for (const ch of String(s)) {
    const n = ch.charCodeAt(0);
    a = Math.imul(a ^ n, 16777619);
    b = Math.imul(b ^ n, 1597334677);
    c = Math.imul(c ^ n, 3812015801);
    d = Math.imul(d ^ n, 958282303);
  }
  let x = [a, b, c, d]
    .map((n) => (n >>> 0).toString(16).padStart(8, "0"))
    .join("");
  return (
    x.slice(0, 8) +
    "-" +
    x.slice(8, 12) +
    "-4" +
    x.slice(13, 16) +
    "-a" +
    x.slice(17, 20) +
    "-" +
    x.slice(20)
  );
}
const missing = (v) =>
  v === undefined || v === null || v === "" || !!v?.formula;
const str = (v) => (missing(v) ? "" : String(v).trim());
const num = (v, fallback = 0) => {
  if (missing(v)) return fallback;
  const n = Number(
    String(v)
      .replace(/Rs\.?|PKR|,/gi, "")
      .trim(),
  );
  if (!Number.isFinite(n)) throw Error("Invalid number: " + v);
  return n;
};
const rs = (v, fallback) => (missing(v) ? fallback : paisa(v));
function date(v, fallback) {
  if (missing(v)) return fallback;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number")
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000)
      .toISOString()
      .slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m)
    return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  throw Error("Invalid date: " + s);
}
export function readSheet(wb, name, XLSX, warnings) {
  const sheet = wb.Sheets[name];
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const formatted = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });
  let best = { row: 0, score: 0 };
  for (let r = range.s.r; r <= Math.min(range.e.r, 30); r++) {
    let score = 0;
    for (let c = 0; c <= range.e.c; c++) {
      const v = sheet[XLSX.utils.encode_cell({ r, c })]?.v;
      if (
        Object.values(aliases).some((a) => a.some((h) => norm(h) === norm(v)))
      )
        score++;
    }
    if (score > best.score) best = { row: r, score };
  }
  if (best.score < 2) {
    warnings.push(name + ": header row could not be detected");
    return { rows: [], layout: { headers: [], headerRow: 0, preamble: [] } };
  }
  const headers = Array.from({ length: range.e.c + 1 }, (_, c) =>
    String(sheet[XLSX.utils.encode_cell({ r: best.row, c })]?.v || ""),
  );
  const keys = headers.map(headerKey);
  const rows = [];
  for (let r = best.row + 1; r <= range.e.r; r++) {
    const row = { _row: r + 1, _sheet: name };
    let populated = false;
    for (let c = 0; c < headers.length; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      let v = cell?.v;
      if (cell?.t === "e") {
        v = { formula: cell.f || String(v), error: true };
      } else if (cell?.f && (v === undefined || v === null || v === ""))
        v = { formula: cell.f };
      if (typeof v === "string" && v.startsWith("="))
        v = { formula: v.slice(1) };
      if (!missing(v)) populated = true;
      if (headers[c]) row[keys[c]] = v ?? "";
    }
    if (populated) rows.push(row);
  }
  return {
    rows,
    layout: {
      headers,
      headerRow: best.row,
      preamble: formatted.slice(0, best.row),
    },
  };
}

const SHEET_REGISTRY = {
  data: [
    "Price Codes", "Products", "Salesmen", "Order Entry Form",
    "Receipts", "Expenses", "Daily Sales", "Addon Stock",
  ],
  keyValue: ["Settings"],
  ignore: [
    "START HERE", "Order Entry Guide", "Addon Summary", "Dashboard",
    "Stock Summary", "Invoice", "Salary Calculator", "Expiry Tracker",
    "Retail Addon", "Stock Transactions",
  ],
};
function sheetKind(name) {
  const n = norm(name);
  const match = (items) => items.some((label) => {
    const k = norm(label);
    return n === k || n.includes(k) || k.includes(n);
  });
  if (match(SHEET_REGISTRY.ignore)) return "ignore";
  if (match(SHEET_REGISTRY.keyValue)) return "keyValue";
  if (match(SHEET_REGISTRY.data)) return "data";
  return "ignore";
}
function readKeyValueSheet(wb, name, XLSX, warnings) {
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, {header:1, raw:false, defval:"", blankrows:false});
  const out = [];
  let started = false;
  for (let i=0; i<rows.length; i++) {
    const label = String(rows[i]?.[0] ?? "").trim();
    const value = rows[i]?.[1] ?? "";
    if (!label || /^settings?$/i.test(label)) continue;
    const key = norm(label);
    // Ignore title/help rows; settings are a two-column key/value list.
    const known = /^(companyname|monthlytargetcartons|monthlytarget|boxespercarton|costperbox|salepriceperbox|basesalary|salarypertargetcarton|extrasalarypercartonabovetarget|below60incentive|6074incentive|7589incentive|9099incentive|100incentive|phone|email|address|ntn|bankdetails|incentiveslabs|tier.*|.*threshold.*)$/.test(key);
    if (known) {
      started = true;
      out.push({_row:i+1,_sheet:name,setting:label,value});
    } else if (started && value !== "") {
      warnings.push("Settings row " + (i+1) + " column A: unrecognised key " + label);
    }
  }
  return {rows:out, layout:{headers:["Setting","Value"],headerRow:0,preamble:[]}};
}

export function importWorkbook(wb, XLSX, current = {}) {
  const warnings = [],
    errors = [],
    layout = {},
    sheets = {};
  for (const name of wb.SheetNames) {
    const kind = sheetKind(name);
    if (kind === "ignore") {
      sheets[norm(name)] = [];
      layout[name] = { headers: [], headerRow: 0, preamble: [] };
      continue;
    }
    const parsed = kind === "keyValue"
      ? readKeyValueSheet(wb, name, XLSX, warnings)
      : readSheet(wb, name, XLSX, warnings);
    sheets[norm(name)] = parsed.rows;
    layout[name] = parsed.layout;
  }
  const data = {
    products: [],
    price_tiers: [],
    customers: [],
    salesmen: [],
    orders: [],
    payments: [],
    stock_movements: [],
    expenses: [],
    daily_actuals: [],
    settings: null,
  };
  const setting = { ...DEFAULTS, ...current.settings, workbook_layout: layout };
  for (const r of sheets.settings || []) {
    const key = norm(r.setting);
    const val = r.value;
    const mapping = {
      companyname: "company_name",
      monthlytargetcartons: "monthly_target",
      monthlytarget: "monthly_target",
      boxespercarton: "boxes_per_carton",
      basesalary: "base_salary_paisa",
      phone: "phone",
      email: "email",
      address: "address",
      ntn: "ntn",
      bankdetails: "bank_details",
      incentiveslabs: "incentive_slabs",
    };
    if (mapping[key])
      setting[mapping[key]] =
        key === "basesalary"
          ? rs(val, 4500000)
          : [
                "monthlytarget",
                "monthlytargetcartons",
                "boxespercarton",
              ].includes(key)
            ? num(val)
            : str(val);
    else if (str(r.setting) && Object.hasOwn(setting, str(r.setting))) {
      try {
        setting[str(r.setting)] = JSON.parse(str(val));
      } catch {
        setting[str(r.setting)] = str(val);
      }
    } else if (str(r.setting) && !/^(costperbox|salepriceperbox|salarypertargetcarton|extrasalarypercartonabovetarget|below60incentive|6074incentive|7589incentive|9099incentive|100incentive|tier.*|.*threshold.*)$/.test(key))
      warnings.push("Settings row " + r._row + " column A: unrecognised key " + str(r.setting));
  }
  data.settings = {
    id: "business",
    value: setting,
    version: current.settings_version,
  };
  const seenCodes = new Set();
  for (const r of sheets.pricecodes || []) {
    try {
      const id = str(r.product_id);
      if (!id) continue;
      const code = str(r.price_code) || id;
      if (seenCodes.has(code))
        warnings.push("Duplicate price code " + code + " at row " + r._row);
      seenCodes.add(code);
      if (!str(r.name)) throw Error("Product name missing for " + id);
      if (data.products.some((p) => p.id === id)) {
        warnings.push(
          "Duplicate Product ID " + id + "; first complete price row kept",
        );
        continue;
      }
      const p = {
        id,
        name: str(r.name),
        category: str(r.category),
        boxes_per_carton: num(r.boxes_per_carton, setting.boxes_per_carton),
        cost_paisa: rs(r.cost, undefined),
        retail_paisa: rs(r.retail, undefined),
        wholesale_paisa: rs(r.wh1, undefined),
        active: true,
      };
      if (!Number.isInteger(p.boxes_per_carton) || p.boxes_per_carton < 1)
        throw Error("Invalid pack size for " + id);
      if (
        [p.cost_paisa, p.retail_paisa, p.wholesale_paisa].some(
          (v) => v === undefined,
        )
      )
        throw Error("Missing base price/cost for " + id);
      data.products.push(p);
      [r.wh1, r.wh6, r.wh25, r.wh50].forEach((v, i) => {
        if (missing(v)) {
          warnings.push(
            "Missing tier " +
              setting.tiers[i].label +
              " for " +
              id +
              "; default used",
          );
        }
        data.price_tiers.push({
          id: id + ":" + setting.tiers[i].min,
          product_id: id,
          min_cartons: setting.tiers[i].min,
          label: setting.tiers[i].label,
          rate_paisa: rs(
            v,
            /^Rani Candy/i.test(p.name)
              ? setting.tiers[i].rate_paisa
              : p.wholesale_paisa,
          ),
        });
      });
    } catch (e) {
      errors.push("Price Codes row " + r._row + ": " + e.message);
    }
  }
  const products = [...(current.products || [])];
  for (const p of data.products) {
    const i = products.findIndex((x) => x.id === p.id);
    if (i >= 0) products[i] = p;
    else products.push(p);
  }
  if (!data.products.length)
    errors.push("No products found in Price Codes. Workbook not applied.");
  for (const r of sheets.products || []) {
    const id = str(r.product_id);
    if (!id) continue;
    const p = data.products.find((p) => p.id === id);
    if (!p) {
      warnings.push("Products: unknown Product ID " + id);
      continue;
    }
    try {
      if (!missing(r.expiry)) p.expiry_date = date(r.expiry);
      if (!missing(r.opening))
        data.stock_movements.push({
          transaction_id: "opening:" + id,
          product_id: id,
          date: date(r.date, "2000-01-01"),
          boxes: num(r.opening),
          kind: "opening",
          note: "Workbook opening stock",
        });
      if (r.opening?.formula)
        warnings.push(
          "Products " +
            id +
            ": opening-stock formula has no cache; opening not changed",
        );
    } catch (e) {
      errors.push("Products row " + r._row + ": " + e.message);
    }
  }
  for (const r of sheets.salesmen || []) {
    if (!str(r.salesman) && !str(r.name)) continue;
    try {
      const name = str(r.salesman) || str(r.name),
        id = str(r.salesman_id) || "SP-" + stableId(name);
      data.salesmen.push({
        id,
        name,
        phone: str(r.phone),
        joining_date: date(r.joining, today()),
        base_salary_paisa: rs(r.salary, setting.base_salary_paisa),
        monthly_target: num(r.target, setting.monthly_target),
        active: !["inactive", "deactivated"].includes(
          str(r.status).toLowerCase(),
        ),
        off_days: [],
      });
    } catch (e) {
      errors.push("Salesmen row " + r._row + ": " + e.message);
    }
  }
  const salesmen = [...data.salesmen, ...(current.salesmen || [])];
  const findStaff = (r) => {
    let s = salesmen.find(
      (s) =>
        s.id === str(r.salesman_id) ||
        s.name.toLowerCase() === str(r.salesman).toLowerCase(),
    );
    if (!s && (str(r.salesman_id) || str(r.salesman)))
      warnings.push(
        r._sheet + " row " + r._row + ": unknown salesman; owner must assign",
      );
    return s?.id || null;
  };
  const grouped = new Map();
  for (const [sheet, channel] of [
    ["orderentryform", "wholesale"],
    ["retailaddon", "retail"],
  ])
    for (const r of sheets[sheet] || []) {
      if (!str(r.invoice) || !str(r.product_id)) {
        if (
          str(r.customer) ||
          str(r.product_id) ||
          num(r.cartons) > 0 ||
          num(r.loose) > 0
        )
          errors.push(
            r._sheet +
              " row " +
              r._row +
              ": Invoice ID or Product ID is missing (including an uncached formula); correct the identifier before import",
          );
        continue;
      }
      const key = str(r.invoice);
      if (!grouped.has(key)) grouped.set(key, { rows: [], channel });
      else if (grouped.get(key).channel !== channel)
        errors.push(
          "Invoice " + key + " occurs in wholesale and retail sheets",
        );
      grouped.get(key).rows.push(r);
    }
  for (const [number, g] of grouped) {
    try {
      const first = g.rows[0];
      if (!str(first.customer)) throw Error("Customer missing");
      const cname = str(first.customer),
        customer_id =
          str(first.customer_id) ||
          "CU-" + stableId(cname + "|" + str(first.phone));
      if (!data.customers.some((c) => c.id === customer_id))
        data.customers.push({
          id: customer_id,
          name: cname,
          phone: str(first.phone),
          email: str(first.email),
          address: str(first.address),
          salesman_id: findStaff(first),
        });
      const order = {
        id: stableId("invoice:" + number),
        number,
        customer_id,
        salesman_id: findStaff(first),
        date: date(first.date),
        due_date: date(
          first.due,
          date(first.date) ? addDays(date(first.date), 7) : undefined,
        ),
        channel: g.channel,
        discount_paisa: Math.max(...g.rows.map((r) => rs(r.discount, 0))),
        notes: str(first.notes),
        terms: setting.terms,
        items: [],
        _received: Math.max(...g.rows.map((r) => rs(r.received, 0))),
      };
      if (!order.date) throw Error("Date missing");
      const raw = g.rows.map((r) => {
        const p = products.find((p) => p.id === str(r.product_id));
        if (!p) throw Error("Unknown Product ID " + str(r.product_id));
        let cartons = num(r.cartons),
          loose_boxes = num(r.loose);
        if (!cartons && !loose_boxes && !missing(r.total_boxes)) {
          cartons = Math.floor(num(r.total_boxes) / p.boxes_per_carton);
          loose_boxes = num(r.total_boxes) % p.boxes_per_carton;
        }
        if (cartons * p.boxes_per_carton + loose_boxes <= 0)
          throw Error("Missing quantity for " + p.id);
        return {
          product_id: p.id,
          cartons,
          loose_boxes,
          _rate: r.rate,
          _cost: r.cost,
        };
      });
      const priced = priceLines(
        raw,
        products,
        g.channel,
        setting,
        data.price_tiers,
        true,
      );
      for (const l of priced) {
        const rate = rs(l._rate, l.rate_paisa),
          cost = rs(l._cost, l.cost_paisa);
        const old = order.items.find((x) => x.product_id === l.product_id);
        if (old) {
          if (old.rate_paisa !== rate)
            throw Error("Same product has conflicting line rates");
          old.cartons += l.cartons;
          old.loose_boxes += l.loose_boxes;
        } else
          order.items.push({
            product_id: l.product_id,
            cartons: l.cartons,
            loose_boxes: l.loose_boxes,
            rate_paisa: rate,
            cost_paisa: cost,
            tier_label: l.tier_label,
            override_reason: "Workbook import",
          });
      }
      data.orders.push(order);
    } catch (e) {
      errors.push("Invoice " + number + ": " + e.message);
    }
  }
  for (const [key, defaultKind] of [
    ["stocktransactions", "in"],
    ["addonstock", "adjustment"],
  ])
    for (const r of sheets[key] || []) {
      if (!str(r.product_id)) continue;
      try {
        const product_id = str(r.product_id);
        if (!products.some((p) => p.id === product_id))
          throw Error("Unknown product " + product_id);
        const kind = str(r.kind).toLowerCase();
        if (
          /sale|sold/.test(kind) &&
          data.orders.some((o) => o.number === str(r.invoice))
        ) {
          warnings.push(
            "Skipped stock sale already represented by invoice " +
              str(r.invoice),
          );
          continue;
        }
        let boxes =
          !missing(r.boxes_in) || !missing(r.boxes_out)
            ? num(r.boxes_in) - num(r.boxes_out)
            : num(r.total_boxes, num(r.loose)) +
              num(r.cartons) *
                products.find((p) => p.id === product_id).boxes_per_carton;
        const k = /damage/.test(kind)
          ? "damage"
          : /out|sale|sold/.test(kind)
            ? "out"
            : /open/.test(kind)
              ? "opening"
              : /adjust/.test(kind)
                ? "adjustment"
                : defaultKind;
        if (["out", "damage"].includes(k)) boxes = -Math.abs(boxes);
        if (!boxes) continue;
        const transaction_id =
          str(r.transaction_id) ||
          "derived:" + stableId(key + ":" + r._row + ":" + product_id);
        if (!str(r.transaction_id))
          warnings.push(
            r._sheet +
              " row " +
              r._row +
              ": missing transaction ID; generated stable row key (do not reorder rows on re-import)",
          );
        data.stock_movements.push({
          transaction_id,
          product_id,
          date: date(r.date, today()),
          boxes,
          kind: k,
          note: str(r.notes) || str(r.description),
        });
      } catch (e) {
        errors.push(r._sheet + " row " + r._row + ": " + e.message);
      }
    }
  for (const r of sheets.receipts || []) {
    if (!str(r.invoice) || (missing(r.amount) && missing(r.received))) continue;
    try {
      const number = str(r.invoice);
      const amount = rs(r.amount, rs(r.received, 0));
      if (amount <= 0) continue;
      const transaction_id =
        str(r.transaction_id) || "receipt:" + stableId(number + ":" + r._row);
      data.payments.push({
        transaction_id,
        invoice_number: number,
        date: date(r.date, today()),
        amount_paisa: amount,
        method: normalMethod(r.method),
        reference: str(r.reference),
        received_by: str(r.salesman) || "Workbook import",
      });
    } catch (e) {
      errors.push("Receipts row " + r._row + ": " + e.message);
    }
  }
  for (const o of data.orders)
    if (
      o._received > 0 &&
      !data.payments.some((p) => p.invoice_number === o.number)
    )
      data.payments.push({
        transaction_id: "opening-received:" + o.number,
        invoice_number: o.number,
        date: o.date,
        amount_paisa: o._received,
        method: "Cash",
        reference: "Imported Received column (no receipt rows)",
        received_by: "Workbook import",
      });
  for (const r of sheets.expenses || []) {
    if (missing(r.amount) || num(r.amount) === 0) continue;
    try {
      data.expenses.push({
        id: str(r.transaction_id) || "EXP-" + stableId("expenses:" + r._row),
        date: date(r.date, today()),
        category: str(r.category) || "Misc",
        description: str(r.description),
        amount_paisa: rs(r.amount, 0),
        method: normalMethod(r.method),
        salesman_id: findStaff(r),
      });
    } catch (e) {
      errors.push("Expenses row " + r._row + ": " + e.message);
    }
  }
  for (const r of sheets.dailysales || []) {
    const sid = findStaff(r);
    if (!sid || missing(r.date)) continue;
    try {
      const d = date(r.date);
      if (data.orders.some((o) => o.salesman_id === sid && o.date === d)) {
        warnings.push(
          "Daily Sales " +
            d +
            ": actuals derived from orders; summary row not added again",
        );
        continue;
      }
      data.daily_actuals.push({
        id: sid + ":" + d,
        date: d,
        salesman_id: sid,
        imported_actual_cartons: num(r.achieved, num(r.cartons)),
        imported_actual_boxes: num(r.total_boxes),
        imported_sales_amount: rs(r.amount, 0),
      });
    } catch (e) {
      errors.push("Daily Sales row " + r._row + ": " + e.message);
    }
  }
  for (const p of data.products) {
    const qty =
      data.stock_movements
        .filter((m) => m.product_id === p.id)
        .reduce((a, m) => a + m.boxes, 0) -
      data.orders.reduce(
        (a, o) =>
          a +
          o.items
            .filter((l) => l.product_id === p.id)
            .reduce(
              (b, l) => b + l.cartons * p.boxes_per_carton + l.loose_boxes,
              0,
            ),
        0,
      );
    if (qty < 0)
      warnings.push(
        p.id +
          ": imported stock would be " +
          qty +
          " boxes; review opening stock",
      );
  }
  const summary = {};
  for (const key of [
    "products",
    "price_tiers",
    "salesmen",
    "customers",
    "orders",
    "payments",
    "stock_movements",
    "expenses",
  ])
    summary[key] = {
      count: data[key].length,
      ...diffRecords(
        current[key] || [],
        data[key],
        ["payments", "stock_movements"].includes(key) ? "transaction_id" : "id",
      ),
    };
  return { data, warnings: [...new Set(warnings)], errors, summary };
}
export function normalMethod(s) {
  const m = str(s).toLowerCase();
  return m.includes("jazz")
    ? "JazzCash"
    : m.includes("easy") || m.includes("easypaisa")
      ? "Easypaisa"
      : m.includes("bank") || m.includes("transfer")
        ? "Bank"
        : m.includes("cheque") || m.includes("check")
          ? "Cheque"
          : "Cash";
}
export function readFile(bytes, XLSX, current) {
  return importWorkbook(
    XLSX.read(bytes, {
      type: "array",
      cellFormula: true,
      cellDates: true,
      cellNF: true,
    }),
    XLSX,
    current,
  );
}
