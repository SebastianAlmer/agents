# agents

Reusable Codex multi-agent orchestration for long-running product delivery.

## First read: Intake mode vs Vision mode

There are two PO runner modes:

- `intake` mode:
  - Purpose: process existing requirement files from planning queues and prepare executable work for delivery.
  - Input queues: `to-clarify`, `human-input`, `refinement`, `backlog`.
  - This is the currently reliable mode for normal operation.

- `vision` mode:
  - Purpose: autonomous product-vision reconciliation and requirement generation.
  - Tries to compare `released` state against vision docs and create/fix requirements.
  - Important: vision mode is currently not reliable enough for production-grade autonomous operation. Use with caution and prefer `intake` for stable flow.

## System overview (coarse)

The system is split into three orchestration layers:

1. `ReqEng` (interactive)
- Human discussion and triage into planning queues.

2. `PO runner` (planning automation)
- Turns planning queues into execution-ready requirements.
- Controls bundle preparation in `selected`.

3. `Delivery runner` (implementation + quality + deploy automation)
- Runs ARCH/DEV and downstream gates (UX/SEC/QA/UAT/DEPLOY).
- Handles technical recovery loops and escalations.

All requirements are queue files under `requirements/`.

## Architecture model (roles and responsibilities)

Shared role agents used by runners:
- `PO`
- `ARCH`
- `DEV_FE`, `DEV_BE`, `DEV_FS`
- `UX`
- `SEC`
- `QA`
- `UAT`
- `MAINT`
- `DEPLOY`

Responsibility summary:
- `PO`: business routing and requirement shaping.
- `ARCH`: architecture/risk guardrails before DEV when needed.
- `DEV_*`: implementation within requirement scope.
- `UX`: UI quality and design/code refinement.
- `SEC`: security hardening in code/config.
- `QA`: technical validation and defect fixing loops.
- `UAT`: functional/semantic behavior validation.
- `MAINT`: post-deploy hygiene follow-ups.
- `DEPLOY`: delivery completion and repo deploy actions.

## Queue model (source of truth)

Default queue structure under `requirements/`:
- `refinement`
- `backlog`
- `selected`
- `arch`
- `dev`
- `qa`
- `ux`
- `sec`
- `deploy`
- `released`
- `to-clarify`
- `human-decision-needed`
- `human-input`
- `blocked`
- `wont-do`

Queue intent:
- `refinement`: unclear/unstructured requirements.
- `backlog`: clear but not immediate.
- `selected`: clear and immediate (bundle candidate).
- `to-clarify`: unresolved items from automation.
- `human-decision-needed`: hard decision queue for human escalation.
- `human-input`: manual human input queue only.
- `blocked`: technical freeze/recovery queue.

Human ownership rules:
- `human-input` is manual input for PO re-steering.
- Automatic escalations from runners go to `human-decision-needed`.

## Requirements artifact contract (critical)

Requirements are markdown-only artifacts:
- Allowed: `requirements/**/*.md`
- Not allowed: JSON artifacts in `requirements/**`

Policy:
- Runners process markdown requirements only.
- JSON files in `requirements/**` are treated as drift and removed by runner cleanup guards.
- Decision metadata must live in markdown (frontmatter + sections), not sidecar JSON.

## End-to-end flow (medium detail)

### 1) ReqEng flow
Command:
- `node reqeng-cli.js`

Behavior:
- Discusses with human.
- Routes requirement into `refinement`, `backlog`, `selected`, or `human-input`.

### 2) PO runner flow
Commands:
- `node po-runner.js --mode intake`
- `node po-runner.js --mode vision`
- `node po/po.js --runner --mode intake`
- `node po/po.js --runner --mode vision`

`intake` behavior:
- Consumes `to-clarify`, `human-input`, `refinement`, `backlog`.
- Writes routing outcome into markdown requirement content.
- Moves requirements to target queue (`selected`, `backlog`, `refinement`, `wont-do`, `human-decision-needed`).
- Prepares one ready bundle ahead for delivery.

`vision` behavior:
- Runs autonomous reconciliation loops against product vision and released output.
- May generate/update requirements and docs.
- Not yet reliable for stable unattended production flow.

### 3) Delivery runner flow
Commands:
- `node delivery-runner.js --mode full`
- `node delivery-runner.js --mode fast`
- `node delivery-runner.js --mode test`

Modes:
- `full`: ARCH/DEV + downstream gates + deploy + post checks.
- `fast`: ARCH/DEV only.
- `test`: quality/regression mode without deploy git mutations.

