# BCBM v55.89 — Salary lines in Profit & Loss

- Profit & Loss "Period comparison" now has separate line items: **Salaries (net paid)**, **Salary advances released**, **Other operating expenses**, and **Total expenses**.
- Salary advances released are now counted in expenses on the Profit & Loss page and in the Overview profit figures, the monthly profit chart and the other P&L totals, so they match the Expenses page.
- Salary cost = salaries paid (already net of advance deduction) + advances released. Because the deduction reduces the salary paid, a recovered advance is never counted twice.
- Salaries were already included in total expenses; they are now also shown on their own line.
- The daily report PDF is unchanged.
- No database migration required.
