# v55.85 — Admin payroll week-off attendance fix

- Fixed the shared Admin payroll calculation in `js/app.js`: `week_off` no longer earns a paid attendance day.
- Paid attendance credits: `present = 1`, `late = 1`, `half_day = 0.5`; all other statuses, including `week_off`, count as 0.
- Existing per-date de-duplication is retained.
- Bumped the service-worker cache name so browsers can install the updated frontend assets.

This changes the frontend calculation only. It does not edit attendance records or alter already-posted salary expenses. Static source checks are not a live Cloudflare/Supabase test.
