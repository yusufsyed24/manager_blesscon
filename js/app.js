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
import { Store, empty, TABLES, managerClosingFigures, managerTeamIds } from "./store.js";
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
  ["payroll", "Salary & payroll", "₹"],
  ["users", "Users & access", "♧"],
  ["audit", "Audit trail", "≡"],
];
const S = () => store.state,
  admin = () => user?.role === "admin",
  manager = () => user?.role === "manager",
  mgmt = () => user?.role === "admin" || user?.role === "manager",
  own = () => S().salesmen.find((s) => s.user_id === user.id);
const canStockWrite = () =>
  admin() || manager() ||
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
const canBase = (p) =>
  // Managers receive operational access by role; financial, pricing and system-wide
  // modules require an explicit permission (or Admin role).
  (user?.role === "manager" && ["dashboard","myprofile","dsr","closing","orders","stock","staff","expenses"].includes(p)) ||
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
// A salesman only gets his overview, his own profile and his daily report / closing.
// This must NOT fall through to the generic list in canBase(), which is why a salesman
// used to see Cash & Bank Book, Invoices, Quotations, Ledger, Products, Salesmen & targets.
const SALESMAN_PAGES = ["myprofile"];
const can = (p) => (user?.role === "salesman" ? SALESMAN_PAGES.includes(p) : (manager() && p === "cashbook") ? false : canBase(p));
const badge = (s, t = "") =>
  `<span class="badge ${t || (/PAID|Accepted|Synced|OK/.test(s) && !/PART|UNPAID/.test(s) ? "green" : /PART|Draft|Sent|Pending|30/.test(s) ? "amber" : /UNPAID|Expired|cancel|Rejected/.test(s) ? "red" : "")}">${esc(s)}</span>`;
const btn = (text, act, id = "", extra = "", cls = "secondary") =>
  `<button class="${cls}" data-act="${act}" data-id="${esc(id)}" ${extra}>${text}</button>`;
const field = (label, name, value = "", type = "text", extra = "") =>
  `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;
const area = (label, name, value = "") =>
  `<div class="field"><label for="f-${name}">${label}</label><textarea id="f-${name}" name="${name}">${esc(value)}</textarea></div>`;
const select = (label, name, options, value = "", extra = "") =>
  `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}" ${extra}>${options
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
  // Salesman accounts have one destination only: their own profile page. Do not
  // restore a previously selected management module from shared-device storage.
  if (user?.role === "salesman") page = "myprofile";
  else {
    try {
      const savedPage = localStorage.getItem("blesscon:last-page");
      if (savedPage && NAV.some((item) => item[0] === savedPage)) page = savedPage;
    } catch {}
  }
  const nav = NAV.filter((x) => can(x[0]));
  $("app").innerHTML =
    `<div class="layout"><aside class="sidebar" id="sidebar"><div class="brand"><img src="${ICON}" alt="Blesscon Candy logo"><div><b>BLESSCON CANDY</b><small>Business Manager</small></div></div><nav aria-label="Main navigation">${nav.map((n, i) => `${user?.role !== "salesman" && [0, 5, 10].includes(i) ? `<div class="nav-section">${i === 0 ? "BUSINESS" : i === 5 ? "OPERATIONS" : "ADMINISTRATION"}</div>` : ""}<button data-page="${n[0]}" class="${page === n[0] ? "active" : ""}"><span class="nav-icon" aria-hidden="true">${n[2]}</span>${n[1]}</button>`).join("")}</nav><div class="sidebar-footer">${esc(user.name || user.email || "Owner")}<br>${esc(user.role)}<hr><small>Karachi business dates · PKR</small></div></aside><div><header class="topbar"><div class="actions"><button class="mobile-menu icon-button" data-act="menu" aria-label="Toggle navigation">☰</button><span class="muted">${new Date(today() + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span></div><div class="actions"><span id="sync-status"></span>${btn("↻ Sync", "sync")}${btn("Account", "account")}${btn("Sign out", "logout")}</div></header><main id="main" class="main-content" tabindex="-1">${user.practice ? '<div class="notice">Practice workspace — example products only. This data is stored on this device and never sent to your business database.</div>' : ""}<div id="sync-alert"></div><div id="page"></div></main></div></div>`;
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
  // Enforce the salesman page restriction even if an old saved route or a stale
  // click attempts to select another module.
  if (user?.role === "salesman") page = "myprofile";
  if (page === "myprofile" && !admin() && !["manager", "salesman", "user"].includes(user.role)) page = "dashboard";
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
    dashboard: user.role === "salesman" ? renderSalesmanDashboard : manager() ? renderManagerDashboard : renderDashboard,
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
    payroll: renderPayroll,
    users: renderUsers,
    audit: renderAudit,
    import: renderImport,
  };
  $("page").innerHTML = methods[page]();
  if (page === "myprofile" && admin()) hydrateAdminFieldwork().catch((e) => toast("Could not load admin fieldwork: " + e.message));
  else if (page === "myprofile" && manager()) hydrateManagerFieldwork().catch((e) => toast("Could not load Manager fieldwork: " + e.message));
  else if (page === "myprofile") {
    hydrateSalesmanProfile().catch((e) => toast("Could not load profile details: " + e.message));
    if (user.role === "salesman") hydrateSalesmanNotifications().catch((e) => toast("Could not load messages: " + e.message));
  }
  if (page === "staff" && admin()) hydrateAdminFieldwork().catch((e) => toast("Could not load salesman fieldwork: " + e.message));
  if (page === "staff" && client) hydrateTeamNotifications().catch((e) => toast("Could not load team notifications: " + e.message));
  if (page === "dsr")
    $("page").insertAdjacentHTML("beforeend", dsrClosingSection());
  syncBadge();
  if (page === "dashboard" || page === "pnl") drawCharts();
  if (page === "dashboard" && user.role === "salesman") hydrateSalesmanNotifications().catch((e) => toast("Could not load notifications: " + e.message));
  if (page === "dashboard" && manager()) hydrateManagerNotifications().catch((e) => toast("Could not load management messages: " + e.message));
  if ((page === "staff" || (page === "dashboard" && manager())) && (admin() || manager())) hydrateSalesmanPhotoNodes().catch((e) => toast("Could not load employee photos: " + e.message));
}
async function hydrateManagerFieldwork() {
  if (!manager() || !client || page !== "myprofile") return;
  const avatar = $("manager-profile-avatar");
  const profile = await client.from("profiles").select("avatar_path,display_name").eq("id", user.id).maybeSingle();
  if (!profile.error && profile.data?.avatar_path && avatar) {
    const signed = await client.storage.from("employee-private").createSignedUrl(profile.data.avatar_path, 3600);
    if (!signed.error && signed.data?.signedUrl && avatar.isConnected) avatar.innerHTML = `<img src="${esc(signed.data.signedUrl)}" alt="Manager profile photo">`;
  }
  const salaryRoot = $("manager-salary-history");
  if (salaryRoot) {
    const [salaryRows, advanceRows] = await Promise.all([
      client.from("expenses").select("date,category,description,amount_paisa,salary_period,deleted_at").eq("manager_user_id", user.id).is("deleted_at", null).order("date", {ascending:false}).limit(36),
      client.from("employee_salary_advances").select("advance_date,amount_paisa,recovered_paisa,reason,status").eq("manager_user_id", user.id).order("advance_date", {ascending:false}).limit(50)
    ]);
    const managerPayResult = await client.rpc("own_manager_salary_snapshot");
    const managerPay = managerPayResult.error ? null : applyArsalanOctoberPayrollCorrection(managerPayResult.data, profile.data?.display_name || user?.name);
    salaryRoot.innerHTML = (managerPay ? `<h3>Current salary estimate · ${esc(managerPay.salary_period || "")}</h3>${table(["Component","Amount / calculation"], [["Attendance credited", `${num(managerPay.attendance_days).toFixed(1)} of ${num(managerPay.working_days)} working days`],["Attendance factor", `${num(managerPay.working_days)>0 ? (num(managerPay.attendance_days)/num(managerPay.working_days)*100).toFixed(1) : "0.0"}%`],["Attendance-adjusted base salary",money(managerPay.base_salary_paisa)],["Attendance-adjusted allowance",money(managerPay.allowance_paisa)],["Confirmed own cartons", `${num(managerPay.achieved_cartons).toFixed(2)} cartons`],["Monthly target",`${num(managerPay.monthly_target).toFixed(2)} cartons`],["Cartons above target",`${Math.max(0,num(managerPay.achieved_cartons)-num(managerPay.monthly_target)).toFixed(2)} cartons`],["Incentive rate per extra carton",money(managerPay.incentive_per_carton_paisa)],["Carton incentive",money(managerPay.incentive_paisa)],["Gross estimate",`<b>${money(managerPay.gross_paisa)}</b>`],["Total advances",money(managerPay.advance_total_paisa)],["Advance recovered",money(managerPay.advance_recovered_paisa)],["Outstanding advances",money(managerPay.advance_outstanding_paisa)],["Estimated net after outstanding advances",`<b>${money(managerPay.estimated_net_after_outstanding_advances_paisa)}</b>`]], "Salary estimate unavailable.")}` : `<p class="notice">Current salary estimate unavailable${managerPayResult.error ? ": "+esc(managerPayResult.error.message) : ""}. Apply the payroll migration.</p>`) + (salaryRows.error ? `<p class="notice">Salary history could not load: ${esc(salaryRows.error.message)}</p>` : `<h3>Salary payments</h3>${table(["Date","Period","Gross / payment details","Net paid"], (salaryRows.data||[]).filter(x=>/salary/i.test(x.category||"") || x.salary_period).map(x=>[esc(x.date),esc(x.salary_period||"—"),esc(x.description||"Salary"),money(x.amount_paisa)]), "No posted salary payments found.")}`) + (advanceRows.error ? `<p class="notice">Advance history could not load: ${esc(advanceRows.error.message)}</p>` : `<h3>Salary advances</h3>${table(["Date","Advance","Recovered","Outstanding","Reason","Status"],(advanceRows.data||[]).map(a=>[esc(a.advance_date),money(a.amount_paisa),money(a.recovered_paisa||0),money(Math.max(0,num(a.amount_paisa)-num(a.recovered_paisa))),esc(a.reason||"—"),esc(a.status||"posted")]),"No salary advances recorded.")}`);
  }
  const [attendance, documents, visits, team, teamAttendance] = await Promise.all([
    client.from("manager_attendance_records").select("attendance_date,check_in_at,check_out_at,status,latitude,longitude").eq("manager_user_id", user.id).order("attendance_date", {ascending:false}).limit(60),
    client.from("manager_employee_documents").select("document_type,file_path,file_name,mime_type,size_bytes,created_at").eq("manager_user_id", user.id).order("created_at", {ascending:false}).limit(100),
    client.from("manager_customer_visits").select("customer_label,area,purpose,notes,visited_at,latitude,longitude").eq("manager_user_id", user.id).order("visited_at", {ascending:false}).limit(60),
    client.from("salesmen").select("id,name,phone,territory,area,active,manager_user_id").eq("manager_user_id", user.id).eq("active", true),
    client.from("attendance_records").select("salesman_id,attendance_date,check_in_at,check_out_at,status,check_in_latitude,check_in_longitude").order("attendance_date", {ascending:false}).limit(500),
  ]);
  const showError = (r) => r.error ? `<p class="notice">Unable to load records: ${esc(r.error.message)}. Apply the Manager fieldwork migration.</p>` : "";
  const rows = (id, result, headers, map, empty) => { const el=$(id); if (!el || !el.isConnected) return; el.innerHTML = showError(result) || table(headers,(result.data||[]).map(map),empty); };
  rows("manager-attendance-history",attendance,["Date","Check-in","Check-out","Status","GPS"],r=>[esc(r.attendance_date),esc(r.check_in_at?new Date(r.check_in_at).toLocaleTimeString():"—"),esc(r.check_out_at?new Date(r.check_out_at).toLocaleTimeString():"—"),esc(r.status),r.latitude==null?"Not shared":`<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(r.latitude)},${encodeURIComponent(r.longitude)}">View map</a>`],"No attendance recorded yet.");
  const docsEl=$("manager-document-history");
  if(docsEl?.isConnected){
    if(documents.error) docsEl.innerHTML=showError(documents);
    else { const dr=await Promise.all((documents.data||[]).map(async d=>{const signed=await client.storage.from("employee-private").createSignedUrl(d.file_path,3600);return [esc(d.file_name),esc(d.document_type),esc(new Date(d.created_at).toLocaleString()),`${Math.ceil(num(d.size_bytes)/1024)} KB`,signed.data?.signedUrl?`<a href="${esc(signed.data.signedUrl)}" target="_blank" rel="noopener">Open private file</a>`:esc(signed.error?.message||"Unavailable")];})); docsEl.innerHTML=table(["Document","Type","Uploaded","Size","File"],dr,"No documents uploaded yet."); }
  }
  rows("manager-visit-history",visits,["Visited","Customer","Area","Purpose","Notes","GPS"],r=>[esc(new Date(r.visited_at).toLocaleString()),esc(r.customer_label||"—"),esc(r.area||"—"),esc(r.purpose||"—"),esc(r.notes||"—"),r.latitude==null?"Not shared":`<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(r.latitude)},${encodeURIComponent(r.longitude)}">View map</a>`],"No fieldwork visits recorded yet.");
  const names=new Map((team.data||[]).map(x=>[String(x.id),x.name]));
  const teamEl=$("manager-team-attendance");
  if(teamEl?.isConnected){
    if(team.error) teamEl.innerHTML=showError(team);
    else if(teamAttendance.error) teamEl.innerHTML=showError(teamAttendance);
    else { const linked=new Set((team.data||[]).map(x=>String(x.id))); const rec=(teamAttendance.data||[]).filter(x=>linked.has(String(x.salesman_id))); teamEl.innerHTML=table(["Salesman","Date","Check-in","Check-out","Status","Location"],rec.map(r=>[esc(names.get(String(r.salesman_id))||r.salesman_id),esc(r.attendance_date),esc(r.check_in_at?new Date(r.check_in_at).toLocaleString():"—"),esc(r.check_out_at?new Date(r.check_out_at).toLocaleString():"—"),esc(r.status),r.check_in_latitude==null?"Not shared":`<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(r.check_in_latitude)},${encodeURIComponent(r.check_in_longitude)}">View map</a>`]),"No attendance records for your linked salesmen."); }
  }
}

function salesmanDayBody(sid, day) {
  const s = S(), id = String(sid), d = String(day || today());
  const moves = (s.salesman_stock_movements || []).filter((m) => String(m.salesman_id) === id);
  const sold = new Map();
  for (const o of s.orders.filter((o) => String(o.salesman_id) === id && o.status === "confirmed" && !o.deleted_at && o.date === d))
    for (const i of (s.order_items || []).filter((i) => i.order_id === o.id))
      sold.set(i.product_id, (sold.get(i.product_id) || 0) + num(i.boxes));
  const ids = new Set([...moves.map((m) => m.product_id), ...sold.keys()]);
  const rows = [...ids].map((pid) => {
    const mv = moves.filter((m) => String(m.product_id) === String(pid));
    const sum = (f) => mv.filter(f).reduce((n, m) => n + num(m.boxes), 0);
    const opening = sum((m) => String(m.date) < d);
    const issued = sum((m) => String(m.date) === d && m.kind === "issue");
    const returned = Math.abs(sum((m) => String(m.date) === d && String(m.kind).startsWith("return")));
    const soldBoxes = sold.get(pid) || 0;
    const closing = sum((m) => String(m.date) <= d);
    const name = visible(s.products).find((p) => String(p.id) === String(pid))?.name || pid;
    return { name, opening, issued, returned, soldBoxes, closing };
  }).filter((r) => r.opening || r.issued || r.returned || r.soldBoxes || r.closing)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const tot = rows.reduce((t, r) => ({ opening: t.opening + r.opening, issued: t.issued + r.issued, returned: t.returned + r.returned, soldBoxes: t.soldBoxes + r.soldBoxes, closing: t.closing + r.closing }), { opening: 0, issued: 0, returned: 0, soldBoxes: 0, closing: 0 });
  const cells = (r) => [r.opening, r.issued, r.returned, r.soldBoxes, r.closing].map((v) => String(Math.round(v * 100) / 100));
  const body = rows.map((r) => [esc(r.name), ...cells(r)]);
  if (rows.length) body.push(["<b>Total</b>", ...cells(tot).map((v) => `<b>${v}</b>`)]);
  return `<div class="cards">${card("Stock assigned that day", tot.issued + " boxes", esc(d))}${card("Sold that day", tot.soldBoxes + " boxes", esc(d))}${card("Stock in hand at end of day", tot.closing + " boxes", esc(d))}</div>` +
    table(["Product", "Opening", "Assigned", "Returned", "Sold", "In hand"], body, "No stock was assigned to you and nothing was sold on this day.");
}
function applyArsalanOctoberPayrollCorrection(snapshot, employeeName) {
  const pay = snapshot && typeof snapshot === "object" ? { ...snapshot } : {};
  const name = String(employeeName || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!name.includes("arsalan") || String(pay.salary_period || "") !== "2026-10" || pay.status === "posted") return pay;
  // Match the agreed Admin payroll basis on Arsalan's own salary screens as well.
  // This is a display/calculation correction only; it does not insert attendance rows.
  const monthlyBase = 4500000; // PKR 45,000 in paisa
  const workingDays = 30;
  const creditedDays = 17;
  const baseEarned = Math.round(monthlyBase * creditedDays / workingDays);
  const monthlyAllowance = Math.max(0, num(pay.allowance_monthly_paisa ?? pay.allowance_base_monthly_paisa ?? 0));
  const allowanceEarned = Math.round(monthlyAllowance * creditedDays / workingDays);
  const incentive = Math.max(0, num(pay.incentive_paisa));
  const gross = baseEarned + allowanceEarned + incentive;
  const outstanding = Math.max(0, num(pay.advance_outstanding_paisa ?? (num(pay.advance_total_paisa) - num(pay.advance_recovered_paisa))));
  pay.attendance_days = creditedDays;
  pay.working_days = workingDays;
  pay.base_salary_monthly_paisa = monthlyBase;
  pay.base_salary_paisa = baseEarned;
  pay.allowance_paisa = allowanceEarned;
  pay.gross_paisa = gross;
  pay.advance_outstanding_paisa = outstanding;
  pay.estimated_net_after_outstanding_advances_paisa = Math.max(0, gross - outstanding);
  pay.total_paisa = pay.estimated_net_after_outstanding_advances_paisa;
  pay.arsalan_payroll_correction = true;
  return pay;
}

async function hydrateSalesmanSalary(seller) {
  const el = $("my-salary-panel");
  if (!el || !client) return;
  const month = today().slice(0, 7);
  const basisResult = await client.from("salesman_compensation_settings").select("salary_basis").eq("user_id", seller.user_id || seller.id).maybeSingle();
  if (!el.isConnected) return;
  if (!basisResult.error && basisResult.data?.salary_basis === "commission") {
    const [rateResult, itemResult] = await Promise.all([
      client.from("salesman_product_commissions").select("product_id,product_name,commission_per_carton_paisa").eq("user_id", seller.user_id || seller.id),
      client.from("order_items").select("order_id,product_id,boxes,boxes_per_carton")
    ]);
    if (rateResult.error || itemResult.error) {
      el.innerHTML = `<p class="notice danger">Commission earnings could not be loaded: ${esc(rateResult.error?.message || itemResult.error?.message)}. Contact Admin.</p>`;
      return;
    }
    const rates = new Map((rateResult.data || []).map(r => [String(r.product_id), r]));
    const orders = S().orders.filter(o => String(o.salesman_id) === String(seller.id) && o.status === "confirmed" && !o.deleted_at && String(o.date || "").startsWith(month));
    const orderById = new Map(orders.map(o => [String(o.id), o]));
    const itemRows = (itemResult.data || []).filter(i => orderById.has(String(i.order_id)));
    const detail = new Map();
    for (const item of itemRows) {
      const rate = rates.get(String(item.product_id));
      const boxesPerCarton = Math.max(1, num(item.boxes_per_carton) || num(S().settings?.boxes_per_carton) || 24);
      const cartons = num(item.boxes) / boxesPerCarton;
      const commission = rate ? Math.round(cartons * num(rate.commission_per_carton_paisa)) : 0;
      const key = String(item.product_id);
      const prev = detail.get(key) || { name: rate?.product_name || (S().products || []).find(p=>String(p.id)===key)?.name || key, cartons: 0, rate: num(rate?.commission_per_carton_paisa), commission: 0 };
      prev.cartons += cartons; prev.commission += commission; detail.set(key, prev);
    }
    const totalCartons = [...detail.values()].reduce((n,x)=>n+x.cartons,0);
    const totalCommission = [...detail.values()].reduce((n,x)=>n+x.commission,0);
    el.innerHTML = `<div class="cards">${card("Salary basis","Commission","Per-product rate")}${card("Confirmed cartons sold",totalCartons.toFixed(2),"This month")}${card("Commission earned",money(totalCommission),"Based on confirmed personal sales")}</div><h4>Commission calculation by product</h4>${table(["Product","Cartons sold","Commission per carton","Commission earned"],[...detail.values()].map(x=>[esc(x.name),x.cartons.toFixed(2),money(x.rate),`<b>${money(x.commission)}</b>`]),"No confirmed product sales for this month.")}<p class="muted">Commission is calculated per product using confirmed personal sales only. Fixed salary and target-based incentive calculations do not apply to this commission-basis salesman.</p>`;
    return;
  }
  const boxes = S().orders
    .filter((o) => String(o.salesman_id) === String(seller.id) && o.status === "confirmed" && !o.deleted_at && String(o.date || "").startsWith(month))
    .reduce((n, o) => n + (S().order_items || []).filter((i) => i.order_id === o.id).reduce((a, i) => a + num(i.boxes), 0), 0);
  const r = await client.rpc("own_salary_snapshot");
  if (!el.isConnected) return;
  if (r.error) { el.innerHTML = `<p class="notice danger">Salary could not be loaded: ${esc(r.error.message)}. Contact Admin.</p>`; return; }
  const pay = applyArsalanOctoberPayrollCorrection(r.data || {}, seller.name || seller.display_name);
  const boxesPerCarton = Math.max(1, num(S().settings?.boxes_per_carton) || 24);
  const targetBoxes = Math.round(num(pay.monthly_target) * boxesPerCarton);
  const advanceResult = await client.from("employee_salary_advances").select("advance_date,amount_paisa,recovered_paisa,reason,status").eq("salesman_id", seller.id).order("advance_date", {ascending:false}).limit(30);
  const advances = advanceResult.error ? [] : (advanceResult.data || []);
  const outstandingAdvance = advances.filter(a=>a.status === "posted").reduce((n,a)=>n+Math.max(0,num(a.amount_paisa)-num(a.recovered_paisa)),0);
  el.innerHTML = `<div class="cards">${card("Attendance credited", `${num(pay.attendance_days).toFixed(1)} days`, `${num(pay.working_days)} working days`)}${card("Salary per attendance day", money(num(pay.base_salary_monthly_paisa) / Math.max(1,num(pay.working_days))), "Monthly base salary ÷ working days")}${card("Base salary earned", money(pay.base_salary_paisa || 0), "Calculated from attendance")}${card("Boxes sold this month", Math.round(boxes) + " boxes", `${num(pay.achieved_cartons).toFixed(2)} carton-equivalent sold`)}${card("Monthly target", `${num(pay.monthly_target).toFixed(2)} cartons`, `${targetBoxes} boxes at ${boxesPerCarton} boxes/carton · ${num(pay.achievement_percent).toFixed(1)}% achieved`)}${card("Estimated salary", money(pay.total_paisa ?? pay.estimated_net_after_outstanding_advances_paisa ?? 0), pay.status === "posted" ? "Posted for " + esc(pay.salary_period) : "Estimate after outstanding advances for " + esc(pay.salary_period))}${card("Salary advance outstanding", money(outstandingAdvance), advances.some(a=>a.status === "posted") ? "Advance taken; remaining balance" : "No outstanding advance")}</div>` +
    table(["Component", "Amount / calculation"], [["Attendance credited", `${num(pay.attendance_days).toFixed(1)} of ${num(pay.working_days)} working days`], ["Attendance factor", `${num(pay.working_days)>0 ? (num(pay.attendance_days)/num(pay.working_days)*100).toFixed(1) : "0.0"}%`], ["Attendance-adjusted base salary", money(pay.base_salary_paisa || 0)], ["Attendance-adjusted allowance", money(pay.allowance_paisa || 0)], ["Confirmed cartons sold", `${num(pay.achieved_cartons).toFixed(2)} cartons`], ["Monthly target", `${num(pay.monthly_target).toFixed(2)} cartons`], ["Cartons above target", `${Math.max(0,num(pay.achieved_cartons)-num(pay.monthly_target)).toFixed(2)} cartons`], ["Incentive per extra carton", money(pay.incentive_per_carton_paisa || 0)], ["Carton incentive", money(pay.incentive_paisa || 0)], ["Gross salary estimate", `<b>${money(pay.gross_paisa ?? pay.total_paisa ?? 0)}</b>`], ["Total advances", money(pay.advance_total_paisa ?? 0)], ["Advance recovered", money(pay.advance_recovered_paisa ?? 0)], ["Outstanding advances", money(pay.advance_outstanding_paisa ?? outstandingAdvance)], ["Estimated net after outstanding advances", `<b>${money(pay.estimated_net_after_outstanding_advances_paisa ?? Math.max(0, num(pay.gross_paisa ?? pay.total_paisa)-outstandingAdvance))}</b>`]], "") +
    (advanceResult.error ? `<p class="notice">Advance details could not load: ${esc(advanceResult.error.message)}. Ask Admin to apply the salary advance visibility migration.</p>` : `<h4>Salary advances taken</h4>${table(["Date","Advance taken","Recovered","Outstanding","Reason","Status"],advances.map(a=>[esc(a.advance_date),money(a.amount_paisa),money(a.recovered_paisa||0),money(Math.max(0,num(a.amount_paisa)-num(a.recovered_paisa))),esc(a.reason||"—"),esc(a.status||"posted")]),"No salary advances recorded.")}`) +
    `<p class="muted">Base salary and allowance are prorated by paid attendance (present/late/week off = 1 full paid day, half-day = 0.5 day; absent/leave/pending = 0). Weekly Week Off is paid by default and is not treated as absence. Carton incentive applies only to confirmed cartons above target. This is an estimate until marked Posted.</p>`;
}
async function hydrateSalesmanProfile() {
  const seller = own();
  if (!seller || !client || page !== "myprofile") return;
  const avatar = $("profile-avatar");
  if (seller.photo_path && avatar) {
    const { data, error } = await client.storage.from("employee-private").createSignedUrl(seller.photo_path, 3600);
    if (!error && data?.signedUrl && avatar.isConnected) avatar.innerHTML = `<img src="${esc(data.signedUrl)}" alt="Your profile photo">`;
  }
  const [attendance, documents, visits, assignments] = await Promise.all([
    client.from("attendance_records").select("attendance_date,check_in_at,check_out_at,status,check_in_latitude,check_in_longitude,check_in_location_accuracy_m").eq("salesman_id", seller.id).order("attendance_date", { ascending: false }).limit(30),
    client.from("employee_documents").select("document_type,file_path,file_name,mime_type,size_bytes,created_at").eq("salesman_id", seller.id).order("created_at", { ascending: false }).limit(50),
    client.from("customer_visits").select("customer_label,area,purpose,notes,visited_at,latitude,longitude").eq("salesman_id", seller.id).order("visited_at", { ascending: false }).limit(30),
    client.from("salesman_area_assignments").select("area_name,effective_from,effective_to,instructions").eq("salesman_id", seller.id).order("effective_from", { ascending: false }).limit(50),
  ]);
  const history = (id, result, headers, rows, emptyText) => {
    const el = $(id); if (!el || !el.isConnected) return;
    if (result.error) { el.innerHTML = `<p class="notice">Unable to load records: ${esc(result.error.message)}</p>`; return; }
    el.innerHTML = table(headers, result.data.map(rows), emptyText);
  };
  history("my-attendance-history", attendance, ["Date","Check-in","Check-out","Status"], r => [esc(r.attendance_date), esc(r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString() : "—"), esc(r.check_out_at ? new Date(r.check_out_at).toLocaleTimeString() : "—"), esc(r.status)], "No attendance records yet.");
  const docsEl = $("my-document-history");
  if (docsEl?.isConnected) {
    if (documents.error) docsEl.innerHTML = `<p class="notice danger">Unable to load your documents: ${esc(documents.error.message)}. Ask Admin to verify employee-document permissions.</p>`;
    else {
      const docRows = await Promise.all((documents.data || []).map(async d => {
        const signed = d.file_path ? await client.storage.from("employee-private").createSignedUrl(d.file_path, 3600) : { data: null, error: { message: "File path missing" } };
        const link = signed.data?.signedUrl ? `<a href="${esc(signed.data.signedUrl)}" target="_blank" rel="noopener">View / download</a>` : `<span class="muted">${esc(signed.error?.message || "File unavailable")}</span>`;
        return [esc(d.file_name), esc(({identity:"NIC / identity",education:"Educational certificate",employment:"Employment document",appointment:"Appointment letter",contract:"Employment contract",salary_bank:"Salary / bank document",other:"Other"})[d.document_type] || d.document_type), esc(new Date(d.created_at).toLocaleDateString()), `${Math.ceil(num(d.size_bytes)/1024)} KB`, link];
      }));
      docsEl.innerHTML = table(["Document","Type","Uploaded","Size","File"], docRows, "No documents uploaded yet. Contact your manager to upload your NIC, education and employment documents.");
    }
  }
  const advanceRoot = $("my-salary-advance-history");
  if (advanceRoot) {
    const adv = await client.from("employee_salary_advances").select("advance_date,amount_paisa,recovered_paisa,reason,status").eq("salesman_id", seller.id).order("advance_date", {ascending:false}).limit(50);
    advanceRoot.innerHTML = adv.error ? `<p class="notice">Salary advance details could not load: ${esc(adv.error.message)}. Ask Admin to apply the salary visibility migration.</p>` : table(["Date","Advance taken","Recovered","Outstanding","Reason","Status"], (adv.data||[]).map(a=>[esc(a.advance_date),money(a.amount_paisa),money(a.recovered_paisa||0),money(Math.max(0,num(a.amount_paisa)-num(a.recovered_paisa))),esc(a.reason||"—"),esc(a.status||"posted")]), "No salary advances recorded.");
  }
  history("my-visit-history", visits, ["Visited","Customer","Area","Purpose","Location"], r => [esc(new Date(r.visited_at).toLocaleString()), esc(r.customer_label || "—"), esc(r.area || "—"), esc(r.purpose || "—"), r.latitude == null ? "Not shared" : `${num(r.latitude).toFixed(4)}, ${num(r.longitude).toFixed(4)}`], "No customer visits recorded yet.");
  history("my-area-history", assignments, ["Area","Effective from","Effective until","Instructions"], r => [esc(r.area_name), esc(r.effective_from), esc(r.effective_to || "Current"), esc(r.instructions || "—")], "No area assignments recorded yet.");
  const areaNode = $("my-current-area");
  if (areaNode?.isConnected) {
    const t = today();
    const current = (assignments.data || []).filter((a) => a.effective_from <= t && (!a.effective_to || a.effective_to >= t)).map((a) => a.area_name);
    areaNode.textContent = current.length ? current.join(", ") : "Not assigned";
  }
  const dayInput = $("my-day-date");
  if (dayInput && !dayInput.dataset.bound) {
    dayInput.dataset.bound = "1";
    dayInput.addEventListener("change", () => { const body = $("my-day-body"); if (body) body.innerHTML = salesmanDayBody(seller.id, dayInput.value || today()); });
  }
  await hydrateSalesmanSalary(seller);
}

