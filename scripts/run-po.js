#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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
  writeRefinementItems,
  resolveSourcePath,
  runNodeScript,
  normalizeStatus,
} = require("./lib/flow-core");

const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");

const DEFAULT_VISION_MAX_CYCLES = 100;
const DEFAULT_VISION_MAX_REQUIREMENTS = 1000;
const DEFAULT_VISION_STABLE_CYCLES = 2;

function normalizePoMode(value, fallback = "intake") {
  const normalized = String(value || fallback || "").trim().toLowerCase();
  if (["vision", "product-vision", "pos"].includes(normalized)) {
    return "vision";
  }
  return "intake";
}

function parseArgs(argv) {
  const args = {
    once: false,
    verbose: false,
    skipProductVisionCheck: false,
    mode: "intake",
    visionMaxCycles: NaN,
    visionMaxRequirements: NaN,
    visionStableCycles: NaN,
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i] || "");
    const arg = raw.toLowerCase();
    if (arg === "-once" || arg === "--once") {
      args.once = true;
      continue;
    }
    if (arg === "--skip-product-vision-check" || arg === "--skip-pos-check") {
      args.skipProductVisionCheck = true;
      continue;
    }
    if (arg === "-v" || arg === "--verbose") {
      args.verbose = true;
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
  }
  args.mode = normalizePoMode(args.mode, "intake");
  return args;
}

function logger(verbose, message) {
  if (!verbose) {
    return;
  }
  process.stdout.write(`PO: ${message}\n`);
}

function resolveTargetQueue(runtime, queueName, fallbackQueue = "to-clarify") {
  const normalized = String(queueName || "").trim().toLowerCase();
  if (normalized === "to-clarify") {
    return "toClarify";
  }
  if (runtime.queues[normalized]) {
    return normalized;
  }
  if (runtime.queues.toClarify) {
    return "toClarify";
  }
  if (runtime.queues[fallbackQueue]) {
    return fallbackQueue;
  }
  if (runtime.queues.toClarify) {
    return "toClarify";
  }
  return "";
}

function appendQueueNoteIfPossible(filePath, lines) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }
  appendQueueSection(filePath, lines);
}

function isExpectedInQueue(runtime, fileName, queueName) {
  const queuePath = runtime.queues[queueName];
  if (!queuePath) {
    return false;
  }
  return fs.existsSync(path.join(queuePath, fileName));
}

function moveWithFallback(runtime, sourcePath, fileName, targetQueue, context) {
  const normalizedTarget = resolveTargetQueue(runtime, targetQueue, "to-clarify");
  const targetDir = runtime.queues[normalizedTarget] || runtime.queues.toClarify;
  const targetPath = path.join(targetDir, fileName);
  const moved = moveRequirementFile(sourcePath, targetPath);
  if (moved) {
    return { moved: true, queue: normalizedTarget, path: targetPath };
  }

  appendQueueNoteIfPossible(sourcePath, context || ["PO: routing failure"]);
  const fallbackDir = runtime.queues.toClarify;
  if (!fallbackDir) {
    return { moved: false, queue: normalizedTarget, path: "" };
  }

  const fallbackPath = path.join(fallbackDir, fileName);
  const fallbackMoved = moveRequirementFile(sourcePath, fallbackPath);
  return {
    moved: fallbackMoved,
    queue: fallbackMoved ? "toClarify" : normalizedTarget,
    path: fallbackPath,
  };
}

function validatePosDocs(runtime) {
  const visionDir = String(runtime.productVisionDir || "").trim();
  const hasDir = visionDir && fs.existsSync(visionDir);
  const fileList = Array.isArray(runtime.productVisionFiles) ? runtime.productVisionFiles : [];
  if (!hasDir || fileList.length === 0) {
    const dirLabel = visionDir || "<missing>";
    throw new Error(`Missing Product Vision docs bundle in ${dirLabel} (expected at least one .md file)`);
  }
}

