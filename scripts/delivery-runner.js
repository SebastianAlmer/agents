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
  parseFrontMatter,
  normalizeStatus,
  getActivePauseState,
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
  } else if (["regression", "full-regression", "full_regression", "quality"].includes(args.mode)) {
    args.mode = "regression";
  } else {
    args.mode = "full";
  }

  return args;
}

function usage() {
  console.log(
    "Usage: node scripts/delivery-runner.js [--mode full|dev-only|regression] [--once] [--verbose|--no-verbose] [--min-bundle N] [--max-bundle N]"
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
    humanDecisionNeeded: countFiles(runtime.queues.humanDecisionNeeded),
    humanInput: countFiles(runtime.queues.humanInput),
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
    `human-decision-needed=${summary.humanDecisionNeeded}`,
    `human-input=${summary.humanInput}`,
    `blocked=${summary.blocked}`,
  ].join(" ");
}

function createControls(initialVerbose, runtime) {
  const stopHooks = new Set();
  const controls = {
    verbose: Boolean(initialVerbose),
    stopRequested: false,
    onStop(callback) {
      if (typeof callback !== "function") {
        return () => {};
      }
      stopHooks.add(callback);
      return () => stopHooks.delete(callback);
    },
    requestStop(reason = "") {
      if (controls.stopRequested) {
        process.stdout.write("\nDELIVERY: force stop\n");
        process.exit(130);
        return;
      }
      controls.stopRequested = true;
      if (reason) {
        process.stdout.write(`\nDELIVERY: stop requested (${reason})\n`);
      }
      for (const hook of stopHooks) {
        try {
          hook();
        } catch {
          // ignore hook errors during shutdown
        }
      }
    },
    cleanup() {},
  };

  const onSignal = (signalName) => controls.requestStop(signalName);
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  if (!process.stdin.isTTY) {
    controls.cleanup = () => {
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
    };
    return controls;
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  const onKeypress = (str, key) => {
    if (!key) {
      return;
    }
    if (key.ctrl && key.name === "c") {
      controls.requestStop("Ctrl+C");
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
      controls.requestStop("q");
      return;
    }
  };

  process.stdin.on("keypress", onKeypress);
  controls.cleanup = () => {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    process.stdin.removeListener("keypress", onKeypress);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  };
  return controls;
}

function getStopSignal(controls) {
  return {
    isStopped: () => Boolean(controls && controls.stopRequested),
    onStop: (cb) => (controls && typeof controls.onStop === "function" ? controls.onStop(cb) : () => {}),
  };
}

function log(controls, message) {
  if (controls.verbose) {
    process.stdout.write(`DELIVERY: ${message}\n`);
  }
}

function formatPauseLine(pauseState) {
  const reason = String((pauseState && pauseState.reason) || "limit").replace(/_/g, "-");
  const source = String((pauseState && pauseState.source) || "unknown");
  const resumeAfter = String((pauseState && pauseState.resumeAfter) || "");
  const remainingMs = Number.isFinite(pauseState && pauseState.remainingMs)
    ? pauseState.remainingMs
    : 0;
  const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));
  return `global pause active reason=${reason} source=${source} resume_after=${resumeAfter || "unknown"} remaining~${remainingMin}m`;
}

async function waitIfGloballyPaused(runtime, controls) {
  const pauseState = getActivePauseState(runtime.agentsRoot);
  if (!pauseState) {
    return false;
  }
  process.stdout.write(`DELIVERY: ${formatPauseLine(pauseState)}\n`);
  const fallbackMs = Math.max(1, runtime.loops.deliveryPollSeconds) * 1000;
  const waitMs = Number.isFinite(pauseState.remainingMs)
    ? Math.min(Math.max(1000, pauseState.remainingMs), fallbackMs)
    : fallbackMs;
  await sleep(waitMs);
  return true;
}

function looksLikeInlineRequirementText(value) {
  const text = String(value || "");
  return text.startsWith("---") && text.includes("\n") && /(^|\n)id\s*:/i.test(text);
}

function extractRequirementId(text) {
  const match = String(text || "").match(/(^|\n)id\s*:\s*([^\n\r]+)/i);
  return match ? String(match[2] || "").trim() : "";
}

function uniqueQueueDirs(runtime) {
  return Array.from(new Set(Object.values(runtime.queues || {}).filter(Boolean)));
}

function findRequirementById(runtime, id) {
  const needle = String(id || "").trim();
  if (!needle) {
    return "";
  }
  for (const dir of uniqueQueueDirs(runtime)) {
    const files = listQueueFiles(dir);
    for (const file of files) {
      try {
        const raw = fs.readFileSync(file, "utf8");
        const match = raw.match(/(^|\n)id\s*:\s*([^\n\r]+)/i);
        if (match && String(match[2] || "").trim() === needle) {
          return file;
        }
      } catch {
        // Ignore unreadable file and continue.
      }
    }
  }
  return "";
}

function resolveRequirementPath(runtime, sourcePath) {
  const candidate = String(sourcePath || "");
  if (!candidate) {
    return "";
  }
  if (looksLikeInlineRequirementText(candidate)) {
    const id = extractRequirementId(candidate);
    if (!id) {
      return "";
    }
    return findRequirementById(runtime, id);
  }
  try {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  } catch {
    return "";
  }
  return "";
}

function moveToQueue(runtime, sourcePath, targetQueue, status, noteLines) {
  const sourceFile = resolveRequirementPath(runtime, sourcePath);
  if (!sourceFile || !fs.existsSync(sourceFile)) {
    return false;
  }
  if (!runtime.queues[targetQueue]) {
    return false;
  }
  if (Array.isArray(noteLines) && noteLines.length > 0) {
    appendQueueSection(sourceFile, noteLines);
  }

  try {
    const raw = fs.readFileSync(sourceFile, "utf8");
    const next = raw.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (match, frontMatter) => {
      if (/^status\s*:/m.test(frontMatter)) {
        return `---\n${frontMatter.replace(/^status\s*:.*$/m, `status: ${status}`)}\n---`;
      }
      return `---\n${frontMatter}\nstatus: ${status}\n---`;
    });
    fs.writeFileSync(sourceFile, next, "utf8");
  } catch (err) {
    process.stderr.write(`DELIVERY: moveToQueue failed for ${path.basename(String(sourceFile || sourcePath || ""))}: ${err.message || err}\n`);
    return false;
  }

  const targetPath = path.join(runtime.queues[targetQueue], path.basename(sourceFile));
  return moveRequirementFile(sourceFile, targetPath);
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

