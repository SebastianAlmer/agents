#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync, spawnSync } = require("child_process");
const {
  sleep,
  countFiles,
  listQueueFiles,
  moveRequirementFile,
  appendQueueSection,
  runNodeScript,
  chooseBundleByBusinessScore,
} = require("./lib/flow-core");
const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");

function parseArgs(argv) {
  const args = {
    help: false,
    once: false,
    verbose: false,
    mode: "full",
    minBundle: NaN,
    maxBundle: NaN,
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i] || "");
    const arg = raw.toLowerCase();

    if (arg === "--once" || arg === "-once") {
      args.once = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--verbose" || arg === "-v") {
      args.verbose = true;
      continue;
    }
    if (arg === "--no-verbose") {
      args.verbose = false;
      continue;
    }

    if (arg === "--mode" || arg === "-mode") {
      args.mode = String(argv[i + 1] || "").toLowerCase();
      i++;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      args.mode = String(raw.split("=", 2)[1] || "").toLowerCase();
      continue;
    }

    if (arg === "--min-bundle") {
      args.minBundle = Number.parseInt(String(argv[i + 1] || ""), 10);
      i++;
      continue;
    }
    if (arg.startsWith("--min-bundle=")) {
      args.minBundle = Number.parseInt(String(raw.split("=", 2)[1] || ""), 10);
      continue;
    }
    if (arg === "--max-bundle") {
      args.maxBundle = Number.parseInt(String(argv[i + 1] || ""), 10);
      i++;
      continue;
    }
    if (arg.startsWith("--max-bundle=")) {
      args.maxBundle = Number.parseInt(String(raw.split("=", 2)[1] || ""), 10);
      continue;
    }
  }

  if (["dev-only", "dev_only", "devonly"].includes(args.mode)) {
    args.mode = "dev-only";
  } else {
    args.mode = "full";
  }

  return args;
}

function usage() {
  console.log(
    "Usage: node scripts/delivery-runner.js [--mode full|dev-only] [--once] [--verbose|--no-verbose] [--min-bundle N] [--max-bundle N]"
  );
}

function normalizePositiveInt(value, fallback, min = 1) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
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
    process.stdout.write(`DELIVERY: ${message}\n`);
  }
}

function moveToQueue(runtime, sourcePath, targetQueue, status, noteLines) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return false;
  }
  if (!runtime.queues[targetQueue]) {
    return false;
  }
  if (Array.isArray(noteLines) && noteLines.length > 0) {
    appendQueueSection(sourcePath, noteLines);
  }

  const raw = fs.readFileSync(sourcePath, "utf8");
  const next = raw.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (match, frontMatter) => {
    if (/^status\s*:/m.test(frontMatter)) {
      return `---\n${frontMatter.replace(/^status\s*:.*$/m, `status: ${status}`)}\n---`;
    }
    return `---\n${frontMatter}\nstatus: ${status}\n---`;
  });
  fs.writeFileSync(sourcePath, next, "utf8");

  const targetPath = path.join(runtime.queues[targetQueue], path.basename(sourcePath));
  return moveRequirementFile(sourcePath, targetPath);
}

function moveAll(runtime, fromQueue, toQueue, status, note) {
  const files = listQueueFiles(runtime.queues[fromQueue]);
  let moved = 0;
  for (const file of files) {
    if (moveToQueue(runtime, file, toQueue, status, [note])) {
      moved += 1;
    }
  }
  return moved;
}

function pickDevScript(runtime, requirementPath) {
  const raw = fs.readFileSync(requirementPath, "utf8");
  const frontMatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  let scope = String(runtime.devRouting.defaultScope || "fullstack").toLowerCase();
  if (frontMatter) {
    const lines = frontMatter[1].split(/\r?\n/);
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx === -1) {
        continue;
      }
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim().toLowerCase();
      if (["implementation_scope", "dev_scope", "scope"].includes(key) && value) {
        scope = value;
        break;
      }
    }
  }

  if (runtime.devRouting.mode === "split") {
    if (["frontend", "fe", "ui", "web"].includes(scope) && runtime.devAgents.useFe) {
      return path.join(runtime.agentsRoot, "dev-fe", "dev-fe.js");
    }
    if (["backend", "be", "api", "server"].includes(scope) && runtime.devAgents.useBe) {
      return path.join(runtime.agentsRoot, "dev-be", "dev-be.js");
    }
  }

  if (runtime.devAgents.useFs) {
    return path.join(runtime.agentsRoot, "dev-fs", "dev-fs.js");
  }
  if (runtime.devAgents.useFe) {
    return path.join(runtime.agentsRoot, "dev-fe", "dev-fe.js");
  }
  if (runtime.devAgents.useBe) {
    return path.join(runtime.agentsRoot, "dev-be", "dev-be.js");
  }
  return path.join(runtime.agentsRoot, "dev", "dev.js");
}

