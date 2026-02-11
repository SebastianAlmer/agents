#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  readConfigArgs,
  readThreadId,
  writeThreadId,
  getThreadFilePath,
  getLatestSessionId,
  runCodexExecFiltered,
  readInputWithHotkeys,
} = require("../lib/agent");
const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");

function parseArgs(argv) {
  const args = { requirement: "", once: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const normalized = arg.toLowerCase();
    if (normalized === "-once" || normalized === "--once") {
      args.once = true;
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

function findRequirement(requirementsRoot, repoRoot, requirement) {
  if (!requirement) {
    return "";
  }
  if (path.isAbsolute(requirement)) {
    return requirement;
  }
  const candidateRepo = path.join(repoRoot, requirement);
  if (fs.existsSync(candidateRepo)) {
    return candidateRepo;
  }
  const candidateReq = path.join(requirementsRoot, requirement);
  if (fs.existsSync(candidateReq)) {
    return candidateReq;
  }

  const target = requirement.toLowerCase();
  const stack = [requirementsRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === target) {
        return fullPath;
      }
    }
  }

  return "";
}

async function main() {
  const { requirement, once } = parseArgs(process.argv.slice(2));

  const agentRoot = __dirname;
  const runtime = loadRuntimeConfig(path.resolve(agentRoot, ".."));
  ensureQueueDirs(runtime.queues);

  const repoRoot = runtime.repoRoot;
  const requirementsRoot = runtime.requirementsRoot;
  const docsDir = runtime.docsDir;

  const refinementDir = runtime.queues.refinement;
  const backlogDir = runtime.queues.backlog;
  const selectedDir = runtime.queues.selected;

  let reqPath = findRequirement(requirementsRoot, repoRoot, requirement);
  if (reqPath && !fs.existsSync(reqPath)) {
    console.log(`REQENG: requirement not found ${reqPath}`);
    reqPath = "";
  }

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const reqPathLine = reqPath || "None";
  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqPathLine}\nRequirements root: ${requirementsRoot}\nRefinement dir: ${refinementDir}\nBacklog dir: ${backlogDir}\nSelected dir: ${selectedDir}\nDocs dir: ${docsDir}\nReqEng routing policy (outside run.js):\n- unclear/incomplete/conflicting -> refinement (status refinement)\n- clear but not immediate -> backlog (status backlog)\n- clear and immediate -> selected (status selected)\n- never route ReqEng output to arch/dev/qa/sec/ux/deploy/released/to-clarify/blocked queues\n`;

  const configArgs = readConfigArgs(runtime.codexConfigPath);

  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto: false,
  });
  let threadId = readThreadId(threadFile);

  async function runReqEng(message) {
    const start = new Date();
    const fullPrompt = threadId
      ? `${context}\n\nUser: ${message}`
      : `${prompt}\n\n${context}\n\nUser: ${message}`;

    console.log("REQENG: running");
    const verbose = { value: false };
    await runCodexExecFiltered({
      prompt: fullPrompt,
      repoRoot,
      configArgs,
      threadId,
      verboseRef: verbose,
    });

    const latestId = getLatestSessionId({ since: start, cwd: repoRoot });
    if (latestId) {
      writeThreadId(threadFile, latestId);
      console.log(`REQENG: thread saved ${latestId}`);
      threadId = latestId;
    } else {
      console.log("REQENG: warning - no session id found");
    }
  }

  console.log("REQENG: ready");
  if (reqPath) {
    console.log(`REQENG: requirement ${reqPath}`);
  }
  console.log(`REQENG: refinement dir ${refinementDir}`);
  console.log(`REQENG: backlog dir ${backlogDir}`);
  console.log(`REQENG: selected dir ${selectedDir}`);

  const verbose = { value: false };
  const detail = { value: false };

  if (once) {
    const msg = await readInputWithHotkeys({
      prompt: "REQENG> ",
      verboseRef: verbose,
      detailRef: detail,
    });
    if (msg) {
      await runReqEng(msg);
    }
    process.exit(0);
  }

  while (true) {
    const msg = await readInputWithHotkeys({
      prompt: "REQENG> ",
      verboseRef: verbose,
      detailRef: detail,
    });
    if (!msg) {
      break;
    }
    const trimmed = msg.trim().toLowerCase();
    if (["exit", "quit", "q"].includes(trimmed)) {
      break;
    }
    await runReqEng(msg);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
