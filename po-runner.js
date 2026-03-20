#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");
const {
  sleep,
  getFirstFile,
  countFiles,
  moveRequirementFile,
  parseFrontMatter,
  routeByStatus,
  setFrontMatterStatus,
  appendQueueSection,
  upsertMarkdownSection,
  writeRefinementItems,
  resolveSourcePath,
  runNodeScript,
  normalizeStatus,
  listQueueFiles,
  getActivePauseState,
  readPauseState,
  clearPauseState,
  readBundleRegistry,
  writeBundleRegistry,
  formatBundleId,
  parseBundleSequence,
} = require("./lib/flow-core");
const { loadRuntimeConfig, ensureQueueDirs } = require("./lib/runtime");

const PO_IDLE_WAIT_MS = 5 * 60 * 1000;
const ALLOWED_WONT_DO_DECISION_REASONS = new Set([
  "duplicate",
  "obsolete",
  "invalid",
  "deprioritized",
  "already_implemented",
]);
const DEFAULT_DECISION_REASON_BY_TARGET = {
  selected: "selected_ready_now",
  backlog: "backlog_deferred",
  refinement: "refinement_default",
  toClarify: "to_clarify_default",
  humanInput: "human_input_default",
  humanDecisionNeeded: "human_decision_default",
  wontDo: "wont_do_unspecified",
};

function normalizePoMode(value, fallback = "vision") {
  const normalized = String(value || fallback || "").trim().toLowerCase();
  if (["vision", "product-vision", "pos"].includes(normalized)) {
    return "vision";
  }
  return "intake";
}

function parseArgs(argv) {
  const args = {
    help: false,
    once: false,
    verbose: false,
    mode: "",
    skipProductVisionCheck: false,
    visionMaxCycles: NaN,
    visionMaxRequirements: NaN,
    visionStableCycles: NaN,
    lowWatermark: NaN,
    highWatermark: NaN,
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
      args.mode = String(argv[i + 1] || "");
      i++;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      args.mode = String(raw.split("=", 2)[1] || "");
      continue;
    }

    if (arg === "--skip-product-vision-check" || arg === "--skip-pos-check") {
      args.skipProductVisionCheck = true;
      continue;
    }

    if (arg === "--vision-max-cycles") {
      args.visionMaxCycles = Number.parseInt(String(argv[i + 1] || ""), 10);
      i++;
      continue;
    }
    if (arg.startsWith("--vision-max-cycles=")) {
      args.visionMaxCycles = Number.parseInt(String(raw.split("=", 2)[1] || ""), 10);
      continue;
    }

    if (arg === "--vision-max-req") {
      args.visionMaxRequirements = Number.parseInt(String(argv[i + 1] || ""), 10);
      i++;
      continue;
    }
    if (arg.startsWith("--vision-max-req=")) {
      args.visionMaxRequirements = Number.parseInt(String(raw.split("=", 2)[1] || ""), 10);
      continue;
    }

    if (arg === "--vision-stable-cycles") {
      args.visionStableCycles = Number.parseInt(String(argv[i + 1] || ""), 10);
      i++;
      continue;
    }
    if (arg.startsWith("--vision-stable-cycles=")) {
      args.visionStableCycles = Number.parseInt(String(raw.split("=", 2)[1] || ""), 10);
      continue;
    }

    if (arg === "--low-watermark") {
      args.lowWatermark = Number.parseInt(String(argv[i + 1] || ""), 10);
      i++;
      continue;
    }
    if (arg.startsWith("--low-watermark=")) {
      args.lowWatermark = Number.parseInt(String(raw.split("=", 2)[1] || ""), 10);
      continue;
    }
    if (arg === "--high-watermark") {
      args.highWatermark = Number.parseInt(String(argv[i + 1] || ""), 10);
      i++;
      continue;
    }
    if (arg.startsWith("--high-watermark=")) {
      args.highWatermark = Number.parseInt(String(raw.split("=", 2)[1] || ""), 10);
      continue;
    }
  }

  return args;
}

function usage() {
  console.log(
    "Usage: node po-runner.js [--mode vision|intake] [--once] [--verbose|--no-verbose] [--low-watermark N] [--high-watermark N]"
  );
}

function normalizePositiveInt(value, fallback, min = 1) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

function normalizeNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function runnerAgentTimeoutSeconds(runtime) {
  const parsed = Number.parseInt(
    String(runtime && runtime.deliveryRunner && runtime.deliveryRunner.agentTimeoutSeconds || 0),
    10
  );
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed;
}

function runnerNoOutputTimeoutSeconds(runtime) {
  const parsed = Number.parseInt(
    String(runtime && runtime.deliveryRunner && runtime.deliveryRunner.noOutputTimeoutSeconds || 0),
    10
  );
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed;
}

function retryMaxForPoStage(runtime, stageName, fallback = 0) {
  const policy = runtime && runtime.retryPolicy ? runtime.retryPolicy : {};
  const map = {
    intake: policy.poIntakeRetryMax,
    vision: policy.poVisionRetryMax,
  };
  const value = map[String(stageName || "").toLowerCase()];
  if (!Number.isFinite(value)) {
    return Math.max(0, Number.parseInt(String(fallback || 0), 10) || 0);
  }
  return Math.max(0, Number.parseInt(String(value), 10) || 0);
}

function runnerMetricsDir(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime", "runner-metrics");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function appendRunnerMetric(runtime, event) {
  try {
    const dir = runnerMetricsDir(runtime);
    const eventPath = path.join(dir, "events.jsonl");
    const summaryPath = path.join(dir, "summary.json");
    const payload = {
      ts: new Date().toISOString(),
      runner: "po",
      ...event,
    };
    fs.appendFileSync(eventPath, `${JSON.stringify(payload)}\n`, "utf8");

    let summary = { totals: { events: 0 }, byRunner: {}, byStage: {}, byResult: {} };
    if (fs.existsSync(summaryPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
        if (parsed && typeof parsed === "object") {
          summary = parsed;
        }
      } catch {
        // keep defaults
      }
    }
    summary.totals = summary.totals && typeof summary.totals === "object" ? summary.totals : { events: 0 };
    summary.byRunner = summary.byRunner && typeof summary.byRunner === "object" ? summary.byRunner : {};
    summary.byStage = summary.byStage && typeof summary.byStage === "object" ? summary.byStage : {};
    summary.byResult = summary.byResult && typeof summary.byResult === "object" ? summary.byResult : {};
    summary.totals.events = Math.max(0, Number.parseInt(String(summary.totals.events || 0), 10)) + 1;
    const runnerKey = String(payload.runner || "po");
    const stageKey = String(payload.stage || "unknown");
    const resultKey = String(payload.result || "unknown");
    summary.byRunner[runnerKey] = Math.max(0, Number.parseInt(String(summary.byRunner[runnerKey] || 0), 10)) + 1;
    summary.byStage[stageKey] = Math.max(0, Number.parseInt(String(summary.byStage[stageKey] || 0), 10)) + 1;
    summary.byResult[resultKey] = Math.max(0, Number.parseInt(String(summary.byResult[resultKey] || 0), 10)) + 1;
    summary.updatedAt = new Date().toISOString();
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  } catch {
    // best effort only
  }
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
    drainRequested: false,
    onStop(callback) {
      if (typeof callback !== "function") {
        return () => {};
      }
      stopHooks.add(callback);
      return () => stopHooks.delete(callback);
    },
    requestStop(reason = "") {
      if (controls.stopRequested) {
        process.stdout.write("\nPO-RUNNER: force stop\n");
        process.exit(130);
        return;
      }
      controls.stopRequested = true;
      if (reason) {
        process.stdout.write(`\nPO-RUNNER: stop requested (${reason})\n`);
      }
      for (const hook of stopHooks) {
        try {
          hook();
        } catch {
          // ignore hook errors during shutdown
        }
      }
    },
    requestDrain(reason = "q") {
      if (controls.stopRequested) {
        return;
      }
      if (controls.drainRequested) {
        controls.requestStop(`${reason} (force)`);
        return;
      }
      controls.drainRequested = true;
      process.stdout.write("\nPO-RUNNER: graceful stop requested (finish current item, then exit)\n");
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
      controls.requestDrain("q");
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

function log(controls, message) {
  if (controls.verbose) {
    process.stdout.write(`${timestampMinute()} PO-RUNNER: ${message}\n`);
  }
}

function resetGlobalPauseOnStartup(runtime, controls) {
  const state = readPauseState(runtime.agentsRoot);
  if (!state || !state.active) {
    return;
  }
  const reason = String(state.reason || "unknown").replace(/_/g, "-");
  const source = String(state.source || "unknown");
  const resumeAfter = String(state.resumeAfter || "unknown");
  clearPauseState(runtime.agentsRoot);
  process.stdout.write(
    `${timestampMinute()} PO-RUNNER: startup pause reset (reason=${reason} source=${source} resume_after=${resumeAfter})\n`
  );
  log(controls, "global pause state cleared on startup");
}

function timestampMinute() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
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

function isEscalationPauseReason(reason) {
  return new Set([
    "auth_forbidden",
    "usage_limit",
    "rate_limit",
    "insufficient_quota",
    "quota_exceeded",
    "too_many_requests",
    "retry_later",
  ]).has(String(reason || ""));
}

function writePauseEscalationForHumanDecision(runtime, pauseState, runnerLabel) {
  const targetDir = runtime && runtime.queues ? runtime.queues.humanDecisionNeeded : "";
  if (!targetDir) {
    return "";
  }
  try {
    const reason = String((pauseState && pauseState.reason) || "limit").trim() || "limit";
    const resumeAfter = String((pauseState && pauseState.resumeAfter) || "").trim() || "unknown";
    const hash = crypto
      .createHash("sha1")
      .update(`${runnerLabel}|${reason}|${resumeAfter}`)
      .digest("hex")
      .slice(0, 10)
      .toUpperCase();
    const id = `REQ-OPS-${String(runnerLabel || "RUNNER").toUpperCase()}-LIMIT-${hash}`;
    const filePath = path.join(targetDir, `${id}.md`);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    const source = String((pauseState && pauseState.source) || "unknown");
    const excerpt = String((pauseState && pauseState.rawExcerpt) || "").trim();
    const lines = [
      "---",
      `id: ${id}`,
      `title: ${runnerLabel} blocked by model usage/auth limit`,
      "status: human-decision-needed",
      `source: ${String(runnerLabel || "runner").toLowerCase()}`,
      "implementation_scope: backend",
      "visual_change_intent: false",
      "baseline_decision: none",
      "---",
      "",
      "# Goal",
      "Human decision needed because runner cannot continue due to model access/usage limits.",
      "",
      "## Incident",
      `- runner: ${runnerLabel}`,
      `- reason: ${reason}`,
      `- source: ${source}`,
      `- resume_after: ${resumeAfter}`,
      excerpt ? `- excerpt: ${excerpt}` : "- excerpt: (none)",
      "",
      "## Decision needed",
      "- Provide model capacity/access (or switch model) and restart the affected runner.",
      "- Optional: pause all automated runs until capacity is restored.",
      "",
      "## PO Results",
      "- routed to human-decision-needed due to runner blocking limit condition.",
      "",
    ];
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
    return filePath;
  } catch {
    return "";
  }
}

function cleanupRequirementJsonArtifacts(runtime, controls, phase = "") {
  const root = runtime && runtime.requirementsRoot ? runtime.requirementsRoot : "";
  if (!root || !fs.existsSync(root)) {
    return 0;
  }
  const removed = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!/\.json(?:\..*)?$/i.test(entry.name)) {
        continue;
      }
      try {
        fs.unlinkSync(fullPath);
        removed.push(path.relative(root, fullPath));
      } catch {
        // ignore per-file cleanup failures
      }
    }
  }
  if (removed.length > 0) {
    log(
      controls,
      `requirements json cleanup${phase ? ` (${phase})` : ""}: removed=${removed.length} [${removed.slice(0, 8).join(", ")}${removed.length > 8 ? ", ..." : ""}]`
    );
  }
  return removed.length;
}

