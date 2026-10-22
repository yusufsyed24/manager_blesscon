# v47 — Manager closing cash attribution fix

## Root cause
Manager closing figures selected direct sales only when the order had no salesman and `orders.created_by` matched the manager. A manager-owned sale entered by another account could therefore be omitted, even when its linked invoice had `sold_by_user_id` set to the manager. Any cash receipt attached to that invoice was then omitted from expected closing cash.

## Fix
Manager closing figures now identify manager-direct orders by `orders.created_by`, `orders.sold_by_user_id`, or the linked invoice's `sold_by_user_id`. Collections on the selected invoices then flow into the existing cash-by-method calculation. This does not assign manager-direct sales to a salesman or change salesman monthly targets.

## Validation
JavaScript syntax checks and ZIP integrity check are run for this release. Full automated tests require installing project dependencies (`npm ci`) first.
