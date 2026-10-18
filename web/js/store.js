import {
  DEFAULTS,
  uid,
  priceLines,
  today,
  addDays,
  targetChain,
} from "./domain.js";
export const TABLES = [
  "products",
  "price_tiers",
  "customers",
  "salesmen",
  "salesman_daily_targets",
  "quotations",
  "quotation_items",
  "orders",
  "order_items",
  "invoices",
  "payments",
  "stock_movements",
  "salesman_stock_movements",
  "stock_vouchers",
  "daily_closings",
  "manager_daily_closings",
  "cashbook_accounts",
  "cashbook_entries",
  "cashbook_daily_closings",
  "expenses",
  "audit_log",
  "profiles",
  "user_roles",
  "user_permissions",
  "attendance_records",
  "employee_documents",
  "customer_visits",
];
const commandRpc = (kind) =>
  kind.startsWith("cashbook.") ? "cashbook_record_command" :
  kind.startsWith("closing.manager_") ? "manager_closing_command" :
  kind.startsWith("closing.") || ["stock.issue", "stock.return"].includes(kind)
    ? "apply_operational_command"
    : "apply_command";
export function empty() {
  return Object.fromEntries([
    ...TABLES.map((t) => [t, []]),
    ["settings", structuredClone(DEFAULTS)],
    ["settings_version", 1],
    ["stock", []],
    ["cashbook_accounts", [
      { account_key:"cash_hand",label:"Cash in Hand",account_type:"cash",payment_method:"Cash",opening_balance_paisa:0,active:true },
      { account_key:"bank_default",label:"Cash in Bank — Default account",account_type:"bank",payment_method:"Bank",opening_balance_paisa:0,active:true },
      { account_key:"easypaisa",label:"EasyPaisa",account_type:"wallet",payment_method:"Easypaisa",opening_balance_paisa:0,active:true },
      { account_key:"jazzcash",label:"JazzCash",account_type:"wallet",payment_method:"JazzCash",opening_balance_paisa:0,active:true },
      { account_key:"market_credit",label:"Market Credit — Receivables",account_type:"receivable",opening_balance_paisa:0,active:true },
    ]],
  ]);
}
const upsert = (a, r, key = "id") => {
  const i = a.findIndex((x) => x[key] === r[key]);
  if (i < 0) a.push(r);
  else a[i] = { ...a[i], ...r };
};
function localCashbookLedger(state) {
  const rows = [...(state.cashbook_entries || [])];
  const accountKey = (method, salesmanId = null) => {
    const m = /easypaisa/i.test(method || "") ? "easypaisa" : /jazzcash/i.test(method || "") ? "jazzcash" : /bank|cheque/i.test(method || "") ? "bank" : "cash";
    return salesmanId ? `salesman:${salesmanId}:${m}` : ({cash:"cash_hand",bank:(state.cashbook_accounts||[]).some(a=>a.account_key==="pk80mucb1156654281004446"&&a.active)?"pk80mucb1156654281004446":"bank_default",easypaisa:"easypaisa",jazzcash:"jazzcash"})[m];
  };
  for (const invoice of state.invoices || []) {
    const order = (state.orders || []).find(o => o.id === invoice.order_id);
    if (!order || order.status !== "confirmed" || !Number(invoice.total_paisa)) continue;
    rows.push({posting_key:`local:invoice:${invoice.id}`,account_key:"market_credit",business_date:order.date,amount_paisa:Number(invoice.total_paisa),entry_type:"receivable"});
  }
  for (const payment of (state.payments || []).filter(p=>!p.voided_at)) {
    const invoice=(state.invoices||[]).find(i=>i.id===payment.invoice_id), order=invoice&&(state.orders||[]).find(o=>o.id===invoice.order_id);
    if (!invoice || !order || order.status!=="confirmed") continue;
    const key=payment.cashbook_account_key || accountKey(payment.method,order.salesman_id);
    rows.push({posting_key:`local:payment:${payment.id}:receipt`,account_key:key,business_date:payment.date,amount_paisa:Number(payment.amount_paisa),entry_type:"receipt"});
    rows.push({posting_key:`local:payment:${payment.id}:receivable`,account_key:"market_credit",business_date:payment.date,amount_paisa:-Number(payment.amount_paisa),entry_type:"receivable"});
  }
  for (const expense of (state.expenses || []).filter(e=>!e.deleted_at)) {
    rows.push({posting_key:`local:expense:${expense.id}`,account_key:expense.cashbook_account_key || accountKey(expense.method,expense.salesman_id),business_date:expense.date,amount_paisa:-Number(expense.amount_paisa),entry_type:"expense"});
  }
  return rows;
}
const sumBy = (rows, fn) => rows.reduce((a, r) => a + Number(fn(r) || 0), 0);
export function managerTeamIds(state, managerId) {
  return (state.salesmen || [])
    .filter((r) => r.manager_user_id === managerId && r.active && !r.deleted_at)
    .map((r) => r.id)
    .sort();
}
// One consolidated figure set for a manager's assigned team on a business date.
// Scope: orders/payments/expenses/stock of assigned salesmen, plus the manager's own
// direct sales and own (unlinked) expenses. No salesman record is created or required.
export function managerClosingFigures(state, managerId, date) {
  const team = managerTeamIds(state, managerId);
  const inTeam = (sid) => !!sid && team.includes(sid);
  const invoices = state.invoices || [];
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const invoiceByOrderId = new Map(invoices.filter((i) => i.order_id).map((i) => [i.order_id, i]));
  // A manager's direct sale may have been entered by an admin/other account.
  // Attribute it by sold_by_user_id, not only by orders.created_by.
  const isManagerDirect = (o) => {
    const invoice = invoiceByOrderId.get(o.id);
    return !o.salesman_id && (o.created_by === managerId || o.sold_by_user_id === managerId || invoice?.sold_by_user_id === managerId);
  };
  const orders = (state.orders || []).filter(
    (o) => o.status === "confirmed" && (inTeam(o.salesman_id) || isManagerDirect(o)),
  );
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const sales = orders.filter((o) => o.date === date);
  const collectionsByMethod = {};
  for (const p of state.payments || []) {
    if (p.date !== date || p.voided_at) continue;
    const order = orderById.get(invoiceById.get(p.invoice_id)?.order_id);
    if (!order || order.date > date) continue;
    collectionsByMethod[p.method] = (collectionsByMethod[p.method] || 0) + Number(p.amount_paisa);
  }
  const expenses = (state.expenses || []).filter(
    (e) =>
      !e.deleted_at &&
      e.date === date &&
      !e.salary_period &&
      (inTeam(e.salesman_id) || (!e.salesman_id && e.created_by === managerId)),
  );
  const stockMovements = {};
  const expectedStock = {};
  for (const m of state.salesman_stock_movements || []) {
    if (!inTeam(m.salesman_id)) continue;
    if (m.date === date) {
      stockMovements[m.product_id] ||= {};
      stockMovements[m.product_id][m.kind] = (stockMovements[m.product_id][m.kind] || 0) + Number(m.boxes);
    }
    if (m.date <= date) expectedStock[m.product_id] = (expectedStock[m.product_id] || 0) + Number(m.boxes);
  }
  for (const k of Object.keys(expectedStock)) if (expectedStock[k] === 0) delete expectedStock[k];
  return {
    team,
    salesCount: sales.length,
    salesTotal: sumBy(sales, (o) => o.total_paisa),
    collectionsByMethod,
    collectionsTotal: Object.values(collectionsByMethod).reduce((a, b) => a + b, 0),
    cashReceived: collectionsByMethod.Cash || 0,
    expensesTotal: sumBy(expenses, (e) => e.amount_paisa),
    cashExpenses: sumBy(expenses.filter((e) => e.method === "Cash"), (e) => e.amount_paisa),
    stockMovements,
    expectedStock,
  };
}
export function localApply(base, op, user) {
  const s = structuredClone(base),
    d = op.data,
    now = new Date().toISOString(),
    admin = user.role === "admin";
  let result = {};
  const find = (t, id) => s[t].find((x) => x.id === id);
  const check = (old) => {
    if (old && old.version !== d.version)
      throw Error("Record changed; refresh before editing");
  };
  const stock = (pid) => {
    const cached = s.stock.find((x) => x.product_id === pid);
    return cached
      ? Number(cached.boxes)
      : s.stock_movements
          .filter((m) => m.product_id === pid)
          .reduce((a, m) => a + m.boxes, 0) -
          s.salesman_stock_movements
            .filter((m) => m.product_id === pid)
            .reduce((a, m) => a + m.boxes, 0);
  };
  const salesmanStock = (pid, sid) =>
    s.salesman_stock_movements
      .filter((m) => m.product_id === pid && m.salesman_id === sid)
      .reduce((sum, movement) => sum + Number(movement.boxes), 0);
  const salesmanStockTracked = (pid, sid) =>
    s.salesman_stock_movements.some(
      (m) => m.product_id === pid && m.salesman_id === sid && m.kind === "issue",
    );
  const sellerMove = (pid, sid, boxes, kind, date, tx, order_id = null) => {
    s.salesman_stock_movements.push({
      id: uid(),
      transaction_id: tx,
      product_id: pid,
      salesman_id: sid,
      date,
      boxes,
      kind,
      order_id,
      created_by: user.id,
    });
  };
  const adjustWarehouse = (pid) => {
    const total = s.stock_movements
      .filter((movement) => movement.product_id === pid)
      .reduce((sum, movement) => sum + Number(movement.boxes), 0);
    const held = s.salesman_stock_movements
      .filter((movement) => movement.product_id === pid)
      .reduce((sum, movement) => sum + Number(movement.boxes), 0);
    upsert(s.stock, { product_id: pid, boxes: total - held }, "product_id");
  };
  const move = (pid, boxes, kind, order_id, tx) => {
    s.stock_movements.push({
      id: uid(),
      transaction_id: tx,
      product_id: pid,
      boxes,
      kind,
      date: d.date || today(),
      order_id,
    });
    upsert(
      s.stock,
      {
        product_id: pid,
        boxes:
          stock(pid) + (s.stock.some((x) => x.product_id === pid) ? boxes : 0),
      },
      "product_id",
    );
  };
  const saveDoc = (input, quote, preserve = false) => {
    const t = quote ? "quotations" : "orders",
      it = quote ? "quotation_items" : "order_items",
      fk = quote ? "quotation_id" : "order_id",
      old = find(t, input.id);
    if (
      !admin &&
      !s.salesmen.some(
        (x) => x.id === input.salesman_id && x.user_id === user.id && x.active,
      )
    )
      throw Error("You can only save your own sales");
    if (old) {
      if (old.version !== input.version) throw Error("Record changed");
      if (
        (quote && !["Draft", "Sent"].includes(old.status)) ||
        (!quote && old.status === "cancelled")
      )
        throw Error("Document cannot be edited");
    }
    let lines = preserve
      ? input.items.map((l) => ({
          ...l,
          boxes: Number(l.cartons) * l.boxes_per_carton + Number(l.loose_boxes),
        }))
      : priceLines(
          input.items,
          s.products,
          input.channel,
          s.settings,
          s.price_tiers,
          admin,
        );
    if (!lines.length || lines.some((l) => l.boxes <= 0))
      throw Error("Enter positive quantities");
    if (new Set(lines.map((l) => l.product_id)).size !== lines.length)
      throw Error("Combine duplicate product lines");
    const subtotal = lines.reduce((a, l) => a + l.rate_paisa * l.boxes, 0),
      discount = Number(input.discount_paisa) || 0;
    if (discount < 0 || discount > subtotal) throw Error("Invalid discount");
    if (!quote && old)
      s[it]
        .filter((l) => l[fk] === old.id)
        .forEach((l) => {
          const tracked = s.salesman_stock_movements.some(
            (movement) =>
              movement.order_id === old.id &&
              movement.product_id === l.product_id &&
              movement.kind === "sale",
          );
          const transaction = "edit:" + op.id + ":" + l.product_id;
          move(l.product_id, l.boxes, "reversal", old.id, transaction);
          if (tracked) {
            sellerMove(l.product_id, old.salesman_id, l.boxes, "sale_reversal", d.date || today(), "seller:" + transaction, old.id);
            adjustWarehouse(l.product_id);
          }
        });
    if (!quote)
      for (const l of lines) {
        const tracked = salesmanStockTracked(l.product_id, input.salesman_id);
        const available = tracked
          ? salesmanStock(l.product_id, input.salesman_id)
          : stock(l.product_id);
        if (s.settings.block_negative_stock && available < l.boxes)
          throw Error("Insufficient " + (tracked ? "salesman " : "warehouse ") + "stock: " + l.product_name);
      }
    const rec = {
      ...old,
      ...input,
      number:
        old?.number ||
        (user.practice
          ? `${quote ? "QT" : "INV"}-${today().slice(0, 4)}-${String(s[t].length + 1).padStart(4, "0")}`
          : "Pending sync"),
      status: old?.status || (quote ? "Draft" : "confirmed"),
      revision: old ? (old.revision || 0) + 1 : 1,
      version: (old?.version || 0) + 1,
      subtotal_paisa: subtotal,
      total_paisa: subtotal - discount,
      discount_paisa: discount,
      created_by: old?.created_by || user.id,
      updated_by: user.id,
      created_at: old?.created_at || now,
      updated_at: now,
    };
    delete rec.items;
    delete rec.payment;
    upsert(s[t], rec);
    s[it] = s[it].filter((l) => l[fk] !== rec.id);
    for (const l of lines) {
      s[it].push({
        ...l,
        id: uid(),
        [fk]: rec.id,
        amount_paisa: l.rate_paisa * l.boxes,
      });
      if (!quote) {
        const tracked = salesmanStockTracked(l.product_id, rec.salesman_id);
        move(
          l.product_id,
          -l.boxes,
          "sale",
          rec.id,
          "sale:" + op.id + ":" + l.product_id,
        );
        if (tracked) {
          sellerMove(l.product_id, rec.salesman_id, -l.boxes, "sale", d.date || today(), "seller:sale:" + op.id + ":" + l.product_id, rec.id);
          adjustWarehouse(l.product_id);
        }
      }
    }
    if (!quote)
      upsert(s.invoices, {
        id: find("invoices", rec.id)?.id || rec.id,
        order_id: rec.id,
        number: rec.number,
        total_paisa: rec.total_paisa,
      });
    return rec;
  };
  switch (op.kind) {
    case "product.save": {
      if (!admin) throw Error("Admin required");
      const record = d.record, old = find("products", record.id);
      if (old && old.version !== d.expected_version) throw Error("CONFLICT: Product changed; reload latest before saving");
      if (!record.name?.trim()) throw Error("Product name is required");
      if (!Number.isInteger(Number(record.boxes_per_carton)) || Number(record.boxes_per_carton) < 1) throw Error("Boxes per carton must be at least 1");
      if (Number(record.cost_paisa) < 0 || Number(record.retail_paisa) < 0 || Number(record.wholesale_paisa) < 0) throw Error("Prices cannot be negative");
      result = { ...old, ...record, active: record.active === true || record.active === "true", version: (old?.version || 0)+1, created_by: old?.created_by || user.id, updated_by:user.id, deleted_at:null, updated_at:now };
      upsert(s.products,result);
      const tiers = Array.isArray(d.tiers) ? d.tiers : [];
      const mins = tiers.map(t=>Number(t.min_cartons));
      if (tiers.length && (Math.min(...mins)!==0 || new Set(mins).size!==mins.length || mins.some(x=>!Number.isFinite(x)||x<0))) throw Error("Product tiers must have unique minimums starting at 0");
      for (const oldTier of s.price_tiers.filter(t=>t.product_id===record.id)) {
        const keep=tiers.find(t=>Number(t.min_cartons)===Number(oldTier.min_cartons));
        if (!keep) { oldTier.deleted_at=now; oldTier.version=(oldTier.version||0)+1; }
        else { Object.assign(oldTier,keep,{deleted_at:null,version:(oldTier.version||0)+1,updated_by:user.id}); }
      }
      for (const t of tiers) {
        let existing=s.price_tiers.find(x=>x.product_id===record.id && Number(x.min_cartons)===Number(t.min_cartons));
        if (!existing) s.price_tiers.push({ ...t, id:t.id || record.id+":"+t.min_cartons, product_id:record.id, version:1, deleted_at:null, created_by:user.id, updated_by:user.id });
      }
      result = { product: structuredClone(result), tiers: s.price_tiers.filter(t=>t.product_id===record.id && !t.deleted_at).map(x=>structuredClone(x)) };
      break;
    }
    case "master.save": {
      const { table, record, expected_version } = d;
      if (!admin && !["customers", "expenses"].includes(table))
        throw Error("Admin required");
      const old =
        table === "settings"
          ? { version: s.settings_version }
          : find(table, record.id);
      if (old && old.version !== expected_version)
        throw Error("Record changed; refresh");
      result = {
        ...old,
        ...record,
        version: (old?.version || 0) + 1,
        created_by: old?.created_by || user.id,
        updated_by: user.id,
        deleted_at: null,
      };
      if (table === "settings") {
        s.settings = record.value;
        s.settings_version = result.version;
      } else upsert(s[table], result);
      break;
    }
    case "master.delete":
      if (!admin) throw Error("Admin required");
      check(find(d.table, d.id));
      Object.assign(find(d.table, d.id), {
        deleted_at: now,
        version: d.version + 1,
      });
      break;
    case "order.save": {
      result = saveDoc(d, false);
      const payment = d.payment;
      if (payment && payment.status !== "unpaid") {
        const invoice = s.invoices.find((x) => x.order_id === result.id);
        const amount = payment.status === "paid" ? result.total_paisa : Number(payment.amount_paisa);
        if (!Number.isSafeInteger(amount) || amount <= 0 || (payment.status === "partial" && amount >= result.total_paisa)) throw Error("Part payment must be greater than zero and less than the order total");
        const already = s.payments.find((x) => x.transaction_id === payment.transaction_id);
        if (!already) {
          const paid = s.payments.filter((x) => x.invoice_id === invoice.id && !x.voided_at).reduce((a,x)=>a+x.amount_paisa,0);
          if (paid + amount > invoice.total_paisa && !s.settings.allow_customer_credit) throw Error("Payment exceeds invoice total. Enable customer credit or correct the amount.");
          s.payments.push({ id: uid(), transaction_id: payment.transaction_id, invoice_id: invoice.id, date: payment.date || today(), amount_paisa: amount, method: payment.method || "Cash", cashbook_account_key: payment.cashbook_account_key || null, reference: payment.reference || "", received_by: payment.received_by || user.name || user.email || "Owner", created_by: user.id, created_at: now, voided_at: null });
        }
      }
      break;
    }
    case "quote.save":
      result = saveDoc(d, true);
      break;
    case "order.cancel": {
      if (!admin) throw Error("Admin required");
      const o = find("orders", d.id);
      check(o);
      const i = s.invoices.find((x) => x.order_id === o.id);
      if (s.payments.some((p) => p.invoice_id === i?.id && !p.voided_at))
        throw Error("Void/refund payments first");
      if (o.status !== "cancelled") {
        s.order_items
          .filter((l) => l.order_id === o.id)
          .forEach((l) => {
            const tracked = s.salesman_stock_movements.some(
              (movement) =>
                movement.order_id === o.id &&
                movement.product_id === l.product_id &&
                movement.kind === "sale",
            );
            const transaction = "cancel:" + o.id + ":" + l.product_id;
            move(l.product_id, l.boxes, "reversal", o.id, transaction);
            if (tracked) {
              sellerMove(l.product_id, o.salesman_id, l.boxes, "sale_reversal", d.date || today(), "seller:" + transaction, o.id);
              adjustWarehouse(l.product_id);
            }
          });
        o.status = "cancelled";
        o.version++;
      }
      break;
    }
    case "quote.status": {
      const q = find("quotations", d.id);
      check(q);
      q.status = d.status;
      q.version++;
      break;
    }
    case "quote.delete": {
      if (!admin) throw Error("Admin required");
      const q = find("quotations", d.id);
      check(q);
      if (q.status === "Converted")
        throw Error("Cannot delete converted quotation");
      if (d.hard) s.quotations = s.quotations.filter((x) => x.id !== q.id);
      else {
        q.deleted_at = now;
        q.version++;
      }
      break;
    }
    case "quote.convert": {
      const q = find("quotations", d.id);
      check(q);
      if (q.status === "Converted" || q.order_id)
        throw Error("Quotation already converted");
      if (q.valid_until < today() || ["Rejected", "Expired"].includes(q.status))
        throw Error("Quotation expired or rejected");
      const items = s.quotation_items.filter((l) => l.quotation_id === q.id);
      result = saveDoc(
        {
          ...q,
          id: d.order_id,
          date: today(),
          due_date: addDays(today(), 7),
          version: undefined,
          items: d.reprice
            ? items.map((l) => ({ ...l, override_reason: "" }))
            : items,
        },
        false,
        !d.reprice,
      );
      const order = find("orders", result.id);
      order.status = "confirmed";
      order.quotation_id = q.id;
      q.status = "Converted";
      q.order_id = order.id;
      q.version++;
      if (d.payment && d.payment.status !== "unpaid") {
        const invoice = s.invoices.find((x) => x.order_id === order.id);
        const amount = d.payment.status === "paid" ? order.total_paisa : Number(d.payment.amount_paisa);
        if (!Number.isSafeInteger(amount) || amount <= 0) throw Error("Payment amount must be positive");
        if (amount > invoice.total_paisa && !s.settings.allow_customer_credit) throw Error("Payment exceeds invoice total");
        if (!s.payments.some((x) => x.transaction_id === d.payment.transaction_id)) s.payments.push({ id: uid(), transaction_id: d.payment.transaction_id, invoice_id: invoice.id, date: d.payment.date || today(), amount_paisa: amount, method: d.payment.method || "Cash", cashbook_account_key: d.payment.cashbook_account_key || null, reference: d.payment.reference || "", received_by: d.payment.received_by || user.name || user.email || "Owner", created_by: user.id, created_at: now, voided_at: null });
      }
      break;
    }
    case "payment.add": {
      const i =
        find("invoices", d.invoice_id) ||
        s.invoices.find((i) => i.number === d.invoice_number);
      if (!i) throw Error("Invoice not found");
      if (d.amount_paisa <= 0) throw Error("Enter positive amount");
      const paid = s.payments
        .filter((p) => p.invoice_id === i.id && !p.voided_at)
        .reduce((a, p) => a + p.amount_paisa, 0);
      if (
        paid + d.amount_paisa > i.total_paisa &&
        !s.settings.allow_customer_credit
      )
        throw Error("Overpayment blocked");
      if (s.payments.some((p) => p.transaction_id === d.transaction_id))
        throw Error("Duplicate receipt");
      result = { ...d, id: uid(), invoice_id: i.id, created_by: user.id };
      s.payments.push(result);
      break;
    }
    case "payment.void":
      if (!admin) throw Error("Admin required");
      Object.assign(find("payments", d.id), {
        voided_at: now,
        void_reason: d.reason,
      });
      break;
    case "stock.add":
      if (!admin) throw Error("Admin required");
      if (!Number.isInteger(d.boxes) || !d.boxes)
        throw Error("Use a nonzero whole-box quantity");
      if (stock(d.product_id) + d.boxes < 0 && s.settings.block_negative_stock)
        throw Error("Insufficient stock");
      move(d.product_id, d.boxes, d.kind, null, d.transaction_id);
      break;
    case "stock.issue": {
      const canIssue =
        admin ||
        s.user_permissions.some(
          (permission) =>
            permission.user_id === user.id &&
            permission.section === "stock" &&
            permission.can_create,
        );
      if (!canIssue) throw Error("Stock issue permission required");
      const items = Array.isArray(d.items) ? d.items : [d];
      const reference = d.reference || d.transaction_id;
      if (!items.length || items.length > 100)
        throw Error("A stock issue must contain 1 to 100 product lines");
      if (reference && s.salesman_stock_movements.some((movement) => movement.reference === reference))
        throw Error("Stock voucher reference already exists");
      const seller = s.salesmen.find(
        (row) => row.id === d.salesman_id && row.active && !row.deleted_at,
      );
      if (!seller) throw Error("Choose an active salesman");
      const close = s.daily_closings.find(
        (row) =>
          row.salesman_id === d.salesman_id &&
          row.business_date === d.date &&
          ["submitted", "approved"].includes(row.status),
      );
      if (close) throw Error("Reopen the daily closing before changing stock");
      const byProduct = new Map();
      for (const item of items) {
        const product = s.products.find(
          (row) => row.id === item.product_id && row.active && !row.deleted_at,
        );
        if (!product) throw Error("Choose an active product for every issue line");
        if (!Number.isSafeInteger(item.boxes) || item.boxes <= 0)
          throw Error("Every issue line needs a positive whole-box quantity");
        const transactionId = item.transaction_id || d.transaction_id;
        if (!transactionId) throw Error("A unique transaction ID is required for each line");
        if (s.salesman_stock_movements.some((movement) => movement.transaction_id === transactionId))
          throw Error("Duplicate stock movement transaction ID");
        byProduct.set(item.product_id, (byProduct.get(item.product_id) || 0) + item.boxes);
      }
      for (const [productId, boxes] of byProduct)
        if (stock(productId) < boxes)
          throw Error("Insufficient warehouse stock for " + s.products.find((row) => row.id === productId).name);
      const voucherId = uid();
      const voucher = {
        id: voucherId,
        reference,
        kind: "issue",
        salesman_id: d.salesman_id,
        date: d.date,
        condition: null,
        note: d.note || "",
        created_by: user.id,
        created_at: now,
      };
      s.stock_vouchers.push(voucher);
      result = [];
      for (const item of items) {
        const movement = {
          id: uid(),
          transaction_id: item.transaction_id || d.transaction_id,
          reference,
          salesman_id: d.salesman_id,
          product_id: item.product_id,
          date: d.date,
          boxes: item.boxes,
          note: d.note || "",
          kind: "issue",
          voucher_id: voucherId,
          created_by: user.id,
          created_at: now,
        };
        s.salesman_stock_movements.push(movement);
        adjustWarehouse(item.product_id);
        result.push(movement);
      }
      result = { ...voucher, items: result };
      break;
    }
    case "stock.return": {
      const ownsSeller = s.salesmen.some(
        (row) => row.id === d.salesman_id && row.user_id === user.id && row.active,
      );
      const canReturn =
        admin ||
        ownsSeller ||
        s.user_permissions.some(
          (permission) =>
            permission.user_id === user.id &&
            permission.section === "stock" &&
            permission.can_create,
        );
      if (!canReturn) throw Error("Stock return permission required");
      const items = Array.isArray(d.items) ? d.items : [d];
      const reference = d.reference || d.transaction_id;
      if (!items.length || items.length > 100)
        throw Error("A stock return must contain 1 to 100 product lines");
      if (reference && s.salesman_stock_movements.some((movement) => movement.reference === reference))
        throw Error("Stock voucher reference already exists");
      if (!new Set(["saleable", "damaged", "expired", "unsaleable"]).has(d.condition))
        throw Error("Choose a valid return condition");
      const close = s.daily_closings.find(
        (row) =>
          row.salesman_id === d.salesman_id &&
          row.business_date === d.date &&
          ["submitted", "approved"].includes(row.status),
      );
      if (close) throw Error("Reopen the daily closing before changing stock");
      const byProduct = new Map();
      for (const item of items) {
        if (!s.products.some((row) => row.id === item.product_id))
          throw Error("Choose a product for every return line");
        if (!Number.isSafeInteger(item.boxes) || item.boxes <= 0)
          throw Error("Every return line needs a positive whole-box quantity");
        const transactionId = item.transaction_id || d.transaction_id;
        if (!transactionId) throw Error("A unique transaction ID is required for each line");
        if (s.salesman_stock_movements.some((movement) => movement.transaction_id === transactionId))
          throw Error("Duplicate stock movement transaction ID");
        byProduct.set(item.product_id, (byProduct.get(item.product_id) || 0) + item.boxes);
      }
      for (const [productId, boxes] of byProduct)
        if (salesmanStock(productId, d.salesman_id) < boxes)
          throw Error("Insufficient salesman stock for " + s.products.find((row) => row.id === productId).name);
      const voucherId = uid();
      const voucher = {
        id: voucherId,
        reference,
        kind: "return",
        salesman_id: d.salesman_id,
        date: d.date,
        condition: d.condition,
        note: d.note || "",
        created_by: user.id,
        created_at: now,
      };
      s.stock_vouchers.push(voucher);
      result = [];
      for (const item of items) {
        const transactionId = item.transaction_id || d.transaction_id;
        const movement = {
          id: uid(),
          transaction_id: transactionId,
          reference,
          salesman_id: d.salesman_id,
          product_id: item.product_id,
          date: d.date,
          boxes: -item.boxes,
          kind: "return_" + d.condition,
          note: d.note || "",
          voucher_id: voucherId,
          created_by: user.id,
          created_at: now,
        };
        s.salesman_stock_movements.push(movement);
        if (d.condition === "saleable") adjustWarehouse(item.product_id);
        else {
          move(
            item.product_id,
            -item.boxes,
            "damage",
            null,
            "return-loss:" + transactionId,
          );
          adjustWarehouse(item.product_id);
        }
        result.push(movement);
      }
      result = { ...voucher, items: result };
      break;
    }
    case "cashbook.account.save": {
      if (!admin) throw Error("Only Admin can configure cashbook accounts");
      if (!/^[a-z][a-z0-9_:-]{2,79}$/.test(String(d.account_key || ""))) throw Error("Invalid account key");
      if (!["bank","wallet"].includes(d.account_type)) throw Error("Only bank and wallet accounts can be added");
      if (!String(d.label || "").trim()) throw Error("Enter an account name");
      if (["cash_hand","market_credit"].includes(d.account_key)) throw Error("This is a reserved system account key");
      if (d.account_key==="bank_default" && (d.account_type!=="bank" || d.payment_method!=="Bank")) throw Error("Default bank account must remain mapped to Bank");
      if (d.account_key==="easypaisa" && (d.account_type!=="wallet" || !/easypaisa/i.test(d.payment_method||""))) throw Error("EasyPaisa system account mapping cannot be changed");
      if (d.account_key==="jazzcash" && (d.account_type!=="wallet" || !/jazzcash/i.test(d.payment_method||""))) throw Error("JazzCash system account mapping cannot be changed");
      const oldAccount=s.cashbook_accounts.find(a=>a.account_key===d.account_key);
      if (oldAccount && Number(oldAccount.opening_balance_paisa||0)!==d.opening_balance_paisa && s.cashbook_entries.some(e=>e.account_key===d.account_key)) throw Error("Account has ledger history; use an audited adjustment instead of changing its opening balance");
      if (oldAccount && (oldAccount.account_type!==d.account_type || (oldAccount.payment_method||"")!==(d.payment_method||"")) && s.cashbook_entries.some(e=>e.account_key===d.account_key)) throw Error("Account type/method cannot change after ledger activity; create a new account");
      if (!Number.isSafeInteger(d.opening_balance_paisa) || d.opening_balance_paisa < 0) throw Error("Opening balance cannot be negative");
      result = { account_key:d.account_key, label:d.label.trim(), account_type:d.account_type, payment_method:d.payment_method, opening_balance_paisa:0, active:true, created_by:user.id, created_at:oldAccount?.created_at||now, pending_sync:!user.practice };
      upsert(s.cashbook_accounts,result,"account_key");
      if (d.opening_balance_paisa > 0) s.cashbook_entries.push({id:uid(),posting_key:`command:${op.id}:opening`,transaction_id:op.id,business_date:today(),account_key:d.account_key,amount_paisa:d.opening_balance_paisa,entry_type:"adjustment",source_table:"cashbook_accounts",source_id:d.account_key,description:"Opening balance",created_by:user.id,created_at:now,pending_sync:!user.practice});
      break;
    }
    case "cashbook.transfer": {
      if (!["admin","manager"].includes(user.role)) throw Error("Management access required");
      const amount = Number(d.amount_paisa);
      if (!Number.isSafeInteger(amount) || amount <= 0) throw Error("Transfer amount must be positive");
      if (!d.source_account || !d.destination_account || d.source_account === d.destination_account) throw Error("Choose two different accounts");
      const known = key => s.cashbook_accounts.some(a=>a.account_key===key && a.active);
      if (s.cashbook_accounts.length && (!known(d.source_account)||!known(d.destination_account))) throw Error("Choose active accounts");
      const baseEntry = { transaction_id:op.id,business_date:d.date||today(),source_table:"cashbook",source_id:op.id,reference:d.reference||"",description:d.description||"Account transfer",created_by:user.id,created_at:now,pending_sync:!user.practice };
      const sourceAccount=s.cashbook_accounts.find(a=>a.account_key===d.source_account);
      const currentBalance=Number(sourceAccount?.opening_balance_paisa||0)+localCashbookLedger(s).filter(e=>e.account_key===d.source_account && e.business_date<=(d.date||today())).reduce((sum,e)=>sum+Number(e.amount_paisa),0);
      if (currentBalance < amount) throw Error("Insufficient balance in the source account");
      s.cashbook_entries.push({ ...baseEntry,id:uid(),posting_key:`command:${op.id}:out`,account_key:d.source_account,amount_paisa:-amount,entry_type:"transfer_out" },{ ...baseEntry,id:uid(),posting_key:`command:${op.id}:in`,account_key:d.destination_account,amount_paisa:amount,entry_type:"transfer_in" });
      result = { ok:true, transaction_id:op.id };
      break;
    }
    case "cashbook.handover": {
      if (user.role!=="salesman") throw Error("Salesman login required for this handover action");
      const amount=Number(d.amount_paisa), dt=d.date||today();
      if (!Number.isSafeInteger(amount)||amount<=0) throw Error("Handover amount must be positive");
      const account=s.cashbook_accounts.find(a=>a.account_key===d.source_account && a.active && a.account_type==="salesman" && a.payment_method==="Cash" && s.salesmen.some(x=>x.id===a.salesman_id && x.user_id===user.id));
      if (!account) throw Error("Choose your own salesman cash collection account");
      const balance=Number(account.opening_balance_paisa||0)+localCashbookLedger(s).filter(e=>e.account_key===account.account_key && e.business_date<=dt).reduce((sum,e)=>sum+Number(e.amount_paisa),0);
      if (balance<amount) throw Error("Insufficient cash in your collection");
      const baseEntry={transaction_id:op.id,business_date:dt,source_table:"cashbook",source_id:op.id,reference:d.reference||"",description:d.description||"Cash handed to office",created_by:user.id,created_at:now,pending_sync:!user.practice,salesman_id:account.salesman_id};
      s.cashbook_entries.push({...baseEntry,id:uid(),posting_key:`command:${op.id}:out`,account_key:account.account_key,amount_paisa:-amount,entry_type:"transfer_out"},{...baseEntry,id:uid(),posting_key:`command:${op.id}:in`,account_key:"cash_hand",amount_paisa:amount,entry_type:"transfer_in",description:(d.description||"Cash handed to office")+" — received by office"});
      result={ok:true,transaction_id:op.id};
      break;
    }
    case "cashbook.adjust": {
      if (!["admin","manager"].includes(user.role)) throw Error("Management access required");
      const amount = Number(d.amount_paisa);
      if (!Number.isSafeInteger(amount) || amount === 0) throw Error("Adjustment amount cannot be zero");
      if (!String(d.description||"").trim()) throw Error("A reason is required for an adjustment");
      if (s.cashbook_accounts.length && !s.cashbook_accounts.some(a=>a.account_key===d.account_key && a.active)) throw Error("Choose an active account");
      s.cashbook_entries.push({id:uid(),posting_key:`command:${op.id}`,transaction_id:op.id,business_date:d.date||today(),account_key:d.account_key,amount_paisa:amount,entry_type:"adjustment",source_table:"cashbook",source_id:op.id,reference:d.reference||"",description:d.description,created_by:user.id,created_at:now,pending_sync:!user.practice});
      result = { ok:true, transaction_id:op.id };
      break;
    }
    case "cashbook.close.submit": {
      if (!["admin","manager","salesman"].includes(user.role)) throw Error("Cashbook closing access required");
      const dt=d.date||today(), note=String(d.notes||"").trim();
      const liquidAccounts=s.cashbook_accounts.filter(a=>a.active && a.account_type!=="receivable");
      const ledger=localCashbookLedger(s);
      const actuals=Array.isArray(d.actuals)?d.actuals:[];
      if (!actuals.length) throw Error("Enter actual balances");
      for (const item of actuals) {
        const account=liquidAccounts.find(a=>a.account_key===item.account_key);
        if (!account) throw Error("Unknown account");
        if (user.role==="salesman" && (!account.salesman_id || !s.salesmen.some(x=>x.id===account.salesman_id && x.user_id===user.id))) throw Error("You can only close your own collection accounts");
        const prior=s.cashbook_daily_closings.find(x=>x.business_date===dt && x.account_key===account.account_key);
        if (prior?.status==="approved") throw Error("This account is already approved for the selected date");
        const expected=Number(account.opening_balance_paisa||0)+ledger.filter(e=>e.account_key===account.account_key && e.business_date<=dt).reduce((sum,e)=>sum+Number(e.amount_paisa),0);
        const actual=Number(item.actual_balance_paisa), variance=actual-expected;
        if (!Number.isSafeInteger(actual)||actual<0) throw Error("Actual balance cannot be negative");
        if (variance && !note) throw Error("A reason is required for any difference");
        const row={...prior,id:prior?.id||uid(),business_date:dt,account_key:account.account_key,expected_balance_paisa:expected,actual_balance_paisa:actual,variance_paisa:variance,notes:note,status:"submitted",submitted_by:user.id,submitted_at:now,pending_sync:!user.practice};
        upsert(s.cashbook_daily_closings,row,"id");
      }
      result={ok:true,submitted:actuals.length};
      break;
    }
    case "cashbook.close.approve": {
      if (!admin && user.role!=="manager") throw Error("Management approval required");
      const row=find("cashbook_daily_closings",d.closing_id);
      if (!row) throw Error("Closing record not found");
      if (row.status==="approved") throw Error("Closing already approved");
      if (row.variance_paisa && !String(row.notes||"").trim()) throw Error("A reason is required for the variance");
      if (row.variance_paisa) s.cashbook_entries.push({id:uid(),posting_key:`cashbook-close:${row.id}:variance`,transaction_id:`CLOSE-${row.id}`,business_date:row.business_date,account_key:row.account_key,amount_paisa:Number(row.variance_paisa),entry_type:"adjustment",source_table:"cashbook_daily_closings",source_id:row.id,description:`Approved reconciliation adjustment: ${row.notes}`,created_by:user.id,created_at:now,pending_sync:!user.practice});
      row.status="approved"; row.approved_by=user.id; row.approved_at=now; result={ok:true,closing_id:row.id};
      break;
    }
    case "closing.manager_submit": {
      if (user.role !== "manager") throw Error("Only a manager can submit the team closing");
      if (!d.date) throw Error("Business date is required");
      if (!d.actual_stock || typeof d.actual_stock !== "object" || Array.isArray(d.actual_stock))
        throw Error("Counted stock is required");
      s.manager_daily_closings ||= [];
      const old = s.manager_daily_closings.find(
        (r) => r.manager_user_id === user.id && r.business_date === d.date,
      );
      if (old && (!["rejected", "reopened"].includes(old.status) || old.version !== d.expected_version))
        throw Error("Manager closing already submitted or changed; reload before retrying");
      const opening = Number(d.opening_cash_paisa || 0),
        handed = Number(d.cash_handed_over_paisa || 0),
        actualCash = Number(d.actual_cash_paisa || 0);
      if (opening < 0 || handed < 0 || actualCash < 0) throw Error("Cash amounts cannot be negative");
      const prior = s.manager_daily_closings
        .filter((r) => r.manager_user_id === user.id && r.business_date < d.date && r.status === "approved")
        .sort((a, b) => b.business_date.localeCompare(a.business_date))[0];
      if (prior && Number(prior.actual_cash_paisa) !== opening)
        throw Error("Opening cash must match the previous approved closing");
      const balances = Object.fromEntries(
        ["cash_in_bank_paisa", "cash_in_hand_paisa", "cash_in_easypaisa_paisa", "cash_in_jazzcash_paisa", "market_credit_paisa"]
          .map((key) => [key, Number(d[key] || 0)]),
      );
      if (Object.values(balances).some((v) => !Number.isFinite(v) || v < 0))
        throw Error("Closing balances cannot be negative");
      const fig = managerClosingFigures(s, user.id, d.date);
      const expectedCash = opening + fig.cashReceived - fig.cashExpenses - handed;
      const cashVariance = actualCash - expectedCash;
      const stockVariance = {};
      for (const pid of new Set([...Object.keys(fig.expectedStock), ...Object.keys(d.actual_stock)])) {
        const expected = Number(fig.expectedStock[pid] || 0), actual = Number(d.actual_stock[pid] || 0);
        if (actual !== expected) stockVariance[pid] = { expected, actual, variance: actual - expected };
      }
      if ((cashVariance !== 0 || Object.keys(stockVariance).length) && !String(d.reason || "").trim())
        throw Error("A reason is required for cash or stock variance");
      result = {
        ...old,
        id: old?.id || uid(),
        manager_user_id: user.id,
        business_date: d.date,
        team_salesman_ids: fig.team,
        sales_count: fig.salesCount,
        sales_total_paisa: fig.salesTotal,
        collections_by_method: fig.collectionsByMethod,
        collections_total_paisa: fig.collectionsTotal,
        cash_received_paisa: fig.cashReceived,
        expenses_total_paisa: fig.expensesTotal,
        cash_expenses_paisa: fig.cashExpenses,
        stock_movements: fig.stockMovements,
        opening_cash_paisa: opening,
        cash_handed_over_paisa: handed,
        expected_cash_paisa: expectedCash,
        actual_cash_paisa: actualCash,
        cash_variance_paisa: cashVariance,
        ...balances,
        expected_stock: fig.expectedStock,
        actual_stock: d.actual_stock,
        stock_variances: stockVariance,
        reason: d.reason || "",
        notes: d.notes || "",
        status: "submitted",
        version: (old?.version || 0) + 1,
        submitted_by: user.id,
        submitted_at: now,
        approved_by: null,
        approved_at: null,
        decision_by: null,
        decision_at: null,
        decision_reason: "",
      };
      upsert(s.manager_daily_closings, result);
      break;
    }
    case "closing.manager_approve":
    case "closing.manager_reject":
    case "closing.manager_reopen": {
      if (!admin) throw Error("Admin approval required");
      s.manager_daily_closings ||= [];
      const old = s.manager_daily_closings.find((r) => r.id === d.id);
      if (!old || old.version !== d.expected_version) throw Error("Closing changed; refresh before updating");
      const reason = String(d.reason || "").trim();
      if (op.kind === "closing.manager_approve" && old.status !== "submitted")
        throw Error("Only submitted manager closings can be approved");
      if (op.kind === "closing.manager_reject" && (old.status !== "submitted" || !reason))
        throw Error("A rejection reason is required for a submitted manager closing");
      if (op.kind === "closing.manager_reopen" && (!["approved", "rejected"].includes(old.status) || !reason))
        throw Error("A reopening reason is required for an approved or rejected manager closing");
      const approved = op.kind === "closing.manager_approve";
      result = {
        ...old,
        status: approved ? "approved" : op.kind === "closing.manager_reject" ? "rejected" : "reopened",
        approved_by: approved ? user.id : null,
        approved_at: approved ? now : null,
        decision_by: user.id,
        decision_at: now,
        decision_reason: reason,
        version: old.version + 1,
      };
      upsert(s.manager_daily_closings, result);
      break;
    }
    case "closing.submit": {
      const ownsSeller = s.salesmen.some(
        (row) => row.id === d.salesman_id && row.user_id === user.id && row.active,
      );
      // v39: a manager may close for any active salesman (company-wide), not only assigned ones.
      const managesSeller = user.role === "manager" && s.salesmen.some(
        (row) => row.id === d.salesman_id && row.active && !row.deleted_at,
      );
      if (!admin && !ownsSeller && !managesSeller)
        throw Error("Only the assigned salesman, a manager, or Admin may submit this closing");
      const old = s.daily_closings.find(
        (row) =>
          row.salesman_id === d.salesman_id && row.business_date === d.date,
      );
      if (
        old &&
        (!(["rejected", "reopened"].includes(old.status)) ||
          old.version !== d.expected_version)
      )
        throw Error("Closing already submitted or changed; reload before retrying");
      const prior = s.daily_closings
        .filter(
          (row) =>
            row.salesman_id === d.salesman_id &&
            row.business_date < d.date &&
            row.status === "approved",
        )
        .sort((a, b) => b.business_date.localeCompare(a.business_date))[0];
      if (
        prior &&
        Number(prior.actual_cash_paisa) !== Number(d.opening_cash_paisa)
      )
        throw Error("Opening cash must match the previous approved closing");
      const payments = s.payments.filter((payment) => {
        const invoice = s.invoices.find((row) => row.id === payment.invoice_id);
        const order = invoice && s.orders.find((row) => row.id === invoice.order_id);
        return (
          order?.salesman_id === d.salesman_id &&
          order.status === "confirmed" &&
          payment.date === d.date &&
          payment.method === "Cash" &&
          !payment.voided_at
        );
      });
      const cashReceived = payments.reduce(
        (sum, payment) => sum + Number(payment.amount_paisa),
        0,
      );
      const cashExpenses = s.expenses
        .filter(
          (expense) =>
            expense.salesman_id === d.salesman_id &&
            expense.date === d.date &&
            expense.method === "Cash" &&
            !expense.deleted_at,
        )
        .reduce((sum, expense) => sum + Number(expense.amount_paisa), 0);
      const expectedCash =
        Number(d.opening_cash_paisa) +
        cashReceived -
        cashExpenses -
        Number(d.cash_handed_over_paisa || 0);
      const cashVariance = Number(d.actual_cash_paisa) - expectedCash;
      const balances = Object.fromEntries(
        [
          "cash_in_bank_paisa",
          "cash_in_hand_paisa",
          "cash_in_easypaisa_paisa",
          "cash_in_jazzcash_paisa",
          "market_credit_paisa",
        ].map((key) => [key, Number(d[key] || 0)]),
      );
      if (Object.values(balances).some((v) => !Number.isFinite(v) || v < 0))
        throw Error("Closing balances cannot be negative");
      const expectedStock = Object.fromEntries(
        [...new Set(s.salesman_stock_movements.map((row) => row.product_id))]
          .map((productId) => [productId, salesmanStock(productId, d.salesman_id)])
          .filter(([, boxes]) => boxes !== 0),
      );
      const stockVariance = {};
      for (const productId of new Set([
        ...Object.keys(expectedStock),
        ...Object.keys(d.actual_stock || {}),
      ])) {
        const expected = Number(expectedStock[productId] || 0);
        const actual = Number(d.actual_stock?.[productId] || 0);
        if (actual !== expected)
          stockVariance[productId] = { expected, actual, variance: actual - expected };
      }
      if (
        (cashVariance !== 0 || Object.keys(stockVariance).length) &&
        !String(d.reason || "").trim()
      )
        throw Error("A reason is required for cash or stock variance");
      result = {
        ...old,
        id: old?.id || uid(),
        salesman_id: d.salesman_id,
        business_date: d.date,
        opening_cash_paisa: Number(d.opening_cash_paisa),
        cash_handed_over_paisa: Number(d.cash_handed_over_paisa || 0),
        cash_received_paisa: cashReceived,
        cash_expenses_paisa: cashExpenses,
        expected_cash_paisa: expectedCash,
        actual_cash_paisa: Number(d.actual_cash_paisa),
        cash_variance_paisa: cashVariance,
        ...balances,
        expected_stock: expectedStock,
        actual_stock: d.actual_stock || {},
        stock_variances: stockVariance,
        reason: d.reason || "",
        notes: d.notes || "",
        status: "submitted",
        version: (old?.version || 0) + 1,
        submitted_by: user.id,
        submitted_at: now,
        approved_by: null,
        approved_at: null,
      };
      upsert(s.daily_closings, result);
      break;
    }
    case "closing.approve":
    case "closing.reject":
    case "closing.reopen": {
      if (!admin) throw Error("Management approval required");
      const old = find("daily_closings", d.id);
      if (!old || old.version !== d.expected_version)
        throw Error("Closing changed; refresh before updating");
      if (op.kind === "closing.approve" && old.status !== "submitted")
        throw Error("Only submitted closings can be approved");
      if (
        op.kind === "closing.reject" &&
        (old.status !== "submitted" || !String(d.reason || "").trim())
      )
        throw Error("A rejection reason is required for a submitted closing");
      if (
        op.kind === "closing.reopen" &&
        (!new Set(["approved", "rejected"]).has(old.status) ||
          !String(d.reason || "").trim())
      )
        throw Error("A reopening reason is required for an approved or rejected closing");
      Object.assign(old, {
        status:
          op.kind === "closing.approve"
            ? "approved"
            : op.kind === "closing.reject"
              ? "rejected"
              : "reopened",
        approved_by: op.kind === "closing.approve" ? user.id : null,
        approved_at: op.kind === "closing.approve" ? now : null,
        decision_reason: d.reason || "",
        version: old.version + 1,
      });
      result = old;
      break;
    }
    case "import.batch":
      throw Error(
        "Workbook import requires a live connection so the complete batch can be checked and committed atomically",
      );
    case "share.create":
    case "share.revoke":
      throw Error("Sharing requires an online connection");
    default:
      throw Error("This action requires an online connection");
  }
  s.audit_log.push({
    id: "local:" + op.id,
    table_name: op.kind,
    action: op.kind,
    actor_id: user.id,
    occurred_at: now,
  });
  s.salesman_daily_targets = s.salesmen
    .filter((x) => !x.deleted_at)
    .flatMap((x) =>
      targetChain(
        x,
        s.orders,
        s.order_items,
        s.settings,
        addDays(today(), 7),
        s.salesman_daily_targets,
      ),
    );
  return { state: s, result };
}
export class Store extends EventTarget {
  constructor(client, user) {
    super();
    this.client = client;
    this.user = user;
    this.key =
      "blesscon:v2:" +
      new URL(client?.supabaseUrl || "https://practice.local").host +
      ":" +
      user.id;
    const saved = JSON.parse(localStorage.getItem(this.key) || "null");
    this.base = {
      ...empty(),
      ...saved?.base,
      settings: { ...DEFAULTS, ...saved?.base?.settings },
    };
    this.queue = saved?.queue || [];
    this.error = "";
    this.busy = false;
    this.state = this.base;
    this.replay();
    window.addEventListener("online", () => this.sync());
  }
  emit() {
    this.dispatchEvent(new Event("change"));
  }
  persist() {
    try {
      localStorage.setItem(
        this.key,
        JSON.stringify({ base: this.base, queue: this.queue }),
      );
    } catch {
      throw Error(
        "Device storage full. Export a backup and free storage before continuing",
      );
    }
  }
  replay() {
    let s = this.base;
    for (const op of this.queue) {
      try {
        s = localApply(s, op, this.user).state;
      } catch (e) {
        this.error = e.message;
        break;
      }
    }
    this.state = s;
    this.emit();
  }
  async all(t) {
    let rows = [],
      offset = 0;
    for (;;) {
      const { data, error } = await this.client
        .from(t)
        .select("*")
        .range(offset, offset + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    return rows;
  }
  async refresh() {
    if (!this.client) return;
    const { data, error } = await this.client.rpc("business_snapshot");
    if (error) throw error;
    if (!data?.settings)
      throw Error("Your account is inactive or not configured");
    this.base = {
      ...empty(),
      ...data,
      settings: { ...DEFAULTS, ...data.settings },
      cashbook_loaded: false,
      cashbook_error: "",
    };
    try {
      const [accounts, entries, closings] = await Promise.all([
        this.all("cashbook_accounts"),
        this.all("cashbook_entries"),
        this.all("cashbook_daily_closings"),
      ]);
      this.base.cashbook_accounts = accounts;
      this.base.cashbook_entries = entries;
      this.base.cashbook_daily_closings = closings;
      this.base.cashbook_loaded = true;
    } catch (cashbookError) {
      this.base.cashbook_error = cashbookError?.message || String(cashbookError);
      this.base.cashbook_loaded = false;
    }
    this.persist();
    this.replay();
  }

  async verifyUser() {
    if (!this.client) return;
    const { data, error } = await this.client.auth.getSession();
    if (error || data?.session?.user?.id !== this.user.id)
      throw Error("Sign in to the account that created these pending changes");
  }
  async run(kind, data) {
    if (this.busy) throw Error("Please wait for the current save");
    if (this.error && this.queue.length)
      throw Error(
        "Resolve the pending sync issue before entering another change: " +
          this.error,
      );
    const op = { id: uid(), kind, data, queued_at: new Date().toISOString() };
    if (this.user.practice) {
      const n = localApply(this.base, op, this.user);
      this.base = n.state;
      this.persist();
      this.replay();
      return n.result;
    }
    if (kind === "cashbook.close.approve" && this.client && !navigator.onLine) {
      throw Error("Daily closing approval requires an online connection.");
    }
    // Expense account selection must be committed by Supabase before the editor closes.
    // The generic optimistic queue previously swallowed an RPC error and left the form
    // appearing saved while cashbook_account_key remained NULL in public.expenses.
    if (kind === "master.save" && data?.table === "expenses" && this.client && navigator.onLine) {
      if (this.queue.length) {
        await this.sync();
        if (this.queue.length || this.error) {
          throw Error("A previous change is still pending. Resolve the sync error before saving this expense: " + (this.error || "pending changes remain"));
        }
      }
      this.busy = true;
      this.emit();
      try {
        await this.verifyUser();
        const { data: saved, error } = await this.client.rpc("apply_command", {
          op_id: op.id,
          kind,
          data,
        });
        if (error) {
          const message = error.message || String(error);
          if (/schema cache|could not find the function|function .* does not exist|unknown command/i.test(message)) {
            throw Error("Supabase rejected the expense save. Confirm that cashbook_account_key exists on public.expenses and is allowed by private.save_master(text,jsonb,integer), then run NOTIFY pgrst, 'reload schema'. Original error: " + message);
          }
          throw error;
        }
        if (!saved?.id || saved.id !== data?.record?.id || saved.cashbook_account_key !== data?.record?.cashbook_account_key) {
          throw Error("Supabase did not confirm the selected expense account. The expense editor was kept open; refresh the Expenses list and check the database migration.");
        }
        const index = this.base.expenses.findIndex((e) => e.id === saved.id);
        if (index < 0) this.base.expenses.push(saved);
        else this.base.expenses[index] = saved;
        this.persist();
        this.error = "";
        this.lastResult = saved;
        this.replay();
        try {
          await this.refresh();
        } catch (refreshError) {
          this.error = "Expense was saved successfully, but the full data refresh failed: " + (refreshError?.message || String(refreshError));
          this.emit();
        }
        return saved;
      } catch (error) {
        throw Error(error?.message || "Expense save failed. Check Supabase permissions and schema migration.");
      } finally {
        this.busy = false;
        this.emit();
      }
    }
    // Product writes must not be reported as successful while merely queued.
    // In the old path, an RPC rejection was swallowed by sync(), the optimistic
    // product stayed visible locally, and saveMaster closed the dialog anyway.
    // When online and there are no older queued mutations, execute the command
    // synchronously so a database/permission/schema error reaches the form.
    if (kind === "product.save" && this.client && navigator.onLine) {
      // Never optimistically close the product editor while an earlier mutation
      // is still queued or while the database has not accepted this save.
      if (this.queue.length) {
        await this.sync();
        if (this.queue.length || this.error) {
          throw Error("A previous change is still pending. Resolve the sync error before saving product changes: " + (this.error || "pending changes remain"));
        }
      }
      this.busy = true;
      this.emit();
      try {
        await this.verifyUser();
        let { data: res, error } = await this.client.rpc("apply_command", {
          op_id: op.id,
          kind,
          data,
        });
        // Some deployed databases still have an older apply_command that does
        // not know product.save. In that specific case, use the existing
        // master.save/master.delete commands rather than making the Save button
        // unusable until the database migration is deployed. Keep the legacy
        // path explicit and sequential; errors remain visible to the form.
        if (error && /unknown command/i.test(error.message || "")) {
          const legacyRun = async (legacyKind, legacyData) => {
            const { data: value, error: legacyError } = await this.client.rpc("apply_command", {
              op_id: uid(), kind: legacyKind, data: legacyData,
            });
            if (legacyError) throw legacyError;
            return value;
          };
          const savedProduct = await legacyRun("master.save", {
            table: "products", record: data.record,
            expected_version: data.expected_version ?? null,
          });
          if (!savedProduct?.id) throw Error("The database accepted no product record. Check the products table schema and admin permissions.");
          // Retain the confirmed product immediately. If a later legacy tier
          // write fails, the form stays open and a retry can update this same
          // product instead of colliding with (or duplicating) the new ID.
          const productIndex = this.base.products.findIndex(p => p.id === savedProduct.id);
          if (productIndex < 0) this.base.products.push(savedProduct); else this.base.products[productIndex] = savedProduct;
          this.persist();
          this.replay();
          const priorTiers = this.base.price_tiers.filter(t => t.product_id === savedProduct.id);
          const requestedTiers = Array.isArray(data.tiers) ? data.tiers : [];
          for (const tier of requestedTiers) {
            const oldTier = priorTiers.find(t => Number(t.min_cartons) === Number(tier.min_cartons));
            const savedTier = await legacyRun("master.save", {
              table: "price_tiers",
              record: { ...tier, id: oldTier?.id || tier.id || `${savedProduct.id}:${tier.min_cartons}`, product_id: savedProduct.id },
              expected_version: oldTier?.version ?? null,
            });
            const ti = this.base.price_tiers.findIndex(t => t.id === savedTier.id);
            if (ti < 0) this.base.price_tiers.push(savedTier); else this.base.price_tiers[ti] = savedTier;
          }
          for (const oldTier of priorTiers.filter(t => !t.deleted_at && !requestedTiers.some(n => Number(n.min_cartons) === Number(t.min_cartons)))) {
            await legacyRun("master.delete", { table: "price_tiers", id: oldTier.id, version: oldTier.version });
            const ti = this.base.price_tiers.findIndex(t => t.id === oldTier.id);
            if (ti >= 0) this.base.price_tiers[ti] = { ...this.base.price_tiers[ti], deleted_at: new Date().toISOString(), version: (oldTier.version || 0) + 1 };
          }
          res = { product: savedProduct, tiers: this.base.price_tiers.filter(t => t.product_id === savedProduct.id && !t.deleted_at) };
          error = null;
        }
        if (error) {
          const msg = error.message || String(error);
          if (/schema cache|could not find the function|function .* does not exist/i.test(msg)) {
            throw Error("Supabase database migration is missing or not refreshed. In SQL Editor, run supabase/fix_product_save.sql, then run: NOTIFY pgrst, 'reload schema'; Original error: " + msg);
          }
          throw error;
        }
        // apply_command returns the committed product and tiers. Apply that
        // authoritative response locally before attempting a full snapshot so
        // a snapshot/RLS/cache failure cannot make a committed save look failed.
        if (!res?.product?.id || res.product.id !== data?.record?.id) {
          throw Error("Supabase returned no saved product. Check the deployed database migration and product table schema.");
        }
        const saved = res.product;
        const pi = this.base.products.findIndex((p) => p.id === saved.id);
        if (pi < 0) this.base.products.push(saved);
        else this.base.products[pi] = saved;
        this.base.price_tiers = this.base.price_tiers.filter((t) => t.product_id !== saved.id);
        this.base.price_tiers.push(...(Array.isArray(res.tiers) ? res.tiers : []));
        this.persist();
        this.error = "";
        this.replay();
        this.lastResult = res;
        try {
          await this.refresh();
        } catch (refreshError) {
          this.error = "Product saved successfully, but the full data refresh failed: " + (refreshError?.message || String(refreshError));
          this.emit();
        }
        return res;
      } catch (error) {
        // Preserve the real PostgREST message for the form's inline alert.
        throw Error(error?.message || "Product save failed. Check database permissions and schema migration.");
      } finally {
        this.busy = false;
        this.emit();
      }
    }
    // Stock issues/returns change two linked ledgers. When online, wait for the
    // database transaction to confirm before the UI closes the form; otherwise
    // an RPC/RLS/migration error could be swallowed by the generic offline queue.
    if ((["stock.add", "stock.issue", "stock.return"].includes(kind) || kind.startsWith("cashbook.") || kind.startsWith("closing.manager_")) && this.client && navigator.onLine) {
      if (this.queue.length) {
        await this.sync();
        if (this.queue.length || this.error) {
          throw Error("A previous change is still pending. Resolve the sync error before changing stock: " + (this.error || "pending changes remain"));
        }
      }
      this.busy = true;
      this.emit();
      try {
        await this.verifyUser();
        const { data: result, error } = await this.client.rpc(commandRpc(kind), {
          op_id: op.id,
          kind,
          data,
        });
        if (error) {
          const message = error.message || String(error);
          if (/schema cache|could not find the function|function .* does not exist|unknown command/i.test(message)) {
            throw Error((kind === "stock.add" ? "The stock-entry database function is missing or outdated. Apply supabase/fix_stock_entry_idempotency.sql, then refresh the app. Original error: " : kind.startsWith("closing.manager_") ? "The manager closing migration is missing. Apply supabase/manager_closing_expenses_v40.sql in the Supabase SQL editor and refresh the app. Original error: " : kind.startsWith("cashbook.") ? "The Cash & Bank Book migration may be missing. Apply supabase/cash_bank_book.sql after the existing schema and operational migrations. Original error: " : "The Supabase stock-operation migration may be missing or outdated. Apply supabase/operational_modules.sql and refresh the schema cache. Original error: ") + message);
          }
          throw error;
        }
        try {
          await this.refresh();
        } catch (refreshError) {
          this.error = "Stock operation was accepted by Supabase, but the data refresh failed: " + (refreshError?.message || String(refreshError));
          this.emit();
        }
        this.lastResult = result;
        return result || { confirmed: true };
      } finally {
        this.busy = false;
        this.emit();
      }
    }
    if (
      ["import.batch", "share.create", "share.revoke", "user.update"].includes(
        kind,
      )
    ) {
      if (!navigator.onLine || this.queue.length)
        throw Error("Sync pending changes before this action");
      this.busy = true;
      try {
        await this.verifyUser();
        const { data: res, error } = await this.client.rpc("apply_command", {
          op_id: op.id,
          kind,
          data,
        });
        if (error) throw error;
        await this.refresh();
        return res;
      } finally {
        this.busy = false;
        this.emit();
      }
    }
    localApply(this.state, op, this.user);
    this.queue.push(op);
    this.persist();
    this.replay();
    await this.sync();
    return this.queue.length
      ? { queued: true, error: this.error }
      : this.lastResult || { queued: true };
  }
  async sync() {
    if (!this.client || this.busy || !navigator.onLine) return;
    this.busy = true;
    this.error = "";
    this.emit();
    try {
      await this.verifyUser();
      while (this.queue.length) {
        const op = this.queue[0];
        const { data, error } = await this.client.rpc(commandRpc(op.kind), {
          op_id: op.id,
          kind: op.kind,
          data: op.data,
        });
        if (error) throw error;
        this.lastResult = data;
        this.queue.shift();
        await this.refresh();
      }
      await this.client.rpc("recalculate_targets", {
        p_through: addDays(today(), 7),
      });
      await this.refresh();
    } catch (e) {
      this.error = e.message || String(e);
      this.replay();
    } finally {
      this.busy = false;
      this.persist();
      this.emit();
    }
  }
  async discardFirst() {
    this.queue.shift();
    this.error = "";
    this.persist();
    if (this.client && navigator.onLine) await this.refresh();
    else this.replay();
  }
}
