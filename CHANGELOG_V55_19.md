# v55.19 — Manager direct cartons excluded from team target

- Corrected the target calculation so only salesman-attributed cartons count toward the team/company target.
- Manager's own confirmed, non-deleted direct sales are shown separately as additional cartons and never close or reduce the team target.
- Manager overview shows the team target remaining based only on salesman achievement.
- Admin's Managers & company target table displays each manager's own additional sales separately and calculates target status/remaining cartons from team sales only.
- Updated the domain regression expectation to verify a 130-carton salesman achievement remains 130 when a manager separately sells 3 cartons.
- No database migration required.
