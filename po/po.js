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
  const selectedDir = runtime.queues.selected;
  const archDir = runtime.queues.arch;
  const clarifyDir = runtime.queues.toClarify;

  console.log(`PO: scan selected ${selectedDir}`);

  let reqFile = "";
  if (requirement) {
    const reqPath = path.isAbsolute(requirement)
      ? requirement
      : path.join(selectedDir, requirement);
    if (!fs.existsSync(reqPath)) {
      throw new Error(`Requirement not found: ${reqPath}`);
    }
    reqFile = reqPath;
  } else {
    const firstFile = getFirstFile(selectedDir);
    if (!firstFile) {
      console.log("PO: selected empty");
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
  console.log(`PO: arch dir ${archDir}`);
  console.log(`PO: clarify dir ${clarifyDir}`);

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const reqLine = reqFile || "None";
  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nSelected dir: ${selectedDir}\nArch dir: ${archDir}\nTo-clarify dir: ${clarifyDir}\nDocs dir: ${docsDir}\nDev routing mode: ${runtime.devRouting.mode}\nDefault implementation scope: ${runtime.devRouting.defaultScope}\nAllowed implementation_scope values: frontend | backend | fullstack\nEnabled dev agents: fe=${runtime.devAgents.useFe}, be=${runtime.devAgents.useBe}, fs=${runtime.devAgents.useFs}\n`;
  const fullPrompt = `${prompt}\n\n${context}`;

  const configArgs = readConfigArgs(runtime.resolveAgentCodexConfigPath("PO"));

  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto,
  });
  let threadId = readThreadId(threadFile);

  if (!auto) {
    const verbose = { value: false };
    const detail = { value: false };
    console.log("PO: chat mode (Alt+V verbose, Alt+D detail, q to quit)");
    while (true) {
      const msg = await readInputWithHotkeys({
        prompt: "PO> ",
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
        agentLabel: "PO",
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
    agentLabel: "PO",
    autoCompact: auto,
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
