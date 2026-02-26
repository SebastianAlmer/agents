#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  getFirstFile,
  readConfigArgs,
  readThreadId,
  writeThreadId,
  getThreadFilePath,
  runCodexExec,
  startInteractiveCodexAgent,
} = require("../lib/agent");
const { installTimestampedConsole } = require("../lib/logging");
const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");

installTimestampedConsole();

function parseArgs(argv) {
  const args = {
    requirement: "",
    auto: false,
    gateFile: "",
    batch: false,
    fullRegression: false,
    sourceQueue: "deploy",
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i] || "");
    const normalized = raw.toLowerCase();
    if (normalized === "-auto" || normalized === "--auto") {
      args.auto = true;
      continue;
    }
    if (normalized === "--gate-file" || normalized === "-gate-file") {
      args.gateFile = argv[i + 1] || "";
      i++;
      continue;
    }
    if (normalized === "--batch" || normalized === "-batch") {
      args.batch = true;
      continue;
    }
    if (normalized === "--full-regression" || normalized === "-full-regression") {
      args.fullRegression = true;
      continue;
    }
    if (normalized === "--source-queue" || normalized === "-source-queue") {
      args.sourceQueue = String(argv[i + 1] || "deploy").toLowerCase();
      i++;
      continue;
    }
    if (normalized.startsWith("--source-queue=")) {
      args.sourceQueue = String(raw.split("=", 2)[1] || "deploy").toLowerCase();
      continue;
    }
    if (normalized === "-requirement" || normalized === "--requirement") {
      args.requirement = argv[i + 1] || "";
      i++;
      continue;
    }
  }
  return args;
}

function listRequirementFiles(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function resolveRequirementPath(requirement, candidateDirs) {
  if (!requirement) {
    return "";
  }
  if (path.isAbsolute(requirement)) {
    return requirement;
  }
  for (const dir of candidateDirs) {
    const candidate = path.join(dir, requirement);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(candidateDirs[0], requirement);
}

function normalizeSourceQueue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["qa", "deploy", "released"].includes(normalized)) {
    return normalized;
  }
  return "deploy";
}

function validateGateFile(gateFile, label) {
  if (!gateFile) {
    throw new Error(`UAT ${label} requires --gate-file`);
  }
  if (!fs.existsSync(gateFile)) {
    throw new Error(`UAT ${label} gate file missing: ${gateFile}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(gateFile, "utf8"));
  } catch (err) {
    throw new Error(`UAT ${label} gate file invalid JSON: ${err.message}`);
  }
  const status = String(parsed.status || "").toLowerCase();
  if (!["pass", "fail"].includes(status)) {
    throw new Error(`UAT ${label} gate file has invalid status: ${status || "<empty>"}`);
  }
  const summary = String(parsed.summary || "").trim();
  if (!summary) {
    throw new Error(`UAT ${label} gate file requires non-empty summary`);
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (process.env.CODEX_FLOW_AUTO === "1") {
    parsed.auto = true;
  }

  const {
    requirement,
    auto,
    gateFile,
    batch,
    fullRegression,
    sourceQueue,
  } = parsed;

  if (fullRegression && requirement) {
    throw new Error("UAT --full-regression cannot be combined with --requirement");
  }

  const agentRoot = __dirname;
  const runtime = loadRuntimeConfig(path.resolve(agentRoot, ".."));
  ensureQueueDirs(runtime.queues);

  const repoRoot = runtime.repoRoot;
  const docsDir = runtime.docsDir;
  const qaDir = runtime.queues.qa;
  const deployDir = runtime.queues.deploy;
  const releasedDir = runtime.queues.released;
  const decisionNeededDir = runtime.queues.humanDecisionNeeded;
  const toClarifyDir = runtime.queues.toClarify;

  const queueName = normalizeSourceQueue(sourceQueue);
  const queueDir = queueName === "qa"
    ? qaDir
    : queueName === "released"
      ? releasedDir
      : deployDir;

  let reqFile = "";
  let queueTargets = [];
  if (!fullRegression) {
    if (batch) {
      queueTargets = listRequirementFiles(queueDir);
      console.log(`UAT: scan ${queueName} ${queueDir}`);
      if (requirement) {
        const reqPath = resolveRequirementPath(requirement, [queueDir, deployDir, qaDir, releasedDir]);
        if (!fs.existsSync(reqPath)) {
          throw new Error(`Requirement not found: ${reqPath}`);
        }
        reqFile = reqPath;
      } else if (queueTargets.length > 0) {
        reqFile = queueTargets[0];
      } else {
        console.log(`UAT: ${queueName} queue empty`);
        if (auto) {
          process.exit(0);
        }
      }
    } else if (requirement) {
      const reqPath = resolveRequirementPath(requirement, [queueDir, deployDir, qaDir, releasedDir]);
      if (!fs.existsSync(reqPath)) {
        throw new Error(`Requirement not found: ${reqPath}`);
      }
      reqFile = reqPath;
    } else {
      reqFile = getFirstFile(queueDir) || "";
      if (!reqFile) {
        console.log(`UAT: ${queueName} queue empty`);
        if (auto) {
          process.exit(0);
        }
      }
    }
  } else {
    queueTargets = listRequirementFiles(releasedDir);
    console.log(`UAT: full regression over released ${releasedDir}`);
  }

  if (reqFile) {
    console.log(`UAT: using ${reqFile}`);
  }
  console.log(`UAT: batch ${batch}`);
  console.log(`UAT: full-regression ${fullRegression}`);
  console.log(`UAT: source queue ${queueName}`);
  console.log(`UAT: to-clarify dir ${toClarifyDir}`);
  console.log(`UAT: human-decision-needed dir ${decisionNeededDir}`);

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const reqLine = reqFile || "None";
  const gateLine = gateFile || "None";
  const queueList = queueTargets.length > 0
    ? queueTargets.map((item) => `- ${path.basename(item)}`).join("\n")
    : "- None";
  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nBatch mode: ${batch}\nFull regression: ${fullRegression}\nUAT source queue: ${queueName}\nUAT source dir: ${queueDir}\nQA dir: ${qaDir}\nDeploy dir: ${deployDir}\nReleased dir: ${releasedDir}\nTo-clarify dir: ${toClarifyDir}\nHuman-decision-needed dir: ${decisionNeededDir}\nDocs dir: ${docsDir}\nFinal gate file: ${gateLine}\nUAT source queue files:\n${queueList}\n`;
  const fullPrompt = `${prompt}\n\n${context}`;

  const configArgs = readConfigArgs(runtime.resolveAgentCodexConfigPath("UAT"));

  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto,
    threadKey: fullRegression ? "full-regression" : "",
  });
  let threadId = readThreadId(threadFile);

  if (!auto) {
    await startInteractiveCodexAgent({
      agentLabel: "UAT",
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
    agentLabel: "UAT",
    autoCompact: auto,
    runtime,
    autoMode: auto,
  });

  if (batch || fullRegression) {
    validateGateFile(gateFile, batch ? "batch" : "full-regression");
  }

  if (result.threadId) {
    writeThreadId(threadFile, result.threadId);
    console.log(`UAT: thread saved ${result.threadId}`);
  } else {
    console.log("UAT: warning - no session id found");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
