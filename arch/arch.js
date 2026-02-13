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
const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");

function parseArgs(argv) {
  const args = { requirement: "", auto: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const normalized = arg.toLowerCase();
    if (normalized === "-auto" || normalized === "--auto") {
      args.auto = true;
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

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (process.env.CODEX_FLOW_AUTO === "1") {
    parsed.auto = true;
  }
  const { requirement, auto } = parsed;

  const agentRoot = __dirname;
  const runtime = loadRuntimeConfig(path.resolve(agentRoot, ".."));
  ensureQueueDirs(runtime.queues);

  const repoRoot = runtime.repoRoot;
  const docsDir = runtime.docsDir;
  const productVisionDir = runtime.productVisionDir || "";
  const productVisionFiles = Array.isArray(runtime.productVisionFiles) ? runtime.productVisionFiles : [];
  const archDir = runtime.queues.arch;
  const devDir = runtime.queues.dev;
  const clarifyDir = runtime.queues.toClarify;
  const posDocs = runtime.posDocs || {};

  console.log(`ARCH: scan arch ${archDir}`);

  let reqFile = "";
  if (requirement) {
    const reqPath = path.isAbsolute(requirement)
      ? requirement
      : path.join(archDir, requirement);
    if (!fs.existsSync(reqPath)) {
      throw new Error(`Requirement not found: ${reqPath}`);
    }
    reqFile = reqPath;
  } else {
    const firstFile = getFirstFile(archDir);
    if (!firstFile) {
      console.log("ARCH: arch queue empty");
      if (auto) {
        process.exit(0);
      }
    } else {
      reqFile = firstFile;
    }
  }

  if (reqFile) {
    console.log(`ARCH: using ${reqFile}`);
  }
  console.log(`ARCH: dev dir ${devDir}`);
  console.log(`ARCH: to-clarify dir ${clarifyDir}`);

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const reqLine = reqFile || "None";
  const productVisionList = productVisionFiles.length > 0
    ? productVisionFiles.map((filePath) => `- ${path.basename(filePath)}`).join("\n")
    : "- none";
  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nArch dir: ${archDir}\nDev dir: ${devDir}\nTo-clarify dir: ${clarifyDir}\nDocs dir: ${docsDir}\nProduct vision dir: ${productVisionDir || "missing"}\nProduct vision files:\n${productVisionList}\nProduct vision priority: Product Vision files override other docs on conflict.\nVision file: ${posDocs.vision || "missing"}\nBlueprint file: ${posDocs.blueprint || "missing"}\nEpic matrix file: ${posDocs.epicMatrix || "missing"}\nNot-building file: ${posDocs.notBuilding || "missing"}\nVision achieved file: ${posDocs.visionAchieved || "missing"}\n`;
  const fullPrompt = `${prompt}\n\n${context}`;

  const configArgs = readConfigArgs(runtime.resolveAgentCodexConfigPath("ARCH"));

  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto,
  });
  let threadId = readThreadId(threadFile);

  if (!auto) {
    await startInteractiveCodexAgent({
      agentLabel: "ARCH",
      repoRoot,
      configArgs,
      threadFile,
      agentsRoot: runtime.agentsRoot,
      bootstrapPrompt: fullPrompt,
      threadId,
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
    agentLabel: "ARCH",
    autoCompact: auto,
  });

  if (result.threadId) {
    writeThreadId(threadFile, result.threadId);
    console.log(`ARCH: thread saved ${result.threadId}`);
  } else {
    console.log("ARCH: warning - no session id found");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