async function waitIfGloballyPaused(runtime, controls) {
  const pauseState = getActivePauseState(runtime.agentsRoot);
  if (!pauseState) {
    return false;
  }
  process.stdout.write(`${timestampMinute()} PO-RUNNER: ${formatPauseLine(pauseState)}\n`);
  const reason = String((pauseState && pauseState.reason) || "");
  if (isEscalationPauseReason(reason)) {
    const escalationPath = writePauseEscalationForHumanDecision(runtime, pauseState, "PO-RUNNER");
    if (escalationPath) {
      process.stdout.write(
        `${timestampMinute()} PO-RUNNER: escalated global pause to human-decision-needed (${path.basename(escalationPath)})\n`
      );
    }
    if (controls && typeof controls.requestStop === "function") {
      controls.requestStop(`global pause escalation (${reason})`);
    }
    return true;
  }
  const fallbackMs = Math.max(1, runtime.loops.poPollSeconds) * 1000;
  const waitMs = Number.isFinite(pauseState.remainingMs)
    ? Math.min(Math.max(1000, pauseState.remainingMs), fallbackMs)
    : fallbackMs;
  await sleepWithStopCheck(waitMs, controls);
  return true;
}

function planningQueuesBusy(runtime) {
  return countFiles(runtime.queues.arch) > 0 || countFiles(runtime.queues.dev) > 0;
}

function shouldFillSelected(runtime, highWatermark, state, controls) {
  const registry = readBundleRegistryForRuntime(runtime);
  const readyBundleId = String(registry.ready_bundle_id || "").trim();
  if (readyBundleId) {
    log(controls, `bundle prep paused: ready bundle waiting (${readyBundleId})`);
    return false;
  }

  const selectedCount = countFiles(runtime.queues.selected);
  const planningBusy = planningQueuesBusy(runtime);

  if (state.bundleLocked) {
    if (!planningBusy && selectedCount === 0) {
      state.bundleLocked = false;
      log(controls, "bundle lock released (selected=0 and planning queues empty)");
    } else {
      return false;
    }
  }

  if (planningBusy) {
    return false;
  }

  const bundleTarget = Math.max(highWatermark, Math.max(1, Number.parseInt(String(runtime.loops && runtime.loops.bundleMinSize || 1), 10) || 1));
  if (selectedCount >= bundleTarget) {
    state.bundleLocked = true;
    log(controls, `bundle lock engaged at selected=${selectedCount} (target=${bundleTarget})`);
    return false;
  }

  return selectedCount < bundleTarget;
}

function logWaitCheck(runtime, state, controls, highWatermark) {
  if (!controls.verbose) {
    return;
  }
  const selectedCount = countFiles(runtime.queues.selected);
  const archCount = countFiles(runtime.queues.arch);
  const devCount = countFiles(runtime.queues.dev);
  const planningBusy = archCount > 0 || devCount > 0;
  const registry = readBundleRegistryForRuntime(runtime);
  const readyBundleId = String(registry.ready_bundle_id || "").trim();

  let reason = "no-intake-needed";
  if (state && state.bundleLocked) {
    reason = "bundle-locked";
  } else if (readyBundleId) {
    reason = `bundle-ready(${readyBundleId})`;
  } else if (planningBusy) {
    reason = "planning-busy";
  } else if (selectedCount >= Math.max(highWatermark, Math.max(1, Number.parseInt(String(runtime.loops && runtime.loops.bundleMinSize || 1), 10) || 1))) {
    reason = "selected-at-target";
  }

  log(
    controls,
    `wait-check reason=${reason} selected=${selectedCount} arch=${archCount} dev=${devCount} next-check<=${Math.max(1, runtime.loops.poPollSeconds)}s`
  );
}

function findVisionOpenDecisionHint(runtime) {
  const files = Array.isArray(runtime.productVisionFiles) ? runtime.productVisionFiles : [];
  const candidates = files.filter((filePath) => {
    const base = path.basename(String(filePath || "")).toLowerCase();
    return /^09[._-]/.test(base) || /open[ _-]?decisions?/.test(base);
  });

  let best = { file: "", count: 0 };
  for (const filePath of candidates) {
    if (!filePath || !fs.existsSync(filePath)) {
      continue;
    }
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      // Strict signal only: explicit human-decision tags.
      // Avoid false positives from historical notes or unchecked checklists in 09_* docs.
      const explicitHumanDecision = (raw.match(
        /^\s*[-*]\s+.*\b(human[-_ ]decision|needs[-_ ]human|hard[-_ ]vision[-_ ]conflict)\b.*$/gim
      ) || []).length;
      const unresolved = explicitHumanDecision;
      if (unresolved > best.count) {
        best = { file: path.basename(filePath), count: unresolved };
      } else if (!best.file) {
        best = { file: path.basename(filePath), count: unresolved };
      }
    } catch {
      // ignore unreadable file and continue
    }
  }
  return best;
}

function waitReason(runtime, state, highWatermark, mode) {
  const selected = countFiles(runtime.queues.selected);
  const minBundle = Math.max(
    1,
    Number.parseInt(String(runtime.loops && runtime.loops.bundleMinSize || 1), 10) || 1
  );
  const arch = countFiles(runtime.queues.arch);
  const dev = countFiles(runtime.queues.dev);
  const planningBusy = arch > 0 || dev > 0;
  const toClarify = countFiles(runtime.queues.toClarify);
  const humanInput = countFiles(runtime.queues.humanInput);
  const backlog = countFiles(runtime.queues.backlog);
  const refinement = countFiles(runtime.queues.refinement);
  const humanDecisionNeeded = countFiles(runtime.queues.humanDecisionNeeded);
  const intakeCandidates = listIntakeCandidates(runtime).length;
  const registry = readBundleRegistryForRuntime(runtime);
  const readyBundleId = String(registry.ready_bundle_id || "").trim();
  const activeBundleId = String(registry.active_bundle_id || "").trim();

  let reason = "no actionable intake work right now";
  if (planningBusy) {
    reason = `planning busy (arch=${arch}, dev=${dev})`;
  } else if (readyBundleId) {
    reason = `ready bundle waiting for delivery start (${readyBundleId})`;
  } else if (state && state.bundleLocked) {
    reason = `bundle locked while delivery drains (selected=${selected})`;
  } else if (selected >= Math.max(highWatermark, minBundle)) {
    reason = `selected buffer at target (${selected}/${Math.max(highWatermark, minBundle)})`;
  } else if (selected > 0) {
    reason = `waiting for full bundle (${selected}/${minBundle})`;
  } else if (mode === "vision") {
    const visionHint = findVisionOpenDecisionHint(runtime);
    if (intakeCandidates > 0) {
      reason = `intake candidates present but guarded/cooling down (${intakeCandidates})`;
    } else if (visionHint.count > 0) {
      reason = `vision has explicit unresolved decisions (${visionHint.file}: ${visionHint.count})`;
    } else {
      reason = "waiting for new planning input or released changes";
    }
  } else if (intakeCandidates > 0) {
    reason = `intake candidates present but guarded/cooling down (${intakeCandidates})`;
  } else {
    reason = "waiting for new intake input";
  }

  const extras = [];
  if (toClarify > 0) {
    extras.push(`to-clarify=${toClarify}`);
  }
  if (humanInput > 0) {
    extras.push(`human-input=${humanInput}`);
  }
  if (backlog > 0) {
    extras.push(`backlog=${backlog}`);
  }
  if (refinement > 0) {
    extras.push(`refinement=${refinement}`);
  }
  if (humanDecisionNeeded > 0) {
    extras.push(`human-decision-needed=${humanDecisionNeeded}`);
  }
  if (activeBundleId) {
    extras.push(`active-bundle=${activeBundleId}`);
  }
  if (readyBundleId) {
    extras.push(`ready-bundle=${readyBundleId}`);
  }
  return {
    reason,
    extras,
  };
}

async function sleepWithWaitInfo(runtime, controls, state, highWatermark, mode) {
  const info = waitReason(runtime, state, highWatermark, mode);
  const minutes = Math.max(1, Math.round(PO_IDLE_WAIT_MS / 60000));
  const suffix = info.extras.length > 0 ? ` | ${info.extras.join(" ")}` : "";
  process.stdout.write(`${timestampMinute()} PO-RUNNER: waiting ${minutes}m - ${info.reason}${suffix}\n`);
  await sleepWithStopCheck(PO_IDLE_WAIT_MS, controls);
}

function readBundleRegistryForRuntime(runtime) {
  return readBundleRegistry(runtime.agentsRoot);
}

function writeBundleRegistryForRuntime(runtime, registry) {
  return writeBundleRegistry(runtime.agentsRoot, registry);
}

function bundleIdOptions(runtime) {
  const cfg = runtime && runtime.bundleFlow ? runtime.bundleFlow : {};
  return {
    prefix: String(cfg.idPrefix || "B").trim() || "B",
    pad: Math.max(1, Number.parseInt(String(cfg.idPad || 4), 10) || 4),
  };
}

function reserveNextBundle(runtime) {
  const registry = readBundleRegistryForRuntime(runtime);
  const seq = Math.max(1, Number.parseInt(String(registry.next_bundle_seq || 1), 10) || 1);
  const id = formatBundleId(seq, bundleIdOptions(runtime));
  const now = new Date().toISOString();
  registry.next_bundle_seq = seq + 1;
  if (!registry.bundles[id]) {
    registry.bundles[id] = {
      id,
      seq,
      status: "drafting",
      createdAt: now,
      startedAt: "",
      finishedAt: "",
      sourceReqIds: [],
      carryoversIn: [],
      carryoversOut: [],
    };
  }
  writeBundleRegistryForRuntime(runtime, registry);
  return { id, seq };
}

function updateBundleRegistryReady(runtime, bundleId, sourceReqIds = []) {
  const registry = readBundleRegistryForRuntime(runtime);
  const seq = parseBundleSequence(bundleId, bundleIdOptions(runtime));
  const now = new Date().toISOString();
  const entry = registry.bundles[bundleId] && typeof registry.bundles[bundleId] === "object"
    ? registry.bundles[bundleId]
    : {};
  registry.bundles[bundleId] = {
    ...entry,
    id: bundleId,
    seq: seq || entry.seq || 0,
    status: "ready",
    createdAt: entry.createdAt || now,
    sourceReqIds: Array.isArray(sourceReqIds) ? sourceReqIds : [],
  };
  registry.ready_bundle_id = bundleId;
  writeBundleRegistryForRuntime(runtime, registry);
}

function canPrepareBundle(runtime) {
  const registry = readBundleRegistryForRuntime(runtime);
  const readyId = String(registry.ready_bundle_id || "").trim();
  if (readyId) {
    return false;
  }
  return true;
}

function setFrontMatterField(filePath, key, value) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return false;
  }
  const keyPattern = new RegExp(`^${String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:.*$`, "m");
  const frontMatter = keyPattern.test(match[1])
    ? match[1].replace(keyPattern, `${key}: ${value}`)
    : `${match[1]}\n${key}: ${value}`;
  const next = raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, `---\n${frontMatter}\n---`);
  fs.writeFileSync(filePath, next, "utf8");
  return true;
}

function stripBundleSuffix(stem) {
  return String(stem || "")
    .replace(/^B\d{4}-/i, "")
    .replace(/-B\d{4}(?:-carry-\d{2}-from-B\d{4})?$/i, "")
    .replace(/-carry-\d{2}-from-B\d{4}$/i, "");
}

function renameRequirementForBundle(filePath, bundleId) {
  if (!filePath || !fs.existsSync(filePath)) {
    return filePath;
  }
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath) || ".md";
  const stem = path.basename(filePath, ext);
  const normalizedStem = stripBundleSuffix(stem);
  const nextName = `${bundleId}-${normalizedStem}${ext}`;
  const target = path.join(dir, nextName);
  if (path.resolve(target) === path.resolve(filePath)) {
    return filePath;
  }
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
  }
  fs.renameSync(filePath, target);
  return target;
}

function stripCarryoverSuffix(stem) {
  return String(stem || "")
    .replace(/^carry-\d{2}-from-B\d{4}-/i, "")
    .replace(/-carry-\d{2}-from-B\d{4}$/i, "");
}

function renameRequirementAsCarryover(filePath, oldBundleId, carryoverCount) {
  if (!filePath || !fs.existsSync(filePath)) {
    return filePath;
  }
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath) || ".md";
  const stem = path.basename(filePath, ext);
  const normalizedStem = stripCarryoverSuffix(stripBundleSuffix(stem));
  const nextName = `carry-${String(Math.max(1, carryoverCount)).padStart(2, "0")}-from-${oldBundleId}-${normalizedStem}${ext}`;
  const target = path.join(dir, nextName);
  if (path.resolve(target) === path.resolve(filePath)) {
    return filePath;
  }
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
  }
  fs.renameSync(filePath, target);
  return target;
}

