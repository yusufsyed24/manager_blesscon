Blesscon Candy Business Manager v55.37 - Carton-Based Payroll Release

This package contains the application source and Supabase deployment materials.
The production web app is in the web/ directory; Supabase schema/functions are in supabase/.
Read web/README_SETUP.md and the relevant DEPLOY_*.md instructions before deploying.

Security note: this release has not been independently certified malware-free and has not been scanned by Microsoft Defender on the recipient's computer. If Microsoft Defender flags this archive, do not run/extract it; retain the alert details and investigate the named file/detection. A ZIP integrity check is not a malware scan.

No live Supabase database changes are included or applied by packaging this archive.

v55.37 payroll update:
- Admin -> Settings includes role defaults for base salary, monthly allowance and incentive per confirmed carton.
- Apply supabase/payroll_carton_incentive_v55_37.sql in the Supabase SQL Editor before testing employee salary snapshots.
- Rates are zero by default until Admin configures them. Existing employee base salaries are retained for salesmen; manager base salary is configurable.
- Manager's own confirmed cartons earn their personal incentive and remain excluded from the team target.
