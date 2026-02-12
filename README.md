# agents

Reusable Codex multi-agent flow runner for project requirements.

## What this repo does

This repo orchestrates role agents (`PO`, `ARCH`, `DEV_FE`, `DEV_BE`, `DEV_FS`, `QA`, `SEC`, `UX`, `DEPLOY`) against a target project repository.
It is project-agnostic: project-specific paths and defaults are configured locally.

## Quick start

1) Run setup once per project (and again when changing dev routing mode):
- `npm run setup -- --repo-root /absolute/path/to/project`

2) Run the flow:
- `npm run flow`
- `npm run flow -- --flow standard`
- `npm run flow -- --flow standard --manual-downstream`
- `npm run flow -- --flow detailed`
- `npm run flow -- --flow bulk`
- `npm run flow -- --flow fast`

3) Optional: requirements discussion/triage with ReqEng:
- `npm run reqeng`
- `npm run reqeng -- --requirement requirements/refinement/REQ-NEW-example.md`

### Windows

Use the same Node commands from PowerShell, CMD, or Git Bash.

- Setup:
  - `npm run setup -- --repo-root "C:\\git\\my-project"`
- Run:
  - `npm run flow -- --flow standard`
- ReqEng:
  - `npm run reqeng -- --requirement requirements\\refinement\\REQ-NEW-example.md`

## Local config

`config.local.toml` is gitignored and contains project-specific settings.
Generate/update it via setup script.

Important fields:
- `[paths].repo_root`: target repository path.
- `[paths].requirements_root`: requirements queues path.
- `[paths].docs_dir`: docs path (default `<repo_root>/docs` when empty).
- `[run_defaults]`: default values for all CLI switches.
- `[run_defaults].preflight`: `hard | soft | none | snapshot`.
- `[run_defaults].manual_downstream`: if `true`, standard flow waits for key `n` before downstream stage.
- `[deploy].mode`: `check | commit | commit_push`.
- `[dev_routing].mode`: `fullstack_only | split`.
- `[dev_agents]`: enable/disable FE/BE/FS dev agents.
- `[qa].mandatory_checks`: project-specific QA baseline checks.
- `[review]`: review strategy (`bundle|classic`), parallel execution, and default risk routing.
- `[codex]`: Codex runtime settings rendered to `.runtime/codex.generated.toml`.

By default, setup writes `mandatory_checks = []` for project-agnostic behavior.
Set QA checks per project with `--qa-check ...` or by editing `config.local.toml`.

You can override config file path with `AGENTS_CONFIG=/path/to/config.local.toml`.

## Requirement queues

Default queues under `requirements/`:
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

Queue folder structure is tracked; queue file content is ignored by git.
Agent thread/session files are written to `.runtime/threads/` and are ignored by git.
`refinement` and `backlog` are customer-managed intake/planning queues; delivery runs start from `selected`.

Agent thread handling:
- Each role keeps its own local thread file under `.runtime/threads/<role>/`.
- On context overflow, the role thread is reset automatically and the turn is retried once.
- In auto mode, a compact turn is attempted every 20 successful agent turns (default) via `codex exec resume <thread_id> "/compact"`.
- Override compact interval with env `CODEX_AUTO_COMPACT_EVERY` (`0` disables).

## Requirement intake workflow

- Drop unstructured incoming requirements (`Anforderungen`) into `requirements/refinement`.
- Process refinement items with an AI chat (for example ReqEng) and convert them into backlog-ready requirements in `requirements/backlog`.
- Before starting a flow run, move the relevant backlog package into `requirements/selected`.
- PO normalizes selected requirements into lean implementation briefs: focus on Goal + Scope + Task Outline with concise outcome-based acceptance criteria (no long AC/DoD micro-spec lists).
- ARCH keeps requirements technically lean: add only essential architecture guardrails and avoid step-by-step implementation plans.
- Unclear items from all stages should be moved to `to-clarify`.
- Regularly sweep `requirements/to-clarify` with an AI chat, then move clarified items to `selected` (delivery-ready), `backlog` (clear but later), or `refinement` (still unclear).
- `QA`/`SEC`/`UX` use `blocked` only for hard blockers. Non-blocking findings/questions go to `to-clarify`.

ReqEng triage rules (outside `run.js`):
- unclear/incomplete/conflicting requirement state: `refinement`
- clear but not intended for immediate implementation: `backlog`
- clear and intended for immediate implementation: `selected`
- ReqEng outcomes should not be routed to run/review queues (`arch`, `dev`, `qa`, `sec`, `ux`, `deploy`, `released`, `to-clarify`, `blocked`)
- ReqEng should actively process items from `requirements/to-clarify` and route them to `refinement`, `backlog`, or `selected`
- ReqEng is interactive: conflicts with `/docs` must be discussed with the user before final routing
- ReqEng may intentionally edit `/docs` to capture approved product decisions and then update requirement references/results
- Unresolved doc conflicts remain in `refinement` until user decision

## Flows

### `standard` (default)

Two-phase cycle:
1. Upstream phase (per requirement): `selected -> PO -> arch -> ARCH -> dev -> DEV_* -> qa`
2. Downstream phase (single global pass):
- default (`[review].strategy = "bundle"`): `qa -> review bundle (QA always, SEC/UX risk-based, optional parallel) -> deploy -> DEPLOY -> released`
- fallback (`[review].strategy = "classic"`): `qa -> QA -> sec -> SEC -> ux -> UX -> deploy -> DEPLOY -> released`

Optional manual downstream gate (standard flow only):
- enable via `--manual-downstream` or `[run_defaults].manual_downstream = true`
- while enabled, runner keeps PO/ARCH/DEV loop active and waits for key `n` before running downstream stage
- if no TTY is available, manual gate auto-disables for safety and logs a warning

