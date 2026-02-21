# Requirements Queues

This folder stores queue structure only.
Requirement markdown payloads are intentionally ignored by git so each project can keep local queue content.
Each queue keeps a `.gitkeep` placeholder; queue metrics must count only `*.md` requirement files and ignore `.gitkeep`.

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
- Unclear items from ARCH/DEV/QA/SEC/UX/DEPLOY go to `to-clarify`.
- PO resolves `to-clarify` whenever possible.
- Only PO escalates hard unresolved conflicts to `human-decision-needed`.
- UAT may create manual decision packages in `human-decision-needed` only for business-critical checks that are not automatable.
- MAINT may create cleanup follow-up requirements after deploy.
- `human-decision-needed` is human-owned: no autonomous runner moves files out of this queue.
- After human evaluation, move those items to `human-input`; PO ingests `human-input` in the next iteration.
- Hard blockers from review phases may go to `blocked`.
- QA/UAT/MAINT follow-ups are auto-routed:
  - `P0/P1` -> `selected` (hotfix)
  - `P2/P3` -> `backlog`
