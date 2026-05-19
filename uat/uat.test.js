const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  finalizeGateFile,
  writeNoItemsPassGate,
  validateGateFile,
} = require("./uat");

test("batch empty queue helper writes definitive pass gate", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "uat-batch-empty-"));
  const gatePath = path.join(tempDir, "batch-gate.json");
  const written = writeNoItemsPassGate(gatePath, "batch", "deploy");
  assert.equal(written, true);

  const payload = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  assert.equal(payload.status, "pass");
  assert.match(payload.summary, /no items in queue/i);
  assert.deepEqual(payload.blocking_findings, []);
  assert.deepEqual(payload.findings, []);
  assert.deepEqual(payload.manual_uat, []);
  assert.doesNotThrow(() => validateGateFile(gatePath, "batch"));
});

test("finalizeGateFile converts pending gate template into technical fail gate", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "uat-pending-gate-"));
  const gatePath = path.join(tempDir, "batch-gate.json");
  fs.writeFileSync(
    gatePath,
    `${JSON.stringify({
      status: "fail",
      summary: "pending",
      blocking_findings: [],
      findings: [],
      manual_uat: [],
    }, null, 2)}\n`,
    "utf8"
  );

  const result = finalizeGateFile(gatePath, "batch");
  const payload = JSON.parse(fs.readFileSync(gatePath, "utf8"));

  assert.equal(result.recoveredPendingGate, true);
  assert.equal(payload.status, "fail");
  assert.equal(payload.failure_type, "technical_gate_pending");
  assert.notEqual(payload.summary.toLowerCase(), "pending");
  assert.equal(payload.findings[0].severity, "P1");
  assert.doesNotThrow(() => validateGateFile(gatePath, "batch"));
});
