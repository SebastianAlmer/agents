const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
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

