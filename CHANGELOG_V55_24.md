# v55.24 — Market Credit Receivables History Isolation

- Added a final allow-list filter to the Market Credit transaction history: only confirmed invoice receivables and non-voided payments linked to those invoices can appear.
- Legacy or mis-keyed bank, wallet, cash, expense, transfer, and unrelated ledger rows are excluded from this view.
- Bumped the service-worker cache version to force clients to reload the corrected JavaScript instead of serving stale cached code.
- Existing business records are not modified by this UI-only change.

Live Supabase behavior still requires staging verification.
