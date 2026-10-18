# v46 — Manager direct-sale attribution fix

## What changed
- Dashboard looks up each order's linked invoice and reads `invoices.sold_by_user_id` as the sales attribution.
- A manager's direct sales can appear in the manager's own-sales list even if invoice `created_by` is another account.
- Company target breakdown classifies manager-attributed orders as manager-direct cartons, separate from salesman cartons.

## Important data relationship
This patch expects `invoices.order_id` to link to `orders.id`, as in the existing application schema. If an invoice has no linked order, the current order-based dashboard cannot calculate its cartons from `order_items`.

## Validation
Automated tests were not run successfully in this build environment because `vitest` is not installed. Before deployment, run:
1. `npm ci`
2. `npm test`
3. `npm run check`
4. Confirm invoice `INV-2026-0009` is linked to its order and `sold_by_user_id` equals the manager UUID.
5. Verify manager own sales appear while salesman monthly targets do not increase for those direct sales.
