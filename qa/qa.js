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

const FINAL_GATE_PENDING_SUMMARY = "pending";

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
    batchQueue: "sec",
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i] || "");
    const arg = raw;
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
    if (normalized === "--batch-queue" || normalized === "-batch-queue") {
      args.batchQueue = String(argv[i + 1] || "sec").toLowerCase();
      i++;
      continue;
    }
    if (normalized.startsWith("--batch-queue=")) {
      args.batchQueue = String(raw.split("=", 2)[1] || "sec").toLowerCase();
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

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function failurePayloadFromReasons(label, reasons, fallback = "") {
  const details = reasons.length > 0 ? reasons[0] : fallback;
  const normalizedDetails = String(details || "").trim() || "QA final gate did not produce a definitive artifact.";
  return {
    status: "fail",
    summary: `QA ${label} final gate invalid`,
    blocking_findings: ["P1: QA final pass gate payload is missing or invalid."],
    findings: [
      {
        severity: "P1",
        title: `QA ${label} final gate invalid`,
        details: normalizedDetails,
      },
    ],
    manual_uat: [],
  };
}

function isDefinitiveFinalGatePayload(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      reasons: ["Parsed payload is missing or not a JSON object."],
    };
  }

  const status = String(parsed.status || "").toLowerCase();
  if (!["pass", "fail"].includes(status)) {
    return {
      ok: false,
      reasons: [`Invalid status: ${String(parsed.status || "").trim() || "<empty>"}`],
    };
  }

  const summary = String(parsed.summary || "").trim();
  if (!summary) {
    return {
      ok: false,
      reasons: ["Missing final gate summary."],
    };
  }

  const blockingFindings = normalizeArray(parsed.blocking_findings);
  const findings = normalizeArray(parsed.findings);
  const manualUat = normalizeArray(parsed.manual_uat);
  const hasArrays = Array.isArray(parsed.blocking_findings) && Array.isArray(parsed.findings) && Array.isArray(parsed.manual_uat);

  if (!hasArrays) {
    return {
      ok: false,
      reasons: ["Final gate arrays must be explicit arrays: blocking_findings, findings, manual_uat."],
    };
  }

  if (status === "pass" && summary.toLowerCase() === FINAL_GATE_PENDING_SUMMARY) {
    return {
      ok: false,
      reasons: ["Pass result cannot keep pending summary."],
    };
  }

  if (
    status === "fail"
    && summary.toLowerCase() === FINAL_GATE_PENDING_SUMMARY
    && blockingFindings.length === 0
    && findings.length === 0
  ) {
    return {
      ok: false,
      reasons: ["Final gate left in pending state without findings."],
    };
  }

  return {
    ok: true,
    payload: {
      status,
      summary,
      blocking_findings: blockingFindings,
      findings: findings,
      manual_uat: manualUat,
    },
  };
}

function validateFinalPassGateFile(gateFile) {
  if (!fs.existsSync(gateFile)) {
    return {
      ok: false,
      reasons: [`QA final gate file missing: ${gateFile}`],
      gate: failurePayloadFromReasons("final-pass", ["QA final gate file missing."]),
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(gateFile, "utf8"));
  } catch (err) {
    return {
      ok: false,
      reasons: [`QA final gate file invalid JSON: ${err.message}`],
      gate: failurePayloadFromReasons("final-pass", ["QA final gate file invalid JSON."]),
    };
  }

  const check = isDefinitiveFinalGatePayload(parsed);
  if (!check.ok) {
    return {
      ok: false,
      reasons: check.reasons || ["Final gate payload is invalid."],
      gate: failurePayloadFromReasons("final-pass", check.reasons || []),
      gatePayload: parsed,
    };
  }

  return {
    ok: true,
    gate: check.payload,
  };
}

function applyFinalPassGateResult(gateFile, result, gateLabel = "final-pass") {
  if (!result || result.ok) {
    return result;
  }
  const stableGate = {
    ...(result.gate || failurePayloadFromReasons(gateLabel, result.reasons || [])),
    summary: result.gate && result.gate.summary ? result.gate.summary : `QA ${gateLabel} final gate invalid`,
  };
  fs.writeFileSync(gateFile, JSON.stringify(stableGate, null, 2), "utf8");
  return {
    ok: false,
    reasons: result.reasons || [`QA ${gateLabel} final gate invalid.`],
    gate: stableGate,
  };
}