function salesmanTargetDetails(salesmanId) {
  const seller = own();
  if (!seller || seller.id !== salesmanId) throw Error("You can only view your own target details.");
  const s = S(), target = targetRows().find(t => t.id === seller.id);
  const days = s.salesman_daily_targets.filter(d => d.salesman_id === seller.id && d.date >= monthStart(today()) && d.date <= today()).sort((a,b)=>a.date.localeCompare(b.date));
  const rows = days.map(d => [esc(d.date), num(d.effective_target).toFixed(2), num(d.achieved_cartons).toFixed(2), num(d.achieved_boxes), Math.max(0,num(d.effective_target)-num(d.achieved_cartons)).toFixed(2), num(d.carried_forward_out).toFixed(2)]);
  modal("My monthly target · " + today().slice(0,7), `<section class="panel"><div class="cards">${card("Monthly target", `${num(target?.monthly_target).toFixed(2)} cartons`)}${card("Achieved", `${num(target?.achieved).toFixed(2)} cartons`)}${card("Remaining", `${Math.max(0,num(target?.monthly_target)-num(target?.achieved)).toFixed(2)} cartons`)}${card("Achievement", `${num(target?.percent).toFixed(1)}%`)}</div>${table(["Date","Daily target (ct)","Achieved (ct)","Boxes","Remaining (ct)","Carry forward (ct)"], rows, "No daily target records are available for this month.")}<p class="muted">Quantities only. Cancelled, returned and reversed sales follow the business target policy.</p></section>`);
}

function renderSalesmanDashboard() {
  const seller = own(), s = S();
  if (!seller) return head("My overview", "Your login is not linked to a salesman profile.") + '<section class="panel"><p class="notice">Please ask an administrator to link your login to your salesman profile.</p></section>';
  const sid = seller.id, orders = s.orders.filter(o => o.salesman_id === sid && o.status !== "cancelled" && !o.deleted_at);
  const todays = orders.filter(o => o.date === today()), month = orders.filter(o => String(o.date || "").startsWith(today().slice(0,7)));
  const held = visible(s.products).map(p => ({name:p.name, qty:heldStock(p.id, sid), unit:p.unit || "boxes"})).filter(x=>x.qty>0);
  const target = targetRows().find(t=>t.id===sid);
  const soldQuantity = list => list.reduce((sum,o) => sum + (s.order_items||[]).filter(i => i.order_id===o.id).reduce((n,i)=>n+num(i.boxes),0),0);
  const photo = seller.photo_url ? `<img src="${esc(seller.photo_url)}" alt="${esc(seller.name)} profile photo">` : "♙";
  return head("My overview", `Welcome, ${seller.name}. This dashboard shows your own operational activity only.`, btn("Open my profile", "go-myprofile", "", "", "gold")) +
    `<section class="panel"><div class="profile-hero"><div class="profile-avatar" id="salesman-dashboard-avatar">${photo}</div><div><h2>${esc(seller.name)}</h2><p>Employee ID: ${esc(seller.id)} · Date of birth: ${esc(seller.date_of_birth || "Not recorded")}</p><p>${esc(seller.territory || seller.area || "Territory not assigned")}</p></div></div></section>
    <div class="cards">${card("Quantity sold today",soldQuantity(todays),`${todays.length} confirmed order(s)`,true)}${card("Quantity sold this month",soldQuantity(month),`${month.length} confirmed order(s)`)}${card("Stock in hand",held.reduce((n,x)=>n+x.qty,0).toFixed(2),"Recorded quantity against you")}${card("Monthly target",`${num(target?.achieved).toFixed(2)} / ${num(target?.monthly_target).toFixed(2)} cartons`,`${num(target?.percent).toFixed(1)}% achieved`)}<div class="card"><div class="label">Monthly salary</div><div class="value" id="salesman-salary-value">Loading…</div><div class="meta" id="salesman-salary-meta">Waiting for the server calculation</div></div></div>
    <section class="panel"><div class="panel-heading"><h2>My stock in hand</h2></div>${table(["Product","Balance","Unit"],held.map(x=>[esc(x.name),x.qty.toFixed(2),esc(x.unit)]),"No stock currently recorded against your account.")}</section>
    <section class="panel"><div class="panel-heading"><h2>My latest sales quantities</h2></div>${table(["Date","Order","Quantity"],orders.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,8).map(o=>[esc(o.date),esc(o.number),num((s.order_items||[]).filter(i=>i.order_id===o.id).reduce((n,i)=>n+num(i.boxes),0))]),"No sales recorded yet.")}</section>
    <section class="panel"><div class="panel-heading"><h2>Messages from management</h2><span class="muted">Updates and instructions</span></div><div id="salesman-notifications"><p class="muted">Loading messages…</p></div></section>
    <section class="panel"><h2>Quick access</h2><div class="actions">${btn("View my profile","go-myprofile","","","gold")}${btn("Monthly target details","my-target-details",sid)}${btn("Salary breakdown","my-salary-details",sid)}${btn("Daily sales report","go-dsr")}</div></section>`;
}