function readCarryoverList(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return [];
  }
  return text
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function markRequirementAsCarryover(filePath, controls, reasonLabel = "bundle-exit") {
  if (!filePath || !fs.existsSync(filePath)) {
    return filePath;
  }
  const fm = parseFrontMatter(filePath);
  const oldBundleId = String(fm.bundle_id || "").trim();
  if (!oldBundleId) {
    return filePath;
  }
  const prevCount = Number.parseInt(String(fm.carryover_count || 0), 10);
  const carryoverCount = Number.isFinite(prevCount) && prevCount > 0 ? prevCount + 1 : 1;
  const existingFrom = readCarryoverList(fm.carryover_from_bundle_ids);
  const mergedFrom = Array.from(new Set([...existingFrom, oldBundleId]));

  let currentPath = renameRequirementAsCarryover(filePath, oldBundleId, carryoverCount);
  setFrontMatterField(currentPath, "carryover_count", carryoverCount);
  setFrontMatterField(currentPath, "carryover_from_bundle_ids", mergedFrom.join(", "));
  setFrontMatterField(currentPath, "bundle_id", "");
  setFrontMatterField(currentPath, "bundle_seq", 0);
  upsertMarkdownSection(currentPath, "Bundle History", [
    `- carryover_count: ${carryoverCount}`,
    `- carryover_from_bundle_ids: ${mergedFrom.join(", ")}`,
    `- carryover_reason: ${reasonLabel}`,
  ]);
  log(controls, `carryover marked ${path.basename(currentPath)} from=${oldBundleId} count=${carryoverCount}`);
  return currentPath;
}

function assignBundleIdToSelected(runtime, bundleId, bundleSeq) {
  if (!bundleId) {
    return 0;
  }
  let updated = 0;
  for (const sourcePath of listQueueFiles(runtime.queues.selected)) {
    const filePath = renameRequirementForBundle(sourcePath, bundleId);
    const okBundle = setFrontMatterField(filePath, "bundle_id", bundleId);
    const okSeq = setFrontMatterField(filePath, "bundle_seq", bundleSeq);
    const bundleHistoryLines = [
      `- Current bundle: ${bundleId} (seq=${bundleSeq})`,
      "- This requirement is part of the currently prepared static delivery bundle.",
    ];
    upsertMarkdownSection(filePath, "Bundle Assignment", bundleHistoryLines);
    if (okBundle || okSeq) {
      updated += 1;
    }
  }
  return updated;
}

function tryPrepareReadyBundle(runtime, controls, state, highWatermark) {
  if (!canPrepareBundle(runtime)) {
    return false;
  }
  const selectedCount = countFiles(runtime.queues.selected);
  if (selectedCount <= 0) {
    state.underfilledSelectedCycles = 0;
    return false;
  }
  const minBundle = Math.max(1, Number.parseInt(String(runtime.loops && runtime.loops.bundleMinSize || 1), 10) || 1);
  const target = Math.max(highWatermark, minBundle);
  const underfilled = selectedCount < minBundle;
  const forceAfter = Math.max(1, Number.parseInt(String(runtime.loops && runtime.loops.forceUnderfilledAfterCycles || 1), 10) || 1);

  if (underfilled) {
    state.underfilledSelectedCycles = Math.max(0, Number.parseInt(String(state.underfilledSelectedCycles || 0), 10) || 0) + 1;
  } else {
    state.underfilledSelectedCycles = 0;
  }

  const allowUnderfilled = underfilled && state.underfilledSelectedCycles >= forceAfter;
  if (selectedCount < target && !allowUnderfilled) {
    log(controls, `bundle readiness wait selected=${selectedCount} target=${target} min=${minBundle} underfilled_cycles=${state.underfilledSelectedCycles}/${forceAfter}`);
    return false;
  }

  if (underfilled && allowUnderfilled) {
    log(controls, `bundle readiness forced underfilled selected=${selectedCount} min=${minBundle} after ${state.underfilledSelectedCycles} cycle(s)`);
  }

  const nextBundle = reserveNextBundle(runtime);
  const tagged = assignBundleIdToSelected(runtime, nextBundle.id, nextBundle.seq);
  const sourceReqIds = listQueueFiles(runtime.queues.selected)
    .map((filePath) => String(parseFrontMatter(filePath).id || "").trim())
    .filter(Boolean);
  updateBundleRegistryReady(runtime, nextBundle.id, sourceReqIds);
  state.underfilledSelectedCycles = 0;
  log(controls, `bundle prepared id=${nextBundle.id} selected_tagged=${tagged}`);
  return true;
}

function validateProductVision(runtime) {
  const dir = String(runtime.productVisionDir || "").trim();
  const files = Array.isArray(runtime.productVisionFiles) ? runtime.productVisionFiles : [];
  if (!dir || !fs.existsSync(dir) || files.length === 0) {
    throw new Error(
      `Missing Product Vision docs bundle in ${dir || "<missing>"}. Configure [paths].product_vision_dir.`
    );
  }
}

function planningQueueMap(runtime) {
  return [
    ["refinement", runtime.queues.refinement],
    ["backlog", runtime.queues.backlog],
    ["selected", runtime.queues.selected],
    ["toClarify", runtime.queues.toClarify],
    ["humanInput", runtime.queues.humanInput],
    ["wontDo", runtime.queues.wontDo],
  ];
}

function buildPlanningSnapshot(runtime) {
  const items = [];
  for (const [queueName, queueDir] of planningQueueMap(runtime)) {
    const files = listQueueFiles(queueDir);
    for (const filePath of files) {
      const stat = fs.statSync(filePath);
      items.push({
        queue: queueName,
        file: path.basename(filePath),
        size: stat.size,
        mtimeMs: Math.round(stat.mtimeMs),
      });
    }
  }

  const encoded = JSON.stringify(items);
  const hash = crypto.createHash("sha1").update(encoded).digest("hex");
  const keys = new Set(items.map((item) => `${item.queue}/${item.file}`));
  return { hash, keys, count: items.length };
}

function poRunnerStatePath(runtime) {
  const dir = path.join(runtime.agentsRoot, ".runtime");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "po-runner-state.json");
}

function readPoRunnerState(runtime) {
  const filePath = poRunnerStatePath(runtime);
  if (!fs.existsSync(filePath)) {
    return { version: 1, cycle: 0, bundleLocked: false, underfilledSelectedCycles: 0, items: {}, pausedCounts: {}, loopCounters: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      return { version: 1, cycle: 0, bundleLocked: false, underfilledSelectedCycles: 0, items: {}, pausedCounts: {}, loopCounters: {} };
    }
    return {
      version: 1,
      cycle: Number.isInteger(parsed.cycle) ? parsed.cycle : 0,
      bundleLocked: parsed.bundleLocked === true,
      underfilledSelectedCycles: Number.isInteger(parsed.underfilledSelectedCycles) ? Math.max(0, parsed.underfilledSelectedCycles) : 0,
      items: parsed.items && typeof parsed.items === "object" ? parsed.items : {},
      pausedCounts: parsed.pausedCounts && typeof parsed.pausedCounts === "object" ? parsed.pausedCounts : {},
      loopCounters: parsed.loopCounters && typeof parsed.loopCounters === "object" ? parsed.loopCounters : {},
    };
  } catch {
    return { version: 1, cycle: 0, bundleLocked: false, underfilledSelectedCycles: 0, items: {}, pausedCounts: {}, loopCounters: {} };
  }
}

function writePoRunnerState(runtime, state) {
  const filePath = poRunnerStatePath(runtime);
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function requirementKey(filePath) {
  const fm = parseFrontMatter(filePath);
  const id = String(fm.id || "").trim();
  if (id) {
    return id.toUpperCase();
  }
  return path.basename(filePath).toUpperCase();
}

function pausedKey(stageName, itemKey) {
  return `${String(stageName || "po").toLowerCase()}:${String(itemKey || "unknown")}`;
}

function registerPausedOccurrence(state, stageName, itemKey) {
  if (!state.pausedCounts || typeof state.pausedCounts !== "object") {
    state.pausedCounts = {};
  }
  const key = pausedKey(stageName, itemKey);
  const next = Math.max(1, Number.parseInt(String(state.pausedCounts[key] || 0), 10) + 1);
  state.pausedCounts[key] = next;
  return next;
}

function resetPausedOccurrence(state, stageName, itemKey) {
  if (!state.pausedCounts || typeof state.pausedCounts !== "object") {
    return;
  }
  const key = pausedKey(stageName, itemKey);
  if (Object.prototype.hasOwnProperty.call(state.pausedCounts, key)) {
    delete state.pausedCounts[key];
  }
}

function loopCounterKey(stageName, itemKey, failureClass = "fail") {
  return `${String(stageName || "po").toLowerCase()}:${String(itemKey || "unknown")}:${String(failureClass)}`;
}

function registerLoopFailure(state, stageName, itemKey, failureClass = "fail") {
  if (!state.loopCounters || typeof state.loopCounters !== "object") {
    state.loopCounters = {};
  }
  const key = loopCounterKey(stageName, itemKey, failureClass);
  const next = Math.max(1, Number.parseInt(String(state.loopCounters[key] || 0), 10) + 1);
  state.loopCounters[key] = next;
  return next;
}

function resetLoopFailures(state, stageName, itemKey) {
  if (!state.loopCounters || typeof state.loopCounters !== "object") {
    return;
  }
  const prefix = `${String(stageName || "po").toLowerCase()}:${String(itemKey || "unknown")}:`;
  for (const key of Object.keys(state.loopCounters)) {
    if (key.startsWith(prefix)) {
      delete state.loopCounters[key];
    }
  }
}

function pausedLimit(runtime) {
  return Math.max(
    1,
    Number.parseInt(
      String(runtime && runtime.deliveryRunner && runtime.deliveryRunner.maxPausedCyclesPerItem || 2),
      10
    ) || 2
  );
}

function fileHash(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return crypto.createHash("sha1").update(raw).digest("hex");
  } catch {
    return "";
  }
}

function decisionQuestionText(decision) {
  if (!decision || typeof decision !== "object") {
    return "";
  }
  const explicit = String(decision.clarifyQuestion || "").trim();
  if (explicit) {
    return explicit;
  }
  const summary = String(decision.summary || "").trim();
  if (summary.includes("?")) {
    return summary;
  }
  const findings = Array.isArray(decision.findings)
    ? decision.findings.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return findings.find((item) => item.includes("?")) || "";
}

function decisionRecommendedDefaultText(decision) {
  if (!decision || typeof decision !== "object") {
    return "";
  }
  const explicit = String(decision.recommendedDefault || "").trim();
  if (explicit) {
    return explicit;
  }
  const summary = String(decision.summary || "").trim();
  if (summary) {
    return summary;
  }
  const findings = Array.isArray(decision.findings)
    ? decision.findings.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return findings[0] || "";
}

function isActionableClarifyDecision(decision) {
  const question = decisionQuestionText(decision);
  const recommendation = decisionRecommendedDefaultText(decision);
  return Boolean(question && recommendation);
}

function ensureToClarifyRequest(filePath, decision) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }
  const question = decisionQuestionText(decision) || "What concrete decision is still required?";
  const recommendation = decisionRecommendedDefaultText(decision)
    || "Adopt PO's minimal Product Vision-aligned default and continue delivery.";
  upsertMarkdownSection(filePath, "Clarification Needed", [
    `- Question: ${question}`,
    `- Recommended default: ${recommendation}`,
  ]);
}

function countNewRequirementsSince(baseSnapshot, currentSnapshot) {
  let delta = 0;
  for (const key of currentSnapshot.keys) {
    if (!baseSnapshot.keys.has(key)) {
      delta += 1;
    }
  }
  return delta;
}

function deriveVisionDecision(runtime, result, beforeSnapshot) {
  const current = buildPlanningSnapshot(runtime);
  const newRequirements = countNewRequirementsSince(beforeSnapshot, current);
  const updatedRequirements = current.hash !== beforeSnapshot.hash ? 1 : 0;
  const visionHint = findVisionOpenDecisionHint(runtime);
  const intakeCandidates = listIntakeCandidates(runtime).length;
  const visionComplete = Boolean(result && result.ok) && visionHint.count === 0 && intakeCandidates === 0;
  const status = !result || !result.ok
    ? "clarify"
    : (visionHint.count > 0 ? "clarify" : "pass");
  const reason = !result || !result.ok
    ? "vision run failed"
    : (visionComplete
      ? "vision complete (no open intake candidates)"
      : "vision planning still active");
  return {
    status,
    visionComplete,
    reason,
    newRequirements,
    updatedRequirements,
  };
}

