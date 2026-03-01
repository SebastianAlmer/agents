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
  parseDecisionFile,
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

async function waitIfGloballyPaused(runtime, controls) {
  const pauseState = getActivePauseState(runtime.agentsRoot);
  if (!pauseState) {
    return false;
  }
  process.stdout.write(`${timestampMinute()} PO-RUNNER: ${formatPauseLine(pauseState)}\n`);
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

function readVisionDecision(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      status: "",
      visionComplete: false,
      reason: "",
      newRequirements: 0,
      updatedRequirements: 0,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      status: normalizeStatus(parsed.status || ""),
      visionComplete: Boolean(parsed.vision_complete),
      reason: String(parsed.reason || parsed.summary || "").trim(),
      newRequirements: normalizePositiveInt(parsed.new_requirements_count, 0, 0),
      updatedRequirements: normalizePositiveInt(parsed.updated_requirements_count, 0, 0),
    };
  } catch (err) {
    return {
      status: "",
      visionComplete: false,
      reason: `invalid decision file: ${err.message}`,
      newRequirements: 0,
      updatedRequirements: 0,
    };
  }
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

  if (
    /\bhuman[- ]decision[- ]needed\b/.test(raw) ||
    /\btarget\s*:\s*human[- ]decision[- ]needed\b/.test(raw)
  ) {
    return "humanDecisionNeeded";
  }
  if (
    /\bto[- ]clarify\b/.test(raw) ||
    /\btarget\s*:\s*to[- ]clarify\b/.test(raw)
  ) {
    return "toClarify";
  }
  if (
    /\bwont[- ]do\b/.test(raw) ||
    /\btarget\s*:\s*wont[- ]do\b/.test(raw)
  ) {
    return "wontDo";
  }
  if (/\bselected\b/.test(raw) || /\btarget\s*:\s*selected\b/.test(raw)) {
    return "selected";
  }
  if (/\bbacklog\b/.test(raw) || /\btarget\s*:\s*backlog\b/.test(raw)) {
    return "backlog";
  }
  if (/\brefinement\b/.test(raw) || /\btarget\s*:\s*refinement\b/.test(raw)) {
    return "refinement";
  }
  return "";
}

function inferPoTargetFromDecision(decision) {
  if (!decision || typeof decision !== "object") {
    return "";
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

function removeStalePlanningDuplicate(runtime, sourcePath, originQueue, controls) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return false;
  }
  const fileName = path.basename(sourcePath);
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
    if (!fs.existsSync(candidate)) {
      continue;
    }
    try {
      fs.unlinkSync(sourcePath);
      log(controls, `removed stale ${originQueue} duplicate ${fileName}; canonical in ${queueName}`);
      return true;
    } catch (err) {
      log(controls, `failed removing stale duplicate ${fileName}: ${err.message || err}`);
      return false;
    }
  }
  return false;
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

  const decision = parseDecisionFile(`${currentPath}.decision.json`, "PO");
  const frontMatter = parseFrontMatter(currentPath);
  const status = normalizeStatus(decision.status || frontMatter.status || (result.ok ? "pass" : "clarify"));
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
      "- action: route to to-clarify",
    ]);
  }

  const explicitTarget = normalizePoTarget(decision.targetQueue);
  let targetQueue = forcedEscalationQueue || explicitTarget || routeFromPo(runtime, currentPath, status);
  const hardVisionConflict = isHardVisionConflict(decision);
  const inferredTarget = inferPoTargetFromDecision(decision) || inferPoTargetFromRequirementFile(currentPath);

  if (!explicitTarget && wantsWontDo(decision)) {
    targetQueue = "wontDo";
    appendQueueSection(currentPath, [
      "PO runner wont-do guard",
      "- detected duplicate/already-implemented/invalid requirement signal; routed to wont-do",
    ]);
  }

  if (
    !explicitTarget &&
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

  // To-clarify requires an actionable question + recommendation.
  if (targetQueue === "toClarify" && !hardVisionConflict && !isActionableClarifyDecision(decision)) {
    targetQueue = sourceQueue === "toClarify" ? "backlog" : "refinement";
    appendQueueSection(currentPath, [
      "PO runner clarify contract guard",
      "- to-clarify requested without actionable question+recommended_default; PO routed decisively instead",
    ]);
  }

  // Resolve to-clarify decisively: do not keep the same requirement in to-clarify forever.
  if (sourceQueue === "toClarify" && targetQueue === "toClarify") {
    targetQueue = "backlog";
    appendQueueSection(currentPath, [
      "PO runner decisiveness guard",
      "- source queue was to-clarify and target stayed to-clarify; routed to backlog with PO decision",
    ]);
  }

  // Escalate to human only for hard vision conflicts.
  if (targetQueue === "humanDecisionNeeded" && !hardVisionConflict) {
    targetQueue = "selected";
    appendQueueSection(currentPath, [
      "PO runner escalation guard",
      "- escalation requested without hard vision conflict; PO resolved autonomously and routed to selected",
    ]);
  }
  if (targetQueue === "humanDecisionNeeded" && hardVisionConflict) {
    appendQueueSection(currentPath, [
      "PO runner escalation confirmed",
      "- hard vision conflict confirmed; awaiting explicit human decision",
    ]);
  }

  if (targetQueue === "selected" && !canPrepareBundle(runtime)) {
    targetQueue = "backlog";
    appendQueueSection(currentPath, [
      "PO runner bundle slot guard",
      "- selected routing deferred because a ready bundle is already waiting for delivery",
      "- routed to backlog; will be included in a later bundle",
    ]);
  }

  const targetStatus = queueStatusByTarget(targetQueue);

  moveWithFallback(runtime, currentPath, targetQueue, targetStatus, [
    "PO runner routing",
    `- status: ${status}`,
    `- target: ${targetQueue}`,
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
  const decisionPath = path.join(runtime.agentsRoot, ".runtime", "po-vision.decision.json");
  fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
  if (fs.existsSync(decisionPath)) {
    fs.unlinkSync(decisionPath);
  }

  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "po", "po.js"),
    args: ["--auto", "--mode", "vision", "--vision-decision-file", decisionPath],
    cwd: runtime.agentsRoot,
    maxRetries: retryMaxForPoStage(runtime, "vision", runtime.loops.maxRetries),
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
    timeoutSeconds: runnerAgentTimeoutSeconds(runtime),
    noOutputTimeoutSeconds: runnerNoOutputTimeoutSeconds(runtime),
  });

  const decision = readVisionDecision(decisionPath);
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

  log(controls, `mode=${mode}`);
  log(controls, `selected watermark low=${lowWatermark} high=${highWatermark}`);

  if (mode === "vision") {
    await runVisionMode(runtime, controls, args, lowWatermark, highWatermark, args.once);
  } else {
    await runIntakeMode(runtime, controls, lowWatermark, highWatermark, args.once);
  }

  controls.cleanup();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
