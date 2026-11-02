# BCBM v55.96 — Monthly target and stock history filters

- Added a month selector to the management overview target panel.
- Shows the prior month's unachieved carton target as carry-forward, the selected month's target, combined target, actual achievement and remaining cartons.
- Historical target achievement is calculated from confirmed sales orders for the selected calendar month.
- Added a month selector to Stock by candy. Product and candy-family warehouse balances are reconstructed as at the selected month end by reversing later warehouse and salesman stock movements.
- No database migration or business-data reset is required. Historical target comparisons use the currently configured company monthly target because prior target-setting values are not separately versioned in the existing data model.
