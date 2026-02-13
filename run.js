#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { loadRuntimeConfig } = require("./lib/runtime");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {
    mode: "",
    once: false,
    verbose: false,
    preflight: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    const normalized = arg.toLowerCase();

    if (normalized === "--mode" || normalized === "-mode" || normalized === "--flow") {
      args.mode = String(argv[i + 1] || "");
      i++;
      continue;
    }
    if (normalized.startsWith("--mode=") || normalized.startsWith("--flow=")) {
      args.mode = String(arg.split("=", 2)[1] || "");
      continue;
    }
    if (normalized === "--preflight" || normalized === "-preflight") {
      args.preflight = String(argv[i + 1] || "");
      i++;
      continue;
    }
    if (normalized.startsWith("--preflight=")) {
      args.preflight = String(arg.split("=", 2)[1] || "");
      continue;
    }
    if (normalized === "--once" || normalized === "-once") {
      args.once = true;
      continue;
    }
    if (normalized === "--verbose" || normalized === "-v") {
      args.verbose = true;
      continue;
    }
  }

  return args;
}

function normalizeMode(value, fallback = "standard") {
  const normalized = String(value || fallback || "").trim().toLowerCase();
  if (normalized === "auto") {
    return "auto";
  }
  if (["dev-only", "dev_only", "devonly"].includes(normalized)) {
    return "dev-only";
  }
  return "standard";
}

function normalizePreflightMode(value, fallback = "soft") {
  const normalized = String(value || fallback || "").trim().toLowerCase();
  if (["hard", "soft", "none", "snapshot"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function toRealPath(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(String(value || ""));
  }
}

function countQueueFiles(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return 0;
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .length;
}

function readDeployQueueStats(runtime) {
  return {
    deploy: countQueueFiles(runtime.queues.deploy),
    released: countQueueFiles(runtime.queues.released),
  };
}

function runNodeScript(scriptPath, args, cwd, inheritOutput) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [scriptPath, ...(args || [])], {
      cwd,
      stdio: inheritOutput ? "inherit" : ["ignore", "pipe", "pipe"],
    });

    let stdoutText = "";
    let stderrText = "";

    if (!inheritOutput) {
      proc.stdout.on("data", (chunk) => {
        stdoutText += String(chunk || "");
        if (stdoutText.length > 20000) {
          stdoutText = stdoutText.slice(-20000);
        }
      });
      proc.stderr.on("data", (chunk) => {
        stderrText += String(chunk || "");
        if (stderrText.length > 20000) {
          stderrText = stderrText.slice(-20000);
        }
      });
    }

    proc.once("close", (exitCode) => {
      resolve({
        ok: exitCode === 0,
        exitCode: Number.isInteger(exitCode) ? exitCode : 1,
        stdout: stdoutText,
        stderr: stderrText,
      });
    });
  });
}