function writeVisionClarification(runtime, reason) {
  const targetDir = runtime.queues.humanDecisionNeeded || runtime.queues.toClarify;
  if (!targetDir) {
    return "";
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `REQ-PO-VISION-CLARIFY-${stamp}.md`;
  const filePath = path.join(targetDir, fileName);

  const content = [
    "---",
    `id: REQ-PO-VISION-CLARIFY-${stamp}`,
    "title: PO vision clarification needed",
    "status: human-decision-needed",
    "source: po-runner",
    "---",
    "",
    "# Goal",
    "Human steering required for a hard Product Vision conflict.",
    "",
    "## Clarifications needed",
    `- ${String(reason || "PO vision requires clarification.")}`,
    "",
    "## PO Results",
    "- Routed to human-decision-needed without stopping autonomous delivery.",
    `- Changes: ${filePath}`,
    "",
  ].join("\n");

  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function selectIntakeSource(runtime) {
  const toClarifyFile = getFirstFile(runtime.queues.toClarify);
  if (toClarifyFile) {
    return { path: toClarifyFile, queue: "toClarify" };
  }
  const humanInputFile = getFirstFile(runtime.queues.humanInput);
  if (humanInputFile) {
    return { path: humanInputFile, queue: "humanInput" };
  }
  const refinementFile = getFirstFile(runtime.queues.refinement);
  if (refinementFile) {
    return { path: refinementFile, queue: "refinement" };
  }
  const backlogFile = getFirstFile(runtime.queues.backlog);
  if (backlogFile) {
    return { path: backlogFile, queue: "backlog" };
  }
  return { path: "", queue: "" };
}

function listIntakeCandidates(runtime) {
  const out = [];
  const order = [
    ["toClarify", runtime.queues.toClarify],
    ["humanInput", runtime.queues.humanInput],
    ["refinement", runtime.queues.refinement],
    ["backlog", runtime.queues.backlog],
  ];
  for (const [queueName, queueDir] of order) {
    const files = listQueueFiles(queueDir);
    for (const filePath of files) {
      out.push({ path: filePath, queue: queueName });
    }
  }
  return out;
}

function listIntakeCandidatesFair(runtime, limit) {
  const cap = Math.max(1, Number.parseInt(String(limit || 1), 10));
  const queueOrder = [
    "toClarify",
    "humanInput",
    "refinement",
    "backlog",
  ];
  const buckets = {};
  for (const queueName of queueOrder) {
    buckets[queueName] = listQueueFiles(runtime.queues[queueName]).map((filePath) => ({
      path: filePath,
      queue: queueName,
    }));
  }

  const picked = [];

  // First pass: take at most one item per queue to prevent backlog starvation.
  for (const queueName of queueOrder) {
    if (picked.length >= cap) {
      break;
    }
    if (buckets[queueName].length > 0) {
      picked.push(buckets[queueName].shift());
    }
  }

  // Second pass: continue in round-robin queue order until cap.
  while (picked.length < cap) {
    let advanced = false;
    for (const queueName of queueOrder) {
      if (picked.length >= cap) {
        break;
      }
      if (buckets[queueName].length > 0) {
        picked.push(buckets[queueName].shift());
        advanced = true;
      }
    }
    if (!advanced) {
      break;
    }
  }

  return picked;
}

function normalizePoTarget(queueName) {
  const normalized = String(queueName || "").trim().toLowerCase();
  if (
    normalized === "to-clarify" ||
    normalized === "to_clarify" ||
    normalized === "toclarify"
  ) {
    return "toClarify";
  }
  if (
    normalized === "human-decision-needed" ||
    normalized === "human decision needed" ||
    normalized === "decision-needed" ||
    normalized === "decision needed"
  ) {
    return "humanDecisionNeeded";
  }
  if (
    normalized === "human-input" ||
    normalized === "human input" ||
    normalized === "human_input"
  ) {
    return "humanInput";
  }
  if (["selected", "backlog", "refinement"].includes(normalized)) {
    return normalized;
  }
  if (normalized === "wont-do" || normalized === "wontdo") {
    return "wontDo";
  }
  return "";
}

function inferPoTargetFromText(text) {
  const raw = String(text || "").toLowerCase();
  if (!raw.trim()) {
    return "";
  }

  if (/\btarget(?:[_ ]queue)?\s*:\s*human[- ]decision[- ]needed\b/.test(raw)) {
    return "humanDecisionNeeded";
  }
  if (/\btarget(?:[_ ]queue)?\s*:\s*to[- ]clarify\b/.test(raw)) {
    return "toClarify";
  }
  if (/\btarget(?:[_ ]queue)?\s*:\s*wont[- ]do\b/.test(raw)) {
    return "wontDo";
  }
  if (/\btarget(?:[_ ]queue)?\s*:\s*selected\b/.test(raw)) {
    return "selected";
  }
  if (/\btarget(?:[_ ]queue)?\s*:\s*backlog\b/.test(raw)) {
    return "backlog";
  }
  if (/\btarget(?:[_ ]queue)?\s*:\s*refinement\b/.test(raw)) {
    return "refinement";
  }
  return "";
}

function inferPoTargetFromDecision(decision) {
  if (!decision || typeof decision !== "object") {
    return "";
  }
  const fromTarget = normalizePoTarget(
    decision.targetQueue || decision.target_queue || decision.target || ""
  );
  if (fromTarget) {
    return fromTarget;
  }
  const fromStatusRaw = normalizePoTarget(decision.statusRaw);
  if (fromStatusRaw) {
    return fromStatusRaw;
  }

  const text = [
    String(decision.summary || ""),
    ...(Array.isArray(decision.findings) ? decision.findings : []).map((item) => String(item || "")),
  ].join("\n");
  return inferPoTargetFromText(text);
}

function inferPoTargetFromRequirementFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }
  const fm = parseFrontMatter(filePath);
  const fromFrontMatter = normalizePoTarget(
    fm.target_queue || fm.targetQueue || fm.target || fm.next_queue || fm.nextQueue || ""
  );
  if (fromFrontMatter) {
    return fromFrontMatter;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const poResultsMatch = raw.match(/\n##\s+PO Results\b([\s\S]*?)(?=\n##\s+|$)/i);
  if (poResultsMatch) {
    const fromPoResults = inferPoTargetFromText(poResultsMatch[1]);
    if (fromPoResults) {
      return fromPoResults;
    }
  }
  return inferPoTargetFromText(raw);
}

function normalizeRoutingDecisionReason(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (!normalized) {
    return "";
  }
  return normalized;
}

function normalizeWontDoDecisionReason(value) {
  const normalized = normalizeRoutingDecisionReason(value);
  if (!normalized) {
    return "";
  }
  const map = {
    duplicate: "duplicate",
    dupe: "duplicate",
    obsolete: "obsolete",
    invalid: "invalid",
    deprioritized: "deprioritized",
    deprioritised: "deprioritized",
    already_implemented: "already_implemented",
    "already-implemented": "already_implemented",
    alreadyimplemented: "already_implemented",
  };
  return map[normalized] || "";
}

function defaultDecisionReasonForTarget(targetQueue) {
  return DEFAULT_DECISION_REASON_BY_TARGET[targetQueue] || "routing_default";
}

function extractDecisionReasonFromRequirement(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }
  const fm = parseFrontMatter(filePath);
  const fmReason = normalizeRoutingDecisionReason(
    fm.decision_reason || fm.decisionReason || fm.wont_do_reason || fm.wontDoReason || ""
  );
  if (fmReason) {
    return fmReason;
  }
  const raw = readRequirementRaw(filePath);
  const match = raw.match(/(?:^|\n)\s*-\s*decision_reason\s*:\s*([a-zA-Z0-9_-]+)/i);
  if (!match) {
    return "";
  }
  return normalizeRoutingDecisionReason(match[1] || "");
}

function extractDecisionReasonFromDecisionArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") {
    return "";
  }
  const explicit = normalizeRoutingDecisionReason(
    artifact.decision_reason
    || artifact.decisionReason
    || artifact.wont_do_reason
    || artifact.wontDoReason
    || artifact.reason
    || ""
  );
  if (explicit) {
    return explicit;
  }
  return "";
}

function extractPoResultsStatusFromRequirement(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }
  const raw = readRequirementRaw(filePath);
  const poResultsMatch = raw.match(/\n##\s+PO Results\b([\s\S]*?)(?=\n##\s+|$)/i);
  if (!poResultsMatch) {
    return "";
  }
  const statusMatch = poResultsMatch[1].match(/(?:^|\n)\s*-\s*status\s*:\s*([a-zA-Z0-9_-]+)/i);
  if (!statusMatch) {
    return "";
  }
  return String(statusMatch[1] || "").trim().toLowerCase();
}

function normalizeRequirementKey(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized;
}

function canonicalRequirementKeyFromPath(filePath) {
  if (!filePath) {
    return "";
  }
  if (fs.existsSync(filePath) && path.extname(filePath).toLowerCase() === ".md") {
    const fm = parseFrontMatter(filePath);
    const id = normalizeRequirementKey(fm.id || "");
    if (id) {
      return id;
    }
  }
  const name = path.basename(String(filePath || ""));
  return canonicalRequirementKeyFromFileName(name);
}

function canonicalRequirementKeyFromFileName(fileName) {
  let stem = String(fileName || "").trim();
  if (!stem) {
    return "";
  }
  if (stem.endsWith(".decision.json")) {
    stem = stem.slice(0, -".decision.json".length);
  }
  if (stem.toLowerCase().endsWith(".md")) {
    stem = stem.slice(0, -".md".length);
  }
  const canonical = stripCarryoverSuffix(stripBundleSuffix(stem));
  return normalizeRequirementKey(canonical);
}

function listDecisionArtifacts(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && entry.name.endsWith(".decision.json"))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function intakeQueueEntries(runtime) {
  return [
    ["toClarify", runtime.queues.toClarify],
    ["humanInput", runtime.queues.humanInput],
    ["refinement", runtime.queues.refinement],
    ["backlog", runtime.queues.backlog],
  ];
}

function findDecisionArtifactForRequirement(runtime, requirementPath) {
  return { state: "missing", path: "", data: null, reason: "decision_artifacts_disabled" };
}

function detectRequirementConflictSignals(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { conflict: false, reason: "" };
  }
  const fm = parseFrontMatter(filePath);
  const explicitFlag = String(
    fm.hard_vision_conflict
    || fm.hardVisionConflict
    || fm.requirement_conflict
    || fm.requirementConflict
    || fm.docs_conflict
    || fm.docsConflict
    || fm.policy_conflict
    || fm.policyConflict
    || ""
  ).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(explicitFlag)) {
    return { conflict: true, reason: "frontmatter-conflict-flag" };
  }

  const raw = readRequirementRaw(filePath).toLowerCase();
  const explicitConflictReason = /(?:^|\n)\s*-\s*decision_reason\s*:\s*(conflict|contradiction|docs_conflict|policy_conflict|requirement_conflict)\b/i
    .test(raw);
  if (explicitConflictReason) {
    return { conflict: true, reason: "decision-reason-conflict" };
  }

  const conflictLanguage = /(widerspruch|konflikt|contradict(?:ion|s|ory)?|inconsistent|conflicting requirements?|docs conflict|policy conflict|requirement conflict)/i;
  if (conflictLanguage.test(raw)) {
    return { conflict: true, reason: "text-conflict-signal" };
  }
  return { conflict: false, reason: "" };
}

function routeFromPo(runtime, filePath, status) {
  const routeMap = {
    pass: "selected",
    clarify: "toClarify",
    block: "humanDecisionNeeded",
  };
  return routeByStatus({
    runtime,
    filePath,
    status,
    routeMap,
    fallbackQueue: "toClarify",
  });
}

function queueStatusByTarget(targetQueue) {
  if (targetQueue === "selected") {
    return "selected";
  }
  if (targetQueue === "backlog") {
    return "backlog";
  }
  if (targetQueue === "refinement") {
    return "refinement";
  }
  if (targetQueue === "wontDo") {
    return "wont-do";
  }
  if (targetQueue === "humanInput") {
    return "human-input";
  }
  if (targetQueue === "toClarify") {
    return "to-clarify";
  }
  return "human-decision-needed";
}

function isHardVisionConflict(decision) {
  return Boolean(decision && decision.hardVisionConflict === true);
}