function planningInProgress(runtime) {
  return countFiles(runtime.queues.arch) > 0 || countFiles(runtime.queues.dev) > 0;
}

function downstreamInProgress(runtime) {
  return countFiles(runtime.queues.qa) > 0
    || countFiles(runtime.queues.ux) > 0
    || countFiles(runtime.queues.sec) > 0
    || countFiles(runtime.queues.deploy) > 0;
}

function startBundleIfReady(runtime, minBundle, maxBundle, underfilledCycles, controls) {
  if (planningInProgress(runtime) || downstreamInProgress(runtime)) {
    return { started: false, underfilledCycles };
  }

  const selectedCount = countFiles(runtime.queues.selected);
  if (selectedCount === 0) {
    return { started: false, underfilledCycles: 0 };
  }

  const allowUnderfilled = underfilledCycles >= runtime.loops.forceUnderfilledAfterCycles;
  if (selectedCount < minBundle && !allowUnderfilled) {
    log(controls, `waiting for fuller bundle: selected=${selectedCount} min=${minBundle}`);
    return { started: false, underfilledCycles: underfilledCycles + 1 };
  }

  const picked = chooseBundleByBusinessScore(runtime.queues.selected, maxBundle);
  if (picked.length === 0) {
    return { started: false, underfilledCycles };
  }

  for (const file of picked) {
    moveToQueue(runtime, file, "arch", "arch", [
      "Delivery runner: bundle intake by business score",
      `- bundle size target max=${maxBundle}`,
    ]);
  }
  log(controls, `bundle started with ${picked.length} requirement(s)`);
  return { started: true, underfilledCycles: 0 };
}

async function runArch(runtime, controls) {
  let progressed = false;
  while (true) {
    const file = listQueueFiles(runtime.queues.arch)[0];
    if (!file || controls.stopRequested) {
      break;
    }
    const name = path.basename(file);
    log(controls, `ARCH start ${name}`);
    const result = await runNodeScript({
      scriptPath: path.join(runtime.agentsRoot, "arch", "arch.js"),
      args: ["--auto", "--requirement", file],
      cwd: runtime.agentsRoot,
      maxRetries: runtime.loops.maxRetries,
      retryDelaySeconds: runtime.loops.retryDelaySeconds,
    });
    if (!result.ok) {
      moveToQueue(runtime, file, "toClarify", "to-clarify", [
        "Delivery runner: ARCH failed",
        `- reason: ${(result.stderr || "execution failed").slice(0, 700)}`,
      ]);
      progressed = true;
      continue;
    }

    if (fs.existsSync(path.join(runtime.queues.dev, name))) {
      progressed = true;
      continue;
    }
    if (fs.existsSync(path.join(runtime.queues.toClarify, name))) {
      progressed = true;
      continue;
    }

    if (fs.existsSync(file)) {
      moveToQueue(runtime, file, "toClarify", "to-clarify", [
        "Delivery runner: ARCH output fallback",
        "- requirement not routed by agent; moved to to-clarify",
      ]);
    }
    progressed = true;
  }
  return progressed;
}

