export const DEFAULTS = {
  company_name: "Blesscon Candy",
  phone: "+923413905030",
  email: "blessconcandy@gmail.com",
  website: "www.blessconcandy.com",
  address: "",
  ntn: "",
  bank_details: "",
  terms: "Please pay by the agreed due date.",
  monthly_target: 130,
  company_monthly_target: 2000,
  boxes_per_carton: 24,
  base_salary_paisa: 4500000,
  working_days: [1, 2, 3, 4, 5, 6],
  holidays: [],
  carry_month_end: true,
  reduce_by_surplus: false,
  block_negative_stock: true,
  allow_customer_credit: false,
  low_stock_boxes: 24,
  auto_salary_expense: false,
  tiers: [
    { min: 0, label: "1–5", rate_paisa: 23000 },
    { min: 6, label: "6–24", rate_paisa: 23000 },
    { min: 25, label: "25–49", rate_paisa: 22500 },
    { min: 50, label: "50+", rate_paisa: 22000 },
  ],
  incentives: [
    { min: 0, amount_paisa: 0 },
    { min: 60, amount_paisa: 300000 },
    { min: 75, amount_paisa: 600000 },
    { min: 90, amount_paisa: 800000 },
    { min: 100, amount_paisa: 1000000 },
  ],
};
export const money = (n) =>
  "Rs. " +
  (Math.round(Number(n) || 0) / 100).toLocaleString("en-PK", {
    maximumFractionDigits: 2,
  });