function wantsWontDo(decision) {
  if (decision && decision.wontDo === true) {
    return true;
  }
  const summary = String((decision && decision.summary) || "").toLowerCase();
  const findings = Array.isArray(decision && decision.findings)
    ? decision.findings.map((item) => String(item || "").toLowerCase()).join(" ")
    : "";
  const text = `${summary} ${findings}`;
  return /(already implemented|already done|duplicate|redundant|obsolete|invalid requirement|not needed|wont[ -]?do|won't do|bereits umgesetzt|bereits vorhanden|duplikat|obsolet|nicht notwendig|quatsch)/i
    .test(text);
}

function decisionTextForChecks(decision) {
  const summary = String((decision && decision.summary) || "");
  const findings = Array.isArray(decision && decision.findings)
    ? decision.findings.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const rawStatus = String((decision && decision.statusRaw) || "");
  return `${rawStatus}\n${summary}\n${findings.join("\n")}`.toLowerCase();
}

function isAlreadyImplementedClaim(decision) {
  if (!decision || typeof decision !== "object") {
    return false;
  }
  const rawStatus = String(decision.statusRaw || "").trim().toLowerCase();
  if (["already-implemented", "already_implemented", "alreadyimplemented"].includes(rawStatus)) {
    return true;
  }
  const text = decisionTextForChecks(decision);
  if (/\bnot\s+already\s+implemented\b/.test(text)) {
    return false;
  }
  return /(already implemented|already done|bereits umgesetzt|bereits vorhanden)/i.test(text);
}

function readRequirementRaw(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function parseAcceptanceCriteriaFromRaw(raw) {
  const text = String(raw || "");
  const sectionMatch = text.match(
    /(?:^|\n)#{2,6}\s*(Acceptance Criteria|Akzeptanzkriterien)\s*\n([\s\S]*?)(?=\n#{1,6}\s+[^\n]+|$)/i
  );
  if (!sectionMatch) {
    return [];
  }

  const lines = String(sectionMatch[2] || "").split(/\r?\n/);
  const seen = new Set();
  const criteria = [];
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\.\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const index = Number.parseInt(match[1], 10);
    if (!Number.isFinite(index) || index <= 0 || seen.has(index)) {
      continue;
    }
    seen.add(index);
    criteria.push({
      index,
      text: String(match[2] || "").trim(),
    });
  }
  return criteria.sort((a, b) => a.index - b.index);
}

function parseAcEvidenceEntriesFromRaw(raw) {
  const entries = new Map();
  const lines = String(raw || "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*-\s*AC-(\d+)\s*:\s*(.+?)\s*$/i);
    if (!match) {
      continue;
    }
    const index = Number.parseInt(match[1], 10);
    if (!Number.isFinite(index) || index <= 0) {
      continue;
    }
    const rest = String(match[2] || "").trim();
    const statusMatch = rest.match(/\b(not[- ]fulfilled|fulfilled)\b/i);
    const evidenceMatch = rest.match(/\bevidence\s*:\s*(.+)$/i);
    const normalizedStatus = statusMatch
      ? statusMatch[1].toLowerCase().replace("not fulfilled", "not-fulfilled")
      : "";
    entries.set(index, {
      index,
      raw: line,
      status: normalizedStatus,
      evidence: evidenceMatch ? String(evidenceMatch[1] || "").trim() : "",
      hasEvidenceLabel: Boolean(evidenceMatch),
    });
  }
  return entries;
}

function isValidAcEvidenceReference(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }
  if (
    /(^|[\s`"'(])(?:[A-Za-z]:[\\/]|\/)?[A-Za-z0-9._\-\\/]+(?:\.[A-Za-z0-9._-]+)?:\d+(?::\d+)?([\s`"')]|$)/
      .test(text)
  ) {
    return true;
  }
  if (/\b(test|tests|spec|playwright|cypress|screen|screenshot|snap(?:shot)?|video|recording)\b/i.test(text)) {
    return true;
  }
  return false;
}

function evaluateAlreadyImplementedEvidence(filePath) {
  const raw = readRequirementRaw(filePath);
  const criteria = parseAcceptanceCriteriaFromRaw(raw);
  const entries = parseAcEvidenceEntriesFromRaw(raw);
  const normalizedEntries = [];
  const gaps = [];
  let fulfilledCount = 0;

  if (criteria.length === 0) {
    gaps.push("Acceptance Criteria section missing or empty.");
  }

  for (const criterion of criteria) {
    const entry = entries.get(criterion.index) || null;
    const status = entry && entry.status ? entry.status : "";
    const evidence = entry && entry.evidence ? entry.evidence : "";
    const hasEvidenceLabel = Boolean(entry && entry.hasEvidenceLabel);
    const hasValidEvidence = hasEvidenceLabel && isValidAcEvidenceReference(evidence);
    const isFulfilled = status === "fulfilled";

    if (!entry) {
      gaps.push(`AC-${criterion.index} missing required evidence line: \`- AC-${criterion.index}: fulfilled/not-fulfilled + Evidence: ...\`.`);
    } else {
      if (!status) {
        gaps.push(`AC-${criterion.index} is missing status token (\`fulfilled\` or \`not-fulfilled\`).`);
      } else if (status !== "fulfilled") {
        gaps.push(`AC-${criterion.index} is \`${status}\` and therefore not fully implemented.`);
      }
      if (!hasEvidenceLabel || !evidence) {
        gaps.push(`AC-${criterion.index} is missing \`Evidence:\` value.`);
      } else if (!hasValidEvidence) {
        gaps.push(`AC-${criterion.index} evidence must reference \`file:line\` or a test/screen artifact.`);
      }
    }

    if (isFulfilled && hasValidEvidence) {
      fulfilledCount += 1;
    }

    normalizedEntries.push({
      index: criterion.index,
      status: status || "not-fulfilled",
      evidence: evidence || "missing",
      hasEntry: Boolean(entry),
      hasValidEvidence,
      isFulfilled,
    });
  }

  return {
    acCount: criteria.length,
    fulfilledCount,
    gaps,
    complete: criteria.length > 0 && gaps.length === 0,
    entries: normalizedEntries,
  };
}

function upsertAcEvidenceSection(filePath, evidenceReport) {
  if (!filePath || !fs.existsSync(filePath) || !evidenceReport || !Array.isArray(evidenceReport.entries)) {
    return;
  }
  if (evidenceReport.entries.length === 0) {
    return;
  }
  const lines = evidenceReport.entries.map((entry) => (
    `- AC-${entry.index}: ${entry.status} + Evidence: ${entry.evidence}`
  ));
  upsertMarkdownSection(filePath, "AC Evidence", lines);
}

function upsertOpenGapsSection(filePath, gaps) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }
  const list = Array.isArray(gaps)
    ? gaps.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (list.length === 0) {
    upsertMarkdownSection(filePath, "Open Gaps", ["- none"]);
    return;
  }
  const unique = [];
  const seen = new Set();
  for (const item of list) {
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    unique.push(item);
  }
  upsertMarkdownSection(filePath, "Open Gaps", unique.map((item) => `- ${item}`));
}

function writeCanonicalPoResults(filePath, payload) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }
  const data = payload && typeof payload === "object" ? payload : {};
  const lines = [];
  const status = String(data.status || "unknown").trim() || "unknown";
  const targetQueue = String(data.targetQueue || "").trim() || "toClarify";
  const sourceQueue = String(data.sourceQueue || "").trim();
  const decisionReason = String(data.decisionReason || "").trim() || defaultDecisionReasonForTarget(targetQueue);
  const summary = String(data.summary || "").trim();
  const alreadyImplemented = Boolean(data.alreadyImplementedClaim);
  const report = data.evidenceReport && typeof data.evidenceReport === "object"
    ? data.evidenceReport
    : null;

  lines.push(`- status: ${status}`);
  lines.push(`- target: ${targetQueue}`);
  lines.push(`- target_queue: ${targetQueue}`);
  lines.push(`- decision_reason: ${decisionReason}`);
  if (sourceQueue) {
    lines.push(`- source: ${sourceQueue}`);
  }
  if (summary) {
    lines.push(`- summary: ${summary}`);
  }
  if (alreadyImplemented) {
    if (report && report.complete) {
      lines.push(`- already-implemented check: pass (${report.fulfilledCount}/${report.acCount} ACs fulfilled with evidence).`);
    } else {
      lines.push("- already-implemented check: fail; rerouted to backlog until all AC evidence entries are complete.");
    }
    lines.push("- required AC evidence format: `- AC-<n>: fulfilled/not-fulfilled + Evidence: <file:line|test|screen>`.");
  }
  lines.push("- canonical PO closeout block; previous PO closure statements are superseded.");
  upsertMarkdownSection(filePath, "PO Results", lines);
}

function ensureHumanDecisionRequest(filePath, decision) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }
  const findings = Array.isArray(decision && decision.findings)
    ? decision.findings.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const summary = String((decision && decision.summary) || "").trim();
  const proposal = summary || findings[0] || "Approve PO's minimal Product Vision-aligned assumption for this requirement.";
  const lines = [
    "- Question: Do you approve this PO proposal so delivery can continue without blocking?",
    `- PO proposal: ${proposal}`,
    "- If approved: move this file from `human-decision-needed` to `human-input` with your decision note.",
  ];
  upsertMarkdownSection(filePath, "Human Decision", lines);
}

function queueNameFromPath(filePath, queues) {
  if (!filePath) {
    return "";
  }
  const resolvedFile = path.resolve(String(filePath));
  const resolvedDir = path.dirname(resolvedFile);
  for (const [name, queueDir] of Object.entries(queues || {})) {
    if (!queueDir) {
      continue;
    }
    if (path.resolve(queueDir) === resolvedDir) {
      return name;
    }
  }
  return "";
}

function stalePlanningDuplicateTargets(originQueue) {
  if (originQueue === "toClarify" || originQueue === "humanInput") {
    return [
      "arch",
      "selected",
      "backlog",
      "refinement",
      "wontDo",
      "humanDecisionNeeded",
      "dev",
      "qa",
      "sec",
      "ux",
      "deploy",
      "released",
    ];
  }
  return [];
}

function hasCanonicalDuplicateInQueue(queueDir, sourcePath, sourceKey) {
  if (!queueDir || !sourceKey) {
    return false;
  }
  const sourceResolved = path.resolve(sourcePath);
  for (const candidate of listQueueFiles(queueDir)) {
    if (path.resolve(candidate) === sourceResolved) {
      continue;
    }
    const candidateKey = canonicalRequirementKeyFromPath(candidate);
    if (candidateKey && candidateKey === sourceKey) {
      return true;
    }
  }
  return false;
}

function removeStalePlanningDuplicate(runtime, sourcePath, originQueue, controls) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return false;
  }
  const fileName = path.basename(sourcePath);
  const sourceKey = canonicalRequirementKeyFromPath(sourcePath);
  const targets = stalePlanningDuplicateTargets(originQueue);
  if (targets.length === 0) {
    return false;
  }

  for (const queueName of targets) {
    const queueDir = runtime.queues[queueName];
    if (!queueDir) {
      continue;
    }
    const candidate = path.join(queueDir, fileName);
    const exactExists = fs.existsSync(candidate);
    const canonicalExists = hasCanonicalDuplicateInQueue(queueDir, sourcePath, sourceKey);
    if (!exactExists && !canonicalExists) {
      continue;
    }
    try {
      fs.unlinkSync(sourcePath);
      if (canonicalExists && !exactExists) {
        log(
          controls,
          `removed stale ${originQueue} duplicate ${fileName}; canonical id ${sourceKey || "unknown"} already in ${queueName}`
        );
      } else {
        log(controls, `removed stale ${originQueue} duplicate ${fileName}; canonical in ${queueName}`);
      }
      return true;
    } catch (err) {
      log(controls, `failed removing stale duplicate ${fileName}: ${err.message || err}`);
      return false;
    }
  }
  return false;
}

function findRequirementPathByCanonicalKey(runtime, canonicalKey) {
  const key = normalizeRequirementKey(canonicalKey);
  if (!key) {
    return "";
  }
  const queueNames = Object.keys(runtime.queues || {});
  for (const queueName of queueNames) {
    const queueDir = runtime.queues[queueName];
    for (const filePath of listQueueFiles(queueDir)) {
      const currentKey = canonicalRequirementKeyFromPath(filePath);
      if (currentKey && currentKey === key) {
        return filePath;
      }
    }
  }
  return "";
}

function artifactToDecision(artifact) {
  const data = artifact && typeof artifact === "object" ? artifact : {};
  return {
    status: String(data.status || "").trim(),
    statusRaw: String(data.statusRaw || data.status_raw || data.status || "").trim(),
    summary: String(data.summary || "").trim(),
    findings: Array.isArray(data.findings)
      ? data.findings.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    new_requirements: Array.isArray(data.new_requirements) ? data.new_requirements : [],
    wontDo: Boolean(data.wontDo === true),
    hardVisionConflict: Boolean(data.hardVisionConflict === true || data.hard_vision_conflict === true),
    clarifyQuestion: String(data.clarifyQuestion || data.clarify_question || "").trim(),
    recommendedDefault: String(data.recommendedDefault || data.recommended_default || "").trim(),
    targetQueue: normalizePoTarget(data.targetQueue || data.target_queue || data.target || ""),
  };
}

