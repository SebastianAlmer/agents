# Requirements Queues

This folder stores queue structure only.
Requirement markdown payloads are intentionally ignored by git so each project can keep local queue content.

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
- `refinement` and `backlog` are customer-managed planning queues.
- Put unstructured requirements into `refinement` first.
- ReqEng triage:
  - unclear -> `refinement`
  - clear but later -> `backlog`
  - clear and immediate -> `selected`
- Autonomous delivery starts from `selected`.
- Unclear items from any stage go to `to-clarify`.
- Hard blockers from review phases may go to `blocked`.
