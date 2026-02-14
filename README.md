# agents

Reusable Codex multi-agent orchestration for long-running product delivery.

## Core model

All runners use the same role agents:
- `PO`
- `ARCH`
- `DEV_FE` / `DEV_BE` / `DEV_FS`
- `UX`
- `SEC`
- `QA`
- `UAT`
- `MAINT`
- `DEPLOY`

Role intent:
- `ARCH` is trigger-based before DEV, keeps requirements short, adds minimal stack/tech routing guardrails when risk/complexity requires it.
- DEV agents may change all required code (including DB) within requirement scope.
- `UX` actively improves frontend/pages in code (not only requirement text), guided by docs and git diff.
- `SEC` actively hardens security in code/config.
- `QA` validates bundle behavior and fixes defects until checks pass or a hard blocker remains.
- `QA` is technical quality gate (build/test/runtime checks and code-level fixes).
- `UAT` is functional/semantic user-behavior gate (flows, messages, button/process continuity).
- `MAINT` runs post-deploy hygiene scans (orphan i18n, dead code, unused snippets/imports) and creates cleanup follow-up requirements.
- `DEPLOY` runs once per bundle and delivery runner performs commit+push in target repo (config-driven).

## Runners

### 1) PO runner
- `node scripts/po-runner.js --mode vision`
- `node scripts/po-runner.js --mode intake`
- `node po/po.js --runner --mode vision`
- `node po/po.js --runner --mode intake`

Modes:
- `intake`: classic PO intake (refine + backlog -> selected, selected -> arch when needed).
- `vision`: autonomous Product Vision breakdown until vision is implemented.

PO vision rules:
- Product Vision files have priority over generic docs.
- PO may update docs and requirements autonomously.
- PO reconciles `released` outcomes against vision/docs and creates follow-up requirements for detected gaps.
- PO escalates to `human-decision-needed` only for hard vision conflicts/violations.

### 2) Delivery runner
- `node scripts/delivery-runner.js --mode full`
- `node scripts/delivery-runner.js --mode dev-only`
- `node scripts/delivery-runner.js --mode regression`

Modes:
- `full`: selected -> arch intake -> (ARCH agent if triggered, else fast-pass to DEV), then downstream once-per-bundle gates (UX -> SEC -> QA(advisory) -> UAT(advisory) -> DEPLOY), followed by QA post-bundle sanity and MAINT post-deploy hygiene scan.
- `dev-only`: selected -> arch intake -> (ARCH agent if triggered, else fast-pass to DEV), no downstream.
- `regression`: manual one-shot quality regression on `released` (QA final pass + UAT full regression), auto-routing findings to queues.

Bundle behavior:
- Bundles start from `selected`.
- Priority uses `business_score` in requirement front matter.
- Default bundle range: 5-20 (configurable).
- Agents run once per bundle in downstream phase.
- QA/UAT are non-blocking advisory gates for deploy.
- `P0/P1` findings are auto-routed to `selected` as hotfix requirements.
- `P2/P3` findings are auto-routed to `backlog`.
- Strict non-automatable critical UAT checks are auto-routed to `human-decision-needed` as manual check packages.
- MAINT cleanup findings are auto-routed using the same severity routing (`P0/P1 -> selected`, `P2/P3 -> backlog`).

### 3) Legacy supervisor (`run.js`)
- `node run.js --mode standard`
- `node run.js --mode dev-only`

Only two modes are supported:
- `standard`: upstream loop (PO + ARCH/DEV) until backlog/planning is empty, then downstream bundle gates.
- `dev-only`: upstream only, no downstream.

Removed legacy modes: `detailed`, `bulk`, `fast`.

## Direct agent start

- Every agent can still be started directly:
- `node po/po.js`
- `node arch/arch.js`
- `node dev-fe/dev-fe.js`
- `node dev-be/dev-be.js`
- `node dev-fs/dev-fs.js`
- `node qa/qa.js`
- `node uat/uat.js`
- `node maint/maint.js`
- `node sec/sec.js`
- `node ux/ux.js`
- `node deploy/deploy.js`
- `node reqeng/reqeng.js`

Direct start behavior:
- Without runner/auto switch, the agent starts the normal Codex interactive CLI and resumes its local thread.
- In runner mode, agents are started with explicit CLI switches (for PO: `--runner`).

## Hotkeys and status

All long-running runners support:
- `v` toggle verbose output
- `s` print queue status snapshot
- `q` stop loop gracefully

Global pause guard:
- PO and Delivery react to provider limit errors (`usage limit`, `rate limit`, `insufficient_quota`, `try again at ...`).
- A shared pause state is written to `.runtime/pause-state.json`.
- While active, runners pause processing (no queue failure rerouting) and resume automatically after `resume_after`.

## Quick start

1) Setup local config:
- `node scripts/setup-project.js --repo-root /absolute/path/to/project`

2) Start PO and delivery in separate terminals:
- `node scripts/po-runner.js --mode vision`
- `node scripts/delivery-runner.js --mode full`

3) Optional manual full regression:
- `node scripts/delivery-runner.js --mode regression`

Optional legacy supervisor:
- `node run.js --mode standard`

## Config

`config.local.toml` is gitignored and project-specific.

Important sections:
- `[paths]`: `repo_root`, `requirements_root`, `docs_dir`, `product_vision_dir`
- `[loops]`: bundle sizes, polling, retry policy
- `[po]`: vision defaults and limits
- `[arch]`: trigger policy, risk/scope guards, docs digest behavior, retries
- `[deploy]`: `check | commit | commit_push` (default `commit_push`)
- `[deploy.pr]`: optional PR creation after deploy push (`enabled`, `provider`, `remote`, `base_branch`, `head_mode`, `head_branch`, templates). Template vars: `${type}` (`feat|fix|chore` inferred from branch), `${branch}`, `${base}`, `${remote}`
- `[dev_routing]`, `[dev_agents]`
- `[models]`
- Include optional per-agent model overrides such as `[models].uat` and `[models].maint`.

## Queues

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

Intake recommendation:
- Put unstructured requirements into `refinement`.
- Use an AI chat (e.g. ReqEng) to route into `backlog` or `selected`.
- ARCH/DEV/QA/SEC/UX/DEPLOY route unresolved items to `to-clarify`.
- PO intake ownership is `to-clarify`, `human-input`, `backlog`, `refinement`.
- PO resolves `to-clarify` when possible and escalates only hard unresolved conflicts to `human-decision-needed`.
- Items in `human-decision-needed` are human-owned and must not be moved by autonomous runners.
- After manual evaluation, move items to `human-input`; PO ingests `human-input` in the next iteration.

## Git safety

- Thread/runtime files are under `.runtime/` and ignored by git.
- Requirement payload markdown is ignored by git; queue folder structure is tracked via `.gitkeep`.
- Delivery git actions are executed only in `paths.repo_root`.
- Safety check prevents commits to the `agents` repo.

## Codex usage

Works with ChatGPT Codex variants.
For sustained autonomous runs, PRO limits are usually the most practical.
Cloud-agent copies are possible, but limits are often consumed quickly.

## Windows

Use same Node commands in PowerShell/CMD/Git Bash:
- `node scripts/setup-project.js --repo-root "C:\\git\\my-project"`
- `node scripts/po-runner.js --mode vision`
- `node scripts/delivery-runner.js --mode full`
- `node run.js --mode standard`
