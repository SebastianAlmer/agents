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
- `blocked`
- `wont-do`

Queue intent:
- `refinement` and `backlog` are customer-managed intake/planning.
- ReqEng intake triage: unclear -> `refinement`, clear-but-later -> `backlog`, clear-and-immediate -> `selected`.
- Delivery runs start from `selected`.
- Unclear items from any stage go to `to-clarify`.
- ReqEng processes `to-clarify` items with the user and routes them to `refinement`, `backlog`, or `selected`.
- Hard blockers from `qa`/`sec`/`ux` go to `blocked`.
