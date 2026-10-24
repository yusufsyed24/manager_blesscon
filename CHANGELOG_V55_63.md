# v55.63 — Restore prominent commission-basis selection

- Restored/prominently displayed the salesman salary payment method selector in Admin → Users & Access → Create Login.
- Options are Fixed salary and Commission basis; commission option explicitly states that it uses per-carton commission only, not fixed base salary or fixed-salary incentives.
- Preserves v55.62 month-wise salary and released advance salary slip features.
- Updated service-worker cache version so the new UI can load after deployment.
- Validation: JavaScript syntax and ZIP integrity checked. Live Supabase and browser deployment were not tested.