async function runDev(runtime, controls) {
  let progressed = false;
  while (true) {
    const file = listQueueFiles(runtime.queues.dev)[0];
    if (!file || controls.stopRequested) {
      break;
    }

    const name = path.basename(file);
    const scriptPath = pickDevScript(runtime, file);
    log(controls, `DEV start ${name} (${path.basename(path.dirname(scriptPath))})`);

    const result = await runNodeScript({
      scriptPath,
      args: ["--auto", "--requirement", file],
      cwd: runtime.agentsRoot,
      maxRetries: runtime.loops.maxRetries,
      retryDelaySeconds: runtime.loops.retryDelaySeconds,
    });

    if (!result.ok) {
      moveToQueue(runtime, file, "toClarify", "to-clarify", [
        "Delivery runner: DEV failed",
        `- reason: ${(result.stderr || "execution failed").slice(0, 700)}`,
      ]);
      progressed = true;
      continue;
    }

    if (fs.existsSync(path.join(runtime.queues.qa, name))) {
      progressed = true;
      continue;
    }
    if (fs.existsSync(path.join(runtime.queues.toClarify, name))) {
      progressed = true;
      continue;
    }

    if (fs.existsSync(file)) {
      moveToQueue(runtime, file, "toClarify", "to-clarify", [
        "Delivery runner: DEV output fallback",
        "- requirement not routed by agent; moved to to-clarify",
      ]);
    }
    progressed = true;
  }
  return progressed;
}

async function runUxBatch(runtime, controls) {
  if (countFiles(runtime.queues.qa) === 0) {
    return false;
  }

  const movedQa = moveAll(
    runtime,
    "qa",
    "ux",
    "ux",
    "Delivery runner: route QA queue to UX bundle pass"
  );
  if (movedQa > 0) {
    log(controls, `UX bundle intake moved qa->ux: ${movedQa}`);
  }

  if (countFiles(runtime.queues.ux) === 0) {
    return movedQa > 0;
  }

  log(controls, "UX batch start");
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "ux", "ux.js"),
    args: ["--auto", "--batch"],
    cwd: runtime.agentsRoot,
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
  });

  if (!result.ok) {
    moveAll(runtime, "ux", "toClarify", "to-clarify", "Delivery runner: UX batch failed");
    return true;
  }

  const normalized = moveAll(
    runtime,
    "deploy",
    "sec",
    "sec",
    "Delivery runner: normalize UX pass queue deploy->sec"
  );
  if (normalized > 0) {
    log(controls, `UX normalize moved deploy->sec: ${normalized}`);
  }

  return true;
}

async function runSecBatch(runtime, controls) {
  if (countFiles(runtime.queues.sec) === 0) {
    return false;
  }

  log(controls, "SEC batch start");
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "sec", "sec.js"),
    args: ["--auto", "--batch"],
    cwd: runtime.agentsRoot,
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
  });

  if (!result.ok) {
    moveAll(runtime, "sec", "toClarify", "to-clarify", "Delivery runner: SEC batch failed");
    return true;
  }

  const normalized = moveAll(
    runtime,
    "ux",
    "qa",
    "qa",
    "Delivery runner: normalize SEC pass queue ux->qa"
  );
  if (normalized > 0) {
    log(controls, `SEC normalize moved ux->qa: ${normalized}`);
  }

  return true;
}

function qaBatchGatePath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "qa-gates");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "bundle-gate.json");
}

function qaFinalGatePath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "qa-gates");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "post-bundle-final-gate.json");
}

function parseGate(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {
      status: "fail",
      summary: "invalid gate file",
      blocking_findings: ["invalid gate file"],
    };
  }
}

function createQaFollowUp(runtime, gate) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = `REQ-QA-FOLLOWUP-${stamp}`;
  const filePath = path.join(runtime.queues.selected, `${id}.md`);
  const findings = Array.isArray(gate.blocking_findings)
    ? gate.blocking_findings.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  const content = [
    "---",
    `id: ${id}`,
    "title: QA follow-up after bundle gate",
    "status: selected",
    "source: qa-gate",
    "implementation_scope: fullstack",
    "business_score: 90",
    "---",
    "",
    "# Goal",
    "Resolve QA findings from bundle-level verification.",
    "",
    "## Scope",
    "- Fix all blocking QA findings for this bundle.",
    "",
    "## Task Outline",
    "- Reproduce each finding.",
    "- Implement focused fixes.",
    "- Re-run relevant checks.",
    "",
    "## Acceptance Criteria",
    "- QA gate passes for the addressed findings.",
    "",
    "## QA Findings",
    ...(findings.length > 0 ? findings.map((item) => `- ${item}`) : ["- See QA gate summary in logs."]),
    "",
    "## PO Results",
    "- Auto-created by delivery runner after QA gate failure.",
    `- Changes: ${filePath}`,
    "",
  ].join("\n");

  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

