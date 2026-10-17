import {
  DEFAULTS,
  money,
  paisa,
  uid,
  esc,
  today,
  addDays,
  monthStart,
  monthEnd,
  priceLines,
  invoiceState,
  salary,
  profitLoss,
  expiryStatus,
  targetPerformance,
} from "./domain.js";
import { Store, empty, TABLES } from "./store.js";
import { readFile } from "./importer.js";
import { LOGO, ICON } from "./brand.js";
import {
  documentData,
  documentHTML,
  DOCUMENT_TEMPLATES,
  makePDF,
  shareText,
  whatsappURL,
} from "./documents.js";
import { exportWorkbook } from "./exporter.js";
import { dailySalesReport } from "./reports.js";
const $ = (id) => document.getElementById(id),
  visible = (a) => a.filter((x) => !x.deleted_at),
  num = (v) => Number(v) || 0;
let store,
  user,
  client,
  page = "dashboard",
  draft,
  preview,
  activeDoc,
  activeTemplate = "classic",
  charts = [],
  filter = { from: monthStart(today()), to: today(), category: "", search: "" },
  overviewFrom = monthStart(today()),
  overviewTo = today(),
  stockIssueLineCount = 1,
  stockReturnLineCount = 1,
  reportDate = today(),
  reportSalesman = "";
const NAV = [
  ["dashboard", "Overview", "◫"],
  ["myprofile", "My profile & fieldwork", "♙"],
  ["dsr", "Daily sales report", "▤"],
  ["closing", "Daily closing", "✓"],
  ["cashbook", "5. Cash & Bank Book", "▤"],
  ["orders", "Sales orders", "↗"],
  ["invoices", "Invoices & payments", "▤"],
  ["quotes", "Quotations", "◇"],
  ["ledger", "Customer ledger", "▥"],
  ["stock", "Stock & expiry", "▦"],
  ["products", "Products & pricing", "◈"],
  ["staff", "Salesmen & targets", "♙"],
  ["expenses", "Expenses", "−"],
  ["pnl", "Profit & loss", "▧"],
  ["import", "Import & export", "⇄"],
  ["settings", "Settings", "⚙"],
  ["users", "Users & access", "♧"],
  ["audit", "Audit trail", "≡"],
];
const S = () => store.state,
  admin = () => user?.role === "admin",
  manager = () => user?.role === "manager",
  mgmt = () => user?.role === "admin" || user?.role === "manager",
  own = () => S().salesmen.find((s) => s.user_id === user.id);
const canStockWrite = () =>
  admin() ||
  S().user_permissions.some(
    (permission) =>
      permission.user_id === user.id &&
      permission.section === "stock" &&
      permission.can_create,
  );
const canViewAllClosings = () =>
  mgmt() ||
  S().user_permissions.some(
    (permission) =>
      permission.user_id === user.id &&
      permission.section === "closing" &&
      permission.can_view,
  );
const can = (p) =>
  (user?.role === "salesman" && ["dashboard","myprofile","dsr","closing","cashbook","orders","invoices","quotes","ledger","stock","products"].includes(p)) ||
  admin() ||
  (!["settings", "users", "audit", "import"].includes(p) &&
    ([
      "dashboard",
      "dsr",
      "closing",
      "cashbook",
      "orders",
      "invoices",
      "quotes",
      "ledger",
      "products",
      "stock",
      "staff",
    ].includes(p) ||
      S().user_permissions.some(
        (x) => x.user_id === user.id && x.section === p && x.can_view,
      )));
const badge = (s, t = "") =>
  `<span class="badge ${t || (/PAID|Accepted|Synced|OK/.test(s) && !/PART|UNPAID/.test(s) ? "green" : /PART|Draft|Sent|Pending|30/.test(s) ? "amber" : /UNPAID|Expired|cancel|Rejected/.test(s) ? "red" : "")}">${esc(s)}</span>`;
const btn = (text, act, id = "", extra = "", cls = "secondary") =>
  `<button class="${cls}" data-act="${act}" data-id="${esc(id)}" ${extra}>${text}</button>`;
const field = (label, name, value = "", type = "text", extra = "") =>
  `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;
const area = (label, name, value = "") =>
  `<div class="field"><label for="f-${name}">${label}</label><textarea id="f-${name}" name="${name}">${esc(value)}</textarea></div>`;
const select = (label, name, options, value = "") =>
  `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${options
    .map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(value) === String(v) ? "selected" : ""}>${esc(t)}</option>`;
    })
    .join("")}</select></div>`;