function recoverOrphanDecisionArtifacts(runtime, controls) {
  return { recovered: 0, deduped: 0 };
}

function buildFallbackFollowUpItem(decision, frontMatter, currentPath) {
  const sourceId = String(frontMatter.id || path.basename(currentPath, path.extname(currentPath)) || "REQ").trim();
  const sourceTitle = String(frontMatter.title || sourceId).trim();
  const summary = String((decision && decision.summary) || "").trim();
  const findings = Array.isArray(decision && decision.findings)
    ? decision.findings.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const finding = findings[0] || "";
  const goal = summary || finding || `Clarify unresolved open point for ${sourceTitle}.`;
  const followupId = `${sourceId}-FOLLOWUP`
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return {
    id: followupId,
    title: `${sourceTitle} follow-up`,
    goal,
    summary: goal,
  };
}

function moveWithFallback(runtime, sourcePath, targetQueue, status, notes) {
  const fileName = path.basename(sourcePath);
  const queueName = runtime.queues[targetQueue] ? targetQueue : "toClarify";
  const targetPath = path.join(runtime.queues[queueName], fileName);

  if (Array.isArray(notes) && notes.length > 0) {
    appendQueueSection(sourcePath, notes);
  }
  setFrontMatterStatus(sourcePath, status);

  const moved = moveRequirementFile(sourcePath, targetPath);
  if (moved) {
    return true;
  }

  const fallbackPath = path.join(runtime.queues.toClarify, fileName);
  setFrontMatterStatus(sourcePath, "to-clarify");
  appendQueueSection(sourcePath, [
    "PO runner routing fallback",
    `- failed to move to ${queueName}, forced to to-clarify`,
  ]);
  return moveRequirementFile(sourcePath, fallbackPath);
}

function updatePoStateAfterDirectMove({ runtime, state, cycle, sourcePath, sourceQueue, targetQueue }) {
  if (!state || !state.items || !runtime.po.intakeIdempotenceEnabled) {
    return;
  }
  const key = requirementKey(sourcePath);
  const movedPath = resolveSourcePath(runtime, sourcePath) || sourcePath;
  const next = {
    lastHash: fileHash(movedPath),
    lastSourceQueue: sourceQueue,
    lastTargetQueue: targetQueue,
    lastProcessedCycle: cycle,
    repeatCount: 0,
    skipUntilCycle: 0,
  };
  state.items[key] = next;
  state.cycle = cycle;
  writePoRunnerState(runtime, state);
}

function promoteBacklogForProgress(runtime, controls, state, cycle) {
  if (countFiles(runtime.queues.selected) > 0) {
    return false;
  }
  if (countFiles(runtime.queues.arch) > 0 || countFiles(runtime.queues.dev) > 0) {
    return false;
  }

  const candidate = getFirstFile(runtime.queues.backlog);
  if (!candidate) {
    return false;
  }

  const moved = moveWithFallback(
    runtime,
    candidate,
    "selected",
    "selected",
    [
      "PO runner starvation guard",
      "- selected/arch/dev were empty; promoted backlog item to selected to keep delivery moving",
    ]
  );
  if (!moved) {
    return false;
  }

  updatePoStateAfterDirectMove({
    runtime,
    state,
    cycle,
    sourcePath: candidate,
    sourceQueue: "backlog",
    targetQueue: "selected",
  });
  log(controls, `starvation guard promoted ${path.basename(candidate)} backlog->selected`);
  return true;
}

