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
  const args = {
    requirement: "",
    auto: false,
    finalPass: false,
    gateFile: "",
    reviewOnly: false,
    decisionFile: "",
  };
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
    if (normalized === "--review-only" || normalized === "-review-only") {
      args.reviewOnly = true;
      continue;
    }
    if (normalized === "--decision-file" || normalized === "-decision-file") {
      args.decisionFile = argv[i + 1] || "";
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
    throw new Error(`SEC final gate file missing: ${gateFile}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(gateFile, "utf8"));
  } catch (err) {
    throw new Error(`SEC final gate file invalid JSON: ${err.message}`);
  }
  const status = String(parsed.status || "").toLowerCase();
  if (!["pass", "fail"].includes(status)) {
    throw new Error(`SEC final gate file has invalid status: ${status || "<empty>"}`);
  }
}

function validateReviewDecisionFile(decisionFile) {
  if (!decisionFile) {
    throw new Error("SEC review-only requires --decision-file");
  }
  if (!fs.existsSync(decisionFile)) {
    throw new Error(`SEC review decision file missing: ${decisionFile}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(decisionFile, "utf8"));
  } catch (err) {
    throw new Error(`SEC review decision file invalid JSON: ${err.message}`);
  }
  const status = String(parsed.status || "").toLowerCase();
  if (!["pass", "clarify", "block"].includes(status)) {
    throw new Error(`SEC review decision has invalid status: ${status || "<empty>"}`);
  }
  const summary = String(parsed.summary || "").trim();
  if (!summary) {
    throw new Error("SEC review decision requires non-empty summary");
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (process.env.CODEX_FLOW_AUTO === "1") {
    parsed.auto = true;
  }
  const { requirement, auto, finalPass, gateFile, reviewOnly, decisionFile } = parsed;

  if (reviewOnly && finalPass) {
    throw new Error("SEC --review-only cannot be combined with --final-pass");
  }

  const agentRoot = __dirname;
  const runtime = loadRuntimeConfig(path.resolve(agentRoot, ".."));
  ensureQueueDirs(runtime.queues);

  const repoRoot = runtime.repoRoot;
  const docsDir = runtime.docsDir;
  const secDir = runtime.queues.sec;
  const uxDir = runtime.queues.ux;
  const clarifyDir = runtime.queues.toClarify;
  const blockedDir = runtime.queues.blocked;
  const releasedDir = runtime.queues.released;

  let reqFile = "";
  if (!finalPass) {
    if (reviewOnly && !requirement) {
      throw new Error("SEC --review-only requires --requirement");
    }

    console.log(`SEC: scan sec ${secDir}`);
    if (requirement) {
      const reqPath = path.isAbsolute(requirement)
        ? requirement
        : path.join(secDir, requirement);
      if (!fs.existsSync(reqPath)) {
        throw new Error(`Requirement not found: ${reqPath}`);
      }
      reqFile = reqPath;
    } else {
      const firstFile = getFirstFile(secDir);
      if (!firstFile) {
        console.log("SEC: sec queue empty");
        if (auto) {
          process.exit(0);
        }
      } else {
        reqFile = firstFile;
      }
    }
  } else {
    console.log(`SEC: final pass over released ${releasedDir}`);
  }

  if (reqFile) {
    console.log(`SEC: using ${reqFile}`);
  }
  console.log(`SEC: review-only ${reviewOnly}`);
  console.log(`SEC: ux dir ${uxDir}`);
  console.log(`SEC: to-clarify dir ${clarifyDir}`);
  console.log(`SEC: blocked dir ${blockedDir}`);

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const reqLine = reqFile || "None";
  const gateLine = gateFile ? gateFile : "None";
  const decisionLine = decisionFile ? decisionFile : "None";
  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nFinal pass: ${finalPass}\nReview only: ${reviewOnly}\nSec dir: ${secDir}\nUX dir: ${uxDir}\nTo-clarify dir: ${clarifyDir}\nBlocked dir: ${blockedDir}\nReleased dir: ${releasedDir}\nDocs dir: ${docsDir}\nFinal gate file: ${gateLine}\nDecision file: ${decisionLine}\n`;
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
    console.log("SEC: chat mode (Alt+V verbose, Alt+D detail, q to quit)");
    while (true) {
      const msg = await readInputWithHotkeys({
        prompt: "SEC> ",
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
        agentLabel: "SEC",
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
    agentLabel: "SEC",
    autoCompact: auto,
  });

  if (finalPass) {
    validateGateFile(gateFile);
  }
  if (reviewOnly) {
    validateReviewDecisionFile(decisionFile);
  }

  if (result.threadId) {
    writeThreadId(threadFile, result.threadId);
    console.log(`SEC: thread saved ${result.threadId}`);
  } else {
    console.log("SEC: warning - no session id found");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
