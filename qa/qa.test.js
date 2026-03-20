const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  writeNoItemsPassGate,
  validateGateFile,
  validateFinalPassGateFile,
  applyFinalPassGateResult,
  persistFinalPassFailure,
  writeGatePayload,
} = require("./qa");

function writeGate(payload) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-final-gate-"));
  const gatePath = path.join(tempDir, "gate.json");
  fs.writeFileSync(gatePath, JSON.stringify(payload, null, 2), "utf8");
  return gatePath;
}

test("accepts a definitive final-pass pass gate payload", () => {
  const gatePath = writeGate({
    status: "pass",
    summary: "Final QA checks passed.",
    blocking_findings: [],
    findings: [],
    manual_uat: [],
  });

  const result = validateFinalPassGateFile(gatePath);
  assert.equal(result.ok, true, "Pass gate should be valid");
  assert.equal(result.gate.status, "pass");
  assert.equal(result.gate.summary, "Final QA checks passed.");
  assert.equal(Array.isArray(result.gate.blocking_findings), true);
});

test("converts final-pass payload with no findings from pending to terminal pass", () => {
  const gatePath = writeGate({
    status: "fail",
    summary: "pending",
    blocking_findings: [],
    findings: [],
    manual_uat: [],
  });

  const valid = validateFinalPassGateFile(gatePath);
  assert.equal(valid.ok, true, "Pending payload without findings should normalize to terminal pass");
  assert.equal(valid.gate.status, "pass");
  assert.notEqual(valid.gate.summary.toLowerCase(), "pending");
  assert.equal(Array.isArray(valid.gate.blocking_findings), true);
  assert.equal(Array.isArray(valid.gate.findings), true);
  assert.equal(Array.isArray(valid.gate.manual_uat), true);
  writeGatePayload(gatePath, valid.gate);

  const rewritten = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  assert.equal(rewritten.status, "pass");
  assert.notEqual(rewritten.summary.toLowerCase(), "pending");
  assert.equal(Array.isArray(rewritten.blocking_findings), true);
  assert.equal(rewritten.blocking_findings.length, 0);
  assert.equal(rewritten.findings.length, 0);
  assert.equal(rewritten.manual_uat.length, 0);
});

test("rejects pass final gate payload that includes findings", () => {
  const gatePath = writeGate({
    status: "pass",
    summary: "All checks passed",
    blocking_findings: [],
    findings: [
      {
        severity: "P1",
        title: "Unexpected regression found",
        details: "Regression remains after fix.",
      },
    ],
    manual_uat: [],
  });

  const invalid = validateFinalPassGateFile(gatePath);
  assert.equal(invalid.ok, false, "Pass payload with findings should be invalid");
  assert.ok(Array.isArray(invalid.reasons));
  assert.equal(invalid.reasons.includes("Pass result cannot contain any findings."), true);
});

test("rejects fail payload with pending summary and unresolved findings", () => {
  const gatePath = writeGate({
    status: "fail",
    summary: "pending",
    blocking_findings: ["P1: unresolved data mismatch"],
    findings: [
      {
        severity: "P1",
        title: "Critical regression",
        details: "Repro requires explicit reproduction steps.",
      },
    ],
    manual_uat: [],
  });

  const invalid = validateFinalPassGateFile(gatePath);
  assert.equal(invalid.ok, false, "Failing pending payload with findings should be invalid");
  const applied = applyFinalPassGateResult(gatePath, invalid, "final-pass");
  assert.equal(applied.ok, false, "Invalid pending payload should remain failing");
  assert.equal(applied.gate.summary, "QA final-pass final gate invalid");
  assert.equal(Array.isArray(applied.gate.findings), true);

  const rewritten = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  assert.equal(rewritten.status, "fail");
  assert.equal(rewritten.summary, "QA final-pass final gate invalid");
  assert.notEqual(rewritten.summary.toLowerCase(), "pending");
  assert.equal(rewritten.blocking_findings.includes("P1: unresolved data mismatch"), false);
  assert.equal(rewritten.findings.length, 1);
});

test("dedupes duplicate finding entries before terminalizing final pass failures", () => {
  const duplicate = {
    severity: "P1",
    title: "Critical regression",
    details: "Repro requires explicit reproduction steps.",
  };

  const gatePath = writeGate({
    status: "fail",
    summary: "Final QA checks failed.",
    blocking_findings: ["P1: unresolved data mismatch", "P1: unresolved data mismatch", ""],
    findings: [duplicate, duplicate],
    manual_uat: ["manual 1", "manual 1", "manual 2"],
  });

  const valid = validateFinalPassGateFile(gatePath);
  assert.equal(valid.ok, true, "Fail payload with duplicates should remain valid");
  assert.equal(valid.gate.blocking_findings.length, 1);
  assert.equal(valid.gate.findings.length, 1);
  assert.equal(valid.gate.manual_uat.length, 2);

  const applied = applyFinalPassGateResult(gatePath, {
    ok: false,
    reasons: ["simulate terminalization"],
    gatePayload: valid.gate,
  }, "final-pass");
  assert.equal(applied.ok, false, "Invalid payload should remain failing");
  assert.equal(applied.gate.summary, "QA final-pass final gate invalid");
  assert.equal(Array.isArray(applied.gate.blocking_findings), true);
  assert.equal(Array.isArray(applied.gate.findings), true);

  const rewritten = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  assert.equal(rewritten.summary, "QA final-pass final gate invalid");
  assert.equal(rewritten.blocking_findings.length, 1);
});

test("writes explicit fail artifact when final-pass execution fails before validation", () => {
  const gatePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "qa-final-gate-")), "gate.json");
  const reason = persistFinalPassFailure(gatePath, "QA final pass execution failed: boom");

  const rewritten = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  assert.equal(rewritten.status, "fail");
  assert.ok(reason.length > 0, "Failure helper should return a persisted reason");
  assert.notEqual(rewritten.summary.toLowerCase(), "pending");
  assert.equal(Array.isArray(rewritten.blocking_findings), true);
  assert.equal(Array.isArray(rewritten.findings), true);
  assert.equal(Array.isArray(rewritten.manual_uat), true);
});

test("batch empty queue helper writes definitive pass gate", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-batch-empty-"));
  const gatePath = path.join(tempDir, "batch-gate.json");
  const written = writeNoItemsPassGate(gatePath, "batch-tests", "qa");
  assert.equal(written, true);

  const payload = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  assert.equal(payload.status, "pass");
  assert.match(payload.summary, /no items in queue/i);
  assert.deepEqual(payload.blocking_findings, []);
  assert.deepEqual(payload.findings, []);
  assert.deepEqual(payload.manual_uat, []);
  assert.doesNotThrow(() => validateGateFile(gatePath, "batch-tests"));
});
