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

## Current project repository strategy

The active biomedAntrag work is multi-repo. Agents must not assume that `/home/sebas/biomed/biomed-antrag` is the default implementation target for new work.

Repo boundaries (see `/home/sebas/biomed/CLAUDE.md` + `ARCHITECTURE.md` for the binding split):
- `bA-Agenten`: Agent-Service + Agent Studio (Control Plane). Owns agents/personas, prompts, prompt bundles, workflows, rubrics, eval cases, the stateless runtime (`POST /api/runs`, `/assist`, `/pubmed/*`) and agent-core contracts.
- `bA-MVP`: **the platform (Data Plane)** — TVA document model, three-pane web UI, login/users/orgs, review workflow (Antragsteller/Revisor), persistence of Threads/Runs/Memory. Most product requirements target this repo.
- `bA-RAG-db`: RAG database and RAG service (deferred; only the seam exists). Owns embeddings, retrieval, corpus metadata.
- `bA-worker` (planned, parked in backlog next): background-job executor without its own DB; jobs live in the bA-MVP DB behind a token-gated job API.
- `biomed-antrag`: historical/reference implementation and migration source unless the human explicitly selects it as the target for a new requirement.

Requirement source of truth:
- Product requirements are curated by the REQ engineer (Claude) in `/home/sebas/biomed/bA-docs/requirements/{now,next,later}` (kanban states todo/in_progress/done).
- Commissioned work is handed off as markdown copies into `requirements/backlog` here (frontmatter is compatible: `target_repo`, `business_score`, `implementation_scope`, `visual_change_intent`, `baseline_decision`). The bA-docs card stays the source of truth for product state.

Runner behavior:
- Requirements should name the target repo in frontmatter as `target_repo`.
- In `[target_repo_routing].mode = "from_requirement"`, every executable requirement must resolve to a configured target repo.
- One delivery bundle may contain exactly one target repo; mixed-target bundles are aborted and rebuilt.
- Do not add new Agent Studio or RAG-Service primary functionality to `biomed-antrag` without an explicit docs/requirement decision.
- Direct browser-to-Qdrant access, committing dumps/snapshots/secrets, and cross-repo direct DB coupling are invalid defaults.
- If a requirement is in the wrong repo boundary, ARCH/DEV should stop and route for clarification or create a migration/extraction follow-up instead of implementing in the wrong place.

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
- `UAT`: functional/semantic behavior validation. Can be disabled per config when not needed.
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
- Automatic product/business decisions go to `human-decision-needed`.
- Automatic runner/gate/process failures go to `blocked`.

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
- Business conflicts escalate to `human-decision-needed`.
- Technical gate/process failures route to `blocked` with auto-recovery disabled when the product requirement itself is not the failing surface.

UAT toggle:
- Set `[delivery_quality].uat_enabled = false` to skip both bundle UAT and full-regression UAT.

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
- Delivery creates per-bundle local workspace branches by default.
- Set `[delivery_runner].workspace_branches_enabled = false` to keep working on the currently checked out branch.
- Branch safety guard prevents using base branch as active bundle branch.
- Stale workspace branches can be pruned automatically.

## Recovery, loop guards, and escalations

Global pause guard:
- Provider limits/auth failures create `.runtime/pause-state.json`.
- Usage/rate/quota limits wait until `resumeAfter` and then continue automatically.
- Active pause state survives runner restarts until it expires.
- With `[pause_policy].probe_on_startup=true`, runner startup probes whether auto-resume pauses still apply; a successful probe clears the pause early.
- Auth/access failures escalate to `human-decision-needed` and runner stops gracefully.

Loop controls:
- Stage retries and no-output timeouts are bounded.
- Repeated failures/timeouts trigger escalation paths.
- `blocked` queue is used for technical recovery, then escalation when exhausted.

Technical failure routing:
- Automatic runner/gate/process failures are routed to `blocked`.
- Gate-orchestration failures are marked `technical_auto_recovery: disabled` so the blocked recovery loop does not recycle product requirements through `dev`.
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
- Updates the configured release history before the release commit when `[release_history].enabled=true`.
- Treats release-history failures as non-blocking by default; set `[release_history].required=true` to make them block completion.
- Commits on local release workspace branch.
- Fast-forward merges to base branch.
- Pushes base branch.
- Optional tagging.

On release conflicts/failures:
- Creates escalation requirement in `human-decision-needed`.
- Required release-history failures block completion; optional failures are recorded and the release continues.

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

Optional runner flags:
- `--allow-model-fallback` / `--model-fallback`: on provider usage/rate/quota limits, try the configured per-role fallback model once before entering the global auto-resume pause.

## Config map (from coarse to fine)

Primary file:
- `config.local.toml` (gitignored, project-specific)

High-impact sections:
- `[paths]`: repo and queue roots
- `[target_repo_routing]`, `[target_repos.*]`: fixed target repo or requirement-driven multi-repo routing
- `[loops]`: polling, retries, bundle sizing
- `[bundle_flow]`: bundle ids/branches/carryover behavior
- `[delivery_runner]`: mode and runner timeouts
- `[pause_policy]`: startup probe/cooldown for global provider-limit pauses
- `[retry_policy]`, `[loop_policy]`: bounded retries and escalation thresholds
- `[po]`: intake/vision defaults
- `[qa]`: mandatory checks and autofix behavior
- `[deploy]`, `[release_automation]`, `[release_history]`: deploy, release automation and release notes
- `[thread_recovery]`: thread reset/rotation policy
- `[memory]`: local memory read/update behavior
- `[models]`, `[model_fallback]`, `[codex]`, `[codex.reasoning_effort]`: model/runtime profiles

## Git safety

- Requirement payloads are local queue files.
- `.runtime/**` is local runtime state.
- Delivery git actions run in the active target repo, never in this orchestration repo.
- Legacy configs without `[target_repos]` still use `paths.repo_root`.

## Windows

Use same Node commands in PowerShell/CMD/Git Bash:
- `node setup-project.js --repo-root "C:\\git\\my-project"`
- `node po-runner.js --mode intake`
- `node delivery-runner.js --mode full`
- `node reqeng-cli.js`
