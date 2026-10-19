# Role and permission matrix — v54

| Capability | Admin | Manager | Salesman |
|---|---|---|---|
| Create Manager login / manage user roles | Yes | No | No |
| Create salesman profile | Yes | Assigned-team profiles | No |
| Assign salesman to a manager | Yes | Assigned to own manager account | No |
| Link salesman login | Yes | No | No |
| Edit protected name, DOB, profile photo and employee documents | Yes | Assigned team | No |
| Upload/replace private NIC and employment documents | Yes | Assigned team, after login is linked | No |
| Record/correct salesman attendance | Yes | Assigned team | Read-only own record |
| Maintain area catalogue | Yes | No | No |
| Assign areas with effective dates | Yes | Assigned team, active catalogue only | Read-only own history |
| View assigned stock issue/return and targets | All authorized | Assigned team | Own records |
| Product pricing and wholesale costs | Yes | Only if explicitly permitted by current permission records | No |
| Cashbook / bank accounts / business-wide financial reports | Yes | Only if explicitly permitted | No |
| Send operational messages | All authorized salesmen | Assigned team | No |
| Read/acknowledge notifications | All authorized | Assigned team visibility | Own notifications only |

Database RLS/RPC checks are the authoritative enforcement. This matrix describes intended application access and must be verified against the actual live role and permission records before production release.
