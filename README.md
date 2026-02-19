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

### 1) ReqEng (interactive human discussion)
- `node reqeng-cli.js`

Purpose:
- Discusses with a human and routes requirement input to:
- `refinement` (unclear/unstructured),
- `backlog` (clear, later),
- `selected` (clear, immediate),
- or `human-input` (after a human decision cycle).

### 2) PO runner (autonomous processing)
- `node po-runner.js --mode vision`
- `node po-runner.js --mode intake`
- `node po/po.js --runner --mode vision`
- `node po/po.js --runner --mode intake`

Modes:
- `intake`: consumes `to-clarify`, `human-input`, `refinement`, `backlog` and prepares executable bundles in `selected`.
- `vision`: autonomous Product Vision breakdown until vision is implemented.

PO vision rules:
- Product Vision files have priority over generic docs.
- PO may update docs and requirements autonomously.
- PO reconciles `released` outcomes against vision/docs and creates follow-up requirements for detected gaps.
- PO escalates to `human-decision-needed` only for hard vision conflicts/violations.

### 3) Delivery runner
- `node delivery-runner.js --mode full`
- `node delivery-runner.js --mode fast`
- `node delivery-runner.js --mode test`

Modes:
- `full`: selected -> arch intake -> (ARCH agent if triggered, else fast-pass to DEV), then downstream once-per-bundle gates (UX -> SEC -> QA -> UAT -> DEPLOY), followed by QA post-bundle sanity and MAINT post-deploy hygiene scan. When Product Vision is marked complete and queues are drained, runner auto-triggers one comprehensive final test over `released` (UX final + SEC final + QA final + optional deterministic E2E + UAT full regression).
- `fast`: selected -> arch intake -> (ARCH agent if triggered, else fast-pass to DEV), no downstream gates.
- `test`: quality/regression mode. Runs delivery quality gates without deploy git actions and then performs a comprehensive full-system test over `released`. If `[e2e].required_in_test_mode=true`, deterministic E2E is a mandatory gate.

Bundle behavior:
- Bundles start from `selected`.
- Priority uses `business_score` in requirement front matter.
- Default bundle range: 5-20 (configurable).
- Agents run once per bundle in downstream phase.
- DEV has a watchdog + recovery ladder (`same-thread retry -> fresh-thread retry -> route to to-clarify`) to prevent infinite loops on a single requirement.
- Default quality mode is strict: QA and UAT must pass before deploy.
- On QA/UAT fail, the same bundle is routed back to `dev` for rework (bounded by `delivery_quality.max_fix_cycles`), then retried.
- If max fix cycles are exceeded, the bundle is routed to `to-clarify` (no silent endless loop).
- `P0/P1` findings are auto-routed to `selected` as hotfix requirements.
- `P2/P3` findings are auto-routed to `backlog`.
- Strict non-automatable critical UAT checks are auto-routed to `human-decision-needed` as manual check packages.
- MAINT cleanup findings are auto-routed using the same severity routing (`P0/P1 -> selected`, `P2/P3 -> backlog`).

Deterministic E2E:
- Controlled via `[e2e]` config.
- Recommended runner: Playwright (Selenium still possible via shell command).
- Runner executes shell commands in this order: `setup_commands` -> `healthcheck_commands` -> `test_command` -> `teardown_command`.
- In `mode=test`, deterministic E2E can be enforced as a hard gate.
- If `required_in_test_mode=true` and E2E is not configured (`enabled=false` or missing `test_command`), `mode=test` fails by design.
- Recommended for deterministic runs: `workers=1`, `retries=0`, fixed fixtures/environment.

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
- `node reqeng-cli.js`

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
- `node setup-project.js --repo-root /absolute/path/to/project`

2) Variant A (human-driven intake):
- terminal 1: `node reqeng-cli.js`
- terminal 2: `node po-runner.js --mode intake`
- terminal 3: `node delivery-runner.js --mode full`

3) Variant B (autonomous vision):
- terminal 1: `node po-runner.js --mode vision`
- terminal 2: `node delivery-runner.js --mode full`

4) Optional fast delivery (no downstream gates):
- `node delivery-runner.js --mode fast`

5) Optional full regression test mode:
- `node delivery-runner.js --mode test`

## Config

`config.local.toml` is gitignored and project-specific.

Important sections:
- `[paths]`: `repo_root`, `requirements_root`, `docs_dir`, `product_vision_dir`
- `[loops]`: bundle sizes, polling, retry policy
- `[delivery_runner]`: `default_mode = full|fast|test`
- `[delivery_quality]`: strict QA/UAT gate behavior and bounded fix loop
- `[e2e]`: deterministic full E2E configuration (`enabled`, `required_in_test_mode`, `run_on_full_completion`, commands, timeout, env)
- `[po]`: vision defaults and limits
- `loops.force_underfilled_after_cycles`: starts underfilled bundles after N idle cycles (default `3`)
- `[po].backlog_promote_*`: auto-promote sticky/high-value backlog items to `selected`
- `[arch]`: trigger policy, risk/scope guards, docs digest behavior, retries
- `[dev]`: watchdog timeout + recovery retries for stuck DEV runs
- `[deploy]`: `check | commit | commit_push` (default `commit_push`)
- `[deploy.pr]`: optional PR creation after deploy push (`enabled`, `provider`, `remote`, `base_branch`, `head_mode`, `head_branch`, templates). Template vars: `${type}` (`feat|fix|chore` inferred from branch), `${branch}`, `${base}`, `${remote}`
- `[dev_routing]`, `[dev_agents]`
- `[qa]`: `mandatory_checks` + `run_checks_in_runner` for deterministic pre-QA checks
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
- `node setup-project.js --repo-root "C:\\git\\my-project"`
- `node po-runner.js --mode vision`
- `node delivery-runner.js --mode full`
- `node reqeng-cli.js`