function parseBusinessScoreFromRequirement(filePath) {
  const fm = parseFrontMatter(filePath);
  const raw = fm.business_score || fm.priority_score || fm.score || "";
  const parsed = Number.parseFloat(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldPromoteBacklogItem(runtime, state, filePath) {
  if (!runtime.po.backlogPromoteEnabled) {
    return { promote: false, reason: "" };
  }
  const score = parseBusinessScoreFromRequirement(filePath);
  if (score >= runtime.po.backlogPromoteMinBusinessScore) {
    return {
      promote: true,
      reason: `business_score ${score} >= ${runtime.po.backlogPromoteMinBusinessScore}`,
    };
  }

  if (!state || !state.items) {
    return { promote: false, reason: "" };
  }
  const key = requirementKey(filePath);
  const itemState = state.items[key] || null;
  if (!itemState) {
    return { promote: false, reason: "" };
  }

  const repeatCount = Math.max(0, Number.parseInt(String(itemState.repeatCount || 0), 10));
  const sameBacklogOutcome = itemState.lastSourceQueue === "backlog" && itemState.lastTargetQueue === "backlog";
  if (sameBacklogOutcome && repeatCount >= runtime.po.backlogPromoteAfterCycles) {
    return {
      promote: true,
      reason: `repeat_count ${repeatCount} >= ${runtime.po.backlogPromoteAfterCycles}`,
    };
  }
  return { promote: false, reason: "" };
}

function promoteBacklogCandidates(runtime, controls, state, cycle, highWatermark) {
  if (!runtime.po.backlogPromoteEnabled) {
    return 0;
  }
  if (planningQueuesBusy(runtime)) {
    return 0;
  }

  let selectedCount = countFiles(runtime.queues.selected);
  if (selectedCount >= highWatermark) {
    return 0;
  }

  const maxPerCycle = Math.max(1, runtime.po.backlogPromoteMaxPerCycle || 1);
  const backlogFiles = listQueueFiles(runtime.queues.backlog)
    .sort((a, b) => {
      const scoreDelta = parseBusinessScoreFromRequirement(b) - parseBusinessScoreFromRequirement(a);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return path.basename(a).localeCompare(path.basename(b));
    });

  let promoted = 0;
  for (const candidate of backlogFiles) {
    if (promoted >= maxPerCycle || selectedCount >= highWatermark) {
      break;
    }
    const verdict = shouldPromoteBacklogItem(runtime, state, candidate);
    if (!verdict.promote) {
      continue;
    }
    const moved = moveWithFallback(
      runtime,
      candidate,
      "selected",
      "selected",
      [
        "PO runner backlog auto-promotion",
        `- trigger: ${verdict.reason}`,
        "- action: moved backlog item to selected to avoid backlog stall",
      ]
    );
    if (!moved) {
      continue;
    }
    updatePoStateAfterDirectMove({
      runtime,
      state,
      cycle,
      sourcePath: candidate,
      sourceQueue: "backlog",
      targetQueue: "selected",
    });
    promoted += 1;
    selectedCount += 1;
    log(controls, `backlog auto-promoted ${path.basename(candidate)} (${verdict.reason})`);
  }

  return promoted;
}

function topUpSelectedFromBacklogForBundle(runtime, controls, state, cycle, highWatermark) {
  const registry = readBundleRegistryForRuntime(runtime);
  if (String(registry.ready_bundle_id || "").trim()) {
    return 0;
  }
  if (planningQueuesBusy(runtime)) {
    return 0;
  }

  const minBundle = Math.max(1, Number.parseInt(String(runtime.loops && runtime.loops.bundleMinSize || 1), 10) || 1);
  const target = Math.max(highWatermark, minBundle);
  let selectedCount = countFiles(runtime.queues.selected);
  if (selectedCount <= 0 || selectedCount >= target) {
    return 0;
  }

  const backlogFiles = listQueueFiles(runtime.queues.backlog)
    .sort((a, b) => {
      const scoreDelta = parseBusinessScoreFromRequirement(b) - parseBusinessScoreFromRequirement(a);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return path.basename(a).localeCompare(path.basename(b));
    });

  let movedCount = 0;
  for (const candidate of backlogFiles) {
    if (controls.stopRequested || controls.drainRequested) {
      break;
    }
    if (selectedCount >= target) {
      break;
    }
    const moved = moveWithFallback(
      runtime,
      candidate,
      "selected",
      "selected",
      [
        "PO runner bundle top-up",
        `- selected below bundle target (${selectedCount}/${target})`,
        "- moved backlog item to selected to complete bundle and unblock delivery",
      ]
    );
    if (!moved) {
      continue;
    }
    updatePoStateAfterDirectMove({
      runtime,
      state,
      cycle,
      sourcePath: candidate,
      sourceQueue: "backlog",
      targetQueue: "selected",
    });
    movedCount += 1;
    selectedCount += 1;
    log(controls, `bundle top-up promoted ${path.basename(candidate)} backlog->selected (${selectedCount}/${target})`);
  }

  return movedCount;
}

function enforceBlockedQueuePolicy(runtime, controls) {
  const blockedCount = countFiles(runtime.queues.blocked);
  if (blockedCount > 0) {
    log(
      controls,
      `blocked policy: ${blockedCount} item(s) pending; PO leaves blocked untouched (delivery handles auto-recovery/escalation)`
    );
  }
  return false;
}

async function runPoIntakeOnFile(runtime, filePath, controls, sourceHint = "", state = null, cycle = 0) {
  let sourceBefore = resolveSourcePath(runtime, filePath) || filePath;
  const originQueue = sourceHint || queueNameFromPath(sourceBefore, runtime.queues) || "";
  if (originQueue === "toClarify") {
    sourceBefore = markRequirementAsCarryover(sourceBefore, controls, "to-clarify-to-next-bundle");
  }
  if (removeStalePlanningDuplicate(runtime, sourceBefore, originQueue, controls)) {
    return true;
  }

  const allowedSourceQueues = new Set(["toClarify", "humanInput", "backlog", "refinement"]);
  if (!allowedSourceQueues.has(originQueue)) {
    log(controls, `skip ${path.basename(sourceBefore)} from non-PO queue ${originQueue || "unknown"}`);
    return false;
  }

  const key = requirementKey(sourceBefore);
  const beforeHash = fileHash(sourceBefore);
  const existingState = state && state.items && state.items[key] ? state.items[key] : null;
  if (
    runtime.po.intakeIdempotenceEnabled &&
    existingState &&
    existingState.lastHash === beforeHash &&
    existingState.lastSourceQueue === originQueue &&
    Number.isInteger(existingState.skipUntilCycle) &&
    cycle > 0 &&
    existingState.skipUntilCycle > cycle
  ) {
    log(
      controls,
      `cooldown skip ${path.basename(sourceBefore)} until cycle ${existingState.skipUntilCycle}`
    );
    return false;
  }

  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "po", "po.js"),
    args: ["--auto", "--mode", "intake", "--requirement", sourceBefore],
    cwd: runtime.agentsRoot,
    maxRetries: retryMaxForPoStage(runtime, "intake", runtime.loops.maxRetries),
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
    timeoutSeconds: runnerAgentTimeoutSeconds(runtime),
    noOutputTimeoutSeconds: runnerNoOutputTimeoutSeconds(runtime),
  });

  if (result.paused) {
    log(controls, `PO intake paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
    if (state && state.items) {
      const key = requirementKey(sourceBefore);
      const pausedCount = registerPausedOccurrence(state, "po-intake", key);
      appendRunnerMetric(runtime, {
        stage: "po-intake",
        item_key: key,
        result: "paused",
        attempt: pausedCount,
      });
      if (pausedCount >= pausedLimit(runtime)) {
        const targetQueue = runtime.loopPolicy && runtime.loopPolicy.escalateBusinessLoopToHumanDecision
          ? "humanDecisionNeeded"
          : "refinement";
        moveWithFallback(runtime, sourceBefore, targetQueue, targetQueue === "humanDecisionNeeded" ? "human-decision-needed" : "refinement", [
          "PO runner pause escalation",
          `- paused too often (${pausedCount}/${pausedLimit(runtime)})`,
          "- escalated to avoid infinite token-guard waiting",
        ]);
        writePoRunnerState(runtime, state);
        return true;
      }
      writePoRunnerState(runtime, state);
    }
    return false;
  }

  const currentPath = resolveSourcePath(runtime, sourceBefore);
  if (!currentPath) {
    log(controls, `intake item vanished during PO run: ${path.basename(filePath)}`);
    return true;
  }
  if (state && state.items) {
    const key = requirementKey(currentPath);
    resetPausedOccurrence(state, "po-intake", key);
    if (result.ok) {
      resetLoopFailures(state, "po-intake", key);
      appendRunnerMetric(runtime, {
        stage: "po-intake",
        item_key: key,
        result: "pass",
      });
    }
  }

  const decision = artifactToDecision(null);
  const frontMatter = parseFrontMatter(currentPath);
  const status = normalizeStatus(frontMatter.status || (result.ok ? "pass" : "clarify"));
  const sourceQueue = originQueue || queueNameFromPath(sourceBefore, runtime.queues) || "";

  let forcedEscalationQueue = "";
  if (!result.ok && state && state.items) {
    const key = requirementKey(currentPath);
    const loopCount = registerLoopFailure(state, "po-intake", key, result.timedOut ? "timeout" : "fail");
    const threshold = Math.max(2, Number.parseInt(String(runtime.loopPolicy && runtime.loopPolicy.loopThreshold || 3), 10));
    const maxAttempts = Math.max(1, Number.parseInt(String(runtime.loopPolicy && runtime.loopPolicy.maxTotalAttemptsPerReq || 5), 10));
    appendRunnerMetric(runtime, {
      stage: "po-intake",
      item_key: key,
      result: result.timedOut ? "timeout" : "fail",
      attempt: loopCount,
    });
    if (loopCount >= threshold || loopCount >= maxAttempts) {
      forcedEscalationQueue = runtime.loopPolicy && runtime.loopPolicy.escalateBusinessLoopToHumanDecision
        ? "humanDecisionNeeded"
        : "refinement";
    }
  }

  if (!result.ok) {
    appendQueueSection(currentPath, [
      "PO runner: execution failure",
      `- reason: ${(result.stderr || "execution failed").slice(0, 700)}`,
      "- action: defensive fallback routing (refinement unless forced escalation applies)",
    ]);
  }

  const explicitTargetFromRequirement = inferPoTargetFromRequirementFile(currentPath);
  let targetQueue = forcedEscalationQueue || explicitTargetFromRequirement;
  const forcedEscalationActive = Boolean(forcedEscalationQueue);
  let decisionReason = extractDecisionReasonFromRequirement(currentPath);

  if (!forcedEscalationActive && !result.ok) {
    targetQueue = "refinement";
    decisionReason = "po_execution_failed";
    appendQueueSection(currentPath, [
      "PO runner execution-failure guard",
      "- PO intake execution failed; enforcing markdown-only defensive routing",
      "- routed defensively to refinement",
    ]);
  }

  if (!targetQueue) {
    targetQueue = "refinement";
    if (!decisionReason) {
      decisionReason = "no_explicit_target";
    }
    appendRunnerMetric(runtime, {
      stage: "po-intake",
      item_key: requirementKey(currentPath),
      result: "decision-fallback",
      reason: "no-explicit-target",
      source_queue: sourceQueue || "unknown",
      target_queue: targetQueue,
    });
    appendQueueSection(currentPath, [
      "PO runner defensive routing fallback",
      "- no explicit target found in decision artifact or requirement file",
      `- routed defensively to ${targetQueue}`,
    ]);
  }
  const hardVisionConflict = isHardVisionConflict(decision);
  const inferredTarget = explicitTargetFromDecision;
  const conflictCheck = detectRequirementConflictSignals(currentPath);
  if (!decisionReason) {
    decisionReason = defaultDecisionReasonForTarget(targetQueue);
  }

  if (
    result.ok &&
    inferredTarget &&
    inferredTarget !== targetQueue &&
    (
      targetQueue === "refinement" ||
      targetQueue === "toClarify" ||
      targetQueue === "humanDecisionNeeded"
    )
  ) {
    targetQueue = inferredTarget;
    appendQueueSection(currentPath, [
      "PO runner decision-inference guard",
      `- inferred target '${inferredTarget}' from PO output and requirement content`,
    ]);
  }

  if (targetQueue === "wontDo" && conflictCheck.conflict) {
    targetQueue = "humanDecisionNeeded";
    decisionReason = "conflict_guard";
    appendQueueSection(currentPath, [
      "PO runner wont-do conflict guard",
      `- detected contradiction/conflict (${conflictCheck.reason})`,
      "- conflicting requirements/docs/policy must be routed to human-decision-needed, not wont-do",
    ]);
  }

  if (targetQueue === "wontDo") {
    const normalizedWontDoReason = normalizeWontDoDecisionReason(decisionReason);
    if (!normalizedWontDoReason || !ALLOWED_WONT_DO_DECISION_REASONS.has(normalizedWontDoReason)) {
      targetQueue = "refinement";
      decisionReason = "invalid_wont_do_reason";
      appendQueueSection(currentPath, [
        "PO runner wont-do decision-reason guard",
        "- invalid or missing decision_reason for wont-do",
        "- allowed: duplicate | obsolete | invalid | deprioritized | already_implemented",
        "- routed to refinement",
      ]);
    } else {
      decisionReason = normalizedWontDoReason;
      appendQueueSection(currentPath, [
        "PO runner wont-do decision-reason",
        `- decision_reason: ${decisionReason}`,
      ]);
    }
  }

  if (!decisionReason) {
    decisionReason = defaultDecisionReasonForTarget(targetQueue);
  }

  // To-clarify requires an actionable question + recommendation.
  if (targetQueue === "toClarify" && !hardVisionConflict && !isActionableClarifyDecision(decision)) {
    targetQueue = sourceQueue === "toClarify" ? "backlog" : "refinement";
    decisionReason = "clarify_contract_guard";
    appendQueueSection(currentPath, [
      "PO runner clarify contract guard",
      "- to-clarify requested without actionable question+recommended_default; PO routed decisively instead",
    ]);
  }

  // Resolve to-clarify decisively: do not keep the same requirement in to-clarify forever.
  if (sourceQueue === "toClarify" && targetQueue === "toClarify") {
    targetQueue = "backlog";
    decisionReason = "to_clarify_decisiveness_guard";
    appendQueueSection(currentPath, [
      "PO runner decisiveness guard",
      "- source queue was to-clarify and target stayed to-clarify; routed to backlog with PO decision",
    ]);
  }

  // Escalate to human only for hard vision conflicts.
  if (targetQueue === "humanDecisionNeeded" && !hardVisionConflict && !forcedEscalationActive) {
    targetQueue = "selected";
    decisionReason = "escalation_guard_autonomous_resolution";
    appendQueueSection(currentPath, [
      "PO runner escalation guard",
      "- escalation requested without hard vision conflict; PO resolved autonomously and routed to selected",
    ]);
  }
  if (targetQueue === "humanDecisionNeeded" && (hardVisionConflict || forcedEscalationActive)) {
    appendQueueSection(currentPath, [
      "PO runner escalation confirmed",
      forcedEscalationActive
        ? "- repeated execution failures exceeded loop policy threshold; awaiting explicit human decision"
        : "- hard vision conflict confirmed; awaiting explicit human decision",
    ]);
  }

  if (targetQueue === "selected" && !canPrepareBundle(runtime)) {
    targetQueue = "backlog";
    decisionReason = "bundle_slot_guard";
    appendQueueSection(currentPath, [
      "PO runner bundle slot guard",
      "- selected routing deferred because a ready bundle is already waiting for delivery",
      "- routed to backlog; will be included in a later bundle",
    ]);
  }

  const poResultsStatus = extractPoResultsStatusFromRequirement(currentPath);
  const alreadyImplementedClaim = targetQueue === "wontDo" && decisionReason === "already_implemented";
  let acEvidenceReport = null;
  if (alreadyImplementedClaim) {
    if (poResultsStatus !== "closed") {
      targetQueue = "backlog";
      decisionReason = "already_implemented_requires_closed_status";
      appendQueueSection(currentPath, [
        "PO runner already-implemented status guard",
        `- PO Results status is '${poResultsStatus || "missing"}'; required: closed`,
        "- routed to backlog",
      ]);
    } else {
      acEvidenceReport = evaluateAlreadyImplementedEvidence(currentPath);
      upsertAcEvidenceSection(currentPath, acEvidenceReport);
      if (!acEvidenceReport.complete) {
        targetQueue = "backlog";
        decisionReason = "already_implemented_ac_evidence_incomplete";
        appendQueueSection(currentPath, [
          "PO runner already-implemented AC-evidence guard",
          `- AC evidence incomplete (${acEvidenceReport.fulfilledCount}/${acEvidenceReport.acCount}); routed to backlog`,
        ]);
        upsertOpenGapsSection(currentPath, acEvidenceReport.gaps);
      } else {
        upsertOpenGapsSection(currentPath, []);
      }
    }
  }

  if (!decisionReason) {
    decisionReason = defaultDecisionReasonForTarget(targetQueue);
  }

  writeCanonicalPoResults(currentPath, {
    status,
    targetQueue,
    sourceQueue,
    decisionReason,
    summary: decision.summary || "",
    alreadyImplementedClaim,
    evidenceReport: acEvidenceReport,
  });

  const targetStatus = queueStatusByTarget(targetQueue);

  moveWithFallback(runtime, currentPath, targetQueue, targetStatus, [
    "PO runner routing",
    `- status: ${status}`,
    `- target: ${targetQueue}`,
    `- decision_reason: ${decisionReason}`,
  ]);

  if (targetQueue === "humanDecisionNeeded") {
    const movedPath = path.join(runtime.queues.humanDecisionNeeded, path.basename(currentPath));
    ensureHumanDecisionRequest(movedPath, decision);
  }
  if (targetQueue === "toClarify") {
    const movedPath = path.join(runtime.queues.toClarify, path.basename(currentPath));
    ensureToClarifyRequest(movedPath, decision);
  }

  let followUpRequirements = Array.isArray(decision.new_requirements) ? decision.new_requirements : [];
  if (sourceQueue === "toClarify" && targetQueue === "backlog" && followUpRequirements.length === 0) {
    const idUpper = String(frontMatter.id || "").toUpperCase();
    const nameUpper = path.basename(currentPath, path.extname(currentPath)).toUpperCase();
    const isFollowUpSource = /-FOLLOWUP(?:-|$)/.test(idUpper) || /-FOLLOWUP(?:-|$)/.test(nameUpper);
    if (!isFollowUpSource) {
      followUpRequirements = [buildFallbackFollowUpItem(decision, frontMatter, currentPath)];
      appendQueueSection(currentPath, [
        "PO runner follow-up guard",
        "- source queue was to-clarify and no follow-up requirements were emitted; auto-created one refinement follow-up item",
      ]);
    } else {
      appendQueueSection(currentPath, [
        "PO runner follow-up guard",
        "- follow-up source detected; skipped auto-creation of another follow-up to prevent queue loops",
      ]);
    }
  }

  if (followUpRequirements.length > 0) {
    const created = writeRefinementItems(runtime, `PO ${path.basename(currentPath)}`, followUpRequirements);
    if (created.length > 0) {
      log(controls, `created ${created.length} refinement item(s) from ${path.basename(currentPath)}`);
    }
  }

  if (state && state.items && runtime.po.intakeIdempotenceEnabled) {
    const currentResolved = resolveSourcePath(runtime, currentPath) || currentPath;
    const finalQueue = queueNameFromPath(currentResolved, runtime.queues) || targetQueue || "";
    const finalHash = fileHash(currentResolved);
    const previous = state.items[key] || {};
    const sameOutcome = previous.lastHash === finalHash
      && previous.lastSourceQueue === sourceQueue
      && previous.lastTargetQueue === finalQueue;
    const repeatCount = sameOutcome
      ? Math.max(0, Number.parseInt(String(previous.repeatCount || 0), 10)) + 1
      : 0;
    const next = {
      lastHash: finalHash,
      lastSourceQueue: sourceQueue,
      lastTargetQueue: finalQueue,
      lastProcessedCycle: cycle,
      repeatCount,
      skipUntilCycle: Number.isInteger(previous.skipUntilCycle) ? previous.skipUntilCycle : 0,
    };
    if (repeatCount >= 2) {
      const cooldown = Math.max(1, runtime.po.intakeLoopCooldownCycles || 3);
      next.skipUntilCycle = Math.max(next.skipUntilCycle, cycle + cooldown);
      log(
        controls,
        `loop cooldown ${key} for ${cooldown} cycle(s) after repeated ${sourceQueue}->${finalQueue}`
      );
    }
    state.items[key] = next;
    state.cycle = cycle;
    writePoRunnerState(runtime, state);
  }

  return true;
}

async function runVisionCycle(runtime, controls) {
  const beforeSnapshot = buildPlanningSnapshot(runtime);

  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "po", "po.js"),
    args: ["--auto", "--mode", "vision"],
    cwd: runtime.agentsRoot,
    maxRetries: retryMaxForPoStage(runtime, "vision", runtime.loops.maxRetries),
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
    timeoutSeconds: runnerAgentTimeoutSeconds(runtime),
    noOutputTimeoutSeconds: runnerNoOutputTimeoutSeconds(runtime),
  });

  const decision = deriveVisionDecision(runtime, result, beforeSnapshot);
  if (!result.ok) {
    log(controls, `vision cycle failed: ${(result.stderr || "").slice(0, 400)}`);
  }

  return {
    ok: result.ok,
    paused: Boolean(result.paused),
    pauseState: result.pauseState || null,
    decision,
  };
}

async function processHumanInput(runtime, controls, state, cycle) {
  const filePath = getFirstFile(runtime.queues.humanInput);
  if (!filePath) {
    return false;
  }
  const progressed = await runPoIntakeOnFile(runtime, filePath, controls, "humanInput", state, cycle);
  if (progressed) {
    log(controls, `processed human-input ${path.basename(filePath)}`);
  }
  return progressed;
}

async function processToClarify(runtime, controls, state, cycle) {
  const filePath = getFirstFile(runtime.queues.toClarify);
  if (!filePath) {
    return false;
  }
  const progressed = await runPoIntakeOnFile(runtime, filePath, controls, "toClarify", state, cycle);
  if (progressed) {
    log(controls, `processed to-clarify ${path.basename(filePath)}`);
  }
  return progressed;
}

async function fillSelected(runtime, highWatermark, controls, state, cycle) {
  let progressed = false;
  let processed = 0;
  const perCycleCap = Math.max(1, runtime.po.intakeMaxPerCycle || 3);
  const targetSelected = Math.max(
    highWatermark,
    Math.max(1, Number.parseInt(String(runtime.loops && runtime.loops.bundleMinSize || 1), 10) || 1)
  );
  while (
    !controls.stopRequested
    && !controls.drainRequested
    && countFiles(runtime.queues.selected) < targetSelected
    && processed < perCycleCap
  ) {
    const candidates = listIntakeCandidatesFair(runtime, perCycleCap - processed);
    if (candidates.length === 0) {
      break;
    }

    let handledAny = false;
    for (const source of candidates) {
      if (
        controls.stopRequested
        || controls.drainRequested
        || countFiles(runtime.queues.selected) >= targetSelected
        || processed >= perCycleCap
      ) {
        break;
      }
      const handled = await runPoIntakeOnFile(runtime, source.path, controls, source.queue, state, cycle);
      if (!handled) {
        continue;
      }
      handledAny = true;
      processed += 1;
      progressed = true;
    }

    if (!handledAny) {
      log(controls, "fillSelected: no actionable intake candidates this cycle");
      break;
    }
  }
  return progressed;
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

function releasedSignature(runtime) {
  const files = listQueueFiles(runtime.queues.released);
  if (files.length === 0) {
    return "";
  }
  const parts = [];
  for (const file of files) {
    const stat = fs.statSync(file);
    parts.push(`${path.basename(file)}|${stat.size}|${Math.round(stat.mtimeMs)}`);
  }
  return parts.sort().join("\n");
}

async function runIntakeMode(runtime, controls, lowWatermark, highWatermark, once) {
  const state = readPoRunnerState(runtime);
  state.underfilledSelectedCycles = 0;
  while (!controls.stopRequested) {
    if (controls.drainRequested) {
      log(controls, "graceful stop: no new intake work will be started");
      return;
    }
    if (await waitIfGloballyPaused(runtime, controls)) {
      if (once) {
        return;
      }
      continue;
    }

    state.cycle = Math.max(0, Number.parseInt(String(state.cycle || 0), 10)) + 1;
    const cycle = state.cycle;
    const before = snapshotHash(runtime);

    cleanupRequirementJsonArtifacts(runtime, controls, "intake-cycle");

    enforceBlockedQueuePolicy(runtime, controls);
    await processToClarify(runtime, controls, state, cycle);
    await processHumanInput(runtime, controls, state, cycle);
    const toppedUp = topUpSelectedFromBacklogForBundle(runtime, controls, state, cycle, highWatermark);
    if (toppedUp > 0) {
      log(controls, `bundle top-up moved ${toppedUp} item(s) backlog->selected`);
    }

    const preparedBeforeFill = tryPrepareReadyBundle(runtime, controls, state, highWatermark);
    if (!preparedBeforeFill && shouldFillSelected(runtime, highWatermark, state, controls)) {
      await fillSelected(runtime, highWatermark, controls, state, cycle);
      tryPrepareReadyBundle(runtime, controls, state, highWatermark);
    } else {
      logWaitCheck(runtime, state, controls, highWatermark);
    }

    if (promoteBacklogForProgress(runtime, controls, state, cycle)) {
      // keep cycle moving after direct promotion
    }
    const promoted = promoteBacklogCandidates(runtime, controls, state, cycle, highWatermark);
    if (promoted > 0) {
      log(controls, `backlog auto-promotion moved ${promoted} item(s) to selected`);
    }

    writePoRunnerState(runtime, state);

    if (once) {
      return;
    }

    const after = snapshotHash(runtime);
    if (before === after) {
      await sleepWithWaitInfo(runtime, controls, state, highWatermark, "intake");
    }
  }
}

async function runVisionMode(runtime, controls, args, lowWatermark, highWatermark, once) {
  const maxCycles = normalizePositiveInt(args.visionMaxCycles, runtime.po.visionMaxCycles);
  const maxRequirements = normalizePositiveInt(args.visionMaxRequirements, runtime.po.visionMaxRequirements);
  const stableTarget = normalizePositiveInt(args.visionStableCycles, runtime.po.visionStableCycles);

  const baseline = buildPlanningSnapshot(runtime);
  let previous = baseline;
  let stableCycles = 0;
  let planningCycles = 0;
  let visionComplete = false;
  let lastReleased = releasedSignature(runtime);
  const state = readPoRunnerState(runtime);
  state.underfilledSelectedCycles = 0;

  while (!controls.stopRequested) {
    if (controls.drainRequested) {
      log(controls, "graceful stop: no new vision work will be started");
      return;
    }
    if (await waitIfGloballyPaused(runtime, controls)) {
      if (once) {
        return;
      }
      continue;
    }

    state.cycle = Math.max(0, Number.parseInt(String(state.cycle || 0), 10)) + 1;
    const cycle = state.cycle;
    const before = snapshotHash(runtime);

    cleanupRequirementJsonArtifacts(runtime, controls, "vision-cycle");

    enforceBlockedQueuePolicy(runtime, controls);
    await processToClarify(runtime, controls, state, cycle);
    await processHumanInput(runtime, controls, state, cycle);

    const currentReleased = releasedSignature(runtime);
    const releasedChanged = currentReleased !== lastReleased;
    if (releasedChanged) {
      lastReleased = currentReleased;
      log(controls, "released changed: triggering PO vision reconciliation pass");
    }

    const planningFillNeeded = shouldFillSelected(runtime, highWatermark, state, controls) && !visionComplete;
    if (!planningFillNeeded && !releasedChanged) {
      logWaitCheck(runtime, state, controls, highWatermark);
    }
    if (planningFillNeeded || releasedChanged) {
      const cycle = await runVisionCycle(runtime, controls);
      if (cycle.paused) {
        log(
          controls,
          `vision cycle paused by token guard (${(cycle.pauseState && cycle.pauseState.reason) || "limit"})`
        );
        const pausedCount = registerPausedOccurrence(state, "po-vision", "VISION-GLOBAL");
        appendRunnerMetric(runtime, {
          stage: "po-vision",
          item_key: "VISION-GLOBAL",
          result: "paused",
          attempt: pausedCount,
        });
        if (pausedCount >= pausedLimit(runtime)) {
          writeVisionClarification(
            runtime,
            `PO vision paused too often (${pausedCount}/${pausedLimit(runtime)}); escalated for human decision.`
          );
        }
        writePoRunnerState(runtime, state);
        if (once) {
          return;
        }
        continue;
      }
      resetPausedOccurrence(state, "po-vision", "VISION-GLOBAL");
      appendRunnerMetric(runtime, {
        stage: "po-vision",
        item_key: "VISION-GLOBAL",
        result: cycle.ok ? "pass" : "fail",
      });
      if (planningFillNeeded) {
        planningCycles += 1;
      }

      const current = buildPlanningSnapshot(runtime);
      const changed = current.hash !== previous.hash;
      const newReqTotal = countNewRequirementsSince(baseline, current);
      previous = current;

      if (changed) {
        stableCycles = 0;
      } else {
        stableCycles += 1;
      }

      if (!cycle.ok) {
        writeVisionClarification(runtime, "PO vision cycle failed repeatedly and needs manual steering.");
      }

      if (cycle.decision.status === "clarify") {
        writeVisionClarification(runtime, cycle.decision.reason || "PO reported hard vision conflict.");
      }

      if (newReqTotal > maxRequirements) {
        writeVisionClarification(
          runtime,
          `PO vision generated too many requirements (${newReqTotal} > ${maxRequirements}).`
        );
      }

      if (cycle.decision.visionComplete && stableCycles >= stableTarget) {
        visionComplete = true;
        log(controls, `vision complete reached after ${planningCycles} planning cycle(s)`);
      } else if (!cycle.decision.visionComplete) {
        visionComplete = false;
      }

      if (planningFillNeeded && planningCycles >= maxCycles && !visionComplete) {
        writeVisionClarification(runtime, `PO vision reached max planning cycles (${maxCycles}) without convergence.`);
        planningCycles = 0;
        stableCycles = 0;
      }

      log(
        controls,
        `vision cycle reason=${planningFillNeeded ? "planning-fill" : "released-reconcile"} planning_cycles=${planningCycles} changed=${changed} stable=${stableCycles} new_req_total=${newReqTotal}`
      );
    }

    const toppedUp = topUpSelectedFromBacklogForBundle(runtime, controls, state, cycle, highWatermark);
    if (toppedUp > 0) {
      log(controls, `bundle top-up moved ${toppedUp} item(s) backlog->selected`);
    }

    const preparedBeforeFill = tryPrepareReadyBundle(runtime, controls, state, highWatermark);
    if (!preparedBeforeFill && shouldFillSelected(runtime, highWatermark, state, controls)) {
      await fillSelected(runtime, highWatermark, controls, state, cycle);
      tryPrepareReadyBundle(runtime, controls, state, highWatermark);
    } else {
      logWaitCheck(runtime, state, controls, highWatermark);
    }

    if (promoteBacklogForProgress(runtime, controls, state, cycle)) {
      // keep cycle moving after direct promotion
    }
    const promoted = promoteBacklogCandidates(runtime, controls, state, cycle, highWatermark);
    if (promoted > 0) {
      log(controls, `backlog auto-promotion moved ${promoted} item(s) to selected`);
    }

    writePoRunnerState(runtime, state);

    if (once) {
      return;
    }

    const after = snapshotHash(runtime);
    if (before === after) {
      await sleepWithWaitInfo(runtime, controls, state, highWatermark, "vision");
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  const runtime = loadRuntimeConfig(path.resolve(__dirname));
  ensureQueueDirs(runtime.queues);

  const mode = normalizePoMode(args.mode || runtime.po.defaultMode, runtime.po.defaultMode);
  if (mode === "vision" && !args.skipProductVisionCheck) {
    validateProductVision(runtime);
  }

  const lowWatermark = normalizeNonNegativeInt(args.lowWatermark, runtime.po.selectedLowWatermark);
  const highWatermark = Math.max(
    lowWatermark,
    normalizePositiveInt(args.highWatermark, runtime.po.selectedHighWatermark)
  );

  const controls = createControls(args.verbose, runtime);
  process.on("exit", () => controls.cleanup());
  resetGlobalPauseOnStartup(runtime, controls);
  cleanupRequirementJsonArtifacts(runtime, controls, "startup");

  log(controls, `mode=${mode}`);
  log(controls, `selected watermark low=${lowWatermark} high=${highWatermark}`);

  if (mode === "vision") {
    await runVisionMode(runtime, controls, args, lowWatermark, highWatermark, args.once);
  } else {
    await runIntakeMode(runtime, controls, lowWatermark, highWatermark, args.once);
  }

  controls.cleanup();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = {
  __test: {
    isAlreadyImplementedClaim,
    normalizeRoutingDecisionReason,
    normalizeWontDoDecisionReason,
    defaultDecisionReasonForTarget,
    canonicalRequirementKeyFromPath,
    canonicalRequirementKeyFromFileName,
    findDecisionArtifactForRequirement,
    recoverOrphanDecisionArtifacts,
    extractDecisionReasonFromRequirement,
    extractPoResultsStatusFromRequirement,
    artifactToDecision,
    parseAcceptanceCriteriaFromRaw,
    parseAcEvidenceEntriesFromRaw,
    isValidAcEvidenceReference,
    evaluateAlreadyImplementedEvidence,
  },
};