function persistFinalPassFailure(gateFile, errorOrReasons, gateLabel = "final-pass") {
  const normalizedReasons = normalizeArray(Array.isArray(errorOrReasons) ? errorOrReasons : [errorOrReasons])
    .map((reason) => String(reason || "").trim())
    .filter(Boolean);
  const finalReasons =
    normalizedReasons.length > 0
      ? normalizedReasons
      : [`QA ${gateLabel} final gate failed.`];

  const fallback = failurePayloadFromReasons(gateLabel, finalReasons);
  const result = {
    ok: false,
    reasons: finalReasons,
    gate: fallback,
  };

  try {
    const applied = applyFinalPassGateResult(gateFile, result, gateLabel);
    return Array.isArray(applied.reasons) && applied.reasons.length > 0
      ? applied.reasons.join("; ")
      : finalReasons.join("; ");
  } catch (writeError) {
    return `QA ${gateLabel} final gate failed and could not persist fail artifact: ${String(
      writeError?.message || writeError || "unknown error",
    )}`;
  }
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
    batchQueue,
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
  const batchQueueName = batchQueue === "qa" ? "qa" : "sec";
  const batchQueueDir = batchQueueName === "qa" ? qaDir : secDir;
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
      console.log(`QA: scan ${batchQueueName} ${batchQueueDir}`);
      batchTargets = listRequirementFiles(batchQueueDir);
      if (requirement) {
        const reqPath = resolveRequirementPath(requirement, [batchQueueDir, qaDir, secDir]);
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
  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nFinal pass: ${finalPass}\nReview only: ${reviewOnly}\nQuick review: ${quickReview}\nBatch tests: ${batchTests}\nBatch queue: ${batchQueueName}\nQA dir: ${qaDir}\nSec dir: ${secDir}\nTo-clarify dir: ${clarifyDir}\nBlocked dir: ${blockedDir}\nReleased dir: ${releasedDir}\nDocs dir: ${docsDir}\nFinal gate file: ${gateLine}\nDecision file: ${decisionLine}\nBatch test targets:\n${batchListText}\nMandatory QA checks (run in order where applicable):\n${checksText}\n`;
  const fullPrompt = `${prompt}\n\n${context}`;

  const configArgs = readConfigArgs(runtime.resolveAgentCodexConfigPath("QA"));

  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto,
  });
  let threadId = readThreadId(threadFile);

  if (!auto) {
    await startInteractiveCodexAgent({
      agentLabel: "QA",
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

  let result;
  if (finalPass) {
    try {
      result = await runCodexExec({
        prompt: fullPrompt,
        repoRoot,
        configArgs,
        threadId,
        threadFile,
        agentsRoot: runtime.agentsRoot,
        agentLabel: "QA",
        autoCompact: auto,
        runtime,
        autoMode: auto,
      });

      if (batchTests) {
        validateGateFile(gateFile, "batch-tests");
      }
      validateGateFile(gateFile, "final");
      const finalPassResult = validateFinalPassGateFile(gateFile);
      if (!finalPassResult.ok) {
        const applied = applyFinalPassGateResult(gateFile, finalPassResult, "final-pass");
        const reason = applied && applied.reasons
          ? applied.reasons.join("; ")
          : "QA final pass gate failed";
        throw Object.assign(new Error(reason), { qaFinalPassGateHandled: true });
      }
    } catch (error) {
      if (!error.qaFinalPassGateHandled) {
        const reason = persistFinalPassFailure(
          gateFile,
          `QA final pass execution failed: ${String(error && error.message ? error.message : error)}`,
          "final-pass",
        );
        throw new Error(reason);
      }
      throw error;
    }
  } else {
    result = await runCodexExec({
      prompt: fullPrompt,
      repoRoot,
      configArgs,
      threadId,
      threadFile,
      agentsRoot: runtime.agentsRoot,
      agentLabel: "QA",
      autoCompact: auto,
      runtime,
      autoMode: auto,
    });

    if (batchTests) {
      validateGateFile(gateFile, "batch-tests");
    }
    if (reviewOnly) {
      validateReviewDecisionFile(decisionFile);
    }
  }

  if (result.threadId) {
    writeThreadId(threadFile, result.threadId);
    console.log(`QA: thread saved ${result.threadId}`);
  } else {
    console.log("QA: warning - no session id found");
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = {
  FINAL_GATE_PENDING_SUMMARY,
  normalizeArray,
  isDefinitiveFinalGatePayload,
  validateFinalPassGateFile,
  applyFinalPassGateResult,
  persistFinalPassFailure,
  failurePayloadFromReasons,
};
