# Requirements Queues

This folder stores queue folders only. Requirement files are intentionally ignored by git
so each project can keep its own local queue content.

Default queues:
- `refinement`
- `backlog`
- `selected`
- `arch`
- `dev`
- `qa`
- `sec`
- `ux`
- `deploy`
- `released`
- `to-clarify`
- `wont-do`

Queue intent:
- `refinement` and `backlog` are customer-managed intake/planning.
- Delivery runs start from `selected`.
- Unclear items from any stage go to `to-clarify`.
- In ops, hard concerns and unresolved issues are routed to `to-clarify` with context for the next loop.
