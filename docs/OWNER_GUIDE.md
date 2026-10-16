# Blesscon Candy — Owner quick guide

**Start:** Open the HTTPS website and sign in. Check the badge says **Synced**. Practice workspace is for trying the screens only.

1. **Set up once.** Settings holds company details, terms, working days, holidays, targets, salary slabs, stock limits and Rani tier defaults. Products can override the tier rates. Create salesmen in Salesmen & targets, then link their logins in Users & access.
2. **Upload once.** Import & export → choose your workbook → review errors/warnings → Import all pages. Every mapped section is saved together. Re-import uses the same product, invoice and receipt keys.
3. **Make a sale.** Sales orders → New sale. Choose or add the customer, choose salesman/channel, then enter cartons and loose boxes. All Rani lines share the combined-carton tier. Review stock, margin and discount, then Confirm sale. Stock and targets update automatically.
4. **Quote first when needed.** Quotations → New quotation. Save, edit, mark Sent/Accepted, then Convert. Rates stay as quoted unless “Re-price at today's rates” is selected. Conversion is allowed only once. Deleting a draft requires confirmation.
5. **Collect payments.** Invoices & payments → Payment. Record each receipt separately with method, date and reference. The status becomes UNPAID, PART PAID or PAID. View shows the matching stamp/signature block. Overpayments are blocked unless customer credit is enabled.
6. **Send documents.** View → Print, Download PDF, Share PDF, WhatsApp or Email. Attach the downloaded PDF where required. Copy public link creates a 30-day read-only link; Revoke public link removes access.
7. **Watch the business.** Dashboard shows daily/MTD sales, profit, outstanding balances, stock alerts and targets. Customer ledger shows debts and aging. Profit & loss supports dates and a previous-period comparison. Costs saved on each sale protect historical margins.
8. **Close and correct.** Add expenses with receipt images. Check stock movements and expiry. Review daily carry-forward and salary estimates; Post salary adds one expense per salesman/month. Cancellation restores stock and removes the sale from targets/P&L. Void/refund payments first if the order has collections. No bank refund is executed by the app.

**Offline:** Keep pending changes on the same device. Sync before issuing final documents. If a conflict appears, export the pending change, discard that conflicting action, refresh and enter it again. Do not clear browser storage until the badge says Synced.

**Daily habit:** Review collections, outstanding balances, target shortfalls and stock. Export regular backups. Salary projections are base plus earned incentive; advances/deductions are outside this calculator.

## DSR, stock issue and daily closing

- The company monthly target defaults to 2,000 cartons, separately from the default 130-carton target for each salesman. Company progress includes all confirmed sales. Manager/direct sales are shown separately and counted once; a salesperson's cartons still count toward the company goal and that salesperson's own target.
- Create or change the manager login to the **Manager** role in Users & access. It grants company sales/target visibility and closing approvals, but not admin settings, purchase costs or payroll data.
- In the sale form, managers and administrators can choose **Manager / direct sale** instead of a salesman. Use this only for cartons sold directly by management; select a salesman when the sale belongs to that salesperson.
- Run `supabase/operational_modules.sql` after `supabase/schema.sql` before deploying the updated app. Back up the Supabase project and test the migration in staging first.
- In Stock & expiry, issue whole boxes to a salesman. Carton counts are converted using each product's saved boxes-per-carton. Issue references are unique; retries with the same reference and same details do not duplicate stock.
- Record returns as saleable, damaged, expired or other unsaleable. Saleable returns increase warehouse availability. Non-saleable returns reduce total saleable inventory. Sales and returns are append-only movements, not edited balances.
- Daily Sales Report uses confirmed invoice totals for sales and payment dates for collections. Payments allocated to invoices from earlier dates appear as previous recovery and are not revenue. Same-day invoice payments reduce new credit. Product totals allocate invoice discounts across lines.
- Submit each salesman's physical stock and cash count in Daily closing. Expected cash is opening cash + cash-method receipts - cash expenses - amounts handed over. Bank/digital receipts are not physical cash. A reason is mandatory for cash or stock variance. Admins approve/reject; reopening a decided closing requires a reason and is audited.
- The operational migration does not reconstruct prior salesman-held stock. Issue opening stock from the warehouse for location-specific tracking. Existing orders with no corresponding issue remain in the legacy company stock ledger.
- Purchase orders, dispatch/delivery lifecycle, bank/cash transfer ledger, and cash deposits as separate transfer records are not included in this release. Their figures are intentionally not shown as if they existed.
