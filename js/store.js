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
  "expenses",
  "audit_log",
  "profiles",
  "user_roles",
  "user_permissions",
];
export function empty() {
  return Object.fromEntries([
    ...TABLES.map((t) => [t, []]),
    ["settings", structuredClone(DEFAULTS)],
    ["settings_version", 1],
    ["stock", []],
  ]);
}
const upsert = (a, r, key = "id") => {
  const i = a.findIndex((x) => x[key] === r[key]);
  if (i < 0) a.push(r);
  else a[i] = { ...a[i], ...r };
};
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
          .reduce((a, m) => a + m.boxes, 0);
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
        .forEach((l) =>
          move(
            l.product_id,
            l.boxes,
            "reversal",
            old.id,
            "edit:" + op.id + ":" + l.product_id,
          ),
        );
    if (!quote)
      for (const l of lines)
        if (s.settings.block_negative_stock && stock(l.product_id) < l.boxes)
          throw Error("Insufficient stock: " + l.product_name);
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
    upsert(s[t], rec);
    s[it] = s[it].filter((l) => l[fk] !== rec.id);
    for (const l of lines) {
      s[it].push({
        ...l,
        id: uid(),
        [fk]: rec.id,
        amount_paisa: l.rate_paisa * l.boxes,
      });
      if (!quote)
        move(
          l.product_id,
          -l.boxes,
          "sale",
          rec.id,
          "sale:" + op.id + ":" + l.product_id,
        );
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
    case "order.save":
      result = saveDoc(d, false);
      break;
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
          .forEach((l) =>
            move(
              l.product_id,
              l.boxes,
              "reversal",
              o.id,
              "cancel:" + o.id + ":" + l.product_id,
            ),
          );
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
    this.base = saved?.base || empty();
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
    };
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
        const { data, error } = await this.client.rpc("apply_command", {
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