const table = (headers, rows, emptyText = "No records yet") =>
  rows.length
    ? `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td data-label="${esc(String(headers[i] ?? "").replace(/<[^>]*>/g, ""))}">${c ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : `<div class="empty"><h3>${esc(emptyText)}</h3><p>Use the button above to add a record, or import your workbook.</p></div>`;
// Overview cards that open the section their figures come from.
const CARD_LINKS = {
  "Sales in period": "orders",
  "Collections in period": "invoices",
  "Previous debt recovered": "invoices",
  "New credit issued": "ledger",
  "Expenses in period": "expenses",
  "Customer outstanding": "ledger",
  "Overdue outstanding": "ledger",
  "Stock issued": "stock",
  "Stock returned": "stock",
  "Unsubmitted closings": "closing",
  "Profit in period": "pnl",
  "Company monthly target": "staff",
  "Salesman sales": "staff",
  "Your achievement (your sales)": "orders",
  "Manager direct sales": "orders",
};
const card = (label, value, meta = "", accent = false) => {
  const to = CARD_LINKS[label],
    link = to && can(to);
  return `<div class="card${accent ? " accent" : ""}${link ? " clickable" : ""}"${link ? ` data-page="${to}" role="link" tabindex="0" title="Open ${esc(NAV.find((n) => n[0] === to)?.[1] || to)}"` : ""}><div class="label">${label}</div><div class="value">${value}</div><div class="meta">${meta}</div></div>`;
};
const customerName = (id) => S().customers.find((c) => c.id === id)?.name || id;
const salesmanName = (id) =>
  S().salesmen.find((s) => s.id === id)?.name || "Unassigned";
const balance = (id, salesmanId = null) => {
  const movements = S().salesman_stock_movements.filter(
    (movement) =>
      movement.product_id === id &&
      (!salesmanId || movement.salesman_id === salesmanId),
  );
  if (
    salesmanId &&
    movements.some((movement) => movement.kind === "issue")
  )
    return movements.reduce((sum, movement) => sum + Number(movement.boxes), 0);
  return Number(S().stock.find((x) => x.product_id === id)?.boxes || 0);
};
// Net stock currently held by a salesman: issues add stock, sales and returns
// reduce it. Keep this separate from warehouse balance and always scope by seller.
const heldStock = (productId, salesmanId) => {
  if (!productId || !salesmanId) return 0;
  return S().salesman_stock_movements
    .filter((movement) =>
      String(movement.product_id) === String(productId) &&
      String(movement.salesman_id) === String(salesmanId),
    )
    .reduce((sum, movement) => sum + num(movement.boxes), 0);
};
const download = (name, content, type = "application/json") => {
  const a = document.createElement("a"),
    url = URL.createObjectURL(
      content instanceof Blob ? content : new Blob([content], { type }),
    );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
function toast(text) {
  $("toast").textContent = text;
  $("toast").style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").style.display = "none"), 6000);
}
function modal(title, html) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = html;
  if (!$("modal").open) $("modal").showModal();
  if ($("stock-form")) refreshStockMovementPreview($("stock-form"));
  $("minimize-modal").hidden = !(draft && $("document-form"));
  setTimeout(
    () => $("modal-body").querySelector("input,select,button")?.focus(),
    0,
  );
}
function close() {
  $("modal").close();
  draft = null;
  preview = null;
}
$("close-modal").onclick = close;
// Minimise: park the open sale/quotation form (with everything typed into it)
// so the user can look at other pages, then resume exactly where they left off.
let minimized = null;
function updatePill() {
  const pill = $("draft-pill");
  if (!pill) return;
  pill.hidden = !minimized;
  if (minimized) pill.textContent = "▲ Resume: " + minimized.title;
}
function minimizeModal() {
  if (!draft || !$("document-form")) return;
  const frag = document.createDocumentFragment();
  while ($("modal-body").firstChild) frag.appendChild($("modal-body").firstChild);
  minimized = { title: $("modal-title").textContent, frag, draft };
  draft = null;
  $("modal").close();
  $("minimize-modal").hidden = true;
  updatePill();
}
function restoreModal() {
  if (!minimized) return;
  const m = minimized;
  minimized = null;
  draft = m.draft;
  $("modal-title").textContent = m.title;
  $("modal-body").replaceChildren(m.frag);
  $("minimize-modal").hidden = false;
  if (!$("modal").open) $("modal").showModal();
  if ($("stock-form")) refreshStockMovementPreview($("stock-form"));
  updatePill();
  calcEditor();
}
$("minimize-modal").onclick = minimizeModal;
$("draft-pill").onclick = restoreModal;
function syncBadge() {
  if (!store) return;
  const text = user.practice
    ? "Practice workspace"
    : store.busy
      ? "Syncing…"
      : store.error
        ? "Sync needs attention"
        : store.queue.length
          ? `Offline / ${store.queue.length} pending`
          : navigator.onLine
            ? "Synced"
            : "Offline";
  $("sync-status") &&
    ($("sync-status").innerHTML = badge(
      text,
      user.practice || store.queue.length || store.error ? "amber" : "green",
    ));
  if ($("sync-alert"))
    $("sync-alert").innerHTML = store.error
      ? `<div class="notice danger">${esc(store.error)} ${btn("Review pending changes", "queue")}</div>`
      : store.queue.length
        ? `<div class="notice">${store.queue.length} change(s) saved on this device. They remain provisional until the server accepts them. ${btn("Sync now", "sync")}</div>`
        : "";
}
function shell() {
  try {
    const savedPage = localStorage.getItem("blesscon:last-page");
    if (savedPage && NAV.some((item) => item[0] === savedPage)) page = savedPage;
  } catch {}
  const nav = NAV.filter((x) => can(x[0]));
  $("app").innerHTML =
    `<div class="layout"><aside class="sidebar" id="sidebar"><div class="brand"><img src="${ICON}" alt="Blesscon Candy logo"><div><b>BLESSCON CANDY</b><small>Business Manager</small></div></div><nav aria-label="Main navigation">${nav.map((n, i) => `${[0, 5, 10].includes(i) ? `<div class="nav-section">${i === 0 ? "BUSINESS" : i === 5 ? "OPERATIONS" : "ADMINISTRATION"}</div>` : ""}<button data-page="${n[0]}" class="${page === n[0] ? "active" : ""}"><span class="nav-icon" aria-hidden="true">${n[2]}</span>${n[1]}</button>`).join("")}</nav><div class="sidebar-footer">${esc(user.name || user.email || "Owner")}<br>${esc(user.role)}<hr><small>Karachi business dates · PKR</small></div></aside><div><header class="topbar"><div class="actions"><button class="mobile-menu icon-button" data-act="menu" aria-label="Toggle navigation">☰</button><span class="muted">${new Date(today() + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span></div><div class="actions"><span id="sync-status"></span>${btn("↻ Sync", "sync")}${btn("Account", "account")}${btn("Sign out", "logout")}</div></header><main id="main" class="main-content" tabindex="-1">${user.practice ? '<div class="notice">Practice workspace — example products only. This data is stored on this device and never sent to your business database.</div>' : ""}<div id="sync-alert"></div><div id="page"></div></main></div></div>`;
  render();
}
function head(title, description, actions = "") {
  return `<div class="page-head"><div><div class="eyebrow">Blesscon Candy / ${esc(title)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="actions">${actions}</div></div>`;
}
function render() {
  if (!store) return;
  charts.forEach((c) => c.destroy());
  charts = [];
  const s = S();
  if (page === "myprofile" && !admin() && !["salesman", "user"].includes(user.role)) page = "dashboard";
  if (!can(page) && page !== "myprofile") page = "dashboard";
  // Keep the selected module across refreshes on this device. The normal
  // permission checks above still decide whether the user may open it.
  try { localStorage.setItem("blesscon:last-page", page); } catch {}
  document.querySelectorAll("[data-page]").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === page);
    if (b.dataset.page === page) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  const methods = {
    dashboard: user.role === "salesman" ? renderSalesmanDashboard : renderDashboard,
    myprofile: renderMyProfile,
    dsr: renderDailyReport,
    closing: renderDailyClosing,
    cashbook: renderCashBook,
    orders: () => renderDocs(false),
    quotes: () => renderDocs(true),
    invoices: renderInvoices,
    ledger: renderLedger,
    stock: renderStock,
    products: renderProducts,
    staff: renderStaff,
    expenses: renderExpenses,
    pnl: renderPnl,
    settings: renderSettings,
    users: renderUsers,
    audit: renderAudit,
    import: renderImport,
  };
  $("page").innerHTML = methods[page]();
  if (page === "myprofile" && admin()) hydrateAdminFieldwork().catch((e) => toast("Could not load admin fieldwork: " + e.message));
  else if (page === "myprofile") hydrateSalesmanProfile().catch((e) => toast("Could not load profile details: " + e.message));
  if (page === "staff" && admin()) hydrateAdminFieldwork().catch((e) => toast("Could not load salesman fieldwork: " + e.message));
  if (page === "dsr")
    $("page").insertAdjacentHTML("beforeend", dsrClosingSection());
  syncBadge();
  if (page === "dashboard" || page === "pnl") drawCharts();
}
async function hydrateSalesmanProfile() {
  const seller = own();
  if (!seller || !client || page !== "myprofile") return;
  const avatar = $("profile-avatar");
  if (seller.photo_path && avatar) {
    const { data, error } = await client.storage.from("employee-private").createSignedUrl(seller.photo_path, 3600);
    if (!error && data?.signedUrl && avatar.isConnected) avatar.innerHTML = `<img src="${esc(data.signedUrl)}" alt="Your profile photo">`;
  }
  const [attendance, documents, visits] = await Promise.all([
    client.from("attendance_records").select("attendance_date,check_in_at,check_out_at,status,check_in_latitude,check_in_longitude,check_in_location_accuracy_m").eq("salesman_id", seller.id).order("attendance_date", { ascending: false }).limit(30),
    client.from("employee_documents").select("document_type,file_name,mime_type,size_bytes,created_at").eq("salesman_id", seller.id).order("created_at", { ascending: false }).limit(50),
    client.from("customer_visits").select("customer_label,area,purpose,notes,visited_at,latitude,longitude").eq("salesman_id", seller.id).order("visited_at", { ascending: false }).limit(30),
  ]);
  const history = (id, result, headers, rows, emptyText) => {
    const el = $(id); if (!el || !el.isConnected) return;
    if (result.error) { el.innerHTML = `<p class="notice">Unable to load records: ${esc(result.error.message)}</p>`; return; }
    el.innerHTML = table(headers, result.data.map(rows), emptyText);
  };
  history("my-attendance-history", attendance, ["Date","Check-in","Check-out","Status"], r => [esc(r.attendance_date), esc(r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString() : "—"), esc(r.check_out_at ? new Date(r.check_out_at).toLocaleTimeString() : "—"), esc(r.status)], "No attendance records yet.");
  history("my-document-history", documents, ["Document","Type","Uploaded","Size"], r => [esc(r.file_name), esc(r.document_type), esc(new Date(r.created_at).toLocaleDateString()), `${Math.ceil(num(r.size_bytes)/1024)} KB`], "No documents uploaded yet.");
  history("my-visit-history", visits, ["Visited","Customer","Area","Purpose","Location"], r => [esc(new Date(r.visited_at).toLocaleString()), esc(r.customer_label || "—"), esc(r.area || "—"), esc(r.purpose || "—"), r.latitude == null ? "Not shared" : `${num(r.latitude).toFixed(4)}, ${num(r.longitude).toFixed(4)}`], "No customer visits recorded yet.");
}

function renderSalesmanDashboard() {
  const seller = own(), s = S();
  if (!seller) return head("My overview", "Your login is not linked to a salesman profile.") + '<section class="panel"><p class="notice">Please ask an administrator to link your login to your salesman profile.</p></section>';
  const sid = seller.id, orders = s.orders.filter(o => o.salesman_id === sid && o.status !== "cancelled" && !o.deleted_at);
  const todays = orders.filter(o => o.date === today()), month = orders.filter(o => String(o.date || "").startsWith(today().slice(0,7)));
  const movements = s.salesman_stock_movements.filter(m => m.salesman_id === sid);
  const held = visible(s.products).map(p => ({name:p.name, qty:heldStock(p.id, sid), product_id:p.id, unit:p.unit || "boxes", retail_paisa:p.retail_paisa})).filter(x=>x.qty>0);
  const collection = s.payments.filter(p => { const inv=s.invoices.find(i=>i.id===p.invoice_id); const order=inv&&s.orders.find(o=>o.id===inv.order_id); return order?.salesman_id===sid && (p.date===today() || p.created_at?.slice(0,10)===today()); }).reduce((n,p)=>n+num(p.amount_paisa),0);
  const target = targetRows().find(t=>t.id===sid);
  const ownCustomerIds = new Set(s.customers.filter(c=>c.salesman_id===sid).map(c=>c.id));
  const ownOutstanding = s.invoices.filter(i=>{const o=s.orders.find(x=>x.id===i.order_id);return o?.salesman_id===sid;}).reduce((n,i)=>n+Math.max(0,num(i.total_paisa)-s.payments.filter(p=>p.invoice_id===i.id).reduce((a,p)=>a+num(p.amount_paisa),0)),0);
  return head("My overview", `Welcome, ${seller.name}. This dashboard shows your own activity only.`, btn("Open my profile", "go-myprofile", "", "", "gold")) +
    `<div class="cards">${card("Today's sales",money(todays.reduce((n,o)=>n+num(o.total_paisa),0)),`${todays.length} order(s)`,true)}${card("This month's sales",money(month.reduce((n,o)=>n+num(o.total_paisa),0)),`${month.length} order(s)`)}${card("Today's collection",money(collection),"Payments linked to your sales")}${card("My customer outstanding",money(ownOutstanding),"Open invoice balances assigned to you")}${card("Stock in hand",held.reduce((n,x)=>n+x.qty,0).toFixed(2),"Boxes currently recorded against you")}${card("Monthly target",`${num(target?.achieved).toFixed(2)} / ${num(target?.monthly_target).toFixed(2)} cartons`,`${num(target?.percent).toFixed(1)}% achieved`)}</div>
    <section class="panel"><div class="panel-heading"><h2>My stock in hand</h2>${btn("View stock details","go-stock")}</div>${table(["Product","Balance (boxes)"],held.map(x=>[esc(x.name),x.qty.toFixed(2)]),"No stock currently recorded against your account.")}</section>
    <section class="panel"><div class="panel-heading"><h2>My latest sales</h2>${btn("View sales","go-myorders")}</div>${table(["Order","Date","Customer","Amount"],orders.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,8).map(o=>[esc(o.number),esc(o.date),esc(s.customers.find(c=>c.id===o.customer_id)?.name||"Customer"),money(o.total_paisa)]),"No sales recorded yet.")}</section>
    <section class="panel"><h2>Fieldwork shortcuts</h2><div class="actions">${btn("Attendance & customer visits","go-myprofile","","","gold")}${btn("Daily closing","go-closing")}${btn("Daily sales report","go-dsr")}</div></section>`;
}

function renderAdminMyProfile() {
  const current = user || {};
  const profile = S().profiles?.find((p) => String(p.id) === String(current.id)) || {};
  return head("My profile & fieldwork", "Administrator account details and a consolidated view of salesman attendance, documents, customer visits and profile photos.") +
    `<section class="panel"><div class="profile-hero"><div class="profile-avatar" id="admin-profile-avatar">♙</div><div><h2>${esc(current.name || profile.display_name || "Administrator")}</h2><p class="muted">${esc(current.email || "Email not available")}</p><p>Role: <b>Administrator</b></p><p class="muted">Account ID: ${esc(current.id || "—")}</p></div></div><div class="grid"><div class="field"><label for="admin-profile-photo">Upload / change administrator profile picture</label><input id="admin-profile-photo" type="file" accept="image/jpeg,image/png,image/webp"></div><button class="gold" data-act="admin-profile-photo-upload">Upload profile picture</button></div><p class="muted">Use a JPG, PNG or WebP image up to 5 MB. Your picture is private and visible to authorized users.</p><p class="muted">This page displays the signed-in administrator account. Salesman records and photos below are read-only and do not require the administrator to be linked to a salesman record.</p></section>
    <section class="panel"><div class="panel-heading"><h2>Salesman fieldwork & profile photos</h2><span class="muted">Admin view</span></div><div id="admin-fieldwork-data"><p class="muted">Loading attendance, documents, visits and profile photos…</p></div></section>`;
}

function renderMyProfile() {
  if (admin()) return renderAdminMyProfile();
  const seller = own();
  if (!seller) return head("My profile", "Your account is not linked to a salesman record.") + '<section class="panel"><p class="notice">Please ask an administrator to link your login to your salesman profile.</p></section>';
  const s = S(), sid = seller.id;
  const movements = s.salesman_stock_movements.filter(m => m.salesman_id === sid);
  const productRows = visible(s.products).map(p => {
    const qty = heldStock(p.id, sid);
    return qty ? [esc(p.name), qty.toFixed(2), esc(p.unit || "boxes")] : null;
  }).filter(Boolean);
  const orders = s.orders.filter(o => o.salesman_id === sid && o.status !== "cancelled" && !o.deleted_at);
  const todaySales = orders.filter(o => o.date === today()).reduce((n,o) => n + num(o.total_paisa), 0);
  const monthSales = orders.filter(o => String(o.date || "").startsWith(today().slice(0,7))).reduce((n,o) => n + num(o.total_paisa), 0);
  const target = targetRows().find(t => t.id === sid);
  return head("My profile & fieldwork", "Your personal performance, stock, attendance and customer visits.") +
    `<section class="panel"><div class="profile-hero"><div class="profile-avatar" id="profile-avatar">${seller.photo_url ? `<img src="${esc(seller.photo_url)}" alt="Your profile photo">` : "♙"}</div><div><h2>${esc(seller.name)}</h2><p class="muted">Employee ID: ${esc(seller.id)} · ${esc(seller.phone || "No phone added")}</p><p>${esc(seller.territory || seller.area || "Territory not assigned")}</p></div></div><div class="grid"><div class="field"><label for="profile-photo">Update profile photograph</label><input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp"></div><button class="gold" data-act="profile-photo-upload">Upload photo</button></div><p class="muted">Only your own profile can be updated. Documents are stored privately.</p></section>
    <div class="cards">${card("Today's sales", money(todaySales), "Your confirmed orders today")}${card("Sales this month", money(monthSales), "Your confirmed orders this month")}${card("Monthly target", `${num(target?.achieved).toFixed(2)} / ${num(target?.monthly_target).toFixed(2)} cartons`, `${num(target?.percent).toFixed(1)}% achieved`)}${card("Stock in hand", productRows.reduce((n,r)=>n+num(r[1]),0).toFixed(2), "Boxes across products")}</div>
    <section class="panel"><h2>My stock in hand</h2>${table(["Product","Balance","Unit"], productRows, "No stock is currently recorded against you.")}</section>
    <section class="panel"><h2>My employee documents</h2><p class="muted">Upload an ID or employment document. Files are private and visible only to you and authorized management.</p><div class="grid"><div class="field"><label for="employee-document-type">Document type</label><select id="employee-document-type"><option value="identity">Identity document</option><option value="employment">Employment document</option><option value="other">Other authorized document</option></select></div><div class="field"><label for="employee-document-file">Choose file</label><input id="employee-document-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></div></div><button class="gold" data-act="employee-document-upload">Upload document</button><div id="profile-upload-status" role="status"></div></section>
    <section class="panel"><h2>Attendance</h2><p>Record your attendance for today. Check-out is available after check-in.</p><div class="actions">${btn("Check in", "attendance-check-in", sid, "", "gold")}${btn("Check out", "attendance-check-out", sid)}</div><p class="muted">Check-in will request GPS permission to record your location when available. If you decline or GPS is unavailable, attendance can still be recorded without coordinates. Timestamps are recorded when online.</p><div id="my-attendance-history"><p class="muted">Loading your attendance history…</p></div></section>
    <section class="panel"><h2>Customer visit / area check-in</h2><p class="muted">Record a business visit and optionally attach GPS coordinates with your permission. Location is collected only when you press the button.</p><div class="grid">${field("Customer name or ID", "visit-customer", "")}${field("Area visited", "visit-area", seller.territory || seller.area || "")}${select("Visit purpose", "visit-purpose", ["Sales visit","Recovery","Order follow-up","Relationship visit","Other"], "Sales visit")}${area("Visit notes / outcome", "visit-notes", "")}</div><div class="actions">${btn("Save visit (without GPS)", "visit-save", sid)}${btn("Save visit with my location", "visit-save-location", sid, "", "gold")}</div><p class="muted">Location permission is optional. Denying GPS will not prevent a normal visit record.</p><div id="my-visit-history"><p class="muted">Loading your visit history…</p></div></section>
    <section class="panel"><h2>My uploaded documents</h2><div id="my-document-history"><p class="muted">Loading your document list…</p></div></section>`;
}

function targetRows() {
  const s = S(),
    start = monthStart(today());
  return visible(s.salesmen)
    .filter((salesman) => {
      const linkedRole = s.user_roles.find(
        (role) => role.user_id === salesman.user_id,
      )?.role;
      return !salesman.user_id || linkedRole === "salesman";
    })
    .map((x) => {
      const days = s.salesman_daily_targets.filter(
        (d) => d.salesman_id === x.id && d.date >= start && d.date <= today(),
      );
      const day = days.find((d) => d.date === today());
      const achieved = days.reduce((n, d) => n + num(d.achieved_cartons), 0);
      return { ...x, day, achieved, ...salary(x, achieved, s.settings) };
    })
    .sort((a, b) => b.percent - a.percent);
}
function overviewReport(state, from, to, salesmanId = "") {
  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1))
    days.push(dailySalesReport(state, date, salesmanId));
  const sum = (key) => days.reduce((total, report) => total + num(report[key]), 0);
  const last = days.at(-1) || dailySalesReport(state, to, salesmanId);
  const stockBySalesman = new Map();
  for (const report of days) {
    for (const row of report.stock_by_salesman || []) {
      const summary = stockBySalesman.get(row.salesman_id) || {
        salesman_id: row.salesman_id,
        closing_boxes: 0,
        issued_boxes: 0,
        returned_boxes: 0,
      };
      summary.issued_boxes += num(row.issued_boxes);
      summary.returned_boxes += num(row.returned_boxes);
      stockBySalesman.set(row.salesman_id, summary);
    }
  }
  for (const row of last.stock_by_salesman || []) {
    const summary = stockBySalesman.get(row.salesman_id);
    if (summary) summary.closing_boxes = num(row.closing_boxes);
  }
  return {
    days,
    orders: days.flatMap((report) => report.orders),
    sales_paisa: sum("sales_paisa"),
    collected_paisa: sum("collected_paisa"),
    previous_recovery_paisa: sum("previous_recovery_paisa"),
    new_credit_paisa: sum("new_credit_paisa"),
    expense_paisa: sum("expense_paisa"),
    outstanding_paisa: last.outstanding_paisa,
    overdue_paisa: last.overdue_paisa,
    stock_issued_boxes: sum("stock_issued_boxes"),
    stock_returned_boxes: sum("stock_returned_boxes"),
    stock_by_salesman: [...stockBySalesman.values()],
  };
}
function renderDashboard() {
  const s = S(),
    report = overviewReport(
      s,
      overviewFrom,
      overviewTo,
      admin() ? "" : own()?.id || "",
    ),
    p = admin() || can("pnl") ? profitLoss(
      s.orders,
      s.order_items,
      s.expenses,
      s.payments,
      s.invoices,
      overviewFrom,
      overviewTo,
    ) : null;
  const sales = report.sales_paisa,
    targets = targetRows(),
    companyTargetProgress = targetPerformance(
      s.orders,
      s.order_items,
      monthStart(today()),
      today(),
      user.id,
      own()?.id || "",
    ),
    companyMonthlyTarget = num(s.settings.company_monthly_target) || 2000,
    companySold = companyTargetProgress.achieved_cartons,
    salesmanSold = companyTargetProgress.salesman_cartons,
    managerExtra = companyTargetProgress.manager_direct_cartons,
    companyPct = (companySold / companyMonthlyTarget) * 100,
    directOrders = s.orders.filter(
      (o) =>
        o.status === "confirmed" &&
        !o.deleted_at &&
        !o.salesman_id &&
        o.date >= monthStart(today()) &&
        o.date <= today(),
    ),
    cartonsOf = (o) =>
      s.order_items
        .filter((i) => i.order_id === o.id)
        .reduce(
          (a, i) => a + Number(i.boxes || 0) / (Number(i.boxes_per_carton) || 1),
          0,
        ),
    myDirect = manager()
      ? directOrders.filter((o) => o.created_by === user.id)
      : directOrders,
    myCartons = myDirect.reduce((a, o) => a + cartonsOf(o), 0),
    myValue = myDirect.reduce((a, o) => a + num(o.total_paisa), 0),
    companyPanel = mgmt()
      ? `<section class="panel company-target"><div class="panel-heading"><h2>Company target · ${new Date(monthStart(today()) + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2><span class="muted">Month to date</span></div><div class="cards">${card("Company monthly target", `${companySold.toFixed(2)} / ${companyMonthlyTarget.toFixed(2)} cartons`, `${companyPct.toFixed(1)}% achieved · ${Math.max(0, companyMonthlyTarget - companySold).toFixed(2)} cartons remaining · salesmen ${salesmanSold.toFixed(2)} + manager ${managerExtra.toFixed(2)}${companySold >= companyMonthlyTarget ? " · TARGET CLOSED" : ""}`, true)}${card(manager() ? "Your achievement (your sales)" : "Manager direct sales", `${myCartons.toFixed(2)} cartons`, `${myDirect.length} orders · ${money(myValue)} · included in the company target and shown as manager achievement`, manager())}${card("Salesman sales", `${salesmanSold.toFixed(2)} cartons`, "Sum of all salesman achievements this month")}</div><div class="bar" role="img" aria-label="Company target ${companyPct.toFixed(1)} percent achieved"><span style="width:${Math.min(100, companyPct)}%"></span></div>${manager() ? `<h3 style="margin-top:18px">Your sales this month</h3>${table(["Order", "Date", "Customer", "Cartons", "Value"], myDirect.map((o) => [esc(o.number), esc(o.date), esc(customerName(o.customer_id)), cartonsOf(o).toFixed(2), money(num(o.total_paisa))]), "No sales of your own yet this month")}` : ""}<h3 style="margin-top:18px">Salesman contribution</h3>${table(["Salesman", "Achieved / target", "Status"], targets.filter((t) => t.active).map((t) => [esc(t.name), `${t.achieved.toFixed(2)} / ${t.monthly_target} cartons`, t.achieved >= t.monthly_target ? badge("Target closed", "green") : badge(`${(t.monthly_target - t.achieved).toFixed(2)} cartons to go`, "amber")]), "No active salesmen")}</section>`
      : "",
    todaysClosings = s.daily_closings.filter(
      (closing) =>
        closing.business_date === today() &&
        (mgmt() || closing.salesman_id === own()?.id),
    ),
    pendingClosings = todaysClosings.filter(
      (closing) => closing.status === "submitted",
    ).length,
    unsubmittedClosings = admin()
      ? Math.max(
          0,
          targets.filter((salesman) => salesman.active).length -
            todaysClosings.filter((closing) =>
              ["submitted", "approved"].includes(closing.status),
            ).length,
        )
      : own() &&
          !todaysClosings.some((closing) =>
            ["submitted", "approved"].includes(closing.status),
          )
        ? 1
        : 0;
  const low = visible(s.products).filter(
    (p) => balance(p.id, admin() ? null : own()?.id) <= num(s.settings.low_stock_boxes),
  );
  const exp = visible(s.products).filter((p) =>
    ["Expired", "≤30 days"].includes(expiryStatus(p.expiry_date)),
  );
  const dailyRows = report.days.map((day) => [
    esc(day.date),
    money(day.sales_paisa),
    money(day.collected_paisa),
    money(day.previous_recovery_paisa),
    money(day.new_credit_paisa),
    money(day.expense_paisa),
    `${day.stock_issued_boxes} / ${day.stock_returned_boxes} boxes`,
    btn("Details", "overview-day", day.date),
  ]);
  return (
          head(
            "Business overview",
            "Sales, collections and your team — all in one place.",
            btn("New quotation", "new-quote") +
              btn("+ New sale", "new-order", "", "", "gold"),
          ) +
          `${companyPanel}<section class="panel"><div class="filters"><div class="field"><label for="f-overview-from">From</label><input id="f-overview-from" type="date" value="${esc(overviewFrom)}"></div><div class="field"><label for="f-overview-to">To</label><input id="f-overview-to" type="date" value="${esc(overviewTo)}"></div><button data-act="apply-overview-range">Apply dates</button></div></section><div class="cards">${card("Sales in period", money(sales), `${report.orders.length} confirmed orders · ${overviewFrom} to ${overviewTo}`, true)}${card("Collections in period", money(report.collected_paisa), "All recorded payment methods")}${card("Previous debt recovered", money(report.previous_recovery_paisa), "Against invoices before their payment date")}${card("New credit issued", money(report.new_credit_paisa), "Period sales less payments on those invoices")}${card("Expenses in period", money(report.expense_paisa), "Recorded expenses")}${card("Customer outstanding", money(report.outstanding_paisa), "As of " + overviewTo)}${card("Overdue outstanding", money(report.overdue_paisa), "As of " + overviewTo)}${card("Stock issued", `${report.stock_issued_boxes} boxes`, `Issued ${overviewFrom} to ${overviewTo}`)}${card("Stock returned", `${report.stock_returned_boxes} boxes`, `Returned ${overviewFrom} to ${overviewTo}`)}${admin() ? card("Unsubmitted closings", unsubmittedClosings, "Active salesmen without a submitted close today") : ""}${admin() ? card("Closings awaiting approval", pendingClosings, "Submitted today") : ""}${p ? card("Profit in period", money(p.net), "Restricted management figure") : ""}</div><section class="panel"><div class="panel-heading"><h2>Daily activity</h2><span class="muted">Select a date for its DSR</span></div>${table(["Business date", "Sales", "Collection", "Previous recovery", "New credit", "Expenses", "Issued / returned", "Details"], dailyRows, "No activity in this date range")}</section><div class="two-col">${p ? `<section class="panel"><div class="panel-heading"><h2>Revenue & profit</h2><span class="muted">Selected period</span></div><div class="chart"><canvas id="revenue-chart" role="img" aria-label="Revenue, expenses and net profit for selected period"></canvas></div><div id="chart-data" class="muted"></div></section>` : ""}<section class="panel"><div class="panel-heading"><h2>Needs your attention</h2></div><p>${badge(low.length + " low-stock products", "amber")} ${btn("Review stock", "go-stock")}</p><p>${badge(exp.length + " expiring / expired", "red")}</p><hr><h3>Missed targets today</h3>${targets.filter((t) => num(t.day?.shortfall) > 0).map((t) => `<p><b>${esc(t.name)}</b><br><small>${num(t.day.shortfall).toFixed(2)} cartons remaining · ${num(t.day.achieved_cartons).toFixed(2)} achieved</small></p>`).join("") || '<p class="muted">No target shortfalls recorded.</p>'}</section></div><section class="panel"><div class="panel-heading"><h2>Team progress</h2>${btn("View team", "go-staff")}</div>${table(["Salesman", "Today achieved / target", "Month-to-date", "Achievement", ...(admin() || can("pnl") ? ["Projected salary"] : [])], targets.map((t) => [esc(t.name), `${num(t.day?.achieved_cartons).toFixed(2)} / ${num(t.day?.effective_target).toFixed(2)} cartons`, `${t.achieved.toFixed(2)} / ${t.monthly_target}`, `${t.percent.toFixed(1)}%<div class="bar"><span style="width:${Math.min(100, t.percent)}%"></span></div>`, ...(admin() || can("pnl") ? [money(t.total)] : [])]), "Create your first salesman")}</section>${stockOverview()}<section class="panel"><h2>Salesman stock held</h2>${table(["Salesman", "Held boxes", "Issued in period", "Returned in period"], report.stock_by_salesman?.map((row) => [esc(salesmanName(row.salesman_id)), row.closing_boxes, row.issued_boxes, row.returned_boxes]) || [], "No salesman stock issues in this period")}</section>`
  );
}
function renderDailyReport() {
  const s = S(),
    owner = own(),
    selectedSalesman = admin() ? reportSalesman : owner?.id || "",
    report = dailySalesReport(s, reportDate, selectedSalesman),
    orderByInvoice = (payment) => {
      const invoice = s.invoices.find((row) => row.id === payment.invoice_id);
      return {
        invoice,
        order: invoice && s.orders.find((row) => row.id === invoice.order_id),
      };
    },
    salesmanFilter = admin()
      ? select(
          "Salesman",
          "dsr_salesman",
          [["", "All salesmen"], ...visible(s.salesmen).map((x) => [x.id, x.name])],
          reportSalesman,
        )
      : "";
  const productRows = report.products.map((row) => [
    esc(row.product_name),
    row.boxes,
    money(row.amount_paisa),
  ]);
  const customerRows = report.customers.map((row) => [
    esc(s.customers.find((customer) => customer.id === row.customer_id)?.name || row.customer_id),
    money(row.sales_paisa || 0),
    money(row.collected_paisa || 0),
  ]);
  const paymentRows = report.payments.map((payment) => {
    const { invoice, order } = orderByInvoice(payment);
    return [
      esc(payment.transaction_id),
      esc(s.customers.find((customer) => customer.id === order?.customer_id)?.name || "Unknown customer"),
      esc(invoice?.number || ""),
      payment.method === "Cash" ? "Cash" : esc(payment.method),
      order?.date < reportDate ? "Previous invoice recovery" : "Current-day invoice",
      money(payment.amount_paisa),
    ];
  });
  return head(
    "Daily Sales Report",
    "Sales, invoice payments, older-debt recovery and expenses from recorded transactions.",
    btn("Export CSV", "dsr-csv") + btn("Print", "dsr-print"),
  ) + `<section class="panel"><div class="filters"><div class="field"><label for="f-dsr_date">Business date</label><input id="f-dsr_date" type="date" value="${esc(reportDate)}"></div>${salesmanFilter}</div><p class="muted">Collections are counted on payment date and classified by the date of the invoice they settle. Older-invoice recovery is never included in new sales.</p></section><div class="cards">${card("Sales", money(report.sales_paisa), "Confirmed invoices dated " + report.date, true)}${card("Collection", money(report.collected_paisa), "Payments received on report date")}${card("Previous recovery", money(report.previous_recovery_paisa), "Against invoices dated before " + report.date)}${card("New credit", money(report.new_credit_paisa), "Unpaid part of report-date sales")}${card("Cash collected", money(report.cash_collected_paisa), "Cash-method receipts only")}${card("Expenses", money(report.expense_paisa), report.expenses.length + " recorded entries")}${card("Outstanding", money(report.outstanding_paisa), "As of report date")}${card("Overdue", money(report.overdue_paisa), "Past-due balance as of report date")}</div><section class="panel"><h2>Product-wise sales</h2>${table(["Product", "Boxes sold", "Sales value"], productRows, "No confirmed sales for this date")}</section><section class="panel"><h2>Salesman stock reconciliation</h2>${table(["Product", "Opening", "Issued", "Sold", "Saleable return", "Damaged/expired", "Closing"], report.stock_by_product.map((row) => [esc(row.product_name), row.opening_boxes, row.issued_boxes, row.sold_boxes, row.returned_boxes, row.damaged_boxes, row.closing_boxes]), "No salesman stock ledger for this date")}</section><section class="panel"><h2>Customer activity</h2>${table(["Customer", "Sales", "Collected today"], customerRows, "No customer activity for this date")}</section><section class="panel"><h2>Payment allocation</h2>${table(["Receipt", "Customer", "Invoice", "Method", "Allocation", "Amount"], paymentRows, "No payments recorded for this date")}</section><section class="panel"><h2>Expenses</h2>${table(["Category", "Description", "Salesman", "Amount"], report.expenses.map((expense) => [esc(expense.category), esc(expense.description), esc(s.salesmen.find((row) => row.id === expense.salesman_id)?.name || "Business"), money(expense.amount_paisa)]), "No expenses recorded for this date")}</section>`;
}
function expectedClosingCash(salesmanId, date, opening, handedOver = 0) {
  const collected = S().payments
    .filter((payment) => {
      const invoice = S().invoices.find((row) => row.id === payment.invoice_id);
      const order = invoice && S().orders.find((row) => row.id === invoice.order_id);
      return (
        order?.salesman_id === salesmanId &&
        order.status === "confirmed" &&
        payment.date === date &&
        payment.method === "Cash" &&
        !payment.voided_at
      );
    })
    .reduce((sum, payment) => sum + Number(payment.amount_paisa), 0);
  const expenses = S().expenses
    .filter(
      (expense) =>
        expense.salesman_id === salesmanId &&
        expense.date === date &&
        expense.method === "Cash" &&
        !expense.deleted_at,
    )
    .reduce((sum, expense) => sum + Number(expense.amount_paisa), 0);
  return Number(opening || 0) + collected - expenses - Number(handedOver || 0);
}
function expectedClosingStock(salesmanId, date) {
  return Object.fromEntries(
    [...new Set(S().salesman_stock_movements.map((row) => row.product_id))]
      .map((productId) => [
        productId,
        S().salesman_stock_movements
          .filter(
            (movement) =>
              movement.salesman_id === salesmanId &&
              movement.product_id === productId &&
              movement.date <= date,
          )
          .reduce((sum, movement) => sum + Number(movement.boxes), 0),
      ])
      .filter(([, boxes]) => boxes !== 0),
  );
}
function refreshClosingEstimate(form, resetStock = false) {
  const salesmanId = form.elements.closing_salesman?.value || own()?.id || "";
  const date = form.elements.date.value || today();
  if (resetStock) {
    form.elements.opening_cash.value = (
      openingCashFor(salesmanId, date) / 100
    ).toFixed(2);
    $("closing-stock-fields").innerHTML =
      closingStockFields(salesmanId, date) ||
      '<p class="muted">No salesman stock movements exist for this account.</p>';
  }
  const expected = expectedClosingCash(
    salesmanId,
    date,
    paisa(form.elements.opening_cash.value),
    paisa(form.elements.cash_handed_over.value),
  );
  $("closing-cash-estimate").textContent =
    "Expected cash: " + money(expected);
}
function renderDailyClosing() {
  const s = S(),
    salesmanId = own()?.id,
    rows = s.daily_closings
      .filter(
        (closing) =>
          canViewAllClosings() || closing.salesman_id === salesmanId,
      )
      .sort((a, b) => b.business_date.localeCompare(a.business_date)),
    pending = rows.filter((row) => row.status === "submitted").length,
    discrepancies = rows.filter(
      (row) =>
        Number(row.cash_variance_paisa) !== 0 ||
        Object.keys(row.stock_variances || {}).length > 0,
    ).length;
  return (
    head(
      "Daily closing",
      "Reconcile collected cash and salesman-held stock before management approval.",
      admin() || salesmanId ? btn("Submit daily closing", "new-closing", "", "", "gold") : "",
    ) +
    `<div class="cards">${card("Pending approval", pending, "Submitted closings")}${card("Discrepancies", discrepancies, "Cash or physical stock variance")}${card("Salesmen", visible(s.salesmen).length, "Visible to this account")}</div><section class="panel"><h2>Closing register</h2>${table(["Date", "Salesman", "Expected cash", "Counted cash", "Variance", ...CLOSING_BALANCE_FIELDS.map(([, label]) => label), "Stock variances", "Status", "Action"], rows.map((closing) => [esc(closing.business_date), esc(salesmanName(closing.salesman_id)), money(closing.expected_cash_paisa), money(closing.actual_cash_paisa), money(closing.cash_variance_paisa), ...CLOSING_BALANCE_FIELDS.map(([name]) => money(closing[name + "_paisa"] || 0)), Object.keys(closing.stock_variances || {}).length, badge(closing.status), `${esc(closing.reason || closing.decision_reason || "")}${admin() && closing.status === "submitted" ? `<div class="actions">${btn("Approve", "approve-closing", closing.id)}${btn("Reject", "reject-closing", closing.id, "", "danger")}</div>` : admin() && ["approved", "rejected"].includes(closing.status) ? `<div class="actions">${btn("Reopen", "reopen-closing", closing.id, "", "danger")}</div>` : ""}`]), "No daily closings submitted")}</section>`
  );
}
function dsrClosingSection() {
  const s = S(),
    selectedSalesman = admin() ? reportSalesman : own()?.id || "",
    salesmen = selectedSalesman
      ? visible(s.salesmen).filter((row) => row.id === selectedSalesman)
      : visible(s.salesmen),
    rows = salesmen.map((salesman) => {
      const closing = s.daily_closings.find(
        (row) =>
          row.salesman_id === salesman.id &&
          row.business_date === reportDate,
      );
      return [
        esc(salesman.name),
        closing ? money(closing.opening_cash_paisa) : "—",
        closing ? money(closing.cash_received_paisa) : "—",
        closing ? money(closing.cash_expenses_paisa) : "—",
        closing ? money(closing.cash_handed_over_paisa) : "—",
        closing ? money(closing.expected_cash_paisa) : "—",
        closing ? money(closing.actual_cash_paisa) : "—",
        closing ? money(closing.cash_variance_paisa) : "—",
        ...CLOSING_BALANCE_FIELDS.map(([name]) =>
          closing ? money(closing[name + "_paisa"] || 0) : "—",
        ),
        closing ? Object.keys(closing.stock_variances || {}).length : "—",
        closing ? badge(closing.status) : badge("Not submitted", "amber"),
        esc(closing?.reason || closing?.decision_reason || ""),
      ];
    });
  return `<section class="panel"><h2>Daily cash and closing status</h2>${table(["Salesman", "Opening cash", "Cash received", "Cash expenses", "Handed over", "Expected", "Counted", "Variance", ...CLOSING_BALANCE_FIELDS.map(([, label]) => label), "Stock variances", "Status", "Reason"], rows, "No salesman records available")}</section>`;
}
function stockFamilyName(name) {
  const normalized = String(name || "").trim().replace(/\s+/g, " ");
  const separated = normalized.match(/^(.+?)\s+(?:-|–|—|\||:|\/)\s+.+$/);
  if (separated) return separated[1].trim();
  const parenthetical = normalized.match(/^(.+?)\s*\([^)]*\)\s*$/);
  if (parenthetical) return parenthetical[1].trim();
  const words = normalized.split(" ");
  return words.length > 2 ? words.slice(0, 2).join(" ") : normalized;
}
function stockOverview() {
  const products = [...visible(S().products)].sort((a, b) =>
    String(a.name).localeCompare(String(b.name)),
  );
  const families = new Map();
  let totalBoxes = 0,
    totalCartons = 0,
    totalLoose = 0;
  for (const product of products) {
    const boxes = balance(product.id, admin() ? null : own()?.id);
    const per = num(product.boxes_per_carton) || 1;
    const cartons = Math.floor(boxes / per);
    const loose = boxes % per;
    const family = stockFamilyName(product.name) || "Other products";
    const key = family.toLocaleLowerCase();
    const group = families.get(key) || { name: family, products: [], cartons: 0, loose: 0, boxes: 0 };
    group.products.push({ product, boxes, per, cartons, loose });
    group.cartons += cartons;
    group.loose += loose;
    group.boxes += boxes;
    families.set(key, group);
    totalBoxes += boxes;
    totalCartons += cartons;
    totalLoose += loose;
  }
  const cards = [...families.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => `<article class="stock-family-card"><header class="stock-family-heading"><div><h3>${esc(group.name)}</h3><small>${group.products.length} product${group.products.length === 1 ? "" : "s"}</small></div><b class="stock-family-units">${group.boxes.toLocaleString()} boxes</b></header><div class="stock-family-totals"><div><b>${group.cartons.toLocaleString()}</b><span>cartons</span></div><div><b>${group.loose.toLocaleString()}</b><span>loose boxes</span></div><div><b>${group.boxes.toLocaleString()}</b><span>total boxes</span></div></div><div class="stock-family-products">${group.products.map(({ product, boxes, per, cartons, loose }) => `<div class="stock-family-product"><div><b>${esc(product.name)}</b><small>${per} boxes / carton</small></div><div><b>${cartons} ct · ${loose} loose</b><small>${boxes.toLocaleString()} boxes</small></div></div>`).join("")}</div></article>`)
    .join("");
  return `<section class="panel"><div class="panel-heading"><h2>Stock by candy</h2><span class="muted">${products.length} products · ${totalCartons} cartons · ${totalLoose} loose boxes · ${totalBoxes} boxes</span></div>${cards ? `<div class="stock-family-grid">${cards}</div>` : '<div class="empty"><h3>No products yet</h3></div>'}</section>`;
}
function renderDocs(quote) {
  const s = S(),
    rows = visible(s[quote ? "quotations" : "orders"])
      .filter((d) =>
        (d.number + " " + customerName(d.customer_id))
          .toLowerCase()
          .includes(filter.search.toLowerCase()),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  return (
    head(
      quote ? "Quotations" : "Sales orders",
      quote
        ? "Create proposals, track acceptance and convert to sales."
        : "Confirmed sales update stock, invoices and team targets.",
      btn(
        quote ? "+ New quotation" : "+ New sale",
        quote ? "new-quote" : "new-order",
        "",
        "",
        "gold",
      ),
    ) +
    `<section class="panel"><div class="filters">${field("Search customer or document", "search", filter.search, "search", 'data-filter="search"')}</div>${table(
      [
        "Document",
        "Customer",
        "Date",
        "Salesman",
        "Amount",
        "Payment",
        "Status",
        "Actions",
      ],
      rows.map((d) => [
        `<b>${esc(d.number)}</b>${quote ? "<small>Revision " + d.revision + "</small>" : ""}`,
        esc(customerName(d.customer_id)),
        esc(d.date),
        esc(salesmanName(d.salesman_id)),
        money(d.total_paisa),
        quote ? "—" : (() => { const invoice = s.invoices.find(i => i.order_id === d.id); const pay = invoice ? invoiceState(invoice, s.payments) : {status:"UNPAID"}; return badge(d.status === "cancelled" ? "CANCELLED" : pay.status); })(),
        badge(d.status),
        `<div class="actions">${btn("View", quote ? "view-quote" : "view-order", d.id)}${(!quote && d.status === "confirmed") || (quote && ["Draft", "Sent"].includes(d.status)) ? btn("Edit", quote ? "edit-quote" : "edit-order", d.id) : ""}${!quote && d.status === "confirmed" && (()=>{const inv=s.invoices.find(i=>i.order_id===d.id);return inv && invoiceState(inv,s.payments).balance>0 && (admin() || s.user_permissions.some(p=>p.user_id===user.id&&p.section==="invoices"&&p.can_create)) ? btn("Receive payment","add-payment",inv.id) : ""})()}${quote && !["Converted", "Expired", "Rejected"].includes(d.status) ? btn("Convert", "convert", d.id) : ""}${quote && ["Draft", "Sent"].includes(d.status) ? btn("Status", "quote-status", d.id) : ""}${admin() ? btn(quote ? "Delete" : "Cancel", quote ? "delete-quote" : "cancel-order", d.id, "", "danger") : ""}</div>`,
      ]),
    )}</section>`
  );
}

const CASHBOOK_DEFAULT_ACCOUNTS = [
  { account_key: "cash_hand", label: "Cash in Hand", account_type: "cash", opening_balance_paisa: 0, active: true },
  { account_key: "bank_default", label: "Cash in Bank — Default account", account_type: "bank", payment_method: "Bank", opening_balance_paisa: 0, active: true },
  { account_key: "easypaisa", label: "EasyPaisa", account_type: "wallet", payment_method: "Easypaisa", opening_balance_paisa: 0, active: true },
  { account_key: "jazzcash", label: "JazzCash", account_type: "wallet", payment_method: "JazzCash", opening_balance_paisa: 0, active: true },
  { account_key: "market_credit", label: "Market Credit — Receivables", account_type: "receivable", opening_balance_paisa: 0, active: true },
];
let cashbookDate = today();
function cashbookMethodKey(method, salesmanId = "") {
  const m = /easypaisa/i.test(method || "") ? "easypaisa" : /jazzcash/i.test(method || "") ? "jazzcash" : /bank|cheque/i.test(method || "") ? "bank" : "cash";
  if (salesmanId) return `salesman:${salesmanId}:${m}`;
  return ({ cash: "cash_hand", bank: "bank_default", easypaisa: "easypaisa", jazzcash: "jazzcash" })[m];
}
function cashbookData() {
  const s = S();
  let accounts = s.cashbook_loaded ? s.cashbook_accounts.filter(a => a.active) : user?.practice
    ? [...CASHBOOK_DEFAULT_ACCOUNTS.map(a=>({...a,...(s.cashbook_accounts||[]).find(x=>x.account_key===a.account_key)})), ...(s.cashbook_accounts||[]).filter(a=>!CASHBOOK_DEFAULT_ACCOUNTS.some(d=>d.account_key===a.account_key))]
    : [...CASHBOOK_DEFAULT_ACCOUNTS];
  let entries = s.cashbook_loaded ? s.cashbook_entries : [];
  if (!s.cashbook_loaded && user?.practice) {
    // Practice mode derives an explicitly local preview from the same records users enter.
    const addAccount = (key, label, type, method, salesman_id = null) => {
      if (!accounts.some(a => a.account_key === key)) accounts.push({ account_key:key,label,account_type:type,payment_method:method,salesman_id,opening_balance_paisa:0,active:true });
    };
    const add = (key, tx, date, amount, entry_type, source_table, source_id, description, salesman_id = null) => {
      entries.push({ id:`local:${key}`,posting_key:key,transaction_id:tx,business_date:date,account_key:key.split("|")[0],amount_paisa:amount,entry_type,source_table,source_id,description,salesman_id });
    };
    entries = [...(s.cashbook_entries || [])];
    for (const inv of s.invoices) {
      const order = s.orders.find(o => o.id === inv.order_id);
      if (!order || order.status !== "confirmed") continue;
      add("market_credit","Market Credit","receivable",null);
      entries.push({posting_key:`local:invoice:${inv.id}`,transaction_id:`INV-${inv.id}`,business_date:order.date,account_key:"market_credit",amount_paisa:num(inv.total_paisa),entry_type:"receivable",source_table:"invoices",source_id:inv.id,description:"Invoice receivable",salesman_id:order.salesman_id});
    }
    for (const p of s.payments.filter(x => !x.voided_at)) {
      const inv = s.invoices.find(i => i.id === p.invoice_id), order = inv && s.orders.find(o => o.id === inv.order_id);
      if (!inv || !order || order.status !== "confirmed") continue;
      const key = p.cashbook_account_key || cashbookMethodKey(p.method, order.salesman_id);
      const seller = order.salesman_id && s.salesmen.find(x => x.id === order.salesman_id);
      const labels = {cash_hand:"Cash in Hand",bank_default:"Cash in Bank — Default account",easypaisa:"EasyPaisa",jazzcash:"JazzCash"};
      addAccount(key, seller ? `Salesman Collection — ${seller.name} (${p.method})` : (labels[key] || key), seller ? "salesman" : (key === "bank_default" ? "bank" : key === "cash_hand" ? "cash" : "wallet"), p.method, order.salesman_id || null);
      entries.push({posting_key:`local:payment:${p.id}:receipt`,transaction_id:p.transaction_id,business_date:p.date,account_key:key,amount_paisa:num(p.amount_paisa),entry_type:"receipt",source_table:"payments",source_id:p.id,description:`Payment received — ${p.method}`,salesman_id:order.salesman_id});
      entries.push({posting_key:`local:payment:${p.id}:receivable`,transaction_id:p.transaction_id,business_date:p.date,account_key:"market_credit",amount_paisa:-num(p.amount_paisa),entry_type:"receivable",source_table:"payments",source_id:p.id,description:"Receivable recovered",salesman_id:order.salesman_id});
    }
    for (const e of s.expenses.filter(x => !x.deleted_at)) {
      const key = cashbookMethodKey(e.method, e.salesman_id);
      const seller = e.salesman_id && s.salesmen.find(x => x.id === e.salesman_id);
      const labels = {cash_hand:"Cash in Hand",bank_default:"Cash in Bank — Default account",easypaisa:"EasyPaisa",jazzcash:"JazzCash"};
      addAccount(key, seller ? `Salesman Collection — ${seller.name} (${e.method})` : (labels[key] || key), seller ? "salesman" : (key === "bank_default" ? "bank" : key === "cash_hand" ? "cash" : "wallet"), e.method, e.salesman_id || null);
      entries.push({posting_key:`local:expense:${e.id}`,transaction_id:e.id,business_date:e.date,account_key:key,amount_paisa:-num(e.amount_paisa),entry_type:"expense",source_table:"expenses",source_id:e.id,description:`Expense — ${e.category}`,salesman_id:e.salesman_id});
    }
  }
  return { accounts, entries };
}
const cashbookAccountOpening = (account, date) => (!account.created_at || date >= String(account.created_at).slice(0,10)) ? num(account.opening_balance_paisa) : 0;
function renderCashBook() {
  const s = S(), data = cashbookData(), date = cashbookDate || today();
  const allowedAccounts = data.accounts.filter(a => mgmt() || !a.salesman_id || a.salesman_id === own()?.id);
  const relevantEntries = data.entries.filter(e => mgmt() || !e.salesman_id || e.salesman_id === own()?.id);
  const amount = (key, pred = () => true) => relevantEntries.filter(e => e.account_key === key && pred(e)).reduce((sum,e) => sum + num(e.amount_paisa),0);
  const before = e => e.business_date < date;
  const onDay = e => e.business_date === date;
  const isLiquid = a => ["cash","bank","wallet","salesman"].includes(a.account_type);
  const cards = allowedAccounts.map(a => {
    const opening = cashbookAccountOpening(a,date) + amount(a.account_key,before);
    const dayEntries = relevantEntries.filter(e => e.account_key === a.account_key && onDay(e));
    const received = dayEntries.filter(e => num(e.amount_paisa)>0 && !["transfer_in","adjustment","reversal"].includes(e.entry_type)).reduce((sum,e)=>sum+num(e.amount_paisa),0);
    const paid = -dayEntries.filter(e => num(e.amount_paisa)<0 && !["transfer_out","adjustment","reversal"].includes(e.entry_type)).reduce((sum,e)=>sum+num(e.amount_paisa),0);
    const transferIn = dayEntries.filter(e => e.entry_type==="transfer_in").reduce((sum,e)=>sum+num(e.amount_paisa),0);
    const transferOut = -dayEntries.filter(e => e.entry_type==="transfer_out").reduce((sum,e)=>sum+num(e.amount_paisa),0);
    const closing = opening + dayEntries.reduce((sum,e)=>sum+num(e.amount_paisa),0);
    return {a,opening,received,paid,transferIn,transferOut,closing};
  });
  const liquid = cards.filter(x=>isLiquid(x.a)).reduce((sum,x)=>sum+x.closing,0);
  const market = cards.filter(x=>x.a.account_type==="receivable").reduce((sum,x)=>sum+x.closing,0);
  const accountOptions = allowedAccounts.map(a=>[a.account_key,a.label]);
  const accountLabel = key => data.accounts.find(a=>a.account_key===key)?.label || CASHBOOK_DEFAULT_ACCOUNTS.find(a=>a.account_key===key)?.label || key;
  const transactionRows = relevantEntries.filter(e=>e.business_date===date).sort((a,b)=>String(b.created_at||b.business_date).localeCompare(String(a.created_at||a.business_date))).map(e=>[
    esc(e.business_date), esc(e.reference || e.transaction_id || "—"), esc(e.description || e.entry_type), esc(accountLabel(e.account_key)), `<span class="${num(e.amount_paisa)<0?"negative":"positive"}">${num(e.amount_paisa)<0?"−":"+"}${money(Math.abs(num(e.amount_paisa)))}</span>`, esc(e.entry_type.replaceAll("_"," ")) + (e.pending_sync ? ` ${badge("Pending sync","amber")}` : ""), esc(e.source_table || "—")
  ]);
  const closings = (s.cashbook_daily_closings || []).filter(c => c.business_date === date && (mgmt() || allowedAccounts.some(a=>a.account_key===c.account_key)));
  const allCloseAccounts = allowedAccounts.filter(a => a.account_type !== "receivable" && (mgmt() || (a.salesman_id && a.salesman_id === own()?.id)));
  const closeAccounts = allCloseAccounts.filter(a=>!(s.cashbook_daily_closings||[]).some(c=>c.business_date===date && c.account_key===a.account_key && ["submitted","approved"].includes(c.status)));
  const prevDate = addDays(date,-1);
  const priorApproved = (s.cashbook_daily_closings || []).filter(c=>c.business_date===prevDate && c.status==="approved");
  const missingPriorClose = allCloseAccounts.some(a=>!priorApproved.some(c=>c.account_key===a.account_key));
  const priorWarning = missingPriorClose ? `<div class="notice">No approved closing was found for ${esc(prevDate)} for every account visible here. Today's opening is calculated from ledger entries, and the previous closing is not marked verified.</div>` : "";
  const pendingNotice = relevantEntries.some(e=>e.pending_sync) ? `<div class="notice">Some entries are <b>Pending sync</b>. They are local/unconfirmed and may change if the server rejects them. Sync before finalizing a daily closing.</div>` : "";
  const closeForm = closeAccounts.length && (s.cashbook_loaded || user?.practice) ? `<section class="panel"><h2>Verify actual closing balances</h2><p class="muted">Enter the amount physically counted or confirmed for each account. The system records expected balance, actual balance and variance separately. Any difference requires a reason and management approval before an adjustment is posted.</p><form id="cashbook-form" data-kind="close">${field("Business date","date",date,"date","required")}<div class="grid">${closeAccounts.map(a=>{const prior=closings.find(c=>c.account_key===a.account_key);return field(`Actual count — ${esc(a.label)}`,"actual_"+a.account_key,prior ? num(prior.actual_balance_paisa)/100 : "","number",`min="0" step="0.01" required ${prior?.status==="approved"?'readonly':''}`)}).join("")}</div>${area("Notes / variance reason (required if any difference)","notes",closings[0]?.notes||"")}<div class="actions"><button type="submit" class="gold">Submit daily closing</button></div></form></section>` : "";
  const closeRows = closings.map(c=>[esc(allowedAccounts.find(a=>a.account_key===c.account_key)?.label || c.account_key),money(c.expected_balance_paisa),money(c.actual_balance_paisa),`<span class="${num(c.variance_paisa)===0?"positive":"negative"}">${money(c.variance_paisa)}</span>`,badge(c.status + (c.pending_sync ? " · Pending sync" : ""),c.status==="approved"?"green":"amber"),esc(c.notes||"—"),c.submitted_by===user.id?"You":esc(String(c.submitted_by||"—")),mgmt() && c.status!=="approved" ? btn("Approve & reconcile","cashbook-close-approve",c.id,"","gold") : "—"]);
  const migrationNotice = !s.cashbook_loaded && !user?.practice
    ? `<div class="notice danger"><b>Cash & Bank Book migration required.</b> This view is not yet connected to the authoritative ledger. Apply <code>supabase/cash_bank_book.sql</code> after the existing schema and operational migrations, then refresh. ${esc(s.cashbook_error || "")}</div>`
    : user?.practice ? `<div class="notice">Practice mode: balances are a local preview derived from sample transactions. They are not connected to a live bank or Supabase ledger.</div>` : "";
  const canWrite = mgmt() && !user?.practice && s.cashbook_loaded;
  const actions = `${canWrite ? btn("Transfer between accounts","cashbook-transfer","","","gold")+btn("Record adjustment","cashbook-adjust")+(admin()?btn("Add bank / wallet account","cashbook-add-account"):"") : ""}${user?.role==="salesman" && s.cashbook_loaded ? btn("Hand over cash","cashbook-handover","","","gold") : ""}${btn("Export CSV","cashbook-csv")}${btn("Print","cashbook-print")}`;
  return head("5. Cash & Bank Book","Know exactly how much money is held in each account, including salesman-held collections and market credit.",actions)
    + migrationNotice
    + priorWarning
    + pendingNotice
    + `<section class="panel"><div class="filters">${field("Business date","cashbook-date",date,"date",'data-cashbook-date="true"')}${btn("Today","cashbook-today")}</div>
      <div class="cashbook-summary-grid"><article class="cashbook-summary"><span>Liquid funds at selected-date close</span><b>${money(liquid)}</b><small>Includes salesman-held collections once; excludes market credit</small></article><article class="cashbook-summary"><span>Market Credit outstanding</span><b>${money(market)}</b><small>Receivables only — not money received</small></article><article class="cashbook-summary"><span>Accounts tracked</span><b>${allowedAccounts.length}</b><small>Opening and closing calculated from ledger movements</small></article></div>
      <h2>Account balances · ${esc(date)}</h2>${table(["Account","Opening","Increases / receipts","Decreases / recoveries","Transfers in","Transfers out","Expected closing"],cards.map(x=>[esc(x.a.label),money(cashbookAccountOpening(x.a,date)+amount(x.a.account_key,before)),money(x.received),money(x.paid),money(x.transferIn),money(x.transferOut),`<b>${money(x.closing)}</b>`]),"No accounts available")}
      <p class="muted">Expected closing = opening + signed receipts/payments + transfers. A closing count is a separate verification and must not overwrite this calculated balance.</p>
      <h2>Transactions for ${esc(date)}</h2>${table(["Date","Reference","Description","Account","Amount","Type","Source"],transactionRows,"No ledger transactions for this date")}</section>
      ${closeForm}
      <section class="panel"><h2>Daily closing register · ${esc(date)}</h2>${table(["Account","Expected","Actual counted","Variance","Status","Notes","Submitted by","Action"],closeRows,"No daily closing submitted for this date")}</section>
      ${canWrite ? `<section class="panel"><h2>Salesman stock and cash closing</h2><p>Use Daily closing for salesman stock reconciliation and the existing cash-count workflow. Cash & Bank Book closing adjustments are only posted after management approval.</p><div class="actions">${btn("Open Daily closing","go-closing")}</div></section>` : ""}`;
}

function renderInvoices() {
  const s = S();
  return (
    head(
      "Invoices & payments",
      "Record collections and keep every receipt against its invoice.",
    ) +
    `<section class="panel">${table(
      ["Invoice", "Customer", "Total", "Paid", "Balance", "Status", "Actions"],
      s.invoices
        .map((i) => {
          const o = s.orders.find((o) => o.id === i.order_id);
          if (!o) return null;
          const p = invoiceState(i, s.payments);
          if (o.status === "cancelled") p.balance = 0;
          return [
            `<b>${esc(i.number)}</b><small>${esc(o.date)}</small>`,
            esc(customerName(o.customer_id)),
            money(i.total_paisa),
            money(p.paid),
            money(p.balance) +
              (p.credit ? "<small>Credit " + money(p.credit) + "</small>" : ""),
            badge(o.status === "cancelled" ? "Cancelled" : p.status),
            `<div class="actions">${btn("View", "view-order", o.id)}${o.status === "confirmed" && (admin() || s.user_permissions.some((p) => p.user_id === user.id && p.section === "invoices" && p.can_create)) ? btn("+ Payment", "add-payment", i.id) : ""}${admin() ? btn("History", "payment-history", i.id) : ""}</div>`,
          ];
        })
        .filter(Boolean),
    )}</section>`
  );
}
function renderLedger() {
  const s = S();
  const rows = visible(s.customers).map((c) => {
    const invoices = s.invoices.filter((i) =>
      s.orders.some(
        (o) =>
          o.id === i.order_id &&
          o.customer_id === c.id &&
          o.status === "confirmed",
      ),
    );
    let b = [0, 0, 0],
      paid = 0,
      total = 0,
      credit = 0;
    for (const i of invoices) {
      const o = s.orders.find((o) => o.id === i.order_id),
        p = invoiceState(i, s.payments),
        days = Math.max(
          0,
          Math.floor((new Date(today()) - new Date(o.date)) / 86400000),
        );
      b[days <= 7 ? 0 : days <= 30 ? 1 : 2] += p.balance;
      paid += p.paid;
      total += num(i.total_paisa);
      credit += p.credit;
    }
    return [
      esc(c.name) + "<small>" + esc(c.phone) + "</small>",
      money(total),
      money(paid),
      money(b.reduce((a, b) => a + b, 0)),
      money(b[0]),
      money(b[1]),
      money(b[2]),
      credit ? money(credit) : "—",
      btn("Ledger", "ledger-detail", c.id),
    ];
  });
  return (
    head(
      "Customer ledger",
      "Invoice aging by invoice date: 0–7, 8–30 and over 30 days.",
      btn("+ Customer", "add-customer", "", "", "gold"),
    ) +
    `<section class="panel">${table(["Customer", "Invoiced", "Collected", "Outstanding", "0–7 days", "8–30 days", "30+ days", "Credit", "Details"], rows)}</section>`
  );
}
function renderStock() {
  const s = S(),
    sellerRows = new Map();
  for (const movement of s.salesman_stock_movements) {
    const key = movement.salesman_id + ":" + movement.product_id;
    const row = sellerRows.get(key) || {
      salesman_id: movement.salesman_id,
      product_id: movement.product_id,
      boxes: 0,
    };
    row.boxes += Number(movement.boxes);
    sellerRows.set(key, row);
  }
  const actions =
    (admin() ? btn("+ Warehouse movement", "add-stock", "", "", "gold") : "") +
    (canStockWrite() ? btn("Issue to salesman", "stock-issue", "", "", "gold") : "") +
    (admin() || own() || canStockWrite()
      ? btn("Receive salesman return", "stock-return")
      : "");
  return (
    head(
      "Stock & expiry",
      "Warehouse stock and salesman-held stock are calculated from traceable movements.",
      actions,
    ) +
    `<section class="panel">${table(
      [
        "Product",
        "Balance boxes",
        "Cartons + boxes",
        "Low stock",
        "Expiry",
        "Status",
      ],
      visible(s.products).filter(p => user?.role !== "salesman" || heldStock(p.id, own()?.id) > 0).map((p) => {
        const b = user?.role === "salesman" ? heldStock(p.id, own()?.id) : balance(p.id);
        return [
          esc(p.name) + "<small>" + esc(p.id) + "</small>",
          b,
          `${Math.floor(b / p.boxes_per_carton)} ct + ${b % p.boxes_per_carton} box`,
          b <= num(s.settings.low_stock_boxes)
            ? badge("Low stock", "amber")
            : "—",
          esc(p.expiry_date || "Not set"),
          badge(expiryStatus(p.expiry_date)),
        ];
      }),
    )}</section>${
      admin()
        ? `<section class="panel"><h2>Movement history</h2>${table(
            ["Date", "Reference", "Product", "Type", "Boxes", "Note"],
            [...s.stock_movements]
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 200)
              .map((m) => [
                esc(m.date),
                esc(m.transaction_id),
                esc(m.product_id),
                esc(m.kind),
                `<span class="${m.boxes < 0 ? "text-red" : "text-green"}">${m.boxes > 0 ? "+" : ""}${m.boxes}</span>`,
                esc(m.note),
              ]),
          )}<p class="muted">Latest 200 movements shown. Export contains the complete ledger.</p></section>`
        : ""
    }<section class="panel"><h2>Salesman stock balances</h2>${table(["Salesman", "Product", "Held boxes", "Cartons + boxes"], [...sellerRows.values()].filter((row) => row.boxes !== 0 && (user?.role !== "salesman" || String(row.salesman_id) === String(own()?.id))).map((row) => { const product = s.products.find((p) => p.id === row.product_id); const perCarton = Number(product?.boxes_per_carton || 1); return [esc(salesmanName(row.salesman_id)), esc(product?.name || row.product_id), row.boxes, `${Math.floor(row.boxes / perCarton)} ct + ${row.boxes % perCarton} box`]; }), "No salesman stock has been issued")}</section><section class="panel"><h2>Salesman stock movement ledger</h2>${table(["Date", "Voucher", "Salesman", "Product", "Movement", "Boxes", "Reason / note"], [...s.salesman_stock_movements].filter(movement => user?.role !== "salesman" || String(movement.salesman_id) === String(own()?.id)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200).map((movement) => [esc(movement.date), esc(movement.reference || movement.transaction_id), esc(salesmanName(movement.salesman_id)), esc(movement.product_id), esc(movement.kind), movement.boxes > 0 ? `+${movement.boxes}` : movement.boxes, esc(movement.note)]), "No salesman stock movements")}</section>`
  );
}
function renderProducts() {
  const s = S();
  const q = filter.search.trim().toLowerCase().replace(/\s+/g, " ");
  const qCompact = q.replace(/[^a-z0-9]/g, "");
  const rows = visible(s.products).filter((p) => user?.role !== "salesman" || heldStock(p.id, own()?.id) > 0).filter((p) => {
    if (!q) return true;
    const text = (p.name + " " + p.id).toLowerCase();
    return (
      text.includes(q) ||
      (qCompact && text.replace(/[^a-z0-9]/g, "").includes(qCompact))
    );
  });
  const costAllowed = admin() || can("pnl");
  return (
    head(
      "Products & pricing",
      "Prices are saved on each sale so later changes cannot alter old invoices.",
      admin() ? btn("+ Product", "add-product", "", "", "gold") : "",
    ) +
    `<section class="panel"><div class="filters">${field("Search products by name or ID", "search", filter.search, "search", 'data-filter="search" placeholder="Type a product name or ID" autocomplete="off"')}</div><p class="muted" style="margin:0 0 12px">${q ? rows.length + " of " + visible(s.products).length + " products match" : visible(s.products).length + " products"}</p>${table(
      [
        "Product",
        "Pack size",
        ...(user?.role === "salesman" ? ["My stock (boxes)"] : []),
        ...(costAllowed ? ["Cost / box"] : []),
        "Retail / box",
        "Wholesale tiers",
        "Expiry date",
        "Status",
        "Actions",
      ],
      rows.map((p) => [
        esc(p.name) + "<small>" + esc(p.id) + "</small>",
        p.boxes_per_carton,
        ...(user?.role === "salesman" ? [heldStock(p.id, own()?.id).toFixed(2)] : []),
        ...(costAllowed ? [money(p.cost_paisa)] : []),
        money(p.retail_paisa),
        s.price_tiers
          .filter((t) => t.product_id === p.id && !t.deleted_at)
          .map((t) => esc(t.label) + ": " + money(t.rate_paisa))
          .join("<br>") || money(p.wholesale_paisa),
        p.expiry_date ? esc(p.expiry_date) + "<small>" + esc(expiryStatus(p.expiry_date)) + "</small>" : "Not set",
        badge(p.active ? "Active" : "Inactive"),
        admin() ? btn("Edit", "edit-product", p.id) + btn(p.active ? "Deactivate" : "Activate", "toggle-product", p.id) : "—",
      ]),
      q ? "No products match your search" : "No products yet",
    )}</section>`
  );
}
function renderStaff() {
  const s = S(),
    targets = targetRows();
  return (
    head(
      "Salesmen & targets",
      "Daily shortfalls carry to the next working day, including month boundaries.",
      admin() ? btn("+ Salesman", "add-staff", "", "", "gold") : "",
    ) +
    `<section class="panel"><div class="panel-heading"><h2>Monthly leaderboard</h2><span>${esc(today().slice(0, 7))}</span></div>${table(
      [
        "Salesman",
        "Today target / achieved",
        "MTD cartons",
        "Achievement",
        ...(admin() || can("pnl") ? ["Incentive", "Salary projection"] : []),
        "Actions",
      ],
      targets.map((t, i) => [
        `${i + 1}. <b>${esc(t.name)}</b><small>${t.active ? "Active" : "Inactive"} · ${esc(t.phone)}</small>`,
        `${num(t.day?.effective_target).toFixed(2)} / ${num(t.day?.achieved_cartons).toFixed(2)}`,
        `${t.achieved.toFixed(2)} / ${t.monthly_target}`,
        `${t.percent.toFixed(1)}%<div class="bar"><span style="width:${Math.min(100, t.percent)}%"></span></div>`,
        ...(admin() || can("pnl") ? [money(t.incentive), money(t.total)] : []),
        `<div class="actions">${btn("Daily tracking", "targets", t.id)}${admin() ? btn("Edit", "edit-staff", t.id) + btn("Post salary", "post-salary", t.id) : ""}</div>`,
      ]),
    )}</section>${admin() ? `<section class="panel"><div class="panel-heading"><h2>Salesman profile & fieldwork records</h2><span class="muted">Admin-only view of submitted records and private uploads</span></div><div id="admin-fieldwork-data"><p class="muted">Loading attendance, documents, visits and profile photos…</p></div></section>` : ""}`
  );
}
async function resolveSalesmanPhoto(seller) {
  const bucket = client.storage.from("employee-private");
  let path = seller.photo_path || "";
  // Compatibility fallback for profile photos uploaded before photo_path was saved.
  if (!path && seller.user_id) {
    const listed = await bucket.list(String(seller.user_id), { search: "profile-", limit: 100, sortBy: { column: "created_at", order: "desc" } });
    if (!listed.error) {
      const file = (listed.data || []).filter(x => /^profile-/i.test(x.name)).sort((a,b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
      if (file) path = `${seller.user_id}/${file.name}`;
    }
  }
  if (!path) return { url: "", error: "No profile photo uploaded." };
  const result = await bucket.createSignedUrl(path, 3600);
  return { url: result.data?.signedUrl || "", error: result.error?.message || (result.data?.signedUrl ? "" : "Could not create a private photo link.") };
}

async function hydrateAdminProfilePhoto() {
  if (!admin() || !client || !user?.id) return;
  const avatar = $("admin-profile-avatar");
  if (!avatar) return;
  const result = await client.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();
  if (result.error) {
    avatar.title = "Could not load profile picture: " + result.error.message;
    return;
  }
  const path = result.data?.avatar_path;
  if (!path) return;
  const signed = await client.storage.from("employee-private").createSignedUrl(path, 3600);
  if (!signed.error && signed.data?.signedUrl && avatar.isConnected) {
    avatar.innerHTML = `<img src="${esc(signed.data.signedUrl)}" alt="Administrator profile photo">`;
  } else if (avatar.isConnected) {
    avatar.title = "Could not display profile picture: " + (signed.error?.message || "Private photo URL unavailable");
  }
}

async function hydrateAdminFieldwork() {
  if (!admin() || !client || !["staff", "myprofile"].includes(page)) return;
  const root = $("admin-fieldwork-data");
  if (!root) return;
  await hydrateAdminProfilePhoto();
  const [sellers, attendance, documents, visits] = await Promise.all([
    client.from("salesmen").select("id,name,phone,territory,area,photo_path,user_id").order("name"),
    client.from("attendance_records").select("salesman_id,attendance_date,check_in_at,check_out_at,status,check_in_latitude,check_in_longitude,check_in_location_accuracy_m").order("attendance_date", { ascending: false }).limit(300),
    client.from("employee_documents").select("salesman_id,document_type,file_path,file_name,mime_type,size_bytes,created_at").order("created_at", { ascending: false }).limit(300),
    client.from("customer_visits").select("salesman_id,customer_label,area,purpose,notes,visited_at,latitude,longitude").order("visited_at", { ascending: false }).limit(300),
  ]);
  const sectionError = (label, result) => result.error
    ? `<p class="notice danger">${esc(label)} could not be loaded: ${esc(result.error.message)}. Check the salesman self-service SQL migration and table permissions.</p>`
    : "";
  if (sellers.error) {
    root.innerHTML = sectionError("Salesman profiles", sellers);
    return;
  }
  const sellerRows = sellers.data || [];
  const names = new Map(sellerRows.map(x => [String(x.id), x.name]));
  const photoRows = await Promise.all(sellerRows.map(async x => {
    const result = await resolveSalesmanPhoto(x);
    return [x, result.url, result.error];
  })).then(rows => rows.filter(([x,url]) => Boolean(url) || Boolean(x.photo_path)));
  const photoHtml = photoRows.length
    ? `<div class="profile-photo-grid">${photoRows.map(([x,url,err]) => `<article class="profile-photo-card"><div class="profile-avatar">${url ? `<img src="${esc(url)}" alt="${esc(x.name)} profile photo" loading="lazy">` : `<span class="muted">Photo unavailable</span>`}</div><div><b>${esc(x.name)}</b><p class="muted">${esc(x.phone || "—")} · ${esc(x.territory || x.area || "—")}</p>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">Open full-size photo</a>` : `<small class="muted">${esc(err || "No storage access")}</small>`}</div></article>`).join("")}</div>`
    : `<p class="muted">No profile photos are linked to salesman records yet. The salesman must upload a photo from My profile & fieldwork.</p>`;
  const attendanceHtml = sectionError("Attendance", attendance) || table(["Salesman","Date","Check-in","Check-out","Status","Check-in location"], (attendance.data || []).map(r => [esc(names.get(String(r.salesman_id)) || r.salesman_id), esc(r.attendance_date), esc(r.check_in_at ? new Date(r.check_in_at).toLocaleString() : "—"), esc(r.check_out_at ? new Date(r.check_out_at).toLocaleString() : "—"), esc(r.status), r.check_in_latitude == null || r.check_in_longitude == null ? "Location not recorded" : `<a href="https://www.google.com/maps?q=${encodeURIComponent(r.check_in_latitude)},${encodeURIComponent(r.check_in_longitude)}" target="_blank" rel="noopener">View check-in map</a><small>${num(r.check_in_latitude).toFixed(5)}, ${num(r.check_in_longitude).toFixed(5)}${r.check_in_location_accuracy_m ? ` · ±${Math.round(num(r.check_in_location_accuracy_m))} m` : ""}</small>`]), "No attendance records submitted.");
  const docRows = documents.error ? [] : await Promise.all((documents.data || []).map(async d => {
    const result = await client.storage.from("employee-private").createSignedUrl(d.file_path, 3600);
    return [esc(names.get(String(d.salesman_id)) || d.salesman_id), esc(d.file_name), esc(d.document_type), esc(new Date(d.created_at).toLocaleString()), `${Math.ceil(num(d.size_bytes)/1024)} KB`, result.data?.signedUrl ? `<a href="${esc(result.data.signedUrl)}" target="_blank" rel="noopener">Open private file</a>` : esc(result.error?.message || "Unavailable")];
  }));
  const documentsHtml = sectionError("Employee documents", documents) || table(["Salesman","Document","Type","Uploaded","Size","File"], docRows, "No employee documents uploaded.");
  const visitsHtml = sectionError("Customer visits", visits) || table(["Salesman","Visited","Customer","Area","Purpose","Notes","GPS"], (visits.data || []).map(r => [esc(names.get(String(r.salesman_id)) || r.salesman_id), esc(new Date(r.visited_at).toLocaleString()), esc(r.customer_label || "—"), esc(r.area || "—"), esc(r.purpose || "—"), esc(r.notes || "—"), r.latitude == null ? "Not shared" : `${num(r.latitude).toFixed(5)}, ${num(r.longitude).toFixed(5)}`]), "No customer visits submitted.");
  root.innerHTML = `<h3>Employee profile photos</h3>${photoHtml}<h3>Attendance</h3>${attendanceHtml}<h3>Uploaded employee documents</h3><p class="muted">Private links expire after one hour.</p>${documentsHtml}<h3>Customer visits & optional GPS</h3>${visitsHtml}`;
}
async function openAdminSalesmanProfile(salesmanId) {
  if (!admin()) throw Error("Administrator access is required to view employee profiles.");
  if (!client) throw Error("Employee profiles require a connected Supabase session.");
  modal("Salesman profile", '<p class="muted">Loading saved profile and fieldwork details…</p>');
  const sellerResult = await client.from("salesmen").select("id,name,phone,territory,area,photo_path,user_id,joining_date,active").eq("id", salesmanId).maybeSingle();
  if (sellerResult.error) {
    modal("Salesman profile", `<p class="notice danger">Unable to load salesman profile: ${esc(sellerResult.error.message)}. Apply the updated <code>supabase/salesman_self_service.sql</code> migration and confirm the current login has the admin role.</p>`);
    return;
  }
  const seller = sellerResult.data;
  if (!seller) { modal("Salesman profile", '<p class="notice">No linked salesman profile was found. Use Edit access to link or create the salesman profile.</p>'); return; }
  const [attendance, documents, visits] = await Promise.all([
    client.from("attendance_records").select("attendance_date,check_in_at,check_out_at,status,check_in_latitude,check_in_longitude,check_in_location_accuracy_m").eq("salesman_id", seller.id).order("attendance_date", {ascending:false}).limit(100),
    client.from("employee_documents").select("document_type,file_path,file_name,mime_type,size_bytes,created_at").eq("salesman_id", seller.id).order("created_at", {ascending:false}).limit(100),
    client.from("customer_visits").select("customer_label,area,purpose,notes,visited_at,latitude,longitude").eq("salesman_id", seller.id).order("visited_at", {ascending:false}).limit(100),
  ]);
  const sectionError = (r) => r.error ? `<p class="notice danger">Could not load this section: ${esc(r.error.message)}</p>` : "";
  const photoResult = await resolveSalesmanPhoto(seller);
  const photo = photoResult.url
    ? `<a href="${esc(photoResult.url)}" target="_blank" rel="noopener" title="Open full-size profile photo"><img src="${esc(photoResult.url)}" alt="${esc(seller.name)} profile photo" style="width:120px;height:120px;object-fit:cover;border-radius:50%"></a>`
    : `<span class="muted">${esc(photoResult.error || "No profile photo uploaded.")}</span>`;
  const docRows = await Promise.all((documents.data || []).map(async d => {
    const r = await client.storage.from("employee-private").createSignedUrl(d.file_path, 3600);
    return [esc(d.file_name), esc(d.document_type), esc(new Date(d.created_at).toLocaleString()), `${Math.ceil(num(d.size_bytes)/1024)} KB`, r.data?.signedUrl ? `<a href="${esc(r.data.signedUrl)}" target="_blank" rel="noopener">Open file</a>` : esc(r.error?.message || "Unavailable")];
  }));
  const attendanceHtml = sectionError(attendance) || table(["Date","Check-in","Check-out","Status","Check-in location"], (attendance.data || []).map(r => [esc(r.attendance_date), esc(r.check_in_at ? new Date(r.check_in_at).toLocaleString() : "—"), esc(r.check_out_at ? new Date(r.check_out_at).toLocaleString() : "—"), esc(r.status), r.check_in_latitude == null || r.check_in_longitude == null ? "Location not recorded" : `<a href="https://www.google.com/maps?q=${encodeURIComponent(r.check_in_latitude)},${encodeURIComponent(r.check_in_longitude)}" target="_blank" rel="noopener">View check-in map</a><small>${num(r.check_in_latitude).toFixed(5)}, ${num(r.check_in_longitude).toFixed(5)}${r.check_in_location_accuracy_m ? ` · ±${Math.round(num(r.check_in_location_accuracy_m))} m` : ""}</small>`]), "No attendance submitted yet.");
  const documentsHtml = sectionError(documents) || table(["Document","Type","Uploaded","Size","File"], docRows, "No documents uploaded yet.");
  const visitsHtml = sectionError(visits) || table(["Visited","Customer","Area","Purpose","Notes","GPS"], (visits.data || []).map(r => [esc(new Date(r.visited_at).toLocaleString()), esc(r.customer_label || "—"), esc(r.area || "—"), esc(r.purpose || "—"), esc(r.notes || "—"), r.latitude == null ? "Not shared" : `${num(r.latitude).toFixed(5)}, ${num(r.longitude).toFixed(5)}`]), "No customer visits submitted yet.");
  const role = S().user_roles.find(r => r.user_id === seller.user_id)?.role || "Not linked";
  modal(`${seller.name} · Profile`, `<section class="panel"><div class="profile-hero"><div class="profile-avatar">${photo}</div><div><h3>${esc(seller.name)}</h3><p><b>Employee ID:</b> ${esc(seller.id)}</p><p><b>Phone:</b> ${esc(seller.phone || "Not provided")}</p><p><b>Territory / area:</b> ${esc(seller.territory || seller.area || "Not assigned")}</p><p><b>Joining date:</b> ${esc(seller.joining_date || "Not recorded")} · <b>Status:</b> ${seller.active ? "Active" : "Inactive"} · <b>Login role:</b> ${esc(role)}</p></div></div></section><section class="panel"><h3>Attendance history</h3>${attendanceHtml}</section><section class="panel"><h3>Uploaded documents</h3><p class="muted">Private file links expire after one hour.</p>${documentsHtml}</section><section class="panel"><h3>Customer visits & fieldwork</h3>${visitsHtml}</section>`);
}

function filters(category = false) {
  return `<div class="filters">${field("From", "from", filter.from, "date", 'data-filter="from"')}${field("To", "to", filter.to, "date", 'data-filter="to"')}${category ? select("Category", "category", ["All categories", ...new Set(S().expenses.map((e) => e.category))], filter.category || "All categories") : ""}${btn("Apply", "apply-filters")}${btn("This month", "this-month")}${btn("This year", "this-year")}</div>`;
}
function renderExpenses() {
  const rows = visible(S().expenses).filter(
    (e) =>
      e.date >= filter.from &&
      e.date <= filter.to &&
      (!filter.category ||
        filter.category === "All categories" ||
        e.category === filter.category),
  );
  return (
    head(
      "Expenses",
      "Keep operating costs and receipts in one place.",
      btn("Export CSV", "expense-csv") +
        btn("+ Expense", "add-expense", "", "", "gold"),
    ) +
    `<section class="panel">${filters(true)}<p><b>Period total: ${money(rows.reduce((a, e) => a + num(e.amount_paisa), 0))}</b></p>${table(
      [
        "Date",
        "Category",
        "Description",
        "Amount",
        "Method",
        "Salesman",
        "Actions",
      ],
      rows.map((e) => [
        esc(e.date),
        esc(e.category),
        esc(e.description),
        money(e.amount_paisa),
        esc(e.method),
        esc(salesmanName(e.salesman_id)),
        `<div class="actions">${btn("Edit", "edit-expense", e.id)}${e.attachment_path ? btn("Receipt", "receipt", e.id) : ""}${admin() ? btn("Delete", "delete-expense", e.id, "", "danger") : ""}</div>`,
      ]),
    )}</section>`
  );
}
function renderPnl() {
  const s = S(),
    p = profitLoss(
      s.orders,
      s.order_items,
      s.expenses,
      s.payments,
      s.invoices,
      filter.from,
      filter.to,
    );
  const days =
      Math.round((new Date(filter.to) - new Date(filter.from)) / 86400000) + 1,
    prev = profitLoss(
      s.orders,
      s.order_items,
      s.expenses,
      s.payments,
      s.invoices,
      addDays(filter.from, -days),
      addDays(filter.from, -1),
    );
  const breakdown = (obj, labels = false) =>
    table(
      ["Category", "Amount"],
      Object.entries(obj).map(([k, v]) => [
        esc(labels ? salesmanName(k) : k),
        money(v),
      ]),
    );
  return (
    head(
      "Profit & loss",
      "Accrual profit from confirmed sales, saved costs and operating expenses.",
    ) +
    `<section class="panel">${filters()}</section><div class="cards">${card("Net revenue", money(p.revenue), "After " + money(p.discount) + " discounts")}${card("Gross profit", money(p.gross), p.grossMargin.toFixed(1) + "% gross margin")}${card("Operating expenses", money(p.expense), "Selected period")}${card(p.net < 0 ? "Net loss" : "Net profit", money(p.net), p.netMargin.toFixed(1) + "% net margin", true)}</div><div class="two-col"><section class="panel"><h2>Period comparison</h2>${table(
      ["Line item", "Selected period", "Previous equal period"],
      [
        ["Gross sales", money(p.subtotal), money(prev.subtotal)],
        ["Discounts", money(p.discount), money(prev.discount)],
        ["Net revenue", money(p.revenue), money(prev.revenue)],
        ["COGS", money(p.cogs), money(prev.cogs)],
        ["Gross profit", money(p.gross), money(prev.gross)],
        ["Expenses", money(p.expense), money(prev.expense)],
        [
          "Net profit / loss",
          `<b class="${p.net < 0 ? "text-red" : "text-green"}">${money(p.net)}</b>`,
          money(prev.net),
        ],
        ["Cash collected in period", money(p.collected), money(prev.collected)],
        [
          "Outstanding on period invoices",
          money(p.outstanding),
          money(prev.outstanding),
        ],
      ],
    )}<p class="muted">Cancelled sales are excluded. Cash collected uses payment dates; receivables show current balances.</p></section><section class="panel"><h2>Expenses by category</h2><div class="chart"><canvas id="expense-chart" role="img" aria-label="Expense categories"></canvas></div>${breakdown(p.categories)}</section></div><div class="two-col"><section class="panel"><h2>Sales by channel</h2>${breakdown(p.channels)}<h2 style="margin-top:24px">Sales by salesman</h2>${breakdown(p.salesmen, true)}</section><section class="panel"><h2>Top products by profit</h2><div class="chart"><canvas id="product-chart" role="img" aria-label="Product profit"></canvas></div>${breakdown(
      Object.fromEntries(
        Object.entries(p.products)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10),
      ),
    )}</section></div>`
  );
}
function drawCharts() {
  if (!globalThis.Chart) return;
  const s = S();
  if ($("revenue-chart")) {
    let months = [],
      rev = [],
      exp = [],
      net = [];
    for (let n = 5; n >= 0; n--) {
      const d = new Date(monthStart(today()) + "T12:00:00Z");
      d.setUTCMonth(d.getUTCMonth() - n);
      const first = d.toISOString().slice(0, 10),
        p = profitLoss(
          s.orders,
          s.order_items,
          s.expenses,
          s.payments,
          s.invoices,
          first,
          monthEnd(first),
        );
      months.push(d.toLocaleDateString("en-GB", { month: "short" }));
      rev.push(p.revenue / 100);
      exp.push(p.expense / 100);
      net.push(p.net / 100);
    }
    charts.push(
      new Chart($("revenue-chart"), {
        type: "bar",
        data: {
          labels: months,
          datasets: [
            {
              label: "Revenue (Rs.)",
              data: rev,
              backgroundColor: "#12233f",
              borderRadius: 3,
            },
            {
              label: "Expenses (Rs.)",
              data: exp,
              backgroundColor: "#d5ad58",
              borderRadius: 3,
            },
            {
              label: "Net profit (Rs.)",
              data: net,
              type: "line",
              borderColor: "#39795e",
              tension: 0.3,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 10 } } },
          scales: {
            y: { beginAtZero: true, grid: { color: "#edf0f4" } },
            x: { grid: { display: false } },
          },
        },
      }),
    );
    $("chart-data").innerHTML =
      `<details><summary>View chart values</summary>${table(
        ["Month", "Revenue", "Expenses", "Profit"],
        months.map((m, i) => [
          m,
          money(rev[i] * 100),
          money(exp[i] * 100),
          money(net[i] * 100),
        ]),
      )}</details>`;
  }
  const p = profitLoss(
    s.orders,
    s.order_items,
    s.expenses,
    s.payments,
    s.invoices,
    filter.from,
    filter.to,
  );
  for (const [id, obj, type] of [
    ["expense-chart", p.categories, "doughnut"],
    [
      "product-chart",
      Object.fromEntries(
        Object.entries(p.products)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5),
      ),
      "bar",
    ],
  ])
    if ($(id))
      charts.push(
        new Chart($(id), {
          type,
          data: {
            labels: Object.keys(obj),
            datasets: [
              {
                label: "Rs.",
                data: Object.values(obj).map((x) => x / 100),
                backgroundColor: [
                  "#12233f",
                  "#d5ad58",
                  "#538b7b",
                  "#b7c8dc",
                  "#9f7996",
                ],
              },
            ],
          },
          options: {
            maintainAspectRatio: false,
            plugins: {
              legend: { display: type === "doughnut", position: "bottom" },
            },
          },
        }),
      );
}
function renderSettings() {
  const s = S().settings;
  return (
    head(
      "Settings",
      "Company details, targets and pricing rules apply to new activity.",
    ) +
    `<form id="settings-form"><section class="panel"><h2>Company & documents</h2><div class="grid three">${field("Company name", "company_name", s.company_name, "text", "required")}${field("Phone / WhatsApp", "phone", s.phone)}${field("Email", "email", s.email, "email")}${field("Website", "website", s.website)}${field("Address", "address", s.address)}${field("NTN", "ntn", s.ntn)}${field("Authorised signatory name", "signature_name", s.signature_name || "")}${area("Bank / JazzCash details", "bank_details", s.bank_details)}${area("Default terms", "terms", s.terms)}</div><div class="field" style="margin-top:16px"><label for="signature-file">Authorised signature image (optional, PNG/JPEG)</label><input id="signature-file" type="file" accept="image/png,image/jpeg"><small>Upload only the company-approved signature. It appears on fully paid invoices.</small></div></section><section class="panel"><h2>Stock & sales rules</h2><div class="grid three">${field("Default boxes / carton", "boxes_per_carton", s.boxes_per_carton, "number", 'min="1" required')}${field("Low-stock threshold (boxes)", "low_stock_boxes", s.low_stock_boxes, "number", 'min="0" required')}${field("Default base salary (Rs.)", "base_salary", s.base_salary_paisa / 100, "number", 'min="0" step="0.01" required')}</div><div class="grid" style="margin-top:20px">${[
      ["block_negative_stock", "Block sales above available stock"],
      ["allow_customer_credit", "Allow overpayment as customer credit"],
      ["auto_salary_expense", "Auto-post previous month salary on owner login"],
    ]
      .map(
        ([k, l]) =>
          `<div class="checkbox"><input type="checkbox" id="${k}" name="${k}" ${s[k] ? "checked" : ""}><label for="${k}">${l}</label></div>`,
      )
      .join(
        "",
      )}</div></section><section class="panel"><h2>Salesman targets</h2><div class="grid">${field("Default monthly target (cartons)", "monthly_target", s.monthly_target, "number", 'min="1" required')}${field("Company monthly target (cartons)", "company_monthly_target", s.company_monthly_target ?? 2000, "number", 'min="1" required')}${area("Company holidays (one YYYY-MM-DD per line)", "holidays", s.holidays.join("\n"))}</div><p style="margin-top:18px">Working days</p><div class="pill-list">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => `<div class="checkbox"><input type="checkbox" name="working_day" id="wd-${i}" value="${i}" ${s.working_days.includes(i) ? "checked" : ""}><label for="wd-${i}">${d}</label></div>`).join("")}</div><div class="grid" style="margin-top:20px">${[
      ["carry_month_end", "Roll shortfalls across month end (off = reset)"],
      ["reduce_by_surplus", "Use surplus to reduce the next day target"],
    ]
      .map(
        ([k, l]) =>
          `<div class="checkbox"><input type="checkbox" id="${k}" name="${k}" ${s[k] ? "checked" : ""}><label for="${k}">${l}</label></div>`,
      )
      .join(
        "",
      )}</div></section><section class="panel"><h2>Default Rani wholesale tiers</h2><p class="muted">Minimum cartons are inclusive. The first starts at 0, so loose-box orders receive a rate. Product overrides take priority; untick overrides on a product to use these defaults.</p><div class="grid three">${s.tiers.map((t, i) => field("Tier " + (i + 1) + " minimum cartons", "tier_min_" + i, t.min, "number", 'min="0" step="0.01" required') + field("Tier " + (i + 1) + " label", "tier_label_" + i, t.label, "text", "required") + field("Tier " + (i + 1) + " rate / box (Rs.)", "tier_rate_" + i, t.rate_paisa / 100, "number", 'min="0" step="0.01" required')).join("")}</div></section><section class="panel"><h2>Incentive slabs</h2><div class="grid">${s.incentives.map((t, i) => field("Slab " + (i + 1) + " minimum achievement %", "incentive_min_" + i, t.min, "number", 'min="0" required') + field("Slab " + (i + 1) + " incentive (Rs.)", "incentive_amount_" + i, t.amount_paisa / 100, "number", 'min="0" required')).join("")}</div></section><button class="gold" type="submit">Save settings</button></form>`
  );
}
function managersPanel() {
  const s = S(),
    from = monthStart(today()),
    to = today(),
    target = num(s.settings.company_monthly_target) || 2000,
    team = targetPerformance(s.orders, s.order_items, from, to).salesman_cartons,
    cartonsOf = (o) =>
      s.order_items
        .filter((i) => i.order_id === o.id)
        .reduce(
          (a, i) => a + Number(i.boxes || 0) / (Number(i.boxes_per_carton) || 1),
          0,
        ),
    managers = s.profiles.filter(
      (p) => s.user_roles.find((r) => r.user_id === p.id)?.role === "manager",
    ),
    rows = managers.map((m) => {
      const own = s.orders.filter(
          (o) =>
            o.status === "confirmed" &&
            !o.deleted_at &&
            !o.salesman_id &&
            o.created_by === m.id &&
            o.date >= from &&
            o.date <= to,
        ),
        ownCartons = own.reduce((a, o) => a + cartonsOf(o), 0),
        ownValue = own.reduce((a, o) => a + num(o.total_paisa), 0),
        total = team + ownCartons,
        pct = (total / target) * 100;
      return [
        esc(m.display_name),
        `${target.toFixed(2)} cartons`,
        `${team.toFixed(2)} cartons`,
        `+${ownCartons.toFixed(2)} cartons<br><small>${own.length} orders · ${money(ownValue)}</small>`,
        `<b>${total.toFixed(2)}</b> cartons${total >= target ? " " + badge("Target closed", "green") : `<br><small>${(target - total).toFixed(2)} remaining</small>`}`,
        `${pct.toFixed(1)}%<div class="bar"><span style="width:${Math.min(100, pct)}%"></span></div>`,
      ];
    });
  return `<section class="panel"><div class="panel-heading"><h2>Managers & company target</h2><span class="muted">${new Date(from + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric" })} · month to date</span></div>${table(["Manager", "Monthly target", "Team (salesmen) achieved", "Own sales (additional)", "Total target met", "Achievement"], rows, "No manager logins yet. Create a login with the manager role.")}</section>`;
}
function renderUsers() {
  const s = S();
  return (
    head(
      "Users & access",
      "Admin permissions are enforced by the database, including direct API requests.",
      btn("+ Create login", "create-user", "", "", "gold"),
    ) +
    managersPanel() +
    `<section class="panel">${table(
      ["Name", "Role", "Linked salesman", "Status", "Actions"],
      s.profiles.map((p) => [
        esc(p.display_name),
        esc(s.user_roles.find((r) => r.user_id === p.id)?.role || "user"),
        esc(s.salesmen.find((x) => x.user_id === p.id)?.name || "Not linked"),
        badge(p.active ? "Active" : "Inactive"),
        p.id === user.id
          ? "Current user"
          : `<div class="actions">${btn("Edit access", "edit-user", p.id)}${(S().user_roles.find((r) => r.user_id === p.id)?.role === "salesman") ? (S().salesmen.find((x) => x.user_id === p.id) ? btn("Profile", "salesman-profile", S().salesmen.find((x) => x.user_id === p.id).id) : `<span class="muted">Profile not linked</span>`) : ""}</div>`,
      ]),
    )}</section>`
  );
}
function renderAudit() {
  return (
    head("Audit trail", "Who changed each record, and when.") +
    `<section class="panel">${table(
      ["Time", "User", "Table", "Action", "Record", "Details"],
      [...S().audit_log]
        .reverse()
        .slice(0, 200)
        .map((a) => [
          esc(a.occurred_at),
          esc(
            S().profiles.find((p) => p.id === a.actor_id)?.display_name ||
              a.actor_id,
          ),
          esc(a.table_name),
          esc(a.action),
          esc(a.record_id),
          btn("Details", "audit-detail", String(a.id)),
        ]),
    )}</section>`
  );
}
function renderImport() {
  return (
    head(
      "Import & export",
      "Upload once. Review the report, then commit the complete workbook.",
    ) +
    `<section class="panel"><h2>Import Workbook</h2><p>Price Codes is the product source. All recognised sheets are processed in one transaction. If any row fails validation, the batch stays unapplied.</p><div class="field"><label for="workbook-file">Select your connected Excel workbook</label><input id="workbook-file" type="file" accept=".xlsx,.xls"></div><p class="muted" style="margin-top:12px">A preview shows new, updated and unchanged records before you import. Formula caches are read and supported business calculations are recomputed.</p></section><section class="panel"><h2>Export & backup</h2><p>Excel exports use the most recently imported sheet names, header positions and column headings. JSON contains the complete data visible to your account.</p><div class="actions">${btn("Export Excel", "export-xlsx")}${btn("Download JSON backup", "backup")}${btn("Export pending changes", "export-queue")}</div></section>${localStorage.getItem("blesscon:last-import:" + user.id) ? `<section class="panel"><h2>Last import report</h2><pre>${esc(localStorage.getItem("blesscon:last-import:" + user.id))}</pre></section>` : ""}`
  );
}
function openEditor(quote, id) {
  if (minimized) {
    if (!confirm("You have a minimised " + minimized.title.toLowerCase() + " in progress. Discard it and start a new one?")) {
      restoreModal();
      return;
    }
    minimized = null;
    updatePill();
  }
  const s = S(),
    t = quote ? "quotations" : "orders",
    it = quote ? "quotation_items" : "order_items";
  const old = id ? s[t].find((x) => x.id === id) : null;
  draft = {
    quote,
    id: old?.id || uid(),
    version: old?.version,
    customer_id: old?.customer_id || visible(s.customers)[0]?.id || "__new__",
    salesman_id:
      old
        ? old.salesman_id || ""
        : admin()
          ? ""
          : own()?.id || visible(s.salesmen).find((x) => x.active)?.id || "",
    date: old?.date || today(),
    due_date: old?.due_date || addDays(today(), 7),
    valid_until: old?.valid_until || addDays(today(), 7),
    channel: old?.channel || "wholesale",
    discount_paisa: old?.discount_paisa || 0,
    notes: old?.notes || "",
    terms: old?.terms || s.settings.terms,
    items: old
      ? s[it]
          .filter((l) => l[quote ? "quotation_id" : "order_id"] === id)
          .map((l) => ({ ...l, override_reason: "" }))
      : [
          {
            product_id: visible(s.products).find((p) => p.active && (user?.role !== "salesman" || heldStock(p.id, own()?.id) > 0))?.id || "",
            cartons: 1,
            loose_boxes: 0,
          },
        ],
  };
  modal(
    (old ? "Edit " : "New ") + (quote ? "quotation" : "sale"),
    `<form id="document-form">${old ? '<p class="notice">Editing recalculates prices using current tiers. Review the rates before saving.</p>' : ""}<div class="grid three">${field("Customer ID / name search", "customer_id", draft.customer_id, "text", 'list="customer-list" required')}<datalist id="customer-list">${visible(
      s.customers,
    )
      .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
      .join(
        "",
      )}<option value="__new__">Add a new customer</option></datalist>${select(
      "Salesman",
      "salesman_id",
      [
        ...(mgmt() ? [["", "Manager / direct sale"]] : []),
        ...(manager() ? [] : visible(s.salesmen))
          .filter((x) => x.active)
          .map((x) => [x.id, x.name]),
      ],
      draft.salesman_id,
    )}${select("Channel", "channel", ["wholesale", "retail"], draft.channel)}${field("Date", "date", draft.date, "date", "required")}${field(quote ? "Valid until" : "Due date", quote ? "valid_until" : "due_date", quote ? draft.valid_until : draft.due_date, "date", "required")}</div><button type="button" class="secondary" data-act="quick-customer" style="margin-top:12px">+ New customer</button><div id="new-customer-fields" class="grid" style="margin:16px 0;${draft.customer_id === "__new__" ? "" : "display:none"}">${field("New customer name", "customer_name", "", "text")}${field("Customer phone", "customer_phone", "", "tel")}${field("Customer email", "customer_email", "", "email")}${field("Customer address", "customer_address")}</div><hr><div class="panel-heading"><h2>Product lines</h2></div><datalist id="product-list">${visible(
      s.products,
    )
      .filter((p) => p.active)
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join(
        "",
      )}</datalist><div id="editor-lines"></div><button type="button" class="secondary add-line-bottom" data-act="add-line" style="margin:4px 0 16px">+ Add product</button><div class="grid">${field("Discount (Rs.)", "discount", draft.discount_paisa / 100, "number", 'min="0" step="0.01"')}${area("Notes", "notes", draft.notes)}${area("Terms", "terms", draft.terms)}</div><div id="editor-total" class="total-box"></div>${!quote && !old ? `<section class="panel" aria-labelledby="payment-section-title"><h2 id="payment-section-title">Payment</h2><div class="grid three">${select("Payment status", "payment_status", [["unpaid","Unpaid"],["partial","Part paid"],["paid","Paid in full"]], "unpaid")}${field("Amount received now (Rs.)", "payment_amount", "0.00", "number", 'min="0" step="0.01"')}${field("Payment date", "payment_date", today(), "date")}${select("Method", "payment_method", ["Cash", "Bank", "JazzCash", "Easypaisa", "Cheque"])}${cashbookPaymentAccountField()}${field("Reference", "payment_reference")}${field("Received by", "payment_received_by", user.name || user.email || "Owner")}${field("Due date", "payment_due_date", addDays(today(),7), "date")}</div><div id="payment-summary" class="total-box" aria-live="polite">Total · Paid now · Balance</div></section>` : ""}<div id="editor-error" role="alert"></div><button class="gold" type="submit">${quote ? "Save quotation" : "Confirm sale"}</button></form>`,
  );
  renderLines();
  calcEditor();
}
function renderLines() {
  const products = visible(S().products).filter(p => p.active && (user?.role !== "salesman" || heldStock(p.id, own()?.id) > 0)).sort((a,b) => String(a.name).localeCompare(String(b.name)));
  $("editor-lines").innerHTML = draft.items.map((l,i) => {
    const found = products.some(p => p.id === l.product_id);
    const options = products.map(p => `<option value="${esc(p.id)}" ${l.product_id===p.id?"selected":""}>${esc(p.name)} (${esc(p.id)}): Rs. ${num(S().price_tiers.find(t=>t.product_id===p.id && t.min_cartons===1)?.rate_paisa ?? p.wholesale_paisa)/100}/box</option>`).join("");
    const picker = products.length ? `<div class="field"><label for="line-search-${i}">Search products</label><input id="line-search-${i}" data-product-search="${i}" type="search" placeholder="Type product name or ID"><label for="line-p-${i}">Product</label><select id="line-p-${i}" data-line-field="product_id" required><option value="">Select product…</option>${l.product_id&&!found?`<option selected disabled value="${esc(l.product_id)}">Missing/inactive product (${esc(l.product_id)})</option>`:""}${options}</select></div>` : `<p class="notice">No products yet. Import your workbook (Import page) or add a product.</p><button type="button" class="secondary" data-act="add-product">Add a product</button>`;
    return `<div class="line-editor" data-line="${i}">${picker}<div class="field"><label for="line-c-${i}">Cartons</label><input id="line-c-${i}" data-line-field="cartons" type="number" min="0" step="1" value="${l.cartons}" required></div><div class="field"><label for="line-l-${i}">Loose boxes</label><input id="line-l-${i}" data-line-field="loose_boxes" type="number" min="0" step="1" value="${l.loose_boxes}" required></div><div class="field"><label for="line-r-${i}">Rate / box (Rs.)</label><input id="line-r-${i}" data-line-field="manual_rate" type="number" min="0" step="0.01" value="${num(l.rate_paisa)/100}" ${admin()?"":"readonly"}></div><div class="line-total" id="line-total-${i}"></div><button type="button" class="icon-button" aria-label="Remove product line ${i+1}" data-act="remove-line" data-id="${i}">×</button><div class="line-note" id="line-note-${i}">${l.product_id&&!found?"This product is missing or inactive. Choose an active product.":""}</div>${admin()?`<div class="override"><span class="muted">Manual override reason</span><input data-line-field="override_reason" aria-label="Override reason for line ${i+1}" value="${esc(l.override_reason||"")}" placeholder="Leave blank for automatic pricing"></div>`:""}</div>`;
  }).join("");
  draft.items.forEach((l,i)=>{ const search=$("line-search-"+i), select=$("line-p-"+i); if(search&&select) search.addEventListener("input",()=>{const q=norm(search.value); for(const o of [...select.options]) if(o.value) o.hidden=!norm(o.textContent).includes(q);}); });
}
function calcEditor() {
  if (!draft || !$("document-form")) return;
  try {
    const f = new FormData($("document-form"));
    draft.channel = f.get("channel");
    draft.discount_paisa = paisa(f.get("discount"));
    const priced = priceLines(
      draft.items,
      S().products,
      draft.channel,
      S().settings,
      S().price_tiers,
      admin(),
    );
    let subtotal = 0;
    priced.forEach((l, i) => {
      subtotal += l.amount_paisa;
      const avail =
        balance(l.product_id, draft.salesman_id) +
        (draft.version
          ? S()
              .order_items.filter(
                (x) => x.order_id === draft.id && x.product_id === l.product_id,
              )
              .reduce((a, x) => a + x.boxes, 0)
          : 0);
      $("line-total-" + i).innerHTML = "<b>" + money(l.amount_paisa) + "</b>";
      $("line-note-" + i).innerHTML =
        badge(l.tier_label + ": " + money(l.rate_paisa) + "/box") +
        ` · ${l.boxes} boxes · Stock: ${avail}${admin() || can("pnl") ? ` · Margin: <span class="${l.margin_paisa < 0 ? "text-red" : "text-green"}">${money(l.margin_paisa)}</span>${l.margin_paisa < 0 ? " · BELOW COST" : ""}` : ""}${l.boxes > avail ? (S().settings.block_negative_stock ? ' · <b class="text-red">Insufficient stock — order blocked by stock setting</b>' : ' · <b class="text-amber">Short by ' + (l.boxes - avail) + ' boxes — negative stock allowed</b>') : ""}`;
      if (
        !draft.items[i].override_reason?.trim() &&
        document.activeElement !== $("line-r-" + i)
      )
        $("line-r-" + i).value = l.rate_paisa / 100;
      draft.items[i] = {
        ...draft.items[i],
        rate_paisa: l.rate_paisa,
        cost_paisa: l.cost_paisa,
      };
    });
    const total = subtotal - draft.discount_paisa;
    $("editor-total").innerHTML =
      `Subtotal ${money(subtotal)}<br>Discount ${money(draft.discount_paisa)}<br><strong>Total ${money(total)}</strong>`;
    const payStatus = $("f-payment_status");
    if (payStatus && !draft.quote) {
      const amount = $("f-payment_amount"), due = $("f-payment_due_date");
      if (payStatus.value === "paid") { amount.value = (total / 100).toFixed(2); amount.readOnly = true; }
      else if (payStatus.value === "unpaid") { amount.value = "0.00"; amount.readOnly = true; }
      else { amount.readOnly = false; if (amount.dataset.mode !== "partial") amount.value = ""; }
      amount.dataset.mode = payStatus.value;
      due.closest(".field").style.display = payStatus.value === "unpaid" ? "block" : "none";
      const paid = payStatus.value === "paid" ? total : payStatus.value === "partial" ? (Number(String(amount.value).replace(/,/g,"")) || 0) * 100 : 0;
      $("payment-summary").innerHTML = `Total: <b>${money(total)}</b> · Paid now: <b>${money(paid)}</b> · Balance: <b>${money(total-paid)}</b> · ${badge(payStatus.value === "paid" ? "PAID" : payStatus.value === "partial" ? "PART PAID" : "UNPAID")}`;
    }
    $("editor-error").textContent = "";
  } catch (e) {
    $("editor-error").textContent = e.message;
  }
}
function refreshConvertPayment(form) {
  const q = S().quotations.find(x=>x.id===form.dataset.id); if (!q) return;
  let total = Number(q.total_paisa);
  if (form.elements.reprice?.checked) {
    const lines=S().quotation_items.filter(l=>l.quotation_id===q.id);
    try { total=priceLines(lines,S().products,q.channel,S().settings,S().price_tiers,admin()).reduce((a,l)=>a+l.amount_paisa,0)-Number(q.discount_paisa||0); } catch {}
  }
  const status=form.elements.payment_status?.value || "unpaid", amount=form.elements.payment_amount;
  if (status==="paid") { amount.value=(total/100).toFixed(2); amount.readOnly=true; }
  else if (status==="unpaid") { amount.value="0.00"; amount.readOnly=true; }
  else amount.readOnly=false;
  const paid=status==="paid"?total:status==="partial"?(Number(String(amount.value).replace(/,/g,""))||0)*100:0;
  const box=$("convert-payment-summary"); if(box) box.innerHTML=`Total: <b>${money(total)}</b> · Paid now: <b>${money(paid)}</b> · Balance: <b>${money(total-paid)}</b>`;
}
async function saveEditor(form) {
  const f = Object.fromEntries(new FormData(form)),
    quote = draft.quote;
  let customer_id = f.customer_id;
  if (customer_id === "__new__") {
    if (!f.customer_name?.trim()) throw Error("Enter the new customer name");
    customer_id = "CU-" + uid();
    await store.run("master.save", {
      table: "customers",
      record: {
        id: customer_id,
        name: f.customer_name.trim(),
        phone: f.customer_phone,
        address: f.customer_address,
        email: f.customer_email,
        salesman_id: f.salesman_id || null,
      },
    });
  }
  if (!S().customers.some((c) => c.id === customer_id))
    throw Error("Select a customer or use New customer");
  const payload = {
    ...draft,
    ...f,
    customer_id,
    salesman_id: f.salesman_id || null,
    discount_paisa: paisa(f.discount),
    items: draft.items.map((l) => ({
      product_id: l.product_id,
      cartons: num(l.cartons),
      loose_boxes: num(l.loose_boxes),
      rate_paisa: num(l.rate_paisa),
      override_reason: l.override_reason || "",
    })),
  };
  if (!quote && !draft.version) {
    const status = f.payment_status || "unpaid";
    const amount = status === "paid" ? null : status === "unpaid" ? 0 : paisa(f.payment_amount);
    if (status === "partial" && (!Number.isFinite(amount) || amount <= 0)) throw Error("Part payment must be greater than zero");
    payload.payment = { status, amount_paisa: amount, transaction_id: "PAY-ORDER-" + draft.id, date: f.payment_date || today(), method: f.payment_method || "Cash", cashbook_account_key: f.cashbook_account_key || "", reference: f.payment_reference || "", received_by: f.payment_received_by || user.name || user.email || "Owner", due_date: f.payment_due_date || addDays(today(),7) };
  }
  delete payload.quote;
  await store.run(quote ? "quote.save" : "order.save", payload);
  close();
  render();
  toast(
    store.queue.length
      ? "Saved on this device; pending sync"
      : "Saved successfully",
  );
}
function masterForm(kind, id) {
  const s = S(),
    maps = {
      product: "products",
      staff: "salesmen",
      customer: "customers",
      expense: "expenses",
    },
    tableName = maps[kind],
    r = id ? s[tableName].find((x) => x.id === id) : {},
    existing = !!id;
  let html = "";
  if (kind === "product") {
    html = `<div class="grid three">${field("Product ID (optional — auto-generated if blank)", "id", r.id || "", "text", existing ? "readonly" : "")}${field("Name", "name", r.name || "", "text", "required")}${field("Category", "category", r.category || "")}${field("Boxes per carton", "boxes_per_carton", r.boxes_per_carton || s.settings.boxes_per_carton, "number", 'min="1" step="1" required')}${field("Cost / box (Rs.)", "cost", num(r.cost_paisa) / 100, "number", 'min="0" step="0.01" required')}${field("Retail / box (Rs.)", "retail", num(r.retail_paisa) / 100, "number", 'min="0" step="0.01" required')}${field("Wholesale / box (Rs.)", "wholesale", num(r.wholesale_paisa) / 100, "number", 'min="0" step="0.01" required')}${field("Expiry date", "expiry_date", r.expiry_date || "", "date")}${select(
      "Status",
      "active",
      [
        ["true", "Active"],
        ["false", "Inactive"],
      ],
      r.active === false ? "false" : "true",
    )}</div><hr><div class="checkbox"><input id="product-override" name="product_override" type="checkbox" ${s.price_tiers.some((t) => t.product_id === id && !t.deleted_at) ? "checked" : ""}><label for="product-override">Use product-specific wholesale tier overrides (Rani products)</label></div><div class="grid" style="margin-top:16px">${(() => { const saved = s.price_tiers.filter(pt => pt.product_id === id && !pt.deleted_at).sort((a,b) => num(a.min_cartons)-num(b.min_cartons)); const rows = saved.length ? saved : s.settings.tiers; return rows.map((t, i) => field("Tier " + (i + 1) + " minimum cartons", "pt_min_" + i, t.min_cartons ?? t.min, "number", 'min="0" step="0.01" required') + field("Tier " + (i + 1) + " label", "pt_label_" + i, t.label, "text", "required") + field("Tier " + (i + 1) + " rate (Rs.)", "tier_" + i, (t.rate_paisa ?? 0) / 100, "number", 'min="0" step="0.01" required')).join(""); })()}</div><p class="muted">Tier minimums can be edited directly. Use unique minimums, including a first tier at 0 cartons.</p>`;
  }
  if (kind === "staff")
    html = `<div class="grid">${field("Name", "name", r.name || "", "text", "required")}${field("Phone", "phone", r.phone || "", "tel")}${field("Joining date", "joining_date", r.joining_date || today(), "date", 'min="2000-01-01" required')}${field("Base salary (Rs.)", "base_salary", num(r.base_salary_paisa ?? s.settings.base_salary_paisa) / 100, "number", 'min="0" step="0.01" required')}${field("Monthly target (cartons)", "monthly_target", r.monthly_target || s.settings.monthly_target, "number", 'min="1" step="0.01" required')}${select(
      "Status",
      "active",
      [
        ["true", "Active"],
        ["false", "Inactive"],
      ],
      r.active === false ? "false" : "true",
    )}${select("Link existing login (optional)", "user_id", [["", "No login"], ...s.profiles.map((p) => [p.id, p.display_name])], r.user_id || "")}${area("Personal holidays / off dates (YYYY-MM-DD, one per line)", "off_days", (r.off_days || []).join("\n"))}</div>`;
  if (kind === "customer")
    html = `<div class="grid">${field("Customer name", "name", r.name || "", "text", "required")}${field("Phone", "phone", r.phone || "", "tel")}${field("Email", "email", r.email || "", "email")}${field("Address", "address", r.address || "")}${select("Assigned salesman", "salesman_id", [["", "Unassigned"], ...visible(s.salesmen).map((x) => [x.id, x.name])], r.salesman_id || own()?.id || "")}</div>`;
  if (kind === "expense")
    html = `<div class="grid">${field("Date", "date", r.date || today(), "date", "required")}${field("Category", "category", r.category || "Misc", "text", 'list="expense-categories" required')}<datalist id="expense-categories">${["Rent", "Salaries", "Transport", "Utilities", "Packaging", "Marketing", "Misc"].map((x) => "<option>" + x + "</option>").join("")}</datalist>${field("Amount (Rs.)", "amount", num(r.amount_paisa) / 100, "number", 'min="0.01" step="0.01" required')}${select("Payment method", "method", ["Cash", "Bank", "JazzCash", "Easypaisa", "Cheque"], r.method || "Cash")}${select("Salesman (optional)", "salesman_id", [["", "Not linked"], ...visible(s.salesmen).map((x) => [x.id, x.name])], r.salesman_id || "")}${area("Description", "description", r.description || "")}<div class="field"><label for="receipt-file">Receipt image (optional, up to 5 MB)</label><input id="receipt-file" type="file" accept="image/jpeg,image/png,image/webp"></div></div>`;
  modal(
    (existing ? "Edit " : "New ") + kind,
    `<form id="master-form" data-kind="${kind}" data-id="${esc(id || "")}" novalidate>${html}<div id="master-form-error" role="alert" class="notice danger" style="display:none" aria-live="polite"></div><div class="actions" style="margin-top:22px"><button type="submit" class="gold">Save ${kind}</button></div></form>`,
  );
  if (kind === "product") {
    const form = $("master-form"), toggle = form?.querySelector('[name="product_override"]');
    const setTierFields = () => {
      const enabled = !!toggle?.checked;
      for (const el of form.querySelectorAll('[name^="pt_min_"],[name^="pt_label_"],[name^="tier_"]')) {
        el.disabled = !enabled;
        el.required = enabled;
      }
    };
    toggle?.addEventListener("change", setTierFields);
    setTierFields();
  }
}
const dates = (text) => {
  const a = text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (a.some((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x)))
    throw Error("Dates must use YYYY-MM-DD");
  return [...new Set(a)];
};
async function saveMaster(form) {
  const f = Object.fromEntries(new FormData(form)),
    kind = form.dataset.kind,
    tableName = {
      product: "products",
      staff: "salesmen",
      customer: "customers",
      expense: "expenses",
    }[kind],
    old = S()[tableName].find((x) => x.id === form.dataset.id);
  let generatedProductId = "";
  if (kind === "product" && !old && !String(f.id || "").trim()) {
    const categoryCode = String(f.category || "GEN").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 4) || "GEN";
    const used = new Set(S().products.map(p => String(p.id).toUpperCase()));
    let seq = 1;
    do { generatedProductId = `BC-${categoryCode}-${String(seq++).padStart(4, "0")}`; } while (used.has(generatedProductId.toUpperCase()));
  }
  let r = {
    id: old?.id || String(f.id || "").trim() || generatedProductId || ({ staff: "SP-", customer: "CU-", expense: "EXP-" }[kind] + uid()),
  };
  if (kind === "product")
    Object.assign(r, {
      name: f.name.trim(),
      category: f.category,
      boxes_per_carton: num(f.boxes_per_carton),
      cost_paisa: paisa(f.cost),
      retail_paisa: paisa(f.retail),
      wholesale_paisa: paisa(f.wholesale),
      expiry_date: f.expiry_date || null,
      active: f.active === "true",
    });
  if (kind === "staff")
    Object.assign(r, {
      name: f.name.trim(),
      phone: f.phone,
      joining_date: f.joining_date,
      base_salary_paisa: paisa(f.base_salary),
      monthly_target: num(f.monthly_target),
      active: f.active === "true",
      user_id: f.user_id || null,
      off_days: dates(f.off_days),
    });
  if (kind === "customer")
    Object.assign(r, {
      name: f.name.trim(),
      phone: f.phone,
      email: f.email,
      address: f.address,
      salesman_id: f.salesman_id || null,
    });
  if (kind === "expense") {
    Object.assign(r, {
      date: f.date,
      category: f.category.trim(),
      description: f.description,
      amount_paisa: paisa(f.amount),
      method: f.method,
      salesman_id: f.salesman_id || null,
      attachment_path: old?.attachment_path || null,
    });
    const file = $("receipt-file").files[0];
    if (file) {
      if (!client || !navigator.onLine)
        throw Error(
          "Receipt upload needs a connection. Save without attachment or reconnect.",
        );
      if (
        file.size > 5 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      )
        throw Error("Use a PNG, JPEG or WebP image up to 5 MB");
      const path =
        user.id +
        "/" +
        uid() +
        "." +
        (file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]);
      const { error } = await client.storage
        .from("expense-receipts")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      r.attachment_path = path;
    }
  }
  if (kind === "product") {
    r.id = String(r.id || "").trim();
    if (!r.id || r.id.length > 180 || !/^[A-Za-z0-9._:-]+$/.test(r.id)) throw Error("Product ID must be 1–180 characters using letters, numbers, dot, underscore, colon or hyphen");
    const idCollision = S().products.find(p => String(p.id).toLowerCase() === r.id.toLowerCase() && p.id !== old?.id);
    if (idCollision) throw Error(idCollision.deleted_at ? "This ID belongs to a deleted product. Restore that product or use a different ID." : "This Product ID is already in use. Choose a unique ID.");
    if (!r.name.trim()) throw Error("Product name is required");
    if (!Number.isInteger(r.boxes_per_carton) || r.boxes_per_carton < 1) throw Error("Boxes per carton must be at least 1");
    for (const [label, raw, value] of [["Cost", f.cost, r.cost_paisa], ["Retail price", f.retail, r.retail_paisa], ["Wholesale price", f.wholesale, r.wholesale_paisa]]) {
      if (raw == null || String(raw).trim() === "") throw Error(`${label} is required`);
      if (!Number.isSafeInteger(value) || value < 0) throw Error(`${label} must be a valid non-negative amount`);
    }
    const tierIndexes = Object.keys(f).filter(k => /^pt_min_\d+$/.test(k)).map(k => Number(k.slice(7))).sort((a,b)=>a-b);
    const overrides = tierIndexes.map(i => ({
      id: r.id + ":" + num(f["pt_min_" + i]), product_id: r.id,
      min_cartons: num(f["pt_min_" + i]), label: (f["pt_label_" + i] || "").trim(),
      rate_paisa: paisa(f["tier_" + i]),
    }));
    if (f.product_override === "on" && (!overrides.length || overrides.some(t => !Number.isFinite(t.min_cartons) || t.min_cartons < 0 || !Number.isSafeInteger(t.rate_paisa) || t.rate_paisa < 0) || Math.min(...overrides.map(t=>t.min_cartons)) !== 0 || new Set(overrides.map(t=>t.min_cartons)).size !== overrides.length || overrides.some(t=>!t.label))) throw Error("Product tiers need unique non-negative minimums starting at 0 and valid labels/rates");
    // Persist the generated ID into the still-open form before awaiting the
    // network. If the server partially accepts an older-schema fallback and a
    // later tier write fails, retrying edits the same ID instead of generating
    // a second product.
    const idInput = form.querySelector('[name="id"]');
    if (idInput) idInput.value = r.id;
    form.dataset.id = r.id;
    await store.run("product.save", { record:r, expected_version:old?.version, tiers:f.product_override === "on" ? overrides : [] });
  } else {
    await store.run("master.save", { table: tableName, record: r, expected_version: old?.version });
  }
  close();
  render();
  toast(kind === "product" ? (old ? "Product updated" : "Product created") : "Saved");
}
function showDocument(id, quote = false) {
  activeDoc = documentData(S(), id, quote ? "quote" : "invoice");
  const pending = store.queue.length > 0;
  const key = "blesscon:template:" + user.id + ":" + activeDoc.type;
  const documentKey = key + ":" + activeDoc.document.id;
  activeTemplate = localStorage.getItem(documentKey) || localStorage.getItem(key) || "classic";
  const payState = activeDoc.invoice ? invoiceState(activeDoc.invoice, S().payments) : { balance: 0 };
  const canCollect = !quote && payState.balance > 0 && (admin() || S().user_permissions.some(p => p.user_id === user.id && p.section === "invoices" && p.can_create));
  const renderView = () => `<div class="actions doc-tools">${canCollect ? btn("Receive payment", "add-payment", activeDoc.invoice.id, "", "gold") : ""}<div class="field"><label for="document-template">Template</label><select id="document-template">${(DOCUMENT_TEMPLATES[activeDoc.type] || DOCUMENT_TEMPLATES.invoice).map(t=>`<option value="${t.id}" ${t.id===activeTemplate?"selected":""}>${esc(t.label)}</option>`).join("")}</select></div>${btn("Print", "doc-print")}${btn("Download PDF", "doc-pdf")}${btn("Share PDF", "doc-share")}${btn("WhatsApp", "doc-whatsapp")}${btn("Email", "doc-email")}${btn("Copy public link", "doc-link")}${btn("Revoke public link", "doc-revoke")}</div><div id="document-preview">${documentHTML(activeDoc, pending, activeTemplate)}</div>`;
  modal((quote ? "Quotation " : "Invoice ") + activeDoc.document.number, renderView());
}
function cashbookPaymentAccountField() {
  if (!S().cashbook_loaded && !user?.practice) return "";
  const accounts=S().cashbook_accounts.filter(a=>a.active && a.account_type!=="receivable");
  return select("Specific receiving account (optional)","cashbook_account_key",[["","Automatic from method / salesman"],...accounts.map(a=>[a.account_key,a.label])],"");
}
function paymentModal(id) {
  const i = S().invoices.find((x) => x.id === id),
    p = invoiceState(i, S().payments);
  modal(
    "Receive payment · " + i.number,
    `<div class="notice"><b>Invoice:</b> ${esc(i.number)} · <b>Customer:</b> ${esc(customerName(S().orders.find(o=>o.id===i.order_id)?.customer_id))}<br><b>Total:</b> ${money(i.total_paisa)} · <b>Already paid:</b> ${money(p.paid)} · <b>Balance due:</b> ${money(p.balance)} · ${badge(p.status)}</div><form id="payment-form" data-id="${id}"><div class="grid">${field("Date", "date", today(), "date", "required")}${field("Amount received now (Rs.)", "amount", p.balance / 100, "number", 'min="0.01" step="0.01" required')}<button type="button" class="secondary" data-act="pay-full-balance" data-id="${id}">Pay full balance</button>${select("Method", "method", ["Cash", "Bank", "JazzCash", "Easypaisa", "Cheque"])}${cashbookPaymentAccountField()}${field("Reference", "reference")}${field("Received by", "received_by", user.name || user.email || "Owner", "text", "required")}</div><button class="gold" style="margin-top:20px">Record payment</button></form>`,
  );
}
function refreshStockMovementPreview(form) {
  if (!form || form.id !== "stock-form") return;
  const productId = form.elements.namedItem("product_id")?.value || "";
  const product = S().products.find((item) => String(item.id) === String(productId));
  const packOutput = form.querySelector("#stock-pack-size");
  const totalOutput = form.querySelector("#stock-quantity-preview");
  const cartonsInput = form.elements.namedItem("cartons");
  const looseInput = form.elements.namedItem("loose_boxes");
  const per = Number(product?.boxes_per_carton || 0);
  if (packOutput) packOutput.textContent = product && Number.isSafeInteger(per) && per > 0 ? `${per} boxes per carton` : "Select a product";
  const cartons = Number(cartonsInput?.value || 0);
  const loose = Number(looseInput?.value || 0);
  const valid = product && Number.isSafeInteger(per) && per > 0 && Number.isSafeInteger(cartons) && cartons >= 0 && Number.isSafeInteger(loose) && loose >= 0;
  const total = valid ? cartons * per + loose : 0;
  if (totalOutput) totalOutput.textContent = `Total: ${Number.isSafeInteger(total) ? total.toLocaleString() : "0"} boxes`;
}
function stockModal() {
  modal(
    "Stock movement",
    `<form id="stock-form"><div class="grid">${select(
      "Product",
      "product_id",
      visible(S().products).map((p) => [p.id, p.name]),
    )}${field("Date", "date", today(), "date", "required")}${select(
      "Movement type",
      "kind",
      [
        ["in", "Stock received"],
        ["out", "Stock out"],
        ["damage", "Damaged"],
        ["adjustment", "Adjustment (signed boxes)"],
        ["opening", "Opening stock"],
      ],
    )}${field("Cartons", "cartons", 0, "number", 'min="0" step="1" required')}${field("Loose boxes", "loose_boxes", 0, "number", 'min="0" step="1" required')}<div class="field"><label for="stock-pack-size">Boxes per carton</label><output id="stock-pack-size">Select a product</output></div><div class="field"><label for="stock-quantity-preview">Total movement</label><output id="stock-quantity-preview">Total: 0 boxes</output></div>${field("Transaction reference", "transaction_id", "ST-" + uid(), "text", "required")}${area("Note", "note")}</div><p class="muted">Enter cartons and any extra loose boxes. The total is converted to boxes automatically.</p><button class="gold" style="margin-top:20px">Save movement</button></form>`, 
  );
}
function renderStockOperationLines(type) {
  const count = type === "issue" ? stockIssueLineCount : stockReturnLineCount;
  const products = visible(S().products).filter(
    (product) => type === "return" || product.active,
  );
  const lines = Array.from({ length: count }, (_, index) =>
    `<div class="stock-operation-line" data-stock-line="${index}">${select("Product", `product_id-${index}`, products.map((product) => [product.id, `${product.name} · ${product.boxes_per_carton} boxes/carton`]))}${field("Cartons", `cartons-${index}`, 0, "number", 'min="0" step="1" required')}${field("Loose boxes", `loose_boxes-${index}`, 0, "number", 'min="0" step="1" required')}${count > 1 ? `<button type="button" class="icon-button" aria-label="Remove product line ${index + 1}" data-act="stock-remove-line" data-id="${type}:${index}">×</button>` : ""}</div>`,
  );
  $(`stock-${type}-lines`).innerHTML = lines.join("");
}
function stockOperationItems(form, prefix) {
  const combined = new Map();
  for (const row of form.querySelectorAll("[data-stock-line]")) {
    const productId = row.querySelector('[name^="product_id-"]')?.value;
    const cartons = Number(row.querySelector('[name^="cartons-"]')?.value);
    const loose = Number(row.querySelector('[name^="loose_boxes-"]')?.value);
    if (!productId) throw Error("Choose a product for each line");
    if (!Number.isSafeInteger(cartons) || cartons < 0 || !Number.isSafeInteger(loose) || loose < 0)
      throw Error("Cartons and loose boxes must be whole nonnegative quantities");
    const product = S().products.find((item) => item.id === productId);
    if (!product) throw Error("Choose a valid product for each line");
    const boxes = cartons * Number(product.boxes_per_carton || 0) + loose;
    if (!Number.isSafeInteger(boxes) || boxes <= 0)
      throw Error("Enter a positive quantity on each product line");
    const item = combined.get(productId) || { product_id: productId, boxes };
    if (combined.has(productId)) item.boxes += boxes;
    combined.set(productId, item);
  }
  return [...combined.values()].map((item) => ({
    ...item,
    transaction_id: prefix + uid(),
  }));
}
function stockIssueModal() {
  stockIssueLineCount = 1;
  modal(
    "Issue stock to salesman",
    `<form id="stock-issue-form"><div class="grid">${select("Salesman", "salesman_id", visible(S().salesmen).filter((row) => row.active).map((row) => [row.id, row.name]))}${field("Issue date", "date", today(), "date", "required")}${field("Voucher reference", "reference", "STI-" + uid(), "text", "required")}</div><div class="panel-heading"><h3>Products to issue</h3>${btn("+ Add product", "stock-add-line", "issue", 'type="button"')}</div><div id="stock-issue-lines"></div>${area("Notes", "note")}<p class="muted">All lines are validated and saved together. Cartons use each product's own pack size.</p><div id="stock-operation-error" class="notice danger" role="alert" style="display:none"></div><button type="submit" class="gold" style="margin-top:20px">Confirm stock issue</button></form>`,
  );
  renderStockOperationLines("issue");
}
function stockReturnModal() {
  stockReturnLineCount = 1;
  const sellers = visible(S().salesmen).filter((row) => row.active);
  const chosen = own()?.id || sellers[0]?.id || "";
  modal(
    "Receive stock return",
    `<form id="stock-return-form"><div class="grid">${admin() || canStockWrite() ? select("Salesman", "salesman_id", sellers.map((row) => [row.id, row.name]), chosen) : `<input type="hidden" name="salesman_id" value="${esc(chosen)}"><div class="field"><label>Salesman</label><input value="${esc(salesmanName(chosen))}" readonly></div>`}${field("Return date", "date", today(), "date", "required")}${select("Condition", "condition", [["saleable", "Saleable"], ["damaged", "Damaged"], ["expired", "Expired"], ["unsaleable", "Other unsaleable"]])}${field("Return voucher", "reference", "STR-" + uid(), "text", "required")}</div><div class="panel-heading"><h3>Products received</h3>${btn("+ Add product", "stock-add-line", "return", 'type="button"')}</div><div id="stock-return-lines"></div>${area("Reason / notes", "note")}<p class="muted">All lines share this return condition and save together. Only saleable returns increase available warehouse stock.</p><div id="stock-operation-error" class="notice danger" role="alert" style="display:none"></div><button type="submit" class="gold" style="margin-top:20px">Record stock return</button></form>`,
  );
  renderStockOperationLines("return");
}
function closingStockFields(salesmanId, date) {
  const expected = expectedClosingStock(salesmanId, date);
  return visible(S().products)
    .map((product) => {
      const productId = product.id;
      const boxes = Number(expected[productId] || 0);
      return `<div class="field"><label for="closing-count-${esc(productId)}">${esc(product?.name || productId)} · expected ${boxes} boxes</label><input id="closing-count-${esc(productId)}" name="stock-${esc(productId)}" data-stock-count="${esc(productId)}" type="number" min="0" step="1" value="${boxes}" required></div>`;
    })
    .join("");
}
function openingCashFor(salesmanId, date) {
  return Number(
    S().daily_closings
      .filter(
        (row) =>
          row.salesman_id === salesmanId &&
          row.business_date < date &&
          row.status === "approved",
      )
      .sort((a, b) => b.business_date.localeCompare(a.business_date))[0]
      ?.actual_cash_paisa || 0,
  );
}
const CLOSING_BALANCE_FIELDS = [
  ["cash_in_bank", "Cash in Bank"],
  ["cash_in_hand", "Cash in Hand"],
  ["cash_in_easypaisa", "Cash in Easypaisa"],
  ["cash_in_jazzcash", "Cash in Jazz Cash"],
  ["market_credit", "Market Credit"],
];
function closingBalanceTotal(closing) {
  return CLOSING_BALANCE_FIELDS.reduce(
    (sum, [name]) => sum + Number(closing?.[name + "_paisa"] || 0),
    0,
  );
}
function closingModal() {
  const sellers = visible(S().salesmen).filter((row) => row.active);
  const salesmanId = own()?.id || sellers[0]?.id || "";
  const date = today();
  const opening = openingCashFor(salesmanId, date);
  const expectedCash = expectedClosingCash(salesmanId, date, opening, 0);
  const stockFields = closingStockFields(salesmanId, date);
  modal(
    "Submit daily closing",
    `<form id="closing-form">${admin() ? select("Salesman", "closing_salesman", sellers.map((row) => [row.id, row.name]), salesmanId) : `<input type="hidden" name="closing_salesman" value="${esc(salesmanId)}"><div class="field"><label>Salesman</label><input value="${esc(salesmanName(salesmanId))}" readonly></div>`}<div class="grid">${field("Business date", "date", date, "date", 'required data-closing-date')}${field("Opening cash (Rs.)", "opening_cash", opening / 100, "number", 'min="0" step="0.01" required data-closing-cash')}${field("Cash handed over / deposited (Rs.)", "cash_handed_over", "0.00", "number", 'min="0" step="0.01" required data-closing-cash')}${field("Actual cash counted (Rs.)", "actual_cash", (expectedCash / 100).toFixed(2), "number", 'min="0" step="0.01" required data-closing-cash')}</div><div class="notice" id="closing-cash-estimate" aria-live="polite">Expected cash: ${money(expectedCash)}</div><h3>Closing balances</h3><p class="muted">Enter the balance held in each place at the end of the day. These are recorded with the closing and do not affect the cash variance.</p><div class="grid">${CLOSING_BALANCE_FIELDS.map(([name, label]) => field(label + " (Rs.)", name, "0.00", "number", 'min="0" step="0.01" required')).join("")}</div><h3>Physical salesman stock count</h3><div id="closing-stock-fields" class="grid">${stockFields || '<p class="muted">No salesman stock movements exist for this account.</p>'}</div>${area("Variance reason (required when cash or stock differs)", "reason")}${area("Closing notes", "notes")}<button class="gold" style="margin-top:20px">Submit for management approval</button></form>`,
  );
}
function targetsModal(id) {
  const staff = S().salesmen.find((x) => x.id === id);
  modal(
    "Daily tracking · " + staff.name,
    `<p>Base target follows this salesman’s working days each month. Today's shortfall is provisional until the day closes.</p>${table(
      [
        "Date",
        "Base",
        "Carry in",
        "Effective",
        "Achieved ct",
        "Boxes",
        "Sales",
        "Shortfall",
        "Surplus",
        "Carry out",
      ],
      S()
        .salesman_daily_targets.filter(
          (d) => d.salesman_id === id && d.date >= monthStart(today()),
        )
        .map((d) => [
          esc(d.date),
          num(d.base_target).toFixed(2),
          num(d.carried_forward_in).toFixed(2),
          num(d.effective_target).toFixed(2),
          num(d.achieved_cartons).toFixed(2),
          d.achieved_boxes,
          money(d.sales_amount),
          num(d.shortfall).toFixed(2),
          num(d.surplus).toFixed(2),
          num(d.carried_forward_out).toFixed(2),
        ]),
    )}`,
  );
}
async function postSalary(id, month = today().slice(0, 7), automatic = false) {
  const s = S().salesmen.find((x) => x.id === id);
  const achieved = S()
      .salesman_daily_targets.filter(
        (d) => d.salesman_id === id && d.date.startsWith(month),
      )
      .reduce((a, d) => a + num(d.achieved_cartons), 0),
    pay = salary(s, achieved, S().settings);
  const old = S().expenses.find(
    (e) => e.salesman_id === id && e.salary_period === month,
  );
  if (old && !old.deleted_at) {
    if (automatic) return;
    throw Error("Salary already posted for " + month);
  }
  if (
    !automatic &&
    !confirm(
      `Post ${money(pay.total)} salary for ${s.name} (${month})? Base plus earned incentive; advances and deductions are not included.`,
    )
  )
    return;
  await store.run("master.save", {
    table: "expenses",
    record: {
      id: old?.id || "SAL-" + id + "-" + month,
      date: monthEnd(month + "-01"),
      category: "Salaries",
      description:
        s.name + " — base + incentive (" + achieved.toFixed(2) + " cartons)",
      amount_paisa: pay.total,
      method: "Bank",
      salesman_id: id,
      salary_period: month,
    },
    expected_version: old?.version,
  });
  if (!automatic) toast("Salary expense posted");
}
async function saveSettings(form) {
  const f = new FormData(form),
    s = { ...S().settings };
  for (const k of [
    "company_name",
    "phone",
    "email",
    "website",
    "address",
    "ntn",
    "bank_details",
    "terms",
    "signature_name",
  ])
    s[k] = String(f.get(k) || "");
  for (const k of ["boxes_per_carton", "low_stock_boxes", "monthly_target", "company_monthly_target"])
    s[k] = num(f.get(k));
  s.base_salary_paisa = paisa(f.get("base_salary"));
  for (const k of [
    "block_negative_stock",
    "allow_customer_credit",
    "auto_salary_expense",
    "carry_month_end",
    "reduce_by_surplus",
  ])
    s[k] = f.has(k);
  s.working_days = f.getAll("working_day").map(Number);
  if (!s.working_days.length) throw Error("Choose at least one working day");
  s.holidays = dates(String(f.get("holidays")));
  s.tiers = s.tiers
    .map((t, i) => ({
      min: num(f.get("tier_min_" + i)),
      label: String(f.get("tier_label_" + i)),
      rate_paisa: paisa(f.get("tier_rate_" + i)),
    }))
    .sort((a, b) => a.min - b.min);
  if (
    s.tiers[0].min !== 0 ||
    new Set(s.tiers.map((t) => t.min)).size !== s.tiers.length
  )
    throw Error("Tier minimums must be unique and start at 0");
  s.incentives = s.incentives
    .map((t, i) => ({
      min: num(f.get("incentive_min_" + i)),
      amount_paisa: paisa(f.get("incentive_amount_" + i)),
    }))
    .sort((a, b) => a.min - b.min);
  const file = $("signature-file").files[0];
  if (file) {
    if (file.size > 100000 || !["image/png", "image/jpeg"].includes(file.type))
      throw Error("Signature must be PNG/JPEG up to 100 KB");
    s.signature_data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  await store.run("master.save", {
    table: "settings",
    record: { id: "business", value: s },
    expected_version: S().settings_version,
  });
  render();
  toast("Settings saved");
}
function userModal(id) {
  const p = S().profiles.find((p) => p.id === id),
    role = S().user_roles.find((r) => r.user_id === id)?.role || "salesman";
  if (!id) {
    modal(
      "Create login",
      `<form id="create-user-form"><div class="grid">${field("Display name", "display_name", "", "text", "required")}${field("Email", "email", "", "email", "required")}${field("Temporary password", "temporary_password", "", "password", 'minlength="12" autocomplete="new-password" required')}${select("Role", "role", ["salesman", "manager", "user", "admin"], "salesman")}${select(
        "Link salesman (optional)",
        "salesman_id",
        [
          ["", "No link"],
          ...S()
            .salesmen.filter((x) => !x.user_id)
            .map((s) => [s.id, s.name]),
        ],
      )}</div><p class="muted">The login is created without sending an email. Share the temporary password securely and ask the user to change it.</p><button class="gold">Create login</button></form>`,
    );
    return;
  }
  const linkedSeller = S().salesmen.find((seller) => seller.user_id === id);
  const sellerChoices = [
    ["__create__", linkedSeller ? "Keep / repair this salesman profile" : "Create and link a salesman profile"],
    ...S().salesmen
      .filter((seller) => !seller.user_id || seller.user_id === id)
      .map((seller) => [seller.id, `${seller.name}${seller.user_id === id ? " (currently linked)" : ""}`]),
  ];
  modal(
    "Access · " + p.display_name,
    `<form id="user-form" data-id="${id}"><div class="grid">${select("Role", "role", ["salesman", "manager", "user", "admin"], role)}${select(
      "Status",
      "active",
      [
        ["true", "Active"],
        ["false", "Inactive"],
      ],
      String(p.active),
    )}${select("Link salesman profile", "salesman_id", sellerChoices, linkedSeller?.id || "__create__")}</div><p class="muted">For a salesman login, select an existing unlinked salesman or create a linked profile. This makes the account available in Salesmen & Targets, stock assignment and sales dropdowns.</p><p>Optional payment collection permission:</p><div class="checkbox"><input id="can-collect" name="can_collect" type="checkbox" ${S().user_permissions.some((x) => x.user_id === id && x.section === "invoices" && x.can_create) ? "checked" : ""}><label for="can-collect">Allow collecting invoice payments</label></div><button class="gold" style="margin-top:20px">Save access</button></form>`,
  );
}
async function previewImport(file) {
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) throw Error("Workbook limit: 25 MB");
  if (!globalThis.XLSX) throw Error("Excel library unavailable");
  toast("Reading workbook…");
  preview = readFile(await file.arrayBuffer(), globalThis.XLSX, S());
  preview.cursor = Math.max(0, ...S().audit_log.map((a) => num(a.id)));
  const rows = Object.entries(preview.summary).map(([k, v]) => [
    esc(k.replaceAll("_", " ")),
    v.count,
    v.created,
    v.updated,
    v.unchanged,
  ]);
  modal(
    "Import Report",
    `<p>The entire batch will be committed together. No separate page saves are needed.</p>${table(["Section", "Rows", "New", "Changed", "Unchanged"], rows)}${preview.errors.length ? `<div class="notice danger" style="margin-top:18px"><b>${preview.errors.length} blocking errors</b><ul>${preview.errors.map((x) => "<li>" + esc(x) + "</li>").join("")}</ul></div>` : ""}<details open style="margin-top:18px"><summary>${preview.warnings.length} warnings</summary><ul>${preview.warnings.map((x) => "<li>" + esc(x) + "</li>").join("")}</ul></details><div class="actions">${btn("Download report", "import-report")}${btn("Import all pages", "confirm-import", "", preview.errors.length ? "disabled" : "", "gold")}</div>`,
  );
}
async function docAction(act) {
  if (!activeDoc) throw Error("Open a document first");
  if (act === "doc-print") {
    $("print-area").innerHTML = documentHTML(
      activeDoc,
      (store?.queue.length || 0) > 0,
      activeTemplate,
    );
    window.print();
    return;
  }
  if (store?.queue.length)
    throw Error("Sync changes before downloading or sharing a final document");
  if (act === "doc-pdf") {
    makePDF(activeDoc, globalThis.jspdf?.jsPDF, activeTemplate).save(activeDoc.document.number + ".pdf");
    return;
  }
  if (act === "doc-share") {
    const blob = makePDF(activeDoc, globalThis.jspdf?.jsPDF, activeTemplate).output("blob"),
      file = new File([blob], activeDoc.document.number + ".pdf", {
        type: "application/pdf",
      });
    if (navigator.canShare?.({ files: [file] }))
      await navigator.share({
        title: activeDoc.document.number,
        text: shareText(activeDoc),
        files: [file],
      });
    else {
      download(file.name, file, "application/pdf");
      toast("PDF downloaded. Attach it in WhatsApp or email.");
    }
    return;
  }
  if (act === "doc-whatsapp") {
    window.open(
      whatsappURL(activeDoc.customer.phone, shareText(activeDoc)),
      "_blank",
      "noopener,noreferrer",
    );
    return;
  }
  if (act === "doc-email") {
    location.href =
      "mailto:" +
      encodeURIComponent(activeDoc.customer.email || "") +
      "?subject=" +
      encodeURIComponent(
        activeDoc.document.number + " · " + activeDoc.settings.company_name,
      ) +
      "&body=" +
      encodeURIComponent(shareText(activeDoc));
    return;
  }
  const type = activeDoc.type,
    id = type === "quote" ? activeDoc.document.id : activeDoc.invoice.id;
  if (act === "doc-link") {
    const r = await store.run("share.create", { id, type });
    const url = new URL(location.href);
    url.hash = "share=" + r.token;
    url.search = "";
    await navigator.clipboard.writeText(url.href);
    toast("Read-only link copied. Expires in 30 days.");
  }
  if (act === "doc-revoke") {
    await store.run("share.revoke", { id, type });
    toast("Public link revoked");
  }
}
async function action(act, id, element) {
  if (act.startsWith("doc-")) return docAction(act);
  switch (act) {
    case "menu":
      $("sidebar").classList.toggle("open");
      break;
    case "admin-profile-photo-upload": {
      if (!admin()) throw Error("Only an administrator can update this profile picture.");
      const file = $("admin-profile-photo")?.files?.[0];
      if (!file) throw Error("Choose a photo first.");
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5*1024*1024) throw Error("Use a JPG, PNG or WebP image up to 5 MB.");
      const path = `${user.id}/admin-profile-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      const bucket = client.storage.from("employee-private");
      const uploaded = await bucket.upload(path, file, {contentType:file.type, upsert:false});
      if (uploaded.error) throw uploaded.error;
      const saved = await client.from("profiles").update({avatar_path:path, updated_at:new Date().toISOString()}).eq("id", user.id);
      if (saved.error) { await bucket.remove([path]); throw saved.error; }
      const signed = await bucket.createSignedUrl(path, 3600);
      if (signed.error) throw signed.error;
      const avatar = $("admin-profile-avatar");
      if (avatar && signed.data?.signedUrl) avatar.innerHTML = `<img src="${esc(signed.data.signedUrl)}" alt="Administrator profile photo">`;
      const profile = S().profiles?.find((p) => String(p.id) === String(user.id));
      if (profile) profile.avatar_path = path;
      toast("Administrator profile picture uploaded.");
      break;
    }
    case "profile-photo-upload": {
      const seller = own(), file = $("profile-photo")?.files?.[0];
      if (!seller) throw Error("Your login is not linked to a salesman profile.");
      if (!file) throw Error("Choose a photo first.");
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5*1024*1024) throw Error("Use a JPG, PNG or WebP image up to 5 MB.");
      const path = `${user.id}/profile-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      const up = await client.storage.from("employee-private").upload(path,file,{contentType:file.type,upsert:false});
      if (up.error) throw up.error;
      const { data: signed, error: signErr } = await client.storage.from("employee-private").createSignedUrl(path,3600);
      if (signErr) throw signErr;
      const { error } = await client.from("salesmen").update({photo_path:path}).eq("id",seller.id);
      if (error) throw error;
      seller.photo_url = signed.signedUrl; seller.photo_path = path; render(); toast("Profile photo uploaded."); break;
    }
    case "employee-document-upload": {
      const seller = own(), file = $("employee-document-file")?.files?.[0], type = $("employee-document-type")?.value || "other";
      if (!seller) throw Error("Your login is not linked to a salesman profile.");
      if (!file) throw Error("Choose a document first.");
      if (!(file.type === "application/pdf" || /^image\/(jpeg|png|webp)$/.test(file.type)) || file.size > 10*1024*1024) throw Error("Use PDF, JPG, PNG or WebP up to 10 MB.");
      const path = `${user.id}/documents/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      const up = await client.storage.from("employee-private").upload(path,file,{contentType:file.type,upsert:false});
      if (up.error) throw up.error;
      const { error } = await client.from("employee_documents").insert({salesman_id:seller.id,document_type:type,file_path:path,file_name:file.name,mime_type:file.type,size_bytes:file.size});
      if (error) { await client.storage.from("employee-private").remove([path]); throw error; }
      toast("Document uploaded securely."); $("employee-document-file").value=""; break;
    }
    case "attendance-check-in":
    case "attendance-check-out": {
      const seller = own(); if (!seller || seller.id !== id) throw Error("You can only record your own attendance.");
      const { data: existing, error: readErr } = await client.from("attendance_records").select("*").eq("salesman_id",seller.id).eq("attendance_date",today()).maybeSingle();
      if (readErr) throw readErr;
      if (act === "attendance-check-in") {
        if (existing?.check_in_at) throw Error("You have already checked in today.");
        let checkInCoords = null;
        if (navigator.geolocation) {
          try { checkInCoords = await new Promise((resolve) => navigator.geolocation.getCurrentPosition(pos => resolve({latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy}), () => resolve(null), {enableHighAccuracy:true,timeout:10000,maximumAge:60000})); } catch (_) { checkInCoords = null; }
        }
        const { error } = await client.from("attendance_records").insert({salesman_id:seller.id,attendance_date:today(),check_in_at:new Date().toISOString(),status:"present",check_in_latitude:checkInCoords?.latitude ?? null,check_in_longitude:checkInCoords?.longitude ?? null,check_in_location_accuracy_m:checkInCoords?.accuracy ?? null}); if(error) throw error;
        toast(checkInCoords ? "Check-in recorded with location." : "Check-in recorded. Location was not available or permission was declined.");
      } else {
        if (!existing?.check_in_at) throw Error("Check in before checking out."); if(existing.check_out_at) throw Error("You have already checked out today.");
        const { error } = await client.from("attendance_records").update({check_out_at:new Date().toISOString()}).eq("id",existing.id); if(error) throw error; toast("Check-out recorded.");
      }
      break;
    }
    case "visit-save":
    case "visit-save-location": {
      const seller = own(); if (!seller || seller.id !== id) throw Error("You can only record your own visits.");
      const save = async (coords=null) => { const customer = $("f-visit-customer")?.value.trim() || ""; const areaName = $("f-visit-area")?.value.trim() || ""; if(!customer && !areaName) throw Error("Enter a customer name/ID or area."); const {error}=await client.from("customer_visits").insert({salesman_id:seller.id,customer_label:customer,area:areaName,purpose:$("f-visit-purpose")?.value || "Sales visit",notes:$("f-visit-notes")?.value || "",latitude:coords?.latitude ?? null,longitude:coords?.longitude ?? null,location_accuracy_m:coords?.accuracy ?? null,visited_at:new Date().toISOString()}); if(error) throw error; toast("Customer visit recorded."); $("f-visit-notes").value=""; };
      if(act === "visit-save-location") { if(!navigator.geolocation) throw Error("This device does not support GPS. Save the visit without location instead."); await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(async pos=>{try{await save(pos.coords);resolve();}catch(err){reject(err);}},()=>reject(Error("Location permission was denied or unavailable. You can save the visit without GPS.")),{enableHighAccuracy:true,timeout:12000,maximumAge:60000})); } else await save();
      break;
    }
    case "cashbook-today":
      cashbookDate = today(); render(); break;
    case "cashbook-close-approve":
      if (!mgmt()) throw Error("Management approval required");
      await store.run("cashbook.close.approve",{closing_id:id});
      await store.refresh?.();
      render();
      toast("Daily closing approved. Any variance was posted as an audited adjustment.");
      break;
    case "cashbook-transfer":
      if (!mgmt()) throw Error("Management access required");
      {
        const { accounts } = cashbookData();
        const opts = accounts.filter(a => a.active && a.account_type !== "receivable").map(a => [a.account_key,a.label]);
        modal("Transfer between accounts", `<form id="cashbook-form" data-kind="transfer">${field("Date","date",cashbookDate,"date","required")}${select("From account","source_account",opts,"cash_hand")}${select("To account","destination_account",opts,"bank_default")}${field("Amount (Rs.)","amount","","number",'min="0.01" step="0.01" required')}${field("Reference (optional)","reference")}${area("Description","description","Account transfer") }<div class="actions"><button class="gold" type="submit">Confirm transfer</button></div></form>`);
      }
      break;
    case "cashbook-handover":
      if (user?.role!=="salesman") throw Error("Salesman login required");
      {
        const { accounts } = cashbookData();
        const opts=accounts.filter(a=>a.active && a.account_type==="salesman" && a.salesman_id===own()?.id && a.payment_method==="Cash").map(a=>[a.account_key,a.label]);
        if (!opts.length) throw Error("Your cash collection account is not configured. Ask management to refresh the Cash & Bank Book migration.");
        modal("Hand over cash to office", `<p class="notice">This transfers the amount out of your cash collection and into the office Cash in Hand account. It does not duplicate or delete the original receipt.</p><form id="cashbook-form" data-kind="handover">${field("Date","date",cashbookDate,"date","required")}${select("Your cash collection","source_account",opts,opts[0][0])}${field("Amount (Rs.)","amount","","number",'min="0.01" step="0.01" required')}${field("Reference (optional)","reference")}${area("Note","description","Cash handed to office")}<div class="actions"><button class="gold" type="submit">Submit cash handover</button></div></form>`);
      }
      break;
    case "cashbook-adjust":
      if (!mgmt()) throw Error("Management access required");
      {
        const { accounts } = cashbookData();
        modal("Cashbook adjustment", `<p class="notice">Adjustments are audited and require a clear reason. Use a negative amount to decrease an account.</p><form id="cashbook-form" data-kind="adjustment">${field("Date","date",cashbookDate,"date","required")}${select("Account","account_key",accounts.filter(a=>a.active).map(a=>[a.account_key,a.label]),"cash_hand")}${field("Signed amount (Rs.)","amount","","number",'step="0.01" required')}${field("Reference (optional)","reference")}${area("Reason (required)","description","") }<div class="actions"><button class="gold" type="submit">Record adjustment</button></div></form>`);
      }
      break;
    case "cashbook-add-account":
      if (!admin()) throw Error("Only Admin can configure accounts");
      modal("Add bank / wallet account", `<form id="cashbook-form" data-kind="account">${field("Account key (letters, numbers, _ : -)","account_key","","text",'pattern="[a-z][a-z0-9_:-]{2,79}" required')}${field("Display name","label","","text","required")}${select("Account type","account_type", [["bank","Bank"],["wallet","Digital wallet"]],"bank")}${select("Payment method mapping","payment_method",[["Bank","Bank"],["Easypaisa","EasyPaisa"],["JazzCash","JazzCash"]],"Bank")}${field("Opening balance (Rs.)","opening_balance","0","number",'min="0" step="0.01" value="0" required')}<div class="actions"><button class="gold" type="submit">Save account</button></div></form>`);
      break;
    case "cashbook-csv": {
      const { accounts, entries } = cashbookData();
      const rows = [["Date","Reference","Description","Account","Amount PKR","Type","Source"], ...entries.filter(e=>e.business_date===cashbookDate && (mgmt() || !e.salesman_id || e.salesman_id===own()?.id)).map(e=>[e.business_date,e.reference||e.transaction_id,e.description,accounts.find(a=>a.account_key===e.account_key)?.label||e.account_key,num(e.amount_paisa)/100,e.entry_type,e.source_table])];
      const safe = value => { let v=String(value??""); if(/^[=+@-]/.test(v)) v="'"+v; return '"'+v.replaceAll('"','""')+'"'; };
      download(`Blesscon_Cash_Bank_Book_${cashbookDate}.csv`,rows.map(r=>r.map(safe).join(",")).join("\\r\\n"),"text/csv");
      break;
    }
    case "cashbook-print": {
      const content = $("page").innerHTML;
      $("print-area").innerHTML = `<article class="document"><header class="doc-head"><img src="${ICON}" alt="Blesscon Candy"><div><h1>Cash & Bank Book</h1><p>${esc(cashbookDate)}</p></div></header>${content}</article>`;
      window.print();
      break;
    }
    case "new-order":
      openEditor(false);
      break;
    case "new-quote":
      openEditor(true);
      break;
    case "edit-order":
      openEditor(false, id);
      break;
    case "edit-quote":
      openEditor(true, id);
      break;
    case "view-order":
      showDocument(id);
      break;
    case "view-quote":
      showDocument(id, true);
      break;
    case "go-stock":
      page = "stock";
      render();
      break;
    case "go-myprofile": page = "myprofile"; render(); break;
    case "go-myorders": page = "orders"; render(); break;
    case "go-closing": page = "closing"; render(); break;
    case "go-dsr":
      page = "dsr";
      render();
      break;
    case "go-staff":
      page = "staff";
      render();
      break;
    case "quick-customer":
      $("f-customer_id").value = "__new__";
      $("new-customer-fields").style.display = "grid";
      $("f-customer_name").focus();
      break;
    case "add-line":
      draft.items.push({
        product_id: visible(S().products).find((p) => p.active && (user?.role !== "salesman" || heldStock(p.id, own()?.id) > 0))?.id || "",
        cartons: 1,
        loose_boxes: 0,
      });
      renderLines();
      calcEditor();
      {
        const last = draft.items.length - 1;
        const row = document.querySelector('[data-line="' + last + '"]');
        row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        $("line-search-" + last)?.focus({ preventScroll: true });
      }
      break;
    case "remove-line":
      draft.items.splice(num(id), 1);
      renderLines();
      calcEditor();
      break;
    case "add-product":
      masterForm("product");
      break;
    case "edit-product":
      masterForm("product", id);
      break;
    case "toggle-product": {
      if (!admin()) throw Error("Admin required");
      const p = S().products.find(x=>x.id===id);
      if (!p) throw Error("Product not found");
      await store.run("product.save", { record:{...p,active:!p.active}, expected_version:p.version, tiers:S().price_tiers.filter(t=>t.product_id===id&&!t.deleted_at) });
      render(); toast(p.active ? "Product deactivated" : "Product activated"); break;
    }
    case "add-staff":
      masterForm("staff");
      break;
    case "edit-staff":
      masterForm("staff", id);
      break;
    case "add-customer":
      masterForm("customer");
      break;
    case "add-expense":
      masterForm("expense");
      break;
    case "edit-expense":
      masterForm("expense", id);
      break;
    case "add-payment":
      paymentModal(id);
      break;
    case "pay-full-balance": {
      const amount = document.querySelector('#payment-form [name="amount"]');
      const invoice = S().invoices.find(x => x.id === id);
      if (amount && invoice) amount.value = (invoiceState(invoice, S().payments).balance / 100).toFixed(2);
      break;
    }
    case "add-stock":
      stockModal();
      break;
    case "stock-issue":
      stockIssueModal();
      break;
    case "stock-return":
      stockReturnModal();
      break;
    case "stock-add-line":
      if (id === "issue") stockIssueLineCount++;
      else stockReturnLineCount++;
      renderStockOperationLines(id);
      break;
    case "stock-remove-line": {
      const [type] = id.split(":");
      if (type === "issue")
        stockIssueLineCount = Math.max(1, stockIssueLineCount - 1);
      else stockReturnLineCount = Math.max(1, stockReturnLineCount - 1);
      renderStockOperationLines(type);
      break;
    }
    case "new-closing":
      closingModal();
      break;
    case "approve-closing": {
      const closing = S().daily_closings.find((row) => row.id === id);
      await store.run("closing.approve", {
        id,
        expected_version: closing.version,
      });
      render();
      toast("Daily closing approved");
      break;
    }
    case "reject-closing": {
      const closing = S().daily_closings.find((row) => row.id === id);
      const reason = prompt("Reason for rejecting this daily closing:");
      if (!reason?.trim()) break;
      await store.run("closing.reject", {
        id,
        expected_version: closing.version,
        reason: reason.trim(),
      });
      render();
      toast("Daily closing rejected");
      break;
    }
    case "reopen-closing": {
      const closing = S().daily_closings.find((row) => row.id === id);
      const reason = prompt("Reason for reopening this locked daily closing:");
      if (!reason?.trim()) break;
      await store.run("closing.reopen", {
        id,
        expected_version: closing.version,
        reason: reason.trim(),
      });
      render();
      toast("Daily closing reopened");
      break;
    }
    case "targets":
      targetsModal(id);
      break;
    case "post-salary":
      await postSalary(id);
      render();
      break;
    case "delete-expense": {
      const e = S().expenses.find((x) => x.id === id);
      if (confirm("Delete this expense? Profit and loss will be updated.")) {
        await store.run("master.delete", {
          table: "expenses",
          id,
          version: e.version,
        });
        render();
      }
      break;
    }
    case "cancel-order": {
      const o = S().orders.find((x) => x.id === id);
      if (o.status === "cancelled") throw Error("Already cancelled");
      if (
        confirm(
          "Cancel " +
            o.number +
            "? Stock will be restored and the sale excluded from targets and profit.",
        )
      ) {
        await store.run("order.cancel", {
          id,
          version: o.version,
          reason: "Cancelled by owner",
        });
        render();
      }
      break;
    }
    case "delete-quote": {
      const q = S().quotations.find((x) => x.id === id);
      modal(
        "Delete quotation",
        `<p>Soft-delete ${esc(q.number)}? Its history remains in the audit log.</p><form id="delete-quote-form" data-id="${id}"><div class="checkbox"><input id="hard-delete" name="hard" type="checkbox"><label for="hard-delete">Permanently delete instead (admin only)</label></div><button class="danger" style="margin-top:20px">Confirm deletion</button></form>`,
      );
      break;
    }
    case "convert": {
      const q = S().quotations.find((x) => x.id === id);
      modal(
        "Convert " + q.number,
        `<p>Stock will be checked and deducted once. The original quotation will link to the new order.</p><div class="notice">${S().quotation_items.filter(l=>l.quotation_id===id).map(l=>{const available=balance(l.product_id);return `${esc(l.product_name)}: ${available} available / ${l.boxes} required ${available>=l.boxes?"✓":"⚠ Insufficient"}`;}).join("<br>")}</div><form id="convert-form" data-id="${id}"><p>Quotation total: <b>${money(q.total_paisa)}</b></p><div class="checkbox"><input id="reprice" name="reprice" type="checkbox"><label for="reprice">Re-price at today's rates</label></div><section class="panel"><h3>Payment</h3><div class="grid three">${select("Payment status", "payment_status", [["unpaid","Unpaid"],["partial","Part paid"],["paid","Paid in full"]], "unpaid")}${field("Amount received now (Rs.)", "payment_amount", "0.00", "number", 'min="0" step="0.01"')}${field("Payment date", "payment_date", today(), "date")}${select("Method", "payment_method", ["Cash", "Bank", "JazzCash", "Easypaisa", "Cheque"])}${cashbookPaymentAccountField()}${field("Reference", "payment_reference")}${field("Received by", "payment_received_by", user.name || user.email || "Owner")}${field("Due date", "payment_due_date", addDays(today(),7), "date")}</div><div id="convert-payment-summary" class="total-box" aria-live="polite">Total · Paid now · Balance</div></section><button class="gold" style="margin-top:20px">Convert to order</button></form>`,
      );
      break;
    }
    case "quote-status": {
      const q = S().quotations.find((x) => x.id === id);
      modal(
        "Quotation status",
        `<form id="quote-status-form" data-id="${id}">${select("Next status", "status", q.status === "Draft" ? ["Sent"] : ["Accepted", "Rejected", "Expired"])}<button class="gold" style="margin-top:20px">Update status</button></form>`,
      );
      break;
    }
    case "payment-history":
      modal(
        "Payment history",
        table(
          [
            "Date",
            "Amount",
            "Method",
            "Reference",
            "Receiver",
            "Status",
            "Action",
          ],
          S()
            .payments.filter((p) => p.invoice_id === id)
            .map((p) => [
              p.date,
              money(p.amount_paisa),
              esc(p.method),
              esc(p.reference),
              esc(p.received_by),
              p.voided_at ? badge("Voided", "red") : badge("Recorded", "green"),
              p.voided_at
                ? "—"
                : btn("Void / refund", "void-payment", p.id, "", "danger"),
            ]),
        ),
      );
      break;
    case "void-payment": {
      const reason = prompt(
        "Reason for void/refund (confirm money has been returned if applicable):",
      );
      if (reason?.trim()) {
        await store.run("payment.void", { id, reason });
        close();
        render();
      }
      break;
    }
    case "ledger-detail": {
      const s = S(),
        os = s.orders.filter(
          (o) => o.customer_id === id && o.status === "confirmed",
        ),
        events = [];
      for (const o of os) {
        events.push({
          date: o.date,
          type: "Invoice",
          ref: o.number,
          debit: num(o.total_paisa),
          credit: 0,
        });
        const i = s.invoices.find((i) => i.order_id === o.id);
        for (const p of s.payments.filter(
          (p) => p.invoice_id === i?.id && !p.voided_at,
        ))
          events.push({
            date: p.date,
            type: "Payment",
            ref: p.transaction_id,
            debit: 0,
            credit: num(p.amount_paisa),
          });
      }
      let running = 0;
      modal(
        "Ledger · " + customerName(id),
        table(
          ["Date", "Type", "Reference", "Debit", "Credit", "Running balance"],
          events
            .sort((a, b) => a.date.localeCompare(b.date) || b.debit - a.debit)
            .map((e) => {
              running += e.debit - e.credit;
              return [
                e.date,
                e.type,
                esc(e.ref),
                money(e.debit),
                money(e.credit),
                money(running),
              ];
            }),
        ),
      );
      break;
    }
    case "receipt": {
      if (!client) throw Error("Receipt storage requires Supabase");
      const e = S().expenses.find((x) => x.id === id);
      const { data, error } = await client.storage
        .from("expense-receipts")
        .createSignedUrl(e.attachment_path, 120);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      break;
    }
    case "create-user":
      userModal();
      break;
    case "edit-user":
      userModal(id);
      break;
    case "salesman-profile":
      await openAdminSalesmanProfile(id);
      break;
    case "audit-detail": {
      const a = S().audit_log.find((a) => String(a.id) === id);
      modal(
        "Audit details",
        `<h3>Before</h3><pre>${esc(JSON.stringify(a.before_data, null, 2))}</pre><h3>After</h3><pre>${esc(JSON.stringify(a.after_data, null, 2))}</pre>`,
      );
      break;
    }
    case "apply-filters":
      filter.from = $("f-from").value;
      filter.to = $("f-to").value;
      filter.category = $("f-category")?.value || "";
      if (filter.from > filter.to)
        throw Error("From date must precede To date");
      render();
      break;
    case "apply-overview-range": {
      const from = $("f-overview-from").value;
      const to = $("f-overview-to").value;
      if (!from || !to || from > to)
        throw Error("Choose a valid date range: From must be on or before To");
      const days =
        (new Date(to + "T12:00:00Z") - new Date(from + "T12:00:00Z")) /
          86400000 +
        1;
      if (days > 366) throw Error("Overview date range cannot exceed 366 days");
      overviewFrom = from;
      overviewTo = to;
      render();
      break;
    }
    case "overview-day":
      reportDate = id;
      page = "dsr";
      render();
      break;
    case "this-month":
      filter.from = monthStart(today());
      filter.to = today();
      render();
      break;
    case "this-year":
      filter.from = today().slice(0, 4) + "-01-01";
      filter.to = today();
      render();
      break;
    case "expense-csv": {
      const rows = [
        ["Date", "Category", "Description", "Amount PKR", "Method", "Salesman"],
        ...visible(S().expenses)
          .filter(
            (e) =>
              e.date >= filter.from &&
              e.date <= filter.to &&
              (!filter.category ||
                filter.category === "All categories" ||
                e.category === filter.category),
          )
          .map((e) => [
            e.date,
            e.category,
            e.description,
            e.amount_paisa / 100,
            e.method,
            salesmanName(e.salesman_id),
          ]),
      ];
      const safe = (x) => {
        let v = String(x ?? "");
        if (/^[=+@-]/.test(v)) v = "'" + v;
        return '"' + v.replaceAll('"', '""') + '"';
      };
      download(
        "Blesscon_Expenses_" + today() + ".csv",
        rows.map((r) => r.map(safe).join(",")).join("\r\n"),
        "text/csv",
      );
      break;
    }
    case "backup":
      download(
        "Blesscon_Backup_" + today() + ".json",
        JSON.stringify(
          { version: 2, exported_at: new Date().toISOString(), data: S() },
          null,
          2,
        ),
      );
      break;
    case "dsr-csv": {
      const report = dailySalesReport(
        S(),
        reportDate,
        admin() ? reportSalesman : own()?.id || "",
      );
      const rows = [
        ["Date", "Type", "Reference", "Customer / product", "Classification", "Amount PKR", "Boxes"],
        [report.date, "Sales", "", "", "Confirmed invoices", report.sales_paisa / 100, ""],
        [report.date, "Collection", "", "", "All payment methods", report.collected_paisa / 100, ""],
        [report.date, "Recovery", "", "", "Older invoices only", report.previous_recovery_paisa / 100, ""],
        [report.date, "New credit", "", "", "Today's unpaid invoices", report.new_credit_paisa / 100, ""],
        [report.date, "Expenses", "", "", "Recorded expenses", report.expense_paisa / 100, ""],
        ...report.payments.map((payment) => {
          const invoice = S().invoices.find((row) => row.id === payment.invoice_id);
          const order = invoice && S().orders.find((row) => row.id === invoice.order_id);
          return [report.date, "Payment", payment.transaction_id, customerName(order?.customer_id), order?.date < report.date ? "Previous invoice recovery" : "Current-day invoice", payment.amount_paisa / 100, ""];
        }),
        ...report.products.map((product) => [report.date, "Product sales", "", product.product_name, "Confirmed sale lines", product.amount_paisa / 100, product.boxes]),
      ];
      const csv = (value) => {
        let text = String(value ?? "");
        if (/^[=+@\-]/.test(text)) text = "'" + text;
        return '"' + text.replaceAll('"', '""') + '"';
      };
      download(
        `Blesscon_DSR_${report.date}.csv`,
        rows.map((row) => row.map(csv).join(",")).join("\r\n"),
        "text/csv",
      );
      break;
    }
    case "dsr-print": {
      const report = dailySalesReport(
        S(),
        reportDate,
        admin() ? reportSalesman : own()?.id || "",
      );
      const selectedName = report.salesman_id
        ? salesmanName(report.salesman_id)
        : "All salesmen";
      $("print-area").innerHTML = `<article class="document"><header class="doc-head"><img src="${ICON}" alt="Blesscon Candy"><div><h1>Daily Sales Report</h1><p>${esc(report.date)} · ${esc(selectedName)}</p></div></header><div class="cards">${card("Sales", money(report.sales_paisa))}${card("Collection", money(report.collected_paisa))}${card("Previous recovery", money(report.previous_recovery_paisa))}${card("New credit", money(report.new_credit_paisa))}${card("Expenses", money(report.expense_paisa))}${card("Outstanding", money(report.outstanding_paisa))}${card("Overdue", money(report.overdue_paisa))}</div><h2>Product sales</h2>${table(["Product", "Boxes", "Sales value"], report.products.map((row) => [esc(row.product_name), row.boxes, money(row.amount_paisa)]))}<h2>Payment allocations</h2>${table(["Receipt", "Invoice", "Date", "Method", "Amount"], report.payments.map((payment) => { const invoice = S().invoices.find((row) => row.id === payment.invoice_id); const order = invoice && S().orders.find((row) => row.id === invoice.order_id); return [esc(payment.transaction_id), esc(invoice?.number || ""), esc(payment.date), esc(payment.method), money(payment.amount_paisa)]; }))}</article>`;
      $("print-area").insertAdjacentHTML("beforeend", dsrClosingSection());
      window.print();
      break;
    }
    case "export-xlsx":
      exportWorkbook(S(), globalThis.XLSX);
      break;
    case "export-queue":
      download(
        "Blesscon_Pending_Changes_" + today() + ".json",
        JSON.stringify(store.queue, null, 2),
      );
      break;
    case "import-report":
      download(
        "Blesscon_Import_Report_" + today() + ".json",
        JSON.stringify(
          {
            summary: preview.summary,
            warnings: preview.warnings,
            errors: preview.errors,
          },
          null,
          2,
        ),
      );
      break;
    case "confirm-import": {
      if (preview.errors.length) throw Error("Resolve import errors first");
      const report = {
        summary: preview.summary,
        warnings: preview.warnings,
        errors: preview.errors,
        date: today(),
      };
      await store.run("import.batch", {
        ...preview.data,
        audit_cursor: preview.cursor,
      });
      localStorage.setItem(
        "blesscon:last-import:" + user.id,
        JSON.stringify(report, null, 2),
      );
      close();
      render();
      toast("Workbook imported. All pages are populated.");
      break;
    }
    case "sync":
      await store.sync();
      render();
      if (store.error) toast(store.error);
      break;
    case "queue":
      modal(
        "Pending changes",
        `<p>Changes remain on this device until accepted. If the server reports a conflict, export a backup, discard the conflicting change and enter it again after refresh.</p>${table(
          ["Action", "Queued", "Details"],
          store.queue.map((q) => [
            esc(q.kind),
            esc(q.queued_at),
            `<details><summary>Payload</summary><pre>${esc(JSON.stringify(q.data, null, 2))}</pre></details>`,
          ]),
        )}<div class="actions">${btn("Export pending changes", "export-queue")}${btn("Retry sync", "sync")}${btn("Discard first pending change", "discard-queue", "", "", "danger")}</div>`,
      );
      break;
    case "discard-queue":
      if (
        confirm(
          "Discard only the first pending change? Export it first if you need a record.",
        )
      ) {
        await store.discardFirst();
        close();
        render();
      }
      break;
    case "account":
      modal(
        "Your account",
        `<p>${esc(user.email || "Practice account")}</p>${user.practice ? "<p>Practice mode has no login password.</p>" : `<form id="password-form">${field("New password", "password", "", "password", 'minlength="12" required autocomplete="new-password"')}<button style="margin-top:15px">Change password</button></form>`}`,
      );
      break;
    case "logout":
      minimized = null;
      updatePill();
      if (
        store.queue.length &&
        !confirm(
          "There are unsynced changes. They stay on this device under your account. Sign out?",
        )
      )
        return;
      if (client) await client.auth.signOut();
      store = null;
      user = null;
      login();
      break;
  }
}
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".card[data-page]")) {
    e.preventDefault();
    e.target.click();
  }
});
document.addEventListener("click", async (e) => {
  const nav = e.target.closest("[data-page]");
  if (nav) {
    page = nav.dataset.page;
    filter.search = "";
    $("sidebar")?.classList.remove("open");
    render();
    return;
  }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  e.preventDefault();
  if (b.disabled) return;
  b.disabled = true;
  try {
    await action(b.dataset.act, b.dataset.id, b);
  } catch (err) {
    toast(err.message || String(err));
  } finally {
    if (b.isConnected) b.disabled = false;
  }
});
document.addEventListener("input", (e) => {
  const input = e.target;
  const stockForm = input.closest?.("#stock-form");
  if (stockForm && ["cartons", "loose_boxes"].includes(input.name)) refreshStockMovementPreview(stockForm);
  const masterForm = input.closest?.("#master-form");
  if (masterForm) {
    const error = masterForm.querySelector("#master-form-error");
    if (error) { error.textContent = ""; error.style.display = "none"; }
  }
  if (input.matches("[data-cashbook-date]")) { cashbookDate = input.value || today(); return; }
  if (input.dataset.filter === "search") {
    const pos = input.selectionStart;
    filter.search = input.value;
    render();
    $("f-search")?.focus();
    $("f-search")?.setSelectionRange(pos, pos);
    return;
  }
  if (input.closest("#document-form")) {
    const row = input.closest("[data-line]");
    if (row) {
      const i = num(row.dataset.line),
        key = input.dataset.lineField;
      if (key === "manual_rate") {
        const reasonBox = row.querySelector('[data-line-field="override_reason"]');
        if (String(input.value).trim() === "") {
          // Field cleared: go back to automatic tier pricing.
          delete draft.items[i].manual_rate_paisa;
          if (draft.items[i].override_reason === "Manual rate") {
            draft.items[i].override_reason = "";
            if (reasonBox) reasonBox.value = "";
          }
        } else {
          // A typed rate is kept as entered; mark the line as a manual rate so
          // recalculation no longer restores the tier price.
          draft.items[i].manual_rate_paisa = paisa(input.value);
          draft.items[i].rate_paisa = paisa(input.value);
          if (!draft.items[i].override_reason?.trim()) {
            draft.items[i].override_reason = "Manual rate";
            if (reasonBox) reasonBox.value = "Manual rate";
          }
        }
      } else if (key) {
        draft.items[i][key] = input.value;
        if (
          key === "override_reason" &&
          input.value.trim() &&
          draft.items[i].manual_rate_paisa !== undefined
        )
          draft.items[i].rate_paisa = draft.items[i].manual_rate_paisa;
      }
    }
    calcEditor();
  }
  if (input.closest("#convert-form")) refreshConvertPayment(input.closest("#convert-form"));
  const closingForm = input.closest("#closing-form");
  if (closingForm && input.matches("[data-closing-cash]"))
    refreshClosingEstimate(closingForm);
});
document.addEventListener("change", async (e) => {
  const stockForm = e.target.closest?.("#stock-form");
  if (stockForm && ["product_id", "cartons", "loose_boxes"].includes(e.target.name)) refreshStockMovementPreview(stockForm);
  if (e.target.matches?.("[data-cashbook-date]")) { cashbookDate = e.target.value || today(); render(); return; }
  try {
    const closingForm = e.target.closest("#closing-form");
    if (
      closingForm &&
      ["closing_salesman", "date"].includes(e.target.name)
    ) {
      refreshClosingEstimate(closingForm, true);
      return;
    }
    if (e.target.id === "f-dsr_date") {
      reportDate = e.target.value || today();
      render();
      return;
    }
    if (e.target.id === "f-dsr_salesman") {
      reportSalesman = e.target.value;
      render();
      return;
    }
    if (e.target.id === "workbook-file") await previewImport(e.target.files[0]);
    if (e.target.id === "f-customer_id" && $("new-customer-fields"))
      $("new-customer-fields").style.display =
        e.target.value === "__new__" ? "grid" : "none";
    if (e.target.closest("#document-form")) calcEditor();
    if (e.target.closest("#convert-form")) refreshConvertPayment(e.target.closest("#convert-form"));
    if (e.target.id === "document-template" && activeDoc) {
      activeTemplate = e.target.value;
      const templateKey = "blesscon:template:" + user.id + ":" + activeDoc.type;
      localStorage.setItem(templateKey, activeTemplate);
      localStorage.setItem(templateKey + ":" + activeDoc.document.id, activeTemplate);
      const preview = $("document-preview");
      if (preview) preview.innerHTML = documentHTML(activeDoc, store.queue.length > 0, activeTemplate);
    }
  } catch (err) {
    toast(err.message);
  }
});
// Explicit click path for the Products & Pricing Save button. Some embedded
// deployments/browser shells fail to dispatch the delegated submit event for
// dynamically-created dialog forms; intercept the actual button click in capture
// phase so saving does not depend on native form submission.
document.addEventListener("click", async (e) => {
  const button = e.target.closest?.('#master-form button[type="submit"]');
  if (!button) return;
  e.preventDefault();
  e.stopPropagation();
  const form = button.closest("form#master-form");
  if (!form || form.dataset.saving) return;
  form.dataset.saving = "true";
  const buttons = [...form.querySelectorAll("button")];
  buttons.forEach((b) => (b.disabled = true));
  const error = form.querySelector("#master-form-error");
  if (error) { error.textContent = "Saving…"; error.style.display = "block"; error.classList.remove("danger"); }
  try {
    await saveMaster(form);
  } catch (err) {
    const message = err?.message || String(err);
    toast(message);
    if (error) { error.textContent = message; error.style.display = "block"; error.classList.add("danger"); error.setAttribute("tabindex", "-1"); error.focus({ preventScroll: true }); }
  } finally {
    delete form.dataset.saving;
    buttons.forEach((b) => (b.disabled = false));
  }
}, true);

