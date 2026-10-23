# BCBM v55.61 — Salary slips and commission-only release

- Added an additive Supabase migration for persistent salary slips with employee/month/basis/gross/arrears/advance/net/payment account fields and access policies.
- Salary release now saves a Blesscon Candy letterhead salary slip record and attempts to send an in-app notification to the recipient.
- Added month-wise salary-slip history in salesman profile and Admin's salesman/manager profile; slips can be opened and printed / saved as PDF.
- Commission-basis salesman release calculates gross only from configured per-product commission rates on confirmed personal sales; it does not fall back to base salary.
- Salary account dropdowns exclude accounts linked directly to an individual salesman/user and use central active non-receivable accounts.

## Important limitations
- The slip's arrears field is present, but automatic calculation and carry-forward of all prior unpaid salary months is not fully implemented in this build. Do not treat arrears as automatic until that workflow is completed and verified.
- Manager salary release retains its existing gross amount entry workflow.
- Notification delivery is in-app only, not SMS/email/push. Notification insertion failures are logged to the browser console while the salary slip remains saved.
- Live Supabase behavior cannot be verified from the static build environment. Apply the migration and test in a backup/staging project before production use.
