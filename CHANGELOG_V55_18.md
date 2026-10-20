# v55.18 — Manager's own carton sales count toward team target

- Manager overview now separates salesman/team achievement from confirmed cartons sold directly by the signed-in Manager.
- Adds a clear “Your additional cartons sold” card and a combined “Total achieved incl. your sales” card.
- Remaining target and percentage are calculated after adding the Manager's own direct sales to team achievement.
- Counts only current-month confirmed, non-deleted orders created by the signed-in Manager with no salesman assigned; converts boxes to cartons using each order line's boxes-per-carton value, then the configured default, then 24 as fallback.
- Keeps Admin and Salesman views unchanged. No database migration is required.
- Validation: syntax checks and targeted regression test; full suite depends on installed project dependencies.
