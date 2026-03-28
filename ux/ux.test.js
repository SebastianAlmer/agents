const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  validateGateFile,
} = require("./ux");

function writeGate(payload) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ux-final-gate-"));
  const gatePath = path.join(tempDir, "gate.json");
  fs.writeFileSync(gatePath, JSON.stringify(payload, null, 2), "utf8");
  return gatePath;
}

test("accepts blocked final-pass gate payload with explicit blocker summary", () => {
  const gatePath = writeGate({
    status: "blocked",
    summary: "Missing required UX source artifacts.",
  });

  assert.doesNotThrow(() => validateGateFile(gatePath));
});

test("rejects final-pass gate payload without explicit summary", () => {
  const gatePath = writeGate({
    status: "blocked",
    summary: "",
  });

  assert.throws(
    () => validateGateFile(gatePath),
    /requires non-empty summary/,
  );
});