function selectRefinementSource(runtime) {
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

function routeFromPo(runtime, filePath, status) {
  const routeMap = {
    pass: "selected",
    clarify: "to-clarify",
  };
  return routeByStatus({
    runtime,
    filePath,
    status,
    routeMap,
    fallbackQueue: "to-clarify",
  });
}

function allowPoDecisionTarget(queueName) {
  return ["selected", "toClarify", "backlog", "refinement", "wontDo"].includes(
    String(queueName || "").trim()
  );
}

function normalizePositiveInt(value, fallback, min = 1) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

function listQueueFiles(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function planningQueueMap(runtime) {
  return [
    ["refinement", runtime.queues.refinement],
    ["backlog", runtime.queues.backlog],
    ["selected", runtime.queues.selected],
    ["toClarify", runtime.queues.toClarify],
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
  const keySet = new Set(items.map((entry) => `${entry.queue}/${entry.file}`));
  return {
    hash,
    items,
    keySet,
    count: items.length,
  };
}

function countNewRequirementsSince(baseSnapshot, currentSnapshot) {
  let delta = 0;
  for (const key of currentSnapshot.keySet) {
    if (!baseSnapshot.keySet.has(key)) {
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
      raw: {},
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const status = normalizeStatus(raw.status || "");
    return {
      status,
      visionComplete: Boolean(raw.vision_complete),
      reason: String(raw.reason || raw.summary || "").trim(),
      newRequirements: normalizePositiveInt(raw.new_requirements_count, 0, 0),
      updatedRequirements: normalizePositiveInt(raw.updated_requirements_count, 0, 0),
      raw,
    };
  } catch (err) {
    return {
      status: "",
      visionComplete: false,
      reason: `invalid decision file: ${err.message}`,
      newRequirements: 0,
      updatedRequirements: 0,
      raw: {},
    };
  }
}

function writeVisionOverflowClarification(runtime, reason) {
  const targetDir = runtime.queues.toClarify;
  if (!targetDir) {
    return "";
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `REQ-PO-VISION-OVERFLOW-${timestamp}.md`;
  const targetPath = path.join(targetDir, fileName);
  const content = [
    "---",
    `id: REQ-PO-VISION-OVERFLOW-${timestamp}`,
    "title: PO Vision overflow clarification",
    "status: clarify",
    "source: po-vision",
    "---",
    "",
    "# Goal",
    "Human decision required for Product Vision planning overflow.",
    "",
    "## Clarifications needed",
    `- ${String(reason || "PO vision planning exceeded configured limits.")}`,
    "",
    "## PO Results",
    "- Routed to to-clarify for manual steering.",
    `- Changes: ${targetPath}`,
    "",
  ].join("\n");
  fs.writeFileSync(targetPath, content, "utf8");
  return targetPath;
}

async function runPoItem(runtime, filePath, logger) {
  const fileName = path.basename(filePath);
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "po", "po.js"),
    args: ["--auto", "--requirement", filePath],
    cwd: runtime.agentsRoot,
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
  });

  const currentPath = resolveSourcePath(runtime, filePath);
  if (!currentPath) {
    logger(`item vanished during PO run (${fileName})`);
    return { progressed: true };
  }

  const decision = parseDecisionFile(`${currentPath}.decision.json`, "PO");
  const currentStatus = normalizeStatus(decision.status || parseFrontMatter(currentPath).status || "");
  const status = result.ok ? currentStatus || "clarify" : "clarify";
  const decisionQueueRaw = resolveTargetQueue(runtime, decision.targetQueue, "to-clarify");
  const decisionQueue = allowPoDecisionTarget(decisionQueueRaw) ? decisionQueueRaw : "";

  if (!result.ok) {
    appendQueueSection(currentPath, [
      "PO: execution failure",
      `- reason: ${(result.stderr || "execution failed").slice(0, 700)}`,
      "- action: route back to to-clarify for offline clarification",
    ]);
  }

  const target = (() => {
    if (decisionQueue) {
      return decisionQueue;
    }
    return routeFromPo(runtime, currentPath, status);
  })();
  const targetStatus = status === "pass" ? "pass" : "clarify";
  setFrontMatterStatus(currentPath, targetStatus);

  const movement = moveWithFallback(runtime, currentPath, fileName, target, [
    "PO: routing",
    `- source: ${fileName}`,
    `- status: ${status}`,
    `- target: ${target}`,
  ]);
  if (!movement.moved || !isExpectedInQueue(runtime, fileName, movement.queue)) {
    appendQueueNoteIfPossible(currentPath, [
      "PO: routing validation",
      `- expected target path not found for ${fileName}`,
      "- action: fallback to to-clarify",
    ]);
    const fallback = moveWithFallback(runtime, currentPath, fileName, "to-clarify", [
      "PO: routing fallback",
      `- forced to-clarify for recovery`,
    ]);
    if (!fallback.moved) {
      return { progressed: true, target: "to-clarify", status };
    }
    return {
      progressed: true,
      target: fallback.queue === "toClarify" ? "to-clarify" : fallback.queue,
      status,
    };
  }

  if (Array.isArray(decision.new_requirements) && decision.new_requirements.length > 0) {
    const created = writeRefinementItems(runtime, `PO ${fileName}`, decision.new_requirements);
    if (created.length > 0 && result.ok) {
      logger(`created ${created.length} refinement items from ${fileName}`);
    }
  }

  return { progressed: true, target, status };
}

async function runPoVisionCycle(runtime, logger) {
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
    logger(`vision cycle agent failure: ${(result.stderr || "").slice(0, 280)}`);
    return {
      ok: false,
      decision,
      reason: "po vision agent execution failed",
    };
  }

  return {
    ok: true,
    decision,
    reason: "",
  };
}

async function processToClarify(runtime, logger) {
  const first = getFirstFile(runtime.queues.toClarify);
  if (!first) {
    return false;
  }

  const outcome = await runPoItem(runtime, first, logger);
  logger(`to-clarify -> ${outcome.target || "to-clarify"}`);
  return outcome.progressed;
}

async function fillWindow(runtime, logger) {
  const windowSize = runtime.loops.windowSize;
  let progressed = false;

  while (countFiles(runtime.queues.selected) < windowSize) {
    const source = selectRefinementSource(runtime);
    if (!source.path) {
      break;
    }

    const sourceName = path.basename(source.path);
    const outcome = await runPoItem(runtime, source.path, logger);
    logger(`selected-fill from ${source.queue}: ${sourceName} -> ${outcome.target || "to-clarify"}`);
    progressed = true;
  }

  return progressed;
}

async function runVisionMode(runtime, args, logger) {
  const poCfg = runtime.po || {};
  const maxCycles = normalizePositiveInt(
    args.visionMaxCycles,
    normalizePositiveInt(poCfg.visionMaxCycles, DEFAULT_VISION_MAX_CYCLES)
  );
  const maxRequirements = normalizePositiveInt(
    args.visionMaxRequirements,
    normalizePositiveInt(poCfg.visionMaxRequirements, DEFAULT_VISION_MAX_REQUIREMENTS)
  );
  const stableCyclesTarget = normalizePositiveInt(
    args.visionStableCycles,
    normalizePositiveInt(poCfg.visionStableCycles, DEFAULT_VISION_STABLE_CYCLES)
  );

  logger(`vision mode max_cycles=${maxCycles}`);
  logger(`vision mode max_requirements=${maxRequirements}`);
  logger(`vision mode stable_cycles=${stableCyclesTarget}`);

  const baselineSnapshot = buildPlanningSnapshot(runtime);
  let previousSnapshot = baselineSnapshot;
  let stableCycles = 0;

  const maxLoop = args.once ? 1 : maxCycles;
  for (let cycle = 1; cycle <= maxLoop; cycle++) {
    logger(`vision cycle ${cycle}/${maxLoop} start`);

    const cycleResult = await runPoVisionCycle(runtime, logger);
    const currentSnapshot = buildPlanningSnapshot(runtime);
    const changed = currentSnapshot.hash !== previousSnapshot.hash;
    const newReqTotal = countNewRequirementsSince(baselineSnapshot, currentSnapshot);

    logger(`vision cycle ${cycle}: changed=${changed} new_requirements_total=${newReqTotal}`);

    if (newReqTotal > maxRequirements) {
      const reason = `PO Vision exceeded max generated requirements (${newReqTotal} > ${maxRequirements}).`;
      const clarificationPath = writeVisionOverflowClarification(runtime, reason);
      if (clarificationPath) {
        logger(`vision overflow routed to to-clarify: ${clarificationPath}`);
      }
      process.exitCode = 2;
      return;
    }

    if (!cycleResult.ok) {
      process.exitCode = 2;
      return;
    }

    if (cycleResult.decision.status === "clarify") {
      logger(`vision decision requires human steering: ${cycleResult.decision.reason || "clarify"}`);
      process.exitCode = 2;
      return;
    }

    if (changed) {
      stableCycles = 0;
    } else {
      stableCycles += 1;
    }

    if (cycleResult.decision.visionComplete && stableCycles >= 1) {
      logger("vision converged by agent decision");
      return;
    }

    if (stableCycles >= stableCyclesTarget) {
      logger(`vision converged after ${stableCycles} stable cycle(s)`);
      return;
    }

    previousSnapshot = currentSnapshot;
  }

  const reason = `PO Vision did not converge within max cycles (${maxLoop}).`;
  const clarificationPath = writeVisionOverflowClarification(runtime, reason);
  if (clarificationPath) {
    logger(`vision max-cycle guard routed to to-clarify: ${clarificationPath}`);
  }
  process.exitCode = 2;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtime = loadRuntimeConfig(path.resolve(__dirname, ".."));
  args.mode = normalizePoMode(args.mode, (runtime.po && runtime.po.defaultMode) || "intake");
  if (!args.skipProductVisionCheck && args.mode === "vision") {
    validatePosDocs(runtime);
  }
  ensureQueueDirs(runtime.queues);

  const out = (msg) => logger(args.verbose, msg);
  out(`mode=${args.mode}`);
  out(`window=${runtime.loops.windowSize}`);

  if (args.mode === "vision") {
    await runVisionMode(runtime, args, out);
    return;
  }

  while (true) {
    let progressed = false;

    const toClarifyProgress = await processToClarify(runtime, out);
    progressed = progressed || toClarifyProgress;

    const fillProgress = await fillWindow(runtime, out);
    progressed = progressed || fillProgress;

    if (args.once) {
      break;
    }

    if (!progressed) {
      await sleep(Math.max(1, runtime.loops.poPollSeconds) * 1000);
    }
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