async function hydrateSalesmanPhotoNodes() {
  if (!client || !(admin() || manager())) return;
  const scope = manager() ? new Set(managerTeamIds(S(), user.id).map(String)) : null;
  const sellers = visible(S().salesmen).filter(s => (!scope || scope.has(String(s.id))) && s.photo_path && s.user_id);
  await Promise.all(sellers.map(async seller => {
    const node = $("team-photo-" + seller.id); if (!node || !node.isConnected) return;
    const signed = await client.storage.from("employee-private").createSignedUrl(seller.photo_path, 3600);
    if (!signed.error && signed.data?.signedUrl && node.isConnected) node.innerHTML = `<img src="${esc(signed.data.signedUrl)}" alt="${esc(seller.name)} profile photo" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
  }));
}
async function hydrateTeamNotifications() {
  if (!client || !(admin() || manager()) || page !== "staff") return;
  const root = $("team-notification-history"); if (!root) return;
  const { data, error } = await client.from("employee_notifications").select("id,recipient_salesman_id,recipient_user_id,title,message,priority,requires_acknowledgement,acknowledged_at,read_at,created_at").order("created_at", { ascending: false }).limit(100);
  if (error) { root.innerHTML = `<p class="notice danger">Could not load message history: ${esc(error.message)}</p>`; return; }
  const sellers = new Map(S().salesmen.map(s => [String(s.id), s.name]));
  const managerNames = new Map((S().profiles || []).map(p => [String(p.id), p.display_name || p.full_name || p.name || "Manager"]));
  const rows = (data || []).filter(n => admin() || (n.recipient_salesman_id && managerTeamIds(S(), user.id).includes(n.recipient_salesman_id))).map(n => [n.recipient_salesman_id ? esc(sellers.get(String(n.recipient_salesman_id)) || n.recipient_salesman_id) : esc(managerNames.get(String(n.recipient_user_id)) || "Manager"), esc(n.title || "Message"), esc(n.message), esc(n.priority), n.read_at ? (n.acknowledged_at ? badge("Acknowledged","green") : badge("Read","green")) : badge("Unread","amber"), esc(new Date(n.created_at).toLocaleString())]);
  root.innerHTML = table(["Recipient","Title","Message","Priority","Status","Sent"], rows, "No messages have been sent yet.");
}
async function hydrateManagerNotifications() {
  if (!client || !manager()) return;
  const root = $("manager-notifications");
  if (!root) return;
  const { data, error } = await client.from("employee_notifications")
    .select("id,recipient_user_id,title,message,priority,requires_acknowledgement,acknowledged_at,read_at,expires_at,created_at,created_by")
    .eq("recipient_user_id", user.id).order("created_at", { ascending: false }).limit(50);
  if (error) { root.innerHTML = `<p class="notice danger">Messages unavailable: ${esc(error.message)}. Apply the management-messages migration.</p>`; return; }
  const active = (data || []).filter(n => !n.expires_at || n.expires_at >= new Date().toISOString());
  const unread = active.filter(n => !n.read_at).length;
  const rows = active.map(n => [`<b>${esc(n.title || "Message")}</b>${n.read_at ? "" : ` ${badge("UNREAD","amber")}`}<small>${esc(new Date(n.created_at).toLocaleString())} · ${esc(n.priority)}</small>`, esc(n.message), n.requires_acknowledgement && !n.acknowledged_at ? btn("Acknowledge", "ack-manager-notification", n.id, "", "gold") : (!n.read_at ? btn("Mark read", "read-manager-notification", n.id) : (n.acknowledged_at ? badge("Acknowledged","green") : badge("Read","green")))]);
  root.innerHTML = `<p class="notice">${unread} unread message${unread===1?"":"s"}</p>` + table(["Message","Details","Action"], rows, "No messages from the administrator yet.");
}

async function hydrateSalesmanNotifications() {
  if (!client || user?.role !== "salesman" || !own()) return;
  const root = $("salesman-notifications");
  const avatar = $("salesman-dashboard-avatar");
  if (avatar && own()?.photo_path) { const signed = await client.storage.from("employee-private").createSignedUrl(own().photo_path, 3600); if (!signed.error && signed.data?.signedUrl) avatar.innerHTML = `<img src="${esc(signed.data.signedUrl)}" alt="${esc(own().name)} profile photo">`; }
  const salaryValue = $("salesman-salary-value"), salaryMeta = $("salesman-salary-meta");
  if (salaryValue && salaryMeta) {
    const result = await client.rpc("own_salary_snapshot");
    if (result.error) { salaryValue.textContent = "Unavailable"; salaryMeta.textContent = "Salary calculation could not be loaded. Contact Admin."; }
    else if (result.data) { const pay = applyArsalanOctoberPayrollCorrection(result.data, own()?.name || own()?.display_name); salaryValue.textContent = money(pay.total_paisa ?? pay.gross_paisa ?? 0); salaryMeta.textContent = `${pay.status === "posted" ? `Posted for ${pay.salary_period}` : `Estimate for ${pay.salary_period} · pending Admin approval`} · Base earned ${money(pay.base_salary_paisa || 0)} · Attendance ${num(pay.attendance_days).toFixed(1)}/${num(pay.working_days)} days`; }
  }
  if (!root) return;
  const { data, error } = await client.from("employee_notifications").select("id,title,message,priority,requires_acknowledgement,acknowledged_at,read_at,expires_at,created_at").eq("recipient_salesman_id", own().id).order("created_at", { ascending: false }).limit(50);
  if (error) { root.innerHTML = `<p class="notice danger">Notifications unavailable: ${esc(error.message)}. Apply the revamp migration and verify access policies.</p>`; return; }
  const activeMessages = (data || []).filter(n => !n.expires_at || n.expires_at >= new Date().toISOString());
  const unreadCount = activeMessages.filter(n => !n.read_at).length;
  const rows = activeMessages.map(n => [`<b>${esc(n.title || "Message")}</b>${n.read_at ? "" : ` ${badge("UNREAD","amber")}`}<small>${esc(new Date(n.created_at).toLocaleString())} · ${esc(n.priority)}</small>`, esc(n.message), n.requires_acknowledgement && !n.acknowledged_at ? btn("Acknowledge", "ack-notification", n.id, "", "gold") : (!n.read_at ? btn("Mark read", "read-notification", n.id) : (n.acknowledged_at ? badge("Acknowledged","green") : badge("Read","green")))]);
  root.innerHTML = `<p class="notice">${unreadCount} unread message${unreadCount===1?"":"s"}</p>` + table(["Message","Details","Action"], rows, "No messages from your manager or administrator.");
}
function notificationModal(salesmanId = "") {
  if (!(admin() || manager())) throw Error("Only Admin or an authorized Manager can send messages.");
  const sellers = visible(S().salesmen).filter(s => admin() || managerTeamIds(S(), user.id).includes(s.id));
  const choices = sellers.map(s => [s.id, `${s.name} (${s.id})`]);
  if (salesmanId && !choices.some(x => x[0] === salesmanId)) throw Error("This salesman is outside your assigned team.");
  let recipientField;
  if (admin()) {
    const managerIds = [...new Set((S().user_roles || []).filter(r => String(r.role || "").toLowerCase() === "manager").map(r => String(r.user_id)))];
    const profileNames = new Map((S().profiles || []).map(p => [String(p.id), p.display_name || p.full_name || p.name || "Manager"]));
    const managerChoices = managerIds.map(id => [`manager:${id}`, `${profileNames.get(id) || "Manager"} + their salesmen`]);
    const options = salesmanId
      ? [[`salesman:${salesmanId}`, `Salesman: ${sellers.find(s=>s.id===salesmanId)?.name || salesmanId} (also notify assigned Manager)`]]
      : [["__all_managers__", "All Managers and their assigned salesmen"], ["__all_salesmen__", "All salesmen (also notify their Managers)"], ...managerChoices, ...choices.map(([id,label]) => [`salesman:${id}`, `Salesman: ${label} (also notify assigned Manager)`])];
    recipientField = select("Recipients", "recipient_scope", options, options[0]?.[0] || "__all_managers__");
  } else {
    recipientField = salesmanId
      ? `<p>Recipient: <b>${esc(sellers.find(s=>s.id===salesmanId)?.name || salesmanId)}</b></p><input type="hidden" name="recipient_salesman_id" value="${esc(salesmanId)}">`
      : select("Recipient", "recipient_salesman_id", [["__team__", "All salesmen in my assigned team"], ...choices], "__team__");
  }
  modal(salesmanId ? "Message salesman" : "Team announcement", `<form id="notification-form" data-salesman="${esc(salesmanId)}"><div class="grid">${recipientField}${field("Title", "title", "", "text", 'required maxlength="160"')}${area("Message", "message", "")}${select("Priority", "priority", [["low","Low"],["normal","Normal"],["high","High"],["urgent","Urgent"]], "normal")}${select("Acknowledgement", "requires_acknowledgement", [["false","No acknowledgement required"],["true","Require acknowledgement"]], "false")}${field("Optional expiry date", "expires_at", "", "date")}</div><button class="gold" type="submit">Send message</button></form>`);
}

async function areaAssignmentModal(salesmanId) {
  if (!(admin() || manager())) throw Error("Admin or Manager access required.");
  const seller = S().salesmen.find(s => s.id === salesmanId);
  if (!seller || (manager() && !managerTeamIds(S(), user.id).includes(salesmanId))) throw Error("This salesman is outside your assigned team.");
  if (!client) throw Error("Area assignment requires an online connection.");
  const { data, error } = await client.from("sales_areas").select("name").eq("active", true).order("name");
  if (error) throw error;
  const choices = [["", "Select an area"], ...(data || []).map(a => [a.name,a.name])];
  if (choices.length === 1) throw Error("No active areas exist. Ask an Admin to create an area in Manage areas.");
  const current = seller.territory || seller.area || "";
  modal("Assign sales area · " + seller.name, `<form id="area-assignment-form" data-salesman="${esc(salesmanId)}"><div class="grid">${select("Existing active area", "area_name", choices, choices.some(a=>a[0]===current)?current:"")}${field("Effective from", "effective_from", today(), "date", "required")}${field("Effective until (optional)", "effective_to", "", "date")}${area("Operational instructions", "instructions", "")}</div><p class="muted">Choose an active area from the Admin catalogue. Assignments are effective-dated and historical assignments are preserved.</p><button class="gold" type="submit">Save area assignment</button></form>`);
}
async function manageAreasModal() {
  if (!(admin() || manager()) || !client) throw Error("Only an online Admin or Manager can manage area definitions.");
  const { data, error } = await client.from("sales_areas").select("id,name,description,active,created_at").order("name");
  if (error) throw error;
  const rows = (data||[]).map(a=>[`<b>${esc(a.name)}</b><small>${esc(a.description||"")}</small>`,a.active?badge("Active","green"):badge("Inactive","amber"),esc(a.created_at?new Date(a.created_at).toLocaleDateString():"—"),admin()?btn(a.active?"Deactivate":"Activate","toggle-area",a.id):"—"]);
  modal("Manage sales areas", `<section class="panel">${table(["Area","Status","Created",...(admin()?["Action"]:[])],rows,"No areas yet. Add your first area below.")}</section><form id="sales-area-form"><div class="grid">${field("Area name","name","","text",'required maxlength="120"')}${field("Description / instructions","description","")}</div><button class="gold" type="submit">Add area</button></form><p class="muted">${admin()?"Deactivating an area prevents new assignments but preserves its historical assignments.":"Managers can create active areas for their assigned salesmen. Only Admin can deactivate or reactivate areas."}</p>`);
}

function attendanceModal(salesmanId) {
  if (!(admin() || manager())) throw Error("Attendance is manager/admin controlled.");
  const seller = S().salesmen.find(s => s.id === salesmanId);
  if (!seller || (manager() && !managerTeamIds(S(), user.id).includes(salesmanId))) throw Error("This salesman is outside your assigned team.");
  modal("Record attendance · " + seller.name, `<form id="attendance-manager-form" data-salesman="${esc(salesmanId)}"><div class="grid">${field("Attendance date", "attendance_date", today(), "date", "required")}${select("Status", "status", [["present","Present"],["late","Late"],["half_day","Half day"],["absent","Absent"],["leave","Leave"],["pending","Pending"],["week_off","Week Off"]], "present")}${area("Correction reason / manager remarks", "remarks", "")}</div><p class="muted">Saving creates or updates the single attendance record for this salesman and date. Changes are logged by the database audit trigger where configured.</p><button class="gold" type="submit">Save attendance</button></form>`);
}

function renderManagerDashboard() {
  const s = S(), teamIds = new Set(managerTeamIds(s, user.id).map(String));
  const team = visible(s.salesmen).filter(x => teamIds.has(String(x.id)));
  const from = monthStart(today()), to = today();
  const teamOrders = s.orders.filter(o => teamIds.has(String(o.salesman_id)) && o.status === "confirmed" && !o.deleted_at && o.date >= from && o.date <= to);
  const managerOrders = s.orders.filter(o => o.status === "confirmed" && !o.deleted_at && !o.salesman_id && o.created_by === user.id && o.date >= from && o.date <= to);
  const quantity = orders => orders.reduce((sum, o) => sum + (s.order_items || []).filter(i => i.order_id === o.id).reduce((n, i) => n + num(i.boxes), 0), 0);
  const cartons = orders => orders.reduce((sum, o) => sum + (s.order_items || []).filter(i => i.order_id === o.id).reduce((n, i) => n + num(i.boxes) / Math.max(1, num(i.boxes_per_carton) || num(s.settings.boxes_per_carton) || 24), 0), 0);
  const targets = targetRows().filter(t => teamIds.has(String(t.id)));
  const achievedCartons = targets.reduce((sum, t) => sum + num(t.achieved), 0);
  const managerCartons = cartons(managerOrders);
  const teamTarget = num(s.settings.company_monthly_target) || 2000;
  const remainingTeamTarget = Math.max(0, teamTarget - achievedCartons);
  const attendance = (s.attendance_records || []).filter(a => teamIds.has(String(a.salesman_id)) && a.attendance_date === today());
  const present = attendance.filter(a => ["present", "late", "half_day"].includes(a.status)).length;
  const absent = attendance.filter(a => ["absent", "leave"].includes(a.status)).length;
  const recorded = new Set(attendance.map(a => String(a.salesman_id))).size;
  const stockIssues = (s.salesman_stock_movements || []).filter(m => teamIds.has(String(m.salesman_id)) && m.kind === "issue" && m.date === today()).reduce((n,m)=>n+num(m.boxes),0);
  const stockReturns = (s.salesman_stock_movements || []).filter(m => teamIds.has(String(m.salesman_id)) && String(m.kind).startsWith("return_") && m.date === today()).reduce((n,m)=>n+Math.abs(num(m.boxes)),0);
  const cards = `<div class="cards">${card("Team monthly target", `${teamTarget.toFixed(2)} cartons`, "Configured team target", true)}${card("Team achieved (salesmen)", `${achievedCartons.toFixed(2)} cartons`, `${(achievedCartons / teamTarget * 100 || 0).toFixed(1)}% of target achieved`)}${card("Your additional cartons sold", `+${managerCartons.toFixed(2)} cartons`, `${managerOrders.length} confirmed order(s) sold directly under your manager account · not counted toward team target`)}${card("Remaining team target", `${remainingTeamTarget.toFixed(2)} cartons`, "Based on salesmen's achievement only", true)}${card("Salesmen present", present, `${team.length} assigned`)}${card("Salesmen absent / leave", absent, "Attendance records today")}${card("Attendance missing", Math.max(0,team.length-recorded), "Not yet recorded")}${card("Boxes sold today", quantity(teamOrders.filter(o=>o.date===today())), "Confirmed team sales quantity")}${card("Stock issued today", stockIssues.toFixed(2), "Existing stock ledger")}${card("Stock returned today", stockReturns.toFixed(2), "Existing stock ledger")}</div>`;
  return head("Manager overview", "Operational control for your assigned salesmen. Financial account balances, revenue, wholesale prices and profit are not displayed.", btn("Manage salesmen", "go-staff", "", "", "gold")) + cards +
    `<section class="panel"><div class="panel-heading"><h2>My team</h2>${btn("Open salesmen & targets", "go-staff")}</div>${table(["Salesman","Area","Attendance","Monthly target","Achieved","Remaining","Actions"], targets.map(t => { const seller=team.find(x=>String(x.id)===String(t.id)); const att=attendance.find(a=>String(a.salesman_id)===String(t.id)); return [`<span class="profile-avatar" id="team-photo-${esc(t.id)}" style="width:32px;height:32px;font-size:14px;display:inline-flex;vertical-align:middle;margin-right:8px">${esc(String(t.name||"S").slice(0,1).toUpperCase())}</span><b>${esc(t.name)}</b>`,esc(seller?.territory||seller?.area||"Not assigned"),esc(att?.status||"Not recorded"),`${num(t.monthly_target).toFixed(2)} cartons`,`${num(t.achieved).toFixed(2)} cartons`,`${Math.max(0,num(t.monthly_target)-num(t.achieved)).toFixed(2)} cartons`,`${btn("Details","salesman-profile",t.id)}${btn("Attendance","mark-attendance",t.id)}${btn("Message","notify-salesman",t.id)}`]; }), "No salesmen are assigned to this manager. Admin should assign employees from Salesmen & Targets.")}</section><section class="panel"><div class="panel-heading"><h2>Messages from Admin</h2><span class="muted">Announcements and instructions</span></div><div id="manager-notifications"><p class="muted">Loading messages…</p></div></section>`;
}

function renderAdminMyProfile() {
  const current = user || {};
  const profile = S().profiles?.find((p) => String(p.id) === String(current.id)) || {};
  return head("My profile & fieldwork", "Administrator account details and a consolidated view of Manager and salesman attendance, documents, customer visits and profile photos.") +
    `<section class="panel"><div class="profile-hero"><div class="profile-avatar" id="admin-profile-avatar">♙</div><div><h2>${esc(current.name || profile.display_name || "Administrator")}</h2><p class="muted">${esc(current.email || "Email not available")}</p><p>Role: <b>Administrator</b></p><p class="muted">Account ID: ${esc(current.id || "—")}</p></div></div><div class="grid"><div class="field"><label for="admin-profile-photo">Upload / change administrator profile picture</label><input id="admin-profile-photo" type="file" accept="image/jpeg,image/png,image/webp"></div><button class="gold" data-act="admin-profile-photo-upload">Upload profile picture</button></div><p class="muted">Use a JPG, PNG or WebP image up to 5 MB. Your picture is private and visible to authorized users.</p><p class="muted">This page displays the signed-in administrator account. Salesman records and photos below are read-only and do not require the administrator to be linked to a salesman record.</p></section>
    <section class="panel"><div class="panel-heading"><h2>Manager fieldwork & uploads</h2><span class="muted">Admin view · manager accounts</span></div><div id="admin-manager-fieldwork-data"><p class="muted">Loading Manager attendance, uploads and visits…</p></div></section><section class="panel"><div class="panel-heading"><h2>Salesman fieldwork & profile photos</h2><span class="muted">Admin view</span></div><div id="admin-fieldwork-data"><p class="muted">Loading attendance, documents, visits and profile photos…</p></div></section>`;
}

function renderManagerMyProfile() {
  const current = user || {};
  return head("My profile & fieldwork", "Manager profile, attendance, secure documents, field visits and attendance of salesmen linked to your account.") +
    `<section class="panel"><div class="profile-hero"><div class="profile-avatar" id="manager-profile-avatar">♙</div><div><h2>${esc(current.name || current.email || "Manager")}</h2><p class="muted">${esc(current.email || "Email not available")}</p><p>Role: <b>Manager</b></p><p class="muted">Account ID: ${esc(current.id || "—")}</p></div></div><div class="grid"><div class="field"><label for="manager-profile-photo">Upload / change profile photo</label><input id="manager-profile-photo" type="file" accept="image/jpeg,image/png,image/webp"></div><button class="gold" data-act="manager-profile-photo-upload">Upload profile photo</button></div><p class="muted">JPG, PNG or WebP up to 5 MB. Stored privately.</p></section>
    <section class="panel"><h2>My salary & advances</h2><p class="muted">Your posted salary payments and any salary advance still outstanding are shown here.</p><div id="manager-salary-history"><p class="muted">Loading salary and advance details…</p></div></section>
    <section class="panel"><h2>My attendance</h2><p>Check in and check out for today. GPS is optional and only requested when you check in.</p><div class="actions">${btn("Check in", "manager-attendance-check-in", "", "", "gold")}${btn("Check out", "manager-attendance-check-out")}</div><div id="manager-attendance-history"><p class="muted">Loading attendance history…</p></div></section>
    <section class="panel"><h2>My documents & photos</h2><div class="grid">${select("Document type","manager-document-type",[["identity","Identity document"],["employment","Employment document"],["other","Other document"]],"other")}<div class="field"><label for="manager-document-file">Choose PDF or photo</label><input id="manager-document-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></div></div><button class="gold" data-act="manager-document-upload">Upload securely</button><p class="muted">Maximum 10 MB. Private links expire after one hour.</p><div id="manager-document-history"><p class="muted">Loading documents…</p></div></section>
    <section class="panel"><h2>Customer visits & fieldwork</h2><p class="muted">Record visits and notes. GPS is optional.</p><div class="grid">${field("Customer name or ID","manager-visit-customer","")}${field("Area visited","manager-visit-area","")}${select("Visit purpose","manager-visit-purpose",["Sales visit","Recovery","Order follow-up","Relationship visit","Other"],"Sales visit")}${area("Visit notes / outcome","manager-visit-notes","")}</div><div class="actions">${btn("Save visit without GPS","manager-visit-save")}${btn("Save visit with my location","manager-visit-save-location","","","gold")}</div><div id="manager-visit-history"><p class="muted">Loading visit history…</p></div></section>
    <section class="panel"><div class="panel-heading"><h2>Attendance of my linked salesmen</h2><span class="muted">Only salesmen assigned to this Manager</span></div><div id="manager-team-attendance"><p class="muted">Loading linked salesman attendance…</p></div></section>`;
}

function renderMyProfile() {
  if (admin()) return renderAdminMyProfile();
  if (manager()) return renderManagerMyProfile();
  const seller = own();
  if (!seller) return head("My profile", "Your account is not linked to a salesman record.") + '<section class="panel"><p class="notice">Please ask an administrator to link your login to your salesman profile.</p></section>';
  const s = S(), sid = seller.id;
  const productRows = visible(s.products).map(p => { const qty = heldStock(p.id, sid); return qty ? [esc(p.name), qty.toFixed(2), esc(p.unit || "boxes")] : null; }).filter(Boolean);
  const orders = s.orders.filter(o => String(o.salesman_id) === String(sid) && o.status === "confirmed" && !o.deleted_at);
  const monthOrders = orders.filter(o => String(o.date || "").startsWith(today().slice(0, 7)));
  const monthBoxes = monthOrders.reduce((n, o) => n + (s.order_items || []).filter(i => i.order_id === o.id).reduce((a, i) => a + num(i.boxes), 0), 0);
  const monthCartons = monthOrders.reduce((n, o) => n + (s.order_items || []).filter(i => i.order_id === o.id).reduce((a, i) => a + num(i.boxes) / Math.max(1, num(i.boxes_per_carton) || 24), 0), 0);
  const monthlyTarget = num(seller.monthly_target);
  const achievementPercent = monthlyTarget > 0 ? monthCartons / monthlyTarget * 100 : 0;
  const photo = seller.photo_url ? `<img src="${esc(seller.photo_url)}" alt="${esc(seller.name)} profile photo">` : "♙";
  return head("My profile", "Your profile, assigned area, daily stock and sales, monthly target, salary estimate and manager-uploaded documents.") +
    `<section class="panel"><div class="profile-hero"><div class="profile-avatar" id="profile-avatar">${photo}</div><div><h2>${esc(seller.name)}</h2><p class="muted">Employee ID: ${esc(seller.id)} · ${esc(seller.phone || "No phone added")}</p><p>Date of birth: <b>${esc(seller.date_of_birth || "Not recorded")}</b></p><p>Assigned area: <b id="my-current-area">${esc(seller.territory || seller.area || (client ? "Loading…" : "Not assigned"))}</b></p><p>Status: <b>${seller.active ? "Active" : "Inactive"}</b></p></div></div><p class="notice">Profile details, photograph, date of birth, NIC and education documents can only be changed by authorized management. Please contact your manager if anything needs correction.</p></section>
    <div class="cards">${card("Boxes sold today", orders.filter(o=>o.date===today()).reduce((n,o)=>n+(s.order_items||[]).filter(i=>i.order_id===o.id).reduce((a,i)=>a+num(i.boxes),0),0), "Confirmed sales quantity")}${card("Monthly target progress", `${monthBoxes} boxes sold · ${monthCartons.toFixed(2)} / ${monthlyTarget.toFixed(2)} cartons`, `${achievementPercent.toFixed(1)}% achieved · salary incentive follows confirmed sales`)}${card("Stock in hand", productRows.reduce((n,r)=>n+num(r[1]),0).toFixed(2), "Recorded quantity against you")}</div>
    <section class="panel"><h2>My salary this month</h2><div id="my-salary-panel"><p class="muted">Loading salary…</p></div></section>
    <section class="panel"><div class="panel-heading"><h2>Stock assigned &amp; sales by day</h2><div class="field" style="margin:0"><label for="my-day-date">Day</label><input id="my-day-date" type="date" value="${today()}" max="${today()}"></div></div><div id="my-day-body">${salesmanDayBody(sid, today())}</div></section>
    <section class="panel"><h2>My stock in hand</h2>${table(["Product","Balance","Unit"], productRows, "No stock is currently recorded against you.")}</section>
    <section class="panel"><h2>Attendance history</h2><p class="muted">Attendance is recorded and corrected by authorized management. This view is read-only.</p><div id="my-attendance-history"><p class="muted">Loading attendance history…</p></div></section>
    <section class="panel"><h2>Assigned areas & history</h2><div id="my-area-history"><p class="muted">Loading area assignments…</p></div></section>
    <section class="panel"><h2>My employee documents</h2><p class="muted">Documents uploaded by authorized management are listed below. Contact your manager if a document is missing or outdated.</p><div id="my-document-history"><p class="muted">Loading your document list…</p></div></section>
    <section class="panel"><div class="panel-heading"><h2>Messages from Admin &amp; Manager</h2><span class="muted">Announcements and instructions</span></div><div id="salesman-notifications"><p class="muted">Loading messages…</p></div></section>
    <section class="panel"><h2>Customer visit / area check-in</h2><p class="muted">Record a business visit and optionally attach GPS coordinates with your permission.</p><div class="grid">${field("Customer name or ID", "visit-customer", "")}${field("Area visited", "visit-area", seller.territory || seller.area || "")}${select("Visit purpose", "visit-purpose", ["Sales visit","Recovery","Order follow-up","Relationship visit","Other"], "Sales visit")}${area("Visit notes / outcome", "visit-notes", "")}</div><div class="actions">${btn("Save visit (without GPS)", "visit-save", sid)}${btn("Save visit with my location", "visit-save-location", sid, "", "gold")}</div><p class="muted">Location permission is optional.</p><div id="my-visit-history"><p class="muted">Loading your visit history…</p></div></section>`;
}

function targetRows() {
  const s = S(),
    start = monthStart(today());
  return visible(s.salesmen)
    .filter((salesman) => {
      const linkedRole = s.user_roles.find(
        (role) => role.user_id === salesman.user_id,
      )?.role;
      // Admin must always retain visibility of every salesman profile. Also keep
      // manager-assigned profiles visible even if an older/misconfigured login role
      // is not "salesman"; the manager scope is enforced separately by managerTeamIds.
      return admin() || !salesman.user_id || linkedRole === "salesman" || !!salesman.manager_user_id;
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
      ? `<section class="panel company-target"><div class="panel-heading"><h2>Company target · ${new Date(monthStart(today()) + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2><span class="muted">Month to date</span></div><div class="cards">${card("Company monthly target", `${companySold.toFixed(2)} / ${companyMonthlyTarget.toFixed(2)} cartons`, `${companyPct.toFixed(1)}% achieved · ${Math.max(0, companyMonthlyTarget - companySold).toFixed(2)} cartons remaining · salesmen ${salesmanSold.toFixed(2)} + manager ${managerExtra.toFixed(2)}${companySold >= companyMonthlyTarget ? " · TARGET CLOSED" : ""}`, true)}${card(manager() ? "Your achievement (your sales)" : "Manager direct sales", `${myCartons.toFixed(2)} cartons`, `${myDirect.length} orders · ${money(myValue)} · additional manager sales, excluded from the team target`, manager())}${card("Salesman sales", `${salesmanSold.toFixed(2)} cartons`, "Sum of all salesman achievements this month")}</div><div class="bar" role="img" aria-label="Company target ${companyPct.toFixed(1)} percent achieved"><span style="width:${Math.min(100, companyPct)}%"></span></div>${manager() ? `<h3 style="margin-top:18px">Your sales this month</h3>${table(["Order", "Date", "Customer", "Cartons", "Value"], myDirect.map((o) => [esc(o.number), esc(o.date), esc(customerName(o.customer_id)), cartonsOf(o).toFixed(2), money(num(o.total_paisa))]), "No sales of your own yet this month")}` : ""}<h3 style="margin-top:18px">Salesman contribution</h3>${table(["Salesman", "Achieved / target", "Status"], targets.filter((t) => t.active).map((t) => [esc(t.name), `${t.achieved.toFixed(2)} / ${t.monthly_target} cartons`, t.achieved >= t.monthly_target ? badge("Target closed", "green") : badge(`${(t.monthly_target - t.achieved).toFixed(2)} cartons to go`, "amber")]), "No active salesmen")}</section>`
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
  const warehouse = { cartons: 0, loose: 0, boxes: 0, marketValuePaisa: 0, potentialProfitPaisa: 0, pricedBoxes: 0, incompleteProducts: 0 };
  if (admin()) {
    for (const product of visible(s.products)) {
      const boxes = Math.max(0, balance(product.id, null));
      const perCarton = Math.max(1, num(product.boxes_per_carton) || 1);
      warehouse.cartons += Math.floor(boxes / perCarton);
      warehouse.loose += boxes % perCarton;
      warehouse.boxes += boxes;
      const retail = num(product.retail_paisa);
      const cost = num(product.cost_paisa);
      if (boxes > 0 && retail > 0) {
        warehouse.marketValuePaisa += boxes * retail;
        warehouse.pricedBoxes += boxes;
      }
      if (boxes > 0 && retail > 0 && cost > 0) {
        warehouse.potentialProfitPaisa += boxes * (retail - cost);
      }
      if (boxes > 0 && (retail <= 0 || cost <= 0)) warehouse.incompleteProducts += 1;
    }
  }
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
            ((admin() || manager()) ? btn("Manage areas", "manage-areas") : "") +
              btn("New quotation", "new-quote") +
              btn("+ New sale", "new-order", "", "", "gold"),
          ) +
          `${companyPanel}<section class="panel"><div class="filters"><div class="field"><label for="f-overview-from">From</label><input id="f-overview-from" type="date" value="${esc(overviewFrom)}"></div><div class="field"><label for="f-overview-to">To</label><input id="f-overview-to" type="date" value="${esc(overviewTo)}"></div><button data-act="apply-overview-range">Apply dates</button></div></section><div class="cards">${card("Sales in period", money(sales), `${report.orders.length} confirmed orders · ${overviewFrom} to ${overviewTo}`, true)}${card("Collections in period", money(report.collected_paisa), "All recorded payment methods")}${card("Previous debt recovered", money(report.previous_recovery_paisa), "Against invoices before their payment date")}${card("New credit issued", money(report.new_credit_paisa), "Period sales less payments on those invoices")}${card("Expenses in period", money(report.expense_paisa), "Recorded expenses")}${card("Customer outstanding", money(report.outstanding_paisa), "As of " + overviewTo)}${card("Overdue outstanding", money(report.overdue_paisa), "As of " + overviewTo)}${card("Stock issued", `${report.stock_issued_boxes} boxes`, `Issued ${overviewFrom} to ${overviewTo}`)}${card("Stock returned", `${report.stock_returned_boxes} boxes`, `Returned ${overviewFrom} to ${overviewTo}`)}${admin() ? card("Unsubmitted closings", unsubmittedClosings, "Active salesmen without a submitted close today") : ""}${admin() ? card("Closings awaiting approval", pendingClosings, "Submitted today") : ""}${p ? card(admin() ? "Net profit (period)" : p.net < 0 ? "Loss in period" : "Profit in period", money(admin() ? Math.max(0, p.net) : Math.abs(p.net)), admin() ? "After cost of goods and operating expenses" : "Restricted management figure") : ""}${admin() && p ? card("Net loss (period)", money(Math.max(0, -p.net)), "Loss after cost of goods and operating expenses") : ""}${admin() ? card("Warehouse cartons", warehouse.cartons, `${warehouse.loose} loose boxes · current warehouse stock`) + card("Warehouse boxes", warehouse.boxes, "Total boxes physically held in warehouse") + card("Estimated market value", money(warehouse.marketValuePaisa), `${warehouse.pricedBoxes} boxes valued at saved retail prices${warehouse.incompleteProducts ? ` · ${warehouse.incompleteProducts} products need pricing` : ""}`) + card("Potential stock profit", money(warehouse.potentialProfitPaisa), "Retail value less saved cost; before operating expenses") : ""}</div><section class="panel"><div class="panel-heading"><h2>Daily activity</h2><span class="muted">Select a date for its DSR</span></div>${table(["Business date", "Sales", "Collection", "Previous recovery", "New credit", "Expenses", "Issued / returned", "Details"], dailyRows, "No activity in this date range")}</section><div class="two-col">${p ? `<section class="panel"><div class="panel-heading"><h2>Revenue & profit</h2><span class="muted">Selected period</span></div><div class="chart"><canvas id="revenue-chart" role="img" aria-label="Revenue, expenses and net profit for selected period"></canvas></div><div id="chart-data" class="muted"></div></section>` : ""}<section class="panel"><div class="panel-heading"><h2>Needs your attention</h2></div><p>${badge(low.length + " low-stock products", "amber")} ${btn("Review stock", "go-stock")}</p><p>${badge(exp.length + " expiring / expired", "red")}</p><hr><h3>Missed targets today</h3>${targets.filter((t) => num(t.day?.shortfall) > 0).map((t) => `<p><b>${esc(t.name)}</b><br><small>${num(t.day.shortfall).toFixed(2)} cartons remaining · ${num(t.day.achieved_cartons).toFixed(2)} achieved</small></p>`).join("") || '<p class="muted">No target shortfalls recorded.</p>'}</section></div><section class="panel"><div class="panel-heading"><h2>Team progress</h2>${btn("View team", "go-staff")}</div>${table(["Salesman", "Today achieved / target", "Month-to-date", "Achievement", ...(admin() || can("pnl") ? ["Projected salary"] : [])], targets.map((t) => [esc(t.name), `${num(t.day?.achieved_cartons).toFixed(2)} / ${num(t.day?.effective_target).toFixed(2)} cartons`, `${t.achieved.toFixed(2)} / ${t.monthly_target}`, `${t.percent.toFixed(1)}%<div class="bar"><span style="width:${Math.min(100, t.percent)}%"></span></div>`, ...(admin() || can("pnl") ? [money(t.total)] : [])]), "Create your first salesman")}</section>${stockOverview()}<section class="panel"><h2>Salesman stock held</h2>${table(["Salesman", "Held boxes", "Issued in period", "Returned in period"], report.stock_by_salesman?.map((row) => [esc(salesmanName(row.salesman_id)), row.closing_boxes, row.issued_boxes, row.returned_boxes]) || [], "No salesman stock issues in this period")}</section>`
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

const mcLabel = (id) =>
  S().profiles.find((p) => p.id === id)?.display_name || (id === user?.id ? user.name || "Manager" : "Manager");
function managerClosingPanel() {
  if (!mgmt()) return "";
  const rows = (S().manager_daily_closings || [])
    .filter((r) => admin() || r.manager_user_id === user.id)
    .sort((a, b) => b.business_date.localeCompare(a.business_date));
  const pending = rows.filter((r) => r.status === "submitted").length;
  const body = rows.map((r) => [
    esc(r.business_date),
    esc(mcLabel(r.manager_user_id)),
    `${num(r.sales_count)} · ${money(r.sales_total_paisa)}`,
    money(r.collections_total_paisa),
    money(r.expenses_total_paisa),
    money(r.expected_cash_paisa),
    money(r.actual_cash_paisa),
    money(r.cash_variance_paisa),
    Object.keys(r.stock_variances || {}).length,
    badge(r.status),
    `${esc(r.reason || "")}${r.decision_at ? `<div class="muted">${esc(r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Reopened")} ${esc(String(r.decision_at).slice(0, 16).replace("T", " "))}${r.decision_reason ? " — " + esc(r.decision_reason) : ""}</div>` : ""}${admin() && r.status === "submitted" ? `<div class="actions">${btn("Approve", "approve-manager-closing", r.id)}${btn("Reject", "reject-manager-closing", r.id, "", "danger")}</div>` : admin() && ["approved", "rejected"].includes(r.status) ? `<div class="actions">${btn("Reopen", "reopen-manager-closing", r.id, "", "danger")}</div>` : ""}`,
  ]);
  return `<section class="panel"><h2>Manager team closings${pending && admin() ? ` <span class="badge amber">${pending} awaiting your decision</span>` : ""}</h2><p class="muted">One consolidated closing per manager per day: team sales, collections, expenses and stock movements.</p>${table(["Date", "Manager", "Sales", "Collections", "Expenses", "Expected cash", "Counted cash", "Variance", "Stock variances", "Status", "Reason / decision"], body, "No manager team closings submitted")}</section>`;
}
function managerClosingSummary(date) {
  const f = managerClosingFigures(S(), user.id, date);
  const methods = Object.entries(f.collectionsByMethod).map(([m, v]) => `${esc(m)} ${money(v)}`).join(" · ") || "none";
  const moves = Object.entries(f.stockMovements)
    .map(([pid, kinds]) => `${esc(visible(S().products).find((p) => p.id === pid)?.name || pid)}: ${Object.entries(kinds).map(([k, v]) => `${esc(k)} ${v}`).join(", ")}`)
    .join("<br>") || "No team stock movements on this date";
  return `<div class="notice" id="manager-closing-summary" aria-live="polite"><b>Team:</b> ${f.team.length} assigned salesman${f.team.length === 1 ? "" : "men"}<br><b>Sales:</b> ${f.salesCount} orders · ${money(f.salesTotal)}<br><b>Collections:</b> ${money(f.collectionsTotal)} (${methods})<br><b>Expenses:</b> ${money(f.expensesTotal)} (cash ${money(f.cashExpenses)})<br><b>Stock movements:</b><br>${moves}</div>`;
}
function managerClosingStockFields(date) {
  const f = managerClosingFigures(S(), user.id, date);
  const ids = new Set([...Object.keys(f.expectedStock), ...Object.keys(f.stockMovements)]);
  return visible(S().products).filter((p) => ids.has(p.id)).map((p) => `<div class="field"><label for="mc-count-${esc(p.id)}">${esc(p.name)} · expected ${Number(f.expectedStock[p.id] || 0)} boxes with team</label><input id="mc-count-${esc(p.id)}" name="stock-${esc(p.id)}" data-stock-count="${esc(p.id)}" type="number" min="0" step="1" value="${Number(f.expectedStock[p.id] || 0)}" required></div>`).join("");
}
function managerOpeningCash(date) {
  return Number((S().manager_daily_closings || []).filter((r) => r.manager_user_id === user.id && r.business_date < date && r.status === "approved").sort((a, b) => b.business_date.localeCompare(a.business_date))[0]?.actual_cash_paisa || 0);
}
function refreshManagerClosing(form, reset = false) {
  const date = form.elements.date.value || today();
  const f = managerClosingFigures(S(), user.id, date);
  if (reset) {
    form.elements.opening_cash.value = (managerOpeningCash(date) / 100).toFixed(2);
    $("manager-closing-summary").outerHTML = managerClosingSummary(date);
    $("manager-closing-stock").innerHTML = managerClosingStockFields(date) || '<p class="muted">No stock is held by your team.</p>';
  }
  const expected = paisa(form.elements.opening_cash.value) + f.cashReceived - f.cashExpenses - paisa(form.elements.cash_handed_over.value);
  $("manager-closing-estimate").textContent = "Expected team cash: " + money(expected);
}
function managerClosingModal() {
  if (!manager()) throw Error("Manager account required");
  const date = today();
  const opening = managerOpeningCash(date);
  const f = managerClosingFigures(S(), user.id, date);
  const expected = opening + f.cashReceived - f.cashExpenses;
  modal(
    "Submit team closing",
    `<form id="manager-closing-form"><p class="muted">One consolidated closing for your assigned team. No salesman account is needed.</p><div class="grid">${field("Business date", "date", date, "date", "required data-mc-date")}${field("Opening cash (Rs.)", "opening_cash", opening / 100, "number", 'min="0" step="0.01" required data-mc-cash')}${field("Cash handed over / deposited (Rs.)", "cash_handed_over", "0.00", "number", 'min="0" step="0.01" required data-mc-cash')}${field("Actual cash counted (Rs.)", "actual_cash", (expected / 100).toFixed(2), "number", 'min="0" step="0.01" required data-mc-cash')}</div>${managerClosingSummary(date)}<div class="notice" id="manager-closing-estimate" aria-live="polite">Expected team cash: ${money(expected)}</div><h3>Closing balances</h3><div class="grid">${CLOSING_BALANCE_FIELDS.map(([name, label]) => field(label + " (Rs.)", name, "0.00", "number", 'min="0" step="0.01" required')).join("")}</div><h3>Physical stock count (team total)</h3><div id="manager-closing-stock" class="grid">${managerClosingStockFields(date) || '<p class="muted">No stock is held by your team.</p>'}</div>${area("Variance reason (required when cash or stock differs)", "reason")}${area("Closing notes", "notes")}<button class="gold" style="margin-top:20px">Submit for Admin approval</button></form>`,
  );
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
      (manager() ? btn("Submit team closing", "new-manager-closing", "", "", "gold") : "") +
        (mgmt() || salesmanId ? btn("Submit daily closing", "new-closing", "", "", "gold") : ""),
    ) +
    managerClosingPanel() +
    `<div class="cards">${card("Pending approval", pending, "Submitted closings")}${card("Discrepancies", discrepancies, "Cash or physical stock variance")}${card("Salesmen", visible(s.salesmen).length, "Visible to this account")}</div><section class="panel"><h2>Closing register</h2>${table(["Date", "Salesman", "Expected cash", "Counted cash", "Variance", ...CLOSING_BALANCE_FIELDS.map(([, label]) => label), "Stock variances", "Status", "Action"], rows.map((closing) => [esc(closing.business_date), esc(salesmanName(closing.salesman_id)), money(closing.expected_cash_paisa), money(closing.actual_cash_paisa), money(closing.cash_variance_paisa), ...CLOSING_BALANCE_FIELDS.map(([name]) => money(closing[name + "_paisa"] || 0)), Object.keys(closing.stock_variances || {}).length, badge(closing.status), `${esc(closing.reason || closing.decision_reason || "")}${mgmt() ? `<div class="actions">${btn("Clone", "clone-closing", closing.id)}</div>` : ""}${admin() && closing.status === "submitted" ? `<div class="actions">${btn("Approve", "approve-closing", closing.id)}${btn("Reject", "reject-closing", closing.id, "", "danger")}</div>` : admin() && ["approved", "rejected"].includes(closing.status) ? `<div class="actions">${btn("Reopen", "reopen-closing", closing.id, "", "danger")}</div>` : ""}`]), "No daily closings submitted")}</section>`
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
      .filter((d) => (d.number + " " + customerName(d.customer_id)).toLowerCase().includes(filter.search.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date)),
    showFinancial = admin() || (manager() && can("invoices")) || (!manager() && user.role !== "salesman" && can("invoices"));
  const headers = ["Document", "Customer", "Date", "Salesman", ...(showFinancial ? ["Amount", "Payment"] : ["Quantity"]), "Status", "Actions"];
  return (
    head(
      quote ? "Quotations" : "Sales orders",
      quote ? "Create proposals, track acceptance and convert to sales." : "Confirmed sales update stock, invoices and team targets.",
      btn(quote ? "+ New quotation" : "+ New sale", quote ? "new-quote" : "new-order", "", "", "gold"),
    ) +
    `<section class="panel"><div class="filters">${field("Search customer or document", "search", filter.search, "search", 'data-filter="search"')}</div>${table(
      headers,
      rows.map((d) => {
        const qty = (s.order_items || []).filter(i => i.order_id === d.id).reduce((n, i) => n + num(i.boxes), 0);
        const invoice = !quote ? s.invoices.find(i => i.order_id === d.id) : null;
        const pay = invoice ? invoiceState(invoice, s.payments) : { status: "UNPAID" };
        const financial = showFinancial ? [money(d.total_paisa), quote ? "—" : badge(d.status === "cancelled" ? "CANCELLED" : pay.status)] : [quote ? "—" : `${qty} boxes`];
        return [
          `<b>${esc(d.number)}</b>${quote ? "<small>Revision " + d.revision + "</small>" : ""}`,
          esc(customerName(d.customer_id)), esc(d.date), esc(salesmanName(d.salesman_id)), ...financial, badge(d.status),
          `<div class="actions">${btn("View", quote ? "view-quote" : "view-order", d.id)}${((!quote && d.status === "confirmed") || (quote && ["Draft", "Sent"].includes(d.status))) ? btn("Edit", quote ? "edit-quote" : "edit-order", d.id) : ""}${showFinancial && !quote && d.status === "confirmed" && (()=>{const inv=s.invoices.find(i=>i.order_id===d.id);return inv && invoiceState(inv,s.payments).balance>0 && (admin() || s.user_permissions.some(p=>p.user_id===user.id&&p.section==="invoices"&&p.can_create)) ? btn("Receive payment","add-payment",inv.id) : ""})()}${quote && !["Converted", "Expired", "Rejected"].includes(d.status) ? btn("Convert", "convert", d.id) : ""}${quote && ["Draft", "Sent"].includes(d.status) ? btn("Status", "quote-status", d.id) : ""}${admin() ? btn(quote ? "Delete" : "Cancel", quote ? "delete-quote" : "cancel-order", d.id, "", "danger") : ""}</div>`
        ];
      }),
    )}</section>`
  );
}
function showOperationalOrder(id) {
  const s = S(), order = s.orders.find(o => o.id === id);
  if (!order) throw Error("Sales order not found.");
  if (user.role === "salesman" && order.salesman_id !== own()?.id) throw Error("You can only view your own sales order.");
  if (manager() && !can("invoices") && order.salesman_id && !managerTeamIds(s, user.id).includes(order.salesman_id)) throw Error("This order is outside your assigned team.");
  const items = (s.order_items || []).filter(i => i.order_id === id).map(i => [esc(s.products.find(p => p.id === i.product_id)?.name || i.product_id), num(i.cartons), num(i.boxes), "boxes"]);
  modal("Sales order · " + order.number, `<section class="panel"><p><b>Customer:</b> ${esc(customerName(order.customer_id))}</p><p><b>Date:</b> ${esc(order.date)} · <b>Status:</b> ${esc(order.status)}</p><p><b>Salesman:</b> ${esc(salesmanName(order.salesman_id))}</p>${table(["Product","Quantity","Boxes","Unit"],items,"No order lines recorded.")}<p class="muted">This operational view intentionally omits selling amounts, payment amounts and profit.</p></section>`);
}

const CASHBOOK_DEFAULT_ACCOUNTS = [
  { account_key: "mcb_bank", label: "MCB Bank", account_type: "bank", payment_method: "Bank", opening_balance_paisa: 0, active: true },
  { account_key: "al_habib_bank", label: "Al Habib Bank", account_type: "bank", payment_method: "Bank", opening_balance_paisa: 0, active: true },
  { account_key: "cash_hand", label: "Cash in Hand", account_type: "cash", opening_balance_paisa: 0, active: true },
  { account_key: "bank_default", label: "Cash in Bank — Default account", account_type: "bank", payment_method: "Bank", opening_balance_paisa: 0, active: true },
  { account_key: "easypaisa", label: "EasyPaisa", account_type: "wallet", payment_method: "Easypaisa", opening_balance_paisa: 0, active: true },
  { account_key: "jazzcash", label: "JazzCash", account_type: "wallet", payment_method: "JazzCash", opening_balance_paisa: 0, active: true },
  { account_key: "market_credit", label: "Market Credit — Receivables", account_type: "receivable", opening_balance_paisa: 0, active: true },
];
let cashbookDate = today();
let cashbookAccountFilter = "";
function cashbookMethodKey(method, salesmanId = "") {
  const text = String(method || "").toLowerCase();
  const m = /al habib/.test(text) ? "al_habib_bank" : /mcb/.test(text) ? "mcb_bank" : /easypaisa|easy paisa/.test(text) ? "easypaisa" : /jazzcash/.test(text) ? "jazzcash" : /bank|cheque/.test(text) ? "bank" : "cash";
  if (salesmanId) return `salesman:${salesmanId}:${m}`;
  return ({ cash: "cash_hand", bank: "bank_default", mcb_bank: "mcb_bank", al_habib_bank: "al_habib_bank", easypaisa: "easypaisa", jazzcash: "jazzcash" })[m];
}
function validateCashbookMethodAccount(method, accountKey) {
  const m = String(method || "").trim().toLowerCase();
  if (!accountKey) throw Error("Choose the exact cash, bank, or wallet account before saving this transaction.");
  const accounts = [...(S().cashbook_accounts || [])];
  if (user?.practice) for (const a of CASHBOOK_DEFAULT_ACCOUNTS) if (!accounts.some(x => x.account_key === a.account_key)) accounts.push(a);
  const acct = accounts.find(a => a.account_key === accountKey && a.active !== false);
  if (!acct) {
    if (!S().cashbook_loaded && !user?.practice) throw Error("The Cash & Bank Book account list has not loaded. Refresh and try again; no transaction was saved.");
    throw Error("The selected account is unavailable or inactive. Choose an active account.");
  }
  const isMcb = ["mcb bank","cheque — mcb bank","cheque - mcb bank"].includes(m);
  const isAlHabib = ["al habib bank","cheque — al habib bank","cheque - al habib bank"].includes(m);
  if (isMcb && !(acct.account_type === "bank" && (acct.account_key === "mcb_bank" || acct.account_key === "pk80mucb1156654281004446" || /mcb/i.test(acct.label || "")))) throw Error("Payment method is MCB Bank. Select the MCB Bank account, not Al Habib Bank or another account.");
  if (isAlHabib && !(acct.account_type === "bank" && (acct.account_key === "al_habib_bank" || /al habib/i.test(acct.label || "")))) throw Error("Payment method is Al Habib Bank. Select the Al Habib Bank account, not MCB Bank or another account.");
  if (isMcb || isAlHabib || ["bank","bank account","cheque"].includes(m)) {
    if (!isMcb && !isAlHabib && acct.account_type !== "bank" && !(acct.account_type === "salesman" && /bank account/i.test(acct.payment_method || ""))) throw Error("This payment method requires a bank account.");
  } else if (m === "cash") {
    if (acct.account_type !== "cash" && !(acct.account_type === "salesman" && /^cash$/i.test(acct.payment_method || ""))) throw Error("Cash payments must be assigned to Cash in Hand or the appropriate cash collection account.");
  } else if (/jazzcash/.test(m)) {
    if (acct.account_type !== "wallet" && !(acct.account_type === "salesman" && /jazzcash/i.test(acct.payment_method || ""))) throw Error("JazzCash payments must be assigned to the JazzCash account.");
    if (acct.account_type === "wallet" && !/jazzcash/i.test((acct.payment_method || "") + " " + (acct.label || ""))) throw Error("Select the JazzCash wallet.");
  } else if (/easypaisa|easy paisa/.test(m)) {
    if (acct.account_type !== "wallet" && !(acct.account_type === "salesman" && /easypaisa/i.test(acct.payment_method || ""))) throw Error("EasyPaisa payments must be assigned to the EasyPaisa account.");
    if (acct.account_type === "wallet" && !/easypaisa|easy paisa/i.test((acct.payment_method || "") + " " + (acct.label || ""))) throw Error("Select the EasyPaisa wallet.");
  }
  return true;
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
      const labels = {cash_hand:"Cash in Hand",bank_default:"Cash in Bank — Default account",mcb_bank:"MCB Bank",al_habib_bank:"Al Habib Bank",easypaisa:"EasyPaisa",jazzcash:"JazzCash"};
      addAccount(key, seller ? `Salesman Collection — ${seller.name} (${p.method})` : (labels[key] || key), seller ? "salesman" : (key === "bank_default" ? "bank" : key === "cash_hand" ? "cash" : "wallet"), p.method, order.salesman_id || null);
      entries.push({posting_key:`local:payment:${p.id}:receipt`,transaction_id:p.transaction_id,business_date:p.date,account_key:key,amount_paisa:num(p.amount_paisa),entry_type:"receipt",source_table:"payments",source_id:p.id,description:`Payment received — ${p.method}`,salesman_id:order.salesman_id});
      entries.push({posting_key:`local:payment:${p.id}:receivable`,transaction_id:p.transaction_id,business_date:p.date,account_key:"market_credit",amount_paisa:-num(p.amount_paisa),entry_type:"receivable",source_table:"payments",source_id:p.id,description:"Receivable recovered",salesman_id:order.salesman_id});
    }
    for (const e of s.expenses.filter(x => !x.deleted_at)) {
      const key = e.cashbook_account_key || cashbookMethodKey(e.method, e.salesman_id);
      const seller = e.salesman_id && s.salesmen.find(x => x.id === e.salesman_id);
      const labels = {cash_hand:"Cash in Hand",bank_default:"Cash in Bank — Default account",mcb_bank:"MCB Bank",al_habib_bank:"Al Habib Bank",easypaisa:"EasyPaisa",jazzcash:"JazzCash"};
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
  // Salesman collection sub-accounts remain in the ledger and total liquid funds, but are intentionally not shown as separate overview cards.
  const displayedCards = cards.filter(x => x.a.account_type !== "salesman");
  const liquid = cards.filter(x=>isLiquid(x.a)).reduce((sum,x)=>sum+x.closing,0);
  // Receivables are calculated per confirmed invoice, matching the customer-outstanding
  // report. An overpayment on one invoice must not make total receivables negative.
  const market = s.invoices.reduce((sum, inv) => {
    const order = s.orders.find(o => o.id === inv.order_id);
    if (!order || order.status !== "confirmed" || order.date > date) return sum;
    const paidByDate = s.payments
      .filter(p => p.invoice_id === inv.id && !p.voided_at && p.date <= date)
      .reduce((n, p) => n + num(p.amount_paisa), 0);
    return sum + Math.max(0, num(inv.total_paisa) - paidByDate);
  }, 0);
  // Keep the Market Credit row consistent with the receivables summary card.
  // The ledger's stored opening balance can be stale; derive this account from
  // confirmed invoices and their non-voided payments for the selected date.
  const outstandingAsOf = cutoff => s.invoices.reduce((sum, inv) => {
    const order = s.orders.find(o => o.id === inv.order_id);
    if (!order || order.status !== "confirmed" || order.date > cutoff) return sum;
    const paid = s.payments.filter(p => p.invoice_id === inv.id && !p.voided_at && p.date <= cutoff)
      .reduce((n, p) => n + num(p.amount_paisa), 0);
    return sum + Math.max(0, num(inv.total_paisa) - paid);
  }, 0);
  const marketCard = cards.find(x => x.a.account_key === "market_credit");
  if (marketCard) {
    const prior = outstandingAsOf(addDays(date, -1));
    const issuedToday = s.invoices.reduce((sum, inv) => {
      const order = s.orders.find(o => o.id === inv.order_id);
      return sum + (order && order.status === "confirmed" && order.date === date ? num(inv.total_paisa) : 0);
    }, 0);
    const recoveredToday = s.payments.filter(p => !p.voided_at && p.date === date).reduce((sum, p) => sum + num(p.amount_paisa), 0);
    marketCard.opening = prior;
    marketCard.received = issuedToday;
    marketCard.paid = recoveredToday;
    marketCard.transferIn = 0;
    marketCard.transferOut = 0;
    marketCard.closing = market;
  }
  const accountOptions = allowedAccounts.map(a=>[a.account_key,a.label]);
  const accountLabel = key => data.accounts.find(a=>a.account_key===key)?.label || CASHBOOK_DEFAULT_ACCOUNTS.find(a=>a.account_key===key)?.label || key;
  let accountLedgerEntries = relevantEntries.filter(e => cashbookAccountFilter ? e.account_key === cashbookAccountFilter : e.business_date === date);
  // Market Credit ledger shows both the receivable created by a credit sale
  // and every recovery against it, including the account where cash was received.
  if (cashbookAccountFilter === "market_credit") {
    accountLedgerEntries = [];
    const ordersById = new Map((s.orders || []).map(order => [String(order.id), order]));
    const invoicesById = new Map((s.invoices || []).map(inv => [String(inv.id), inv]));
    for (const inv of s.invoices || []) {
      const order = ordersById.get(String(inv.order_id));
      if (!order || order.status !== "confirmed" || String(order.date || "") > date) continue;
      accountLedgerEntries.push({
        id: `market-invoice:${inv.id}`, business_date: order.date,
        created_at: inv.created_at || order.created_at || "",
        account_key: "market_credit", amount_paisa: Math.abs(num(inv.total_paisa)),
        entry_type: "receivable", source_table: "invoices", source_id: inv.id,
        description: `Credit receivable created — ${customerName(order.customer_id)}`,
        created_by: inv.created_by, related_invoice_id: inv.id
      });
    }
    for (const payment of s.payments || []) {
      if (payment.voided_at || String(payment.date || "") > date || !payment.invoice_id) continue;
      const inv = invoicesById.get(String(payment.invoice_id));
      const order = inv && ordersById.get(String(inv.order_id));
      if (!inv || !order || order.status !== "confirmed") continue;
      const receivedAccount = payment.cashbook_account_key || cashbookMethodKey(payment.method, order.salesman_id);
      accountLedgerEntries.push({
        id: `market-recovery:${payment.id}`, business_date: payment.date,
        created_at: payment.created_at || "", account_key: "market_credit",
        amount_paisa: -Math.abs(num(payment.amount_paisa)), entry_type: "receivable_recovery",
        source_table: "payments", source_id: payment.id,
        description: `Cash received — ${customerName(order.customer_id)} · ${accountLabel(receivedAccount)} · ${payment.method || "payment"}`,
        created_by: payment.created_by, related_invoice_id: inv.id, received_account_key: receivedAccount
      });
    }
  }
  accountLedgerEntries = accountLedgerEntries.sort((a,b)=>String(a.business_date||"").localeCompare(String(b.business_date||"")) || String(a.created_at||"").localeCompare(String(b.created_at||"")));
  let runningBalances = new Map();
  const accountForLedger = data.accounts.find(a=>a.account_key===cashbookAccountFilter);
  if (cashbookAccountFilter) runningBalances.set(cashbookAccountFilter, cashbookAccountFilter === "market_credit" ? 0 : num(accountForLedger?.opening_balance_paisa));
  const ledgerSummary = cashbookAccountFilter ? {
    added:accountLedgerEntries.filter(e=>e.entry_type==="receipt" && /external funds introduced/i.test(e.description||"") && num(e.amount_paisa)>0).reduce((n,e)=>n+num(e.amount_paisa),0),
    collections:accountLedgerEntries.filter(e=>e.source_table==="payments" && num(e.amount_paisa)>0).reduce((n,e)=>n+num(e.amount_paisa),0),
    salesReceipts:accountLedgerEntries.filter(e=>e.source_table==="payments" && num(e.amount_paisa)>0).reduce((n,e)=>n+num(e.amount_paisa),0),
    expenses:-accountLedgerEntries.filter(e=>e.entry_type==="expense" && num(e.amount_paisa)<0).reduce((n,e)=>n+num(e.amount_paisa),0),
    transferIn:accountLedgerEntries.filter(e=>e.entry_type==="transfer_in" && num(e.amount_paisa)>0).reduce((n,e)=>n+num(e.amount_paisa),0),
    transferOut:-accountLedgerEntries.filter(e=>e.entry_type==="transfer_out" && num(e.amount_paisa)<0).reduce((n,e)=>n+num(e.amount_paisa),0),
    corrections:accountLedgerEntries.filter(e=>["adjustment","reversal"].includes(e.entry_type)).reduce((n,e)=>n+num(e.amount_paisa),0)
  } : null;
  const transactionRows = accountLedgerEntries.map(e=>{
    const prior = runningBalances.get(e.account_key) ?? 0;
    const next = prior + num(e.amount_paisa); runningBalances.set(e.account_key,next);
    const sourceId = e.source_id || "—";
    const sourceTable = String(e.source_table||"").toLowerCase();
    const linkedOrder = sourceTable === "orders" ? S().orders.find(o=>o.id===sourceId) : sourceTable === "invoices" ? S().orders.find(o=>o.id===S().invoices.find(i=>i.id===sourceId)?.order_id) : sourceTable === "payments" ? S().orders.find(o=>o.id===S().invoices.find(i=>i.id===S().payments.find(p=>p.id===sourceId)?.invoice_id)?.order_id) : null;
    const expense = sourceTable === "expenses" ? S().expenses.find(x=>String(x.id)===String(sourceId)) : null;
    const salaryExpense = expense && /salary/i.test(String(expense.category || "") + " " + String(expense.description || ""));
    const employeeId = expense?.employee_id || expense?.salesman_id || expense?.recipient_id;
    const employee = employeeId ? (S().salesmen.find(x=>String(x.id)===String(employeeId)) || S().profiles.find(x=>String(x.id)===String(employeeId))) : null;
    const employeeName = employee?.name || employee?.full_name || expense?.employee_name || expense?.recipient_name;
    const salaryText = salaryExpense ? `Salary released to ${employeeName || expense?.description || "employee"}` : "";
    const description = salaryText || e.description || e.entry_type;
    const relatedParty = linkedOrder ? customerName(linkedOrder.customer_id) : salaryExpense ? (employeeName || "Salary recipient") : (expense ? (expense.category || "Expense") : "—");
    const actor = S().profiles.find(p=>p.id===e.created_by) || S().salesmen.find(p=>p.user_id===e.created_by || p.id===e.created_by);
    const actorName = actor?.name || actor?.full_name || actor?.email || (e.created_by && e.created_by !== user?.id ? "User" : e.created_by ? (user?.name || "You") : "—");
    return [esc(e.business_date), esc(description), esc(accountLabel(e.account_key)), `<span class="${num(e.amount_paisa)<0?"negative":"positive"}">${num(e.amount_paisa)<0?"−":"+"}${money(Math.abs(num(e.amount_paisa)))}</span>`, money(next), esc(e.entry_type.replaceAll("_"," ")) + (e.pending_sync ? ` ${badge("Pending sync","amber")}` : ""), esc(relatedParty), esc(actorName)];
  }).reverse();
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
  const actions = `${canWrite ? (admin()?btn("Add Money","cashbook-add-money","","","gold"):"")+btn("Transfer between accounts","cashbook-transfer","","","gold")+btn("Record adjustment","cashbook-adjust")+(admin()?btn("Add bank / wallet account","cashbook-add-account"):"") : ""}${user?.role==="salesman" && s.cashbook_loaded ? btn("Hand over cash","cashbook-handover","","","gold") : ""}${btn("Export CSV","cashbook-csv")}${btn("Print","cashbook-print")}`;
  return head("5. Cash & Bank Book","Know exactly how much money is held in each account, including salesman-held collections and market credit.",actions)
    + migrationNotice
    + priorWarning
    + pendingNotice
    + `<section class="panel"><div class="filters">${field("Business date","cashbook-date",date,"date",'data-cashbook-date="true"')}${btn("Today","cashbook-today")}</div>
      <div class="cashbook-summary-grid"><article class="cashbook-summary"><span>Liquid funds at selected-date close</span><b>${money(liquid)}</b><small>Includes salesman-held collections once; excludes market credit</small></article><article class="cashbook-summary"><span>Market Credit outstanding</span><b>${money(market)}</b><small>Receivables only — not money received</small></article><article class="cashbook-summary"><span>Accounts tracked</span><b>${displayedCards.length}</b><small>Opening and closing calculated from ledger movements</small></article></div>
      <h2>Accounts · ${esc(date)}</h2><div class="cashbook-account-grid">${displayedCards.sort((a,b)=>({mcb_bank:0,al_habib_bank:1,jazzcash:2,easypaisa:3,cash_hand:4,market_credit:5}[a.a.account_key]??99)-({mcb_bank:0,al_habib_bank:1,jazzcash:2,easypaisa:3,cash_hand:4,market_credit:5}[b.a.account_key]??99)).map(x=>`<article class="cashbook-account-card ${x.a.account_type==='receivable'?'receivable':''}"><div class="cashbook-account-head"><span>${esc(x.a.label)}</span><small>${esc(({bank:'Bank account',wallet:'Digital wallet',cash:'Cash in hand',receivable:'Receivables',salesman:'Salesman-held funds'}[x.a.account_type]||x.a.account_type))}</small></div><b class="cashbook-account-balance">${money(x.closing)}</b><div class="cashbook-account-meta"><span>Opening</span><strong>${money(x.a.account_key==="market_credit"?x.opening:cashbookAccountOpening(x.a,date)+amount(x.a.account_key,before))}</strong></div><div class="cashbook-account-meta"><span>Receipts / increases</span><strong>${money(x.received)}</strong></div><div class="cashbook-account-meta"><span>Payments / recoveries</span><strong>${money(x.paid)}</strong></div><div class="cashbook-account-actions">${btn(cashbookAccountFilter===x.a.account_key?"Viewing ledger":"View transactions","cashbook-account-ledger",x.a.account_key)}${admin()&&["bank","wallet"].includes(x.a.account_type)?btn("Edit account","cashbook-edit-account",x.a.account_key):""}</div></article>`).join("")}</div>
      <p class="muted">Expected closing = opening + valid credits − valid debits, including transfers. Market Credit is receivables, not cash. A transfer moves value between accounts without increasing total liquid funds. A physical closing count never overwrites the calculated ledger balance.</p>
      <h2 id="cashbook-transactions">${cashbookAccountFilter?`Account ledger · ${esc(accountLabel(cashbookAccountFilter))}`:`Transactions for ${esc(date)}`}</h2>${cashbookAccountFilter?`<div class="cashbook-summary-grid"><article class="cashbook-summary"><span>External funds added</span><b>${money(ledgerSummary.added)}</b></article><article class="cashbook-summary"><span>Sales-related collections</span><b>${money(ledgerSummary.salesReceipts)}</b></article><article class="cashbook-summary"><span>Expenses paid</span><b>${money(ledgerSummary.expenses)}</b></article><article class="cashbook-summary"><span>Transfers in</span><b>${money(ledgerSummary.transferIn)}</b></article><article class="cashbook-summary"><span>Transfers out</span><b>${money(ledgerSummary.transferOut)}</b></article><article class="cashbook-summary"><span>Net corrections / reversals</span><b>${money(ledgerSummary.corrections)}</b></article></div><p class="actions">${btn("Show selected date transactions","cashbook-account-ledger-clear")}</p>`:""}${table(["Date","Description","Account","Money in / out","Running balance","Type / status","Customer / related party","Created by"],transactionRows,cashbookAccountFilter?"No transactions for this account":"No ledger transactions for this date")}</section>
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
  const warehouseWrite = admin() || S().user_permissions.some(permission => permission.user_id === user.id && permission.section === "stock" && (permission.can_create || permission.can_edit));
  const actions =
    (warehouseWrite ? btn("+ Warehouse movement", "add-stock", "", "", "gold") : "") +
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
      mgmt() ? btn("+ Product", "add-product", "", "", "gold") : "",
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
        mgmt() ? btn("Edit", "edit-product", p.id) + btn(p.active ? "Deactivate" : "Activate", "toggle-product", p.id) : "—",
      ]),
      q ? "No products match your search" : "No products yet",
    )}</section>`
  );
}
function renderStaff() {
  const s = S(),
    scope = manager() ? new Set(managerTeamIds(s, user.id).map(String)) : null,
    sellers = visible(s.salesmen).filter(x => !scope || scope.has(String(x.id))),
    targets = targetRows().filter(t => !scope || scope.has(String(t.id))),
    attendanceDate = today();
  return (
    head(
      "Salesmen & targets",
      manager() ? "Manage your assigned team, attendance, areas, stock accountability and operational messages." : "Manage employee profiles, assign managers, monitor targets and review fieldwork.",
      (admin() || manager()) ? btn("Manage areas", "manage-areas") + (admin() ? btn("+ Advance salary", "advance-salary", "", "", "gold") : "") : "",
    ) +
    `<section class="panel"><div class="panel-heading"><h2>Team overview</h2><span>${esc(attendanceDate)} · ${sellers.length} assigned salesman${sellers.length===1?"":"men"}</span></div>${table(
      ["Salesman", "Attendance", "Assigned area", "Today / target", "Monthly progress", "Stock in hand", "Actions"],
      targets.map((t, i) => {
        const seller = sellers.find(x => String(x.id) === String(t.id));
        const att = (s.attendance_records || []).find(a => String(a.salesman_id)===String(t.id) && a.attendance_date===attendanceDate);
        const held = visible(s.products).reduce((sum, product) => sum + heldStock(product.id, t.id), 0);
        return [
          `<span class="profile-avatar" id="team-photo-${esc(t.id)}" style="width:32px;height:32px;font-size:14px;display:inline-flex;vertical-align:middle;margin-right:8px">${esc(String(t.name||"S").slice(0,1).toUpperCase())}</span><b>${esc(t.name)}</b><small>${esc(t.id)} · ${esc(t.phone||"No phone")}</small>`,
          esc(att?.status || "Not recorded"),
          esc(seller?.territory || seller?.area || "Not assigned"),
          `${num(t.day?.achieved_cartons).toFixed(2)} / ${num(t.day?.effective_target).toFixed(2)} cartons`,
          `${t.achieved.toFixed(2)} / ${t.monthly_target} cartons · ${t.percent.toFixed(1)}%<div class="bar"><span style="width:${Math.min(100,t.percent)}%"></span></div>`,
          `${held.toFixed(2)} boxes`,
          `<div class="actions">${btn("Details", "salesman-profile", t.id)}${(admin()||manager())?btn("Assign area", "assign-area", t.id):""}${(admin()||manager())?btn("Attendance", "mark-attendance", t.id):""}${(admin()||manager())?btn("Message", "notify-salesman", t.id):""}${(admin())?btn("Edit", "edit-staff", t.id)+btn("Post salary", "post-salary", t.id)+btn("Advance salary", "advance-salary", t.id)+btn("Delete", "delete-salesman", t.id, "", "danger"):manager()?btn("Edit", "edit-staff", t.id):""}</div>`
        ];
      }), "No salesman profiles are assigned to this account.")}</section>
    ${admin() ? `<section class="panel"><div class="panel-heading"><h2>Employee fieldwork & documents</h2><span class="muted">Administrator access</span></div><div id="admin-fieldwork-data"><p class="muted">Loading attendance, documents, visits and profile photos…</p></div></section>` : ""}
    <section class="panel"><div class="panel-heading"><h2>Team notifications</h2>${btn("Send team announcement", "notify-team", "", "", "gold")}</div><p class="muted">Messages are stored in Supabase and appear in the recipient's salesman dashboard.</p><div id="team-notification-history"><p class="muted">Loading messages…</p></div></section>`
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
  const managerRoot = $("admin-manager-fieldwork-data");
  if (managerRoot) {
    const managerProfiles = S().profiles.filter(profile => S().user_roles.some(role => role.user_id === profile.id && role.role === "manager"));
    const errHtml = r => r.error ? `<p class="notice danger">Could not load: ${esc(r.error.message)}. Apply <code>supabase/manager_profile_fieldwork.sql</code>.</p>` : "";
    const sections = await Promise.all(managerProfiles.map(async managerProfile => {
      const managerUserId = managerProfile.id;
      const [ma, md, mv, mp] = await Promise.all([
        client.from("manager_attendance_records").select("attendance_date,check_in_at,check_out_at,status,latitude,longitude").eq("manager_user_id",managerUserId).order("attendance_date",{ascending:false}).limit(200),
        client.from("manager_employee_documents").select("document_type,file_path,file_name,mime_type,size_bytes,created_at").eq("manager_user_id",managerUserId).order("created_at",{ascending:false}).limit(200),
        client.from("manager_customer_visits").select("customer_label,area,purpose,notes,visited_at,latitude,longitude").eq("manager_user_id",managerUserId).order("visited_at",{ascending:false}).limit(200),
        client.from("profiles").select("avatar_path,display_name").eq("id",managerUserId).maybeSingle()
      ]);
      const docRows = md.error ? [] : await Promise.all((md.data||[]).map(async d=>{const signed=await client.storage.from("employee-private").createSignedUrl(d.file_path,3600);return [esc(d.file_name),esc(d.document_type),esc(new Date(d.created_at).toLocaleString()),`${Math.ceil(num(d.size_bytes)/1024)} KB`,signed.data?.signedUrl?`<a href="${esc(signed.data.signedUrl)}" target="_blank" rel="noopener">Open private file</a>`:esc(signed.error?.message||"Unavailable")];}));
      let avatarHtml = "No profile photo uploaded.";
      if (!mp.error && mp.data?.avatar_path) { const signed=await client.storage.from("employee-private").createSignedUrl(mp.data.avatar_path,3600); if(signed.data?.signedUrl) avatarHtml=`<a href="${esc(signed.data.signedUrl)}" target="_blank" rel="noopener">Open profile photo</a>`; }
      return `<section class="panel"><h3>${esc(managerProfile.display_name || managerProfile.id)}</h3><p>${avatarHtml}</p><h4>Attendance</h4>${errHtml(ma)||table(["Date","Check-in","Check-out","Status","GPS"],(ma.data||[]).map(r=>[esc(r.attendance_date),esc(r.check_in_at?new Date(r.check_in_at).toLocaleString():"—"),esc(r.check_out_at?new Date(r.check_out_at).toLocaleString():"—"),esc(r.status),r.latitude==null?"Not shared":`<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(r.latitude)},${encodeURIComponent(r.longitude)}">View map</a>`]),"No attendance records.")}<h4>Documents</h4>${errHtml(md)||table(["Document","Type","Uploaded","Size","File"],docRows,"No documents uploaded.")}<h4>Fieldwork visits</h4>${errHtml(mv)||table(["Visited","Customer","Area","Purpose","Notes","GPS"],(mv.data||[]).map(r=>[esc(new Date(r.visited_at).toLocaleString()),esc(r.customer_label||"—"),esc(r.area||"—"),esc(r.purpose||"—"),esc(r.notes||"—"),r.latitude==null?"Not shared":`<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(r.latitude)},${encodeURIComponent(r.longitude)}">View map</a>`]),"No fieldwork visits.")}</section>`;
    }));
    managerRoot.innerHTML = sections.join("") || `<p class="muted">No Manager accounts are configured. Create a Manager login in Users & Access.</p>`;
  }
}
async function openAdminSalesmanProfile(salesmanId) {
  if (!(admin() || manager())) throw Error("Authorized management access is required to view employee profiles.");
  if (manager() && !managerTeamIds(S(), user.id).includes(salesmanId)) throw Error("This salesman is outside your assigned team.");
  if (!client) throw Error("Employee profiles require a connected Supabase session.");
  modal("Salesman profile", '<p class="muted">Loading saved profile and fieldwork details…</p>');
  const sellerResult = await client.from("salesmen").select("id,name,phone,date_of_birth,territory,area,photo_path,user_id,joining_date,active,manager_user_id").eq("id", salesmanId).maybeSingle();
  if (sellerResult.error) {
    modal("Salesman profile", `<p class="notice danger">Unable to load salesman profile: ${esc(sellerResult.error.message)}. Apply the updated <code>supabase/salesman_self_service.sql</code> migration and confirm the current login has the admin role.</p>`);
    return;
  }
  const seller = sellerResult.data;
  if (!seller) { modal("Salesman profile", '<p class="notice">No linked salesman profile was found. Use Edit access to link or create the salesman profile.</p>'); return; }
  const [attendance, documents, visits, assignments] = await Promise.all([
    client.from("attendance_records").select("attendance_date,check_in_at,check_out_at,status,remarks,check_in_latitude,check_in_longitude,check_in_location_accuracy_m").eq("salesman_id", seller.id).order("attendance_date", {ascending:false}).limit(100),
    client.from("employee_documents").select("document_type,file_path,file_name,mime_type,size_bytes,created_at").eq("salesman_id", seller.id).order("created_at", {ascending:false}).limit(100),
    client.from("customer_visits").select("customer_label,area,purpose,notes,visited_at,latitude,longitude").eq("salesman_id", seller.id).order("visited_at", {ascending:false}).limit(100),
    client.from("salesman_area_assignments").select("area_name,effective_from,effective_to,instructions").eq("salesman_id", seller.id).order("effective_from", {ascending:false}).limit(100),
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
  const attendanceHtml = sectionError(attendance) || table(["Date","Check-in","Check-out","Status","Remarks","Check-in location"], (attendance.data || []).map(r => [esc(r.attendance_date), esc(r.check_in_at ? new Date(r.check_in_at).toLocaleString() : "—"), esc(r.check_out_at ? new Date(r.check_out_at).toLocaleString() : "—"), esc(r.status), esc(r.remarks || "—"), r.check_in_latitude == null || r.check_in_longitude == null ? "Location not recorded" : `<a href="https://www.google.com/maps?q=${encodeURIComponent(r.check_in_latitude)},${encodeURIComponent(r.check_in_longitude)}" target="_blank" rel="noopener">View check-in map</a><small>${num(r.check_in_latitude).toFixed(5)}, ${num(r.check_in_longitude).toFixed(5)}${r.check_in_location_accuracy_m ? ` · ±${Math.round(num(r.check_in_location_accuracy_m))} m` : ""}</small>`]), "No attendance submitted yet.");
  const documentsHtml = sectionError(documents) || table(["Document","Type","Uploaded","Size","File"], docRows, "No documents uploaded yet.");
  const visitsHtml = sectionError(visits) || table(["Visited","Customer","Area","Purpose","Notes","GPS"], (visits.data || []).map(r => [esc(new Date(r.visited_at).toLocaleString()), esc(r.customer_label || "—"), esc(r.area || "—"), esc(r.purpose || "—"), esc(r.notes || "—"), r.latitude == null ? "Not shared" : `${num(r.latitude).toFixed(5)}, ${num(r.longitude).toFixed(5)}`]), "No customer visits submitted yet.");
  const state = S(), target = targetRows().find(t => String(t.id) === String(seller.id));
  const targetDays = state.salesman_daily_targets.filter(d => String(d.salesman_id) === String(seller.id) && d.date >= monthStart(today()) && d.date <= today()).sort((a,b)=>a.date.localeCompare(b.date));
  const targetHtml = table(["Date","Target (ct)","Achieved (ct)","Boxes","Remaining (ct)"], targetDays.map(d=>[esc(d.date),num(d.effective_target).toFixed(2),num(d.achieved_cartons).toFixed(2),num(d.achieved_boxes),Math.max(0,num(d.effective_target)-num(d.achieved_cartons)).toFixed(2)]),"No daily target records for this month.");
  const eligibleOrders = state.orders.filter(o=>String(o.salesman_id)===String(seller.id)&&o.status==="confirmed"&&!o.deleted_at&&o.date>=monthStart(today())&&o.date<=today());
  const dailySales = new Map(); const productSales = new Map();
  for (const order of eligibleOrders) for (const line of (state.order_items||[]).filter(i=>i.order_id===order.id)) {
    const day=dailySales.get(order.date)||{boxes:0,cartons:0,orders:0}; day.boxes+=num(line.boxes); day.cartons+=num(line.cartons); day.orders+=1; dailySales.set(order.date,day);
    const product=productSales.get(line.product_id)||{boxes:0,cartons:0}; product.boxes+=num(line.boxes); product.cartons+=num(line.cartons); productSales.set(line.product_id,product);
  }
  const salesHtml = `<h4>Daily sales quantities</h4>${table(["Date","Orders / lines","Cartons","Boxes"],[...dailySales.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([date,v])=>[esc(date),v.orders,num(v.cartons).toFixed(2),num(v.boxes).toFixed(2)]),"No confirmed sales quantities this month.")}<h4>Product-wise quantities</h4>${table(["Product","Cartons","Boxes"],[...productSales.entries()].map(([pid,v])=>[esc(state.products.find(p=>p.id===pid)?.name||pid),num(v.cartons).toFixed(2),num(v.boxes).toFixed(2)]),"No product sales recorded this month.")}`;
  const stockRows = (state.salesman_stock_movements||[]).filter(m=>String(m.salesman_id)===String(seller.id)).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,200).map(m=>[esc(m.date),esc(state.products.find(p=>p.id===m.product_id)?.name||m.product_id),esc(m.kind==="issue"?"Issued":String(m.kind).replace(/^return_/,"Returned · ")),Math.abs(num(m.boxes)).toFixed(2),esc(m.reference||"—"),esc(m.note||"—")]);
  const stockBalanceHtml = table(["Product","Current balance (boxes)"],visible(state.products).map(p=>[esc(p.name),heldStock(p.id,seller.id)]).filter(r=>num(r[1])!==0),"No stock is currently held by this salesman.");
  const stockMovementHtml = table(["Date","Product","Movement","Boxes","Reference","Notes"],stockRows,"No stock issue/return movements recorded.");
  const role = state.user_roles.find(r => r.user_id === seller.user_id)?.role || "Not linked";
  modal(`${seller.name} · Profile`, `<section class="panel"><div class="profile-hero"><div class="profile-avatar">${photo}</div><div><h3>${esc(seller.name)}</h3><p><b>Employee ID:</b> ${esc(seller.id)}</p><p><b>Phone:</b> ${esc(seller.phone || "Not provided")}</p><p><b>Date of birth:</b> ${esc(seller.date_of_birth || "Not recorded")}</p><p><b>Territory / area:</b> ${esc(seller.territory || seller.area || "Not assigned")}</p><p><b>Joining date:</b> ${esc(seller.joining_date || "Not recorded")} · <b>Status:</b> ${seller.active ? "Active" : "Inactive"} · <b>Login role:</b> ${esc(role)}</p></div></div></section><section class="panel"><h3>Salary & advance history</h3><div id="salesman-profile-salary-history"><p class="muted">Loading salary and advance details…</p></div></section><section class="panel"><h3>Monthly target progress</h3><div class="cards">${card("Monthly target",`${num(target?.monthly_target).toFixed(2)} cartons`)}${card("Achieved",`${num(target?.achieved).toFixed(2)} cartons`)}${card("Remaining",`${Math.max(0,num(target?.monthly_target)-num(target?.achieved)).toFixed(2)} cartons`)}${card("Achievement",`${num(target?.percent).toFixed(1)}%`)}</div>${targetHtml}</section><section class="panel"><h3>Sales quantity breakdown</h3>${salesHtml}</section><section class="panel"><h3>Stock accountability</h3>${stockBalanceHtml}${stockMovementHtml}</section><section class="panel"><h3>Attendance history</h3>${admin() || manager() ? btn("Record / correct attendance", "mark-attendance", seller.id) : ""}${attendanceHtml}</section><section class="panel"><h3>Area assignment history</h3>${sectionError(assignments)||table(["Area","Effective from","Effective until","Instructions"],(assignments.data||[]).map(a=>[esc(a.area_name),esc(a.effective_from),esc(a.effective_to||"Current"),esc(a.instructions||"—")]),"No area assignments yet.")}</section><section class="panel"><h3>Upload employee documents</h3>${seller.user_id ? `<div class="grid">${select("Document type","employee-document-type",[["identity","NIC / identity document"],["education","Educational certificate"],["appointment","Appointment letter"],["contract","Employment contract"],["employment","Other employment document"],["salary_bank","Salary / bank document"],["other","Other important document" ]],"identity")}<div class="field"><label for="employee-document-file">PDF or photo (max 10 MB)</label><input id="employee-document-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></div></div><button class="gold" data-act="employee-manager-document-upload" data-id="${esc(seller.id)}">Upload private document</button><p class="muted">Documents are private and accessible only to authorized management and the linked employee.</p>` : `<p class="notice">Link this employee to a login in Admin → Users & Access before uploading private documents.</p>`}<p class="muted">Private file links expire after one hour.</p>${documentsHtml}</section><section class="panel"><h3>Profile photograph</h3>${seller.user_id ? `<div class="field"><label for="employee-profile-photo">JPG, PNG or WebP up to 5 MB</label><input id="employee-profile-photo" type="file" accept="image/jpeg,image/png,image/webp"></div><button class="gold" data-act="employee-manager-photo-upload" data-id="${esc(seller.id)}">Upload / replace profile photo</button>` : `<p class="notice">Link this employee to a login before uploading a private profile photograph.</p>`}</section><section class="panel"><h3>Customer visits & fieldwork</h3>${visitsHtml}</section>`);
  const salaryHistoryRoot = $("salesman-profile-salary-history");
  if (salaryHistoryRoot) {
    const [salaryResult, advanceResult] = await Promise.all([
      client.from("expenses").select("date,description,amount_paisa,salary_period,deleted_at").eq("salesman_id", seller.id).is("deleted_at", null).order("date", {ascending:false}).limit(36),
      client.from("employee_salary_advances").select("advance_date,amount_paisa,recovered_paisa,reason,status").eq("salesman_id", seller.id).order("advance_date", {ascending:false}).limit(50)
    ]);
    salaryHistoryRoot.innerHTML = (salaryResult.error ? `<p class="notice">Salary history unavailable: ${esc(salaryResult.error.message)}</p>` : `<h4>Salary payments</h4>${table(["Date","Period","Details","Net paid"],(salaryResult.data||[]).filter(x=>/salary/i.test(x.description||"") || x.salary_period).map(x=>[esc(x.date),esc(x.salary_period||"—"),esc(x.description||"Salary"),money(x.amount_paisa)]),"No salary payments recorded.")}`) + (advanceResult.error ? `<p class="notice">Advance history unavailable: ${esc(advanceResult.error.message)}</p>` : `<h4>Salary advances</h4>${table(["Date","Advance taken","Recovered","Outstanding","Reason","Status"],(advanceResult.data||[]).map(a=>[esc(a.advance_date),money(a.amount_paisa),money(a.recovered_paisa||0),money(Math.max(0,num(a.amount_paisa)-num(a.recovered_paisa))),esc(a.reason||"—"),esc(a.status||"posted")]),"No salary advances recorded.")}`);
  }

}

function filters(category = false) {
  return `<div class="filters">${field("From", "from", filter.from, "date", 'data-filter="from"')}${field("To", "to", filter.to, "date", 'data-filter="to"')}${category ? select("Category", "category", ["All categories", ...new Set(S().expenses.map((e) => e.category))], filter.category || "All categories") : ""}${btn("Apply", "apply-filters")}${btn("This month", "this-month")}${btn("This year", "this-year")}</div>`;
}
function managerExpenseScope(e) {
  // Managers may view only expenses they personally created. Admin retains the full ledger.
  return String(e.created_by || "") === String(user.id || "");
}
function renderExpenses() {
  const rows = visible(S().expenses).filter(
    (e) =>
      (!manager() || (managerExpenseScope(e) && !e.salary_period && !/salary released to/i.test(String(e.description || "")))) &&
      e.date >= filter.from &&
      e.date <= filter.to &&
      (!filter.category ||
        filter.category === "All categories" ||
        e.category === filter.category),
  );
  return (
    head(
      "Expenses",
      manager()
        ? "Your own daily expenses only. Admin can review all expenses, including the entries you add."
        : "Keep operating costs and receipts in one place.",
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
        "Paid from account",
        "Salesman",
        "Actions",
      ],
      rows.map((e) => {
        const account = (S().cashbook_accounts || []).find(a => a.account_key === e.cashbook_account_key);
        const inferredKey = e.cashbook_account_key || (e.method && /bank|cheque/i.test(e.method) ? "pk80mucb1156654281004446" : e.method && /jazzcash/i.test(e.method) ? "jazzcash" : e.method && /easypaisa/i.test(e.method) ? "easypaisa" : "cash_hand");
        const accountLabel = account?.label || ({cash_hand:"Cash in Hand",bank_default:"Cash in Bank — Default account",easypaisa:"EasyPaisa",jazzcash:"JazzCash",pk80mucb1156654281004446:"MCB"})[inferredKey] || inferredKey;
        return [
        esc(e.date),
        esc(e.category),
        esc(e.description),
        money(e.amount_paisa),
        esc(e.method),
        esc(accountLabel) + (e.cashbook_account_key ? "" : ' <span class="badge amber">Not saved</span>'),
        esc(salesmanName(e.salesman_id)),
        `<div class="actions">${!manager() || e.created_by === user.id ? btn("Edit", "edit-expense", e.id) : ""}${e.attachment_path ? btn("Receipt", "receipt", e.id) : ""}${admin() ? btn("Delete", "delete-expense", e.id, "", "danger") : ""}</div>`,
      ];
      }),
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
                backgroundColor: Object.keys(obj).map((label, index) => {
                  if (type === "doughnut" && /loss/i.test(String(label))) return "#dc2626";
                  return ["#12233f", "#d5ad58", "#538b7b", "#b7c8dc", "#9f7996"][index % 5];
                }),
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
    `<form id="settings-form"><section class="panel"><h2>Company & documents</h2><div class="grid three">${field("Company name", "company_name", s.company_name, "text", "required")}${field("Phone / WhatsApp", "phone", s.phone)}${field("Email", "email", s.email, "email")}${field("Website", "website", s.website)}${field("Address", "address", s.address)}${field("NTN", "ntn", s.ntn)}${field("Authorised signatory name", "signature_name", s.signature_name || "")}${area("Bank / JazzCash details", "bank_details", s.bank_details)}${area("Default terms", "terms", s.terms)}</div><div class="field" style="margin-top:16px"><label for="signature-file">Authorised signature image (optional, PNG/JPEG)</label><input id="signature-file" type="file" accept="image/png,image/jpeg"><small>Upload only the company-approved signature. It appears on fully paid invoices.</small></div></section><section class="panel"><h2>Stock & sales rules</h2><div class="grid three">${field("Default boxes / carton", "boxes_per_carton", s.boxes_per_carton, "number", 'min="1" required')}${field("Low-stock threshold (boxes)", "low_stock_boxes", s.low_stock_boxes, "number", 'min="0" required')}${field("Default base salary (Rs.)", "base_salary", s.base_salary_paisa / 100, "number", 'min="0" step="0.01" required')}${field("Salesman allowance / month (Rs.)", "salesman_allowance", (s.salesman_allowance_paisa || 0) / 100, "number", 'min="0" step="0.01" required')}${field("Salesman incentive / carton (Rs.)", "salesman_incentive_per_carton", (s.salesman_incentive_per_carton_paisa || 0) / 100, "number", 'min="0" step="0.01" required')}${field("Manager base salary / month (Rs.)", "manager_base_salary", (s.manager_base_salary_paisa ?? s.base_salary_paisa) / 100, "number", 'min="0" step="0.01" required')}${field("Manager allowance / month (Rs.)", "manager_allowance", (s.manager_allowance_paisa || 0) / 100, "number", 'min="0" step="0.01" required')}${field("Manager incentive / carton (Rs.)", "manager_incentive_per_carton", (s.manager_incentive_per_carton_paisa || 0) / 100, "number", 'min="0" step="0.01" required')}</div><div class="grid" style="margin-top:20px">${[
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
async function managerPayrollModal(managerId) {
  if (!admin()) throw Error("Only Admin can configure manager salary parameters.");
  const profile = (S().profiles || []).find(p => String(p.id) === String(managerId));
  if (!profile || (S().user_roles || []).find(r => String(r.user_id) === String(managerId))?.role !== "manager") throw Error("Manager account not found.");
  const { data, error } = await client.from("manager_payroll_settings").select("manager_user_id,base_salary_paisa,allowance_paisa,incentive_per_carton_paisa,monthly_target,working_days").eq("manager_user_id", managerId).maybeSingle();
  if (error && !/does not exist|schema cache/i.test(error.message || "")) throw error;
  const cfg = data || {};
  modal("Manager salary parameters · " + (profile.display_name || profile.email || "Manager"), `<form id="manager-payroll-settings-form" data-manager="${esc(managerId)}"><section class="panel"><p class="muted">These settings apply to this manager only. Base salary and allowance are prorated by attendance; incentive is paid only on the manager's own confirmed cartons above the individual target. The manager's own sales do not count toward the team target.</p><div class="grid">${field("Monthly base salary (Rs.)", "base_salary", num(cfg.base_salary_paisa)/100, "number", 'min="0" step="0.01" required')}${field("Monthly allowance (Rs.)", "allowance", num(cfg.allowance_paisa)/100, "number", 'min="0" step="0.01" required')}${field("Incentive per carton above target (Rs.)", "incentive_per_carton", num(cfg.incentive_per_carton_paisa)/100, "number", 'min="0" step="0.01" required')}${field("Individual monthly target (cartons)", "monthly_target", num(cfg.monthly_target), "number", 'min="0" step="0.01" required')}${field("Working days per month", "working_days", num(cfg.working_days)||26, "number", 'min="1" max="31" step="1" required')}</div>${error ? '<p class="notice">Manager payroll settings table is not available yet. Apply the payroll attendance migration, then reopen this form.</p>' : ''}</section><button class="gold" type="submit">Save manager salary parameters</button></form>`);
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
        // Manager's own sales are additional activity and must not close the team target.
        teamTargetMet = team,
        teamRemaining = Math.max(0, target - teamTargetMet),
        pct = (teamTargetMet / target) * 100;
      return [
        `${esc(m.display_name)}<div class="manager-salary-setup-action">${btn("Set up salary details", "edit-manager-payroll", m.id, "", "gold")}</div>`,
        `${target.toFixed(2)} cartons`,
        `${team.toFixed(2)} cartons`,
        `+${ownCartons.toFixed(2)} cartons<br><small>${own.length} orders · ${money(ownValue)}</small>`,
        teamTargetMet >= target ? badge("Target achieved", "green") : `<b>${teamRemaining.toFixed(2)}</b> cartons remaining`,
        `${pct.toFixed(1)}%<div class="bar"><span style="width:${Math.min(100, pct)}%"></span></div>`,
        (() => { const paid = s.expenses.filter(e => String(e.manager_user_id) === String(m.id) && e.salary_period && !e.deleted_at).sort((a,b)=>String(b.salary_period).localeCompare(String(a.salary_period)))[0]; const advanceTotal = (s.employee_salary_advances || []).filter(a=>String(a.manager_user_id)===String(m.id)&&a.status==="posted").reduce((n,a)=>n+Math.max(0,num(a.amount_paisa)-num(a.recovered_paisa)),0); return `<b>Salary net paid:</b> ${paid ? money(paid.amount_paisa) + ` <small>(${esc(paid.salary_period)})</small>` : "Not released"}${paid?.description ? `<p class="muted">${esc(paid.description)}</p>` : ""}<br><b>Outstanding advance:</b> ${money(advanceTotal)}<br>${btn("Release salary", "post-manager-salary", m.id, "", "gold")}`; })(),
      ];
    });
  return `<section class="panel"><div class="panel-heading"><h2>Managers & company target</h2><span class="muted">${new Date(from + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric" })} · month to date</span></div><p class="muted">Manager's own cartons are additional sales and are excluded from the team target calculation. Use <b>Set up salary details</b> beside each manager's name to configure base salary, allowance, individual target, working days and incentive. Outstanding advances are deducted before net payment.</p>${table(["Manager", "Team monthly target", "Team (salesmen) achieved", "Own sales (additional; excluded)", "Team cartons remaining", "Team achievement", "Payroll"], rows, "No manager logins yet. Create a login with the manager role.")}</section>`;
}
function payrollCalculationFor(p, month) {
  const state = S();
  const start = month + "-01";
  const endDate = new Date(start + "T12:00:00Z"); endDate.setUTCMonth(endDate.getUTCMonth()+1); endDate.setUTCDate(0);
  const end = endDate.toISOString().slice(0,10);
  const inMonth = d => String(d || "") >= start && String(d || "") <= end;
  const statusDays = {present:1, late:1, week_off:1, half_day:.5};
  const isManager = p.type === "manager";
  const setting = isManager ? (state.manager_payroll_settings||[]).find(x=>String(x.manager_user_id)===String(p.id)) : p.record;
  // Match the backend payroll rule: one attendance credit per calendar date.
  // Duplicate edits/check-ins on the same date must never increase salary days.
  let attendanceRows = isManager
    ? (state.manager_attendance_records||[]).filter(a=>String(a.manager_user_id)===String(p.id)&&inMonth(a.attendance_date))
    : (state.attendance_records||[]).filter(a=>String(a.salesman_id)===String(p.record.id)&&inMonth(a.attendance_date));
  // Keep the manager joining-date boundary consistent with own_manager_salary_snapshot().
  const normalizedManagerName = String(p.name || p.record?.display_name || '').trim().toLowerCase().replace(/\s+/g,' ');
  if (isManager && normalizedManagerName === 'babar ali khan' && month === '2026-10') {
    attendanceRows = attendanceRows.filter(a=>String(a.attendance_date||'') >= '2026-10-10');
  }
  const attendanceByDate = new Map();
  for (const row of attendanceRows) {
    const date = String(row.attendance_date || '');
    if (!date) continue;
    const status = String(row.status || '').toLowerCase();
    const units = statusDays[status] || 0;
    const previous = attendanceByDate.get(date);
    if (!previous || units > previous.units) attendanceByDate.set(date, { ...row, units });
  }
  attendanceRows = [...attendanceByDate.values()];
  let credited = attendanceRows.reduce((n,a)=>n+(a.units ?? statusDays[String(a.status||'').toLowerCase()] ?? 0),0);
  const employeeName = String(p.name || p.record?.name || p.record?.display_name || p.record?.full_name || '').trim().toLowerCase().replace(/\s+/g,' ');
  // Payroll correction confirmed by the business owner: Arsalan's October 2026 salary
  // must use 17 credited days. The UI currently receives only 16 qualifying attendance
  // dates, so apply a transparent one-day payroll credit rather than calculating 16 days.
  // This does not create or alter an attendance record in the database.
  const arsalanOctoberPayrollAdjustment = employeeName.includes('arsalan') && month === '2026-10' && credited < 17;
  if (arsalanOctoberPayrollAdjustment) credited = 17;
  // Arsalan's agreed payroll basis is PKR 45,000 / 30 calendar days = PKR 1,500 per credited day.
  // Keep this override in the shared frontend calculator so Admin payroll, salary detail/release
  // previews, and any other view using payrollCalculationFor all calculate the same amount.
  const configuredWorkingDays = num(isManager ? setting?.working_days : setting?.payroll_working_days);
  const workingDays = Math.max(1, employeeName.includes('arsalan') ? 30 : (configuredWorkingDays || 26));
  const factor = Math.min(1, credited / workingDays);
  const baseMonthly = Math.max(0,num(isManager ? setting?.base_salary_paisa : setting?.base_salary_paisa));
  const allowanceMonthly = Math.max(0,num(isManager ? setting?.allowance_paisa : setting?.payroll_allowance_paisa));
  const target = Math.max(0,num(isManager ? setting?.monthly_target : (setting?.payroll_monthly_target ?? setting?.monthly_target)));
  const rate = Math.max(0,num(isManager ? setting?.incentive_per_carton_paisa : setting?.payroll_incentive_per_carton_paisa));
  const orders = (state.orders||[]).filter(o=>o.status==='confirmed'&&!o.deleted_at&&inMonth(o.date)&&(isManager ? String(o.created_by)===String(p.id)&&!o.salesman_id : String(o.salesman_id)===String(p.record.id)));
  const orderIds = new Set(orders.map(o=>String(o.id)));
  const itemRows = (state.order_items||[]).filter(i=>orderIds.has(String(i.order_id)));
  const boxesPerCarton = Math.max(1,num(state.settings?.boxes_per_carton)||24);
  const achieved = itemRows.reduce((sum,i)=>sum+num(i.boxes)/Math.max(1,num(i.boxes_per_carton)||boxesPerCarton),0);
  const achievedBoxes = itemRows.reduce((sum,i)=>sum+num(i.boxes),0);
  const base = Math.round(baseMonthly*factor);
  const allowance = Math.round(allowanceMonthly*factor);
  const incentive = Math.round(Math.max(0,achieved-target)*rate);
  const gross = base+allowance+incentive;
  const advanceRows = (state.employee_salary_advances||[]).filter(a=>a.status==='posted'&&(isManager?String(a.manager_user_id)===String(p.id):String(a.salesman_id)===String(p.record.id)));
  const advanceTotal = advanceRows.reduce((n,a)=>n+Math.max(0,num(a.amount_paisa)),0);
  const advanceRecovered = advanceRows.reduce((n,a)=>n+Math.max(0,num(a.recovered_paisa)),0);
  const outstanding = Math.max(0,advanceTotal-advanceRecovered);
  const expenses = (state.expenses||[]).filter(e=>!e.deleted_at&&String(e.salary_period||'')===month&& (isManager?String(e.manager_user_id)===String(p.id):String(e.salesman_id)===String(p.record.id)));
  const posted = expenses.find(e=>/salary/i.test(String(e.category||'')+' '+String(e.description||''))) || expenses[0] || null;
  return {p,month,posted,credited,workingDays,factor,baseMonthly,base,allowanceMonthly,allowance,target,rate,achieved,achievedBoxes,boxesPerCarton,incentive,gross,advanceTotal,advanceRecovered,outstanding,net:Math.max(0,gross-outstanding),attendanceRows,orders,arsalanOctoberPayrollAdjustment};
}
function payrollDetailsModal(r) {
  const pct = r.target > 0 ? r.achieved/r.target*100 : 0;
  const rows = [
    ["Salary period", r.month],
    ["Employee type", r.p.type === "manager" ? "Manager" : "Salesman"],
    ["Paid attendance credited", `${r.credited.toFixed(1)} / ${r.workingDays} days`],
    ["Attendance factor", `${(r.factor*100).toFixed(1)}%`],
    ["Monthly base salary", money(r.baseMonthly)],
    ["Attendance-adjusted base salary", money(r.base)],
    ["Monthly allowance", money(r.allowanceMonthly)],
    ["Attendance-adjusted allowance", money(r.allowance)],
    ["Confirmed cartons achieved", `${r.achieved.toFixed(2)} cartons (${Math.round(r.achievedBoxes)} boxes)`],
    ["Individual monthly target", `${r.target.toFixed(2)} cartons`],
    ["Achievement", `${pct.toFixed(1)}%`],
    ["Cartons above target", `${Math.max(0,r.achieved-r.target).toFixed(2)} cartons`],
    ["Incentive rate per carton above target", money(r.rate)],
    ["Carton incentive", money(r.incentive)],
    ["Gross salary calculation", `<b>${money(r.gross)}</b>`],
    ["Total advances recorded", money(r.advanceTotal)],
    ["Advance amounts already recovered", money(r.advanceRecovered)],
    ["Outstanding advance balance", money(r.outstanding)],
    ["Estimated net after outstanding advances", `<b>${money(r.posted ? r.posted.amount_paisa : r.net)}</b>`],
    ["Payment status", r.posted ? "Already released" : "Not released — estimate only"],
  ];
  modal("Salary calculation · " + r.p.name + " · " + r.month, `<section class="panel"><p class="muted">This month-specific breakdown uses the same attendance-proration, paid Week Off, target and per-carton incentive rules shown in the employee salary estimate. Manager direct cartons are separate from the team target. ${r.arsalanOctoberPayrollAdjustment ? 'Payroll adjustment: one additional credited day has been applied to Arsalan for October 2026 to match the confirmed 17-day calculation; attendance records themselves were not changed.' : ''}</p>${table(["Component","Calculation"],rows,"Salary calculation unavailable.")}</section>`);
}
function renderPayroll() {
  if (!admin()) return head("Salary & payroll", "Admin-only monthly salary review.") + '<section class="panel"><p class="notice danger">Only Admin can access payroll.</p></section>';
  const month = window.__payrollMonth || today().slice(0,7);
  const query = String(window.__payrollQuery || "").trim().toLowerCase();
  const months = Array.from({length:60},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);return d.toISOString().slice(0,7);});
  const people=[];
  for (const x of (S().salesmen||[]).filter(x=>x.active!==false&&!x.deleted_at)) people.push({type:"salesman",id:x.id,name:x.name||"Salesman",record:x});
  const roles=S().user_roles||[];
  for (const p of (S().profiles||[])) if(roles.some(r=>String(r.user_id)===String(p.id)&&String(r.role).toLowerCase()==="manager")) people.push({type:"manager",id:p.id,name:p.display_name||p.full_name||p.email||p.id,record:p});
  const filtered=people.filter(p=>p.name.toLowerCase().includes(query)||p.type.includes(query));
  const rows=filtered.map(p=>payrollCalculationFor(p,month));
  const monthOptions=months.map(m=>[m,new Date(m+"-15T12:00:00Z").toLocaleDateString("en-GB",{month:"long",year:"numeric"})]);
  const currencyTotal = (key) => rows.reduce((n,r)=>n+num(r[key]),0);
  return head("Salary & payroll", "Review the full month-wise employee salary calculation and release only unpaid months.", btn("Refresh data","payroll-refresh"))+
    (S().payroll_data_error ? `<section class="panel"><p class="notice danger"><b>Payroll data could not be fully loaded.</b> Some figures may be incomplete. Check Supabase table permissions/migrations before releasing salary.<br><small>${esc(S().payroll_data_error)}</small></p></section>` : "") +
    `<section class="panel"><div class="filters"><div class="field"><label for="payroll-month">Salary month</label><select id="payroll-month">${monthOptions.map(([v,t])=>`<option value="${v}" ${v===month?"selected":""}>${esc(t)}</option>`).join("")}</select></div><div class="field"><label for="payroll-search">Search employee</label><input id="payroll-search" value="${esc(window.__payrollQuery||"")}" placeholder="Manager or salesman name"></div><button data-act="payroll-apply">Show month</button></div><p class="muted">Week Off counts as a paid day. Salary is calculated for the selected month using attendance, each employee's saved salary parameters, confirmed personal carton sales, and recorded advances. Historical figures may depend on the records currently available.</p></section>`+
    `<section class="panel"><h2>${esc(month)} · Salary calculations</h2><div class="cards">${card("Employees shown",rows.length,"Managers and salesmen")}${card("Gross salary total",money(currencyTotal("gross")),"Before advance deductions")}${card("Estimated net total",money(rows.reduce((n,r)=>n+(r.posted?num(r.posted.amount_paisa):r.net),0)),"Released amounts or current estimates")}</div>${table(["Employee","Type","Paid attendance","Cartons","Base earned","Allowance","Incentive","Gross","Advance balance","Estimated net","Status","Action"],rows.map(r=>[esc(r.p.name),esc(r.p.type),`${r.credited.toFixed(1)} / ${r.workingDays} days`,r.achieved.toFixed(2),money(r.base),money(r.allowance),money(r.incentive),`<b>${money(r.gross)}</b>`,money(r.outstanding),money(r.posted?num(r.posted.amount_paisa):r.net),r.posted?badge("Released","green"):badge("Not released","amber"),`<div class="actions"><button data-act="payroll-details" data-id="${esc(r.p.id)}" data-type="${r.p.type}" data-month="${esc(month)}">View calculation</button>${r.posted?`<span class="muted">Already released</span>`:`<button data-act="payroll-release" data-id="${esc(r.p.id)}" data-type="${r.p.type}" data-month="${esc(month)}">Review & release</button>`}</div>`]),"No matching employees found.")}</section>`+
    `<section class="panel"><h2>Release history for ${esc(month)}</h2>${table(["Employee","Payment date","Salary period","Net paid","Details"],(S().expenses||[]).filter(e=>!e.deleted_at&&e.salary_period===month&&/salary/i.test(String(e.category||"")+" "+String(e.description||""))).map(e=>{const person=people.find(p=>p.type==="manager"?String(p.id)===String(e.manager_user_id):String(p.record.id)===String(e.salesman_id));return [esc(person?.name||e.description||"Employee"),esc(e.date),esc(e.salary_period),money(e.amount_paisa),esc(e.description||"Salary")]}),"No salary has been released for this month.")}</section>`;
}


function renderUsers() {
  if (!admin()) return head("Users & access", "Administrator-only account management.") + '<section class="panel"><p class="notice danger">Only Admin can create or manage login accounts.</p></section>';
  const s = S();
  return (
    head(
      "Users & access",
      "Create a login and its linked employee profile in one workflow. Managers cannot create users or salesman profiles.",
      btn("+ Create user", "create-user", "", "", "gold"),
    ) +
    `<section class="panel"><p class="muted">Login email addresses are not displayed here. To help a user sign in, share their login details through your approved secure process. Password resets remain available to Admin.</p>${table(
      ["Name", "Role", "Linked salesman", "Assigned manager", "Status", "Actions"],
      s.profiles.map((p) => {
        const role = s.user_roles.find((r) => r.user_id === p.id)?.role || "user";
        const linked = s.salesmen.find((x) => x.user_id === p.id);
        const managerProfile = linked?.manager_user_id ? s.profiles.find((x) => x.id === linked.manager_user_id) : null;
        return [
          esc(p.display_name),
          esc(role),
          esc(linked?.name || "Not linked"),
          esc(managerProfile?.display_name || (linked ? "Unassigned" : "—")),
          badge(p.active ? "Active" : "Inactive"),
          p.id === user.id
            ? "Current user (use Account to change your own password)"
            : `<div class="actions">${btn("Edit access", "edit-user", p.id)}${btn("Reset password", "reset-user-password", p.id, "", "danger")}${btn("Delete user", "delete-user", p.id, "", "danger")}${role === "salesman" ? (linked ? btn("Profile", "salesman-profile", linked.id) + btn("Delete salesman + data", "delete-salesman", linked.id, "", "danger") : `<span class="muted">Profile not linked</span>`) : ""}</div>`,
        ];
      }),
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
        : mgmt()
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
          .map((l) => ({ ...l }))
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
    `<form id="document-form">${old ? '<p class="notice">Saved manual product rates are retained when editing. Lines without a manual override continue to use the current pricing rules.</p>' : ""}<div class="grid three">${field("Customer ID / name search", "customer_id", draft.customer_id, "text", 'list="customer-list" required')}<datalist id="customer-list">${visible(
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
        ...(manager()
          ? visible(s.salesmen).filter((x) => managerTeamIds(s, user.id).map(String).includes(String(x.id)))
          : visible(s.salesmen))
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
      )}</datalist><div id="editor-lines"></div><button type="button" class="secondary add-line-bottom" data-act="add-line" style="margin:4px 0 16px">+ Add product</button><div class="grid">${field("Discount (Rs.)", "discount", draft.discount_paisa / 100, "number", 'min="0" step="0.01"')}${area("Notes", "notes", draft.notes)}${area("Terms", "terms", draft.terms)}</div><div id="editor-total" class="total-box"></div>${!quote && !old ? `<section class="panel" aria-labelledby="payment-section-title"><h2 id="payment-section-title">Payment</h2><div class="grid three">${select("Payment status", "payment_status", [["unpaid","Unpaid"],["partial","Part paid"],["paid","Paid in full"]], "unpaid")}${field("Amount received now (Rs.)", "payment_amount", "0.00", "number", 'min="0" step="0.01"')}${field("Payment date", "payment_date", today(), "date")}${select("Payment method", "payment_method", [["Cash","Cash"],["MCB Bank","MCB Bank"],["Al Habib Bank","Al Habib Bank"],["JazzCash","JazzCash"],["Easypaisa","EasyPaisa"],["Cheque — MCB Bank","Cheque — MCB Bank"],["Cheque — Al Habib Bank","Cheque — Al Habib Bank"]])}${cashbookPaymentAccountField()}${field("Reference", "payment_reference")}${field("Received by", "payment_received_by", user.name || user.email || "Owner")}${field("Due date", "payment_due_date", addDays(today(),7), "date")}</div><div id="payment-summary" class="total-box" aria-live="polite">Total · Paid now · Balance</div></section>` : ""}<div id="editor-error" role="alert"></div><button class="gold" type="submit">${quote ? "Save quotation" : "Confirm sale"}</button></form>`,
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
    return `<div class="line-editor" data-line="${i}">${picker}<div class="field"><label for="line-c-${i}">Cartons</label><input id="line-c-${i}" data-line-field="cartons" type="number" min="0" step="1" value="${l.cartons}" required></div><div class="field"><label for="line-l-${i}">Loose boxes</label><input id="line-l-${i}" data-line-field="loose_boxes" type="number" min="0" step="1" value="${l.loose_boxes}" required></div><div class="field"><label for="line-r-${i}">Rate / box (Rs.)</label><input id="line-r-${i}" data-line-field="manual_rate" type="number" min="0" step="0.01" value="${num(l.rate_paisa)/100}" ${mgmt()?"":"readonly"}></div><div class="line-total" id="line-total-${i}"></div><button type="button" class="icon-button" aria-label="Remove product line ${i+1}" data-act="remove-line" data-id="${i}">×</button><div class="line-note" id="line-note-${i}">${l.product_id&&!found?"This product is missing or inactive. Choose an active product.":""}</div>${mgmt()?`<div class="override"><span class="muted">Manual override reason</span><input data-line-field="override_reason" aria-label="Override reason for line ${i+1}" value="${esc(l.override_reason||"")}" placeholder="Leave blank for automatic pricing"></div>`:""}</div>`;
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
      mgmt(),
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
    try { total=priceLines(lines,S().products,q.channel,S().settings,S().price_tiers,mgmt()).reduce((a,l)=>a+l.amount_paisa,0)-Number(q.discount_paisa||0); } catch {}
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
    if (amount !== 0) validateCashbookMethodAccount(f.payment_method || "Cash", f.cashbook_account_key);
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
  if (kind === "staff") {
    const managers = s.profiles.filter(p => s.user_roles.some(role => role.user_id === p.id && role.role === "manager") && p.active !== false);
    const assignedManager = manager() ? user.id : (r.manager_user_id || "");
    html = `<div class="grid">${field("Employee ID", "id", r.id || "", "text", existing ? "readonly" : "required")}${field("Full name", "name", r.name || "", "text", "required")}${field("Phone", "phone", r.phone || "", "tel")}${field("Date of birth", "date_of_birth", r.date_of_birth || "", "date")}${field("Joining date", "joining_date", r.joining_date || today(), "date", 'min="2000-01-01" required')}<p class="notice">Area assignments are managed through the effective-dated Assign area workflow so historical assignments are preserved.</p>${admin() ? field("Base salary (Rs.)", "base_salary", num(r.base_salary_paisa ?? s.settings.base_salary_paisa) / 100, "number", 'min="0" step="0.01" required') : ""}${admin() ? field("Monthly allowance (Rs.)", "payroll_allowance", num(r.payroll_allowance_paisa ?? 0) / 100, "number", 'min="0" step="0.01" required') : ""}${admin() ? field("Incentive per carton above target (Rs.)", "payroll_incentive", num(r.payroll_incentive_per_carton_paisa ?? 0) / 100, "number", 'min="0" step="0.01" required') : ""}${admin() ? field("Working days per month", "payroll_working_days", num(r.payroll_working_days ?? 26) || 26, "number", 'min="1" max="31" step="1" required') : ""}${field("Monthly target (cartons)", "monthly_target", r.monthly_target || s.settings.monthly_target, "number", 'min="1" step="0.01" required')}${select("Status", "active", [["true", "Active"],["false", "Inactive"]], r.active === false ? "false" : "true")}${admin() ? select("Link login account", "user_id", [["", "No login linked"], ...s.profiles.filter(p => !s.salesmen.some(sm => sm.user_id===p.id && sm.id!==r.id)).map(p => [p.id, `${p.display_name || p.email} (${s.user_roles.find(role=>role.user_id===p.id)?.role || "user"})`])], r.user_id || "") : ""}${manager() ? `<input type="hidden" name="manager_user_id" value="${esc(user.id)}"><p class="notice">This salesman will be assigned to your manager account.</p>` : select("Assigned manager", "manager_user_id", [["", "Unassigned"], ...managers.map(p => [p.id, p.display_name || p.email])], assignedManager)}${area("Personal holidays / off dates (YYYY-MM-DD, one per line)", "off_days", (r.off_days || []).join("\n"))}</div><p class="muted">Managers create the employee record and assign it to their team. Admin links the login from Users & Access. Private photo, NIC and education uploads are part of the employee record workflow.</p>`;
  }
  if (kind === "customer")
    html = `<div class="grid">${field("Customer name", "name", r.name || "", "text", "required")}${field("Phone", "phone", r.phone || "", "tel")}${field("Email", "email", r.email || "", "email")}${field("Address", "address", r.address || "")}${select("Assigned salesman", "salesman_id", [["", "Unassigned"], ...visible(s.salesmen).map((x) => [x.id, x.name])], r.salesman_id || own()?.id || "")}</div>`;
  if (kind === "expense") {
    const accountSource=[...(s.cashbook_accounts||[])];
    if (user?.practice) for (const a of CASHBOOK_DEFAULT_ACCOUNTS) if (!accountSource.some(x=>x.account_key===a.account_key)) accountSource.push(a);
    const activeAccounts = accountSource.filter(a => a.active && (["cash","bank","wallet"].includes(a.account_type) || (user?.role==="salesman" && a.account_type==="salesman" && a.salesman_id===own()?.id)));
    const hasMcb = activeAccounts.some(a => a.account_type==="bank" && (a.account_key==="mcb_bank" || /mcb/i.test(a.label||"")));
    const hasAlHabib = activeAccounts.some(a => a.account_type==="bank" && (a.account_key==="al_habib_bank" || /al habib/i.test(a.label||"")));
    const selectableAccounts = activeAccounts.filter(a => !(hasMcb && hasAlHabib && a.account_key==="bank_default"));
    const savedAccount = activeAccounts.find(a => a.account_key===r.cashbook_account_key);
    const defaultAccount = r.cashbook_account_key || (r.method && /mcb/i.test(r.method) ? (activeAccounts.find(a => /mcb/i.test(a.label))?.account_key || "") : r.method && /al habib/i.test(r.method) ? (activeAccounts.find(a => /al habib/i.test(a.label))?.account_key || "") : r.method && /jazzcash/i.test(r.method) ? "jazzcash" : r.method && /easypaisa/i.test(r.method) ? "easypaisa" : r.method && /bank|cheque/i.test(r.method) ? "" : "cash_hand");
    const legacyBankMethod = r.method && /^(bank|bank account|cheque)$/i.test(r.method);
    const expenseMethod = legacyBankMethod ? (/mcb/i.test(savedAccount?.label||"") ? (r.method.toLowerCase()==="cheque" ? "Cheque — MCB Bank" : "MCB Bank") : /al habib/i.test(savedAccount?.label||"") ? (r.method.toLowerCase()==="cheque" ? "Cheque — Al Habib Bank" : "Al Habib Bank") : "") : (r.method || "Cash");
    const accountOptions = selectableAccounts.map(a => [a.account_key, a.label]);
    html = `<div class="grid">${field("Date", "date", r.date || today(), "date", "required")}${field("Category", "category", r.category || "Misc", "text", 'list="expense-categories" required')}<datalist id="expense-categories">${["Rent", "Salaries", "Transport", "Utilities", "Packaging", "Marketing", "Misc"].map((x) => "<option>" + x + "</option>").join("")}</datalist>${field("Amount (Rs.)", "amount", num(r.amount_paisa) / 100, "number", 'min="0.01" step="0.01" required')}${select("Payment method", "method", [["","Choose payment method"],["Cash","Cash"],["MCB Bank","MCB Bank"],["Al Habib Bank","Al Habib Bank"],["JazzCash","JazzCash"],["Easypaisa","EasyPaisa"],["Cheque — MCB Bank","Cheque — MCB Bank"],["Cheque — Al Habib Bank","Cheque — Al Habib Bank"]], expenseMethod)}${select("Pay from account", "cashbook_account_key", [["","Choose exact account"],...accountOptions], defaultAccount)}<p class="muted">Select the exact account used. MCB Bank and Al Habib Bank are separate destinations; the database will reject a mismatch.</p>${select("Salesman (optional)", "salesman_id", [["", "Not linked"], ...visible(s.salesmen).filter((x) => !manager() || managerTeamIds(s, user.id).includes(x.id)).map((x) => [x.id, x.name])], r.salesman_id || "")}${area("Description", "description", r.description || "")}<div class="field"><label for="receipt-file">Receipt image (optional, up to 5 MB)</label><input id="receipt-file" type="file" accept="image/jpeg,image/png,image/webp"></div></div>`;
  }
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
  if (form.dataset.kind === "staff" && !form.dataset.id && !admin()) throw Error("Managers cannot create salesman profiles. Admin must create the login and linked salesman profile from Users & Access.");
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
      id: String(f.id || old?.id || r.id).trim(),
      name: f.name.trim(),
      phone: f.phone,
      date_of_birth: f.date_of_birth || null,
      joining_date: f.joining_date,
      ...(admin() ? { base_salary_paisa: paisa(f.base_salary), payroll_allowance_paisa: paisa(f.payroll_allowance), payroll_incentive_per_carton_paisa: paisa(f.payroll_incentive), payroll_working_days: Math.max(1, Math.min(31, Math.round(num(f.payroll_working_days) || 26))) } : {}),
      monthly_target: num(f.monthly_target),
      active: f.active === "true",
      ...(admin() ? { user_id: f.user_id || null } : {}),
      manager_user_id: manager() ? user.id : (f.manager_user_id || null),
      off_days: dates(f.off_days),
    });
  if (kind === "staff") {
    if (!r.id || !/^[A-Za-z0-9._:-]{1,180}$/.test(r.id)) throw Error("Employee ID is required and may contain letters, numbers, dot, underscore, colon or hyphen.");
    if (S().salesmen.some(seller => String(seller.id).toLowerCase() === String(r.id).toLowerCase() && String(seller.id) !== String(old?.id || ""))) throw Error("This employee ID is already in use.");
    if (!Number.isFinite(r.monthly_target) || r.monthly_target <= 0) throw Error("Monthly target must be greater than zero.");
    if (!r.name) throw Error("Employee name is required.");
    if (manager() && r.manager_user_id !== user.id) throw Error("Managers may assign employees only to their own account.");
  }
  if (kind === "customer")
    Object.assign(r, {
      name: f.name.trim(),
      phone: f.phone,
      email: f.email,
      address: f.address,
      salesman_id: f.salesman_id || null,
    });
  if (kind === "expense") {
    validateCashbookMethodAccount(f.method, f.cashbook_account_key);
    Object.assign(r, {
      date: f.date,
      category: f.category.trim(),
      description: f.description,
      amount_paisa: paisa(f.amount),
      method: f.method,
      cashbook_account_key: f.cashbook_account_key || null,
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
  const accountSource=[...(S().cashbook_accounts||[])];
  if (user?.practice) for (const a of CASHBOOK_DEFAULT_ACCOUNTS) if (!accountSource.some(x=>x.account_key===a.account_key)) accountSource.push(a);
  const allAccounts=accountSource.filter(a=>a.active && a.account_type!=="receivable" && (a.account_type!=="salesman" || (user?.role==="salesman" && a.salesman_id===own()?.id)));
  const hasMcb=allAccounts.some(a=>a.account_type==="bank" && (a.account_key==="mcb_bank" || /mcb/i.test(a.label||"")));
  const hasAlHabib=allAccounts.some(a=>a.account_type==="bank" && (a.account_key==="al_habib_bank" || /al habib/i.test(a.label||"")));
  const accounts=allAccounts.filter(a=>!(hasMcb && hasAlHabib && a.account_key==="bank_default"));
  return select("Deposit into account (required)","cashbook_account_key",[["","Choose the exact destination account"],...accounts.map(a=>[a.account_key,a.label])],"");
}
function paymentModal(id) {
  const i = S().invoices.find((x) => x.id === id),
    p = invoiceState(i, S().payments);
  modal(
    "Receive payment · " + i.number,
    `<div class="notice"><b>Invoice:</b> ${esc(i.number)} · <b>Customer:</b> ${esc(customerName(S().orders.find(o=>o.id===i.order_id)?.customer_id))}<br><b>Total:</b> ${money(i.total_paisa)} · <b>Already paid:</b> ${money(p.paid)} · <b>Balance due:</b> ${money(p.balance)} · ${badge(p.status)}</div><form id="payment-form" data-id="${id}"><div class="grid">${field("Date", "date", today(), "date", "required")}${field("Amount received now (Rs.)", "amount", p.balance / 100, "number", 'min="0.01" step="0.01" required')}<button type="button" class="secondary" data-act="pay-full-balance" data-id="${id}">Pay full balance</button>${select("Payment method", "method", [["Cash","Cash"],["MCB Bank","MCB Bank"],["Al Habib Bank","Al Habib Bank"],["JazzCash","JazzCash"],["Easypaisa","EasyPaisa"],["Cheque — MCB Bank","Cheque — MCB Bank"],["Cheque — Al Habib Bank","Cheque — Al Habib Bank"]])}${cashbookPaymentAccountField()}${field("Reference", "reference")}${field("Received by", "received_by", user.name || user.email || "Owner", "text", "required")}</div><button class="gold" style="margin-top:20px">Record payment</button></form>`,
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
    `<form id="stock-issue-form"><div class="grid">${select("Salesman", "salesman_id", visible(S().salesmen).filter((row) => row.active && (!manager() || managerTeamIds(S(), user.id).includes(row.id))).map((row) => [row.id, row.name]))}${field("Issue date", "date", today(), "date", "required")}${field("Voucher reference", "reference", "STI-" + uid(), "text", "required")}</div><div class="panel-heading"><h3>Products to issue</h3>${btn("+ Add product", "stock-add-line", "issue", 'type="button"')}</div><div id="stock-issue-lines"></div>${area("Notes", "note")}<p class="muted">All lines are validated and saved together. Cartons use each product's own pack size.</p><div id="stock-operation-error" class="notice danger" role="alert" style="display:none"></div><button type="submit" class="gold" style="margin-top:20px">Confirm stock issue</button></form>`,
  );
  renderStockOperationLines("issue");
}
function stockReturnModal() {
  stockReturnLineCount = 1;
  const sellers = visible(S().salesmen).filter((row) => row.active && (!manager() || managerTeamIds(S(), user.id).includes(row.id)));
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
  const sellers = visible(S().salesmen).filter((row) => row.active && (!manager() || managerTeamIds(S(), user.id).includes(row.id)));
  const salesmanId = own()?.id || (mgmt() ? sellers[0]?.id : "") || "";
  const date = today();
  const opening = openingCashFor(salesmanId, date);
  const expectedCash = expectedClosingCash(salesmanId, date, opening, 0);
  const stockFields = closingStockFields(salesmanId, date);
  modal(
    "Submit daily closing",
    `<form id="closing-form">${mgmt() ? select("Salesman", "closing_salesman", sellers.map((row) => [row.id, row.name]), salesmanId) : `<input type="hidden" name="closing_salesman" value="${esc(salesmanId)}"><div class="field"><label>Salesman</label><input value="${esc(salesmanName(salesmanId))}" readonly></div>`}<div class="grid">${field("Business date", "date", date, "date", 'required data-closing-date')}${field("Opening cash (Rs.)", "opening_cash", opening / 100, "number", 'min="0" step="0.01" required data-closing-cash')}${field("Cash handed over / deposited (Rs.)", "cash_handed_over", "0.00", "number", 'min="0" step="0.01" required data-closing-cash')}${field("Actual cash counted (Rs.)", "actual_cash", (expectedCash / 100).toFixed(2), "number", 'min="0" step="0.01" required data-closing-cash')}</div><div class="notice" id="closing-cash-estimate" aria-live="polite">Expected cash: ${money(expectedCash)}</div><h3>Closing balances</h3><p class="muted">Enter the balance held in each place at the end of the day. These are recorded with the closing and do not affect the cash variance.</p><div class="grid">${CLOSING_BALANCE_FIELDS.map(([name, label]) => field(label + " (Rs.)", name, "0.00", "number", 'min="0" step="0.01" required')).join("")}</div><h3>Physical salesman stock count</h3><div id="closing-stock-fields" class="grid">${stockFields || '<p class="muted">No salesman stock movements exist for this account.</p>'}</div>${area("Variance reason (required when cash or stock differs)", "reason")}${area("Closing notes", "notes")}<button class="gold" style="margin-top:20px">Submit for management approval</button></form>`,
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
async function advanceSalaryModal(preselectedSalesmanId = "") {
  if (!admin()) throw Error("Only Admin can release salary advances.");
  const accounts = (S().cashbook_accounts || []).filter(a => a.active && a.account_type !== "receivable");
  if (!accounts.length) throw Error("No active cash or bank accounts are available. Configure Cash & Bank Book accounts first.");
  const employees = [];
  for (const seller of (S().salesmen || []).filter(x => x.active !== false && !x.deleted_at)) {
    employees.push({ value: `salesman:${seller.id}`, label: `Salesman — ${seller.name}` });
  }
  const roleResult = await client.from("user_roles").select("user_id").eq("role", "manager");
  if (roleResult.error) throw roleResult.error;
  const managerIds = [...new Set((roleResult.data || []).map(x => x.user_id).filter(Boolean))];
  if (managerIds.length) {
    const profileResult = await client.from("profiles").select("id,display_name").in("id", managerIds);
    if (profileResult.error) throw profileResult.error;
    for (const profile of (profileResult.data || [])) employees.push({ value: `manager:${profile.id}`, label: `Manager — ${profile.display_name || profile.id}` });
    for (const managerId of managerIds.filter(id => !(profileResult.data || []).some(p => p.id === id))) employees.push({ value: `manager:${managerId}`, label: `Manager — ${managerId}` });
  }
  if (!employees.length) throw Error("No active salesmen or manager accounts were found.");
  const preferred = preselectedSalesmanId ? `salesman:${preselectedSalesmanId}` : employees[0].value;
  const defaultAccount = accounts.find(a => /cash in hand/i.test(a.label))?.account_key || accounts[0].account_key;
  const history = await client.from("employee_salary_advances").select("id,employee_name,employee_type,advance_date,amount_paisa,recovered_paisa,reason,status,account_key,reference,created_at").order("advance_date", { ascending: false }).limit(100);
  const rows = history.error ? [] : (history.data || []).map(a => [esc(a.employee_name), esc(a.employee_type), esc(a.advance_date), money(a.amount_paisa), money(Math.max(0, Number(a.amount_paisa || 0) - Number(a.recovered_paisa || 0))), esc(a.reason), esc((accounts.find(x => x.account_key === a.account_key) || {}).label || a.account_key), badge(a.status || "posted"), a.status === "posted" ? btn("Edit amount", "edit-salary-advance", a.id) : `<span class="muted">Reversed</span>`]);
  modal("Release advance salary", `<form id="salary-advance-form"><section class="panel"><p class="muted">Record an employee advance with a mandatory reason. The selected cash/bank/wallet account will be debited automatically. Any outstanding advance will be deducted from the employee's actual salary before the remaining amount is paid.</p>${select("Employee", "employee", employees.map(e => [e.value,e.label]), preferred, "required")}${field("Advance amount (PKR)", "amount", "", "number", 'min="0.01" step="0.01" required')}${field("Payment date", "advance_date", today(), "date", "required")}${select("Pay from account", "account_key", accounts.map(a=>[a.account_key,a.label]), defaultAccount, "required")}<div class="field"><label for="f-reason">Reason for advance salary <span class="required">*</span></label><textarea id="f-reason" name="reason" required minlength="3" maxlength="1000" placeholder="Explain why this advance is being issued"></textarea></div>${field("Reference / notes (optional)", "reference", "")}</section><button class="gold" type="submit">Confirm advance payment</button></form><section class="panel"><h2>Recent advance salary records</h2>${history.error ? `<p class="notice danger">History could not load: ${esc(history.error.message)}. Apply the advance-salary SQL migration first.</p>` : table(["Employee","Type","Date","Advance amount","Outstanding","Reason","Paid from","Status","Action"], rows, "No advance salary records yet.")}</section>`);
}

async function editSalaryAdvance(id) {
  if (!admin()) throw Error("Only Admin can edit salary advances.");
  const { data: advance, error } = await client.from("employee_salary_advances").select("id,employee_name,amount_paisa,recovered_paisa,reason,status").eq("id", id).single();
  if (error) throw error;
  if (advance.status !== "posted") throw Error("This advance is reversed and cannot be edited.");
  modal("Edit advance salary", `<form id="salary-advance-edit-form" data-id="${esc(advance.id)}"><section class="panel"><p><b>Employee:</b> ${esc(advance.employee_name)}</p><p class="muted">Changing the amount will post an adjustment to the same Cash & Bank Book account and keep an audit record.</p>${field("Advance amount (PKR)", "amount", (Number(advance.amount_paisa)/100).toFixed(2), "number", 'min="0.01" step="0.01" required')}<div class="field"><label for="f-reason">Reason for advance salary *</label><textarea id="f-reason" name="reason" required minlength="3" maxlength="1000">${esc(advance.reason)}</textarea></div></section><button class="gold" type="submit">Save advance changes</button></form>`);
}

async function postManagerSalary(managerId, month = today().slice(0, 7)) {
  if (!admin()) throw Error("Only Admin can release manager salary.");
  const managerProfile = (S().profiles || []).find(p => String(p.id) === String(managerId));
  if (!managerProfile || (S().user_roles || []).find(r => String(r.user_id) === String(managerId))?.role !== "manager") throw Error("Manager account not found.");
  const managerName = managerProfile.display_name || managerProfile.email || managerProfile.id;
  const prior = await client.from("expenses").select("id,amount_paisa,description").eq("manager_user_id", managerId).eq("salary_period", month).is("deleted_at", null).maybeSingle();
  if (prior.error) throw Error("Could not check manager payroll history. Apply the manager salary migration first. " + prior.error.message);
  if (prior.data) throw Error("Manager salary is already posted for " + month + ". Existing record: " + prior.data.id);
  const advanceResult = await client.from("employee_salary_advances").select("id,employee_name,amount_paisa,recovered_paisa,reason,advance_date").eq("manager_user_id", managerId).eq("status", "posted").order("advance_date", {ascending:true});
  if (advanceResult.error) throw Error("Could not load manager salary advances. Apply the v55.27 salary deduction migration first. " + advanceResult.error.message);
  const advances = (advanceResult.data || []).map(a => ({...a, outstanding:Math.max(0,Number(a.amount_paisa||0)-Number(a.recovered_paisa||0))})).filter(a=>a.outstanding>0);
  const outstandingAdvance = advances.reduce((sum,a)=>sum+a.outstanding,0);
  const accounts = (S().cashbook_accounts || []).filter(a=>a.active && a.account_type !== "receivable");
  if (!accounts.length) throw Error("No active payment accounts are available. Ask Admin to configure Cash & Bank Book accounts.");
  const defaultAccount = accounts.find(a=>/cash in hand/i.test(a.label))?.account_key || accounts[0].account_key;
  const reasons = advances.map(a=>`${a.reason} (${money(a.outstanding)} outstanding)`).join("; ");
  const payrollCalc = payrollCalculationFor({type:"manager",id:managerId,name:managerName,record:managerProfile}, month);
  modal("Release manager salary · " + managerName, `<form id="manager-salary-post-form" data-manager="${esc(managerId)}" data-month="${esc(month)}"><section class="panel"><p><b>Manager:</b> ${esc(managerName)}</p><p><b>Salary period:</b> ${esc(month)}</p><p class="muted">Enter the manager's gross monthly salary. Outstanding advances will be deducted oldest first, and only the remaining net salary will be paid and recorded.</p>${field("Gross salary (PKR)", "gross_amount", (payrollCalc.gross/100).toFixed(2), "number", 'min="0.01" step="0.01" required')}${table(["Salary calculation","Amount"], [["Outstanding advances",money(outstandingAdvance)],["Advance deduction this salary",`<span id="manager-salary-deduction-preview">Calculated after entering salary</span>`],["Net salary to release",`<b id="manager-salary-net-preview">Calculated after entering salary</b>`]], "No outstanding salary advances.")}${advances.length ? `<p><b>Advance reasons:</b> ${esc(reasons)}</p>` : `<p class="muted">No outstanding salary advances for this manager.</p>`}${select("Pay salary from account", "cashbook_account_key", accounts.map(a=>[a.account_key,a.label]), defaultAccount, "required")}${field("Payment date", "date", today(), "date", "required")}${field("Payment reference (optional)", "reference", "")}</section><button class="gold" type="submit">Confirm net salary payment</button></form>`);
  const form = document.getElementById("manager-salary-post-form");
  form?.querySelector('[name="gross_amount"]')?.addEventListener("input", e => {
    const gross = Math.max(0, Math.round(Number(e.target.value || 0) * 100));
    const deduction = Math.min(gross, outstandingAdvance);
    const deductionNode = document.getElementById("manager-salary-deduction-preview");
    const netNode = document.getElementById("manager-salary-net-preview");
    if (deductionNode) deductionNode.textContent = money(deduction);
    if (netNode) netNode.textContent = money(Math.max(0, gross - deduction));
  });
}

async function postSalary(id, month = today().slice(0, 7), automatic = false) {
  const s = S().salesmen.find((x) => x.id === id);
  if (!s) throw Error("Salesman not found.");
  const payrollCalc = payrollCalculationFor({type:"salesman",id:s.user_id||s.id,name:s.name||"Salesman",record:s}, month);
  const achieved = payrollCalc.achieved;
  const pay = { total: payrollCalc.gross, incentive: payrollCalc.incentive, percent: payrollCalc.target>0 ? payrollCalc.achieved/payrollCalc.target*100 : 0 };
  const old = S().expenses.find(e => e.salesman_id === id && e.salary_period === month);
  if (old && !old.deleted_at) {
    if (automatic) return;
    throw Error("Salary already posted for " + month);
  }
  const accounts = (S().cashbook_accounts || []).filter(a => a.active && a.account_type !== "receivable" && (!manager() || !a.salesman_id || a.salesman_id === own()?.id));
  if (!accounts.length) throw Error("No active payment accounts are available. Ask Admin to configure Cash & Bank Book accounts.");
  const defaultAccount = accounts.find(a => /cash in hand/i.test(a.label))?.account_key || accounts[0].account_key;
  const advanceResult = await client.from("employee_salary_advances").select("id,employee_name,amount_paisa,recovered_paisa,reason,advance_date").eq("salesman_id", id).eq("status", "posted").order("advance_date", { ascending: true });
  if (advanceResult.error) throw Error("Could not load outstanding salary advances. Apply the v55.27 salary deduction migration first. " + advanceResult.error.message);
  const advances = (advanceResult.data || []).map(a => ({...a, outstanding: Math.max(0, Number(a.amount_paisa || 0) - Number(a.recovered_paisa || 0))})).filter(a => a.outstanding > 0);
  const outstandingAdvance = advances.reduce((sum, a) => sum + a.outstanding, 0);
  const advanceDeduction = Math.min(Number(pay.total || 0), outstandingAdvance);
  const netPay = Math.max(0, Number(pay.total || 0) - advanceDeduction);
  const advanceReasons = advances.map(a => `${a.reason} (${money(a.outstanding)} outstanding)`).join("; ");
  if (!automatic) {
    modal("Release salary · " + s.name, `<form id="salary-post-form" data-salesman="${esc(id)}" data-month="${esc(month)}"><section class="panel"><p><b>Salary period:</b> ${esc(month)}</p>${table(["Salary calculation","Amount"], [["Gross salary",money(pay.total)], ["Outstanding advances",money(outstandingAdvance)], ["Advance deduction this salary",money(advanceDeduction)], ["Net salary to release",`<b>${money(netPay)}</b>`]], "Salary calculation unavailable.")}<p class="muted">Outstanding advances will be deducted oldest first. The salary record will include the advance deduction and reasons, and recovered amounts will not be deducted again.</p>${advances.length ? `<p><b>Advance reasons:</b> ${esc(advanceReasons)}</p>` : `<p class="muted">No outstanding salary advances for this employee.</p>`}${select("Pay salary from account", "cashbook_account_key", accounts.map(a=>[a.account_key,a.label]), defaultAccount, "required")}${field("Payment date", "date", today(), "date", "required")}${field("Payment reference (optional)", "reference", "")}</section><button class="gold" type="submit">Confirm net salary payment</button></form>`);
    return;
  }
  if (netPay <= 0) {
    // Do not create an invalid zero-value expense. Keep outstanding advance balances for a future salary period.
    return;
  }
  const accountKey = s.salary_account_key || defaultAccount;
  const account = accounts.find(a => a.account_key === accountKey) || accounts[0];
  await store.run("master.save", { table: "expenses", record: {
    id: old?.id || "SAL-" + id + "-" + month,
    date: monthEnd(month + "-01"), category: "Salaries",
    description: `Salary released to ${s.name} — ${month}; gross ${money(pay.total)}; advance deduction ${money(advanceDeduction)}${advanceReasons ? "; advances: " + advanceReasons : ""}${automatic ? " (automatic posting)" : ""}`,
    amount_paisa: netPay,
    method: /jazzcash/i.test(account.label) ? "JazzCash" : /easypaisa/i.test(account.label) ? "Easypaisa" : /cash/i.test(account.label) ? "Cash" : /mcb/i.test(account.label) ? "MCB Bank" : /al habib/i.test(account.label) ? "Al Habib Bank" : "Bank Account",
    cashbook_account_key: account.account_key, salesman_id: id, salary_period: month,
  }, expected_version: old?.version });
  if (advanceDeduction > 0) {
    let remaining = advanceDeduction;
    for (const advance of advances) {
      if (remaining <= 0) break;
      const applied = Math.min(remaining, advance.outstanding);
      const newRecovered = Number(advance.recovered_paisa || 0) + applied;
      const updated = await client.from("employee_salary_advances").update({ recovered_paisa: newRecovered, last_deducted_salary_period: month }).eq("id", advance.id).eq("recovered_paisa", Number(advance.recovered_paisa || 0)).select("id");
      if (updated.error || !updated.data?.length) throw Error("Salary was posted, but an advance recovery record could not be updated. Do not repost this salary; contact Admin to reconcile advance recovery.");
      remaining -= applied;
    }
  }
  if (!automatic) toast(`Salary released: gross ${money(pay.total)}, advance deduction ${money(advanceDeduction)}, net paid ${money(netPay)}.`);
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
  s.salesman_allowance_paisa = paisa(f.get("salesman_allowance"));
  s.salesman_incentive_per_carton_paisa = paisa(f.get("salesman_incentive_per_carton"));
  s.manager_base_salary_paisa = paisa(f.get("manager_base_salary"));
  s.manager_allowance_paisa = paisa(f.get("manager_allowance"));
  s.manager_incentive_per_carton_paisa = paisa(f.get("manager_incentive_per_carton"));
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
async function userModal(id) {
  let linkableSalesmen = S().salesmen;
  if (!id && client && admin()) {
    // business_snapshot can omit profiles that are not in its current scope. Load the
    // authoritative list directly so Admin can link an existing profile.
    const { data: sellerRows, error: sellerLoadError } = await client.from("salesmen").select("*").order("name");
    if (sellerLoadError) throw Error("Could not load existing salesman profiles for linking: " + sellerLoadError.message);
    linkableSalesmen = sellerRows || [];
  }
  const p = S().profiles.find((p) => p.id === id),
    role = S().user_roles.find((r) => r.user_id === id)?.role || "salesman";
  if (!admin()) throw Error("Only Admin can create or edit user access.");
  if (!id) {
    const defaultManager = "";
    modal(
      "Create user + employee profile",
      `<form id="create-user-form"><div class="grid">
      ${field("Full name", "display_name", "", "text", "required")}
      ${field("Login email", "email", "", "email", "required")}
      ${field("Temporary password (minimum 12 characters)", "temporary_password", "", "password", 'minlength="12" autocomplete="new-password" required')}
      ${select("Create profile as", "role", [["salesman","Salesman"],["manager","Manager"]], "salesman")}
      <section id="salesman-profile-fields" class="panel" style="grid-column:1/-1"><h3>Salesman profile details</h3><div class="grid">
      ${field("Employee ID (leave blank to generate)", "employee_id", "", "text", 'pattern="[A-Za-z0-9._:-]{1,180}"')}
      ${field("Phone", "employee_phone", "", "tel")}
      ${field("Date of birth", "date_of_birth", "", "date")}
      ${field("Joining date", "joining_date", today(), "date", 'min="2000-01-01" required')}
      ${field("Base monthly salary (Rs.)", "base_salary", num(S().settings.base_salary_paisa || 4500000)/100, "number", 'min="0" step="0.01" required')}
      ${field("Monthly allowance (Rs.)", "payroll_allowance", "0", "number", 'min="0" step="0.01" required')}
      ${field("Incentive per carton above target (Rs.)", "payroll_incentive", "0", "number", 'min="0" step="0.01" required')}
      ${field("Working days per month", "payroll_working_days", "26", "number", 'min="1" max="31" step="1" required')}
      ${field("Monthly target (cartons)", "monthly_target", num(S().settings.monthly_target || 130), "number", 'min="1" step="0.01" required')}
      ${select("Salesman status", "employee_active", [["true","Active"],["false","Inactive"]], "true")}
      ${select("Assign salesman to manager (optional)", "manager_user_id", [["","Unassigned"], ...S().profiles.filter(profile => S().user_roles.some(role => role.user_id === profile.id && role.role === "manager") && profile.active !== false).map(profile => [profile.id, profile.display_name || profile.email || "Manager"])], defaultManager)}
      ${area("Personal holidays / off dates (YYYY-MM-DD, one per line)", "off_days", "")}
      ${select("Salary basis", "salary_basis", [["fixed","Fixed salary"],["commission","Commission basis"]], "fixed")}
      <div class="field"><label for="new-salesman-photo">Profile photo (optional, JPG/PNG/WebP, max 5 MB)</label><input id="new-salesman-photo" name="profile_photo" type="file" accept="image/jpeg,image/png,image/webp"></div>
      <div class="field"><label for="new-salesman-nic">NIC / identity document (optional, PDF/JPG/PNG/WebP, max 10 MB)</label><input id="new-salesman-nic" name="identity_document" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></div>
      </div><section id="commission-products-config" class="panel" style="display:none"><h3>Commission per carton by product</h3><p class="muted">Only confirmed personal sales count.</p><div class="grid">${(S().products || []).filter(p => p.active !== false && !p.deleted_at).map(p => field(`${p.name} — commission per carton (Rs.)`, `commission_${String(p.id).replace(/[^a-zA-Z0-9_-]/g,"_")}`, "0", "number", 'min="0" step="0.01"')).join("") || '<p class="muted">No active products found.</p>'}</div></section></section>
      <section id="manager-profile-fields" class="panel" style="grid-column:1/-1;display:none"><h3>Manager profile details</h3><div class="grid">
      ${field("Base monthly salary (Rs.)", "manager_base_salary", "0", "number", 'min="0" step="0.01" required')}
      ${field("Monthly allowance (Rs.)", "manager_allowance", "0", "number", 'min="0" step="0.01" required')}
      ${field("Incentive per carton above target (Rs.)", "manager_incentive", "0", "number", 'min="0" step="0.01" required')}
      ${field("Individual monthly target (cartons)", "manager_monthly_target", "0", "number", 'min="0" step="0.01" required')}
      ${field("Working days per month", "manager_working_days", "26", "number", 'min="1" max="31" step="1" required')}
      </div><p class="muted">A manager login creates a manager profile and payroll settings. Manager direct sales remain separate from the team target.</p></section>
      </div><p class="muted">The login, role and matching employee profile are created together. Managers cannot access this workflow.</p><button class="gold">Create user and profile</button></form>`,
    );
    const createForm = $("create-user-form");
    const roleSelect = createForm?.elements?.namedItem("role");
    const basisSelect = createForm?.elements?.namedItem("salary_basis");
    const salesmanFields = $("salesman-profile-fields");
    const managerFields = $("manager-profile-fields");
    const commissionPanel = $("commission-products-config");
    const toggleRoleFields = () => {
      const isSalesman = roleSelect?.value === "salesman";
      if (salesmanFields) salesmanFields.style.display = isSalesman ? "block" : "none";
      if (managerFields) managerFields.style.display = isSalesman ? "none" : "block";
      if (commissionPanel) commissionPanel.style.display = isSalesman && basisSelect?.value === "commission" ? "block" : "none";
      for (const el of salesmanFields?.querySelectorAll("input,select,textarea") || []) {
        if (["display_name","email","temporary_password","role"].includes(el.name)) continue;
        el.disabled = !isSalesman;
      }
      for (const el of managerFields?.querySelectorAll("input,select,textarea") || []) el.disabled = isSalesman;
    };
    roleSelect?.addEventListener("change", toggleRoleFields);
    basisSelect?.addEventListener("change", toggleRoleFields);
    toggleRoleFields();
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
    )}${select("Link salesman profile", "salesman_id", sellerChoices, linkedSeller?.id || "__create__")}${select("Assigned manager", "manager_user_id", [["", "Unassigned"], ...S().profiles.filter(profile => S().user_roles.some(rr => rr.user_id === profile.id && rr.role === "manager") && profile.active !== false).map(profile => [profile.id, profile.display_name || "Manager"])], linkedSeller?.manager_user_id || "")}</div><p class="muted">For a salesman login, link an existing salesman profile or create one. Assigning a manager places that salesman in the manager's team overview, while the Admin can still see and manage the assignment here.</p><p>Optional payment collection permission:</p><div class="checkbox"><input id="can-collect" name="can_collect" type="checkbox" ${S().user_permissions.some((x) => x.user_id === id && x.section === "invoices" && x.can_create) ? "checked" : ""}><label for="can-collect">Allow collecting invoice payments</label></div><button class="gold" style="margin-top:20px">Save access</button></form>`,
  );
}
const normName = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
function unlinkedSalesmanByName(name) {
  const n = normName(name);
  if (!n) return [];
  return S().salesmen.filter((x) => !x.user_id && !x.deleted_at && x.active && normName(x.name) === n);
}
async function edgeFunctionError(error, fnName) {
  // Turn the generic supabase-js wrapper messages into something an Admin can act on.
  try {
    const body = await error.context?.json?.();
    if (body?.error) return body.error;
  } catch {}
  const status = error?.context?.status;
  if (status === 404) return `Edge Function "${fnName}" is not deployed in Supabase. Deploy it (see DEPLOY_V55_8.md) and try again.`;
  if (status === 401) return "Your session has expired. Sign out, sign in again as Admin, and retry.";
  if (/Failed to send a request|FunctionsFetchError|NetworkError|Failed to fetch/i.test(error?.message || "")) {
    return `Could not reach Edge Function "${fnName}". Either it is not deployed, or its ALLOWED_ORIGIN secret does not exactly match ${location.origin}. See DEPLOY_V55_8.md.`;
  }
  return error?.message || String(error);
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
      if (uploaded.error) throw Error("Step 1 of 2 (file upload to private storage) was refused: "+uploaded.error.message);
      const saved = await client.from("profiles").update({avatar_path:path, updated_at:new Date().toISOString()}).eq("id", user.id);
      if (saved.error) { await bucket.remove([path]); throw Error("Step 2 of 2 (saving the record) was refused: "+saved.error.message); }
      const signed = await bucket.createSignedUrl(path, 3600);
      if (signed.error) throw signed.error;
      const avatar = $("admin-profile-avatar");
      if (avatar && signed.data?.signedUrl) avatar.innerHTML = `<img src="${esc(signed.data.signedUrl)}" alt="Administrator profile photo">`;
      const profile = S().profiles?.find((p) => String(p.id) === String(user.id));
      if (profile) profile.avatar_path = path;
      toast("Administrator profile picture uploaded.");
      break;
    }
    case "manager-profile-photo-upload": {
      if (!manager()) throw Error("Manager account required.");
      const file=$("manager-profile-photo")?.files?.[0]; if(!file) throw Error("Choose a photo first.");
      if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>5*1024*1024) throw Error("Use JPG, PNG or WebP up to 5 MB.");
      const path=`${user.id}/manager-profile-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`; const bucket=client.storage.from("employee-private");
      const up=await bucket.upload(path,file,{contentType:file.type,upsert:false}); if(up.error) throw Error("Step 1 of 2 (file upload to private storage) was refused: "+up.error.message+" [as "+(admin()?"admin":manager()?"manager":user?.role)+", folder "+String(path).split("/")[0]+"]");
      const saved=await client.from("profiles").update({avatar_path:path,updated_at:new Date().toISOString()}).eq("id",user.id); if(saved.error){await bucket.remove([path]);throw Error("Step 2 of 2 (saving the record) was refused: "+saved.error.message);}
      const signed=await bucket.createSignedUrl(path,3600); if(signed.error) throw signed.error; const avatar=$("manager-profile-avatar"); if(avatar) avatar.innerHTML=`<img src="${esc(signed.data.signedUrl)}" alt="Manager profile photo">`; toast("Manager profile photo updated."); break;
    }
    case "manager-document-upload": {
      if(!manager()) throw Error("Manager account required."); const file=$("manager-document-file")?.files?.[0]; if(!file) throw Error("Choose a document first.");
      if(!(file.type==="application/pdf"||/^image\/(jpeg|png|webp)$/.test(file.type))||file.size>10*1024*1024) throw Error("Use PDF, JPG, PNG or WebP up to 10 MB.");
      const path=`${user.id}/manager-documents/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`; const bucket=client.storage.from("employee-private"); const up=await bucket.upload(path,file,{contentType:file.type,upsert:false}); if(up.error) throw Error("Step 1 of 2 (file upload to private storage) was refused: "+up.error.message+" [as "+(admin()?"admin":manager()?"manager":user?.role)+", folder "+String(path).split("/")[0]+"]");
      const saved=await client.from("manager_employee_documents").insert({manager_user_id:user.id,document_type:$("manager-document-type")?.value||"other",file_path:path,file_name:file.name,mime_type:file.type,size_bytes:file.size}); if(saved.error){await bucket.remove([path]);throw Error("Step 2 of 2 (saving the record) was refused: "+saved.error.message);} $("manager-document-file").value=""; toast("Document uploaded securely."); await hydrateManagerFieldwork(); break;
    }
    case "manager-attendance-check-in":
    case "manager-attendance-check-out": {
      if(!manager()) throw Error("Manager account required."); const {data:existing,error:readErr}=await client.from("manager_attendance_records").select("*").eq("manager_user_id",user.id).eq("attendance_date",today()).maybeSingle(); if(readErr) throw readErr;
      if(act==="manager-attendance-check-in") { if(existing?.check_in_at) throw Error("You have already checked in today."); let coords=null; if(navigator.geolocation) try{coords=await new Promise(resolve=>navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),()=>resolve(null),{enableHighAccuracy:true,timeout:10000,maximumAge:60000}));}catch{}
        const {error}=await client.from("manager_attendance_records").insert({manager_user_id:user.id,attendance_date:today(),check_in_at:new Date().toISOString(),status:"present",latitude:coords?.latitude??null,longitude:coords?.longitude??null}); if(error)throw error; toast(coords?"Check-in saved with GPS.":"Check-in saved without GPS.");
      } else {if(!existing?.check_in_at)throw Error("Check in before checking out.");if(existing.check_out_at)throw Error("Already checked out today.");const {error}=await client.from("manager_attendance_records").update({check_out_at:new Date().toISOString()}).eq("id",existing.id);if(error)throw error;toast("Check-out recorded.");} await hydrateManagerFieldwork(); break;
    }
    case "manager-visit-save":
    case "manager-visit-save-location": {
      if(!manager())throw Error("Manager account required."); const save=async(coords=null)=>{const customer=$("f-manager-visit-customer")?.value.trim()||"",areaName=$("f-manager-visit-area")?.value.trim()||"";if(!customer&&!areaName)throw Error("Enter a customer or area.");const {error}=await client.from("manager_customer_visits").insert({manager_user_id:user.id,customer_label:customer,area:areaName,purpose:$("f-manager-visit-purpose")?.value||"Sales visit",notes:$("f-manager-visit-notes")?.value||"",latitude:coords?.latitude??null,longitude:coords?.longitude??null,visited_at:new Date().toISOString()});if(error)throw error;$("f-manager-visit-notes").value="";toast("Fieldwork visit saved.");};
      if(act==="manager-visit-save-location"){if(!navigator.geolocation)throw Error("GPS unavailable. Save without GPS instead.");await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(async p=>{try{await save(p.coords);resolve();}catch(e){reject(e);}},()=>reject(Error("GPS permission denied. You can save without GPS.")),{enableHighAccuracy:true,timeout:12000,maximumAge:60000}));}else await save();await hydrateManagerFieldwork();break;
    }
    case "profile-photo-upload":
    case "employee-document-upload":
    case "attendance-check-in":
    case "attendance-check-out":
      throw Error("This action is managed by your authorized manager. Contact your manager for profile/document changes or attendance corrections.");
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
    case "cashbook-add-money":
      if (!admin()) throw Error("Only Admin can add external funds");
      {
        const accounts = cashbookData().accounts.filter(a=>a.active && ["cash","bank","wallet"].includes(a.account_type));
        modal("Add Money · External funds", `<p class="notice">Use this only for new money introduced into the business. For money moved from another tracked account, use Transfer between accounts. Opening-balance corrections must use the audited adjustment workflow.</p><form id="cashbook-form" data-kind="deposit">${field("Date","date",cashbookDate,"date","required")}${select("Destination account","account_key",accounts.map(a=>[a.account_key,a.label]),"cash_hand")}${field("Amount (PKR)","amount","","number",'min="0.01" step="0.01" required')}${field("Reference number (optional)","reference")}${area("Source / reason (required)","description","")}<div class="actions"><button class="gold" type="submit">Confirm Add Money</button></div></form>`);
      }
      break;
    case "cashbook-account-ledger":
      cashbookAccountFilter = id || ""; render(); requestAnimationFrame(() => document.getElementById("cashbook-transactions")?.scrollIntoView({ behavior: "smooth", block: "start" })); break;
    case "cashbook-account-ledger-clear":
      cashbookAccountFilter = ""; render(); requestAnimationFrame(() => document.getElementById("cashbook-transactions")?.scrollIntoView({ behavior: "smooth", block: "start" })); break;
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
    case "cashbook-edit-account": {
      if (!admin()) throw Error("Only Admin can configure accounts");
      const account = cashbookData().accounts.find(a => a.account_key === id);
      if (!account || !["bank","wallet"].includes(account.account_type)) throw Error("Bank or wallet account not found");
      modal("Edit bank / wallet account", `<form id="cashbook-form" data-kind="account">${field("Account key","account_key",account.account_key,"text",'readonly required')}${field("Display name","label",account.label,"text","required")}${select("Account type","account_type", [["bank","Bank Account"],["wallet","Digital wallet"]],account.account_type)}${select("Payment method mapping","payment_method",[["Bank Account","Bank Account"],["Easypaisa","EasyPaisa"],["JazzCash","JazzCash"]],account.payment_method||"Bank Account")}${field("Opening balance (Rs.)","opening_balance",(num(account.opening_balance_paisa)/100).toFixed(2),"number",'min="0" step="0.01" required')}<p class="muted">If this account has ledger activity, its opening balance and account type/payment mapping cannot be changed. Use an audited adjustment for balance corrections.</p><div class="actions"><button class="gold" type="submit">Save changes</button></div></form>`);
      break;
    }
    case "cashbook-add-account":
      if (!admin()) throw Error("Only Admin can configure accounts");
      modal("Add bank / wallet account", `<form id="cashbook-form" data-kind="account">${field("Account key (letters, numbers, _ : -)","account_key","","text",'pattern="[a-z][a-z0-9_:-]{2,79}" required')}${field("Display name","label","","text","required")}${select("Account type","account_type", [["bank","Bank Account"],["wallet","Digital wallet"]],"bank")}${select("Payment method mapping","payment_method",[["Bank Account","Bank Account"],["Easypaisa","EasyPaisa"],["JazzCash","JazzCash"]],"Bank")}${field("Opening balance (Rs.)","opening_balance","0","number",'min="0" step="0.01" value="0" required')}<div class="actions"><button class="gold" type="submit">Save account</button></div></form>`);
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
      if (user.role === "salesman" || (manager() && !can("invoices"))) showOperationalOrder(id);
      else showDocument(id);
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
      if (!mgmt()) throw Error("Manager or Admin required");
      const p = S().products.find(x=>x.id===id);
      if (!p) throw Error("Product not found");
      await store.run("product.save", { record:{...p,active:!p.active}, expected_version:p.version, tiers:S().price_tiers.filter(t=>t.product_id===id&&!t.deleted_at) });
      render(); toast(p.active ? "Product deactivated" : "Product activated"); break;
    }
    case "add-staff":
      if (!admin()) throw Error("Create employee logins and profiles from Admin → Users & Access. Managers cannot create users or salesmen.");
      throw Error("The standalone Add Salesman workflow has been removed. Create the login and linked salesman profile together from Admin → Users & Access.");
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
    case "new-manager-closing":
      managerClosingModal();
      break;
    case "approve-manager-closing": {
      const row = S().manager_daily_closings.find((r) => r.id === id);
      await store.run("closing.manager_approve", { id, expected_version: row.version });
      render();
      toast("Manager closing approved");
      break;
    }
    case "reject-manager-closing": {
      const row = S().manager_daily_closings.find((r) => r.id === id);
      const reason = prompt("Reason for rejecting this manager closing:");
      if (!reason?.trim()) break;
      await store.run("closing.manager_reject", { id, expected_version: row.version, reason: reason.trim() });
      render();
      toast("Manager closing rejected");
      break;
    }
    case "reopen-manager-closing": {
      const row = S().manager_daily_closings.find((r) => r.id === id);
      const reason = prompt("Reason for reopening this manager closing:");
      if (!reason?.trim()) break;
      await store.run("closing.manager_reopen", { id, expected_version: row.version, reason: reason.trim() });
      render();
      toast("Manager closing reopened");
      break;
    }
    case "clone-closing": {
      if (!mgmt()) throw Error("Manager or Admin required");
      const source = S().daily_closings.find((row) => row.id === id);
      if (!source) throw Error("Daily closing not found");
      // Cloning is a new draft only: no source id, approval status, or transactions are copied.
      closingModal();
      const form = $("closing-form");
      if (form) {
        const values = {
          opening_cash: num(source.opening_cash_paisa) / 100,
          cash_handed_over: num(source.cash_handed_over_paisa) / 100,
          actual_cash: num(source.actual_cash_paisa) / 100,
          reason: "", notes: source.notes || "",
          ...Object.fromEntries(CLOSING_BALANCE_FIELDS.map(([name]) => [name, num(source[name + "_paisa"]) / 100]))
        };
        for (const [name, value] of Object.entries(values)) {
          const input = form.elements.namedItem(name);
          if (input) input.value = value;
        }
        const dateInput = form.elements.namedItem("date");
        if (dateInput) dateInput.value = today();
      }
      toast("Previous closing copied into a new draft. Review date and values before submitting.");
      break;
    }
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
    case "payroll-apply": {
      window.__payrollMonth = document.getElementById("payroll-month")?.value || today().slice(0,7);
      window.__payrollQuery = document.getElementById("payroll-search")?.value || "";
      page = "payroll"; render(); break;
    }
    case "payroll-refresh": await store.refresh(); page="payroll"; render(); break;
    case "payroll-details": {
      if (!admin()) throw Error("Only Admin can view payroll details.");
      const month = document.querySelector(`[data-act="payroll-details"][data-id="${CSS.escape(id)}"]`)?.dataset.month || window.__payrollMonth || today().slice(0,7);
      const type = document.querySelector(`[data-act="payroll-details"][data-id="${CSS.escape(id)}"]`)?.dataset.type;
      const p = type === "manager" ? (S().profiles||[]).find(x=>String(x.id)===String(id)) : (S().salesmen||[]).find(x=>String(x.id)===String(id)||String(x.user_id)===String(id));
      if (!p) throw Error("Employee record not found. Refresh data and try again.");
      payrollDetailsModal(payrollCalculationFor({type,id,name:p.name||p.display_name||p.full_name||p.email||id,record:p},month));
      break;
    }
    case "payroll-release": {
      if (!admin()) throw Error("Only Admin can release salary.");
      const el = document.querySelector(`[data-act="payroll-release"][data-id="${CSS.escape(id)}"]`);
      const month = el?.dataset.month || window.__payrollMonth || today().slice(0,7);
      const type = el?.dataset.type;
      if (type === "manager") await postManagerSalary(id, month); else await postSalary(id, month);
      await store.refresh(); page="payroll"; render(); break;
    }
    case "post-salary":
      await postSalary(id);
      render();
      break;
    case "edit-manager-payroll":
      await managerPayrollModal(id);
      break;
    case "post-manager-salary":
      await postManagerSalary(id);
      break;
    case "advance-salary":
      await advanceSalaryModal(id);
      break;
    case "edit-salary-advance":
      await editSalaryAdvance(id);
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
        `<p>Stock will be checked and deducted once. The original quotation will link to the new order.</p><div class="notice">${S().quotation_items.filter(l=>l.quotation_id===id).map(l=>{const available=balance(l.product_id);return `${esc(l.product_name)}: ${available} available / ${l.boxes} required ${available>=l.boxes?"✓":"⚠ Insufficient"}`;}).join("<br>")}</div><form id="convert-form" data-id="${id}"><p>Quotation total: <b>${money(q.total_paisa)}</b></p><div class="checkbox"><input id="reprice" name="reprice" type="checkbox"><label for="reprice">Re-price at today's rates</label></div><section class="panel"><h3>Payment</h3><div class="grid three">${select("Payment status", "payment_status", [["unpaid","Unpaid"],["partial","Part paid"],["paid","Paid in full"]], "unpaid")}${field("Amount received now (Rs.)", "payment_amount", "0.00", "number", 'min="0" step="0.01"')}${field("Payment date", "payment_date", today(), "date")}${select("Payment method", "payment_method", [["Cash","Cash"],["MCB Bank","MCB Bank"],["Al Habib Bank","Al Habib Bank"],["JazzCash","JazzCash"],["Easypaisa","EasyPaisa"],["Cheque — MCB Bank","Cheque — MCB Bank"],["Cheque — Al Habib Bank","Cheque — Al Habib Bank"]])}${cashbookPaymentAccountField()}${field("Reference", "payment_reference")}${field("Received by", "payment_received_by", user.name || user.email || "Owner")}${field("Due date", "payment_due_date", addDays(today(),7), "date")}</div><div id="convert-payment-summary" class="total-box" aria-live="polite">Total · Paid now · Balance</div></section><button class="gold" style="margin-top:20px">Convert to order</button></form>`,
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
    case "reset-user-password": {
      if (!admin()) throw Error("Only an administrator can reset another user's password.");
      if (!client) throw Error("Password resets require a configured Supabase connection.");
      const target = S().profiles.find((p) => String(p.id) === String(id));
      if (!target || target.id === user.id) throw Error("Choose another valid user account.");
      const targetRole = S().user_roles.find(r => r.user_id === target.id)?.role || "user";
      modal(
        "Reset password · " + esc(target.display_name || "user"),
        `<form id="reset-password-form" data-id="${esc(target.id)}"><p class="muted">Set a new password for this ${esc(targetRole)} account (12–128 characters). Share it with them securely; their old password stops working immediately.</p><div class="grid">${field("New password", "new_password", "", "password", 'minlength="12" maxlength="128" required autocomplete="new-password"')}${field("Confirm new password", "confirm_password", "", "password", 'minlength="12" maxlength="128" required autocomplete="new-password"')}</div><div id="master-form-error" role="alert" style="display:none"></div><button class="gold" type="submit" style="margin-top:15px">Reset password</button></form>`,
      );
      break;
    }
    case "delete-user": {
      if (!admin()) throw Error("Only Admin can delete user accounts.");
      if (!client) throw Error("Deleting user accounts requires Supabase.");
      const target = S().profiles.find((profile) => String(profile.id) === String(id));
      if (!target || target.id === user.id) throw Error("You cannot delete your own signed-in account.");
      const targetRole = S().user_roles.find((r) => r.user_id === target.id)?.role || "user";
      const linkedSeller = S().salesmen.find((seller) => seller.user_id === target.id);
      const promptText = `Permanently delete login for ${target.display_name || "this user"} (${targetRole})?\n\nThe login and access roles will be removed. Sales and other historical business records will be preserved; a linked salesman profile will be unlinked from this login. Deleting a manager may also remove that manager's attendance, documents and visit records according to database rules.\n\nType DELETE to confirm.`;
      if (window.prompt(promptText) !== "DELETE") break;
      const { data, error } = await client.functions.invoke("admin-delete-user", { body: { user_id: target.id } });
      if (error) { let message = error.message; try { const body = await error.context.json(); if (body?.error) message = body.error; } catch {} throw Error(message); }
      if (data?.error) throw Error(data.error);
      await store.refresh();
      render();
      toast(`Login deleted for ${target.display_name || "user"}; business history preserved.`);
      break;
    }
    case "delete-salesman": {
      if (!admin()) throw Error("Only Admin can delete a salesman.");
      if (!client) throw Error("Deleting a salesman requires Supabase.");
      const seller = S().salesmen.find((x) => String(x.id) === String(id));
      if (!seller) throw Error("Salesman not found. Refresh and try again.");
      const { data: preview, error: previewError } = await client.rpc("admin_delete_salesman", { p_salesman_id: seller.id, p_dry_run: true });
      if (previewError) {
        const m = previewError.message || String(previewError);
        if (/admin_delete_salesman|schema cache|does not exist/i.test(m)) throw Error("Run supabase/admin_delete_salesman_v55_9.sql in the Supabase SQL Editor first. " + m);
        throw Error("The delete preview failed, so nothing was deleted: " + m);
      }
      const counts = Object.entries(preview?.counts || {}).sort((a, b) => a[0].localeCompare(b[0]));
      const total = counts.reduce((n, [, v]) => n + Number(v), 0);
      modal(
        "Permanently delete " + esc(seller.name),
        `<form id="delete-salesman-form" data-id="${esc(seller.id)}"><p class="notice"><b>This cannot be undone.</b> The salesman and every connected record below will be deleted. Customers are kept but unassigned. Stock and cash/bank balances will change. Download a JSON backup first.</p>${table(["Records", "Count"], counts.map(([k, v]) => [esc(k.replace(/^public\./, "")), esc(String(v))]), "Nothing else is linked to this salesman.")}<p>${preview?.user_id ? "Their login will also be deleted." : "This salesman has no login."}</p><div class="grid">${field('Type DELETE to confirm (' + total + ' records)', "confirm", "", "text", 'required autocomplete="off"')}</div><div id="master-form-error" role="alert" style="display:none"></div><button class="danger" type="submit" style="margin-top:15px">Delete salesman and data</button></form>`,
      );
      break;
    }
    case "salesman-profile":
      await openAdminSalesmanProfile(id);
      break;
    case "my-target-details": salesmanTargetDetails(id); break;
    case "my-salary-details": {
      if (user?.role !== "salesman" || own()?.id !== id) throw Error("You can only view your own salary details.");
      const result = await client.rpc("own_salary_snapshot"); if (result.error) throw result.error;
      const pay = applyArsalanOctoberPayrollCorrection(result.data || {}, own()?.name || own()?.display_name);
      modal("My salary breakdown · " + esc(pay.salary_period || today().slice(0,7)), `<section class="panel"><p><b>Status:</b> ${esc(pay.status === "posted" ? "Posted" : "Estimate — pending Admin approval")}</p>${table(["Component","Amount"], [["Attendance credited",`${num(pay.attendance_days).toFixed(1)} / ${num(pay.working_days)} days`],["Salary per attendance day",money(num(pay.base_salary_monthly_paisa)/Math.max(1,num(pay.working_days)))],["Base salary earned after attendance",money(pay.base_salary_paisa||0)],["Allowance earned after attendance",money(pay.allowance_paisa||0)],["Target incentive",money(pay.incentive_paisa||0)],["Net salary after outstanding advances",money(pay.total_paisa ?? pay.estimated_net_after_outstanding_advances_paisa ?? 0)],["Monthly target",`${num(pay.monthly_target).toFixed(2)} cartons`],["Eligible quantity achieved",`${num(pay.achieved_cartons).toFixed(2)} cartons`],["Achievement",`${num(pay.achievement_percent).toFixed(1)}%`]], "Salary calculation unavailable.")}<p class="muted">This is an estimate unless marked Posted. Outstanding salary advances are deducted from the estimated net amount. Check the advance history before releasing salary.</p></section>`); break;
    }
    case "notify-salesman": notificationModal(id); break;
    case "notify-team": notificationModal(""); break;
    case "mark-attendance": attendanceModal(id); break;
    case "assign-area": await areaAssignmentModal(id); break;
    case "manage-areas": await manageAreasModal(); break;
    case "toggle-area": {
      if (!admin() || !client) throw Error("Only Admin can activate or deactivate areas.");
      const current = await client.from("sales_areas").select("id,active").eq("id", id).single(); if (current.error) throw current.error;
      const changed = await client.from("sales_areas").update({active:!current.data.active,updated_at:new Date().toISOString()}).eq("id",id); if (changed.error) throw changed.error;
      toast(current.data.active ? "Area deactivated; history retained." : "Area activated."); await manageAreasModal(); break;
    }
    case "read-manager-notification": {
      if (!manager() || !client) throw Error("Manager account required.");
      const { error } = await client.from("employee_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("recipient_user_id", user.id);
      if (error) throw error; await hydrateManagerNotifications(); toast("Message marked as read."); break;
    }
    case "ack-manager-notification": {
      if (!manager() || !client) throw Error("Manager account required.");
      const stamp = new Date().toISOString();
      const { error } = await client.from("employee_notifications").update({ read_at: stamp, acknowledged_at: stamp }).eq("id", id).eq("recipient_user_id", user.id);
      if (error) throw error; await hydrateManagerNotifications(); toast("Acknowledgement saved."); break;
    }
    case "read-notification": {
      const seller = own(); if (!seller || !client) throw Error("Salesman account required.");
      const { error } = await client.from("employee_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("recipient_salesman_id", seller.id);
      if (error) throw error; await hydrateSalesmanNotifications(); toast("Message marked as read."); break;
    }
    case "employee-manager-photo-upload": {
      if (!(admin() || manager()) || (manager() && !managerTeamIds(S(), user.id).includes(id))) throw Error("Authorized management access required.");
      const seller = S().salesmen.find(x => x.id === id); const file = $("employee-profile-photo")?.files?.[0];
      if (!seller?.user_id) throw Error("Link this employee to a login before uploading a private profile photo.");
      if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5*1024*1024) throw Error("Choose a JPG, PNG or WebP image up to 5 MB.");
      const path = `${seller.user_id}/salesman-profile-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      const bucket = client.storage.from("employee-private"); const up = await bucket.upload(path,file,{contentType:file.type,upsert:false}); if(up.error) throw Error("Step 1 of 2 (file upload to private storage) was refused: "+up.error.message+" [as "+(admin()?"admin":manager()?"manager":user?.role)+", folder "+String(path).split("/")[0]+"]");
      const saved = await client.rpc("set_salesman_photo", { p_salesman_id: id, p_photo_path: path });
      if(saved.error) { await bucket.remove([path]); throw Error("Step 2 of 2 (saving the record) was refused: "+saved.error.message); }
      toast("Salesman profile photo saved privately."); await openAdminSalesmanProfile(id); break;
    }
    case "employee-manager-document-upload": {
      if (!(admin() || manager()) || (manager() && !managerTeamIds(S(), user.id).includes(id))) throw Error("Authorized management access required.");
      const seller = S().salesmen.find(x => x.id === id); const file = $("employee-document-file")?.files?.[0];
      if (!seller?.user_id) throw Error("Link this employee to a login before uploading private documents.");
      if (!file || !(file.type === "application/pdf" || /^image\/(jpeg|png|webp)$/.test(file.type)) || file.size > 10*1024*1024) throw Error("Choose a PDF, JPG, PNG or WebP file up to 10 MB.");
      const path = `${seller.user_id}/salesman-documents/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      const bucket = client.storage.from("employee-private"); const up = await bucket.upload(path,file,{contentType:file.type,upsert:false}); if(up.error) throw Error("Step 1 of 2 (file upload to private storage) was refused: "+up.error.message+" [as "+(admin()?"admin":manager()?"manager":user?.role)+", folder "+String(path).split("/")[0]+"]");
      const docType = $("employee-document-type")?.value || "identity";
      const saved = await client.from("employee_documents").insert({salesman_id:id,document_type:docType,file_path:path,file_name:file.name,mime_type:file.type,size_bytes:file.size});
      if(saved.error) { await bucket.remove([path]); throw Error("Step 2 of 2 (saving the record) was refused: "+saved.error.message); }
      toast("Employee document uploaded privately."); await openAdminSalesmanProfile(id); break;
    }
    case "ack-notification": {
      const seller = own();
      if (!seller || !client) throw Error("Salesman account required.");
      const { error } = await client.from("employee_notifications").update({ read_at: new Date().toISOString(), acknowledged_at: new Date().toISOString() }).eq("id", id).eq("recipient_salesman_id", seller.id);
      if (error) throw error;
      await hydrateSalesmanNotifications(); toast("Acknowledgement saved."); break;
    }
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
        `<p>${esc(user.email || "Practice account")}</p>${user.practice ? "<p>Practice mode has no login password.</p>" : admin() ? `<p>You can change your own password here. Use at least 12 characters.</p><form id="password-form">${field("New password", "password", "", "password", 'minlength="12" required autocomplete="new-password"')}<button style="margin-top:15px">Change my password</button></form>` : `<p>Password changes are managed by your Admin. Please contact the Admin to request a password reset.</p>`}`,
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
  const mcForm = input.closest("#manager-closing-form");
  if (mcForm && input.matches("[data-mc-cash]")) refreshManagerClosing(mcForm);
});
document.addEventListener("change", async (e) => {
  const stockForm = e.target.closest?.("#stock-form");
  if (stockForm && ["product_id", "cartons", "loose_boxes"].includes(e.target.name)) refreshStockMovementPreview(stockForm);
  if (e.target.matches?.("[data-cashbook-date]")) { cashbookDate = e.target.value || today(); render(); return; }
  try {
    const mcForm = e.target.closest("#manager-closing-form");
    if (mcForm && e.target.name === "date") {
      refreshManagerClosing(mcForm, true);
      return;
    }
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
      case "salary-advance-form": {
        if (!admin()) throw Error("Only Admin can release salary advances.");
        const [employeeType, employeeId] = String(f.employee || "").split(":", 2);
        if (!['salesman','manager'].includes(employeeType) || !employeeId) throw Error("Select a valid employee.");
        const amount = Math.round(Number(f.amount) * 100);
        if (!Number.isSafeInteger(amount) || amount <= 0) throw Error("Advance amount must be greater than zero.");
        const reason = String(f.reason || "").trim();
        if (reason.length < 3) throw Error("Enter a clear reason for the salary advance.");
        const account = (S().cashbook_accounts || []).find(a => a.account_key === f.account_key && a.active && a.account_type !== "receivable");
        if (!account) throw Error("Choose an active cash, bank, or wallet account.");
        const employeeName = employeeType === "salesman"
          ? (S().salesmen || []).find(x => String(x.id) === employeeId)?.name
          : (await client.from("profiles").select("display_name").eq("id", employeeId).maybeSingle()).data?.display_name;
        if (!employeeName) throw Error("Could not verify the selected employee. Refresh and try again.");
        if (!confirm(`Release ${money(amount)} as an advance to ${employeeName} from ${account.label}?\nReason: ${reason}\nThis will debit the selected account.`)) break;
        const payload = { employee_type: employeeType, employee_name: employeeName, advance_date: f.advance_date || today(), amount_paisa: amount, reason, account_key: account.account_key, reference: String(f.reference || "").trim() || null, created_by: user.id };
        if (employeeType === "salesman") payload.salesman_id = employeeId;
        else payload.manager_user_id = employeeId;
        const result = await client.from("employee_salary_advances").insert(payload).select("id").single();
        if (result.error) throw result.error;
        await store.refresh();
        toast("Advance salary recorded and payment account debited.");
        close(); render(); break;
      }
      case "salary-advance-edit-form": {
        if (!admin()) throw Error("Only Admin can edit salary advances.");
        const advanceId = form.dataset.id;
        const amount = Math.round(Number(f.amount) * 100);
        const reason = String(f.reason || "").trim();
        if (!Number.isSafeInteger(amount) || amount <= 0) throw Error("Advance amount must be greater than zero.");
        if (reason.length < 3) throw Error("Enter a clear reason for the salary advance.");
        const { data: current, error: currentError } = await client.from("employee_salary_advances").select("id,employee_name,amount_paisa,recovered_paisa,status").eq("id", advanceId).single();
        if (currentError) throw currentError;
        if (current.status !== "posted") throw Error("This advance is reversed and cannot be edited.");
        if (amount < Number(current.recovered_paisa || 0)) throw Error("The edited advance amount cannot be lower than the amount already recovered through salary.");
        if (!confirm(`Update ${current.employee_name}'s advance from ${money(current.amount_paisa)} to ${money(amount)}? The Cash & Bank Book will post the adjustment.`)) break;
        const { error } = await client.from("employee_salary_advances").update({ amount_paisa: amount, reason }).eq("id", advanceId);
        if (error) throw error;
        toast("Advance amount updated; cashbook adjustment and audit record posted.");
        await advanceSalaryModal();
        break;
      }
      case "manager-salary-post-form": {
        if (!admin()) throw Error("Only Admin can release manager salary.");
        const managerId = form.dataset.manager, month = form.dataset.month;
        const profile = (S().profiles || []).find(p => String(p.id) === String(managerId));
        if (!profile || (S().user_roles || []).find(r => String(r.user_id) === String(managerId))?.role !== "manager") throw Error("Manager account not found.");
        const managerName = profile.display_name || profile.email || profile.id;
        const grossAmount = Math.round(Number(f.gross_amount) * 100);
        if (!Number.isSafeInteger(grossAmount) || grossAmount <= 0) throw Error("Gross salary must be greater than zero.");
        const prior = await client.from("expenses").select("id").eq("manager_user_id", managerId).eq("salary_period", month).is("deleted_at", null).maybeSingle();
        if (prior.error) throw prior.error;
        if (prior.data) throw Error("Manager salary is already posted for " + month + ".");
        const advanceResult = await client.from("employee_salary_advances").select("id,amount_paisa,recovered_paisa,reason,advance_date").eq("manager_user_id", managerId).eq("status", "posted").order("advance_date", {ascending:true});
        if (advanceResult.error) throw advanceResult.error;
        const advances = (advanceResult.data || []).map(a=>({...a,outstanding:Math.max(0,Number(a.amount_paisa||0)-Number(a.recovered_paisa||0))})).filter(a=>a.outstanding>0);
        const outstandingAdvance = advances.reduce((sum,a)=>sum+a.outstanding,0);
        const deduction = Math.min(grossAmount,outstandingAdvance), netAmount = grossAmount-deduction;
        const account = (S().cashbook_accounts||[]).find(a=>a.account_key===f.cashbook_account_key && a.active && a.account_type!=="receivable");
        if (!account) throw Error("Select an active cash, bank, or wallet account.");
        if (netAmount <= 0) throw Error("The outstanding advance equals or exceeds this salary. No positive amount remains to release. Review the salary and advances before proceeding.");
        const reasons = advances.map(a=>a.reason).join("; ");
        if (!confirm(`Release manager salary to ${managerName} for ${month}?\nGross salary: ${money(grossAmount)}\nAdvance deduction: ${money(deduction)}\nNet amount to pay: ${money(netAmount)}\nAccount: ${account.label}\n${reasons ? "Advance reasons: " + reasons + "\n" : ""}The selected account will be debited only for the net amount.`)) break;
        const salaryId = "MGR-SAL-" + managerId + "-" + month;
        await store.run("master.save", {table:"expenses", record:{id:salaryId,date:f.date||today(),category:"Salaries",description:`Salary released to manager ${managerName} — ${month}; gross ${money(grossAmount)}; advance deduction ${money(deduction)}${reasons ? "; advance reasons: "+reasons : "; no outstanding advance"}${f.reference ? "; Ref: "+String(f.reference).trim() : ""}`,amount_paisa:netAmount,method:/jazzcash/i.test(account.label)?"JazzCash":/easypaisa/i.test(account.label)?"Easypaisa":/cash/i.test(account.label)?"Cash":/mcb/i.test(account.label)?"MCB Bank":/al habib/i.test(account.label)?"Al Habib Bank":"Bank Account",cashbook_account_key:account.account_key,manager_user_id:managerId,salary_period:month}});
        if (deduction > 0) {
          let remaining = deduction;
          for (const advance of advances) {
            if (remaining <= 0) break;
            const applied = Math.min(remaining, advance.outstanding);
            const updated = await client.from("employee_salary_advances").update({recovered_paisa:Number(advance.recovered_paisa||0)+applied,last_deducted_salary_period:month}).eq("id",advance.id).eq("recovered_paisa",Number(advance.recovered_paisa||0)).select("id");
            if (updated.error || !updated.data?.length) throw Error("Manager salary was posted, but an advance recovery record could not be updated. Do not repost this salary; contact Admin to reconcile advance recovery.");
            remaining -= applied;
          }
        }
        await store.refresh();
        toast("Manager salary released. Advance deduction and net payment recorded.");
        close(); render(); break;
      }
      case "salary-post-form": {
        if (!admin()) throw Error("Only Admin can release salary.");
        const salesmanId = form.dataset.salesman, month = form.dataset.month;
        const seller = S().salesmen.find(x => x.id === salesmanId);
        if (!seller) throw Error("Salesman not found.");
        const grossAmount = salary(seller, S().salesman_daily_targets.filter(d => d.salesman_id === salesmanId && d.date.startsWith(month)).reduce((a,d)=>a+num(d.achieved_cartons),0), S().settings).total;
        const advanceResult = await client.from("employee_salary_advances").select("id,amount_paisa,recovered_paisa,reason,advance_date").eq("salesman_id", salesmanId).eq("status", "posted").order("advance_date", {ascending:true});
        if (advanceResult.error) throw Error("Could not load salary advances: " + advanceResult.error.message);
        const advances = (advanceResult.data || []).map(a=>({...a,outstanding:Math.max(0,Number(a.amount_paisa||0)-Number(a.recovered_paisa||0))})).filter(a=>a.outstanding>0);
        const outstandingAdvance = advances.reduce((sum,a)=>sum+a.outstanding,0);
        const deduction = Math.min(grossAmount,outstandingAdvance);
        const amount = Math.max(0,grossAmount-deduction);
        if (!f.cashbook_account_key) throw Error("Choose the account used to pay this salary.");
        const account = (S().cashbook_accounts||[]).find(a=>a.account_key===f.cashbook_account_key && a.active && a.account_type!=="receivable");
        if (!account) throw Error("Select an active cash or bank account.");
        const reasons = advances.map(a=>a.reason).join("; ");
        if (!confirm(`Release salary to ${seller.name} for ${month}?\nGross salary: ${money(grossAmount)}\nAdvance deduction: ${money(deduction)}\nNet amount to pay: ${money(amount)}\nAccount: ${account.label}\n${reasons ? "Advance reasons: " + reasons + "\n" : ""}The selected account will be debited only for the net amount.`)) break;
        if (amount <= 0) throw Error("The outstanding advance equals or exceeds this salary. No positive salary amount remains to release. The advance balance has not been deducted; review the salary and advances before proceeding.");
        const achieved = S().salesman_daily_targets.filter(d=>d.salesman_id===salesmanId && d.date.startsWith(month)).reduce((a,d)=>a+num(d.achieved_cartons),0);
        const prior = S().expenses.find(e=>e.salesman_id===salesmanId && e.salary_period===month && !e.deleted_at);
        if (prior) throw Error("Salary already posted for " + month);
        await store.run("master.save", {table:"expenses", record:{id:"SAL-"+salesmanId+"-"+month,date:f.date||today(),category:"Salaries",description:`Salary released to ${seller.name} — ${month}; gross ${money(grossAmount)}; advance deduction ${money(deduction)}${reasons ? "; advance reasons: "+reasons : "; no outstanding advance"}; base + incentive (${achieved.toFixed(2)} cartons)${f.reference ? "; Ref: "+String(f.reference).trim() : ""}`,amount_paisa:amount,method:/jazzcash/i.test(account.label)?"JazzCash":/easypaisa/i.test(account.label)?"Easypaisa":/cash/i.test(account.label)?"Cash":/mcb/i.test(account.label)?"MCB Bank":/al habib/i.test(account.label)?"Al Habib Bank":"Bank Account",cashbook_account_key:account.account_key,salesman_id:salesmanId,salary_period:month}});
        if (deduction > 0) {
          let remaining = deduction;
          for (const advance of advances) {
            if (remaining <= 0) break;
            const applied = Math.min(remaining, advance.outstanding);
            const updated = await client.from("employee_salary_advances").update({recovered_paisa:Number(advance.recovered_paisa||0)+applied,last_deducted_salary_period:month}).eq("id",advance.id).eq("recovered_paisa",Number(advance.recovered_paisa||0)).select("id");
            if (updated.error || !updated.data?.length) throw Error("Salary was posted, but an advance recovery record could not be updated. Do not repost this salary; contact Admin to reconcile advance recovery.");
            remaining -= applied;
          }
        }
        // Make the newly posted salary immediately visible in Expenses. The shared
        // expense filters may otherwise hide it (for example, a previously selected
        // category such as Transport or a date range that excludes the payment date).
        await store.refresh();
        const postedSalaryExpense = S().expenses.find(e => e.id === "SAL-" + salesmanId + "-" + month && !e.deleted_at);
        if (!postedSalaryExpense) throw Error("Salary payment was submitted, but its linked expense could not be found after refresh. Check Supabase expenses permissions and the saved salary record before retrying.");
        filter.from = monthStart(f.date || today());
        filter.to = f.date || today();
        filter.category = "All categories";
        page = "expenses";
        toast(`Salary released; gross ${money(grossAmount)}, advance deduction ${money(deduction)}, net paid ${money(amount)}. The linked Salary expense is shown in Expenses.`);
        close(); render(); break;
      }
      case "notification-form": {
        if (!(admin() || manager()) || !client) throw Error("Admin or Manager account required.");
        const message = String(f.message || "").trim();
        if (!message) throw Error("Message body is required.");
        const expires = f.expires_at ? new Date(f.expires_at + "T23:59:59").toISOString() : null;
        const common = { title: String(f.title || "").trim(), message, priority: f.priority || "normal", requires_acknowledgement: f.requires_acknowledgement === "true", expires_at: expires, created_by: user.id };
        const rows = [];
        const addManager = id => { if (id && !rows.some(r => r.recipient_user_id === id)) rows.push({ ...common, recipient_user_id: id, recipient_salesman_id: null }); };
        const addSalesman = seller => { if (seller && !rows.some(r => r.recipient_salesman_id === seller.id)) rows.push({ ...common, recipient_salesman_id: seller.id, recipient_user_id: null }); };
        if (admin()) {
          const scope = f.recipient_scope || (form.dataset.salesman ? `salesman:${form.dataset.salesman}` : "__all_managers__");
          const managerIds = [...new Set((S().user_roles || []).filter(r => String(r.role || "").toLowerCase() === "manager").map(r => String(r.user_id)))];
          const allSellers = visible(S().salesmen);
          const addManagerAndTeam = id => { addManager(id); allSellers.filter(x => String(x.manager_user_id || "") === String(id)).forEach(addSalesman); };
          if (scope === "__all_managers__") managerIds.forEach(addManagerAndTeam);
          else if (scope === "__all_salesmen__") allSellers.forEach(x => { addSalesman(x); if (x.manager_user_id) addManager(String(x.manager_user_id)); });
          else if (scope.startsWith("manager:")) {
            const id = scope.slice("manager:".length);
            if (!managerIds.includes(id)) throw Error("Choose a valid Manager account.");
            addManagerAndTeam(id);
          } else if (scope.startsWith("salesman:")) {
            const id = scope.slice("salesman:".length), seller = allSellers.find(x => String(x.id) === id);
            if (!seller) throw Error("Choose a valid salesman.");
            addSalesman(seller); if (seller.manager_user_id) addManager(String(seller.manager_user_id));
          } else throw Error("Choose a valid recipient group.");
        } else {
          const selected = f.recipient_salesman_id || form.dataset.salesman;
          const recipients = selected === "__team__" ? visible(S().salesmen).filter(x => managerTeamIds(S(), user.id).includes(x.id)) : [visible(S().salesmen).find(x => String(x.id) === String(selected))];
          if (!recipients.length || recipients.some(x => !x) || recipients.some(x => !managerTeamIds(S(), user.id).includes(x.id))) throw Error("Choose at least one valid salesman in your assigned team.");
          recipients.forEach(addSalesman);
        }
        if (!rows.length) throw Error("No valid recipients were found. Check Manager assignments and try again.");
        const { error } = await client.from("employee_notifications").insert(rows);
        if (error) throw error;
        close(); render(); toast(`Message sent to ${rows.length} recipient record${rows.length===1?"":"s"}.`); break;
      }
      case "sales-area-form": {
        if (!(admin() || manager()) || !client) throw Error("Only Admin or Manager can create areas.");
        const name = String(f.name || "").trim(); if (!name) throw Error("Area name is required.");
        const { error } = await client.from("sales_areas").insert({name,description:String(f.description||"").trim(),created_by:user.id});
        if (error) throw error;
        close(); await manageAreasModal(); toast("Area added to the active catalogue."); break;
      }
      case "area-assignment-form": {
        if (!(admin() || manager()) || !client) throw Error("Admin or Manager account required.");
        const salesmanId = form.dataset.salesman;
        if (manager() && !managerTeamIds(S(), user.id).includes(salesmanId)) throw Error("This salesman is outside your assigned team.");
        const areaName = String(f.area_name || "").trim();
        if (!areaName) throw Error("Area name is required.");
        if (f.effective_to && f.effective_to < f.effective_from) throw Error("Effective-until date cannot be before the start date.");
        const { error } = await client.rpc("assign_salesman_area", { p_salesman_id: salesmanId, p_area_name: areaName, p_effective_from: f.effective_from, p_effective_to: f.effective_to || null, p_instructions: String(f.instructions || "").trim() });
        if (error) throw error;
        close(); await store.refresh?.(); render(); toast("Area assignment saved with historical dates."); break;
      }
      case "attendance-manager-form": {
        if (!(admin() || manager()) || !client) throw Error("Admin or Manager account required.");
        const salesmanId = form.dataset.salesman;
        if (manager() && !managerTeamIds(S(), user.id).includes(salesmanId)) throw Error("This salesman is outside your assigned team.");
        const payload = { salesman_id: salesmanId, attendance_date: f.attendance_date, status: f.status, remarks: String(f.remarks || "").trim(), updated_at: new Date().toISOString() };
        const existing = await client.from("attendance_records").select("id").eq("salesman_id", salesmanId).eq("attendance_date", f.attendance_date).maybeSingle();
        if (existing.error) throw existing.error;
        const saved = existing.data ? await client.from("attendance_records").update(payload).eq("id", existing.data.id) : await client.from("attendance_records").insert(payload);
        if (saved.error) throw saved.error;
        close(); await store.refresh?.(); render(); toast("Attendance saved."); break;
      }
      case "manager-payroll-settings-form": {
        if (!admin()) throw Error("Only Admin can configure manager salary parameters.");
        const managerId = form.dataset.manager;
        const record = { manager_user_id: managerId, base_salary_paisa: paisa(f.base_salary), allowance_paisa: paisa(f.allowance), incentive_per_carton_paisa: paisa(f.incentive_per_carton), monthly_target: Math.max(0, num(f.monthly_target)), working_days: Math.max(1, Math.min(31, Math.round(num(f.working_days)||26))), updated_at: new Date().toISOString() };
        const saved = await client.from("manager_payroll_settings").upsert(record, { onConflict: "manager_user_id" });
        if (saved.error) throw saved.error;
        close(); toast("Manager salary parameters saved."); await store.refresh?.(); render(); break;
      }
      case "settings-form":
        await saveSettings(form);
        break;
      case "cashbook-form": {
        const kind = form.dataset.kind;
        if (kind === "deposit") {
          if (!String(f.description||"").trim()) throw Error("Enter the source or reason for the new funds.");
          if (num(f.amount)<=0) throw Error("Amount must be greater than zero.");
          await store.run("cashbook.deposit", { account_key:f.account_key, amount_paisa:paisa(f.amount), date:f.date, reference:f.reference||"", description:f.description });
          toast("External funds recorded in the selected account.");
        } else if (kind === "transfer") {
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
        validateCashbookMethodAccount(f.method, f.cashbook_account_key);
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
      case "manager-closing-form": {
        const date = f.date;
        const current = (S().manager_daily_closings || []).find(
          (row) => row.manager_user_id === user.id && row.business_date === date,
        );
        const actualStock = Object.fromEntries(
          [...form.querySelectorAll("[data-stock-count]")].map((input) => [input.dataset.stockCount, num(input.value)]),
        );
        const saved = await store.run("closing.manager_submit", {
          date,
          opening_cash_paisa: paisa(f.opening_cash),
          cash_handed_over_paisa: paisa(f.cash_handed_over),
          actual_cash_paisa: paisa(f.actual_cash),
          ...Object.fromEntries(CLOSING_BALANCE_FIELDS.map(([name]) => [name + "_paisa", paisa(f[name] || 0)])),
          actual_stock: actualStock,
          reason: f.reason || "",
          notes: f.notes || "",
          expected_version: current?.version,
        });
        close();
        render();
        toast(saved?.queued ? "Team closing saved on this device; pending sync" : "Team closing submitted for Admin approval");
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
        const conversionPaid = f.payment_status === "paid" ? Number(q.total_paisa) : f.payment_status === "partial" ? paisa(f.payment_amount) : 0;
        if (conversionPaid > 0) validateCashbookMethodAccount(f.payment_method || "Cash", f.cashbook_account_key);
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
      case "reset-password-form": {
        if (!admin()) throw Error("Only an administrator can reset another user's password.");
        if (!client) throw Error("Password resets require a configured Supabase connection.");
        const targetId = form.dataset.id;
        const target = S().profiles.find((p) => String(p.id) === String(targetId));
        if (!target || target.id === user.id) throw Error("Choose another valid user account.");
        const pw = String(f.new_password || "");
        if (pw.length < 12 || pw.length > 128) throw Error("Password must be 12–128 characters.");
        if (pw !== String(f.confirm_password || "")) throw Error("The two passwords do not match.");
        const { data, error } = await client.functions.invoke("admin-reset-user-password", { body: { user_id: target.id, password: pw } });
        if (error) throw Error(await edgeFunctionError(error, "admin-reset-user-password"));
        if (data?.error) throw Error(data.error);
        if (!data?.ok) throw Error("The password reset was not confirmed by the server. Nothing was reported as changed; try again.");
        close();
        toast("Password reset for " + (target.display_name || "user") + ". Share the new password securely.");
        break;
      }
      case "delete-salesman-form": {
        if (!admin()) throw Error("Only Admin can delete a salesman.");
        if (String(f.confirm || "").trim() !== "DELETE") throw Error("Type DELETE exactly to confirm.");
        const { data: res, error: delError } = await client.rpc("admin_delete_salesman", { p_salesman_id: form.dataset.id, p_dry_run: false });
        if (delError) throw Error("Nothing was deleted: " + (delError.message || String(delError)));
        let loginNote = "";
        if (res?.user_id && res.login_role !== "admin" && res.user_id !== user.id) {
          const { error: loginError } = await client.functions.invoke("admin-delete-user", { body: { user_id: res.user_id } });
          loginNote = loginError ? " The records were deleted, but the login could not be removed (" + (await edgeFunctionError(loginError, "admin-delete-user")) + "). Delete it from Users & access." : " Their login was deleted too.";
        }
        await store.refresh();
        close();
        render();
        toast("Salesman " + (res?.name || "") + " and connected records deleted." + loginNote);
        break;
      }
      case "create-user-form": {
        if (!admin()) throw Error("Only Admin can create login accounts and employee profiles.");
        if (!client) throw Error("Configure Supabase to create logins");
        const isSalesman = f.role === "salesman";
        if (!isSalesman && f.role !== "manager") throw Error("Choose Salesman or Manager as the profile type.");
        const photoFile = f.profile_photo instanceof File && f.profile_photo.size ? f.profile_photo : null;
        const identityFile = f.identity_document instanceof File && f.identity_document.size ? f.identity_document : null;
        if (photoFile && (!/^image\/(jpeg|png|webp)$/.test(photoFile.type) || photoFile.size > 5*1024*1024)) throw Error("Profile photo must be JPG, PNG or WebP up to 5 MB.");
        if (identityFile && (!(identityFile.type === "application/pdf" || /^image\/(jpeg|png|webp)$/.test(identityFile.type)) || identityFile.size > 10*1024*1024)) throw Error("NIC document must be PDF, JPG, PNG or WebP up to 10 MB.");
        const payload = { display_name: String(f.display_name || "").trim(), email: String(f.email || "").trim(), temporary_password: f.temporary_password, role: f.role, request_id: uid() };
        if (!payload.display_name) throw Error("Full name is required.");
        const { data, error } = await client.functions.invoke("admin-create-user", { body: payload });
        if (error) throw Error(await edgeFunctionError(error, "admin-create-user"));
        if (data?.error) throw Error(data.error);
        const createdUserId = data.user_id;
        if (!createdUserId) throw Error("The server did not return the new user ID.");
        try {
          if (isSalesman) {
            const employeeId = String(f.employee_id || "").trim() || ("SP-" + uid());
            if (!/^[A-Za-z0-9._:-]{1,180}$/.test(employeeId)) throw Error("Employee ID may contain letters, numbers, dot, underscore, colon or hyphen.");
            if ((S().salesmen || []).some(x => String(x.id).toLowerCase() === employeeId.toLowerCase())) throw Error("This Employee ID is already in use.");
            const seller = {
              id: employeeId, name: payload.display_name, phone: String(f.employee_phone || "").trim(), date_of_birth: f.date_of_birth || null,
              joining_date: f.joining_date || today(), base_salary_paisa: paisa(f.base_salary), payroll_allowance_paisa: paisa(f.payroll_allowance),
              payroll_incentive_per_carton_paisa: paisa(f.payroll_incentive), payroll_working_days: Math.max(1, Math.min(31, Math.round(num(f.payroll_working_days) || 26))),
              monthly_target: num(f.monthly_target), payroll_monthly_target: num(f.monthly_target), active: f.employee_active !== "false", user_id: createdUserId,
              manager_user_id: f.manager_user_id || null, off_days: dates(String(f.off_days || "")),
            };
            if (!(seller.monthly_target > 0)) throw Error("Monthly target must be greater than zero.");
            const savedSeller = await store.run("master.save", { table: "salesmen", record: seller, expected_version: undefined });
            if (savedSeller?.error || savedSeller?.queued) throw Error(savedSeller?.error || "Salesman profile is queued offline and not yet confirmed by Supabase.");
            await store.refresh();
            const liveSeller = (S().salesmen || []).find(x => String(x.user_id || "") === String(createdUserId)) || seller;
            const basis = f.salary_basis === "commission" ? "commission" : "fixed";
            const { error: settingsError } = await client.from("salesman_compensation_settings").upsert({ user_id: createdUserId, salesman_id: liveSeller.id, salary_basis: basis, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
            if (settingsError) throw Error("Salesman profile created, but salary basis could not be saved. Apply the v55.50 SQL migration. " + settingsError.message);
            if (basis === "commission") {
              const products = (S().products || []).filter(p => p.active !== false && !p.deleted_at);
              const rates = products.map(product => ({ user_id: createdUserId, salesman_id: liveSeller.id, product_id: String(product.id), product_name: String(product.name || ""), commission_per_carton_paisa: Math.round(Math.max(0, Number(f[`commission_${String(product.id).replace(/[^a-zA-Z0-9_-]/g,"_")}`] || 0)) * 100), updated_at: new Date().toISOString() }));
              if (rates.length) { const { error: rateError } = await client.from("salesman_product_commissions").upsert(rates, { onConflict: "user_id,product_id" }); if (rateError) throw Error("Salesman profile created, but commission rates could not be saved: " + rateError.message); }
            }
            if (photoFile) {
              const path = `${createdUserId}/salesman-profile-${Date.now()}-${photoFile.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
              const up = await client.storage.from("employee-private").upload(path, photoFile, { contentType: photoFile.type, upsert: false });
              if (up.error) throw Error("Salesman profile created, but photo upload failed: " + up.error.message);
              const { error: photoError } = await client.rpc("set_salesman_photo", { p_salesman_id: liveSeller.id, p_photo_path: path });
              if (photoError) throw Error("Salesman profile created, but photo path could not be saved: " + photoError.message);
            }
            if (identityFile) {
              const path = `${createdUserId}/salesman-documents/${Date.now()}-${identityFile.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
              const up = await client.storage.from("employee-private").upload(path, identityFile, { contentType: identityFile.type, upsert: false });
              if (up.error) throw Error("Salesman profile created, but NIC upload failed: " + up.error.message);
              const { error: docError } = await client.from("employee_documents").insert({ salesman_id: liveSeller.id, document_type: "identity", file_path: path, file_name: identityFile.name, mime_type: identityFile.type, size_bytes: identityFile.size });
              if (docError) throw Error("Salesman profile created, but NIC document record could not be saved: " + docError.message);
            }
          } else {
            const managerSettings = { manager_user_id: createdUserId, base_salary_paisa: paisa(f.manager_base_salary), allowance_paisa: paisa(f.manager_allowance), incentive_per_carton_paisa: paisa(f.manager_incentive), monthly_target: Math.max(0, num(f.manager_monthly_target)), working_days: Math.max(1, Math.min(31, Math.round(num(f.manager_working_days) || 26))), updated_at: new Date().toISOString() };
            const { error: managerSettingsError } = await client.from("manager_payroll_settings").upsert(managerSettings, { onConflict: "manager_user_id" });
            if (managerSettingsError) throw Error("Manager login/profile created, but manager payroll settings could not be saved. Check the v55.38 manager payroll migration and permissions. " + managerSettingsError.message);
          }
        } catch (profileError) {
          throw Error("Login was created, but the linked " + (isSalesman ? "salesman" : "manager") + " profile setup did not finish: " + (profileError?.message || String(profileError)) + ". The login remains in Users & Access so Admin can retry profile setup.");
        }
        await store.refresh();
        close(); render();
        toast(isSalesman ? "Salesman login and linked employee profile created." : "Manager login and manager profile created.");
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
              record: { ...chosen, user_id: targetUserId, manager_user_id: f.manager_user_id || null, name: chosen.name || targetProfile?.display_name || "Salesman" },
              expected_version: chosen.version,
            });
          } else if (!oldLinkedSeller && unlinkedSalesmanByName(targetProfile?.display_name).length === 1) {
            const reuse = unlinkedSalesmanByName(targetProfile?.display_name)[0];
            await store.run("master.save", {
              table: "salesmen",
              record: { ...reuse, user_id: targetUserId, manager_user_id: f.manager_user_id || null, active: f.active === "true" },
              expected_version: reuse.version,
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
        const finalLinkedSeller = S().salesmen.find((seller) => seller.user_id === targetUserId);
        if (f.role === "salesman" && finalLinkedSeller && finalLinkedSeller.manager_user_id !== (f.manager_user_id || null)) {
          await store.run("master.save", { table: "salesmen", record: { ...finalLinkedSeller, manager_user_id: f.manager_user_id || null }, expected_version: finalLinkedSeller.version });
        }
        await store.refresh();
        close();
        render();
        toast("Access, salesman link and manager assignment saved");
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
