#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  getFirstFile,
  readConfigArgs,
  readThreadId,
  writeThreadId,
  getThreadFilePath,
  runCodexExec,
  startInteractiveCodexAgent,
} = require("../lib/agent");
const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");

function normalizePoMode(value, fallback = "intake") {
  const normalized = String(value || fallback || "").trim().toLowerCase();
  if (["vision", "product-vision", "pos"].includes(normalized)) {
    return "vision";
  }
  return "intake";
}

function parseArgs(argv) {
  const args = {
    requirement: "",
    auto: false,
    mode: "intake",
    visionDecisionFile: "",
    runner: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i] || "");
    const normalized = raw.toLowerCase();
    if (["--runner", "--run", "--queue-runner"].includes(normalized)) {
      args.runner = true;
      continue;
    }
    if (normalized === "-auto" || normalized === "--auto") {
      args.auto = true;
      continue;
    }
    if (normalized === "-requirement" || normalized === "--requirement") {
      args.requirement = argv[i + 1] || "";
      i++;
      continue;
    }
    if (normalized === "--mode" || normalized === "-mode") {
      args.mode = String(argv[i + 1] || "");
      i++;
      continue;
    }
    if (normalized.startsWith("--mode=")) {
      args.mode = String(raw.split("=", 2)[1] || "");
      continue;
    }
    if (normalized === "--vision-decision-file") {
      args.visionDecisionFile = String(argv[i + 1] || "");
      i++;
      continue;
    }
    if (normalized.startsWith("--vision-decision-file=")) {
      args.visionDecisionFile = String(raw.split("=", 2)[1] || "");
      continue;
    }
  }
  args.mode = normalizePoMode(args.mode, "intake");
  return args;
}

function isRunnerFlag(arg) {
  const normalized = String(arg || "").toLowerCase();
  return ["--runner", "--run", "--queue-runner"].includes(normalized);
}

function forwardRunnerArgs(argv) {
  return argv.filter((item) => !isRunnerFlag(item));
}

function runRunnerScript(args, agentsRoot) {
  return new Promise((resolve) => {
    const scriptPath = path.join(agentsRoot, "po-runner.js");
    const proc = spawn(process.execPath, [scriptPath, ...args], {
      cwd: agentsRoot,
      stdio: "inherit",
    });
    proc.on("close", (code) => {
      resolve(Number.isInteger(code) ? code : 1);
    });
  });
}

