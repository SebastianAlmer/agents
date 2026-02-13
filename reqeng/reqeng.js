#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  getFirstFile,
  readConfigArgs,
  readThreadId,
  getThreadFilePath,
  startInteractiveCodexAgent,
} = require("../lib/agent");
const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");

function parseArgs(argv) {
  const args = { requirement: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const normalized = arg.toLowerCase();
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
  const { requirement } = parseArgs(process.argv.slice(2));

  const agentRoot = __dirname;
  const runtime = loadRuntimeConfig(path.resolve(agentRoot, ".."));
  ensureQueueDirs(runtime.queues);

  const repoRoot = runtime.repoRoot;
  const requirementsRoot = runtime.requirementsRoot;
  const docsDir = runtime.docsDir;
  const refinementDir = runtime.queues.refinement;
  const backlogDir = runtime.queues.backlog;
  const selectedDir = runtime.queues.selected;
  const clarifyDir = runtime.queues.toClarify;

  let reqPath = findRequirement(requirementsRoot, repoRoot, requirement);
  if (!reqPath && !requirement) {
    const clarifyCandidate = getFirstFile(clarifyDir);
    if (clarifyCandidate) {
      reqPath = clarifyCandidate;
      console.log(`REQENG: picked from to-clarify ${reqPath}`);
    }
  }

  if (requirement && (!reqPath || !fs.existsSync(reqPath))) {
    throw new Error(`Requirement not found: ${requirement}`);
  }

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const reqPathLine = reqPath || "None";
  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqPathLine}\nRequirements root: ${requirementsRoot}\nRefinement dir: ${refinementDir}\nBacklog dir: ${backlogDir}\nSelected dir: ${selectedDir}\nTo-clarify dir: ${clarifyDir}\nDocs dir: ${docsDir}\nReqEng routing policy (outside run.js):\n- unclear/incomplete/conflicting -> refinement (status refinement)\n- clear but not immediate -> backlog (status backlog)\n- clear and immediate -> selected (status selected)\n- if input is from to-clarify: discuss and move to refinement/backlog/selected\n- never route ReqEng output to arch/dev/qa/sec/ux/deploy/released/to-clarify/wont-do\n`;
  const fullPrompt = `${prompt}\n\n${context}`;

  const configArgs = readConfigArgs(runtime.resolveAgentCodexConfigPath("REQENG"));
  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto: false,
  });
  const threadId = readThreadId(threadFile);

  if (threadId && requirement) {
    console.log("REQENG: existing thread found, --requirement is only used for first bootstrap");
  }

  console.log(`REQENG: refinement dir ${refinementDir}`);
  console.log(`REQENG: backlog dir ${backlogDir}`);
  console.log(`REQENG: selected dir ${selectedDir}`);
  console.log(`REQENG: to-clarify dir ${clarifyDir}`);

  await startInteractiveCodexAgent({
    agentLabel: "REQENG",
    repoRoot,
    configArgs,
    threadFile,
    agentsRoot: runtime.agentsRoot,
    bootstrapPrompt: fullPrompt,
    threadId,
  });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
