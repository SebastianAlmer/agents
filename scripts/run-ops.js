#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  sleep,
  getFirstFile,
  moveRequirementFile,
  parseFrontMatter,
  parseDecisionFile,
  routeByStatus,
  queuePathByName,
  detectCurrentQueue,
  writeRefinementItems,
  appendQueueSection,
  normalizeStatus,
  normalizeQueueName,
  setFrontMatterStatus,
  runNodeScript,
} = require("./lib/flow-core");

const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");

function parseArgs(argv) {
  const args = { once: false, verbose: false, mode: "full" };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "").toLowerCase();
    if (arg === "--once" || arg === "-once") {
      args.once = true;
      continue;
    }
    if (arg === "--verbose" || arg === "-v") {
      args.verbose = true;
      continue;
    }
    if (arg === "--mode" || arg === "-mode") {
      args.mode = String(argv[i + 1] || "").toLowerCase();
      i++;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      args.mode = String(arg.split("=", 2)[1] || "").toLowerCase();
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

function logger(verbose, message) {
  if (!verbose) {
    return;
  }
  process.stdout.write(`OPS: ${message}\n`);
}

function resolveTargetQueue(runtime, queueName, fallbackQueue) {
  const normalized = normalizeQueueName(queueName);
  if (normalized && runtime.queues[normalized]) {
    return normalized;
  }
  return fallbackQueue;
}

function appendQueueNote(filePath, lines) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }
  appendQueueSection(filePath, lines);
}

function normalizeImplementationScope(value, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["frontend", "fe", "ui", "web"].includes(normalized)) {
    return "frontend";
  }
  if (["backend", "be", "api", "server"].includes(normalized)) {
    return "backend";
  }
  if (["fullstack", "fs", "full-stack", "full_stack"].includes(normalized)) {
    return "fullstack";
  }
  return fallback;
}

function selectDevAgent(runtime, sourcePath, loggerRef) {
  const frontMatter = parseFrontMatter(sourcePath);
  const configuredMode = runtime.devRouting && runtime.devRouting.mode;
  const requestedScope = normalizeImplementationScope(
    frontMatter.implementation_scope || frontMatter.dev_scope || frontMatter.scope,
    runtime.devRouting ? runtime.devRouting.defaultScope : "fullstack"
  );

  if (configuredMode === "split") {
    loggerRef(`split scope selected: ${requestedScope}`);
    if (requestedScope === "frontend") {
      return "dev-fe/dev-fe.js";
    }
    if (requestedScope === "backend") {
      return "dev-be/dev-be.js";
    }
  }
  return "dev/dev.js";
}

function resolveFailureRoute(runtime, filePath, message) {
  const toClarifyDir = runtime.queues.toClarify;
  if (!filePath || !fs.existsSync(filePath) || !toClarifyDir) {
    return;
  }

  appendQueueNote(filePath, [
    "OPS execution failure",
    `- ${message}`,
    "- action: route to to-clarify for follow-up",
  ]);

  setFrontMatterStatus(filePath, "clarify");
  const fileName = path.basename(filePath);
  const movement = moveToQueue(runtime, filePath, fileName, "to-clarify", [
    "OPS: route after execution failure",
    `- reason: ${message}`,
  ]);

  if (!movement.moved) {
    appendQueueNote(filePath, ["OPS routing fallback", "- move failed, could not route to to-clarify"]);
  }
}

function moveToQueue(runtime, sourcePath, fileName, targetQueueName, context) {
  const normalizedTarget = resolveTargetQueue(runtime, targetQueueName, "toClarify");
  const targetQueue = queuePathByName(runtime.queues, normalizedTarget);
  if (!targetQueue) {
    return {
      moved: false,
      targetQueue: "toClarify",
      targetPath: "",
      fallback: true,
    };
  }

  const targetPath = path.join(targetQueue, fileName);
  const moved = moveRequirementFile(sourcePath, targetPath);
  if (!moved && sourcePath !== targetPath) {
    const detail = context && context.length ? context : ["OPS: move failed"];
    appendQueueSection(sourcePath, detail);
    const fallbackPath = path.join(runtime.queues.toClarify || targetQueue, fileName);
    const fallbackOk = moveRequirementFile(sourcePath, fallbackPath);
    return {
      moved: fallbackOk,
      targetQueue: "toClarify",
      targetPath: fallbackPath,
      fallback: true,
    };
  }

  return {
    moved: true,
    targetQueue: normalizedTarget,
    targetPath,
    fallback: false,
  };
}