function resolveRequirementPath(requirement, candidateDirs) {
  if (!requirement) {
    return "";
  }
  if (path.isAbsolute(requirement)) {
    return requirement;
  }
  for (const dir of candidateDirs || []) {
    const candidate = path.join(dir, requirement);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function pickIntakeFile(queues) {
  const order = [
    queues.toClarify,
    queues.humanInput,
    queues.backlog,
    queues.refinement,
  ];
  for (const queueDir of order) {
    const first = getFirstFile(queueDir);
    if (first) {
      return first;
    }
  }
  return "";
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const parsed = parseArgs(rawArgs);
  const agentRoot = __dirname;
  const agentsRoot = path.resolve(agentRoot, "..");

  if (parsed.runner) {
    const exitCode = await runRunnerScript(forwardRunnerArgs(rawArgs), agentsRoot);
    process.exit(exitCode);
  }

  if (process.env.CODEX_FLOW_AUTO === "1") {
    parsed.auto = true;
  }
  const { requirement, auto, mode } = parsed;

  const runtime = loadRuntimeConfig(agentsRoot);
  ensureQueueDirs(runtime.queues);

  const repoRoot = runtime.repoRoot;
  const docsDir = runtime.docsDir;
  const productVisionDir = runtime.productVisionDir || "";
  const productVisionFiles = Array.isArray(runtime.productVisionFiles) ? runtime.productVisionFiles : [];

  const backlogDir = runtime.queues.backlog;
  const refinementDir = runtime.queues.refinement;
  const selectedDir = runtime.queues.selected;
  const archDir = runtime.queues.arch;
  const releasedDir = runtime.queues.released;
  const toClarifyDir = runtime.queues.toClarify;
  const humanDecisionNeededDir = runtime.queues.humanDecisionNeeded;
  const humanInputDir = runtime.queues.humanInput;

  const visionDecisionFile = parsed.visionDecisionFile
    ? (path.isAbsolute(parsed.visionDecisionFile)
      ? parsed.visionDecisionFile
      : path.resolve(runtime.agentsRoot, parsed.visionDecisionFile))
    : path.join(runtime.agentsRoot, ".runtime", "po-vision.decision.json");

  console.log(`PO: mode ${mode}`);
  console.log("PO: scan intake queues");

  let reqFile = "";
  if (requirement) {
    reqFile = resolveRequirementPath(requirement, [
      backlogDir,
      refinementDir,
      humanInputDir,
      toClarifyDir,
      humanDecisionNeededDir,
      runtime.requirementsRoot,
    ]);
    if (!reqFile) {
      throw new Error(`Requirement not found: ${requirement}`);
    }
  } else if (mode !== "vision") {
    const firstFile = pickIntakeFile({
      toClarify: toClarifyDir,
      humanInput: humanInputDir,
      backlog: backlogDir,
      refinement: refinementDir,
    });
    if (!firstFile) {
      console.log("PO: intake queues empty");
      if (auto) {
        process.exit(0);
      }
    } else {
      reqFile = firstFile;
    }
  }

  if (reqFile) {
    console.log(`PO: using ${reqFile}`);
  }
  console.log(`PO: backlog dir ${backlogDir}`);
  console.log(`PO: refinement dir ${refinementDir}`);
  console.log(`PO: arch dir ${archDir}`);
  console.log(`PO: released dir ${releasedDir}`);
  console.log(`PO: to-clarify dir ${toClarifyDir}`);
  console.log(`PO: human-input dir ${humanInputDir}`);
  console.log(`PO: human-decision-needed dir ${humanDecisionNeededDir}`);
  if (mode === "vision") {
    console.log(`PO: vision decision file ${visionDecisionFile}`);
  }

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const reqLine = reqFile || "None";
  const posDocs = runtime.posDocs || {};
  const releasedList = fs.existsSync(releasedDir)
    ? fs.readdirSync(releasedDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
    : [];
  const releasedListText = releasedList.length > 0
    ? releasedList.map((item) => `- ${item}`).join("\n")
    : "- none";
  const productVisionList = productVisionFiles.length > 0
    ? productVisionFiles.map((item) => `- ${path.basename(item)}`).join("\n")
    : "- none";
  const context = `# Context\nPO mode: ${mode}\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nBacklog dir: ${backlogDir}\nRefinement dir: ${refinementDir}\nSelected dir: ${selectedDir}\nArch dir: ${archDir}\nReleased dir: ${releasedDir}\nReleased files:\n${releasedListText}\nTo-clarify dir: ${toClarifyDir}\nHuman-input dir: ${humanInputDir}\nHuman-decision-needed dir: ${humanDecisionNeededDir}\nDocs dir: ${docsDir}\nProduct vision dir: ${productVisionDir || "missing"}\nProduct vision files:\n${productVisionList}\nProduct vision priority: Product Vision files override other docs on conflict.\nVision file: ${posDocs.vision || "missing"}\nBlueprint file: ${posDocs.blueprint || "missing"}\nEpic matrix file: ${posDocs.epicMatrix || "missing"}\nNot-building file: ${posDocs.notBuilding || "missing"}\nVision achieved file: ${posDocs.visionAchieved || "missing"}\nVision decision file: ${visionDecisionFile}\nDev routing mode: ${runtime.devRouting.mode}\nDefault implementation scope: ${runtime.devRouting.defaultScope}\nAllowed implementation_scope values: frontend | backend | fullstack\nEnabled dev agents: fe=${runtime.devAgents.useFe}, be=${runtime.devAgents.useBe}, fs=${runtime.devAgents.useFs}\n`;
  const fullPrompt = `${prompt}\n\n${context}`;

  const configArgs = readConfigArgs(runtime.resolveAgentCodexConfigPath("PO"));

  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto,
    threadKey: `mode-${mode}`,
  });
  let threadId = readThreadId(threadFile);

  if (!auto) {
    await startInteractiveCodexAgent({
      agentLabel: "PO",
      repoRoot,
      configArgs,
      threadFile,
      agentsRoot: runtime.agentsRoot,
      bootstrapPrompt: fullPrompt,
      threadId,
      runtime,
      autoMode: false,
    });
    process.exit(0);
  }

  const result = await runCodexExec({
    prompt: fullPrompt,
    repoRoot,
    configArgs,
    threadId,
    threadFile,
    agentsRoot: runtime.agentsRoot,
    agentLabel: "PO",
    autoCompact: auto,
    runtime,
    autoMode: auto,
  });

  if (result.threadId) {
    writeThreadId(threadFile, result.threadId);
    console.log(`PO: thread saved ${result.threadId}`);
  } else {
    console.log("PO: warning - no session id found");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
