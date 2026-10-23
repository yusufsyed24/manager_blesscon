Blesscon Candy Business Manager v55.47 — Admin Payroll Calculation Display Fix

Main change: Admin → Salary & Payroll now calculates and displays the selected month's salary components and offers “View calculation” for each manager and salesman. It uses paid attendance (including Week Off), attendance-prorated base and allowance, confirmed personal carton sales, individual target, above-target incentive, advances, and estimated net. Manager own cartons are kept separate from the team target. Salary release for salesmen uses the same month-specific calculation; manager release pre-fills the calculated gross salary. Released months continue to hide the release action.

Deployment: Back up the project/database, deploy the app source, and test with one unpaid month and one already-released month before live payroll. No new SQL migration is required by this front-end display fix; keep previously required payroll migrations applied. Live Supabase validation has not been performed.
