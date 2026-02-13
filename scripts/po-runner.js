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
  writeRefinementItems,
  resolveSourcePath,
  runNodeScript,
  normalizeStatus,
  listQueueFiles,
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
    process.stdout.write(`PO-RUNNER: ${message}\n`);
  }
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
  const targetDir = runtime.queues.toClarify;
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
    "status: to-clarify",
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
    "- Routed to to-clarify without stopping autonomous delivery.",
    `- Changes: ${filePath}`,
    "",
  ].join("\n");

  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function selectIntakeSource(runtime) {
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
  if (normalized === "to-clarify") {
    return "toClarify";
  }
  if (normalized === "to_clarify" || normalized === "toclarify") {
    return "toClarify";
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
    block: "toClarify",
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
  return "to-clarify";
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

async function runPoIntakeOnFile(runtime, filePath, controls) {
  const result = await runNodeScript({
    scriptPath: path.join(runtime.agentsRoot, "po", "po.js"),
    args: ["--auto", "--mode", "intake", "--requirement", filePath],
    cwd: runtime.agentsRoot,
    maxRetries: runtime.loops.maxRetries,
    retryDelaySeconds: runtime.loops.retryDelaySeconds,
  });

  const currentPath = resolveSourcePath(runtime, filePath);
  if (!currentPath) {
    log(controls, `intake item vanished during PO run: ${path.basename(filePath)}`);
    return true;
  }

  const decision = parseDecisionFile(`${currentPath}.decision.json`, "PO");
  const frontMatter = parseFrontMatter(currentPath);
  const status = normalizeStatus(decision.status || frontMatter.status || (result.ok ? "pass" : "clarify"));

  if (!result.ok) {
    appendQueueSection(currentPath, [
      "PO runner: execution failure",
      `- reason: ${(result.stderr || "execution failed").slice(0, 700)}`,
      "- action: route to to-clarify",
    ]);
  }

  const explicitTarget = normalizePoTarget(decision.targetQueue);
  const targetQueue = explicitTarget || routeFromPo(runtime, currentPath, status);
  const targetStatus = queueStatusByTarget(targetQueue);

  moveWithFallback(runtime, currentPath, targetQueue, targetStatus, [
    "PO runner routing",
    `- status: ${status}`,
    `- target: ${targetQueue}`,
  ]);

  if (Array.isArray(decision.new_requirements) && decision.new_requirements.length > 0) {
    const created = writeRefinementItems(runtime, `PO ${path.basename(currentPath)}`, decision.new_requirements);
    if (created.length > 0) {
      log(controls, `created ${created.length} refinement item(s) from ${path.basename(currentPath)}`);
    }
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
    decision,
  };
}

async function processToClarify(runtime, controls) {
  const filePath = getFirstFile(runtime.queues.toClarify);
  if (!filePath) {
    return false;
  }
  const progressed = await runPoIntakeOnFile(runtime, filePath, controls);
  if (progressed) {
    log(controls, `processed to-clarify ${path.basename(filePath)}`);
  }
  return progressed;
}

async function fillSelected(runtime, highWatermark, controls) {
  let progressed = false;
  while (!controls.stopRequested && countFiles(runtime.queues.selected) < highWatermark) {
    const source = selectIntakeSource(runtime);
    if (!source.path) {
      break;
    }
    await runPoIntakeOnFile(runtime, source.path, controls);
    progressed = true;
  }
  return progressed;
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

async function runIntakeMode(runtime, controls, lowWatermark, highWatermark, once) {
  while (!controls.stopRequested) {
    const before = snapshotHash(runtime);

    await processToClarify(runtime, controls);

    const selectedCount = countFiles(runtime.queues.selected);
    if (selectedCount < lowWatermark || selectedCount < highWatermark) {
      await fillSelected(runtime, highWatermark, controls);
    }

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
  let cycles = 0;
  let visionComplete = false;

  while (!controls.stopRequested) {
    const before = snapshotHash(runtime);

    await processToClarify(runtime, controls);

    const selectedCount = countFiles(runtime.queues.selected);
    if (selectedCount < highWatermark && !visionComplete) {
      const cycle = await runVisionCycle(runtime, controls);
      cycles += 1;

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
        log(controls, `vision complete reached after ${cycles} cycle(s)`);
      }

      if (cycles >= maxCycles && !visionComplete) {
        writeVisionClarification(runtime, `PO vision reached max cycles (${maxCycles}) without convergence.`);
        cycles = 0;
        stableCycles = 0;
      }

      log(
        controls,
        `vision cycle=${cycles} changed=${changed} stable=${stableCycles} new_req_total=${newReqTotal}`
      );
    }

    if (countFiles(runtime.queues.selected) < lowWatermark) {
      await fillSelected(runtime, highWatermark, controls);
    }

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