async function runQaBundle(runtime, controls) {
  if (countFiles(runtime.queues.qa) === 0) {
    return false;
  }

  const gatePath = qaBatchGatePath(runtime);
  fs.writeFileSync(gatePath, JSON.stringify({ status: "fail", summary: "pending", blocking_findings: [] }, null, 2), "utf8");

  log(controls, "QA bundle gate start");
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "qa", "qa.js"),
    args: ["--auto", "--batch-tests", "--batch-queue", "qa", "--gate-file", gatePath],
    cwd: runtime.agentsRoot,
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
  });

  const gate = parseGate(gatePath);
  const pass = result.ok && String(gate.status || "").toLowerCase() === "pass";

  if (pass) {
    moveAll(runtime, "qa", "deploy", "deploy", "Delivery runner: QA bundle gate pass");
  } else {
    const findings = Array.isArray(gate.blocking_findings)
      ? gate.blocking_findings.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const note = [
      "Delivery runner: QA bundle gate failed",
      `- summary: ${String(gate.summary || "qa gate failed")}`,
      ...findings.map((item) => `- ${item}`),
    ].join("\n");
    moveAll(runtime, "qa", "selected", "selected", note);
  }

  return true;
}

function gitRoot(cwd) {
  try {
    return execSync("git rev-parse --show-toplevel", { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
  } catch {
    return "";
  }
}

function runGit(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) {
    return { ok: true, output: String(result.stdout || "").trim() };
  }
  return {
    ok: false,
    output: `${String(result.stdout || "").trim()}\n${String(result.stderr || "").trim()}`.trim(),
  };
}

function deployCommitPush(runtime, controls) {
  if (runtime.deploy.mode === "check") {
    log(controls, "deploy git actions skipped (mode=check)");
    return;
  }

  const agentsRootGit = gitRoot(runtime.agentsRoot);
  const targetRootGit = gitRoot(runtime.repoRoot);
  if (!targetRootGit) {
    log(controls, "deploy git actions skipped: target repo is not git");
    return;
  }
  if (agentsRootGit && targetRootGit && agentsRootGit === targetRootGit) {
    log(controls, "deploy git actions skipped: safety guard prevented agents repo commit");
    return;
  }

  runGit(runtime.repoRoot, ["add", "-A"]);
  const diff = runGit(runtime.repoRoot, ["diff", "--cached", "--quiet"]);
  if (diff.ok) {
    log(controls, "deploy git actions skipped: no staged changes");
    return;
  }

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const commit = runGit(runtime.repoRoot, ["commit", "-m", `chore(release): deploy bundle ${stamp}`]);
  if (!commit.ok) {
    log(controls, `deploy commit failed: ${(commit.output || "").slice(0, 500)}`);
    return;
  }
  log(controls, "deploy commit created");

  if (runtime.deploy.mode === "commit_push") {
    const push = runGit(runtime.repoRoot, ["push"]);
    if (!push.ok) {
      log(controls, `deploy push failed: ${(push.output || "").slice(0, 500)}`);
      return;
    }
    log(controls, "deploy push completed");
  }
}

async function runDeployBundle(runtime, controls) {
  if (countFiles(runtime.queues.deploy) === 0) {
    return false;
  }

  log(controls, "DEPLOY bundle start");
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "deploy", "deploy.js"),
    args: ["--auto", "--batch"],
    cwd: runtime.agentsRoot,
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
  });

  if (!result.ok) {
    moveAll(runtime, "deploy", "toClarify", "to-clarify", "Delivery runner: deploy bundle failed");
    return true;
  }

  moveAll(runtime, "deploy", "released", "released", "Delivery runner: deploy bundle released");
  deployCommitPush(runtime, controls);
  return true;
}