function removeDuplicateSourceIfTargetExists(sourcePath, targetPath, controls, stageLabel) {
  const source = String(sourcePath || "");
  const target = String(targetPath || "");
  if (!source || !target) {
    return false;
  }
  if (!fs.existsSync(source) || !fs.existsSync(target)) {
    return false;
  }
  const sourceResolved = path.resolve(source);
  const targetResolved = path.resolve(target);
  if (sourceResolved === targetResolved) {
    return false;
  }
  try {
    fs.unlinkSync(sourceResolved);
    log(controls, `${stageLabel}: removed stale source duplicate ${path.basename(sourceResolved)}`);
    return true;
  } catch (err) {
    process.stderr.write(
      `DELIVERY: failed to remove stale duplicate ${path.basename(sourceResolved)}: ${err.message || err}\n`
    );
    return false;
  }
}

function frontMatterTruthy(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "y"].includes(normalized);
}

function hasArchHardBlockEvidence(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }
  const fm = parseFrontMatter(filePath);
  const hardFlag = frontMatterTruthy(fm.arch_hard_block)
    || frontMatterTruthy(fm.hard_arch_block)
    || frontMatterTruthy(fm.hard_block);
  if (!hardFlag) {
    return false;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const hasBlockerType = /blocker[_ -]?type\s*:\s*(missing-input|hard-contradiction)/i.test(raw);
  const hasRequiredInput = /required[_ -]?input\s*:/i.test(raw) || /missing[_ -]?input\s*:/i.test(raw);
  return hasBlockerType && hasRequiredInput;
}

