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
} = require("./delivery-runner");

function mkTempQueues() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-runner-test-"));
  const qaDir = path.join(root, "requirements", "qa");
  const humanInputDir = path.join(root, "requirements", "human-input");
  fs.mkdirSync(qaDir, { recursive: true });
  fs.mkdirSync(humanInputDir, { recursive: true });
  return { root, qaDir, humanInputDir };
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

test("technical gate failure is routed to human-input", () => {
  const { root, qaDir, humanInputDir } = mkTempQueues();
  const reqPath = path.join(qaDir, "REQ-TEST.md");
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

  const runtime = {
    agentsRoot: root,
    bundleFlow: {
      enabled: false,
      allowCrossBundleMoves: true,
    },
    queues: {
      qa: qaDir,
      humanInput: humanInputDir,
    },
  };
  const controls = { verbose: false };
  const gate = {
    status: "fail",
    summary: "QA bundle gate completed without writing a definitive gate result.",
    blocking_findings: [],
    findings: [],
    manual_uat: [],
    failure_type: "technical_gate_pending",
  };

  const routed = routeTechnicalGateFailureToHumanInput(runtime, controls, {
    gateName: "qa",
    sourceQueue: "qa",
    gate,
  });

  assert.equal(routed.progressed, true);
  assert.equal(routed.routedTo, "human-input");
  const targetPath = path.join(humanInputDir, "REQ-TEST.md");
  assert.equal(fs.existsSync(targetPath), true);
  assert.equal(fs.existsSync(reqPath), false);

  const raw = fs.readFileSync(targetPath, "utf8");
  assert.match(raw, /status:\s*human-input/i);
});

