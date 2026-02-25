const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  validateFinalPassGateFile,
  applyFinalPassGateResult,
  persistFinalPassFailure,
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

test("writes explicit fail artifact when final-pass payload is pending", () => {
  const gatePath = writeGate({
    status: "fail",
    summary: "pending",
    blocking_findings: [],
    findings: [],
    manual_uat: [],
  });

  const invalid = validateFinalPassGateFile(gatePath);
  assert.equal(invalid.ok, false, "Pending payload should be invalid");
  const applied = applyFinalPassGateResult(gatePath, invalid, "final-pass");
  assert.equal(applied.ok, false, "Invalid payload should stay failing");
  assert.equal(applied.gate.status, "fail");
  assert.equal(applied.gate.summary, "QA final-pass final gate invalid");
  assert.equal(Array.isArray(applied.gate.blocking_findings), true);
  assert.equal(Array.isArray(applied.gate.findings), true);
  assert.equal(Array.isArray(applied.gate.manual_uat), true);

  const rewritten = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  assert.equal(rewritten.status, "fail");
  assert.notEqual(rewritten.summary.toLowerCase(), "pending");
  assert.ok(Array.isArray(rewritten.blocking_findings));
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