function parseDelimitedLower(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[,\s|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeScopeValue(value, fallback = "fullstack") {
  const normalized = String(value || fallback || "")
    .trim()
    .toLowerCase();
  if (["frontend", "fe", "ui", "web"].includes(normalized)) {
    return "frontend";
  }
  if (["backend", "be", "api", "server"].includes(normalized)) {
    return "backend";
  }
  if (["fullstack", "full", "fs"].includes(normalized)) {
    return "fullstack";
  }
  return fallback;
}

function archKeywordMatch(rawLower, keywords) {
  for (const keyword of keywords) {
    const needle = String(keyword || "").trim().toLowerCase();
    if (!needle) {
      continue;
    }
    if (needle.includes(" ")) {
      if (rawLower.includes(needle)) {
        return needle;
      }
      continue;
    }
    const pattern = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(rawLower)) {
      return needle;
    }
  }
  return "";
}

function archRoutingDecision(runtime, filePath) {
  const mode = String((runtime.arch && runtime.arch.routingMode) || "triggered").toLowerCase();
  if (mode === "always") {
    return { useArch: true, reason: "routing_mode=always" };
  }
  if (mode === "never") {
    return { useArch: false, reason: "routing_mode=never" };
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return { useArch: true, reason: "fallback: missing requirement file" };
  }

  const fm = parseFrontMatter(filePath);
  const requiredFlags = new Set(
    Array.isArray(runtime.arch && runtime.arch.triggerFrontmatterFlags)
      ? runtime.arch.triggerFrontmatterFlags.map((x) => String(x || "").toLowerCase())
      : []
  );
  for (const flag of requiredFlags) {
    const value = fm[flag];
    if (frontMatterTruthy(value)) {
      return { useArch: true, reason: `frontmatter flag ${flag}=true` };
    }
  }

  const scope = normalizeScopeValue(
    fm.implementation_scope || fm.dev_scope || fm.scope || (runtime.devRouting && runtime.devRouting.defaultScope) || "fullstack",
    "fullstack"
  );
  const requiredScopes = new Set(
    Array.isArray(runtime.arch && runtime.arch.requireForScopes)
      ? runtime.arch.requireForScopes.map((x) => normalizeScopeValue(x, "fullstack"))
      : []
  );
  if (requiredScopes.has(scope)) {
    return { useArch: true, reason: `implementation_scope=${scope}` };
  }

  const reviewRisk = String(fm.review_risk || "").trim().toLowerCase();
  const requiredRisks = new Set(
    Array.isArray(runtime.arch && runtime.arch.requireForReviewRisks)
      ? runtime.arch.requireForReviewRisks.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
      : []
  );
  if (reviewRisk && requiredRisks.has(reviewRisk)) {
    return { useArch: true, reason: `review_risk=${reviewRisk}` };
  }

  const reviewScopes = new Set(parseDelimitedLower(fm.review_scope || ""));
  const requiredReviewScopes = new Set(
    Array.isArray(runtime.arch && runtime.arch.requireForReviewScopes)
      ? runtime.arch.requireForReviewScopes.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
      : []
  );
  for (const scopeToken of reviewScopes) {
    if (requiredReviewScopes.has(scopeToken)) {
      return { useArch: true, reason: `review_scope=${scopeToken}` };
    }
  }

  const rawLower = fs.readFileSync(filePath, "utf8").toLowerCase();
  const keyword = archKeywordMatch(
    rawLower,
    Array.isArray(runtime.arch && runtime.arch.triggerKeywords)
      ? runtime.arch.triggerKeywords
      : []
  );
  if (keyword) {
    return { useArch: true, reason: `keyword=${keyword}` };
  }

  return { useArch: false, reason: "no arch trigger matched" };
}

function findRequirementInUnexpectedQueues(runtime, fileName, excludedQueues = []) {
  const excluded = new Set(Array.isArray(excludedQueues) ? excludedQueues : []);
  const queueOrder = [
    "selected",
    "backlog",
    "refinement",
    "humanInput",
    "wontDo",
    "qa",
    "ux",
    "sec",
    "deploy",
    "released",
    "blocked",
  ];

  for (const queueName of queueOrder) {
    if (excluded.has(queueName)) {
      continue;
    }
    const dir = runtime.queues[queueName];
    if (!dir) {
      continue;
    }
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function recoverArchMisroute(runtime, fileName) {
  const misplaced = findRequirementInUnexpectedQueues(runtime, fileName, [
    "arch",
    "dev",
    "toClarify",
    "humanDecisionNeeded",
  ]);
  if (!misplaced) {
    return false;
  }

  const fm = parseFrontMatter(misplaced);
  const normalized = normalizeStatus(fm.status || "");
  const wantsClarify = normalized === "clarify";
  const clarifyAllowed = wantsClarify && hasArchHardBlockEvidence(misplaced);
  const targetQueue = clarifyAllowed ? "toClarify" : "dev";
  const targetStatus = targetQueue === "dev" ? "dev" : "to-clarify";
  const recoveryReason = wantsClarify
    ? (clarifyAllowed
      ? "- clarify guard passed: hard blocker evidence present"
      : "- clarify request ignored: missing hard blocker evidence")
    : "- status is not clarify; routed to dev";
  return moveToQueue(runtime, misplaced, targetQueue, targetStatus, [
    "Delivery runner: ARCH misroute recovery",
    `- moved from unexpected queue to ${targetQueue}`,
    recoveryReason,
  ]);
}

function recoverDevMisroute(runtime, fileName) {
  const misplaced = findRequirementInUnexpectedQueues(runtime, fileName, [
    "dev",
    "qa",
    "toClarify",
    "humanDecisionNeeded",
  ]);
  if (!misplaced) {
    return false;
  }

  const fm = parseFrontMatter(misplaced);
  const normalized = normalizeStatus(fm.status || "");
  const targetQueue = normalized === "clarify" ? "toClarify" : "qa";
  const targetStatus = targetQueue === "qa" ? "qa" : "to-clarify";
  return moveToQueue(runtime, misplaced, targetQueue, targetStatus, [
    "Delivery runner: DEV misroute recovery",
    `- moved from unexpected queue to ${targetQueue}`,
  ]);
}

function pickDevScript(runtime, requirementPath) {
  const sourceFile = resolveRequirementPath(runtime, requirementPath);
  if (!sourceFile || !fs.existsSync(sourceFile)) {
    return path.join(runtime.agentsRoot, "dev-fs", "dev-fs.js");
  }

  const raw = fs.readFileSync(sourceFile, "utf8");
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

function readPoVisionDecision(runtime) {
  const filePath = path.join(runtime.agentsRoot, ".runtime", "po-vision.decision.json");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      status: String(parsed.status || "").toLowerCase(),
      visionComplete: Boolean(parsed.vision_complete),
    };
  } catch {
    return {
      status: "",
      visionComplete: false,
    };
  }
}

function shouldForceUnderfilledFromVision(runtime) {
  if (!runtime || !runtime.po || String(runtime.po.defaultMode || "").toLowerCase() !== "vision") {
    return false;
  }
  const decision = readPoVisionDecision(runtime);
  return decision.visionComplete && decision.status === "pass";
}

function startBundleIfReady(runtime, minBundle, maxBundle, underfilledCycles, controls, options = {}) {
  if (planningInProgress(runtime) || downstreamInProgress(runtime)) {
    return { started: false, underfilledCycles };
  }

  const selectedCount = countFiles(runtime.queues.selected);
  if (selectedCount === 0) {
    return { started: false, underfilledCycles: 0 };
  }

  const forceUnderfilled = Boolean(options.forceUnderfilled);
  const allowUnderfilled = underfilledCycles >= runtime.loops.forceUnderfilledAfterCycles;
  if (selectedCount < minBundle && !allowUnderfilled && !forceUnderfilled) {
    log(controls, `waiting for fuller bundle: selected=${selectedCount} min=${minBundle}`);
    return { started: false, underfilledCycles: underfilledCycles + 1 };
  }
  if (selectedCount < minBundle && forceUnderfilled && !allowUnderfilled) {
    log(
      controls,
      `vision final-drain: start underfilled bundle selected=${selectedCount} min=${minBundle}`
    );
  }

  const picked = chooseBundleByBusinessScore(runtime.queues.selected, maxBundle);
  if (picked.length === 0) {
    return { started: false, underfilledCycles };
  }

  let toArch = 0;
  for (const file of picked) {
    moveToQueue(runtime, file, "arch", "arch", [
      "Delivery runner: bundle intake by business score",
      `- bundle size target max=${maxBundle}`,
      "- route: arch intake",
    ]);
    toArch += 1;
  }
  log(controls, `bundle started with ${picked.length} requirement(s): arch=${toArch}`);
  return { started: true, underfilledCycles: 0 };
}

async function runArch(runtime, controls) {
  let progressed = false;
  while (true) {
    const file = listQueueFiles(runtime.queues.arch)[0];
    if (!file || controls.stopRequested) {
      break;
    }
    const sourceFile = resolveRequirementPath(runtime, file) || file;
    const name = path.basename(sourceFile);
    const decision = archRoutingDecision(runtime, sourceFile);
    if (!decision.useArch) {
      moveToQueue(runtime, sourceFile, "dev", "dev", [
        "Delivery runner: ARCH bypass",
        `- no arch trigger matched (${decision.reason})`,
      ]);
      progressed = true;
      continue;
    }

    log(controls, `ARCH start ${name} (${decision.reason})`);
    const result = await runNodeScript({
      scriptPath: path.join(runtime.agentsRoot, "arch", "arch.js"),
      args: ["--auto", "--requirement", sourceFile],
      cwd: runtime.agentsRoot,
      maxRetries: runtime.arch && Number.isInteger(runtime.arch.maxRetries)
        ? runtime.arch.maxRetries
        : 0,
      retryDelaySeconds: runtime.loops.retryDelaySeconds,
      stopSignal: getStopSignal(controls),
    });
    if (!result.ok) {
      if (result.aborted && controls.stopRequested) {
        break;
      }
      if (result.paused) {
        log(controls, `ARCH paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
        break;
      }
      moveToQueue(runtime, sourceFile, "dev", "dev", [
        "Delivery runner: ARCH failed",
        `- reason: ${(result.stderr || "execution failed").slice(0, 700)}`,
        "- fallback: continue with DEV to avoid ARCH bottleneck",
      ]);
      progressed = true;
      continue;
    }

    const devPath = path.join(runtime.queues.dev, name);
    if (fs.existsSync(devPath)) {
      removeDuplicateSourceIfTargetExists(sourceFile, devPath, controls, "ARCH handoff");
      progressed = true;
      continue;
    }
    const clarifyPath = path.join(runtime.queues.toClarify, name);
    if (fs.existsSync(clarifyPath)) {
      removeDuplicateSourceIfTargetExists(sourceFile, clarifyPath, controls, "ARCH handoff");
      if (!hasArchHardBlockEvidence(clarifyPath)) {
        moveToQueue(runtime, clarifyPath, "dev", "dev", [
          "Delivery runner: ARCH clarify guard",
          "- clarify rejected: no hard blocker evidence; routed to dev",
        ]);
      }
      progressed = true;
      continue;
    }
    const humanDecisionPath = runtime.queues.humanDecisionNeeded
      ? path.join(runtime.queues.humanDecisionNeeded, name)
      : "";
    if (humanDecisionPath && fs.existsSync(humanDecisionPath)) {
      removeDuplicateSourceIfTargetExists(sourceFile, humanDecisionPath, controls, "ARCH handoff");
      progressed = true;
      continue;
    }
    if (recoverArchMisroute(runtime, name)) {
      progressed = true;
      continue;
    }

    if (fs.existsSync(sourceFile)) {
      moveToQueue(runtime, sourceFile, "dev", "dev", [
        "Delivery runner: ARCH output fallback",
        "- requirement not routed by agent; moved to dev for execution",
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

    const sourceFile = resolveRequirementPath(runtime, file) || file;
    const name = path.basename(sourceFile);
    const scriptPath = pickDevScript(runtime, sourceFile);
    log(controls, `DEV start ${name} (${path.basename(path.dirname(scriptPath))})`);

    const result = await runNodeScript({
      scriptPath,
      args: ["--auto", "--requirement", sourceFile],
      cwd: runtime.agentsRoot,
      maxRetries: runtime.loops.maxRetries,
      retryDelaySeconds: runtime.loops.retryDelaySeconds,
      stopSignal: getStopSignal(controls),
    });

    if (!result.ok) {
      if (result.aborted && controls.stopRequested) {
        break;
      }
      if (result.paused) {
        log(controls, `DEV paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
        break;
      }
      moveToQueue(runtime, sourceFile, "toClarify", "to-clarify", [
        "Delivery runner: DEV failed",
        `- reason: ${(result.stderr || "execution failed").slice(0, 700)}`,
      ]);
      progressed = true;
      continue;
    }

    const qaPath = path.join(runtime.queues.qa, name);
    if (fs.existsSync(qaPath)) {
      removeDuplicateSourceIfTargetExists(sourceFile, qaPath, controls, "DEV handoff");
      progressed = true;
      continue;
    }
    const clarifyPath = path.join(runtime.queues.toClarify, name);
    if (fs.existsSync(clarifyPath)) {
      removeDuplicateSourceIfTargetExists(sourceFile, clarifyPath, controls, "DEV handoff");
      progressed = true;
      continue;
    }
    const humanDecisionPath = runtime.queues.humanDecisionNeeded
      ? path.join(runtime.queues.humanDecisionNeeded, name)
      : "";
    if (humanDecisionPath && fs.existsSync(humanDecisionPath)) {
      removeDuplicateSourceIfTargetExists(sourceFile, humanDecisionPath, controls, "DEV handoff");
      progressed = true;
      continue;
    }
    if (recoverDevMisroute(runtime, name)) {
      progressed = true;
      continue;
    }

    if (fs.existsSync(sourceFile)) {
      moveToQueue(runtime, sourceFile, "toClarify", "to-clarify", [
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
    stopSignal: getStopSignal(controls),
  });

  if (!result.ok) {
    if (result.aborted && controls.stopRequested) {
      return false;
    }
    if (result.paused) {
      log(controls, `UX paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
      return false;
    }
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
    stopSignal: getStopSignal(controls),
  });

  if (!result.ok) {
    if (result.aborted && controls.stopRequested) {
      return false;
    }
    if (result.paused) {
      log(controls, `SEC paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
      return false;
    }
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

function uatBatchGatePath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "qa-gates");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "uat-bundle-gate.json");
}

function qaFinalGatePath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "qa-gates");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "post-bundle-final-gate.json");
}

function uatFinalGatePath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "qa-gates");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "uat-full-regression-gate.json");
}

