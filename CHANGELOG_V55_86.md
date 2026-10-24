# BCBM v55.86 — Admin payroll attendance parity

- Fixes Admin payroll attendance proration to credit `week_off` as one day, matching the manager payroll snapshot and attendance rules.
- Keeps one credit per calendar date and preserves half-day weighting.
- Bumps the service-worker cache name so the browser fetches the corrected app bundle after deployment.
- This frontend correction does not insert missing attendance records. If Arsalan's 17 credited days depend on missing dates rather than Week Off rows, apply the authorized attendance correction SQL and verify the database rows before payroll release.