function runCommand(command, args, cwd) {
  return new Promise((resolve) => {
    const proc = spawn(command, Array.isArray(args) ? args : [], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutText = "";
    let stderrText = "";
    proc.stdout.on("data", (chunk) => {
      stdoutText += String(chunk || "");
      if (stdoutText.length > 50000) {
        stdoutText = stdoutText.slice(-50000);
      }
    });
    proc.stderr.on("data", (chunk) => {
      stderrText += String(chunk || "");
      if (stderrText.length > 50000) {
        stderrText = stderrText.slice(-50000);
      }
    });

    proc.once("close", (exitCode) => {
      resolve({
        ok: exitCode === 0,
        exitCode: Number.isInteger(exitCode) ? exitCode : 1,
        stdout: stdoutText,
        stderr: stderrText,
      });
    });
  });
}

function emitFailure(label, result) {
  const stderrTail = String(result.stderr || "").trim().split(/\r?\n/).slice(-3).join(" | ");
  if (stderrTail) {
    console.error(`FLOW: ${label} failed (${stderrTail})`);
  } else {
    console.error(`FLOW: ${label} failed (exit=${result.exitCode})`);
  }
}

function logVerbose(verbose, message) {
  if (verbose) {
    process.stdout.write(`FLOW: ${message}\n`);
  }
}

function ensureDirectoryExists(dirPath, label) {
  if (!dirPath) {
    throw new Error(`Missing required path for ${label}`);
  }
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Missing required path for ${label}: ${dirPath}`);
  }
  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`Expected directory for ${label}: ${dirPath}`);
  }
}

async function resolveGitRoot(cwd) {
  const result = await runCommand("git", ["rev-parse", "--show-toplevel"], cwd);
  if (!result.ok) {
    return "";
  }
  const root = String(result.stdout || "").trim();
  return root ? toRealPath(root) : "";
}

async function isGitDirty(cwd) {
  const result = await runCommand("git", ["status", "--porcelain"], cwd);
  if (!result.ok) {
    throw new Error(`git status failed in ${cwd}: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return String(result.stdout || "").trim().length > 0;
}

async function runGit(cwd, args, label) {
  const result = await runCommand("git", args, cwd);
  if (!result.ok) {
    const details = (result.stderr || result.stdout || "").trim();
    throw new Error(`${label} failed: ${details || `git ${args.join(" ")} (exit ${result.exitCode})`}`);
  }
  return result;
}

async function stageAndCommit(cwd, message, labelPrefix) {
  await runGit(cwd, ["add", "-A"], `${labelPrefix} git add`);
  const dirty = await isGitDirty(cwd);
  if (!dirty) {
    return false;
  }
  await runGit(cwd, ["commit", "-m", message], `${labelPrefix} git commit`);
  return true;
}

async function pushChanges(cwd, labelPrefix) {
  await runGit(cwd, ["push"], `${labelPrefix} git push`);
}

function createPreflightState(mode) {
  return {
    mode,
    gitAvailable: false,
    targetGitRoot: "",
    agentsGitRoot: "",
    sameGitRepo: false,
    dirtyAtStart: false,
    deployWritesAllowed: true,
    deployWritesBlockedReason: "",
    snapshotCreated: false,
  };
}

function ensureWriteTargetSafe(runtime, state, purpose) {
  if (!state.gitAvailable || !state.targetGitRoot) {
    throw new Error(`${purpose}: target repo is not a git repository (${runtime.repoRoot})`);
  }
  if (state.sameGitRepo) {
    throw new Error(`${purpose}: blocked because repo_root points to agents repository (${runtime.repoRoot})`);
  }
}

async function runPreflight(runtime, preflightMode, verbose) {
  const state = createPreflightState(preflightMode);
  ensureDirectoryExists(runtime.repoRoot, "paths.repo_root");
  ensureDirectoryExists(runtime.requirementsRoot, "paths.requirements_root");
  if (String(runtime.docsDir || "").trim()) {
    ensureDirectoryExists(runtime.docsDir, "paths.docs_dir");
  }

  state.targetGitRoot = await resolveGitRoot(runtime.repoRoot);
  state.agentsGitRoot = await resolveGitRoot(runtime.agentsRoot);
  state.gitAvailable = Boolean(state.targetGitRoot);
  state.sameGitRepo = Boolean(
    state.targetGitRoot &&
    state.agentsGitRoot &&
    toRealPath(state.targetGitRoot) === toRealPath(state.agentsGitRoot)
  );

  if (state.sameGitRepo && runtime.deploy.mode !== "check") {
    throw new Error("preflight: repo_root resolves to agents repo; git writes are blocked for safety");
  }

  if (preflightMode === "none") {
    if (!state.gitAvailable && runtime.deploy.mode !== "check") {
      state.deployWritesAllowed = false;
      state.deployWritesBlockedReason = "repo_root is not a git repository";
    }
    logVerbose(verbose, "preflight skipped (mode=none)");
    return state;
  }

  if (!state.gitAvailable) {
    if (preflightMode === "hard" || preflightMode === "snapshot" || runtime.deploy.mode !== "check") {
      throw new Error(`preflight ${preflightMode}: repo_root is not a git repository (${runtime.repoRoot})`);
    }
    state.deployWritesAllowed = false;
    state.deployWritesBlockedReason = "repo_root is not a git repository";
    logVerbose(verbose, "preflight: git repo missing, deploy git writes disabled");
    return state;
  }

  const dirty = await isGitDirty(runtime.repoRoot);
  state.dirtyAtStart = dirty;
  logVerbose(verbose, `preflight: git dirty=${dirty}`);

  if (preflightMode === "hard" && dirty) {
    throw new Error("preflight hard: target repository has uncommitted changes");
  }

  if (preflightMode === "soft" && dirty && runtime.deploy.requireCleanStartForCommits) {
    state.deployWritesAllowed = false;
    state.deployWritesBlockedReason = "soft preflight started dirty and deploy.require_clean_start_for_commits=true";
    logVerbose(verbose, "preflight: deploy git writes disabled due to dirty start");
  }

  if (preflightMode === "snapshot" && dirty) {
    ensureWriteTargetSafe(runtime, state, "preflight snapshot");
    const message = `${runtime.preflight.snapshotCommitMessagePrefix}: ${new Date().toISOString()}`;
    const committed = await stageAndCommit(runtime.repoRoot, message, "preflight snapshot");
    if (committed) {
      state.snapshotCreated = true;
      state.dirtyAtStart = false;
      logVerbose(verbose, "preflight snapshot: created snapshot commit");
    } else {
      logVerbose(verbose, "preflight snapshot: no changes to commit");
    }
  }

  return state;
}

async function runDeployGitActions({ runtime, preflightState, verbose, finalPush }) {
  const mode = String(runtime.deploy.mode || "check").toLowerCase();
  if (mode === "check") {
    logVerbose(verbose, "deploy git: mode=check (no git write)");
    return { committed: false, pushed: false, skipped: true };
  }

  if (!preflightState.gitAvailable) {
    logVerbose(verbose, "deploy git: skipped (target repo not git)");
    return { committed: false, pushed: false, skipped: true };
  }

  if (!preflightState.deployWritesAllowed) {
    logVerbose(verbose, `deploy git: skipped (${preflightState.deployWritesBlockedReason || "writes disabled"})`);
    return { committed: false, pushed: false, skipped: true };
  }

  ensureWriteTargetSafe(runtime, preflightState, "deploy git");

  const dirty = await isGitDirty(runtime.repoRoot);
  if (!dirty) {
    logVerbose(verbose, "deploy git: no pending changes");
    return { committed: false, pushed: false, skipped: true };
  }

  const commitMessage = `chore(deploy): release batch ${new Date().toISOString()}`;
  const committed = await stageAndCommit(runtime.repoRoot, commitMessage, "deploy");
  if (!committed) {
    logVerbose(verbose, "deploy git: nothing to commit");
    return { committed: false, pushed: false, skipped: true };
  }

  const shouldPush =
    mode === "commit_push" ||
    (mode === "commit" && Boolean(finalPush) && Boolean(runtime.deploy.finalPushOnSuccess));
  if (!shouldPush) {
    logVerbose(verbose, "deploy git: commit done, push skipped by config");
    return { committed: true, pushed: false, skipped: false };
  }

  await pushChanges(runtime.repoRoot, "deploy");
  logVerbose(verbose, "deploy git: commit + push done");
  return { committed: true, pushed: true, skipped: false };
}

async function runAuto(runtime, args, scriptsRoot, preflightState) {
  const pollSeconds = Math.max(1, runtime.loops.opsPollSeconds || 20);
  console.log("FLOW: mode=auto (PO and OPS are separate; start PO in another terminal, e.g. `node scripts/run-po.js --mode vision` or `--mode intake`)");
  if (args.verbose) {
    console.log(`FLOW: auto poll=${pollSeconds}s`);
  }

  while (true) {
    const beforeStats = readDeployQueueStats(runtime);
    const opsArgs = ["--once", "--mode", "full"];
    if (args.verbose) {
      opsArgs.push("-v");
    }
    const result = await runNodeScript(path.join(scriptsRoot, "run-ops.js"), opsArgs, runtime.agentsRoot, args.verbose);
    if (!result.ok) {
      emitFailure("OPS(auto)", result);
      process.exit(result.exitCode || 1);
    }

    const afterStats = readDeployQueueStats(runtime);
    const deployTouched =
      beforeStats.deploy !== afterStats.deploy ||
      beforeStats.released !== afterStats.released;
    if (deployTouched) {
      await runDeployGitActions({
        runtime,
        preflightState,
        verbose: args.verbose,
        finalPush: Boolean(args.once),
      });
    }

    if (args.once) {
      break;
    }
    await sleep(pollSeconds * 1000);
  }
}

async function runStandard(runtime, args, scriptsRoot, preflightState) {
  const pollSeconds = Math.max(1, runtime.loops.opsPollSeconds || runtime.loops.poPollSeconds || 20);
  if (args.verbose) {
    console.log(`FLOW: mode=standard poll=${pollSeconds}s`);
  } else {
    console.log("FLOW: mode=standard");
  }

  while (true) {
    const poArgs = ["--once", "--mode", "intake", "--skip-product-vision-check"];
    if (args.verbose) {
      poArgs.push("-v");
    }
    const poResult = await runNodeScript(path.join(scriptsRoot, "run-po.js"), poArgs, runtime.agentsRoot, args.verbose);
    if (!poResult.ok) {
      emitFailure("PO(standard)", poResult);
    }

    const beforeStats = readDeployQueueStats(runtime);
    const opsArgs = ["--once", "--mode", "full"];
    if (args.verbose) {
      opsArgs.push("-v");
    }
    const opsResult = await runNodeScript(path.join(scriptsRoot, "run-ops.js"), opsArgs, runtime.agentsRoot, args.verbose);
    if (!opsResult.ok) {
      emitFailure("OPS(standard)", opsResult);
    }

    const afterStats = readDeployQueueStats(runtime);
    const deployTouched =
      beforeStats.deploy !== afterStats.deploy ||
      beforeStats.released !== afterStats.released;
    if (opsResult.ok && deployTouched) {
      await runDeployGitActions({
        runtime,
        preflightState,
        verbose: args.verbose,
        finalPush: Boolean(args.once),
      });
    }

    if (args.once) {
      break;
    }

    await sleep(pollSeconds * 1000);
  }
}

async function runDevOnly(runtime, args, scriptsRoot) {
  const pollSeconds = Math.max(1, runtime.loops.opsPollSeconds || 20);
  if (args.verbose) {
    console.log(`FLOW: mode=dev-only poll=${pollSeconds}s`);
  } else {
    console.log("FLOW: mode=dev-only");
  }

  while (true) {
    const opsArgs = ["--once", "--mode", "dev-only"];
    if (args.verbose) {
      opsArgs.push("-v");
    }
    const result = await runNodeScript(path.join(scriptsRoot, "run-ops.js"), opsArgs, runtime.agentsRoot, args.verbose);
    if (!result.ok) {
      emitFailure("OPS(dev-only)", result);
    }

    if (args.once) {
      break;
    }
    await sleep(pollSeconds * 1000);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtime = loadRuntimeConfig(__dirname);
  const mode = normalizeMode(args.mode || runtime.runDefaults.flow || runtime.flow.defaultMode || "standard");
  const preflightMode = normalizePreflightMode(
    args.preflight || runtime.runDefaults.preflight || "soft",
    "soft"
  );
  const scriptsRoot = path.join(__dirname, "scripts");

  console.log(`FLOW: preflight=${preflightMode} deploy_mode=${runtime.deploy.mode}`);
  const preflightState = await runPreflight(runtime, preflightMode, args.verbose);

  if (mode === "auto") {
    await runAuto(runtime, args, scriptsRoot, preflightState);
    return;
  }
  if (mode === "dev-only") {
    await runDevOnly(runtime, args, scriptsRoot);
    return;
  }
  await runStandard(runtime, args, scriptsRoot, preflightState);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
