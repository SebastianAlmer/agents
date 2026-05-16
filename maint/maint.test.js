const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  normalizeGateDecisionText,
  validateDecisionFile,
} = require("./maint");

test("normalizeGateDecisionText accepts escaped backticks from gate JSON", () => {
  assert.equal(
    normalizeGateDecisionText('{"summary":"uses \\`code\\`"}'),
    '{"summary":"uses `code`"}'
  );
});

test("validateDecisionFile rewrites normalized gate JSON with escaped backticks", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maint-decision-test-"));
  const decisionFile = path.join(root, "decision.json");
  fs.writeFileSync(
    decisionFile,
    [
      "{",
      '  "status": "pass",',
      '  "summary": "checks \\`passed\\`",',
      '  "findings": [],',
      '  "blocking_findings": [],',
      '  "manual_uat": []',
      "}",
      "",
    ].join("\n"),
    "utf8"
  );

  validateDecisionFile(decisionFile);

  const parsed = JSON.parse(fs.readFileSync(decisionFile, "utf8"));
  assert.equal(parsed.summary, "checks `passed`");
});