function maintDecisionPath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "maint");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "post-deploy-decision.json");
}

function parseGate(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {
      status: "fail",
      summary: "invalid gate file",
      blocking_findings: ["invalid gate file"],
      findings: [],
      manual_uat: [],
    };
  }
}

function normalizeSeverity(value, fallback = "P2") {
  const raw = String(value || "").trim().toUpperCase();
  if (["P0", "P1", "P2", "P3"].includes(raw)) {
    return raw;
  }
  const match = raw.match(/\b([0-3])\b/);
  if (match) {
    return `P${match[1]}`;
  }
  const fallbackRaw = String(fallback || "P2").trim().toUpperCase();
  return ["P0", "P1", "P2", "P3"].includes(fallbackRaw) ? fallbackRaw : "P2";
}

function parseSeverityFromText(text, fallback = "P2") {
  const match = String(text || "").toUpperCase().match(/\bP([0-3])\b/);
  if (match) {
    return `P${match[1]}`;
  }
  return normalizeSeverity(fallback, "P2");
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  const single = String(value || "").trim();
  return single ? [single] : [];
}

function normalizeFindingEntry(entry, sourceLabel, fallbackSeverity = "P2") {
  if (!entry) {
    return null;
  }
  if (typeof entry === "string") {
    const text = entry.trim();
    if (!text) {
      return null;
    }
    return {
      severity: parseSeverityFromText(text, fallbackSeverity),
      title: text.replace(/^\s*P[0-3]\s*[:\-]\s*/i, "").trim() || text,
      details: "",
      source: sourceLabel,
    };
  }
  if (typeof entry !== "object") {
    return null;
  }
  const severity = normalizeSeverity(entry.severity || entry.priority, fallbackSeverity);
  const title = String(entry.title || entry.summary || entry.name || "").trim();
  const details = String(entry.details || entry.description || entry.reason || "").trim();
  const resolvedTitle = title || details || "Unnamed finding";
  return {
    severity,
    title: resolvedTitle,
    details: details && details !== resolvedTitle ? details : "",
    source: sourceLabel,
  };
}

function collectGateFindings(gate, sourceLabel) {
  const findings = [];
  if (Array.isArray(gate && gate.findings)) {
    for (const entry of gate.findings) {
      const normalized = normalizeFindingEntry(entry, sourceLabel, "P2");
      if (normalized) {
        findings.push(normalized);
      }
    }
  }
  if (Array.isArray(gate && gate.blocking_findings)) {
    for (const entry of gate.blocking_findings) {
      const normalized = normalizeFindingEntry(entry, sourceLabel, "P1");
      if (normalized) {
        findings.push(normalized);
      }
    }
  }
  if (findings.length === 0 && String(gate && gate.status || "").toLowerCase() === "fail") {
    findings.push({
      severity: "P1",
      title: String(gate && gate.summary || "Gate failed"),
      details: "",
      source: sourceLabel,
    });
  }
  return findings;
}

function splitFindingsBySeverity(findings) {
  const high = [];
  const mediumLow = [];
  for (const finding of findings || []) {
    const severity = normalizeSeverity(finding.severity, "P2");
    if (severity === "P0" || severity === "P1") {
      high.push({ ...finding, severity });
    } else {
      mediumLow.push({ ...finding, severity });
    }
  }
  return { high, mediumLow };
}

