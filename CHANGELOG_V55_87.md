# BCBM v55.87 — Days worked on released salary slips

- Salary release now saves the credited attendance-day count in the salary slip breakdown.
- Fixed-salary and manager slips display the number of credited days worked; salesman commission slips also display attendance days.
- Salary-slip detail lines include the attendance count and working-day denominator.
- Bumped the service-worker cache name to ensure browsers fetch the updated app.

Validation: JavaScript syntax and ZIP integrity checks only. Live Supabase salary release and print preview must be verified in the deployed environment. Existing already-released slips are not retroactively updated by this frontend build.
