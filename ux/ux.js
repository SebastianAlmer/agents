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
  const args = {
    requirement: "",
    auto: false,
    finalPass: false,
    gateFile: "",
    reviewOnly: false,
    decisionFile: "",
    batch: false,
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

function resolveRequirementPath(requirement, candidateDirs) {
  if (!requirement) {
    return "";
  }
  if (path.isAbsolute(requirement)) {
    return requirement;
  }
  for (const dir of candidateDirs) {
    const candidate = path.join(dir, requirement);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(candidateDirs[0], requirement);
}

function validateGateFile(gateFile) {
  if (!gateFile) {
    throw new Error("UX final pass requires --gate-file");
  }
  if (!fs.existsSync(gateFile)) {
    throw new Error(`UX final gate file missing: ${gateFile}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(gateFile, "utf8"));
  } catch (err) {
    throw new Error(`UX final gate file invalid JSON: ${err.message}`);
  }
  const status = String(parsed.status || "").toLowerCase();
  if (!["pass", "fail"].includes(status)) {
    throw new Error(`UX final gate file has invalid status: ${status || "<empty>"}`);
  }
}

function validateReviewDecisionFile(decisionFile) {
  if (!decisionFile) {
    throw new Error("UX review-only requires --decision-file");
  }
  if (!fs.existsSync(decisionFile)) {
    throw new Error(`UX review decision file missing: ${decisionFile}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(decisionFile, "utf8"));
  } catch (err) {
    throw new Error(`UX review decision file invalid JSON: ${err.message}`);
  }
  const status = String(parsed.status || "").toLowerCase();
  if (!["pass", "clarify", "block"].includes(status)) {
    throw new Error(`UX review decision has invalid status: ${status || "<empty>"}`);
  }
  const summary = String(parsed.summary || "").trim();
  if (!summary) {
    throw new Error("UX review decision requires non-empty summary");
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (process.env.CODEX_FLOW_AUTO === "1") {
    parsed.auto = true;
  }
  const { requirement, auto, finalPass, gateFile, reviewOnly, decisionFile, batch } = parsed;

  if (reviewOnly && finalPass) {
    throw new Error("UX --review-only cannot be combined with --final-pass");
  }
  if (batch && finalPass) {
    throw new Error("UX --batch cannot be combined with --final-pass");
  }
  if (batch && reviewOnly) {
    throw new Error("UX --batch cannot be combined with --review-only");
  }

  const agentRoot = __dirname;
  const runtime = loadRuntimeConfig(path.resolve(agentRoot, ".."));
  ensureQueueDirs(runtime.queues);

  const repoRoot = runtime.repoRoot;
  const docsDir = runtime.docsDir;
  const uxDir = runtime.queues.ux;
  const secDir = runtime.queues.sec;
  const deployDir = runtime.queues.deploy;
  const clarifyDir = runtime.queues.toClarify;
  const blockedDir = runtime.queues.blocked;
  const releasedDir = runtime.queues.released;

  let reqFile = "";
  let uxFiles = [];
  if (!finalPass) {
    if (reviewOnly && !requirement) {
      throw new Error("UX --review-only requires --requirement");
    }

    console.log(`UX: scan ux ${uxDir}`);
    uxFiles = listRequirementFiles(uxDir);

    if (requirement) {
      const reqPath = resolveRequirementPath(requirement, [uxDir]);
      if (!fs.existsSync(reqPath)) {
        throw new Error(`Requirement not found: ${reqPath}`);
      }
      reqFile = reqPath;
    } else if (batch) {
      if (uxFiles.length > 0) {
        reqFile = uxFiles[0];
      } else {
        console.log("UX: ux queue empty");
        if (auto) {
          process.exit(0);
        }
      }
    } else {
      const firstFile = getFirstFile(uxDir);
      if (!firstFile) {
        console.log("UX: ux queue empty");
        if (auto) {
          process.exit(0);
        }
      } else {
        reqFile = firstFile;
      }
    }
  } else {
    console.log(`UX: final pass over released ${releasedDir}`);
  }

  if (reqFile) {
    console.log(`UX: using ${reqFile}`);
  }
  console.log(`UX: review-only ${reviewOnly}`);
  console.log(`UX: batch ${batch}`);
  console.log(`UX: sec dir ${secDir}`);
  console.log(`UX: deploy dir ${deployDir}`);
  console.log(`UX: to-clarify dir ${clarifyDir}`);
  console.log(`UX: blocked dir ${blockedDir}`);

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const reqLine = reqFile || "None";
  const gateLine = gateFile ? gateFile : "None";
  const decisionLine = decisionFile ? decisionFile : "None";
  const uxListText = uxFiles.length > 0
    ? uxFiles.map((item) => `- ${path.basename(item)}`).join("\n")
    : "- None";
  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nFinal pass: ${finalPass}\nReview only: ${reviewOnly}\nBatch mode: ${batch}\nUX dir: ${uxDir}\nSec dir: ${secDir}\nDeploy dir: ${deployDir}\nTo-clarify dir: ${clarifyDir}\nBlocked dir: ${blockedDir}\nReleased dir: ${releasedDir}\nDocs dir: ${docsDir}\nFinal gate file: ${gateLine}\nDecision file: ${decisionLine}\nUX queue files:\n${uxListText}\n`;
  const fullPrompt = `${prompt}\n\n${context}`;

  const configArgs = readConfigArgs(runtime.resolveAgentCodexConfigPath("UX"));

  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto,
  });
  let threadId = readThreadId(threadFile);

  if (!auto) {
    await startInteractiveCodexAgent({
      agentLabel: "UX",
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
    agentLabel: "UX",
    autoCompact: auto,
    runtime,
    autoMode: auto,
  });

  if (finalPass) {
    validateGateFile(gateFile);
  }
  if (reviewOnly) {
    validateReviewDecisionFile(decisionFile);
  }

  if (result.threadId) {
    writeThreadId(threadFile, result.threadId);
    console.log(`UX: thread saved ${result.threadId}`);
  } else {
    console.log("UX: warning - no session id found");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