After active queues are empty, final global pass runs:
- `QA final` (must output gate `pass`)
- `SEC final` (must output gate `pass`)
- `UX final` (must output gate `pass`)
- `DEPLOY final`

Only if all QA/SEC/UX gates pass, final push may run (config-dependent).

### `detailed`

Per-requirement deep pipeline:
1. `selected -> PO -> arch`
2. `arch -> ARCH -> dev`
3. `dev -> DEV_* -> qa`
4. `qa -> QA -> sec`
5. `sec -> SEC -> ux`
6. `ux -> UX -> deploy`
7. `deploy -> DEPLOY -> released`

Run start policy:
- New delivery work should always be placed in `selected`.
- If earlier runs left items in `arch`, `dev`, `qa`, `sec`, `ux`, or `deploy`, flow runs resume and continue those queues automatically.

### `bulk`

Batch stage-by-stage processing:
1. all `selected` with `PO`
2. all `arch` with `ARCH`
3. all `dev` with routed `DEV_*`
4. all `qa`, then `sec`, then `ux`, then `deploy`

### `fast`

Skips architecture and deep review steps:
- bypasses `ARCH`, `SEC`, `UX`
- keeps `PO -> DEV_* -> QA -> DEPLOY`

## Review optimization (`standard`)

Configured via `[review]`:
- `strategy = "bundle"` (default): risk-based review bundle with aggregator.
- `strategy = "classic"`: sequential review path (`QA -> SEC -> UX`).
- `parallel = true|false`: run bundle reviewers in parallel or sequentially.
- `default_risk = "low|medium|high"`: fallback risk if requirement has no explicit risk tag.
- `medium_scope_policy = "single_specialist|full"`: controls medium-risk routing.
- `single_specialist` means medium frontend scope routes to `QA+UX` and backend scope routes to `QA+SEC`.
- `full` means medium scope routes to `QA+SEC+UX`.

Bundle front matter hints (optional):
- `review_risk` (or `risk` / `risk_level`): `low|medium|high`
- `review_scope`: `qa_only|qa_sec|qa_ux|full`

Bundle aggregation rules:
- any reviewer returns `block` => move to `blocked`
- else any reviewer returns `clarify` => move to `to-clarify`
- else => move to `deploy`

Runner writes a human-readable `Review Bundle Results` section into the requirement and updates front matter status before routing.

## CLI switches and config defaults

CLI switches:
- `--flow standard|detailed|bulk|fast`
- `--preflight hard|soft|none|snapshot`
- `--manual-downstream | --no-manual-downstream`
- `--max-req N`
- `--verbose | --no-verbose`
- `--detail | --no-detail`

Every switch has a configurable default in `[run_defaults]`.
CLI always overrides config for the current run.

Keyboard controls during `run.js`:
- `v`: toggle verbose log output
- `d`: toggle detail output
- `s`: print queue summary snapshot
- `n`: trigger downstream stage in standard mode when manual downstream gate is enabled

## Preflight modes

- `hard`: strict; fails on dirty git or missing required paths.
- `soft` (default): fails on missing required paths; allows dirty git but can disable deploy commits/push for safety.
- `none`: skips preflight checks.
- `snapshot`: if git is dirty, creates a snapshot commit before flow starts, then runs from a clean state.

## Deploy behavior

`[deploy].mode` controls per-requirement git actions after release:
- `check`: no commit/push
- `commit`: commit after each released requirement
- `commit_push`: commit and push after each released requirement

Default: `commit` (commit without immediate push).

`[deploy].require_clean_start_for_commits = true` blocks deploy commits/push in `soft` preflight when run starts dirty.

## Dev routing (FE/BE/FS)

Configured via `[dev_routing]` and `[dev_agents]`.

- `fullstack_only`: PO should set `implementation_scope: fullstack`; runner routes all dev work to `DEV_FS`.
- `split`: PO sets `implementation_scope: frontend|backend|fullstack`; runner routes to `DEV_FE`, `DEV_BE`, or `DEV_FS`. PO may split a broad requirement into FE/BE requirements when useful.

If you change routing strategy, run setup script again.

## Final gates

In final pass, `QA`, `SEC`, and `UX` must each write a JSON gate file:
- `status`: `pass` or `fail`
- `summary`: short text
- `blocking_findings`: array of strings

Runner parses these files and blocks final push on any `fail`.

Requirement-level human-readable sections remain required (`QA Results`, `Security Results`, `UX Results`, findings sections where needed).

## Git safety

- The runner refuses git write operations if `paths.repo_root` resolves to the same git repository as this `agents` repo.
- This prevents accidental commits/pushes to the orchestration repo itself.

## Setup script examples

- Minimal:
  - `npm run setup -- --repo-root /home/user/git/my-project`

- Split FE/BE/FS routing:
  - `npm run setup -- --repo-root /home/user/git/my-project --dev-routing split`

- Strict run defaults:
  - `npm run setup -- --repo-root /home/user/git/my-project --preflight hard --flow standard`

- Project-specific QA checks:
  - `npm run setup -- --repo-root /home/user/git/my-project --qa-check "pnpm lint" --qa-check "pnpm test"`

## Model/provider usage

- This setup works with ChatGPT Codex across variants/models.
- In practice, ChatGPT Codex Pro usually offers the most reasonable rate-limit headroom for longer unattended flows.
- The same flow concept can be copied to Claude agents, but limits are typically exhausted much faster in continuous multi-agent runs.

## Notes

- `to-clarify` is for PO/ARCH clarification blockers.
- `to-clarify` is also used for unclear DEV/QA/SEC/UX outcomes and follow-up questions.
- `DEV_*` routes only to `qa` or `to-clarify`; it should not use `blocked`.
- `blocked` is reserved for hard blockers (for example security/compliance violations).