function inferTargetQueue(runtime, filePath, status, routeMap, fallbackQueue, decision) {
  if (decision && decision.targetQueue) {
    const decisionQueue = resolveTargetQueue(runtime, decision.targetQueue);
    if (decisionQueue) {
      return decisionQueue;
    }
  }
  return routeByStatus({
    runtime,
    filePath,
    status,
    routeMap,
    fallbackQueue,
  });
}

function createRefinementBatches(runtime, origin, decision) {
  if (!decision || !Array.isArray(decision.new_requirements) || decision.new_requirements.length === 0) {
    return 0;
  }
  const created = writeRefinementItems(runtime, origin, decision.new_requirements);
  return created.length;
}

function isExpectedInTarget(runtime, fileName, queueName) {
  const queueDir = runtime.queues[normalizeQueueName(queueName)];
  if (!queueDir) {
    return false;
  }
  return fs.existsSync(path.join(queueDir, fileName));
}

async function runOpsItem(runtime, stage, log) {
  const sourceDir = runtime.queues[stage.source];
  if (!sourceDir) {
    return false;
  }

  const sourcePath = getFirstFile(sourceDir);
  if (!sourcePath) {
    return false;
  }

  const fileName = path.basename(sourcePath);
  let agentScript = stage.agent;
  if (stage.source === "dev") {
    agentScript = selectDevAgent(runtime, sourcePath, log);
  }

  const scriptPath = path.join(runtime.agentsRoot, agentScript);
  const args = ["--auto", "--requirement", sourcePath];
  if (stage.batch) {
    args.push("--batch");
  }

  const runResult = await runNodeScript({
    scriptPath,
    args,
    cwd: runtime.agentsRoot,
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
  });

  let currentPath = detectCurrentQueue(fileName, runtime.queues).path || "";
  if (!currentPath) {
    currentPath = sourcePath;
  }
  const hasCurrentPath = fs.existsSync(currentPath);

  let decision = {};
  if (hasCurrentPath) {
    decision = parseDecisionFile(`${currentPath}.decision.json`, stage.label);
  }
  const frontMatter = hasCurrentPath ? parseFrontMatter(currentPath) : {};

  let normalizedStatus = normalizeStatus(decision.status || frontMatter.status || "");
  if (!runResult.ok) {
    normalizedStatus = "clarify";
  }
  if (!normalizedStatus) {
    normalizedStatus = runResult.ok ? "pass" : "clarify";
  }

  if (!runResult.ok) {
    if (hasCurrentPath) {
      setFrontMatterStatus(currentPath, "clarify");
      resolveFailureRoute(runtime, currentPath, "agent execution failed");
    } else if (sourcePath) {
      log(`failed to locate file after ${stage.label} run: ${fileName}`);
    }
    if (
      ["qa", "sec"].includes(stage.source) &&
      Array.isArray(decision.new_requirements) &&
      decision.new_requirements.length > 0
    ) {
      const created = createRefinementBatches(runtime, `OPS ${stage.label}`, decision);
      if (created > 0) {
        log(`created ${created} refinement item(s) from failure context`);
      }
    }
    return true;
  }

  if (!hasCurrentPath) {
    log(`failed to locate file after ${stage.label} run: ${fileName}`);
    return true;
  }

  const targetQueue = inferTargetQueue(
    runtime,
    currentPath,
    normalizedStatus,
    stage.routeMap,
    stage.fallback,
    decision
  );
  const fmStatus = normalizedStatus === "pass" ? "pass" : "clarify";
  setFrontMatterStatus(currentPath, fmStatus);

  const movement = moveToQueue(runtime, currentPath, fileName, targetQueue, [
    `OPS: route from ${stage.label}`,
    `- source: ${stage.source}`,
    `- target: ${targetQueue}`,
    `- status: ${normalizedStatus}`,
  ]);

  let finalQueue = movement.targetQueue;
  if (!isExpectedInTarget(runtime, fileName, finalQueue)) {
    appendQueueNote(currentPath, [
      "OPS: routing validation",
      `- expected target file not found in ${finalQueue}, routing safety fallback`,
    ]);
    const fallback = moveToQueue(runtime, currentPath, fileName, "to-clarify", [
      "OPS: fallback routing after missing expected target file",
    ]);
    finalQueue = fallback.targetQueue || "toClarify";
    if (!isExpectedInTarget(runtime, fileName, finalQueue) && fallback.fallback && !fallback.moved) {
      appendQueueNote(currentPath, [
        "OPS: routing warning",
        `- fallback move to to-clarify failed for ${fileName}`,
        "- continuing with next loop",
      ]);
    }
  }

  if (
    ["qa", "sec"].includes(stage.source) &&
    Array.isArray(decision.new_requirements) &&
    decision.new_requirements.length > 0
  ) {
    const created = createRefinementBatches(runtime, `OPS ${stage.label}`, decision);
    if (created > 0) {
      log(`created ${created} refinement item(s) from ${fileName}`);
    }
  }

  return true;
}

