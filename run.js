#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");
const { loadRuntimeConfig, ensureQueueDirs } = require("./lib/runtime");
const { listQueueFiles, countFiles, sleep } = require("./scripts/lib/flow-core");

function parseArgs(argv) {
  const args = {
    help: false,
    mode: "",
    once: false,
    verbose: undefined,
    preflight: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i] || "");
    const arg = raw.toLowerCase();

    if (arg === "-h" || arg === "--help") {
      args.help = true;
      continue;
    }

    if (arg === "--once" || arg === "-once") {
      args.once = true;
      continue;
    }

    if (arg === "-v" || arg === "--verbose") {
      args.verbose = true;
      continue;
    }
    if (arg === "--no-verbose") {
      args.verbose = false;
      continue;
    }

    if (arg === "--mode" || arg === "--flow") {
      args.mode = String(argv[i + 1] || "").toLowerCase();
      i++;
      continue;
    }
    if (arg.startsWith("--mode=") || arg.startsWith("--flow=")) {
      args.mode = String(raw.split("=", 2)[1] || "").toLowerCase();
      continue;
    }

    if (arg === "--standard") {
      args.mode = "standard";
      continue;
    }
    if (arg === "--dev-only" || arg === "--devonly") {
      args.mode = "dev-only";
      continue;
    }

    if (arg === "--preflight") {
      args.preflight = String(argv[i + 1] || "").toLowerCase();
      i++;
      continue;
    }
    if (arg.startsWith("--preflight=")) {
      args.preflight = String(raw.split("=", 2)[1] || "").toLowerCase();
      continue;
    }
  }

  return args;
}

function usage() {
  console.log(
    "Usage: node run.js [--mode standard|dev-only] [--preflight hard|soft|none|snapshot] [--once] [--verbose|--no-verbose]"
  );
}

function normalizeMode(value, fallback = "standard") {
  const normalized = String(value || fallback || "").toLowerCase();
  if (["dev-only", "dev_only", "devonly"].includes(normalized)) {
    return "dev-only";
  }
  if (["standard", "auto"].includes(normalized)) {
    return "standard";
  }
  return fallback;
}

