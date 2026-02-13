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
- `human-decision-needed`
- `human-input`
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
- Unclear items from any stage go to `human-decision-needed`.
- After human evaluation, move those items to `human-input`; PO ingests `human-input` in the next iteration.
- Hard blockers from review phases may go to `blocked`.