async function submitStockOperation(form) {
  if (!form || form.dataset.saving) return;
  form.dataset.saving = "true";
  const buttons = [...form.querySelectorAll("button")];
  buttons.forEach((button) => (button.disabled = true));
  const errorBox = form.querySelector("#stock-operation-error");
  if (errorBox) { errorBox.style.display = "none"; errorBox.textContent = ""; }
  try {
    const f = Object.fromEntries(new FormData(form));
    if (form.id === "stock-issue-form") {
      const items = stockOperationItems(form, "ISSUE-");
      const saved = await store.run("stock.issue", {
        items, reference: f.reference, salesman_id: f.salesman_id,
        date: f.date, note: f.note || "",
      });
      if (saved?.error) throw Error(saved.error);
      if (saved?.queued) throw Error("The stock issue is still pending sync and has not been confirmed by Supabase. Check your connection and pending sync error before retrying.");
      close(); render();
      toast("Stock issue voucher recorded");
    } else {
      const items = stockOperationItems(form, "RETURN-");
      const saved = await store.run("stock.return", {
        items, reference: f.reference, salesman_id: f.salesman_id,
        date: f.date, condition: f.condition, note: f.note || "",
      });
      if (saved?.error) throw Error(saved.error);
      if (saved?.queued) throw Error("The stock return is still pending sync and has not been confirmed by Supabase. Check your connection and pending sync error before retrying.");
      close(); render();
      toast("Stock return voucher recorded");
    }
  } catch (err) {
    const message = err?.message || String(err);
    toast(message);
    if (errorBox) {
      errorBox.textContent = message;
      errorBox.style.display = "block";
      errorBox.setAttribute("tabindex", "-1");
      errorBox.focus({ preventScroll: true });
    }
  } finally {
    delete form.dataset.saving;
    buttons.forEach((button) => (button.disabled = false));
  }
}

