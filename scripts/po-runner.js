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
} = require("./lib/flow-core");
const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");

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
    "Usage: node scripts/po-runner.js [--mode vision|intake] [--once] [--verbose|--no-verbose] [--low-watermark N] [--high-watermark N]"
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
    process.stdout.write(`PO-RUNNER: ${message}\n`);
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
  process.stdout.write(`PO-RUNNER: ${formatPauseLine(pauseState)}\n`);
  const fallbackMs = Math.max(1, runtime.loops.poPollSeconds) * 1000;
  const waitMs = Number.isFinite(pauseState.remainingMs)
    ? Math.min(Math.max(1000, pauseState.remainingMs), fallbackMs)
    : fallbackMs;
  await sleep(waitMs);
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
    return { version: 1, cycle: 0, items: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      return { version: 1, cycle: 0, items: {} };
    }
    return {
      version: 1,
      cycle: Number.isInteger(parsed.cycle) ? parsed.cycle : 0,
      items: parsed.items && typeof parsed.items === "object" ? parsed.items : {},
    };
  } catch {
    return { version: 1, cycle: 0, items: {} };
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
  const backlogFile = getFirstFile(runtime.queues.backlog);
  if (backlogFile) {
    return { path: backlogFile, queue: "backlog" };
  }
  const refinementFile = getFirstFile(runtime.queues.refinement);
  if (refinementFile) {
    return { path: refinementFile, queue: "refinement" };
  }
  return { path: "", queue: "" };
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

async function runPoIntakeOnFile(runtime, filePath, controls, sourceHint = "", state = null, cycle = 0) {
  const sourceBefore = resolveSourcePath(runtime, filePath) || filePath;
  const originQueue = sourceHint || queueNameFromPath(sourceBefore, runtime.queues) || "";
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
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
  });

  if (result.paused) {
    log(controls, `PO intake paused by token guard (${(result.pauseState && result.pauseState.reason) || "limit"})`);
    return false;
  }

  const currentPath = resolveSourcePath(runtime, sourceBefore);
  if (!currentPath) {
    log(controls, `intake item vanished during PO run: ${path.basename(filePath)}`);
    return true;
  }

  const decision = parseDecisionFile(`${currentPath}.decision.json`, "PO");
  const frontMatter = parseFrontMatter(currentPath);
  const status = normalizeStatus(decision.status || frontMatter.status || (result.ok ? "pass" : "clarify"));
  const sourceQueue = originQueue || queueNameFromPath(sourceBefore, runtime.queues) || "";

  if (!result.ok) {
    appendQueueSection(currentPath, [
      "PO runner: execution failure",
      `- reason: ${(result.stderr || "execution failed").slice(0, 700)}`,
      "- action: route to to-clarify",
    ]);
  }

  const explicitTarget = normalizePoTarget(decision.targetQueue);
  let targetQueue = explicitTarget || routeFromPo(runtime, currentPath, status);
  const hardVisionConflict = isHardVisionConflict(decision);

  if (!explicitTarget && wantsWontDo(decision)) {
    targetQueue = "wontDo";
    appendQueueSection(currentPath, [
      "PO runner wont-do guard",
      "- detected duplicate/already-implemented/invalid requirement signal; routed to wont-do",
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
    followUpRequirements = [buildFallbackFollowUpItem(decision, frontMatter, currentPath)];
    appendQueueSection(currentPath, [
      "PO runner follow-up guard",
      "- source queue was to-clarify and no follow-up requirements were emitted; auto-created one refinement follow-up item",
    ]);
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
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
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
  while (!controls.stopRequested && countFiles(runtime.queues.selected) < highWatermark && processed < perCycleCap) {
    const source = selectIntakeSource(runtime);
    if (!source.path) {
      break;
    }
    const handled = await runPoIntakeOnFile(runtime, source.path, controls, source.queue, state, cycle);
    if (!handled) {
      break;
    }
    processed += 1;
    progressed = true;
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
  while (!controls.stopRequested) {
    if (await waitIfGloballyPaused(runtime, controls)) {
      if (once) {
        return;
      }
      continue;
    }

    state.cycle = Math.max(0, Number.parseInt(String(state.cycle || 0), 10)) + 1;
    const cycle = state.cycle;
    const before = snapshotHash(runtime);

    await processToClarify(runtime, controls, state, cycle);
    await processHumanInput(runtime, controls, state, cycle);

    const selectedCount = countFiles(runtime.queues.selected);
    if (selectedCount < lowWatermark || selectedCount < highWatermark) {
      await fillSelected(runtime, highWatermark, controls, state, cycle);
    }

    writePoRunnerState(runtime, state);

    if (once) {
      return;
    }

    const after = snapshotHash(runtime);
    if (before === after) {
      await sleep(Math.max(1, runtime.loops.poPollSeconds) * 1000);
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

  while (!controls.stopRequested) {
    if (await waitIfGloballyPaused(runtime, controls)) {
      if (once) {
        return;
      }
      continue;
    }

    state.cycle = Math.max(0, Number.parseInt(String(state.cycle || 0), 10)) + 1;
    const cycle = state.cycle;
    const before = snapshotHash(runtime);

    await processToClarify(runtime, controls, state, cycle);
    await processHumanInput(runtime, controls, state, cycle);

    const selectedCount = countFiles(runtime.queues.selected);
    const currentReleased = releasedSignature(runtime);
    const releasedChanged = currentReleased !== lastReleased;
    if (releasedChanged) {
      lastReleased = currentReleased;
      log(controls, "released changed: triggering PO vision reconciliation pass");
    }

    const planningFillNeeded = selectedCount < highWatermark && !visionComplete;
    if (planningFillNeeded || releasedChanged) {
      const cycle = await runVisionCycle(runtime, controls);
      if (cycle.paused) {
        log(
          controls,
          `vision cycle paused by token guard (${(cycle.pauseState && cycle.pauseState.reason) || "limit"})`
        );
        if (once) {
          return;
        }
        continue;
      }
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

    if (countFiles(runtime.queues.selected) < lowWatermark) {
      await fillSelected(runtime, highWatermark, controls, state, cycle);
    }

    writePoRunnerState(runtime, state);

    if (once) {
      return;
    }

    const after = snapshotHash(runtime);
    if (before === after) {
      await sleep(Math.max(1, runtime.loops.poPollSeconds) * 1000);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  const runtime = loadRuntimeConfig(path.resolve(__dirname, ".."));
  ensureQueueDirs(runtime.queues);

  const mode = normalizePoMode(args.mode || runtime.po.defaultMode, runtime.po.defaultMode);
  if (mode === "vision" && !args.skipProductVisionCheck) {
    validateProductVision(runtime);
  }

  const lowWatermark = normalizePositiveInt(args.lowWatermark, runtime.loops.bundleMinSize);
  const highWatermark = Math.max(
    lowWatermark,
    normalizePositiveInt(args.highWatermark, runtime.loops.bundleMaxSize)
  );

  const controls = createControls(args.verbose, runtime);
  process.on("exit", () => controls.cleanup());

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