function releasedSignature(runtime) {
  const files = listQueueFiles(runtime.queues.released);
  const parts = [];
  for (const file of files) {
    const stat = fs.statSync(file);
    parts.push(`${path.basename(file)}|${stat.size}|${Math.round(stat.mtimeMs)}`);
  }
  return parts.sort().join("\n");
}

async function runQaPostBundle(runtime, controls, lastSignature) {
  if (countFiles(runtime.queues.released) === 0) {
    return {
      progressed: false,
      signature: "",
    };
  }

  const signature = releasedSignature(runtime);
  if (signature && signature === lastSignature) {
    return {
      progressed: false,
      signature,
    };
  }

  const gatePath = qaFinalGatePath(runtime);
  fs.writeFileSync(gatePath, JSON.stringify({ status: "fail", summary: "pending", blocking_findings: [] }, null, 2), "utf8");

  log(controls, "QA post-bundle final pass start");
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "qa", "qa.js"),
    args: ["--auto", "--final-pass", "--gate-file", gatePath],
    cwd: runtime.agentsRoot,
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
  });

  if (!result.ok) {
    const filePath = createQaFollowUp(runtime, {
      blocking_findings: ["QA final pass execution failed. Inspect logs and rerun."],
    });
    log(controls, `QA post-bundle follow-up created: ${path.basename(filePath)}`);
    return {
      progressed: true,
      signature: releasedSignature(runtime),
    };
  }

  const gate = parseGate(gatePath);
  if (String(gate.status || "").toLowerCase() !== "pass") {
    const filePath = createQaFollowUp(runtime, gate);
    log(controls, `QA post-bundle follow-up created: ${path.basename(filePath)}`);
  }
  return {
    progressed: true,
    signature: releasedSignature(runtime),
  };
}

function snapshotHash(runtime) {
  const parts = [];
  for (const dir of Object.values(runtime.queues)) {
    const files = listQueueFiles(dir);
    for (const file of files) {
      const stat = fs.statSync(file);
      parts.push(`${file}|${stat.size}|${Math.round(stat.mtimeMs)}`);
    }
  }
  return parts.sort().join("\n");
}

async function runFullDownstream(runtime, controls, lastReleasedSignature) {
  let progressed = false;

  if (await runUxBatch(runtime, controls)) {
    progressed = true;
  }
  if (await runSecBatch(runtime, controls)) {
    progressed = true;
  }
  if (await runQaBundle(runtime, controls)) {
    progressed = true;
  }
  if (await runDeployBundle(runtime, controls)) {
    progressed = true;
  }
  const qaPost = await runQaPostBundle(runtime, controls, lastReleasedSignature);
  if (qaPost.progressed) {
    progressed = true;
  }

  return {
    progressed,
    releasedSignature: qaPost.signature,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  const runtime = loadRuntimeConfig(path.resolve(__dirname, ".."));
  ensureQueueDirs(runtime.queues);

  const minBundle = normalizePositiveInt(args.minBundle, runtime.loops.bundleMinSize);
  const maxBundle = Math.max(minBundle, normalizePositiveInt(args.maxBundle, runtime.loops.bundleMaxSize));

  const controls = createControls(args.verbose, runtime);
  process.on("exit", () => controls.cleanup());

  log(controls, `mode=${args.mode}`);
  log(controls, `bundle min=${minBundle} max=${maxBundle}`);

  let underfilledCycles = 0;
  let lastReleasedSignature = "";

  while (!controls.stopRequested) {
    const before = snapshotHash(runtime);

    const bundle = startBundleIfReady(runtime, minBundle, maxBundle, underfilledCycles, controls);
    underfilledCycles = bundle.underfilledCycles;

    await runArch(runtime, controls);
    await runDev(runtime, controls);

    if (args.mode === "full" && !planningInProgress(runtime)) {
      const downstream = await runFullDownstream(runtime, controls, lastReleasedSignature);
      if (downstream.releasedSignature) {
        lastReleasedSignature = downstream.releasedSignature;
      }
    }

    if (args.once) {
      break;
    }

    const after = snapshotHash(runtime);
    if (before === after) {
      await sleep(Math.max(1, runtime.loops.deliveryPollSeconds) * 1000);
    }
  }

  controls.cleanup();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
