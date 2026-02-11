"use strict";

const fs = require("fs");
const path = require("path");
const {
  getFirstFile,
  readConfigArgs,
  readThreadId,
  writeThreadId,
  getThreadFilePath,
  getLatestSessionId,
  runCodexExecFiltered,
  runCodexExec,
  readInputWithHotkeys,
} = require("./agent");
const { loadRuntimeConfig, ensureQueueDirs } = require("./runtime");

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

async function runDevAgent({ agentRoot, agentLabel, promptLabel, targetScope }) {
  const parsed = parseArgs(process.argv.slice(2));
  if (process.env.CODEX_FLOW_AUTO === "1") {
    parsed.auto = true;
  }
  const { requirement, auto } = parsed;

  const runtime = loadRuntimeConfig(path.resolve(agentRoot, ".."));
  ensureQueueDirs(runtime.queues);

  const repoRoot = runtime.repoRoot;
  const docsDir = runtime.docsDir;
  const devDir = runtime.queues.dev;
  const qaDir = runtime.queues.qa;
  const blockedDir = runtime.queues.blocked;

  console.log(`${agentLabel}: scan dev ${devDir}`);

  let reqFile = "";
  if (requirement) {
    const reqPath = path.isAbsolute(requirement)
      ? requirement
      : path.join(devDir, requirement);
    if (!fs.existsSync(reqPath)) {
      throw new Error(`Requirement not found: ${reqPath}`);
    }
    reqFile = reqPath;
  } else {
    const firstFile = getFirstFile(devDir);
    if (!firstFile) {
      console.log(`${agentLabel}: dev queue empty`);
      if (auto) {
        process.exit(0);
      }
    } else {
      reqFile = firstFile;
    }
  }

  if (reqFile) {
    console.log(`${agentLabel}: using ${reqFile}`);
  }
  console.log(`${agentLabel}: qa dir ${qaDir}`);
  console.log(`${agentLabel}: blocked dir ${blockedDir}`);

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const reqLine = reqFile || "None";
  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nDev queue dir: ${devDir}\nQA dir: ${qaDir}\nBlocked dir: ${blockedDir}\nDocs dir: ${docsDir}\nDev agent: ${promptLabel}\nTarget implementation scope: ${targetScope}\nDev routing mode: ${runtime.devRouting.mode}\n`;
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
    console.log(`${agentLabel}: chat mode (Alt+V verbose, Alt+D detail, q to quit)`);
    while (true) {
      const msg = await readInputWithHotkeys({
        prompt: `${agentLabel}> `,
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
      const start = new Date();
      await runCodexExecFiltered({
        prompt: promptToSend,
        repoRoot,
        configArgs,
        threadId,
        verboseRef: verbose,
      });
      const latestId = getLatestSessionId({ since: start, cwd: repoRoot });
      if (latestId) {
        writeThreadId(threadFile, latestId);
        threadId = latestId;
      }
    }
    process.exit(0);
  }

  const start = new Date();
  await runCodexExec({ prompt: fullPrompt, repoRoot, configArgs, threadId });

  const latestId = getLatestSessionId({ since: start, cwd: repoRoot });
  if (latestId) {
    writeThreadId(threadFile, latestId);
    console.log(`${agentLabel}: thread saved ${latestId}`);
  } else {
    console.log(`${agentLabel}: warning - no session id found`);
  }
}

module.exports = {
  runDevAgent,
};
