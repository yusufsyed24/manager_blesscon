# v55.25 — Market Credit shows unpaid receivables only

- Market Credit transaction history now displays only confirmed invoices with a positive outstanding balance as of the selected date.
- Each row shows the remaining unpaid amount (invoice total less non-voided linked payments dated on or before the selected date).
- Payment/recovery transactions are not listed in this history, and fully paid invoices are hidden.
- Updated the service-worker cache key to prompt clients to load the revised frontend.

Validation: JavaScript syntax and ZIP integrity checks; live Supabase data behavior is not verified here.
