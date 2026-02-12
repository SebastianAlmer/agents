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

function deriveRequirementThreadKey({ reqFile, targetScope }) {
  if (!reqFile) {
    return "";
  }
  const base = path.basename(reqFile, path.extname(reqFile));
  if (!base) {
    return "";
  }
  const scope = String(targetScope || "dev").toLowerCase();
  return scope + "-" + base;
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
  const clarifyDir = runtime.queues.toClarify;

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
  console.log(`${agentLabel}: to-clarify dir ${clarifyDir}`);

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const reqLine = reqFile || "None";
  const stableContext = [
    "# Stable Implementation Context",
    "- Docs are binding source of truth for behavior and constraints.",
    "- Implement only the requirement scope plus mandatory doc constraints.",
    "- Respect sections if present: Goal, Scope, Task Outline, Acceptance Criteria, Architecture Notes, Implementation Guardrails, Risks & Tradeoffs.",
    "- Prefer existing project patterns; avoid broad refactors not required by scope.",
    "- If critical information is missing or contradictory, stop and route to to-clarify with concrete questions.",
    "- Before moving to QA, run relevant checks and report exact commands/results in Dev Results.",
  ].join("\n");
  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nDev queue dir: ${devDir}\nQA dir: ${qaDir}\nTo-clarify dir: ${clarifyDir}\nDocs dir: ${docsDir}\nDev agent: ${promptLabel}\nTarget implementation scope: ${targetScope}\nDev routing mode: ${runtime.devRouting.mode}\n`;
  const fullPrompt = `${prompt}\n\n${stableContext}\n\n${context}`;

  const configArgs = readConfigArgs(runtime.codexConfigPath);

  const threadKey = auto ? deriveRequirementThreadKey({ reqFile, targetScope }) : "";
  if (threadKey) {
    console.log(`${agentLabel}: thread isolation key ${threadKey}`);
  }

  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto,
    threadKey,
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
        ? `${stableContext}\n\n${context}\n\nUser: ${msg}`
        : `${prompt}\n\n${stableContext}\n\n${context}\n\nUser: ${msg}`;
      const result = await runCodexExecFiltered({
        prompt: promptToSend,
        repoRoot,
        configArgs,
        threadId,
        verboseRef: verbose,
        threadFile,
        agentsRoot: runtime.agentsRoot,
        agentLabel,
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
    agentLabel,
    autoCompact: auto,
  });

  if (result.threadId) {
    writeThreadId(threadFile, result.threadId);
    console.log(`${agentLabel}: thread saved ${result.threadId}`);
  } else {
    console.log(`${agentLabel}: warning - no session id found`);
  }
}

module.exports = {
  runDevAgent,
};
