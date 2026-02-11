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
  runCodexExecFiltered,
  runCodexExec,
  readInputWithHotkeys,
} = require("../lib/agent");
const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");

function parseArgs(argv) {
  const args = { requirement: "", auto: false, finalPass: false, gateFile: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const normalized = arg.toLowerCase();
    if (normalized === "-auto" || normalized === "--auto") {
      args.auto = true;
      continue;
    }
    if (normalized === "--final-pass" || normalized === "-final-pass") {
      args.finalPass = true;
      continue;
    }
    if (normalized === "--gate-file" || normalized === "-gate-file") {
      args.gateFile = argv[i + 1] || "";
      i++;
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

function validateGateFile(gateFile) {
  if (!gateFile) {
    return;
  }
  if (!fs.existsSync(gateFile)) {
    throw new Error(`QA final gate file missing: ${gateFile}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(gateFile, "utf8"));
  } catch (err) {
    throw new Error(`QA final gate file invalid JSON: ${err.message}`);
  }
  const status = String(parsed.status || "").toLowerCase();
  if (!["pass", "fail"].includes(status)) {
    throw new Error(`QA final gate file has invalid status: ${status || "<empty>"}`);
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (process.env.CODEX_FLOW_AUTO === "1") {
    parsed.auto = true;
  }
  const { requirement, auto, finalPass, gateFile } = parsed;

  const agentRoot = __dirname;
  const runtime = loadRuntimeConfig(path.resolve(agentRoot, ".."));
  ensureQueueDirs(runtime.queues);

  const repoRoot = runtime.repoRoot;
  const docsDir = runtime.docsDir;
  const qaDir = runtime.queues.qa;
  const secDir = runtime.queues.sec;
  const clarifyDir = runtime.queues.toClarify;
  const blockedDir = runtime.queues.blocked;
  const releasedDir = runtime.queues.released;

  let reqFile = "";
  if (!finalPass) {
    console.log(`QA: scan qa ${qaDir}`);
    if (requirement) {
      const reqPath = path.isAbsolute(requirement)
        ? requirement
        : path.join(qaDir, requirement);
      if (!fs.existsSync(reqPath)) {
        throw new Error(`Requirement not found: ${reqPath}`);
      }
      reqFile = reqPath;
    } else {
      const firstFile = getFirstFile(qaDir);
      if (!firstFile) {
        console.log("QA: qa queue empty");
        if (auto) {
          process.exit(0);
        }
      } else {
        reqFile = firstFile;
      }
    }
  } else {
    console.log(`QA: final pass over released ${releasedDir}`);
  }

  if (reqFile) {
    console.log(`QA: using ${reqFile}`);
  }
  console.log(`QA: sec dir ${secDir}`);
  console.log(`QA: to-clarify dir ${clarifyDir}`);
  console.log(`QA: blocked dir ${blockedDir}`);

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const mandatoryChecks = runtime.qa.mandatoryChecks || [];
  const checksText = mandatoryChecks
    .map((check, idx) => `${idx + 1}) ${check}`)
    .join("\n") || "none configured (set [qa].mandatory_checks in config.local.toml)";

  const reqLine = reqFile || "None";
  const gateLine = gateFile ? gateFile : "None";
  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nFinal pass: ${finalPass}\nQA dir: ${qaDir}\nSec dir: ${secDir}\nTo-clarify dir: ${clarifyDir}\nBlocked dir: ${blockedDir}\nReleased dir: ${releasedDir}\nDocs dir: ${docsDir}\nFinal gate file: ${gateLine}\nMandatory QA checks (run in order where applicable):\n${checksText}\n`;
  const fullPrompt = `${prompt}\n\n${context}`;

  const configArgs = readConfigArgs(runtime.codexConfigPath);

  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto,
  });
  let threadId = readThreadId(threadFile);

  if (!auto) {
    const verbose = { value: false };
    const detail = { value: false };
    console.log("QA: chat mode (Alt+V verbose, Alt+D detail, q to quit)");
    while (true) {
      const msg = await readInputWithHotkeys({
        prompt: "QA> ",
        verboseRef: verbose,
        detailRef: detail,
      });
      if (!msg) {
        continue;
      }
      const trimmed = msg.trim().toLowerCase();
      if (["q", "quit", "exit"].includes(trimmed)) {
        break;
      }
      const promptToSend = threadId
        ? `${context}\n\nUser: ${msg}`
        : `${prompt}\n\n${context}\n\nUser: ${msg}`;
      const result = await runCodexExecFiltered({
        prompt: promptToSend,
        repoRoot,
        configArgs,
        threadId,
        verboseRef: verbose,
        threadFile,
        agentsRoot: runtime.agentsRoot,
        agentLabel: "QA",
        autoCompact: auto,
      });
      if (result.threadId) {
        writeThreadId(threadFile, result.threadId);
        threadId = result.threadId;
      }
    }
    process.exit(0);
  }

  const result = await runCodexExec({
    prompt: fullPrompt,
    repoRoot,
    configArgs,
    threadId,
    threadFile,
    agentsRoot: runtime.agentsRoot,
    agentLabel: "QA",
    autoCompact: auto,
  });

  if (finalPass) {
    validateGateFile(gateFile);
  }

  if (result.threadId) {
    writeThreadId(threadFile, result.threadId);
    console.log(`QA: thread saved ${result.threadId}`);
  } else {
    console.log("QA: warning - no session id found");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
