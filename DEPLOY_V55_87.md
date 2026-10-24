# Deploy BCBM v55.87 — Days worked on salary slip

1. Back up the currently deployed folder.
2. Extract `BCBM_v55_87_Salary_Slip_Days_Worked.zip` and upload the contents of `bcbm_v568_working`, replacing the old app files.
3. Hard-refresh with Ctrl+Shift+R (or close/reopen the installed app).
4. Release a salary only after verifying attendance and payroll values. The new salary slip will show Days Worked from the credited attendance calculation, alongside the configured working-day denominator in the detail line.
5. Existing slips released before this update are not automatically recalculated. Do not re-release a salary to update a slip; reconcile the existing record separately.

Live Supabase and print output were not available for end-to-end verification.
