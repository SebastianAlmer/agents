const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { __test } = require("./po-runner");

function writeTempRequirement(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "po-runner-test-"));
  const filePath = path.join(root, "REQ-TEST.md");
  fs.writeFileSync(filePath, body, "utf8");
  return filePath;
}

test("isAlreadyImplementedClaim detects explicit already-implemented decisions", () => {
  assert.equal(
    __test.isAlreadyImplementedClaim({
      statusRaw: "already-implemented",
      summary: "duplicate",
      findings: [],
    }),
    true
  );
  assert.equal(
    __test.isAlreadyImplementedClaim({
      statusRaw: "clarify",
      summary: "not already implemented; requires delivery work",
      findings: [],
    }),
    false
  );
});

test("evaluateAlreadyImplementedEvidence passes with complete AC evidence", () => {
  const filePath = writeTempRequirement(
    [
      "---",
      "id: REQ-TEST",
      "title: Test",
      "status: refinement",
      "---",
      "",
      "## Acceptance Criteria",
      "1. First acceptance criterion",
      "2. Second acceptance criterion",
      "",
      "## AC Evidence",
      "- AC-1: fulfilled + Evidence: web/src/components/example.tsx:42",
      "- AC-2: fulfilled + Evidence: tests/e2e/flow.spec.ts",
      "",
    ].join("\n")
  );

  const report = __test.evaluateAlreadyImplementedEvidence(filePath);
  assert.equal(report.complete, true);
  assert.equal(report.acCount, 2);
  assert.equal(report.fulfilledCount, 2);
  assert.equal(report.gaps.length, 0);
});

test("evaluateAlreadyImplementedEvidence fails when one AC is missing", () => {
  const filePath = writeTempRequirement(
    [
      "---",
      "id: REQ-TEST",
      "title: Test",
      "status: refinement",
      "---",
      "",
      "## Acceptance Criteria",
      "1. First acceptance criterion",
      "2. Second acceptance criterion",
      "",
      "## AC Evidence",
      "- AC-1: fulfilled + Evidence: web/src/components/example.tsx:42",
      "",
    ].join("\n")
  );

  const report = __test.evaluateAlreadyImplementedEvidence(filePath);
  assert.equal(report.complete, false);
  assert.equal(report.acCount, 2);
  assert.equal(report.fulfilledCount, 1);
  assert.match(report.gaps.join("\n"), /AC-2/i);
});

test("evaluateAlreadyImplementedEvidence fails on not-fulfilled or invalid evidence", () => {
  const filePath = writeTempRequirement(
    [
      "---",
      "id: REQ-TEST",
      "title: Test",
      "status: refinement",
      "---",
      "",
      "## Acceptance Criteria",
      "1. First acceptance criterion",
      "",
      "## AC Evidence",
      "- AC-1: not-fulfilled + Evidence: looked manually",
      "",
    ].join("\n")
  );

  const report = __test.evaluateAlreadyImplementedEvidence(filePath);
  assert.equal(report.complete, false);
  assert.equal(report.acCount, 1);
  assert.equal(report.fulfilledCount, 0);
  assert.match(report.gaps.join("\n"), /not fully implemented|test\/screen artifact|file:line/i);
});