function normalizePreflight(value, fallback = "soft") {
  const normalized = String(value || fallback || "").toLowerCase();
  if (["hard", "soft", "none", "snapshot"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function runGit(repoRoot, args) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitRoot(dir) {
  const result = runGit(dir, ["rev-parse", "--show-toplevel"]);
  if (result.status !== 0) {
    return "";
  }
  return String(result.stdout || "").trim();
}

function isDirty(repoRoot) {
  const result = runGit(repoRoot, ["status", "--porcelain"]);
  if (result.status !== 0) {
    return false;
  }
  return String(result.stdout || "").trim().length > 0;
}

function queueSummary(runtime) {
  return {
    refinement: countFiles(runtime.queues.refinement),
    backlog: countFiles(runtime.queues.backlog),
    selected: countFiles(runtime.queues.selected),
    arch: countFiles(runtime.queues.arch),
    dev: countFiles(runtime.queues.dev),
    qa: countFiles(runtime.queues.qa),
    ux: countFiles(runtime.queues.ux),
    sec: countFiles(runtime.queues.sec),
    deploy: countFiles(runtime.queues.deploy),
    released: countFiles(runtime.queues.released),
    toClarify: countFiles(runtime.queues.toClarify),
    blocked: countFiles(runtime.queues.blocked),
  };
}

function formatSummary(summary) {
  return [
    `refinement=${summary.refinement}`,
    `backlog=${summary.backlog}`,
    `selected=${summary.selected}`,
    `arch=${summary.arch}`,
    `dev=${summary.dev}`,
    `qa=${summary.qa}`,
    `ux=${summary.ux}`,
    `sec=${summary.sec}`,
    `deploy=${summary.deploy}`,
    `released=${summary.released}`,
    `to-clarify=${summary.toClarify}`,
    `blocked=${summary.blocked}`,
  ].join(" ");
}

function createControls(initialVerbose, runtime) {
  const controls = {
    verbose: Boolean(initialVerbose),
    stopRequested: false,
    cleanup() {},
  };

  if (!process.stdin.isTTY) {
    return controls;
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  const onKeypress = (str, key) => {
    if (!key) {
      return;
    }
    if (key.ctrl && key.name === "c") {
      controls.stopRequested = true;
      return;
    }
    if ((key.name || "").toLowerCase() === "v") {
      controls.verbose = !controls.verbose;
      process.stdout.write(`\nMODE: verbose=${controls.verbose}\n`);
      return;
    }
    if ((key.name || "").toLowerCase() === "s") {
      process.stdout.write(`\nSTATUS: ${formatSummary(queueSummary(runtime))}\n`);
      return;
    }
    if ((key.name || "").toLowerCase() === "q") {
      controls.stopRequested = true;
      return;
    }
  };

  process.stdin.on("keypress", onKeypress);
  controls.cleanup = () => {
    process.stdin.removeListener("keypress", onKeypress);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  };

  return controls;
}

function log(controls, message) {
  if (controls.verbose) {
    process.stdout.write(`FLOW: ${message}\n`);
  }
}

function hashQueues(runtime) {
  const rows = [];
  for (const dir of Object.values(runtime.queues)) {
    for (const file of listQueueFiles(dir)) {
      const stat = fs.statSync(file);
      rows.push(`${file}|${stat.size}|${Math.round(stat.mtimeMs)}`);
    }
  }
  return rows.sort().join("\n");
}

function runNodeScript(scriptPath, args, cwd) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    stdio: "inherit",
    env: { ...process.env },
  });
  return result.status === 0;
}

function planningPending(runtime) {
  return countFiles(runtime.queues.backlog) > 0
    || countFiles(runtime.queues.selected) > 0
    || countFiles(runtime.queues.toClarify) > 0
    || countFiles(runtime.queues.arch) > 0
    || countFiles(runtime.queues.dev) > 0;
}

function downstreamPending(runtime) {
  return countFiles(runtime.queues.qa) > 0
    || countFiles(runtime.queues.ux) > 0
    || countFiles(runtime.queues.sec) > 0
    || countFiles(runtime.queues.deploy) > 0;
}

function ensureNotAgentsRepo(runtime) {
  const agentsGitRoot = gitRoot(runtime.agentsRoot);
  const targetGitRoot = gitRoot(runtime.repoRoot);
  if (!targetGitRoot) {
    return;
  }
  if (agentsGitRoot && targetGitRoot && agentsGitRoot === targetGitRoot) {
    throw new Error("paths.repo_root points to agents repo. Refusing to run.");
  }
}

function runPreflight(mode, runtime, controls) {
  if (mode === "none") {
    log(controls, "preflight disabled");
    return;
  }

  if (!fs.existsSync(runtime.repoRoot)) {
    throw new Error(`repo root missing: ${runtime.repoRoot}`);
  }
  ensureNotAgentsRepo(runtime);

  const hasGit = Boolean(gitRoot(runtime.repoRoot));
  if (!hasGit) {
    if (mode === "hard" || mode === "snapshot") {
      throw new Error("preflight requires git repository but repo_root is not git");
    }
    log(controls, "preflight soft: repo_root is not a git repository");
    return;
  }

  const dirty = isDirty(runtime.repoRoot);
  if (mode === "hard" && dirty) {
    throw new Error("preflight hard failed: target repository has uncommitted changes");
  }

  if (mode === "snapshot" && dirty) {
    const prefix = runtime.preflight && runtime.preflight.snapshotCommitMessagePrefix
      ? runtime.preflight.snapshotCommitMessagePrefix
      : "chore(flow): preflight snapshot";
    runGit(runtime.repoRoot, ["add", "-A"]);
    const commit = runGit(runtime.repoRoot, ["commit", "-m", `${prefix} ${new Date().toISOString()}`]);
    if (commit.status !== 0) {
      const stdout = String(commit.stdout || "").trim();
      const stderr = String(commit.stderr || "").trim();
      throw new Error(`preflight snapshot commit failed: ${stdout || stderr || "unknown error"}`);
    }
    log(controls, "preflight snapshot commit created");
  }

  if (mode === "soft" && dirty) {
    log(controls, "preflight soft: target repository is dirty; continuing");
  }
}

async function runCycle(mode, runtime, controls) {
  const root = runtime.agentsRoot;
  const poArgs = ["--runner", "--mode", "intake", "--once"];
  const devOnlyArgs = ["--mode", "dev-only", "--once"];
  const fullArgs = ["--mode", "full", "--once"];
  if (controls.verbose) {
    poArgs.push("--verbose");
    devOnlyArgs.push("--verbose");
    fullArgs.push("--verbose");
  }

  let anyRun = false;

  if (mode === "dev-only") {
    log(controls, "cycle mode=dev-only");
    runNodeScript(path.join(root, "po", "po.js"), poArgs, root);
    runNodeScript(path.join(root, "scripts", "delivery-runner.js"), devOnlyArgs, root);
    return true;
  }

  if (planningPending(runtime)) {
    log(controls, "cycle standard upstream: PO + ARCH/DEV");
    runNodeScript(path.join(root, "po", "po.js"), poArgs, root);
    runNodeScript(path.join(root, "scripts", "delivery-runner.js"), devOnlyArgs, root);
    anyRun = true;
  } else if (downstreamPending(runtime)) {
    log(controls, "cycle standard downstream: UX -> SEC -> QA -> DEPLOY");
    runNodeScript(path.join(root, "scripts", "delivery-runner.js"), fullArgs, root);
    anyRun = true;
  } else {
    log(controls, "cycle standard idle: waiting for backlog/selected input");
  }

  return anyRun;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const runtime = loadRuntimeConfig(path.resolve(__dirname));
  ensureQueueDirs(runtime.queues);

  const mode = normalizeMode(args.mode || runtime.runDefaults.flow || runtime.flow.defaultMode, "standard");
  const preflightMode = normalizePreflight(args.preflight || runtime.runDefaults.preflight || "soft", "soft");

  const controls = createControls(
    typeof args.verbose === "boolean" ? args.verbose : Boolean(runtime.runDefaults.verbose),
    runtime
  );
  process.on("exit", () => controls.cleanup());

  if (!mode || !["standard", "dev-only"].includes(mode)) {
    throw new Error("Only mode standard|dev-only is supported.");
  }

  runPreflight(preflightMode, runtime, controls);

  log(controls, `mode=${mode}`);
  log(controls, `preflight=${preflightMode}`);
  log(controls, `status hotkeys: v=verbose, s=status, q=quit`);

  while (!controls.stopRequested) {
    const before = hashQueues(runtime);
    await runCycle(mode, runtime, controls);

    if (args.once) {
      break;
    }

    const after = hashQueues(runtime);
    if (before === after) {
      await sleep(Math.max(1, runtime.flow.idlePollSeconds) * 1000);
    }
  }

  controls.cleanup();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
