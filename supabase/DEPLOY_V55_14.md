# Blesscon Candy Business Manager v55.14 — Salesman Profile Only

## Included
- Salesman logins now have only **My profile** in the sidebar. Sales orders, Cash & Bank Book, Invoices & Payments, Quotations, Customer Ledger, Stock & Expiry, Products & Pricing, Salesmen & Targets, Expenses, Profit & Loss, Import/Export, Settings, Users & Access and Audit Trail are not available in the salesman navigation.
- Salesman logins always open their own profile even if a shared browser remembers a management module from a prior login.
- The profile includes profile photo, date of birth, assigned area, manager-uploaded documents, daily stock issued/returned/sold and closing stock, current stock in hand, monthly boxes sold, monthly target achievement and salary estimate.
- Salary achievement for estimates is now calculated from confirmed sales order line quantities: boxes divided by the corresponding product line's boxes-per-carton. The configured incentive thresholds and any already-posted salary remain authoritative.

## Deploy
1. Back up the Supabase database.
2. In Supabase Dashboard → SQL Editor → New query, run the complete file `supabase/salesman_profile_only_salary_v55_14.sql` as a normal SQL script. Do not paste it into a terminal.
3. Publish the updated `web/` folder to the GitHub Pages repository. If you normally publish the whole project, keep the root and `web/` copies synchronized.
4. Commit and push the website update. Wait for GitHub Pages to finish publishing.
5. Sign in as a salesman and press Ctrl+Shift+R. The only module in the sidebar should be **My profile**.
6. Check that the profile photo and manager-uploaded documents load, select a day in “Stock assigned & sales by day”, and confirm monthly boxes/target and salary estimate.

## Safety and limitations
- This migration does not delete sales, stock, targets, documents or salary records.
- Posted salary amounts remain authoritative; the new sales-based calculation is used for estimates only.
- Target achievement uses carton-equivalent sales, calculated from each order line's stored boxes-per-carton value. The UI also displays the actual number of boxes sold.
- Static JavaScript syntax and feature assertions were checked. The full automated test suite and live Supabase behavior were not run in this environment.