function buildStages(mode) {
  const preflightStages = [
    {
      source: "arch",
      label: "arch->dev",
      agent: "arch/arch.js",
      routeMap: { pass: "dev", clarify: "to-clarify" },
      fallback: "to-clarify",
    },
    {
      source: "selected",
      label: "selected->dev",
      agent: "arch/arch.js",
      routeMap: { pass: "dev", clarify: "to-clarify" },
      fallback: "to-clarify",
    },
    {
      source: "dev",
      label: "dev->qa",
      agent: "dev/dev.js",
      routeMap: { pass: "qa", clarify: "to-clarify" },
      fallback: "to-clarify",
    },
  ];

  if (mode === "dev-only") {
    return preflightStages;
  }

  return [
    ...preflightStages,
    {
      source: "qa",
      label: "qa->sec",
      agent: "qa/qa.js",
      routeMap: { pass: "sec", clarify: "to-clarify" },
      fallback: "to-clarify",
    },
    {
      source: "sec",
      label: "sec->ux",
      agent: "sec/sec.js",
      routeMap: { pass: "ux", clarify: "to-clarify" },
      fallback: "to-clarify",
    },
    {
      source: "ux",
      label: "ux->deploy",
      agent: "ux/ux.js",
      routeMap: { pass: "deploy", clarify: "to-clarify" },
      fallback: "to-clarify",
    },
    {
      source: "deploy",
      label: "deploy->released",
      agent: "deploy/deploy.js",
      routeMap: { pass: "released", clarify: "to-clarify" },
      fallback: "to-clarify",
    },
  ];
}

async function processLoop(runtime, log, once, mode) {
  const stages = buildStages(mode);

  while (true) {
    let progressed = false;

    for (const stage of stages) {
      if (await runOpsItem(runtime, stage, log)) {
        progressed = true;
      }
    }

    if (!progressed) {
      // No work found for one full pass. Keep loop alive and wait for refill.
      if (once) {
        break;
      }
      await sleep(Math.max(1, runtime.loops.opsPollSeconds) * 1000);
      continue;
    }

    if (once) {
      break;
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtime = loadRuntimeConfig(path.resolve(__dirname, ".."));
  ensureQueueDirs(runtime.queues);

  logger(args.verbose, `using window_size=${runtime.loops.windowSize}`);
  logger(args.verbose, `mode=${args.mode}`);
  await processLoop(runtime, (message) => logger(args.verbose, message), args.once, args.mode);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
