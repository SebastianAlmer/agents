# Requirements Queues

This folder stores queue folders only. Requirement files are intentionally ignored by git
so each project can keep its own local queue content.

Default queues:
- `refinement`
- `backlog`
- `selected`
- `for_review`
- `arch`
- `dev`
- `qa`
- `sec`
- `ux`
- `deploy`
- `released`
- `to-clarify`
- `need-to-check`
- `blocked`
- `wont-do`

Queue intent:
- `refinement` and `backlog` are customer-managed intake/planning.
- Delivery runs start from `selected`.
- Unclear items from any stage go to `to-clarify`.
- Hard blockers from `qa`/`sec`/`ux` go to `blocked`.
