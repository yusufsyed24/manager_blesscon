# v55.17 — Manager-created sales areas

- Added Manage areas access to the Manager Business Overview and Salesmen & Targets pages.
- Managers can create active area definitions and then assign those areas to salesmen on their own assigned team.
- Managers can view the area catalogue but cannot deactivate/reactivate areas; those actions remain Admin-only.
- Added an additive Supabase RLS migration allowing authenticated Managers to insert active areas they create.
- Bumped the service-worker cache to avoid stale frontend assets.