// Explicit click handling for stock issue/return dialogs. This makes the primary
// action reliable in hosted/browser-shell environments where delegated submit
// events from dialog forms may not fire, and leaves database errors visible.
document.addEventListener("click", async (e) => {
  const button = e.target.closest?.('#stock-issue-form button[type="submit"], #stock-return-form button[type="submit"]');
  if (!button) return;
  const form = button.closest("form#stock-issue-form, form#stock-return-form");
  if (!form) return;
  e.preventDefault();
  e.stopPropagation();
  await submitStockOperation(form);
}, true);

document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  e.preventDefault();
  const buttons = [...form.querySelectorAll("button")];
  if (form.dataset.saving) return;
  form.dataset.saving = "true";
  buttons.forEach((b) => (b.disabled = true));
  try {
    const f = Object.fromEntries(new FormData(form));
    switch (form.id) {
      case "login-form": {
        const { data, error } = await client.auth.signInWithPassword({
          email: f.email,
          password: f.password,
        });
        if (error) throw error;
        await enter(data.user);
        break;
      }
      case "document-form":
        await saveEditor(form);
        break;
      case "master-form":
        await saveMaster(form);
        break;
      case "settings-form":
        await saveSettings(form);
        break;
      case "cashbook-form": {
        const kind = form.dataset.kind;
        if (kind === "transfer") {
          const source = f.source_account, destination = f.destination_account;
          if (source === destination) throw Error("Choose two different accounts");
          await store.run("cashbook.transfer", { source_account:source, destination_account:destination, amount_paisa:paisa(f.amount), date:f.date, reference:f.reference||"", description:f.description||"" });
          toast("Account transfer recorded.");
        } else if (kind === "adjustment") {
          if (!String(f.description||"").trim()) throw Error("A reason is required");
          await store.run("cashbook.adjust", { account_key:f.account_key, amount_paisa:paisa(f.amount), date:f.date, reference:f.reference||"", description:f.description });
          toast("Audited cashbook adjustment recorded.");
        } else if (kind === "handover") {
          await store.run("cashbook.handover", { source_account:f.source_account, destination_account:"cash_hand", amount_paisa:paisa(f.amount), date:f.date, reference:f.reference||"", description:f.description||"Cash handed to office" });
          toast("Cash handover recorded.");
        } else if (kind === "account") {
          await store.run("cashbook.account.save", { account_key:f.account_key.trim().toLowerCase(), label:f.label.trim(), account_type:f.account_type, payment_method:f.payment_method, opening_balance_paisa:paisa(f.opening_balance) });
          toast("Account saved.");
        } else if (kind === "close") {
          const accounts = cashbookData().accounts.filter(a=>a.active && a.account_type!=="receivable" && (mgmt() || a.salesman_id===own()?.id) && !(S().cashbook_daily_closings||[]).some(c=>c.business_date===f.date && c.account_key===a.account_key && c.status==="approved"));
          const actuals = accounts.map(a=>({account_key:a.account_key,actual_balance_paisa:paisa(f["actual_"+a.account_key])}));
          await store.run("cashbook.close.submit",{date:f.date,notes:f.notes||"",actuals});
          toast("Daily closing submitted for management review.");
        }
        cashbookDate = f.date || cashbookDate;
        close(); render(); break;
      }
      case "payment-form":
        await store.run("payment.add", {
          invoice_id: form.dataset.id,
          transaction_id: "PAY-" + uid(),
          date: f.date,
          amount_paisa: paisa(f.amount),
          method: f.method,
          cashbook_account_key: f.cashbook_account_key || "",
          reference: f.reference,
          received_by: f.received_by,
        });
        close();
        render();
        toast("Payment recorded");
        break;
      case "stock-form": {
        const product = S().products.find((p) => p.id === f.product_id);
        if (!product) throw Error("Choose a valid product");
        const cartons = Number(f.cartons);
        const looseBoxes = Number(f.loose_boxes);
        if (!Number.isSafeInteger(cartons) || cartons < 0 || !Number.isSafeInteger(looseBoxes) || looseBoxes < 0)
          throw Error("Cartons and loose boxes must be whole nonnegative quantities");
        const quantity = cartons * Number(product.boxes_per_carton || 0) + looseBoxes;
        if (!Number.isSafeInteger(quantity) || quantity <= 0)
          throw Error("Enter a positive quantity in cartons and/or loose boxes");
        const signedQuantity = ["out", "damage"].includes(f.kind) ? -quantity : f.kind === "adjustment" ? quantity : quantity;
        const saved = await store.run("stock.add", {
          ...f,
          boxes: signedQuantity,
        });
        close();
        render();
        toast(saved?.queued ? "Stock entry saved on this device; pending sync. It is not available to online sales until sync succeeds." : "Stock movement confirmed");
        break;
      }
      case "stock-issue-form": {
        const items = stockOperationItems(form, "ISSUE-");
        const saved = await store.run("stock.issue", {
          items,
          reference: f.reference,
          salesman_id: f.salesman_id,
          date: f.date,
          note: f.note || "",
        });
        close();
        render();
        toast(saved?.queued ? "Multi-product issue saved on this device; pending sync" : "Stock issue voucher recorded");
        break;
      }
      case "stock-return-form": {
        const items = stockOperationItems(form, "RETURN-");
        const saved = await store.run("stock.return", {
          items,
          reference: f.reference,
          salesman_id: f.salesman_id,
          date: f.date,
          condition: f.condition,
          note: f.note || "",
        });
        close();
        render();
        toast(saved?.queued ? "Multi-product return saved on this device; pending sync" : "Stock return voucher recorded");
        break;
      }
      case "closing-form": {
        const salesmanId = f.closing_salesman || own()?.id;
        const date = f.date;
        const current = S().daily_closings.find(
          (row) => row.salesman_id === salesmanId && row.business_date === date,
        );
        const actualStock = Object.fromEntries(
          [...form.querySelectorAll("[data-stock-count]")].map((input) => [
            input.dataset.stockCount,
            num(input.value),
          ]),
        );
        const saved = await store.run("closing.submit", {
          salesman_id: salesmanId,
          date,
          opening_cash_paisa: paisa(f.opening_cash),
          cash_handed_over_paisa: paisa(f.cash_handed_over),
          actual_cash_paisa: paisa(f.actual_cash),
          ...Object.fromEntries(
            CLOSING_BALANCE_FIELDS.map(([name]) => [
              name + "_paisa",
              paisa(f[name] || 0),
            ]),
          ),
          actual_stock: actualStock,
          reason: f.reason || "",
          notes: f.notes || "",
          expected_version: current?.version,
        });
        close();
        render();
        toast(saved?.queued ? "Closing saved on this device; pending sync" : "Closing submitted for approval");
        break;
      }
      case "convert-form": {
        const q = S().quotations.find((q) => q.id === form.dataset.id);
        await store.run("quote.convert", {
          id: q.id,
          version: q.version,
          order_id: uid(),
          reprice: f.reprice === "on",
          payment: { status: f.payment_status || "unpaid", amount_paisa: f.payment_status === "paid" ? null : f.payment_status === "unpaid" ? 0 : paisa(f.payment_amount), transaction_id: "PAY-CONVERT-" + q.id, date: f.payment_date || today(), method: f.payment_method || "Cash", cashbook_account_key: f.cashbook_account_key || "", reference: f.payment_reference || "", received_by: f.payment_received_by || user.name || user.email || "Owner", due_date: f.payment_due_date || addDays(today(),7) },
        });
        close();
        render();
        toast("Quotation converted");
        break;
      }
      case "delete-quote-form": {
        const q = S().quotations.find((q) => q.id === form.dataset.id);
        await store.run("quote.delete", {
          id: q.id,
          version: q.version,
          hard: f.hard === "on",
        });
        close();
        render();
        break;
      }
      case "quote-status-form": {
        const q = S().quotations.find((q) => q.id === form.dataset.id);
        await store.run("quote.status", {
          id: q.id,
          version: q.version,
          status: f.status,
        });
        close();
        render();
        break;
      }
      case "create-user-form": {
        if (!client) throw Error("Configure Supabase to create logins");
        const { data, error } = await client.functions.invoke(
          "admin-create-user",
          { body: { ...f, request_id: uid() } },
        );
        if (error) {
          let message = error.message;
          try {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          } catch {}
          throw Error(message);
        }
        if (data.error) throw Error(data.error);
        await store.refresh();
        if (f.role === "salesman" && !f.salesman_id) {
          await store.run("master.save", {
            table: "salesmen",
            record: {
              id: uid(),
              name: String(f.display_name || "").trim(),
              phone: "",
              user_id: data.user_id,
              active: true,
              joining_date: today(),
              base_salary_paisa: num(S().settings.base_salary_paisa) || 4500000,
              monthly_target: num(S().settings.monthly_target) || 130,
              off_days: [],
            },
            expected_version: undefined,
          });
        }
        await store.refresh();
        close();
        render();
        toast("Login created and salesman profile linked");
        break;
      }
      case "user-form": {
        const targetUserId = form.dataset.id;
        const targetProfile = S().profiles.find((profile) => profile.id === targetUserId);
        const oldLinkedSeller = S().salesmen.find((seller) => seller.user_id === targetUserId);
        await store.run("user.update", {
          id: targetUserId,
          role: f.role,
          active: f.active === "true",
          permissions: [
            {
              section: "invoices",
              can_view: true,
              can_create: f.can_collect === "on",
              can_share: true,
              can_export: true,
            },
          ],
        });
        if (f.role === "salesman") {
          if (f.salesman_id && f.salesman_id !== "__create__") {
            const chosen = S().salesmen.find((seller) => seller.id === f.salesman_id);
            if (!chosen) throw Error("Selected salesman profile was not found. Refresh and try again.");
            if (oldLinkedSeller && oldLinkedSeller.id !== chosen.id) {
              await store.run("master.save", {
                table: "salesmen",
                record: { ...oldLinkedSeller, user_id: null },
                expected_version: oldLinkedSeller.version,
              });
            }
            await store.run("master.save", {
              table: "salesmen",
              record: { ...chosen, user_id: targetUserId, name: chosen.name || targetProfile?.display_name || "Salesman" },
              expected_version: chosen.version,
            });
          } else if (!oldLinkedSeller) {
            await store.run("master.save", {
              table: "salesmen",
              record: {
                id: uid(), name: targetProfile?.display_name || "Salesman", phone: "", user_id: targetUserId,
                active: f.active === "true", joining_date: today(),
                base_salary_paisa: num(S().settings.base_salary_paisa) || 4500000,
                monthly_target: num(S().settings.monthly_target) || 130, off_days: [],
              },
              expected_version: undefined,
            });
          } else if (oldLinkedSeller.active !== (f.active === "true")) {
            await store.run("master.save", {
              table: "salesmen",
              record: { ...oldLinkedSeller, active: f.active === "true" },
              expected_version: oldLinkedSeller.version,
            });
          }
        }
        await store.refresh();
        close();
        render();
        toast("Access and salesman link saved");
        break;
      }
      case "password-form": {
        const { error } = await client.auth.updateUser({
          password: f.password,
          data: { must_change_password: false },
        });
        if (error) throw error;
        close();
        toast("Password changed");
        break;
      }
    }
  } catch (err) {
    const message = err?.message || String(err);
    toast(message);
    const el = form.querySelector("#master-form-error, [role=alert]");
    if (el) {
      el.textContent = message;
      el.style.display = "block";
      el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
      el.scrollIntoView?.({ block: "nearest" });
    }
  } finally {
    delete form.dataset.saving;
    buttons.forEach((b) => (b.disabled = false));
  }
});
function login() {
  charts.forEach((c) => c.destroy());
  const config = window.APP_CONFIG || {},
    configured = !!config.SUPABASE_URL && !!config.SUPABASE_PUBLISHABLE_KEY;
  $("app").innerHTML =
    `<main class="login" id="main"><section class="login-story"><img src="${LOGO}" alt="Blesscon Candy logo"><div class="eyebrow" style="color:#d5ad58">Your business, connected</div><h1>Small delights.<br>A growing business.</h1><p>Manage sales, inventory and your team with one shared view of Blesscon Candy.</p><small style="margin-top:40px;color:#ccd7e6">Sales · Stock · Collections · People</small></section><section class="login-card"><div><img src="${LOGO}" alt="Blesscon Candy logo"><h1>Welcome back</h1><p class="muted">Sign in to your business workspace.</p>${configured ? `<form id="login-form">${field("Email address", "email", "", "email", 'required autocomplete="username"')}${field("Password", "password", "", "password", 'required autocomplete="current-password"')}<button class="gold button-full">Sign in</button></form>` : `<div class="notice"><b>Connect your business database</b><p style="margin:8px 0 0">Set the Supabase URL and publishable key in <code>app_config.js</code>. Follow <a href="README_SETUP.md">README_SETUP.md</a> to install the database and create the first admin.</p></div>`}<div class="login-links"><button id="practice-button" class="secondary">Open practice workspace</button><p class="muted" style="margin-top:12px">Practice is isolated from business data. No account is required.</p></div></div></section></main>`;
  $("practice-button").onclick = practice;
}
async function enter(authUser) {
  const { data: profile, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .single();
  if (error) throw error;
  if (!profile.active)
    throw Error("This login is deactivated. Contact the owner.");
  const { data: role, error: re } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", authUser.id)
    .single();
  if (re) throw re;
  user = {
    id: authUser.id,
    email: authUser.email,
    name: profile.display_name,
    role: role.role,
    practice: false,
  };
  localStorage.setItem("blesscon:last-user", JSON.stringify(user));
  store = new Store(client, user);
  store.addEventListener("change", syncBadge);
  await store.sync();
  shell();
  if (authUser.user_metadata?.must_change_password) await action("account");
  if (
    admin() &&
    S().settings.auto_salary_expense &&
    !store.queue.length &&
    !store.error
  ) {
    const prev = addDays(monthStart(today()), -1).slice(0, 7);
    for (const s of visible(S().salesmen).filter(
      (s) => s.joining_date <= monthEnd(prev + "-01"),
    ))
      await postSalary(s.id, prev, true);
    render();
  }
}
function practice() {
  user = {
    id: "practice-owner",
    name: "Practice Owner",
    role: "admin",
    practice: true,
  };
  store = new Store(null, user);
  if (!store.base.products.length) {
    const p = ["Strawberry", "Orange"].map((n, i) => ({
      id: "DEMO-RANI-" + (i + 1),
      name: "Rani Candy - " + n,
      category: "Example only",
      boxes_per_carton: 24,
      cost_paisa: 20000,
      retail_paisa: 25000,
      wholesale_paisa: 23000,
      active: true,
      version: 1,
    }));
    store.base.products = p;
    store.base.stock = p.map((x) => ({ product_id: x.id, boxes: 2400 }));
    store.base.stock_movements = p.map((x) => ({
      id: uid(),
      transaction_id: "DEMO-OPEN-" + x.id,
      product_id: x.id,
      date: today(),
      boxes: 2400,
      kind: "opening",
      note: "Practice stock only",
    }));
    store.base.customers = [
      {
        id: "DEMO-CUSTOMER",
        name: "Example Shop",
        phone: "",
        address: "Practice customer only",
        version: 1,
      },
    ];
    store.base.salesmen = [
      {
        id: "DEMO-SP",
        name: "Example Salesman",
        phone: "",
        joining_date: today(),
        monthly_target: 130,
        base_salary_paisa: 4500000,
        active: true,
        off_days: [],
        version: 1,
      },
    ];
    store.persist();
    store.replay();
  }
  store.addEventListener("change", syncBadge);
  shell();
}
async function boot() {
  if ("serviceWorker" in navigator && location.protocol !== "file:")
    navigator.serviceWorker
      .register("./sw.js")
      .catch((e) => toast("Offline cache not ready: " + e.message));
  document.querySelector("link[rel=icon]").href = ICON;
  const config = window.APP_CONFIG || {};
  if (
    config.SUPABASE_URL &&
    config.SUPABASE_PUBLISHABLE_KEY &&
    globalThis.supabase
  ) {
    client = supabase.createClient(
      config.SUPABASE_URL,
      config.SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    );
    const token = location.hash.match(/^#share=([a-f0-9-]{36})$/i)?.[1];
    if (token) {
      const { data, error } = await client.rpc("shared_document", { token });
      if (error) {
        $("app").innerHTML =
          '<main class="loading"><h1>Document unavailable</h1><p>' +
          esc(error.message) +
          "</p></main>";
        return;
      }
      activeDoc = data;
      $("app").innerHTML =
        `<main id="main" class="panel" style="max-width:900px;margin:20px auto"><div class="actions">${btn("Print", "doc-print")}${btn("Download PDF", "doc-pdf")}${btn("Share PDF", "doc-share")}</div>${documentHTML(data)}</main>`;
      return;
    }
    const {
      data: { session },
    } = await client.auth.getSession();
    if (session) {
      try {
        await enter(session.user);
        return;
      } catch (e) {
        if (!navigator.onLine) {
          const cached = JSON.parse(
            localStorage.getItem("blesscon:last-user") || "null",
          );
          if (cached && cached.id === session.user.id) {
            user = cached;
            store = new Store(client, user);
            store.addEventListener("change", syncBadge);
            shell();
            return;
          }
        }
        toast(e.message);
      }
    }
  }
  login();
}
boot().catch((e) => {
  login();
  toast(e.message);
});
// Exposed read-only hooks are for deterministic DOM tests, not an authorisation boundary.
export { render, practice, openEditor, showDocument };
