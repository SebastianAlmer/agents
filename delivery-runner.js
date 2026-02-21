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
const { loadRuntimeConfig, ensureQueueDirs } = require("./lib/runtime");
const { getThreadFilePath, readThreadId, clearThreadState } = require("./lib/agent");

const DELIVERY_IDLE_WAIT_MS = 5 * 60 * 1000;

function parseArgs(argv) {
  const args = {
    help: false,
    once: false,
    force: false,
    verbose: false,
    mode: "",
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
    if (arg === "--force") {
      args.force = true;
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

  return args;
}

function usage() {
  console.log(
    "Usage: node delivery-runner.js [--mode full|fast|test] [--once] [--force] [--verbose|--no-verbose] [--min-bundle N] [--max-bundle N]"
  );
}

function normalizeDeliveryMode(value, fallback = "full") {
  const normalized = String(value || fallback || "").toLowerCase().trim();
  if (["dev-only", "dev_only", "devonly", "fast"].includes(normalized)) {
    return "fast";
  }
  if (["test", "uat", "regression", "full-test", "full_test"].includes(normalized)) {
    return "test";
  }
  if (normalized === "full") {
    return "full";
  }
  return fallback;
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
    // Ensure stdin no longer keeps the event loop alive after `--once`.
    if (typeof process.stdin.pause === "function") {
      process.stdin.pause();
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

async function sleepWithStopCheck(ms, controls) {
  let remaining = Math.max(0, Number.parseInt(String(ms || 0), 10));
  const step = 1000;
  while (remaining > 0) {
    if (controls && controls.stopRequested) {
      break;
    }
    const chunk = Math.min(step, remaining);
    await sleep(chunk);
    remaining -= chunk;
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
  await sleepWithStopCheck(waitMs, controls);
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

function hasBusinessClarificationEvidence(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }

  const fm = parseFrontMatter(filePath);
  if (
    frontMatterTruthy(fm.needs_human_decision)
    || frontMatterTruthy(fm.business_decision_needed)
    || frontMatterTruthy(fm.product_decision_needed)
    || frontMatterTruthy(fm.needs_po_decision)
  ) {
    return true;
  }

  const clarifyTypes = parseDelimitedLower(
    fm.clarification_type || fm.clarify_type || fm.decision_type || ""
  );
  if (clarifyTypes.some((token) => ["business", "product", "domain", "stakeholder"].includes(token))) {
    return true;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const hasBusinessCue = /(^|\n)##\s*(open questions?|questions? for (human|po|product)|human decision needed)\b/i.test(raw)
    || /\b(question for (human|po|product|stakeholder)|business decision|product decision|required stakeholder decision)\b/i.test(raw);
  const hasQuestionShape = /\?\s*(\n|$)/.test(raw);
  return hasBusinessCue && hasQuestionShape;
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
  const clarifyAllowed = wantsClarify && hasBusinessClarificationEvidence(misplaced);
  const targetQueue = clarifyAllowed ? "toClarify" : "dev";
  const targetStatus = targetQueue === "dev" ? "dev" : "to-clarify";
  const recoveryReason = wantsClarify
    ? (clarifyAllowed
      ? "- clarify guard passed: explicit business clarification evidence present"
      : "- clarify request ignored: no explicit business clarification evidence")
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
  const wantsClarify = normalized === "clarify";
  const targetQueue = wantsClarify
    ? (hasBusinessClarificationEvidence(misplaced) ? "toClarify" : "blocked")
    : "qa";
  const targetStatus = targetQueue === "qa"
    ? "qa"
    : (targetQueue === "blocked" ? "blocked" : "to-clarify");
  const reason = wantsClarify
    ? (targetQueue === "toClarify"
      ? "- clarify guard passed: explicit business clarification evidence present"
      : "- clarify request rejected: no explicit business clarification evidence; routed to blocked")
    : "- status is not clarify; routed to qa";
  return moveToQueue(runtime, misplaced, targetQueue, targetStatus, [
    "Delivery runner: DEV misroute recovery",
    `- moved from unexpected queue to ${targetQueue}`,
    reason,
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

function devScopeFromScriptPath(scriptPath) {
  const role = path.basename(path.dirname(String(scriptPath || ""))).toLowerCase();
  if (role === "dev-fe") {
    return "frontend";
  }
  if (role === "dev-be") {
    return "backend";
  }
  return "fullstack";
}

function deriveDevThreadKey(requirementPath, scriptPath) {
  const base = path.basename(String(requirementPath || ""), path.extname(String(requirementPath || "")));
  if (!base) {
    return "";
  }
  const scope = devScopeFromScriptPath(scriptPath);
  return `${scope}-${base}`;
}

function resetDevThread(runtime, scriptPath, requirementPath, controls, reason) {
  const agentRoot = path.dirname(String(scriptPath || ""));
  const threadKey = deriveDevThreadKey(requirementPath, scriptPath);
  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto: true,
    threadKey,
  });
  const threadId = readThreadId(threadFile);
  const hasThreadState = Boolean((threadId && threadId.trim()) || fs.existsSync(threadFile));
  if (!hasThreadState) {
    log(
      controls,
      `DEV recovery: no thread state to reset for ${path.basename(requirementPath || "")}`
    );
    return false;
  }
  clearThreadState({
    threadFile,
    threadId,
    agentsRoot: runtime.agentsRoot,
  });
  log(
    controls,
    `DEV recovery: reset thread for ${path.basename(requirementPath || "")} key=${threadKey || "auto"} reason=${reason}`
  );
  return true;
}

function resolveDevHandoff(runtime, sourceFile, name, controls) {
  const qaPath = path.join(runtime.queues.qa, name);
  if (fs.existsSync(qaPath)) {
    removeDuplicateSourceIfTargetExists(sourceFile, qaPath, controls, "DEV handoff");
    return { progressed: true, routedTo: "qa" };
  }
  const clarifyPath = path.join(runtime.queues.toClarify, name);
  if (fs.existsSync(clarifyPath)) {
    removeDuplicateSourceIfTargetExists(sourceFile, clarifyPath, controls, "DEV handoff");
    if (hasBusinessClarificationEvidence(clarifyPath)) {
      return { progressed: true, routedTo: "to-clarify" };
    }
    moveToQueue(runtime, clarifyPath, "blocked", "blocked", [
      "Delivery runner: clarify policy guard",
      "- to-clarify accepted only for explicit business clarification questions",
      "- no explicit business clarification evidence found; routed to blocked",
    ]);
    return { progressed: true, routedTo: "blocked" };
  }
  const humanDecisionPath = runtime.queues.humanDecisionNeeded
    ? path.join(runtime.queues.humanDecisionNeeded, name)
    : "";
  if (humanDecisionPath && fs.existsSync(humanDecisionPath)) {
    removeDuplicateSourceIfTargetExists(sourceFile, humanDecisionPath, controls, "DEV handoff");
    return { progressed: true, routedTo: "human-decision-needed" };
  }
  if (recoverDevMisroute(runtime, name)) {
    return { progressed: true, routedTo: "misroute-recovery" };
  }
  return { progressed: false, routedTo: "" };
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

function upstreamQueuesIdle(runtime) {
  return countFiles(runtime.queues.selected) === 0
    && countFiles(runtime.queues.arch) === 0
    && countFiles(runtime.queues.dev) === 0;
}

function shouldUseLongIdleWait(runtime, mode) {
  if (!upstreamQueuesIdle(runtime)) {
    return false;
  }
  if (String(mode || "").toLowerCase() === "fast") {
    return true;
  }
  return !downstreamInProgress(runtime);
}

function enforceClarifyQueuePolicy(runtime, controls) {
  const clarifyFiles = listQueueFiles(runtime.queues.toClarify);
  let rerouted = 0;
  for (const file of clarifyFiles) {
    if (hasBusinessClarificationEvidence(file)) {
      continue;
    }
    if (moveToQueue(runtime, file, "blocked", "blocked", [
      "Delivery runner: clarify policy enforcement",
      "- to-clarify is reserved for explicit business clarification questions",
      "- requirement lacks explicit business clarification evidence",
      "- rerouted to blocked",
    ])) {
      rerouted += 1;
    }
  }
  if (rerouted > 0) {
    log(
      controls,
      `clarify policy: moved ${rerouted} non-business item(s) from to-clarify to blocked`
    );
  }
  return rerouted > 0;
}

function readPoVisionDecision(runtime) {
  const filePath = path.join(runtime.agentsRoot, ".runtime", "po-vision.decision.json");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      status: String(parsed.status || "").toLowerCase(),
      visionComplete: Boolean(parsed.vision_complete),
      newRequirementsCount: Number.isFinite(Number(parsed.new_requirements_count))
        ? Number(parsed.new_requirements_count)
        : 0,
      updatedRequirementsCount: Number.isFinite(Number(parsed.updated_requirements_count))
        ? Number(parsed.updated_requirements_count)
        : 0,
    };
  } catch {
    return {
      status: "",
      visionComplete: false,
      newRequirementsCount: 0,
      updatedRequirementsCount: 0,
    };
  }
}

function shouldForceUnderfilledFromVision(runtime) {
  if (!runtime || !runtime.po || String(runtime.po.defaultMode || "").toLowerCase() !== "vision") {
    return false;
  }
  const decision = readPoVisionDecision(runtime);
  if (decision.visionComplete && decision.status === "pass") {
    return true;
  }

  // Vision final-drain rule: if PO reports no new/updated requirements in this
  // cycle and selected has remaining work, do not block on bundle_min_size.
  const selectedCount = countFiles(runtime.queues.selected);
  const noNewPlanningOutput = decision.status === "pass"
    && decision.newRequirementsCount === 0
    && decision.updatedRequirementsCount === 0;
  return selectedCount > 0 && noNewPlanningOutput;
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
      if (!hasBusinessClarificationEvidence(clarifyPath)) {
        moveToQueue(runtime, clarifyPath, "dev", "dev", [
          "Delivery runner: ARCH clarify guard",
          "- clarify rejected: no explicit business clarification evidence; routed to dev",
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
  const devTimeoutSeconds = Math.max(0, Number.parseInt(String(runtime.dev && runtime.dev.runTimeoutSeconds || 0), 10));
  const sameThreadRetriesMax = Math.max(0, Number.parseInt(String(runtime.dev && runtime.dev.sameThreadRetries || 0), 10));
  const freshThreadRetriesMax = Math.max(0, Number.parseInt(String(runtime.dev && runtime.dev.freshThreadRetries || 0), 10));
  while (true) {
    const file = listQueueFiles(runtime.queues.dev)[0];
    if (!file || controls.stopRequested) {
      break;
    }

    const sourceFile = resolveRequirementPath(runtime, file) || file;
    const name = path.basename(sourceFile);
    const scriptPath = pickDevScript(runtime, sourceFile);
    let sameThreadRetriesUsed = 0;
    let freshThreadRetriesUsed = 0;
    let done = false;

    while (!done && !controls.stopRequested) {
      const activeSource = resolveRequirementPath(runtime, sourceFile) || sourceFile;
      log(
        controls,
        `DEV start ${name} (${path.basename(path.dirname(scriptPath))}) attempt=${sameThreadRetriesUsed + freshThreadRetriesUsed + 1}`
      );

      const result = await runNodeScript({
        scriptPath,
        args: ["--auto", "--requirement", activeSource],
        cwd: runtime.agentsRoot,
        maxRetries: 0,
        retryDelaySeconds: runtime.loops.retryDelaySeconds,
        stopSignal: getStopSignal(controls),
        timeoutSeconds: devTimeoutSeconds,
      });

      if (!result.ok && result.aborted && controls.stopRequested) {
        done = true;
        break;
      }
      if (!result.ok && result.paused) {
        log(controls, `DEV paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
        done = true;
        break;
      }

      const handoff = resolveDevHandoff(runtime, activeSource, name, controls);
      if (handoff.progressed) {
        progressed = true;
        done = true;
        break;
      }

      const reason = !result.ok
        ? (result.timedOut
          ? `timeout after ${devTimeoutSeconds}s`
          : (result.stderr || "execution failed").slice(0, 700))
        : "agent returned success but did not route requirement to qa/to-clarify";

      if (sameThreadRetriesUsed < sameThreadRetriesMax) {
        sameThreadRetriesUsed += 1;
        log(
          controls,
          `DEV recovery retry same-thread ${sameThreadRetriesUsed}/${sameThreadRetriesMax} req=${name} reason=${reason}`
        );
        continue;
      }

      if (freshThreadRetriesUsed < freshThreadRetriesMax) {
        freshThreadRetriesUsed += 1;
        sameThreadRetriesUsed = 0;
        resetDevThread(runtime, scriptPath, activeSource, controls, reason);
        log(
          controls,
          `DEV recovery retry fresh-thread ${freshThreadRetriesUsed}/${freshThreadRetriesMax} req=${name}`
        );
        continue;
      }

      if (fs.existsSync(activeSource)) {
        const moved = moveToQueue(runtime, activeSource, "blocked", "blocked", [
          "Delivery runner: DEV watchdog escalation",
          `- retries exhausted (same-thread=${sameThreadRetriesMax}, fresh-thread=${freshThreadRetriesMax})`,
          `- last reason: ${reason}`,
          "- technical execution failure; moved to blocked (not to-clarify)",
        ]);
        if (!moved) {
          const fallbackTarget = path.join(runtime.queues.blocked, path.basename(activeSource));
          moveRequirementFile(activeSource, fallbackTarget);
          appendQueueSection(fallbackTarget, [
            "Delivery runner: DEV watchdog forced move",
            `- last reason: ${reason}`,
          ]);
        }
        progressed = true;
      } else {
        log(
          controls,
          `DEV watchdog: requirement source disappeared without handoff req=${name}; skipping to keep flow unblocked`
        );
      }
      done = true;
    }

    if (controls.stopRequested) {
      break;
    }
  }
  return progressed;
}

async function runUxBatch(runtime, controls) {
  if (countFiles(runtime.queues.qa) === 0 && countFiles(runtime.queues.ux) === 0) {
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
    moveAll(runtime, "ux", "blocked", "blocked", "Delivery runner: UX batch failed (technical) -> blocked");
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
    moveAll(runtime, "sec", "blocked", "blocked", "Delivery runner: SEC batch failed (technical) -> blocked");
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

function uxFinalGatePath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "qa-gates");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "ux-final-gate.json");
}

function secFinalGatePath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "qa-gates");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "sec-final-gate.json");
}

function uatFullRegressionGatePath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "qa-gates");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "uat-full-regression-gate.json");
}

function e2eFullGatePath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "qa-gates");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "e2e-full-gate.json");
}

function qaFinalGatePath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "qa-gates");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "post-bundle-final-gate.json");
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
  const deduped = [];
  const seen = new Set();
  for (const entry of findings) {
    const key = [
      normalizeSeverity(entry && entry.severity, "P2"),
      String(entry && entry.title || "").trim().toLowerCase(),
      String(entry && entry.details || "").trim().toLowerCase(),
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
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

function compactLogText(value, maxLen = 700) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return truncateForQueueNote(normalized, maxLen);
}

function createGenericExecutionFailureGate({
  label,
  severity = "P1",
  command = "",
  exitCode = null,
  stderr = "",
  timedOut = false,
  fallbackDetails = "",
}) {
  const parts = [];
  const commandText = String(command || "").trim();
  if (commandText) {
    parts.push(`command=${commandText}`);
  }
  if (Number.isInteger(exitCode)) {
    parts.push(`exit_code=${exitCode}`);
  }
  if (timedOut) {
    parts.push("timed_out=true");
  }
  const stderrText = compactLogText(stderr, 500);
  if (stderrText) {
    parts.push(`stderr=${stderrText}`);
  }
  const fallbackText = compactLogText(fallbackDetails, 300);
  if (fallbackText) {
    parts.push(`details=${fallbackText}`);
  }
  const detailText = parts.join(" | ");
  const summary = detailText
    ? `${label} execution failed: ${truncateForQueueNote(detailText, 240)}`
    : `${label} execution failed. Inspect logs and rerun.`;
  const findingTitle = `${label} execution failed`;
  return {
    status: "fail",
    summary,
    blocking_findings: [
      `${normalizeSeverity(severity, "P1")}: ${findingTitle}${detailText ? ` - ${detailText}` : ""}`,
    ],
    findings: [
      {
        severity: normalizeSeverity(severity, "P1"),
        title: findingTitle,
        details: detailText,
      },
    ],
    manual_uat: [],
  };
}

function createQaExecutionFailureGate(context = {}) {
  return createGenericExecutionFailureGate({
    label: "QA gate",
    severity: "P1",
    command: context.command,
    exitCode: context.exitCode,
    stderr: context.stderr,
    timedOut: context.timedOut,
    fallbackDetails: context.fallbackDetails,
  });
}

function createUxExecutionFailureGate(context = {}) {
  return createGenericExecutionFailureGate({
    label: "UX final gate",
    severity: "P1",
    command: context.command,
    exitCode: context.exitCode,
    stderr: context.stderr,
    timedOut: context.timedOut,
    fallbackDetails: context.fallbackDetails,
  });
}

function createSecExecutionFailureGate(context = {}) {
  return createGenericExecutionFailureGate({
    label: "SEC final gate",
    severity: "P1",
    command: context.command,
    exitCode: context.exitCode,
    stderr: context.stderr,
    timedOut: context.timedOut,
    fallbackDetails: context.fallbackDetails,
  });
}

function createUatExecutionFailureGate(context = {}) {
  return createGenericExecutionFailureGate({
    label: "UAT gate",
    severity: "P1",
    command: context.command,
    exitCode: context.exitCode,
    stderr: context.stderr,
    timedOut: context.timedOut,
    fallbackDetails: context.fallbackDetails,
  });
}

function createMaintExecutionFailureGate(context = {}) {
  return createGenericExecutionFailureGate({
    label: "MAINT hygiene scan",
    severity: "P2",
    command: context.command,
    exitCode: context.exitCode,
    stderr: context.stderr,
    timedOut: context.timedOut,
    fallbackDetails: context.fallbackDetails || "Runner could not complete repository hygiene analysis.",
  });
}

function gatePending(gate) {
  return String(gate && gate.status || "").toLowerCase() === "fail"
    && String(gate && gate.summary || "").trim().toLowerCase() === "pending"
    && Array.isArray(gate && gate.findings)
    && gate.findings.length === 0
    && Array.isArray(gate && gate.blocking_findings)
    && gate.blocking_findings.length === 0;
}

function gateFromAgentResult({ result, parsedGate, createFailureGate, command, gateLabel }) {
  if (!result || !result.ok) {
    return createFailureGate({
      command,
      exitCode: result && result.exitCode,
      stderr: result && result.stderr,
      timedOut: Boolean(result && result.timedOut),
    });
  }

  if (gatePending(parsedGate)) {
    return createFailureGate({
      command,
      exitCode: result.exitCode,
      stderr: result.stderr,
      fallbackDetails: `${gateLabel} completed without writing a definitive gate result.`,
    });
  }

  return parsedGate;
}

function createE2eExecutionFailureGate(details) {
  const stage = String((details && details.stage) || "execution").trim() || "execution";
  const command = String((details && details.command) || "").trim();
  const output = truncateForQueueNote(String((details && details.output) || "no output"), 700);
  const timeout = Boolean(details && details.timedOut);
  const summarySuffix = command ? `: ${command}` : "";
  const timeoutSuffix = timeout ? " (timeout)" : "";
  return {
    status: "fail",
    summary: `Deterministic E2E ${stage} failed${timeoutSuffix}${summarySuffix}`,
    blocking_findings: [`P1: Deterministic E2E ${stage} failed${summarySuffix}`],
    findings: [
      {
        severity: "P1",
        title: `Deterministic E2E ${stage} failed`,
        details: output,
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

function deliveryQualityStatePath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "delivery-quality");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "state.json");
}

function readDeliveryQualityState(runtime) {
  const filePath = deliveryQualityStatePath(runtime);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      return { attempts: {} };
    }
    if (!parsed.attempts || typeof parsed.attempts !== "object") {
      return { attempts: {} };
    }
    return { attempts: parsed.attempts };
  } catch {
    return { attempts: {} };
  }
}

function writeDeliveryQualityState(runtime, state) {
  const filePath = deliveryQualityStatePath(runtime);
  const normalized = state && typeof state === "object" ? state : { attempts: {} };
  if (!normalized.attempts || typeof normalized.attempts !== "object") {
    normalized.attempts = {};
  }
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

function queueBundleIds(runtime, queueName) {
  const dir = runtime.queues[queueName];
  if (!dir) {
    return [];
  }
  const ids = new Set();
  for (const filePath of listQueueFiles(dir)) {
    const fm = parseFrontMatter(filePath);
    const id = String(fm.bundle_id || "").trim();
    if (id) {
      ids.add(id);
    }
  }
  return Array.from(ids).sort();
}

function queueBundleKey(runtime, queueName) {
  const ids = queueBundleIds(runtime, queueName);
  if (ids.length === 0) {
    return `${queueName}:no-bundle`;
  }
  if (ids.length === 1) {
    return ids[0];
  }
  return `mixed:${ids.join("+")}`;
}

function gateAttemptKey(gateName, bundleKey) {
  return `${String(gateName || "").toLowerCase()}:${String(bundleKey || "unknown")}`;
}

function incrementGateAttempt(runtime, gateName, bundleKey) {
  const state = readDeliveryQualityState(runtime);
  const key = gateAttemptKey(gateName, bundleKey);
  const next = Math.max(
    1,
    Number.parseInt(String((state.attempts && state.attempts[key]) || 0), 10) + 1
  );
  state.attempts[key] = next;
  writeDeliveryQualityState(runtime, state);
  return next;
}

function resetGateAttempt(runtime, gateName, bundleKey) {
  const state = readDeliveryQualityState(runtime);
  const key = gateAttemptKey(gateName, bundleKey);
  if (Object.prototype.hasOwnProperty.call(state.attempts, key)) {
    delete state.attempts[key];
    writeDeliveryQualityState(runtime, state);
  }
}

function resetBundleAttempts(runtime, bundleKey) {
  if (!bundleKey) {
    return;
  }
  resetGateAttempt(runtime, "qa", bundleKey);
  resetGateAttempt(runtime, "uat", bundleKey);
}

function truncateForQueueNote(text, max = 260) {
  const raw = String(text || "").trim().replace(/\s+/g, " ");
  if (raw.length <= max) {
    return raw;
  }
  return `${raw.slice(0, Math.max(1, max - 3))}...`;
}

function runShellCheckCommand(runtime, command, options = {}) {
  const timeoutSeconds = Math.max(0, Number.parseInt(String(options.timeoutSeconds || 0), 10));
  const cwd = String(options.cwd || runtime.repoRoot || "").trim() || runtime.repoRoot;
  const env = options.env && typeof options.env === "object"
    ? { ...process.env, ...options.env }
    : process.env;
  const result = spawnSync("bash", ["-lc", command], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env,
    timeout: timeoutSeconds > 0 ? timeoutSeconds * 1000 : undefined,
  });
  const output = `${String(result.stdout || "").trim()}\n${String(result.stderr || "").trim()}`.trim();
  const timedOut = Boolean(result.error && result.error.code === "ETIMEDOUT");
  const errorText = result.error ? String(result.error.message || result.error) : "";
  return {
    ok: result.status === 0 && !timedOut,
    status: Number.isInteger(result.status) ? result.status : 1,
    signal: String(result.signal || ""),
    timedOut,
    output: `${output}\n${errorText}`.trim(),
  };
}

function parseEnvPairs(value) {
  const entries = Array.isArray(value) ? value : [];
  const env = {};
  for (const item of entries) {
    const pair = String(item || "").trim();
    if (!pair) {
      continue;
    }
    const idx = pair.indexOf("=");
    if (idx <= 0) {
      continue;
    }
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1);
    if (!key) {
      continue;
    }
    env[key] = val;
  }
  return env;
}

function runRunnerMandatoryChecks(runtime, controls) {
  const checks = Array.isArray(runtime.qa && runtime.qa.mandatoryChecks)
    ? runtime.qa.mandatoryChecks
    : [];
  if (checks.length === 0) {
    return { ok: true, skipped: true };
  }
  for (const check of checks) {
    const cmd = String(check || "").trim();
    if (!cmd) {
      continue;
    }
    log(controls, `QA precheck: ${cmd}`);
    const result = runShellCheckCommand(runtime, cmd);
    if (!result.ok) {
      return {
        ok: false,
        command: cmd,
        output: result.output,
        status: result.status,
      };
    }
  }
  return { ok: true, skipped: false };
}

function createMandatoryCheckFailureGate(checkResult) {
  const command = String((checkResult && checkResult.command) || "unknown command");
  const output = truncateForQueueNote(String((checkResult && checkResult.output) || "no output"), 500);
  return {
    status: "fail",
    summary: `mandatory check failed: ${command}`,
    blocking_findings: [`P1: Mandatory check failed: ${command}`],
    findings: [
      {
        severity: "P1",
        title: "Mandatory QA check failed",
        details: `${command} :: ${output}`,
      },
    ],
    manual_uat: [],
  };
}

function handleStrictGateFailure(runtime, controls, options) {
  const {
    gateName,
    sourceQueue,
    gate,
  } = options;
  const bundleKey = queueBundleKey(runtime, sourceQueue);
  const attempt = incrementGateAttempt(runtime, gateName, bundleKey);
  const maxFixCycles = Math.max(1, Number(runtime.deliveryQuality && runtime.deliveryQuality.maxFixCycles || 1));
  const summary = truncateForQueueNote(String(gate && gate.summary || `${gateName} gate failed`), 240);
  const allowRouteToDev = Boolean(runtime.deliveryQuality && runtime.deliveryQuality.routeToDevOnFail);

  if (allowRouteToDev && attempt <= maxFixCycles) {
    moveAll(
      runtime,
      sourceQueue,
      "dev",
      "dev",
      `Delivery runner: ${String(gateName || "").toUpperCase()} strict fail attempt ${attempt}/${maxFixCycles} -> dev (summary: ${summary})`
    );
    log(controls, `${String(gateName || "").toUpperCase()} strict fail routed to DEV attempt=${attempt}/${maxFixCycles}`);
    return {
      progressed: true,
      gate,
      attempt,
      routedTo: "dev",
    };
  }

  moveAll(
    runtime,
    sourceQueue,
    "blocked",
    "blocked",
    `Delivery runner: ${String(gateName || "").toUpperCase()} strict fail max attempts reached -> blocked (summary: ${summary})`
  );
  log(controls, `${String(gateName || "").toUpperCase()} strict fail escalated to blocked after attempt=${attempt}`);
  return {
    progressed: true,
    gate,
    attempt,
    routedTo: "blocked",
  };
}

async function runQaBundle(runtime, controls) {
  if (countFiles(runtime.queues.qa) === 0) {
    return {
      progressed: false,
      gate: null,
    };
  }

  const strictQa = Boolean(
    runtime.deliveryQuality
    && runtime.deliveryQuality.strictGate
    && runtime.deliveryQuality.requireQaPass
  );
  const bundleKey = queueBundleKey(runtime, "qa");

  if (strictQa && runtime.qa && runtime.qa.runChecksInRunner) {
    const checks = runRunnerMandatoryChecks(runtime, controls);
    if (!checks.ok) {
      const gate = createMandatoryCheckFailureGate(checks);
      if (runtime.deliveryQuality.emitFollowupsOnFail) {
        applyGateOutcomes(runtime, controls, "qa", gate);
      }
      return handleStrictGateFailure(runtime, controls, {
        gateName: "qa",
        sourceQueue: "qa",
        gate,
      });
    }
  }

  const gatePath = qaBatchGatePath(runtime);
  fs.writeFileSync(gatePath, gateTemplateJson(), "utf8");

  log(controls, strictQa ? "QA bundle gate start (strict)" : "QA bundle gate start (advisory)");
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
  const gate = gateFromAgentResult({
    result,
    parsedGate: parsed,
    createFailureGate: createQaExecutionFailureGate,
    command: "node qa/qa.js --auto --batch-tests --batch-queue qa --gate-file <path>",
    gateLabel: "QA bundle gate",
  });
  if (strictQa) {
    if (gatePass(gate)) {
      resetGateAttempt(runtime, "qa", bundleKey);
      applyGateOutcomes(runtime, controls, "qa", gate);
      moveAll(runtime, "qa", "deploy", "deploy", "Delivery runner: QA strict pass -> deploy");
      return {
        progressed: true,
        gate,
      };
    }
    if (runtime.deliveryQuality.emitFollowupsOnFail) {
      applyGateOutcomes(runtime, controls, "qa", gate);
    }
    return handleStrictGateFailure(runtime, controls, {
      gateName: "qa",
      sourceQueue: "qa",
      gate,
    });
  }

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

  const strictUat = Boolean(
    runtime.deliveryQuality
    && runtime.deliveryQuality.strictGate
    && runtime.deliveryQuality.requireUatPass
  );
  const bundleKey = queueBundleKey(runtime, "deploy");

  const gatePath = uatBatchGatePath(runtime);
  fs.writeFileSync(gatePath, gateTemplateJson(), "utf8");

  log(controls, strictUat ? "UAT bundle gate start (strict)" : "UAT bundle gate start (advisory)");
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
  const gate = gateFromAgentResult({
    result,
    parsedGate: parsed,
    createFailureGate: createUatExecutionFailureGate,
    command: "node uat/uat.js --auto --batch --source-queue deploy --gate-file <path>",
    gateLabel: "UAT bundle gate",
  });
  if (strictUat) {
    if (gatePass(gate)) {
      resetGateAttempt(runtime, "uat", bundleKey);
      applyGateOutcomes(runtime, controls, "uat", gate);
      log(controls, "UAT strict pass");
      return {
        progressed: true,
        gate,
      };
    }
    if (runtime.deliveryQuality.emitFollowupsOnFail) {
      applyGateOutcomes(runtime, controls, "uat", gate);
    }
    return handleStrictGateFailure(runtime, controls, {
      gateName: "uat",
      sourceQueue: "deploy",
      gate,
    });
  }

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

async function runUxFinalPass(runtime, controls) {
  if (countFiles(runtime.queues.released) === 0) {
    return {
      progressed: false,
      gate: null,
    };
  }

  const gatePath = uxFinalGatePath(runtime);
  fs.writeFileSync(gatePath, gateTemplateJson(), "utf8");

  log(controls, "UX final pass start");
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "ux", "ux.js"),
    args: ["--auto", "--final-pass", "--gate-file", gatePath],
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
    log(controls, `UX final pass paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
    return {
      progressed: false,
      gate: null,
    };
  }

  const parsed = parseGate(gatePath);
  const gate = gateFromAgentResult({
    result,
    parsedGate: parsed,
    createFailureGate: createUxExecutionFailureGate,
    command: "node ux/ux.js --auto --final-pass --gate-file <path>",
    gateLabel: "UX final gate",
  });
  return {
    progressed: true,
    gate,
  };
}

async function runSecFinalPass(runtime, controls) {
  if (countFiles(runtime.queues.released) === 0) {
    return {
      progressed: false,
      gate: null,
    };
  }

  const gatePath = secFinalGatePath(runtime);
  fs.writeFileSync(gatePath, gateTemplateJson(), "utf8");

  log(controls, "SEC final pass start");
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "sec", "sec.js"),
    args: ["--auto", "--final-pass", "--gate-file", gatePath],
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
    log(controls, `SEC final pass paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
    return {
      progressed: false,
      gate: null,
    };
  }

  const parsed = parseGate(gatePath);
  const gate = gateFromAgentResult({
    result,
    parsedGate: parsed,
    createFailureGate: createSecExecutionFailureGate,
    command: "node sec/sec.js --auto --final-pass --gate-file <path>",
    gateLabel: "SEC final gate",
  });
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

  const gatePath = uatFullRegressionGatePath(runtime);
  fs.writeFileSync(gatePath, gateTemplateJson(), "utf8");

  log(controls, "UAT full regression start");
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "uat", "uat.js"),
    args: ["--auto", "--full-regression", "--gate-file", gatePath],
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
  const gate = gateFromAgentResult({
    result,
    parsedGate: parsed,
    createFailureGate: createUatExecutionFailureGate,
    command: "node uat/uat.js --auto --full-regression --gate-file <path>",
    gateLabel: "UAT full regression gate",
  });
  return {
    progressed: true,
    gate,
  };
}

function writeGateFile(filePath, gate) {
  if (!filePath) {
    return;
  }
  const payload = gate && typeof gate === "object" ? gate : qaGateTemplate();
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function runE2eCommandList(runtime, controls, stage, commands, options) {
  const list = Array.isArray(commands) ? commands : [];
  const timeoutSeconds = options && options.timeoutSeconds ? options.timeoutSeconds : 0;
  const cwd = options && options.cwd ? options.cwd : runtime.repoRoot;
  const env = options && options.env ? options.env : {};
  let executed = 0;
  for (let i = 0; i < list.length; i++) {
    const command = String(list[i] || "").trim();
    if (!command) {
      continue;
    }
    executed += 1;
    log(controls, `E2E ${stage} command ${i + 1}/${list.length}: ${command}`);
    const result = runShellCheckCommand(runtime, command, {
      cwd,
      timeoutSeconds,
      env,
    });
    if (!result.ok) {
      return {
        ok: false,
        executed,
        gate: createE2eExecutionFailureGate({
          stage,
          command,
          output: result.output,
          timedOut: result.timedOut,
        }),
      };
    }
  }
  return {
    ok: true,
    executed,
  };
}

async function runDeterministicE2eFull(runtime, controls, options = {}) {
  const e2e = runtime.e2e || {};
  const required = Boolean(options.required);
  const enabled = Boolean(e2e.enabled);
  const gatePath = e2eFullGatePath(runtime);
  writeGateFile(gatePath, qaGateTemplate());

  if (!enabled) {
    if (!required) {
      return {
        progressed: false,
        gate: null,
        skipped: true,
        reason: "disabled",
      };
    }
    const gate = createE2eExecutionFailureGate({
      stage: "config",
      command: "[e2e].enabled=true",
      output: "Deterministic E2E required but [e2e].enabled is false.",
    });
    writeGateFile(gatePath, gate);
    return {
      progressed: true,
      gate,
      skipped: false,
    };
  }

  const testCommand = String(e2e.testCommand || "").trim();
  if (!testCommand) {
    const gate = createE2eExecutionFailureGate({
      stage: "config",
      command: "[e2e].test_command",
      output: "Deterministic E2E is enabled but [e2e].test_command is empty.",
    });
    writeGateFile(gatePath, gate);
    return {
      progressed: true,
      gate,
      skipped: false,
    };
  }

  const cwd = String(e2e.workingDir || runtime.repoRoot || "").trim() || runtime.repoRoot;
  const timeoutRaw = Number.parseInt(String(e2e.timeoutSeconds || 1800), 10);
  const timeoutSeconds = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 1800;
  const env = parseEnvPairs(e2e.env);
  let executedCommands = 0;
  let failureGate = null;

  log(controls, `E2E deterministic full run start cwd=${cwd}`);

  const setupResult = runE2eCommandList(runtime, controls, "setup", e2e.setupCommands, {
    cwd,
    timeoutSeconds,
    env,
  });
  executedCommands += setupResult.executed || 0;
  if (!setupResult.ok) {
    failureGate = setupResult.gate;
  }

  if (!failureGate) {
    const healthResult = runE2eCommandList(runtime, controls, "healthcheck", e2e.healthcheckCommands, {
      cwd,
      timeoutSeconds,
      env,
    });
    executedCommands += healthResult.executed || 0;
    if (!healthResult.ok) {
      failureGate = healthResult.gate;
    }
  }

  if (!failureGate) {
    log(controls, `E2E test command: ${testCommand}`);
    const testResult = runShellCheckCommand(runtime, testCommand, {
      cwd,
      timeoutSeconds,
      env,
    });
    executedCommands += 1;
    if (!testResult.ok) {
      failureGate = createE2eExecutionFailureGate({
        stage: "test",
        command: testCommand,
        output: testResult.output,
        timedOut: testResult.timedOut,
      });
    }
  }

  const teardownCommand = String(e2e.teardownCommand || "").trim();
  if (teardownCommand) {
    log(controls, `E2E teardown command: ${teardownCommand}`);
    const teardownResult = runShellCheckCommand(runtime, teardownCommand, {
      cwd,
      timeoutSeconds,
      env,
    });
    executedCommands += 1;
    if (!teardownResult.ok) {
      const teardownGate = createE2eExecutionFailureGate({
        stage: "teardown",
        command: teardownCommand,
        output: teardownResult.output,
        timedOut: teardownResult.timedOut,
      });
      if (!failureGate) {
        failureGate = teardownGate;
      } else {
        log(controls, `E2E teardown also failed: ${truncateForQueueNote(teardownResult.output, 220)}`);
      }
    }
  }

  if (failureGate) {
    writeGateFile(gatePath, failureGate);
    return {
      progressed: true,
      gate: failureGate,
      skipped: false,
    };
  }

  const passGate = {
    status: "pass",
    summary: `Deterministic E2E full regression passed (${executedCommands} command(s)).`,
    blocking_findings: [],
    findings: [],
    manual_uat: [],
  };
  writeGateFile(gatePath, passGate);
  return {
    progressed: true,
    gate: passGate,
    skipped: false,
  };
}

function comprehensiveSystemTestStatePath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "delivery-quality");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "comprehensive-test-state.json");
}

function readComprehensiveSystemTestState(runtime) {
  const filePath = comprehensiveSystemTestStatePath(runtime);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function writeComprehensiveSystemTestState(runtime, state) {
  const filePath = comprehensiveSystemTestStatePath(runtime);
  const normalized = state && typeof state === "object" ? state : {};
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

function hasOpenPlanningOrClarification(runtime) {
  return countFiles(runtime.queues.refinement) > 0
    || countFiles(runtime.queues.backlog) > 0
    || countFiles(runtime.queues.selected) > 0
    || countFiles(runtime.queues.arch) > 0
    || countFiles(runtime.queues.dev) > 0
    || countFiles(runtime.queues.toClarify) > 0
    || countFiles(runtime.queues.humanInput) > 0
    || countFiles(runtime.queues.humanDecisionNeeded) > 0
    || countFiles(runtime.queues.blocked) > 0;
}

function shouldTriggerVisionFinalComprehensiveTest(runtime) {
  if (!runtime || !runtime.po || String(runtime.po.defaultMode || "").toLowerCase() !== "vision") {
    return false;
  }
  if (planningInProgress(runtime) || downstreamInProgress(runtime)) {
    return false;
  }
  if (hasOpenPlanningOrClarification(runtime)) {
    return false;
  }
  const decision = readPoVisionDecision(runtime);
  if (!(decision.visionComplete && decision.status === "pass")) {
    return false;
  }
  return countFiles(runtime.queues.released) > 0;
}

function applyGateByPolicy(runtime, controls, sourceLabel, gate, strict) {
  if (!gate) {
    return;
  }
  const shouldApply = !strict || gatePass(gate) || Boolean(runtime.deliveryQuality.emitFollowupsOnFail);
  if (shouldApply) {
    applyGateOutcomes(runtime, controls, sourceLabel, gate);
  }
}

function strictGateFailRoute(runtime, controls, gateName, gate) {
  return handleStrictGateFailure(runtime, controls, {
    gateName,
    sourceQueue: "released",
    gate,
  });
}

function strictGateEnabled(runtime) {
  return Boolean(runtime.deliveryQuality && runtime.deliveryQuality.strictGate);
}

async function runComprehensiveSystemTest(runtime, controls, options = {}) {
  if (countFiles(runtime.queues.released) === 0) {
    return {
      progressed: false,
      passed: false,
      reason: "no-released-items",
    };
  }

  const strict = options.strict !== undefined ? Boolean(options.strict) : strictGateEnabled(runtime);
  const nonMutating = Boolean(options.nonMutating);
  const enforceStrictRouting = strict && !nonMutating;
  const trackFailuresWithoutRouting = nonMutating;
  const reason = String(options.reason || "manual").trim() || "manual";
  const runDeterministicE2e = options.runDeterministicE2e !== undefined
    ? Boolean(options.runDeterministicE2e)
    : Boolean(runtime.e2e && runtime.e2e.enabled);
  const requireDeterministicE2e = options.requireDeterministicE2e !== undefined
    ? Boolean(options.requireDeterministicE2e)
    : false;
  const releasedBundleKey = queueBundleKey(runtime, "released");
  let hasNonMutatingFailure = false;
  let firstFailureReason = "";

  log(
    controls,
    `comprehensive test start reason=${reason} strict=${strict} non_mutating=${nonMutating}`
  );

  if (runtime.qa && runtime.qa.runChecksInRunner) {
    const checks = runRunnerMandatoryChecks(runtime, controls);
    if (!checks.ok) {
      const gate = createMandatoryCheckFailureGate(checks);
      applyGateByPolicy(runtime, controls, "qa-full", gate, enforceStrictRouting);
      if (enforceStrictRouting) {
        await strictGateFailRoute(runtime, controls, "qa-full", gate);
      } else if (trackFailuresWithoutRouting) {
        hasNonMutatingFailure = true;
        firstFailureReason = firstFailureReason || "mandatory-checks-failed";
      }
      return {
        progressed: true,
        passed: false,
        reason: "mandatory-checks-failed",
      };
    }
    resetGateAttempt(runtime, "qa-full", releasedBundleKey);
  }

  const uxFinal = await runUxFinalPass(runtime, controls);
  if (!uxFinal.progressed && !uxFinal.gate) {
    return {
      progressed: false,
      passed: false,
      reason: "ux-final-not-run",
    };
  }
  if (uxFinal.progressed && uxFinal.gate) {
    const uxGate = uxFinal.gate;
    applyGateByPolicy(runtime, controls, "ux-final", uxGate, enforceStrictRouting);
    if (enforceStrictRouting && !gatePass(uxGate)) {
      await strictGateFailRoute(runtime, controls, "ux-final", uxGate);
      return {
        progressed: true,
        passed: false,
        reason: "ux-final-failed",
      };
    }
    if (!gatePass(uxGate) && trackFailuresWithoutRouting) {
      hasNonMutatingFailure = true;
      firstFailureReason = firstFailureReason || "ux-final-failed";
    }
    if (gatePass(uxGate)) {
      resetGateAttempt(runtime, "ux-final", releasedBundleKey);
    }
  }

  const secFinal = await runSecFinalPass(runtime, controls);
  if (!secFinal.progressed && !secFinal.gate) {
    return {
      progressed: false,
      passed: false,
      reason: "sec-final-not-run",
    };
  }
  if (secFinal.progressed && secFinal.gate) {
    const secGate = secFinal.gate;
    applyGateByPolicy(runtime, controls, "sec-final", secGate, enforceStrictRouting);
    if (enforceStrictRouting && !gatePass(secGate)) {
      await strictGateFailRoute(runtime, controls, "sec-final", secGate);
      return {
        progressed: true,
        passed: false,
        reason: "sec-final-failed",
      };
    }
    if (!gatePass(secGate) && trackFailuresWithoutRouting) {
      hasNonMutatingFailure = true;
      firstFailureReason = firstFailureReason || "sec-final-failed";
    }
    if (gatePass(secGate)) {
      resetGateAttempt(runtime, "sec-final", releasedBundleKey);
    }
  }

  const qaFinal = await runQaPostBundle(runtime, controls, "", { force: true, applyOutcomes: false });
  if (!qaFinal.progressed && !qaFinal.gate) {
    return {
      progressed: false,
      passed: false,
      reason: "qa-final-not-run",
    };
  }
  if (qaFinal.progressed && qaFinal.gate) {
    const qaGate = qaFinal.gate;
    applyGateByPolicy(runtime, controls, "qa-final", qaGate, enforceStrictRouting);
    if (enforceStrictRouting && !gatePass(qaGate)) {
      await strictGateFailRoute(runtime, controls, "qa-final", qaGate);
      return {
        progressed: true,
        passed: false,
        reason: "qa-final-failed",
      };
    }
    if (!gatePass(qaGate) && trackFailuresWithoutRouting) {
      hasNonMutatingFailure = true;
      firstFailureReason = firstFailureReason || "qa-final-failed";
    }
    if (gatePass(qaGate)) {
      resetGateAttempt(runtime, "qa-final", releasedBundleKey);
    }
  }

  if (runDeterministicE2e) {
    const e2eFull = await runDeterministicE2eFull(runtime, controls, {
      required: requireDeterministicE2e,
    });
    if (!e2eFull.progressed && !e2eFull.gate) {
      log(controls, "E2E deterministic full run skipped");
    }
    if (e2eFull.progressed && e2eFull.gate) {
      const e2eGate = e2eFull.gate;
      applyGateByPolicy(runtime, controls, "e2e-full", e2eGate, enforceStrictRouting);
      if (enforceStrictRouting && !gatePass(e2eGate)) {
        await strictGateFailRoute(runtime, controls, "e2e-full", e2eGate);
        return {
          progressed: true,
          passed: false,
          reason: "e2e-full-failed",
        };
      }
      if (!gatePass(e2eGate) && trackFailuresWithoutRouting) {
        hasNonMutatingFailure = true;
        firstFailureReason = firstFailureReason || "e2e-full-failed";
      }
      if (gatePass(e2eGate)) {
        resetGateAttempt(runtime, "e2e-full", releasedBundleKey);
      }
    }
  }

  const uatFull = await runUatFullRegression(runtime, controls);
  if (!uatFull.progressed && !uatFull.gate) {
    return {
      progressed: false,
      passed: false,
      reason: "uat-full-not-run",
    };
  }
  if (uatFull.progressed && uatFull.gate) {
    const uatGate = uatFull.gate;
    applyGateByPolicy(runtime, controls, "uat-full", uatGate, enforceStrictRouting);
    if (enforceStrictRouting && !gatePass(uatGate)) {
      await strictGateFailRoute(runtime, controls, "uat-full", uatGate);
      return {
        progressed: true,
        passed: false,
        reason: "uat-full-failed",
      };
    }
    if (!gatePass(uatGate) && trackFailuresWithoutRouting) {
      hasNonMutatingFailure = true;
      firstFailureReason = firstFailureReason || "uat-full-failed";
    }
    if (gatePass(uatGate)) {
      resetGateAttempt(runtime, "uat-full", releasedBundleKey);
    }
  }

  const state = readComprehensiveSystemTestState(runtime);
  state.lastRunAt = new Date().toISOString();
  state.lastReason = reason;
  const signature = releasedSignature(runtime);
  if (hasNonMutatingFailure) {
    state.lastFailureSignature = signature;
    state.lastFailureReason = firstFailureReason || "comprehensive-gate-failed";
    writeComprehensiveSystemTestState(runtime, state);
    log(controls, `comprehensive test failed reason=${state.lastFailureReason}`);
    return {
      progressed: true,
      passed: false,
      reason: state.lastFailureReason,
    };
  }

  state.lastFailureSignature = "";
  state.lastFailureReason = "";
  state.lastPassSignature = signature;
  writeComprehensiveSystemTestState(runtime, state);

  log(controls, `comprehensive test passed reason=${reason}`);
  return {
    progressed: true,
    passed: true,
    reason: "passed",
  };
}

async function maybeRunComprehensiveSystemTest(runtime, controls, options = {}) {
  const signature = releasedSignature(runtime);
  if (!signature) {
    return {
      progressed: false,
      passed: false,
      reason: "no-signature",
    };
  }

  const force = Boolean(options.force);
  const state = readComprehensiveSystemTestState(runtime);
  if (!force && String(state.lastPassSignature || "") === signature) {
    return {
      progressed: false,
      passed: true,
      reason: "already-passed",
    };
  }

  return runComprehensiveSystemTest(runtime, controls, options);
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
  const gate = gateFromAgentResult({
    result,
    parsedGate: parsed,
    createFailureGate: createMaintExecutionFailureGate,
    command: "node maint/maint.js --auto --post-deploy --decision-file <path>",
    gateLabel: "MAINT post-deploy decision",
  });
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
  const deployBundleIds = queueBundleIds(runtime, "deploy");
  const deployBundleKey = queueBundleKey(runtime, "deploy");
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
    moveAll(runtime, "deploy", "blocked", "blocked", "Delivery runner: deploy bundle failed (technical) -> blocked");
    return true;
  }

  moveAll(runtime, "deploy", "released", "released", "Delivery runner: deploy bundle released");
  if (deployBundleIds.length > 0) {
    for (const bundleId of deployBundleIds) {
      resetBundleAttempts(runtime, bundleId);
    }
  } else {
    resetBundleAttempts(runtime, deployBundleKey);
  }
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
  const gate = gateFromAgentResult({
    result,
    parsedGate: parsed,
    createFailureGate: createQaExecutionFailureGate,
    command: "node qa/qa.js --auto --final-pass --gate-file <path>",
    gateLabel: "QA post-bundle final gate",
  });
  const shouldApplyOutcomes = options.applyOutcomes !== false;
  if (shouldApplyOutcomes) {
    applyGateOutcomes(runtime, controls, "qa-post", gate);
  }
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

async function runFullDownstream(runtime, controls, lastReleasedSignature, lastMaintSignature, options = {}) {
  let progressed = false;
  const performDeploy = options.performDeploy !== false;
  const runQaPost = options.runQaPost !== false;
  const runMaint = options.runMaint !== false;

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
  if (performDeploy) {
    if (await runDeployBundle(runtime, controls)) {
      progressed = true;
    }
  } else if (countFiles(runtime.queues.deploy) > 0) {
    const moved = moveAll(
      runtime,
      "deploy",
      "released",
      "released",
      "Delivery runner: test mode - skip deploy actions; keep released snapshot for comprehensive tests"
    );
    if (moved > 0) {
      log(controls, `test mode normalized deploy->released: ${moved}`);
      progressed = true;
    }
  }
  let qaPost = { progressed: false, signature: lastReleasedSignature };
  if (runQaPost) {
    qaPost = await runQaPostBundle(runtime, controls, lastReleasedSignature);
    if (qaPost.progressed) {
      progressed = true;
    }
  }

  let maint = { progressed: false, signature: lastMaintSignature };
  if (runMaint) {
    maint = await runMaintPostDeploy(
      runtime,
      controls,
      lastMaintSignature
    );
    if (maint.progressed) {
      progressed = true;
    }
  }

  return {
    progressed,
    releasedSignature: qaPost.signature || lastReleasedSignature,
    maintSignature: maint.signature || lastMaintSignature,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  const runtime = loadRuntimeConfig(path.resolve(__dirname));
  ensureQueueDirs(runtime.queues);
  const mode = normalizeDeliveryMode(
    args.mode || (runtime.deliveryRunner && runtime.deliveryRunner.defaultMode) || "full",
    "full"
  );

  const minBundle = normalizePositiveInt(args.minBundle, runtime.loops.bundleMinSize);
  const maxBundle = Math.max(minBundle, normalizePositiveInt(args.maxBundle, runtime.loops.bundleMaxSize));

  const controls = createControls(args.verbose, runtime);
  process.on("exit", () => controls.cleanup());

  log(controls, `mode=${mode}`);
  log(controls, `bundle min=${minBundle} max=${maxBundle}`);

  let underfilledCycles = 0;
  let lastReleasedSignature = "";
  let lastMaintSignature = releasedSignature(runtime);
  let forceComprehensiveOnce = Boolean(args.force);

  while (!controls.stopRequested) {
    if (await waitIfGloballyPaused(runtime, controls)) {
      if (args.once) {
        break;
      }
      continue;
    }

    enforceClarifyQueuePolicy(runtime, controls);

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

    if ((mode === "full" || mode === "test") && !planningInProgress(runtime)) {
      const downstream = await runFullDownstream(
        runtime,
        controls,
        lastReleasedSignature,
        lastMaintSignature,
        mode === "test"
          ? { performDeploy: false, runQaPost: false, runMaint: false }
          : {}
      );
      if (downstream.releasedSignature) {
        lastReleasedSignature = downstream.releasedSignature;
      }
      if (downstream.maintSignature) {
        lastMaintSignature = downstream.maintSignature;
      }
    }

    if (mode === "test" && !planningInProgress(runtime) && !downstreamInProgress(runtime)) {
      const result = await maybeRunComprehensiveSystemTest(runtime, controls, {
        reason: "test-mode",
        force: forceComprehensiveOnce,
        nonMutating: true,
        runDeterministicE2e: true,
        requireDeterministicE2e: Boolean(runtime.e2e && runtime.e2e.requiredInTestMode),
      });
      if (forceComprehensiveOnce && result.reason !== "no-signature") {
        forceComprehensiveOnce = false;
      }
    }

    if (mode === "full" && shouldTriggerVisionFinalComprehensiveTest(runtime)) {
      const result = await maybeRunComprehensiveSystemTest(runtime, controls, {
        reason: "vision-complete",
        force: forceComprehensiveOnce,
        runDeterministicE2e: Boolean(runtime.e2e && runtime.e2e.runOnFullCompletion),
        requireDeterministicE2e: false,
      });
      if (forceComprehensiveOnce && result.reason !== "no-signature") {
        forceComprehensiveOnce = false;
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
      if (shouldUseLongIdleWait(runtime, mode)) {
        const minutes = Math.max(1, Math.round(DELIVERY_IDLE_WAIT_MS / 60000));
        process.stdout.write(
          `DELIVERY: waiting ${minutes}m - upstream idle (selected=0 arch=0 dev=0), checking again for new PO input\n`
        );
        await sleepWithStopCheck(DELIVERY_IDLE_WAIT_MS, controls);
      } else {
        await sleepWithStopCheck(Math.max(1, runtime.loops.deliveryPollSeconds) * 1000, controls);
      }
    }
  }

  controls.cleanup();
}

main().catch((err) => {
  console.error((err && err.stack) ? err.stack : (err.message || err));
  process.exit(1);
});
