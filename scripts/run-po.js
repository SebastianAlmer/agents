#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

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

function parseArgs(argv) {
  const args = { once: false, verbose: false, skipProductVisionCheck: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "").toLowerCase();
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
    }
  }
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtime = loadRuntimeConfig(path.resolve(__dirname, ".."));
  if (!args.skipProductVisionCheck) {
    validatePosDocs(runtime);
  }
  ensureQueueDirs(runtime.queues);

  const out = (msg) => logger(args.verbose, msg);
  out(`window=${runtime.loops.windowSize}`);

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