export const paisa = (n) => {
  const v = Number(
    String(n ?? "")
      .replace(/Rs\.?|PKR|,/gi, "")
      .trim(),
  );
  if (!Number.isFinite(v)) throw Error("Invalid money value");
  return Math.round(v * 100);
};
export const uid = () => crypto.randomUUID();
export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const addDays = (d, n) => {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
export const monthStart = (d) => d.slice(0, 7) + "-01";
export const monthEnd = (d) => {
  const x = new Date(monthStart(d) + "T12:00:00Z");
  x.setUTCMonth(x.getUTCMonth() + 1);
  x.setUTCDate(0);
  return x.toISOString().slice(0, 10);
};
export const isRani = (p) => /^Rani Candy/i.test(p.name);
export function getRate(
  product,
  cartonsOnInvoice,
  channel,
  settings = DEFAULTS,
  tiers = [],
) {
  if (channel === "retail")
    return { rate_paisa: product.retail_paisa, label: "Retail" };
  if (!isRani(product))
    return { rate_paisa: product.wholesale_paisa, label: "Wholesale" };
  const own = tiers.filter((t) => t.product_id === product.id && !t.deleted_at);
  const pool = (
    own.length
      ? own.map((t) => ({ ...t, min: Number(t.min_cartons) }))
      : settings.tiers
  )
    .filter((t) => t.min <= cartonsOnInvoice)
    .sort((a, b) => b.min - a.min);
  if (!pool.length) throw Error("Missing wholesale tier for " + product.name);
  return { rate_paisa: Number(pool[0].rate_paisa), label: pool[0].label };
}
export function priceLines(
  lines,
  products,
  channel,
  settings = DEFAULTS,
  tiers = [],
  canOverride = false,
) {
  const enriched = lines.map((l) => {
    const p = products.find((p) => p.id === l.product_id);
    if (!p) throw Error("Choose a product");
    const cartons = Number(l.cartons) || 0,
      loose_boxes = Number(l.loose_boxes) || 0;
    if (
      !Number.isInteger(cartons) ||
      !Number.isInteger(loose_boxes) ||
      cartons < 0 ||
      loose_boxes < 0
    )
      throw Error("Use whole, nonnegative quantities");
    return {
      ...l,
      cartons,
      loose_boxes,
      p,
      boxes: cartons * p.boxes_per_carton + loose_boxes,
    };
  });
  const invoiceCartons = enriched.reduce(
    (n, l) => n + (isRani(l.p) ? l.boxes / l.p.boxes_per_carton : 0),
    0,
  );
  return enriched.map(({ p, ...l }) => {
    const r = getRate(p, invoiceCartons, channel, settings, tiers);
    const override = l.override_reason?.trim();
    if (override && !canOverride) throw Error("Admin or Manager required for manual rates");
    const rate = override ? Number(l.rate_paisa) : r.rate_paisa;
    if (!Number.isSafeInteger(rate) || rate < 0) throw Error("Invalid rate");
    return {
      ...l,
      product_name: p.name,
      boxes_per_carton: p.boxes_per_carton,
      rate_paisa: rate,
      cost_paisa: p.cost_paisa,
      amount_paisa: rate * l.boxes,
      tier_label: r.label,
      margin_paisa: (rate - p.cost_paisa) * l.boxes,
      invoice_cartons: invoiceCartons,
    };
  });
}
export function paymentState(total, paid) {
  return {
    status: paid <= 0 ? "UNPAID" : paid < total ? "PART PAID" : "PAID",
    paid,
    balance: Math.max(0, total - paid),
    credit: Math.max(0, paid - total),
  };
}
export function invoiceState(invoice, payments) {
  return paymentState(
    invoice.total_paisa,
    payments
      .filter((p) => p.invoice_id === invoice.id && !p.voided_at)
      .reduce((a, p) => a + Number(p.amount_paisa), 0),
  );
}
export function workingDay(date, settings, salesman) {
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  return (
    settings.working_days.includes(weekday) &&
    !settings.holidays.includes(date) &&
    !(salesman.off_days || []).includes(date)
  );
}
export function workingDays(date, settings, salesman) {
  let n = 0;
  for (let d = monthStart(date); d <= monthEnd(date); d = addDays(d, 1))
    if (workingDay(d, settings, salesman)) n++;
  return n;
}
export function targetChain(
  salesman,
  orders,
  items,
  settings = DEFAULTS,
  through = today(),
  imported = [],
) {
  let carry = 0,
    prevMonth = "",
    rows = [];
  const allOrders = orders.filter(
    (o) =>
      o.salesman_id === salesman.id &&
      o.status === "confirmed" &&
      !o.deleted_at,
  );
  for (let d = salesman.joining_date; d <= through; d = addDays(d, 1)) {
    if (prevMonth && prevMonth !== d.slice(0, 7) && !settings.carry_month_end)
      carry = 0;
    prevMonth = d.slice(0, 7);
    const dayOrders = allOrders.filter((o) => o.date === d);
    const dayItems = items.filter((l) =>
      dayOrders.some((o) => o.id === l.order_id),
    );
    const fallback = imported.find(
      (r) => r.date === d && r.salesman_id === salesman.id,
    );
    const achieved = dayOrders.length
      ? dayItems.reduce((a, l) => a + l.boxes / l.boxes_per_carton, 0)
      : Number(fallback?.imported_actual_cartons || 0);
    if (!workingDay(d, settings, salesman) && !achieved) continue;
    const base = workingDay(d, settings, salesman)
      ? salesman.monthly_target / workingDays(d, settings, salesman)
      : 0;
    const effective = Math.max(0, base + carry);
    const shortfall = Math.max(0, effective - achieved),
      surplus = Math.max(0, achieved - effective);
    const out = settings.reduce_by_surplus ? effective - achieved : shortfall;
    rows.push({
      id: salesman.id + ":" + d,
      salesman_id: salesman.id,
      date: d,
      base_target: base,
      carried_forward_in: carry,
      effective_target: effective,
      achieved_cartons: achieved,
      achieved_boxes: dayOrders.length
        ? dayItems.reduce((a, l) => a + l.boxes, 0)
        : Number(fallback?.imported_actual_boxes || 0),
      sales_amount:
        dayOrders.reduce((a, o) => a + Number(o.total_paisa), 0) ||
        Number(fallback?.imported_sales_amount || 0),
      shortfall,
      surplus,
      carried_forward_out: out,
      closed: d < today(),
    });
    carry = out;
  }
  return rows;
}
export function targetPerformance(
  orders,
  items,
  from,
  to,
  managerUserId = "",
  managerSalesmanId = "",
) {
  const periodOrders = orders.filter(
    (order) =>
      order.status === "confirmed" &&
      !order.deleted_at &&
      order.date >= from &&
      order.date <= to,
  );
  const cartonsFor = (order) =>
    items
      .filter((item) => item.order_id === order.id)
      .reduce(
        (sum, item) =>
          sum + Number(item.boxes || 0) / (Number(item.boxes_per_carton) || 1),
        0,
      );
  const managerOrders = periodOrders.filter(
    (order) =>
      !order.salesman_id ||
      (managerUserId && order.sold_by_user_id === managerUserId) ||
      (managerUserId &&
        order.created_by === managerUserId &&
        managerSalesmanId &&
        order.salesman_id === managerSalesmanId),
  );
  const managerDirectCartons = managerOrders.reduce(
    (sum, order) => sum + cartonsFor(order),
    0,
  );
  const salesmanCartons = periodOrders
    .filter((order) => !managerOrders.includes(order))
    .reduce((sum, order) => sum + cartonsFor(order), 0);
  return {
    // The target is exclusively for salesman/team sales. Manager direct sales
    // are reported separately and must never close or reduce the team target.
    achieved_cartons: salesmanCartons,
    manager_direct_cartons: managerDirectCartons,
    salesman_cartons: salesmanCartons,
  };
}
export function salary(salesman, achieved, settings = DEFAULTS) {
  const percent = (achieved / salesman.monthly_target) * 100;
  const slab = [...settings.incentives]
    .sort((a, b) => b.min - a.min)
    .find((x) => percent >= x.min) || { amount_paisa: 0 };
  return {
    percent,
    incentive: slab.amount_paisa,
    total: Number(salesman.base_salary_paisa) + slab.amount_paisa,
  };
}
export function profitLoss(
  orders,
  items,
  expenses,
  payments,
  invoices,
  from,
  to,
) {
  const os = orders.filter(
      (o) =>
        o.status === "confirmed" &&
        !o.deleted_at &&
        o.date >= from &&
        o.date <= to,
    ),
    ids = new Set(os.map((o) => o.id));
  const ls = items.filter((l) => ids.has(l.order_id));
  const ex = expenses.filter(
    (e) => !e.deleted_at && e.date >= from && e.date <= to,
  );
  const subtotal = os.reduce((a, o) => a + Number(o.subtotal_paisa), 0),
    discount = os.reduce((a, o) => a + Number(o.discount_paisa), 0),
    revenue = subtotal - discount,
    cogs = ls.reduce((a, l) => a + l.boxes * Number(l.cost_paisa), 0),
    expense = ex.reduce((a, e) => a + Number(e.amount_paisa), 0);
  const gross = revenue - cogs,
    net = gross - expense;
  const categories = {},
    channels = {},
    salesmen = {},
    products = {};
  ex.forEach(
    (e) =>
      (categories[e.category] =
        (categories[e.category] || 0) + Number(e.amount_paisa)),
  );
  os.forEach((o) => {
    channels[o.channel] = (channels[o.channel] || 0) + Number(o.total_paisa);
    salesmen[o.salesman_id || "Unassigned"] =
      (salesmen[o.salesman_id || "Unassigned"] || 0) + Number(o.total_paisa);
  });
  ls.forEach((l) => {
    const o = os.find((o) => o.id === l.order_id),
      alloc = o.subtotal_paisa
        ? Math.round((o.discount_paisa * l.amount_paisa) / o.subtotal_paisa)
        : 0;
    products[l.product_name] =
      (products[l.product_name] || 0) +
      l.boxes * (l.rate_paisa - l.cost_paisa) -
      alloc;
  });
  const collected = payments
    .filter((p) => !p.voided_at && p.date >= from && p.date <= to)
    .reduce((a, p) => a + Number(p.amount_paisa), 0);
  const outstanding = invoices
    .filter((i) => ids.has(i.order_id))
    .reduce((a, i) => a + invoiceState(i, payments).balance, 0);
  return {
    subtotal,
    discount,
    revenue,
    cogs,
    gross,
    expense,
    net,
    grossMargin: revenue ? (gross / revenue) * 100 : 0,
    netMargin: revenue ? (net / revenue) * 100 : 0,
    collected,
    outstanding,
    categories,
    channels,
    salesmen,
    products,
  };
}
export const expiryStatus = (d, now = today()) =>
  !d
    ? "Not set"
    : d < now
      ? "Expired"
      : d <= addDays(now, 30)
        ? "≤30 days"
        : d <= addDays(now, 90)
          ? "≤90 days"
          : "OK";
export function diffRecords(before, after, key = "id") {
  const map = new Map(before.map((x) => [x[key], x]));
  let created = 0,
    updated = 0,
    unchanged = 0;
  for (const r of after) {
    const old = map.get(r[key]);
    if (!old) created++;
    else if (
      Object.keys(r).some(
        (k) =>
          k !== "version" && JSON.stringify(r[k]) !== JSON.stringify(old[k]),
      )
    )
      updated++;
    else unchanged++;
  }
  return { created, updated, unchanged };
}
