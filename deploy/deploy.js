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
  const args = { requirement: "", auto: false, finalPass: false, batch: false };
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
    if (normalized === "--batch" || normalized === "-batch") {
      args.batch = true;
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

function parseFrontMatter(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return {};
  }

  const map = {};
  const lines = match[1].split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const idx = trimmed.indexOf(":");
    if (idx === -1) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim().toLowerCase().replace(/-/g, "_");
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function normalizeScope(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["frontend", "fe", "ui"].includes(normalized)) {
    return "frontend";
  }
  if (["backend", "be", "api", "server"].includes(normalized)) {
    return "backend";
  }
  if (["fullstack", "fs", "full-stack", "full_stack"].includes(normalized)) {
    return "fullstack";
  }
  return "";
}

function summarizeScopes(files) {
  const summary = {
    frontend: 0,
    backend: 0,
    fullstack: 0,
    unknown: 0,
  };
  for (const file of files) {
    const fm = parseFrontMatter(file);
    const scope = normalizeScope(fm.implementation_scope || fm.dev_scope || fm.scope || "");
    if (!scope) {
      summary.unknown += 1;
      continue;
    }
    summary[scope] += 1;
  }
  return summary;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (process.env.CODEX_FLOW_AUTO === "1") {
    parsed.auto = true;
  }
  const { requirement, auto, finalPass, batch } = parsed;

  const agentRoot = __dirname;
  const runtime = loadRuntimeConfig(path.resolve(agentRoot, ".."));
  ensureQueueDirs(runtime.queues);

  const repoRoot = runtime.repoRoot;
  const docsDir = runtime.docsDir;
  const deployDir = runtime.queues.deploy;
  const releasedDir = runtime.queues.released;

  let reqFile = "";
  let deployFiles = [];
  if (!finalPass) {
    console.log(`DEPLOY: scan deploy ${deployDir}`);
    deployFiles = listRequirementFiles(deployDir);

    if (batch) {
      if (deployFiles.length === 0) {
        console.log("DEPLOY: deploy queue empty");
        if (auto) {
          process.exit(0);
        }
      }

      if (requirement) {
        const reqPath = path.isAbsolute(requirement)
          ? requirement
          : path.join(deployDir, requirement);
        if (!fs.existsSync(reqPath)) {
          throw new Error(`Requirement not found: ${reqPath}`);
        }
        reqFile = reqPath;
      } else if (deployFiles.length > 0) {
        reqFile = deployFiles[0];
      }
    } else if (requirement) {
      const reqPath = path.isAbsolute(requirement)
        ? requirement
        : path.join(deployDir, requirement);
      if (!fs.existsSync(reqPath)) {
        throw new Error(`Requirement not found: ${reqPath}`);
      }
      reqFile = reqPath;
    } else {
      const firstFile = getFirstFile(deployDir);
      if (!firstFile) {
        console.log("DEPLOY: deploy queue empty");
        if (auto) {
          process.exit(0);
        }
      } else {
        reqFile = firstFile;
      }
    }
  } else {
    console.log(`DEPLOY: final pass over released ${releasedDir}`);
  }

  if (reqFile) {
    console.log(`DEPLOY: using ${reqFile}`);
  }
  console.log(`DEPLOY: batch mode ${batch}`);
  console.log(`DEPLOY: released dir ${releasedDir}`);

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const reqLine = reqFile || "None";
  const deployNames = deployFiles.map((file) => path.basename(file));
  const deployListText = deployNames.length > 0 ? deployNames.map((name) => `- ${name}`).join("\n") : "- None";
  const scopeSummary = summarizeScopes(deployFiles);
  const scopeSummaryText = `frontend=${scopeSummary.frontend}, backend=${scopeSummary.backend}, fullstack=${scopeSummary.fullstack}, unknown=${scopeSummary.unknown}`;

  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nFinal pass: ${finalPass}\nBatch mode: ${batch}\nDeploy dir: ${deployDir}\nReleased dir: ${releasedDir}\nDocs dir: ${docsDir}\nDeploy mode: ${runtime.deploy.mode}\nFinal push on success: ${runtime.deploy.finalPushOnSuccess}\nDeploy queue files:\n${deployListText}\nBatch scope summary: ${scopeSummaryText}\nGit actions are executed by flow runner, not by this agent.\n`;
  const fullPrompt = `${prompt}\n\n${context}`;

  const configArgs = readConfigArgs(runtime.resolveAgentCodexConfigPath("DEPLOY"));

  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto,
  });
  let threadId = readThreadId(threadFile);

  if (!auto) {
    const verbose = { value: false };
    const detail = { value: false };
    console.log("DEPLOY: chat mode (Alt+V verbose, Alt+D detail, q to quit)");
    while (true) {
      const msg = await readInputWithHotkeys({
        prompt: "DEPLOY> ",
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
        agentLabel: "DEPLOY",
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
    agentLabel: "DEPLOY",
    autoCompact: auto,
  });

  if (result.threadId) {
    writeThreadId(threadFile, result.threadId);
    console.log(`DEPLOY: thread saved ${result.threadId}`);
  } else {
    console.log("DEPLOY: warning - no session id found");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
