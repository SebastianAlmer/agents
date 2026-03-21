const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  gateFromAgentResult,
  createQaExecutionFailureGate,
  isTechnicalGateFailure,
  routeTechnicalGateFailureToHumanInput,
  findingsFingerprint,
  shouldSkipMaintForReleasedBundle,
} = require("./delivery-runner");

function mkTempQueues() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-runner-test-"));
  const qaDir = path.join(root, "requirements", "qa");
  const devDir = path.join(root, "requirements", "dev");
  const humanInputDir = path.join(root, "requirements", "human-input");
  const humanDecisionNeededDir = path.join(root, "requirements", "human-decision-needed");
  fs.mkdirSync(qaDir, { recursive: true });
  fs.mkdirSync(devDir, { recursive: true });
  fs.mkdirSync(humanInputDir, { recursive: true });
  fs.mkdirSync(humanDecisionNeededDir, { recursive: true });
  return { root, qaDir, devDir, humanInputDir, humanDecisionNeededDir };
}

test("gateFromAgentResult marks pending gate as technical process failure", () => {
  const gate = gateFromAgentResult({
    result: { ok: true, exitCode: 0, stderr: "" },
    parsedGate: {
      status: "fail",
      summary: "pending",
      blocking_findings: [],
      findings: [],
      manual_uat: [],
    },
    createFailureGate: createQaExecutionFailureGate,
    command: "node qa/qa.js --auto --batch-tests",
    gateLabel: "QA bundle gate",
  });

  assert.equal(gate.status, "fail");
  assert.equal(gate.failure_type, "technical_gate_pending");
  assert.equal(isTechnicalGateFailure(gate), true);
});

test("technical gate failure routes to dev first, then escalates after retries", () => {
  const { root, qaDir, devDir, humanDecisionNeededDir } = mkTempQueues();

  const writeReq = (dir) => {
    const reqPath = path.join(dir, "REQ-TEST.md");
    fs.writeFileSync(
      reqPath,
      [
        "---",
        "id: REQ-TEST",
        "title: Test requirement",
        "status: qa",
        "---",
        "",
        "# Goal",
        "Verify technical routing.",
        "",
      ].join("\n"),
      "utf8"
    );
    return reqPath;
  };

  const mkRuntime = () => ({
    agentsRoot: root,
    bundleFlow: {
      enabled: false,
      allowCrossBundleMoves: true,
    },
    deliveryQuality: {
      routeToDevOnFail: true,
      maxFixCycles: 2,
    },
    queues: {
      qa: qaDir,
      dev: devDir,
      humanDecisionNeeded: humanDecisionNeededDir,
    },
  });
  const controls = { verbose: false };
  const gate = {
    status: "fail",
    summary: "QA bundle gate completed without writing a definitive gate result.",
    blocking_findings: [],
    findings: [],
    manual_uat: [],
    failure_type: "technical_gate_pending",
  };

  // First failure: should route to dev
  writeReq(qaDir);
  const routed1 = routeTechnicalGateFailureToHumanInput(mkRuntime(), controls, {
    gateName: "qa",
    sourceQueue: "qa",
    gate,
  });
  assert.equal(routed1.progressed, true);
  assert.equal(routed1.routedTo, "dev");
  assert.equal(fs.existsSync(path.join(devDir, "REQ-TEST.md")), true);
  assert.equal(fs.existsSync(path.join(qaDir, "REQ-TEST.md")), false);

  // Second failure: still routes to dev (attempt 2 <= maxFixCycles 2)
  fs.renameSync(path.join(devDir, "REQ-TEST.md"), path.join(qaDir, "REQ-TEST.md"));
  const routed2 = routeTechnicalGateFailureToHumanInput(mkRuntime(), controls, {
    gateName: "qa",
    sourceQueue: "qa",
    gate,
  });
  assert.equal(routed2.progressed, true);
  assert.equal(routed2.routedTo, "dev");

  // Third failure: retries exhausted, escalates to human-decision-needed
  fs.renameSync(path.join(devDir, "REQ-TEST.md"), path.join(qaDir, "REQ-TEST.md"));
  const routed3 = routeTechnicalGateFailureToHumanInput(mkRuntime(), controls, {
    gateName: "qa",
    sourceQueue: "qa",
    gate,
  });
  assert.equal(routed3.progressed, true);
  assert.equal(routed3.routedTo, "human-decision-needed");
  assert.equal(fs.existsSync(path.join(humanDecisionNeededDir, "REQ-TEST.md")), true);
});

function mkTempReleasedQueue() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-runner-maint-test-"));
  const releasedDir = path.join(root, "requirements", "released");
  fs.mkdirSync(releasedDir, { recursive: true });
  return { root, releasedDir };
}

function writeReleasedReq(releasedDir, fileName, frontMatter) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontMatter || {})) {
    lines.push(`${key}: ${value}`);
  }
  lines.push("---", "", "# Goal", "test");
  fs.writeFileSync(path.join(releasedDir, fileName), `${lines.join("\n")}\n`, "utf8");
}

test("shouldSkipMaintForReleasedBundle skips maint-only released bundles", () => {
  const { releasedDir } = mkTempReleasedQueue();
  writeReleasedReq(releasedDir, "A.md", {
    id: "REQ-MAINT-HOTFIX-2026-03-03T06-20-54-077Z",
    source: "maint-gate",
    bundle_id: "B9999",
  });
  writeReleasedReq(releasedDir, "B.md", {
    id: "REQ-MAINT-FOLLOWUP-2026-03-03T06-20-54-078Z",
    source: "maint-gate",
    bundle_id: "B9999",
  });

  const verdict = shouldSkipMaintForReleasedBundle({
    queues: { released: releasedDir },
  });
  assert.equal(verdict.skip, true);
  assert.equal(verdict.bundleId, "B9999");
});

test("shouldSkipMaintForReleasedBundle does not skip mixed-scope released bundles", () => {
  const { releasedDir } = mkTempReleasedQueue();
  writeReleasedReq(releasedDir, "A.md", {
    id: "REQ-MAINT-HOTFIX-2026-03-03T06-20-54-077Z",
    source: "maint-gate",
    bundle_id: "B9998",
  });
  writeReleasedReq(releasedDir, "B.md", {
    id: "REQ-NEW-user-facing-feature",
    source: "reqeng-chat",
    bundle_id: "B9998",
  });

  const verdict = shouldSkipMaintForReleasedBundle({
    queues: { released: releasedDir },
  });
  assert.equal(verdict.skip, false);
  assert.equal(verdict.bundleId, "B9998");
});

test("findingsFingerprint for maint ignores count-only churn", () => {
  const a = findingsFingerprint("maint", "selected", [
    {
      severity: "P1",
      title: "Unclassified i18n candidates (candidateCount=83)",
      details: "web i18n:audit:auth enCount=1548 deCount=1548 enOnly=0 deOnly=0",
    },
  ]);
  const b = findingsFingerprint("maint", "selected", [
    {
      severity: "P1",
      title: "Unclassified i18n candidates (candidateCount=65)",
      details: "web i18n:audit:auth enCount=1560 deCount=1560 enOnly=0 deOnly=0",
    },
  ]);
  assert.equal(a, b);
});
