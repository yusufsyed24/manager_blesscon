import { LOGO } from "./brand.js";
import { PDF_FONT } from "./pdf-font.js";
import { esc, money, paymentState } from "./domain.js";
export const DOCUMENT_TEMPLATES = {
  invoice: [
    { id: "classic", label: "Classic" }, { id: "modern", label: "Modern Branded" },
    { id: "minimal", label: "Minimal / Black & White" }, { id: "thermal", label: "Compact Thermal Receipt (80 mm)" },
    { id: "wholesale", label: "Detailed Wholesale" }, { id: "bilingual", label: "Urdu / Bilingual" },
    { id: "challan", label: "Delivery Challan / Packing Slip" }, { id: "statement", label: "Statement of Account" },
  ],
  quote: [
    { id: "classic", label: "Classic" }, { id: "modern", label: "Modern Branded" },
    { id: "minimal", label: "Minimal / Black & White" }, { id: "proforma", label: "Proforma Invoice" },
    { id: "pricelist", label: "Price List / Rate Card" }, { id: "bilingual", label: "Bilingual (English + Urdu)" },
  ],
};
export function documentData(s, id, type = "invoice") {
  const quote = type === "quote";
  const d = s[quote ? "quotations" : "orders"].find((x) => x.id === id);
  if (!d) throw Error("Document not found");
  const invoice = quote ? null : s.invoices.find((x) => x.order_id === d.id);
  return {
    type,
    settings: s.settings,
    document: d,
    invoice,
    customer: s.customers.find((c) => c.id === d.customer_id) || {},
    salesman:
      s.salesmen.find((x) => x.id === d.salesman_id)?.name || "Unassigned",
    items: s[quote ? "quotation_items" : "order_items"].filter(
      (l) => l[quote ? "quotation_id" : "order_id"] === id,
    ),
    payments: quote
      ? []
      : s.payments.filter((p) => p.invoice_id === invoice?.id && !p.voided_at),
  };
}
export function signatures(state, settings, d) {
  if (state.status === "PAID")
    return [
      "Received with thanks.",
      "Authorised signature: " +
        (settings.signature_name || settings.company_name),
    ];
  if (state.status === "PART PAID")
    return [
      "Receiver of goods: ____________________",
      "Company signature: ____________________",
      "Balance due by " + d.due_date,
    ];
  return [
    "Customer acknowledgement: I acknowledge receipt of goods and agree to pay " +
      money(state.balance) +
      " by " +
      d.due_date +
      ".",
    "Customer signature: ____________________",
  ];
}
export function documentHTML(payload, pending = false, template = "classic") {
  const {
    settings: s,
    document: d,
    customer: c,
    items,
    payments,
    salesman,
    type,
  } = payload;
  const quote = type === "quote";
  const tmpl = String(template || "classic");
  const noPrices = tmpl === "challan";
  const thermal = tmpl === "thermal";
  const bilingual = tmpl === "bilingual";
  const state =
    d.status === "cancelled"
      ? { status: "CANCELLED", paid: 0, balance: 0, credit: 0 }
      : paymentState(
          Number(d.total_paisa),
          payments.reduce((a, p) => a + Number(p.amount_paisa), 0),
        );
  const paidDate = [...payments].sort((a, b) => b.date.localeCompare(a.date))[0]
    ?.date;
  const sig =
    d.status === "cancelled"
      ? ["Cancelled invoice — no payment due."]
      : quote
        ? [
            "Accepted by: ____________________",
            "Name / date: ____________________",
          ]
        : signatures(state, s, d);
  const templateStyle = tmpl === "modern" ? "border-top:12px solid #c8a44d;background:linear-gradient(90deg,#12233f 0 100%);color:#fff;padding:14px" : tmpl === "minimal" ? "filter:grayscale(1);background:#fff;color:#111" : thermal ? "width:72mm;max-width:72mm;font-size:10px" : "";
  const documentTitle = tmpl === "proforma" ? "PROFORMA INVOICE" : tmpl === "challan" ? "DELIVERY CHALLAN" : tmpl === "pricelist" ? "PRICE LIST / RATE CARD" : (quote ? "QUOTATION" : "INVOICE");
  const columns = noPrices ? "<th>Product</th><th>Cartons</th><th>Loose</th><th>Boxes</th>" : "<th>Product</th><th>Cartons</th><th>Loose</th><th>Boxes</th><th>Rate / box</th><th>Amount</th>";
  const lineRows = items.map((l) => `<tr><td>${esc(l.product_name)}<small>${esc(l.product_id)}</small></td><td>${l.cartons}</td><td>${l.loose_boxes}</td><td>${l.boxes}</td>${noPrices ? "" : `<td>${money(l.rate_paisa)}</td><td>${money(l.amount_paisa)}</td>`}</tr>`).join("");
  return `<article class="document template-${esc(tmpl)}" style="${templateStyle}" aria-label="${quote ? "Quotation" : "Invoice"} ${esc(d.number)}"><header class="doc-head"><img src="${LOGO}" alt="Blesscon Candy logo"><div><h1>${esc(s.company_name)}</h1><p>${esc(s.address)}<br>${esc(s.phone)} · ${esc(s.email)}<br>${esc(s.website)}${s.ntn ? "<br>NTN: " + esc(s.ntn) : ""}</p></div><div class="doc-title"><h2>${documentTitle}${bilingual ? " / " + (quote ? "کوٹیشن" : "انوائس") : ""}</h2><b>${esc(d.number)}</b><p>Date: ${esc(d.date)}<br>${quote ? "Valid until" : "Due date"}: ${esc(quote ? d.valid_until : d.due_date)}${quote ? "<br>Revision: " + esc(d.revision) : ""}</p></div></header>${pending ? '<p class="notice">PENDING SYNC — provisional document. Await server confirmation before issuing.</p>' : ""}${d.status === "cancelled" ? '<p class="notice danger">CANCELLED — no amount due</p>' : ""}<section class="doc-parties"><div><small>${quote ? "QUOTATION FOR" : "BILL TO"}</small><h3>${esc(c.name)}</h3><p>${esc(c.address)}<br>${esc(c.phone)} ${esc(c.email)}</p></div><div><small>SALESMAN / CHANNEL</small><p>${esc(salesman)}<br>${esc(d.channel)}</p></div></section><table class="doc-lines"><thead><tr>${columns}</tr></thead><tbody>${lineRows}</tbody></table><p class="doc-note">Pricing: ${[...new Set(items.map((l) => l.tier_label))].map(esc).join(", ")}. Rani wholesale tiers use combined Rani cartons, including loose boxes.</p>${noPrices ? `<p>Receiver name: ____________________ &nbsp; Signature: ____________________</p>` : `<section class="doc-summary"><div>${!quote ? `<div class="stamp ${state.status === "PAID" ? "paid" : state.status === "PART PAID" ? "partial" : "unpaid"}">${state.status === "UNPAID" ? "UNPAID / CREDIT SALE" : state.status}</div>${state.status === "PAID" ? "<p>Received with thanks · " + esc(paidDate || d.date) + "</p>" : ""}` : `<p>Status: ${esc(d.status)}</p>`}</div><table><tbody><tr><td>Subtotal</td><td>${money(d.subtotal_paisa)}</td></tr><tr><td>Discount</td><td>${money(d.discount_paisa)}</td></tr><tr class="total"><th>Total</th><th>${money(d.total_paisa)}</th></tr>${!quote ? `<tr><td>Paid</td><td>${money(state.paid)}</td></tr><tr><th>Balance due</th><th>${money(state.balance)}</th></tr>${state.credit ? `<tr><td>Customer credit</td><td>${money(state.credit)}</td></tr>` : ""}` : ""}</tbody></table></section>`}${!quote && payments.length && !noPrices ? `<section><h3>Payment history</h3><table><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>${payments.map((p) => `<tr><td>${esc(p.date)}</td><td>${esc(p.method)}</td><td>${esc(p.reference || "")}</td><td>${money(p.amount_paisa)}</td></tr>`).join("")}</tbody></table></section>` : ""}<section class="doc-terms"><h3>Terms & payment details</h3><p>${esc(d.terms || s.terms).replace(/\n/g, "<br>")}</p>${s.bank_details ? "<p>" + esc(s.bank_details).replace(/\n/g, "<br>") + "</p>" : ""}${d.notes ? "<p>Notes: " + esc(d.notes) + "</p>" : ""}</section><footer class="doc-sign">${sig.map((x) => "<p>" + esc(x) + "</p>").join("")}${!quote && state.status === "PAID" && /^data:image\/(png|jpeg);base64,/.test(s.signature_data || "") ? `<img src="${s.signature_data}" alt="Authorised company signature" style="max-width:160px;max-height:60px">` : ""}<small>Thank you for choosing ${esc(s.company_name)}.</small></footer></article>`;
}
export function makePDF(payload, jsPDF = globalThis.jspdf?.jsPDF, template = "classic") {
  if (!jsPDF) throw Error("PDF library is unavailable; reload once online");
  const {
    settings: s,
    document: d,
    customer: c,
    items,
    payments,
    salesman,
    type,
  } = payload;
  const quote = type === "quote";
  const pdf = new jsPDF({ unit: "mm", format: template === "thermal" ? [80, 220] : template === "challan" ? "a4" : "a4" });
  pdf.addFileToVFS("BlessconSans.ttf", PDF_FONT);
  pdf.addFont("BlessconSans.ttf", "BlessconSans", "normal");
  pdf.setFont("BlessconSans", "normal");
  let y = 18,
    page = 1;
  const text = (value, x = 16, size = 10, width = 178) => {
    pdf.setFontSize(size);
    let lines = pdf.splitTextToSize(
      String(value || "").replace(/[–—]/g, "-"),
      width,
    );
    for (const line of lines) {
      if (y > 276) {
        pdf.addPage();
        page++;
        y = 18;
      }
      pdf.text(line, x, y);
      y += size * 0.46;
    }
    y += 2;
  };
  const need = (h) => {
    if (y + h > 279) {
      pdf.addPage();
      page++;
      y = 18;
    }
  };
  pdf.addImage(LOGO, "JPEG", 15, 12, 28, 28);
  if (template === "minimal") pdf.setTextColor(0, 0, 0); else pdf.setTextColor(18, 35, 63);
  pdf.setFontSize(17);
  pdf.text(s.company_name, 48, 20);
  pdf.setFontSize(9);
  pdf.text(
    [
      s.address || "",
      s.phone + " | " + s.email,
      s.website || "",
      s.ntn ? "NTN: " + s.ntn : "",
    ].filter(Boolean),
    48,
    26,
  );
  y = 49;
  text((template === "proforma" ? "PROFORMA INVOICE" : template === "challan" ? "DELIVERY CHALLAN" : template === "pricelist" ? "PRICE LIST / RATE CARD" : (quote ? "QUOTATION" : "INVOICE")) + "  " + d.number, 16, 16);
  text(
    "Date: " +
      d.date +
      "    " +
      (quote
        ? "Valid until: " + d.valid_until + "    Revision " + d.revision
        : "Due date: " + d.due_date),
  );
  text(
    "Customer: " + c.name + "\n" + (c.address || "") + "\n" + (c.phone || ""),
  );
  text("Salesman: " + salesman + "   |   " + d.channel);
  y += 3;
  const columns = [16, 89, 108, 125, 140, 170];
  const header = () => {
    need(12);
    pdf.setFillColor(18, 35, 63);
    pdf.rect(14, y - 5, 182, 9, "F");
    pdf.setTextColor(255);
    pdf.setFontSize(8);
    ["Product", "Cartons", "Loose", "Boxes", "Rate/box", "Amount"].forEach(
      (x, i) => pdf.text(x, columns[i], y),
    );
    pdf.setTextColor(18, 35, 63);
    y += 9;
  };
  header();
  for (const l of items) {
    const names = pdf.splitTextToSize(l.product_name, 69);
    const h = Math.max(10, names.length * 4 + 5);
    if (y + h > 278) {
      pdf.addPage();
      y = 18;
      header();
    }
    pdf.setFontSize(8);
    pdf.text(names, 16, y);
    [
      l.cartons,
      l.loose_boxes,
      l.boxes,
      money(l.rate_paisa),
      money(l.amount_paisa),
    ].forEach((v, i) => pdf.text(String(v), columns[i + 1], y));
    y += h;
    pdf.setDrawColor(220);
    pdf.line(14, y - 5, 196, y - 5);
  }
  text(
    "Pricing: " +
      [...new Set(items.map((l) => l.tier_label))].join(", ") +
      ". Combined Rani cartons include loose boxes.",
    16,
    8,
  );
  need(45);
  const paid = payments.reduce((a, p) => a + Number(p.amount_paisa), 0),
    state =
      d.status === "cancelled"
        ? { status: "CANCELLED", paid: 0, balance: 0, credit: 0 }
        : paymentState(Number(d.total_paisa), paid);
  text(
    "Subtotal: " +
      money(d.subtotal_paisa) +
      "\nDiscount: " +
      money(d.discount_paisa) +
      "\nTotal: " +
      money(d.total_paisa),
    120,
    11,
    76,
  );
  if (!quote) {
    text(
      "Paid: " +
        money(paid) +
        "\nBalance due: " +
        money(state.balance) +
        (state.credit ? "\nCustomer credit: " + money(state.credit) : ""),
      120,
      10,
      76,
    );
    pdf.setTextColor(
      ...(state.status === "PAID"
        ? [21, 112, 67]
        : state.status === "PART PAID"
          ? [139, 87, 0]
          : [175, 40, 40]),
    );
    need(18);
    pdf.setFontSize(13);
    const stampLabel =
      state.status === "UNPAID" ? "UNPAID / CREDIT SALE" : state.status;
    pdf.setDrawColor(
      ...(state.status === "PAID"
        ? [21, 112, 67]
        : state.status === "PART PAID"
          ? [139, 87, 0]
          : [175, 40, 40]),
    );
    pdf.setLineWidth(0.6);
    pdf.roundedRect(16, y - 6, pdf.getTextWidth(stampLabel) + 10, 11, 1, 1);
    text(stampLabel, 21, 13);
    pdf.setTextColor(18, 35, 63);
    if (state.status === "PAID")
      text(
        "Received with thanks. Paid date: " +
          [...payments].sort((a, b) => b.date.localeCompare(a.date))[0]?.date,
      );
    if (payments.length) {
      text("Payment history", 16, 11);
      payments.forEach((p) =>
        text(
          p.date +
            " | " +
            p.method +
            " | " +
            money(p.amount_paisa) +
            " | " +
            (p.reference || ""),
          16,
          9,
        ),
      );
    }
  }
  text("Terms & payment details", 16, 11);
  text(d.terms || s.terms);
  if (s.bank_details) text(s.bank_details);
  if (d.notes) text("Notes: " + d.notes);
  need(30);
  (d.status === "cancelled"
    ? ["Cancelled invoice - no payment due."]
    : quote
      ? [
          "Accepted by: ____________________",
          "Name / date: ____________________",
        ]
      : signatures(state, s, d)
  ).forEach((t) => text(t));
  if (
    !quote &&
    state.status === "PAID" &&
    /^data:image\/(png|jpeg);base64,/.test(s.signature_data || "")
  ) {
    need(25);
    pdf.addImage(s.signature_data, 16, y, 45, 18);
    y += 20;
  }
  const count = pdf.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(100);
    pdf.text(
      s.company_name + " | " + d.number + " | " + i + " / " + count,
      16,
      290,
    );
  }
  return pdf;
}
export function shareText(p, link = "") {
  const paid = p.payments.reduce((a, x) => a + Number(x.amount_paisa), 0);
  return `${p.settings.company_name}\n${p.type === "quote" ? "Quotation" : "Invoice"} ${p.document.number}\nTotal: ${money(p.document.total_paisa)}${p.type === "quote" ? "" : "\nBalance: " + money(Math.max(0, p.document.total_paisa - paid))}\n${link || "Please download the PDF and attach it to this message."}`;
}
export function whatsappURL(phone, text) {
  let p = String(phone || "").replace(/\D/g, "");
  if (p.startsWith("0")) p = "92" + p.slice(1);
  return "https://wa.me/" + p + "?text=" + encodeURIComponent(text);
}
