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
    quickReview: false,
    batchTests: false,
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
    if (normalized === "--quick-review" || normalized === "-quick-review") {
      args.quickReview = true;
      continue;
    }
    if (normalized === "--batch-tests" || normalized === "-batch-tests") {
      args.batchTests = true;
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

function validateGateFile(gateFile, label) {
  if (!gateFile) {
    throw new Error(`QA ${label} requires --gate-file`);
  }
  if (!fs.existsSync(gateFile)) {
    throw new Error(`QA ${label} gate file missing: ${gateFile}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(gateFile, "utf8"));
  } catch (err) {
    throw new Error(`QA ${label} gate file invalid JSON: ${err.message}`);
  }
  const status = String(parsed.status || "").toLowerCase();
  if (!["pass", "fail"].includes(status)) {
    throw new Error(`QA ${label} gate file has invalid status: ${status || "<empty>"}`);
  }
}

function validateReviewDecisionFile(decisionFile) {
  if (!decisionFile) {
    throw new Error("QA review-only requires --decision-file");
  }
  if (!fs.existsSync(decisionFile)) {
    throw new Error(`QA review decision file missing: ${decisionFile}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(decisionFile, "utf8"));
  } catch (err) {
    throw new Error(`QA review decision file invalid JSON: ${err.message}`);
  }
  const status = String(parsed.status || "").toLowerCase();
  if (!["pass", "clarify", "block"].includes(status)) {
    throw new Error(`QA review decision has invalid status: ${status || "<empty>"}`);
  }
  const summary = String(parsed.summary || "").trim();
  if (!summary) {
    throw new Error("QA review decision requires non-empty summary");
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (process.env.CODEX_FLOW_AUTO === "1") {
    parsed.auto = true;
  }
  const {
    requirement,
    auto,
    finalPass,
    gateFile,
    reviewOnly,
    decisionFile,
    quickReview,
    batchTests,
  } = parsed;

  if (reviewOnly && finalPass) {
    throw new Error("QA --review-only cannot be combined with --final-pass");
  }
  if (batchTests && finalPass) {
    throw new Error("QA --batch-tests cannot be combined with --final-pass");
  }
  if (batchTests && reviewOnly) {
    throw new Error("QA --batch-tests cannot be combined with --review-only");
  }

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
  let batchTargets = [];
  if (!finalPass) {
    if (reviewOnly && !requirement) {
      throw new Error("QA --review-only requires --requirement");
    }

    if (batchTests) {
      console.log(`QA: scan sec ${secDir}`);
      batchTargets = listRequirementFiles(secDir);
      if (requirement) {
        const reqPath = resolveRequirementPath(requirement, [secDir, qaDir]);
        if (!fs.existsSync(reqPath)) {
          throw new Error(`Requirement not found: ${reqPath}`);
        }
        reqFile = reqPath;
      } else if (batchTargets.length > 0) {
        reqFile = batchTargets[0];
      } else {
        console.log("QA: sec queue empty for batch tests");
        if (auto) {
          process.exit(0);
        }
      }
    } else {
      console.log(`QA: scan qa ${qaDir}`);
      if (requirement) {
        const reqPath = resolveRequirementPath(requirement, [qaDir]);
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
    }
  } else {
    console.log(`QA: final pass over released ${releasedDir}`);
  }

  if (reqFile) {
    console.log(`QA: using ${reqFile}`);
  }
  console.log(`QA: review-only ${reviewOnly}`);
  console.log(`QA: quick-review ${quickReview}`);
  console.log(`QA: batch-tests ${batchTests}`);
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
  const decisionLine = decisionFile ? decisionFile : "None";
  const batchListText = batchTargets.length > 0
    ? batchTargets.map((item) => `- ${path.basename(item)}`).join("\n")
    : "- None";
  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nFinal pass: ${finalPass}\nReview only: ${reviewOnly}\nQuick review: ${quickReview}\nBatch tests: ${batchTests}\nQA dir: ${qaDir}\nSec dir: ${secDir}\nTo-clarify dir: ${clarifyDir}\nBlocked dir: ${blockedDir}\nReleased dir: ${releasedDir}\nDocs dir: ${docsDir}\nFinal gate file: ${gateLine}\nDecision file: ${decisionLine}\nBatch test targets:\n${batchListText}\nMandatory QA checks (run in order where applicable):\n${checksText}\n`;
  const fullPrompt = `${prompt}\n\n${context}`;

  const configArgs = readConfigArgs(runtime.resolveAgentCodexConfigPath("QA"));

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
    validateGateFile(gateFile, "final");
  }
  if (batchTests) {
    validateGateFile(gateFile, "batch-tests");
  }
  if (reviewOnly) {
    validateReviewDecisionFile(decisionFile);
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