Downstream path in `full`:
- `selected -> arch -> dev -> ux -> sec -> qa -> uat -> deploy -> released`
- Recovery loops reroute failed bundles back to `dev` until thresholds are reached.
- Exhausted technical/business conflicts escalate to `human-decision-needed`.

## Bundle mechanics (fine detail)

Bundle basics:
- Work starts from `selected`.
- PO can prepare one `ready` bundle ahead.
- Delivery activates `ready` as `active`.

Registry:
- `.runtime/bundles/registry.json` tracks:
  - `ready_bundle_id`
  - `active_bundle_id`
  - bundle metadata

Naming/metadata:
- Requirements get normalized bundle naming and carryover markers.
- Business priority uses `business_score` in frontmatter.

Workspace branches:
- Delivery creates per-bundle local workspace branches.
- Branch safety guard prevents using base branch as active bundle branch.
- Stale workspace branches can be pruned automatically.

## Recovery, loop guards, and escalations

Global pause guard:
- Provider limits/auth failures create `.runtime/pause-state.json`.
- Runners pause or escalate depending on policy.
- Limit/auth incidents are escalated to `human-decision-needed` and runner stops gracefully.

Loop controls:
- Stage retries and no-output timeouts are bounded.
- Repeated failures/timeouts trigger escalation paths.
- `blocked` queue is used for technical recovery, then escalation when exhausted.

Technical failure routing:
- Automatic runner/gate/process failures are routed to `human-decision-needed`.
- `human-input` is not used for automatic runner output.

## Visual baseline policy

For UI-related requirements, frontmatter must include:
- `visual_change_intent: true|false`
- `baseline_decision: update_baseline|revert_ui|none`

Routing behavior:
- Missing/conflicting baseline metadata -> `human-decision-needed`.
- Intentional and explicit baseline decision -> dev rework path.
- Regression intent (`false` + `none`) -> dev regression fix path.

## Release automation

When `[release_automation].enabled=true` and deploy mode allows push:
- Bumps version (configurable command).
- Commits on local release workspace branch.
- Fast-forward merges to base branch.
- Pushes base branch.
- Optional tagging.

On release conflicts/failures:
- Creates escalation requirement in `human-decision-needed`.

## Runtime state and local artifacts

Runtime artifacts live under `.runtime/` and are gitignored.
Examples:
- `.runtime/bundles/registry.json`
- `.runtime/pause-state.json`
- `.runtime/runner-metrics/events.jsonl`
- `.runtime/memory/*.md`

Important distinction:
- JSON is allowed in `.runtime/**` for technical runtime state.
- JSON is not allowed in `requirements/**`.

## Quick start

1. Setup local config:
- `node setup-project.js --repo-root /absolute/path/to/project`

2. Stable operation (recommended):
- Terminal 1: `node reqeng-cli.js`
- Terminal 2: `node po-runner.js --mode intake`
- Terminal 3: `node delivery-runner.js --mode full`

3. Vision experiments (not fully reliable):
- Terminal 1: `node po-runner.js --mode vision`
- Terminal 2: `node delivery-runner.js --mode full`

4. Optional fast mode:
- `node delivery-runner.js --mode fast`

5. Optional regression mode:
- `node delivery-runner.js --mode test`

## Operator controls

Runner hotkeys (TTY):
- `v`: toggle verbose
- `s`: print queue snapshot
- `q`: graceful stop
- `q` again: force stop
- `Ctrl+C`: immediate stop

## Config map (from coarse to fine)

Primary file:
- `config.local.toml` (gitignored, project-specific)

High-impact sections:
- `[paths]`: repo and queue roots
- `[loops]`: polling, retries, bundle sizing
- `[bundle_flow]`: bundle ids/branches/carryover behavior
- `[delivery_runner]`: mode and runner timeouts
- `[retry_policy]`, `[loop_policy]`: bounded retries and escalation thresholds
- `[po]`: intake/vision defaults
- `[qa]`: mandatory checks and autofix behavior
- `[deploy]`, `[release_automation]`: deploy and release automation
- `[thread_recovery]`: thread reset/rotation policy
- `[memory]`: local memory read/update behavior
- `[models]`, `[codex]`, `[codex.reasoning_effort]`: model/runtime profiles

## Git safety

- Requirement payloads are local queue files.
- `.runtime/**` is local runtime state.
- Delivery git actions run in `paths.repo_root`, never in this orchestration repo.

## Windows

Use same Node commands in PowerShell/CMD/Git Bash:
- `node setup-project.js --repo-root "C:\\git\\my-project"`
- `node po-runner.js --mode intake`
- `node delivery-runner.js --mode full`
- `node reqeng-cli.js`