function stableHash(input) {
  let hash = 2166136261;
  const text = String(input || "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function findByFrontMatterFingerprint(runtime, key, fingerprint, queueNames) {
  const target = String(fingerprint || "").trim();
  if (!target) {
    return "";
  }
  for (const queueName of queueNames) {
    const dir = runtime.queues[queueName];
    if (!dir) {
      continue;
    }
    for (const file of listQueueFiles(dir)) {
      const fm = parseFrontMatter(file);
      if (String(fm[key] || "").trim() === target) {
        return file;
      }
    }
  }
  return "";
}

function findingsFingerprint(sourceLabel, queueName, findings) {
  const canonical = (findings || [])
    .map((item) => `${normalizeSeverity(item.severity, "P2")}|${String(item.title || "").trim()}|${String(item.details || "").trim()}`)
    .sort()
    .join("\n");
  return stableHash(`${sourceLabel}|${queueName}|${canonical}`);
}

function manualUatFingerprint(items) {
  const canonical = (items || [])
    .map((item) => `${item.severity}|${item.title}|${item.whyNotAutomatable}|${item.humanQuestion}`)
    .sort()
    .join("\n");
  return stableHash(canonical);
}

function createQualityFollowUp(runtime, sourceLabel, queueName, findings, summary) {
  if (!Array.isArray(findings) || findings.length === 0 || !runtime.queues[queueName]) {
    return "";
  }
  const fingerprint = findingsFingerprint(sourceLabel, queueName, findings);
  const existing = findByFrontMatterFingerprint(
    runtime,
    "followup_fingerprint",
    fingerprint,
    [
      "selected",
      "backlog",
      "arch",
      "dev",
      "qa",
      "sec",
      "ux",
      "deploy",
      "toClarify",
      "humanDecisionNeeded",
      "humanInput",
      "blocked",
    ]
  );
  if (existing) {
    return existing;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sourceKey = String(sourceLabel || "quality").toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  const targetIsSelected = queueName === "selected";
  const id = targetIsSelected
    ? `REQ-${sourceKey}-HOTFIX-${stamp}`
    : `REQ-${sourceKey}-FOLLOWUP-${stamp}`;
  const filePath = path.join(runtime.queues[queueName], `${id}.md`);
  const title = targetIsSelected
    ? `${sourceLabel.toUpperCase()} high-priority hotfix follow-up`
    : `${sourceLabel.toUpperCase()} follow-up backlog`;
  const status = targetIsSelected ? "selected" : "backlog";

  const findingLines = findings.map((item) => {
    const details = String(item.details || "").trim();
    return details
      ? `- [${item.severity}] ${item.title} - ${details}`
      : `- [${item.severity}] ${item.title}`;
  });

  const content = [
    "---",
    `id: ${id}`,
    `title: ${title}`,
    `status: ${status}`,
    `source: ${sourceLabel}-gate`,
    "implementation_scope: fullstack",
    `business_score: ${targetIsSelected ? 100 : 60}`,
    `review_risk: ${targetIsSelected ? "high" : "medium"}`,
    `followup_fingerprint: ${fingerprint}`,
    "---",
    "",
    "# Goal",
    targetIsSelected
      ? "Stabilize critical quality issues detected during delivery gates."
      : "Track non-critical quality improvements detected during delivery gates.",
    "",
    "## Scope",
    `- Address ${sourceLabel.toUpperCase()} findings routed by delivery runner.`,
    "",
    "## Task Outline",
    "- Reproduce findings from this file.",
    "- Implement focused fixes.",
    "- Re-run relevant validation and confirm behavior.",
    "",
    "## Acceptance Criteria",
    "- Findings in this requirement are resolved.",
    "- No regression in related core flows.",
    "",
    `## ${sourceLabel.toUpperCase()} Findings`,
    ...findingLines,
    "",
    "## Flow Routing Notes",
    `- gate summary: ${String(summary || "n/a").trim() || "n/a"}`,
    `- routed automatically to ${queueName}`,
    "",
  ].join("\n");

  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function normalizeManualUatItem(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const severity = normalizeSeverity(entry.severity, "P1");
  if (!["P0", "P1"].includes(severity)) {
    return null;
  }

  const businessCritical = Boolean(entry.business_critical);
  const automationValue = String(
    entry.automation_feasibility
      || entry.automation
      || entry.automatable
      || ""
  ).trim().toLowerCase();
  const canAutoFix = typeof entry.can_auto_fix === "boolean" ? entry.can_auto_fix : null;
  const nonAutomatable = ["none", "manual-only", "not-automatable", "no", "cannot-automate", "unavailable"]
    .includes(automationValue)
    || canAutoFix === false;
  if (!businessCritical || !nonAutomatable) {
    return null;
  }

  const title = String(entry.title || entry.summary || "Manual UAT decision required").trim();
  return {
    severity,
    title,
    whyNotAutomatable: String(entry.why_not_automatable || entry.reason || "").trim()
      || "Not reliably automatable in current setup.",
    preconditions: toStringArray(entry.preconditions),
    steps: toStringArray(entry.steps),
    expected: toStringArray(entry.expected),
    failIf: toStringArray(entry.fail_if),
    evidence: toStringArray(entry.evidence),
    humanQuestion: String(entry.human_question || "").trim()
      || `Should this business-critical behavior be accepted as specified for release (${title})?`,
    recommendation: String(entry.recommendation || "").trim()
      || "Run the manual check and decide PASS/FAIL with rationale.",
  };
}

function collectManualUatItems(gate) {
  if (!Array.isArray(gate && gate.manual_uat)) {
    return [];
  }
  const items = [];
  for (const entry of gate.manual_uat) {
    const normalized = normalizeManualUatItem(entry);
    if (normalized) {
      items.push(normalized);
    }
  }
  return items;
}

function createManualUatDecision(runtime, items, summary) {
  if (!Array.isArray(items) || items.length === 0 || !runtime.queues.humanDecisionNeeded) {
    return "";
  }
  const fingerprint = manualUatFingerprint(items);
  const existing = findByFrontMatterFingerprint(
    runtime,
    "manual_uat_fingerprint",
    fingerprint,
    ["humanDecisionNeeded", "humanInput"]
  );
  if (existing) {
    return existing;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = `REQ-MANUAL-UAT-${stamp}`;
  const filePath = path.join(runtime.queues.humanDecisionNeeded, `${id}.md`);

  const lines = [
    "---",
    `id: ${id}`,
    "title: Manual UAT decision package",
    "status: human-decision-needed",
    "source: uat-manual",
    "implementation_scope: fullstack",
    "review_risk: high",
    "business_score: 100",
    `manual_uat_fingerprint: ${fingerprint}`,
    "---",
    "",
    "# Goal",
    "Capture critical non-automatable UAT checks for human decision.",
    "",
    "## Scope",
    "- Only business-critical checks that are currently not automatable.",
    "",
    "## Manual UAT Checks",
  ];

  items.forEach((item, index) => {
    lines.push("");
    lines.push(`### Check ${index + 1}: ${item.title} (${item.severity})`);
    lines.push(`Reason not automatable: ${item.whyNotAutomatable}`);
    lines.push("");
    lines.push("Preconditions");
    for (const entry of (item.preconditions.length ? item.preconditions : ["-"])) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
    lines.push("Steps");
    const steps = item.steps.length ? item.steps : ["Perform the user flow manually from start to finish."];
    steps.forEach((step, idx) => {
      lines.push(`${idx + 1}. ${step}`);
    });
    lines.push("");
    lines.push("Expected");
    for (const entry of (item.expected.length ? item.expected : ["Behavior matches product intent and docs."])) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
    lines.push("Fail if");
    for (const entry of (item.failIf.length ? item.failIf : ["Observed behavior differs from Expected."])) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
    lines.push("Evidence");
    for (const entry of (item.evidence.length ? item.evidence : ["Attach screenshot and timestamp."])) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
    lines.push("Human Decision");
    lines.push(`- Question: ${item.humanQuestion}`);
    lines.push(`- Recommendation: ${item.recommendation}`);
  });

  lines.push("");
  lines.push("## Flow Routing Notes");
  lines.push(`- gate summary: ${String(summary || "n/a").trim() || "n/a"}`);
  lines.push("- This queue is human-owned. Autonomous runners must not move this file out.");
  lines.push("- After decision, move to `human-input` and add decision notes.");
  lines.push("");

  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  return filePath;
}

function gatePass(gate) {
  return String(gate && gate.status || "").toLowerCase() === "pass";
}

function applyGateOutcomes(runtime, controls, sourceLabel, gate) {
  const findings = collectGateFindings(gate, sourceLabel);
  const split = splitFindingsBySeverity(findings);
  const summary = String(gate && gate.summary || "").trim();
  const created = {
    selected: "",
    backlog: "",
    humanDecision: "",
  };

  if (split.high.length > 0) {
    created.selected = createQualityFollowUp(runtime, sourceLabel, "selected", split.high, summary);
  }
  if (split.mediumLow.length > 0) {
    created.backlog = createQualityFollowUp(runtime, sourceLabel, "backlog", split.mediumLow, summary);
  }
  const manualItems = collectManualUatItems(gate);
  if (manualItems.length > 0) {
    created.humanDecision = createManualUatDecision(runtime, manualItems, summary);
  }

  log(
    controls,
    `${sourceLabel.toUpperCase()} findings routed high=${split.high.length} low=${split.mediumLow.length} manual=${manualItems.length}`
  );
  if (created.selected) {
    log(controls, `${sourceLabel.toUpperCase()} follow-up selected: ${path.basename(created.selected)}`);
  }
  if (created.backlog) {
    log(controls, `${sourceLabel.toUpperCase()} follow-up backlog: ${path.basename(created.backlog)}`);
  }
  if (created.humanDecision) {
    log(controls, `${sourceLabel.toUpperCase()} manual decision package: ${path.basename(created.humanDecision)}`);
  }
  return created;
}

function qaGateTemplate() {
  return {
    status: "fail",
    summary: "pending",
    blocking_findings: [],
    findings: [],
    manual_uat: [],
  };
}

function createQaExecutionFailureGate() {
  return {
    status: "fail",
    summary: "QA gate execution failed. Inspect logs and rerun.",
    blocking_findings: ["P1: QA gate execution failed. Inspect logs and rerun."],
    findings: [
      {
        severity: "P1",
        title: "QA gate execution failed. Inspect logs and rerun.",
        details: "",
      },
    ],
    manual_uat: [],
  };
}

function createUatExecutionFailureGate() {
  return {
    status: "fail",
    summary: "UAT gate execution failed. Inspect logs and rerun.",
    blocking_findings: ["P1: UAT gate execution failed. Inspect logs and rerun."],
    findings: [
      {
        severity: "P1",
        title: "UAT gate execution failed. Inspect logs and rerun.",
        details: "",
      },
    ],
    manual_uat: [],
  };
}

function createMaintExecutionFailureGate() {
  return {
    status: "fail",
    summary: "MAINT hygiene scan execution failed. Inspect logs and rerun.",
    blocking_findings: ["P2: MAINT hygiene scan execution failed. Inspect logs and rerun."],
    findings: [
      {
        severity: "P2",
        title: "MAINT hygiene scan execution failed",
        details: "Runner could not complete repository hygiene analysis.",
      },
    ],
    manual_uat: [],
  };
}

function gateTemplateJson() {
  return JSON.stringify(qaGateTemplate(), null, 2);
}

function queueNote(prefix, gate) {
  const summary = String(gate && gate.summary || "").trim();
  if (!summary) {
    return prefix;
  }
  return `${prefix} (summary: ${summary.slice(0, 250)})`;
}

async function runQaBundle(runtime, controls) {
  if (countFiles(runtime.queues.qa) === 0) {
    return {
      progressed: false,
      gate: null,
    };
  }

  const gatePath = qaBatchGatePath(runtime);
  fs.writeFileSync(gatePath, gateTemplateJson(), "utf8");

  log(controls, "QA bundle gate start (advisory)");
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "qa", "qa.js"),
    args: ["--auto", "--batch-tests", "--batch-queue", "qa", "--gate-file", gatePath],
    cwd: runtime.agentsRoot,
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
    stopSignal: getStopSignal(controls),
  });
  if (result.aborted && controls.stopRequested) {
    return {
      progressed: false,
      gate: null,
    };
  }
  if (result.paused) {
    log(controls, `QA paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
    return {
      progressed: false,
      gate: null,
    };
  }

  const parsed = parseGate(gatePath);
  const gate = result.ok ? parsed : createQaExecutionFailureGate();
  applyGateOutcomes(runtime, controls, "qa", gate);

  const note = gatePass(gate)
    ? "Delivery runner: QA advisory pass -> continue to deploy"
    : queueNote("Delivery runner: QA advisory fail -> continue to deploy", gate);
  moveAll(runtime, "qa", "deploy", "deploy", note);
  return {
    progressed: true,
    gate,
  };
}

async function runUatBundle(runtime, controls) {
  if (countFiles(runtime.queues.deploy) === 0) {
    return {
      progressed: false,
      gate: null,
    };
  }

  const gatePath = uatBatchGatePath(runtime);
  fs.writeFileSync(gatePath, gateTemplateJson(), "utf8");

  log(controls, "UAT bundle gate start (advisory)");
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "uat", "uat.js"),
    args: ["--auto", "--batch", "--source-queue", "deploy", "--gate-file", gatePath],
    cwd: runtime.agentsRoot,
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
    stopSignal: getStopSignal(controls),
  });
  if (result.aborted && controls.stopRequested) {
    return {
      progressed: false,
      gate: null,
    };
  }
  if (result.paused) {
    log(controls, `UAT paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
    return {
      progressed: false,
      gate: null,
    };
  }

  const parsed = parseGate(gatePath);
  const gate = result.ok ? parsed : createUatExecutionFailureGate();
  applyGateOutcomes(runtime, controls, "uat", gate);
  if (!gatePass(gate)) {
    log(controls, queueNote("UAT advisory fail -> continue to deploy", gate));
  } else {
    log(controls, "UAT advisory pass");
  }

  return {
    progressed: true,
    gate,
  };
}

async function runUatFullRegression(runtime, controls) {
  if (countFiles(runtime.queues.released) === 0) {
    return {
      progressed: false,
      gate: null,
    };
  }

  const gatePath = uatFinalGatePath(runtime);
  fs.writeFileSync(gatePath, gateTemplateJson(), "utf8");

  log(controls, "UAT full regression start");
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "uat", "uat.js"),
    args: ["--auto", "--full-regression", "--source-queue", "released", "--gate-file", gatePath],
    cwd: runtime.agentsRoot,
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
    stopSignal: getStopSignal(controls),
  });
  if (result.aborted && controls.stopRequested) {
    return {
      progressed: false,
      gate: null,
    };
  }
  if (result.paused) {
    log(controls, `UAT full regression paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
    return {
      progressed: false,
      gate: null,
    };
  }

  const parsed = parseGate(gatePath);
  const gate = result.ok ? parsed : createUatExecutionFailureGate();
  applyGateOutcomes(runtime, controls, "uat-regression", gate);
  return {
    progressed: true,
    gate,
  };
}

async function runMaintPostDeploy(runtime, controls, lastSignature) {
  if (countFiles(runtime.queues.released) === 0) {
    return {
      progressed: false,
      signature: "",
      gate: null,
    };
  }

  const signature = releasedSignature(runtime);
  if (signature && signature === lastSignature) {
    return {
      progressed: false,
      signature,
      gate: null,
    };
  }

  const decisionPath = maintDecisionPath(runtime);
  fs.writeFileSync(decisionPath, gateTemplateJson(), "utf8");

  log(controls, "MAINT post-deploy hygiene scan start");
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "maint", "maint.js"),
    args: ["--auto", "--post-deploy", "--decision-file", decisionPath],
    cwd: runtime.agentsRoot,
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
    stopSignal: getStopSignal(controls),
  });

  if (result.aborted && controls.stopRequested) {
    return {
      progressed: false,
      signature: lastSignature,
      gate: null,
    };
  }
  if (result.paused) {
    log(controls, `MAINT paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
    return {
      progressed: false,
      signature: lastSignature,
      gate: null,
    };
  }

  const parsed = parseGate(decisionPath);
  const gate = result.ok ? parsed : createMaintExecutionFailureGate();
  applyGateOutcomes(runtime, controls, "maint", gate);

  const summary = String(gate.summary || "").trim();
  if (summary) {
    log(controls, `MAINT summary: ${summary.slice(0, 250)}`);
  }

  return {
    progressed: true,
    signature: releasedSignature(runtime),
    gate,
  };
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

function runCli(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    output: `${String(result.stdout || "").trim()}\n${String(result.stderr || "").trim()}`.trim(),
    status: result.status,
  };
}

