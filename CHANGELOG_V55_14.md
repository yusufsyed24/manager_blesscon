# v55.14

- Restricted salesman navigation to the single My profile page and force-routed salesman sessions there even when local storage contains a previous module selection.
- Kept profile photo, manager-uploaded private documents, DOB, current assigned area, daily stock/sales, current stock, monthly boxes and target achievement visible on the profile.
- Updated the `own_salary_snapshot()` SQL function so unposted salary estimates calculate achievement from confirmed order-line boxes/carton equivalents instead of relying on daily target rollups. Existing posted salary remains authoritative.
- Added static regression coverage for the salesman page restriction and sales-based salary calculation.
