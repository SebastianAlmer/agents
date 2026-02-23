#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  readConfigArgs,
  readThreadId,
  writeThreadId,
  getThreadFilePath,
  runCodexExec,
  startInteractiveCodexAgent,
} = require("../lib/agent");
const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");

function parseArgs(argv) {
  const args = {
    help: false,
    auto: false,
    postDeploy: false,
    decisionFile: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i] || "");
    const normalized = raw.toLowerCase();
    if (normalized === "--auto" || normalized === "-auto") {
      args.auto = true;
      continue;
    }
    if (normalized === "--help" || normalized === "-h") {
      args.help = true;
      continue;
    }
    if (normalized === "--post-deploy" || normalized === "-post-deploy") {
      args.postDeploy = true;
      continue;
    }
    if (normalized === "--decision-file" || normalized === "-decision-file") {
      args.decisionFile = argv[i + 1] || "";
      i++;
      continue;
    }
    if (normalized.startsWith("--decision-file=")) {
      args.decisionFile = String(raw.split("=", 2)[1] || "");
      continue;
    }
  }
  return args;
}

function usage() {
  console.log(
    "Usage: node maint/maint.js [--auto] [--post-deploy] [--decision-file /abs/path.json]"
  );
}

function validateDecisionFile(decisionFile) {
  if (!decisionFile) {
    throw new Error("MAINT requires --decision-file in auto mode");
  }
  if (!fs.existsSync(decisionFile)) {
    throw new Error(`MAINT decision file missing: ${decisionFile}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(decisionFile, "utf8"));
  } catch (err) {
    throw new Error(`MAINT decision file invalid JSON: ${err.message}`);
  }

  const status = String(parsed.status || "").toLowerCase();
  if (!["pass", "fail"].includes(status)) {
    throw new Error(`MAINT decision has invalid status: ${status || "<empty>"}`);
  }
  const summary = String(parsed.summary || "").trim();
  if (!summary) {
    throw new Error("MAINT decision requires non-empty summary");
  }
  if (!Array.isArray(parsed.findings)) {
    throw new Error("MAINT decision requires findings array");
  }
  if (!Array.isArray(parsed.blocking_findings)) {
    throw new Error("MAINT decision requires blocking_findings array");
  }
  if (!Array.isArray(parsed.manual_uat)) {
    throw new Error("MAINT decision requires manual_uat array");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  if (process.env.CODEX_FLOW_AUTO === "1") {
    args.auto = true;
  }

  const agentRoot = __dirname;
  const runtime = loadRuntimeConfig(path.resolve(agentRoot, ".."));
  ensureQueueDirs(runtime.queues);

  const repoRoot = runtime.repoRoot;
  const docsDir = runtime.docsDir;
  const requirementsRoot = runtime.requirementsRoot;
  const releasedDir = runtime.queues.released;
  const selectedDir = runtime.queues.selected;
  const backlogDir = runtime.queues.backlog;
  const decisionNeededDir = runtime.queues.humanDecisionNeeded;
  const decisionFile = args.decisionFile || "";

  console.log(`MAINT: post-deploy ${args.postDeploy}`);
  console.log(`MAINT: released dir ${releasedDir}`);
  console.log(`MAINT: selected dir ${selectedDir}`);
  console.log(`MAINT: backlog dir ${backlogDir}`);
  console.log(`MAINT: human-decision-needed dir ${decisionNeededDir}`);

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const context = [
    "# Context",
    `Repository root: ${repoRoot}`,
    `Requirements root: ${requirementsRoot}`,
    `Post deploy: ${args.postDeploy}`,
    `Released dir: ${releasedDir}`,
    `Selected dir: ${selectedDir}`,
    `Backlog dir: ${backlogDir}`,
    `Human-decision-needed dir: ${decisionNeededDir}`,
    `Docs dir: ${docsDir}`,
    `Decision file: ${decisionFile || "None"}`,
  ].join("\n");
  const fullPrompt = `${prompt}\n\n${context}\n`;

  const configArgs = readConfigArgs(runtime.resolveAgentCodexConfigPath("MAINT"));
  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto: args.auto,
    threadKey: args.postDeploy ? "post-deploy" : "",
  });
  const threadId = readThreadId(threadFile);

  if (!args.auto) {
    await startInteractiveCodexAgent({
      agentLabel: "MAINT",
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
    agentLabel: "MAINT",
    autoCompact: true,
    runtime,
    autoMode: args.auto,
  });

  validateDecisionFile(decisionFile);

  if (result.threadId) {
    writeThreadId(threadFile, result.threadId);
    console.log(`MAINT: thread saved ${result.threadId}`);
  } else {
    console.log("MAINT: warning - no session id found");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
