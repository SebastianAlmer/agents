# Requirements Queues

Queue folders used by the autonomous loop:

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

Flow intent:

- `po` and `ops` run from this queue set.
- `refinement` and `backlog` provide planning and intake sources.
- `selected` is the pipeline handoff queue for ops.
- `to-clarify` is the common rework and follow-up funnel for all stages.
- `released` is the final done queue.
- `wont-do` contains terminal non-work items.

Note: legacy folders are intentionally removed from this flow.
