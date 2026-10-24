# Deploy BCBM v55.74

1. Back up the currently deployed static folder.
2. Extract `BCBM_v55_74_Auto_Advance_Recovery.zip`.
3. Upload the extracted folder contents to the same Cloudflare Pages static deployment location you normally use. Keep the existing folder structure and do not upload the ZIP itself.
4. Hard-refresh with `Ctrl + F5`. If the old app persists, close the tab and reopen the site after the service worker updates.
5. Test with a non-production test employee first: record an advance, release salary, confirm the release preview shows the advance deduction, verify only the net amount is paid, and verify the advance record's recovered amount increases.

## Example
Gross salary PKR 50,000; unrecovered advance PKR 15,000; no other deductions. The salary slip should show gross earnings PKR 50,000, Advance Recovery (this month) PKR 15,000, total deductions PKR 15,000, and net payable PKR 35,000. The advance slip itself does not show a “Balance Remaining” column.

The build performs static checks only. Verify the workflow in your live Supabase project before releasing real payroll; do not retry a salary if the expense was posted but the slip/recovery update reported an error—reconcile the existing record first.
