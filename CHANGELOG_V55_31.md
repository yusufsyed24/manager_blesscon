# v55.31 — Market Credit transaction history

- Market Credit transaction history now includes the full receivable created by each confirmed credit invoice.
- Each non-voided payment against an invoice appears as a negative receivable recovery, labelled with customer, payment method, and receiving account (Cash in Hand, bank, EasyPaisa, JazzCash, or the relevant configured account).
- Rows are retained even after an invoice is fully paid, so history shows both credit raised and the deduction/recovery entries.
- This is a client-side ledger display change; no database migration is required.
