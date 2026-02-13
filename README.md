# agents

Orchestrator for requirement queues and role agents.

The design intentionally has no `blocked` queue. Unclear or failed items route to `to-clarify`.

## Setup

```bash
npm run setup -- --repo-root /abs/path/to/project
```

Prerequisite: install the standard Codex CLI (`codex`) and make sure it is on `PATH`.

## Interactive agents (standard Codex CLI)

All agent chat launchers now use the standard interactive Codex CLI with persistent threads.

- First start per agent: bootstrap prompt is injected once into a fresh thread.
- Next starts: always `codex resume <thread-id>` for that same agent thread.
- Thread files are stored under `.runtime/threads/` and are gitignored.
- A lock file is used per interactive agent thread to prevent concurrent writes from multiple terminals.
- If you change a role prompt and want a clean re-bootstrap, delete that agent thread file in `.runtime/threads/<agent>/`.
- Background flow runners (`run.js`, `scripts/run-po.js`, `scripts/run-ops.js`) stay non-interactive and use `codex exec`.
- Interactive launchers require a real TTY terminal.

Common commands:

```bash
npm run reqeng
npm run agent:po
npm run agent:arch
npm run agent:dev
npm run agent:qa
npm run agent:sec
npm run agent:ux
npm run agent:deploy
```

Windows (PowerShell / CMD) uses the same npm commands.

## Modes

### 1) `auto` (separate PO and OPS)

Run in two terminals:

```bash
npm run po
npm run ops
```

Equivalent node commands:

```bash
node po/po.js --runner --mode vision
node run.js --mode auto
```

- PO loop: `backlog/refinement/to-clarify -> selected`.
- OPS loop: `selected/arch/dev -> qa -> sec -> ux -> deploy -> released`.
- Product Vision files are required for PO in this mode.
- OPS is long-running; `PO --mode intake` is long-running; `PO --mode vision` is finite and exits on convergence or human-handoff.

PO mode behavior:
- `node po/po.js --runner --mode intake`: queue-driven (`to-clarify`, `backlog`, `refinement` -> `selected`).
- `node po/po.js --runner --mode vision`: iterates Product Vision into requirements with convergence guardrails.
  - defaults: `vision_max_cycles=100`, `vision_max_requirements=1000`, `vision_stable_cycles=2`
  - if human steering is required (for example vision overflow), `run-po` exits with code `2` and routes to `to-clarify`.

### 2) `standard` (single orchestrated loop)

```bash
npm run start
# or
npm run start -- --mode standard
# optional preflight override:
npm run start -- --mode standard --preflight soft
```

- Combined cycle in one process:
  - one PO planning pass in `intake` mode (`backlog/refinement/to-clarify -> selected`)
  - one OPS delivery pass (`selected/arch/dev/qa/sec/ux/deploy`)
- This mode is intended for manual intake via ReqEng into `backlog`.
- Product Vision is optional here (no hard precheck).

### 3) `dev-only` (ARCH + DEV only)

```bash
npm run start -- --mode dev-only
```

- Runs only architecture + development chain:
  - `selected/arch -> dev -> qa`
- No QA/SEC/UX/DEPLOY execution in this mode.

## Queue model

Queues:

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

Routing principles:

- `pass`: next queue.
- `clarify`/`improve`/non-pass: `to-clarify`.
- `target_queue` decision key may override when valid.

## Config

Setup writes `config.local.toml` (gitignored).

Relevant keys:

- `[paths].repo_root`
- `[paths].requirements_root`
- `[paths].docs_dir`
- `[paths].product_vision_dir`
  - default if empty: `<paths.docs_dir>/product-operating-system`
- `[run_defaults].flow`
  - `auto | standard | dev-only`
- `[run_defaults].preflight`
  - `hard | soft | none | snapshot`
- `[loops].window_size`, `[loops].po_poll_seconds`, `[loops].ops_poll_seconds`
- `[deploy].mode`
  - `check | commit | commit_push`
- `[deploy].final_push_on_success`
- `[deploy].require_clean_start_for_commits`

## Preflight and Git safety

- `hard`: fails when target repo is dirty.
- `soft` (default): allows dirty start, but can disable deploy commits/push based on config.
- `snapshot`: creates a snapshot commit before run when dirty.
- `none`: skips preflight checks.
- Safety guard: deploy/preflight git writes are blocked if `paths.repo_root` resolves to the same git repository as `agents`.

## Deploy git actions

- Deploy agent only evaluates readiness; git actions are done by `run.js`.
- `deploy.mode = check`: no commit/push.
- `deploy.mode = commit`: commit release batch changes.
- `deploy.mode = commit_push`: commit and push release batch changes.
- `deploy.final_push_on_success = true` allows final push in `commit` mode on `--once` runs.

## Product Vision priority

- `po` and `arch` use Product Vision files from `[paths].product_vision_dir`.
- If Product Vision conflicts with other docs under `[paths].docs_dir`, Product Vision wins.
- PO may adjust Product Vision only with minimal targeted changes.