function renderTemplate(template, vars) {
  const source = String(template || "");
  return source.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : "";
    return String(value == null ? "" : value);
  });
}

function getCurrentBranch(repoRoot) {
  const result = runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!result.ok) {
    return "";
  }
  const branch = String(result.output || "").trim();
  if (!branch || branch === "HEAD") {
    return "";
  }
  return branch;
}

function ensureRemoteBranchPushed(repoRoot, remote, branch) {
  const result = runGit(repoRoot, ["ls-remote", "--heads", remote, branch]);
  return result.ok && Boolean(String(result.output || "").trim());
}

function inferChangeType(branch) {
  const raw = String(branch || "").trim().toLowerCase();
  if (/^(fix|bugfix|hotfix)(\/|-|_)/.test(raw)) {
    return "fix";
  }
  if (/^(feat|feature)(\/|-|_)/.test(raw)) {
    return "feat";
  }
  return "chore";
}

function createPullRequest(runtime, controls, deployInfo) {
  const pr = runtime.deploy && runtime.deploy.pr;
  if (!pr || !pr.enabled) {
    return;
  }

  const provider = String(pr.provider || "github").toLowerCase();
  if (provider !== "github") {
    log(controls, `deploy PR skipped: unsupported provider '${provider}'`);
    return;
  }

  const remote = String(pr.remote || "origin").trim() || "origin";
  const baseBranch = String(pr.baseBranch || "main").trim() || "main";
  const currentBranch = getCurrentBranch(runtime.repoRoot);
  if (!currentBranch) {
    log(controls, "deploy PR skipped: could not resolve current branch");
    return;
  }
  const headBranch = String(pr.headMode || "current").toLowerCase() === "fixed"
    ? (String(pr.headBranch || "").trim() || currentBranch)
    : currentBranch;

  if (pr.createOnlyAfterPush && !deployInfo.pushed) {
    log(controls, "deploy PR skipped: create_only_after_push=true and no push happened");
    return;
  }
  if (!ensureRemoteBranchPushed(runtime.repoRoot, remote, headBranch)) {
    log(controls, `deploy PR skipped: remote branch not found ${remote}/${headBranch}`);
    return;
  }

  const ghVersion = runCli("gh", ["--version"], runtime.repoRoot);
  if (!ghVersion.ok) {
    log(controls, "deploy PR skipped: gh CLI not available");
    return;
  }

  const existing = runCli(
    "gh",
    ["pr", "list", "--state", "open", "--base", baseBranch, "--head", headBranch, "--json", "url", "--jq", ".[0].url"],
    runtime.repoRoot
  );
  if (existing.ok) {
    const url = String(existing.output || "").trim();
    if (url) {
      log(controls, `deploy PR already exists: ${url}`);
      return;
    }
  }

  const vars = {
    base: baseBranch,
    branch: headBranch,
    remote,
    type: inferChangeType(headBranch),
  };
  const title = renderTemplate(pr.titleTemplate, vars) || `${vars.type}: ${headBranch} -> ${baseBranch}`;
  const body = renderTemplate(pr.bodyTemplate, vars) || `Automated PR from ${headBranch} to ${baseBranch}.`;

  const args = ["pr", "create", "--base", baseBranch, "--head", headBranch, "--title", title, "--body", body];
  if (pr.draft) {
    args.push("--draft");
  }
  const created = runCli("gh", args, runtime.repoRoot);
  if (!created.ok) {
    const out = String(created.output || "");
    if (/already exists/i.test(out)) {
      log(controls, "deploy PR already exists for this head/base");
      return;
    }
    log(controls, `deploy PR create failed: ${out.slice(0, 500)}`);
    return;
  }

  const url = String(created.output || "").split(/\s+/).find((token) => /^https?:\/\//i.test(token)) || "";
  if (url) {
    log(controls, `deploy PR created: ${url}`);
  } else {
    log(controls, "deploy PR created");
  }
}

function deployCommitPush(runtime, controls) {
  const outcome = {
    committed: false,
    pushed: false,
  };
  if (runtime.deploy.mode === "check") {
    log(controls, "deploy git actions skipped (mode=check)");
    return outcome;
  }

  const agentsRootGit = gitRoot(runtime.agentsRoot);
  const targetRootGit = gitRoot(runtime.repoRoot);
  if (!targetRootGit) {
    log(controls, "deploy git actions skipped: target repo is not git");
    return outcome;
  }
  if (agentsRootGit && targetRootGit && agentsRootGit === targetRootGit) {
    log(controls, "deploy git actions skipped: safety guard prevented agents repo commit");
    return outcome;
  }

  runGit(runtime.repoRoot, ["add", "-A"]);
  const diff = runGit(runtime.repoRoot, ["diff", "--cached", "--quiet"]);
  if (diff.ok) {
    log(controls, "deploy git actions skipped: no staged changes");
    return outcome;
  }

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const commit = runGit(runtime.repoRoot, ["commit", "-m", `chore(release): deploy bundle ${stamp}`]);
  if (!commit.ok) {
    log(controls, `deploy commit failed: ${(commit.output || "").slice(0, 500)}`);
    return outcome;
  }
  outcome.committed = true;
  log(controls, "deploy commit created");

  if (runtime.deploy.mode === "commit_push") {
    const push = runGit(runtime.repoRoot, ["push"]);
    if (!push.ok) {
      log(controls, `deploy push failed: ${(push.output || "").slice(0, 500)}`);
      return outcome;
    }
    outcome.pushed = true;
    log(controls, "deploy push completed");
  }
  return outcome;
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
    stopSignal: getStopSignal(controls),
  });

  if (!result.ok) {
    if (result.aborted && controls.stopRequested) {
      return false;
    }
    if (result.paused) {
      log(controls, `DEPLOY paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
      return false;
    }
    moveAll(runtime, "deploy", "toClarify", "to-clarify", "Delivery runner: deploy bundle failed");
    return true;
  }

  moveAll(runtime, "deploy", "released", "released", "Delivery runner: deploy bundle released");
  const deployInfo = deployCommitPush(runtime, controls);
  createPullRequest(runtime, controls, deployInfo);
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

async function runQaPostBundle(runtime, controls, lastSignature, options = {}) {
  if (countFiles(runtime.queues.released) === 0) {
    return {
      progressed: false,
      signature: "",
      gate: null,
    };
  }

  const signature = releasedSignature(runtime);
  if (!options.force && signature && signature === lastSignature) {
    return {
      progressed: false,
      signature,
      gate: null,
    };
  }

  const gatePath = qaFinalGatePath(runtime);
  fs.writeFileSync(gatePath, gateTemplateJson(), "utf8");

  log(controls, "QA post-bundle final pass start");
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "qa", "qa.js"),
    args: ["--auto", "--final-pass", "--gate-file", gatePath],
    cwd: runtime.agentsRoot,
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
    stopSignal: getStopSignal(controls),
  });

  if (result.aborted && controls.stopRequested) {
    return {
      progressed: false,
      signature: lastSignature,
      gate: null,
    };
  }

  if (result.paused) {
    log(controls, `QA post-bundle paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
    return {
      progressed: false,
      signature: lastSignature,
      gate: null,
    };
  }

  const parsed = parseGate(gatePath);
  const gate = result.ok ? parsed : createQaExecutionFailureGate();
  applyGateOutcomes(runtime, controls, "qa-post", gate);
  return {
    progressed: true,
    signature: releasedSignature(runtime),
    gate,
  };
}

function snapshotHash(runtime) {
  const parts = [];
  for (const dir of new Set(Object.values(runtime.queues))) {
    const files = listQueueFiles(dir);
    for (const file of files) {
      const stat = fs.statSync(file);
      parts.push(`${file}|${stat.size}|${Math.round(stat.mtimeMs)}`);
    }
  }
  return parts.sort().join("\n");
}

async function runFullDownstream(runtime, controls, lastReleasedSignature, lastMaintSignature) {
  let progressed = false;

  if (await runUxBatch(runtime, controls)) {
    progressed = true;
  }
  if (await runSecBatch(runtime, controls)) {
    progressed = true;
  }
  const qaBundle = await runQaBundle(runtime, controls);
  if (qaBundle.progressed) {
    progressed = true;
  }
  const uatBundle = await runUatBundle(runtime, controls);
  if (uatBundle.progressed) {
    progressed = true;
  }
  if (await runDeployBundle(runtime, controls)) {
    progressed = true;
  }
  const qaPost = await runQaPostBundle(runtime, controls, lastReleasedSignature);
  if (qaPost.progressed) {
    progressed = true;
  }
  const maint = await runMaintPostDeploy(
    runtime,
    controls,
    lastMaintSignature
  );
  if (maint.progressed) {
    progressed = true;
  }

  return {
    progressed,
    releasedSignature: qaPost.signature,
    maintSignature: maint.signature,
  };
}

async function runRegressionOnce(runtime, controls, lastReleasedSignature) {
  const qaPost = await runQaPostBundle(runtime, controls, lastReleasedSignature, { force: true });
  const uatRegression = await runUatFullRegression(runtime, controls);
  if (!qaPost.progressed && !uatRegression.progressed) {
    log(controls, "regression: no released requirements to validate");
    return {
      progressed: false,
      releasedSignature: lastReleasedSignature,
    };
  }

  const qaSummary = qaPost.gate
    ? (gatePass(qaPost.gate) ? "pass" : `fail (${String(qaPost.gate.summary || "").slice(0, 140)})`)
    : "n/a";
  const uatSummary = uatRegression.gate
    ? (gatePass(uatRegression.gate) ? "pass" : `fail (${String(uatRegression.gate.summary || "").slice(0, 140)})`)
    : "n/a";
  log(controls, `regression summary qa=${qaSummary} uat=${uatSummary}`);

  return {
    progressed: true,
    releasedSignature: qaPost.signature || releasedSignature(runtime),
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
  let lastMaintSignature = releasedSignature(runtime);

  if (args.mode === "regression") {
    const regression = await runRegressionOnce(runtime, controls, lastReleasedSignature);
    if (regression.releasedSignature) {
      lastReleasedSignature = regression.releasedSignature;
    }
    controls.cleanup();
    return;
  }

  while (!controls.stopRequested) {
    if (await waitIfGloballyPaused(runtime, controls)) {
      if (args.once) {
        break;
      }
      continue;
    }

    const before = snapshotHash(runtime);
    const forceUnderfilledFromVision = shouldForceUnderfilledFromVision(runtime);

    const bundle = startBundleIfReady(
      runtime,
      minBundle,
      maxBundle,
      underfilledCycles,
      controls,
      { forceUnderfilled: forceUnderfilledFromVision }
    );
    underfilledCycles = bundle.underfilledCycles;

    await runArch(runtime, controls);
    await runDev(runtime, controls);

    if (args.mode === "full" && !planningInProgress(runtime)) {
      const downstream = await runFullDownstream(
        runtime,
        controls,
        lastReleasedSignature,
        lastMaintSignature
      );
      if (downstream.releasedSignature) {
        lastReleasedSignature = downstream.releasedSignature;
      }
      if (downstream.maintSignature) {
        lastMaintSignature = downstream.maintSignature;
      }
    }

    if (args.once) {
      break;
    }

    if (controls.stopRequested) {
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
  console.error((err && err.stack) ? err.stack : (err.message || err));
  process.exit(1);
});
