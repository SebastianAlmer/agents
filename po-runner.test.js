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

function createRuntimeWithQueues() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "po-runner-queues-"));
  const queues = {
    refinement: path.join(root, "refinement"),
    backlog: path.join(root, "backlog"),
    selected: path.join(root, "selected"),
    arch: path.join(root, "arch"),
    dev: path.join(root, "dev"),
    qa: path.join(root, "qa"),
    sec: path.join(root, "sec"),
    ux: path.join(root, "ux"),
    deploy: path.join(root, "deploy"),
    released: path.join(root, "released"),
    toClarify: path.join(root, "to-clarify"),
    humanInput: path.join(root, "human-input"),
    humanDecisionNeeded: path.join(root, "human-decision-needed"),
    wontDo: path.join(root, "wont-do"),
    blocked: path.join(root, "blocked"),
  };
  for (const dir of Object.values(queues)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return { root, queues };
}

function writeRequirement(filePath, id, status = "refinement") {
  const body = [
    "---",
    `id: ${id}`,
    `title: ${id} title`,
    `status: ${status}`,
    "source: test",
    "implementation_scope: backend",
    "visual_change_intent: false",
    "baseline_decision: none",
    "---",
    "",
    "# Goal",
    "Test requirement.",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, body, "utf8");
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

test("normalizeWontDoDecisionReason allows only configured enum reasons", () => {
  assert.equal(__test.normalizeWontDoDecisionReason("duplicate"), "duplicate");
  assert.equal(__test.normalizeWontDoDecisionReason("already-implemented"), "already_implemented");
  assert.equal(__test.normalizeWontDoDecisionReason("random"), "");
});

test("findDecisionArtifactForRequirement resolves by canonical requirement id", () => {
  const runtime = createRuntimeWithQueues();
  const requirementPath = path.join(runtime.queues.backlog, "B0100-REQ-NEW-routing-hardening.md");
  const artifactPath = path.join(runtime.queues.refinement, "REQ-NEW-routing-hardening.md.decision.json");
  writeRequirement(requirementPath, "REQ-NEW-routing-hardening", "backlog");
  fs.writeFileSync(
    artifactPath,
    JSON.stringify({
      status: "wont-do",
      target_queue: "wont-do",
      decision_reason: "duplicate",
      summary: "Duplicate requirement.",
    }),
    "utf8"
  );

  const picked = __test.findDecisionArtifactForRequirement(runtime, requirementPath);
  assert.equal(picked.state, "ok");
  assert.equal(picked.path, artifactPath);
  assert.equal(picked.data.decision_reason, "duplicate");
});

test("recoverOrphanDecisionArtifacts dedupes sidecars when canonical requirement exists", () => {
  const runtime = createRuntimeWithQueues();
  const canonicalPath = path.join(runtime.queues.backlog, "B0101-REQ-NEW-sidecar-dedupe.md");
  const sidecarPath = path.join(runtime.queues.refinement, "REQ-NEW-sidecar-dedupe.md.decision.json");
  const attachedPath = sidecarPath.slice(0, -".decision.json".length);

  writeRequirement(canonicalPath, "REQ-NEW-sidecar-dedupe", "backlog");
  fs.writeFileSync(
    sidecarPath,
    JSON.stringify({
      status: "selected",
      target_queue: "selected",
      summary: "Ready now.",
    }),
    "utf8"
  );

  const result = __test.recoverOrphanDecisionArtifacts(runtime, { verbose: false });
  assert.equal(result.recovered, 0);
  assert.equal(result.deduped, 1);
  assert.equal(fs.existsSync(sidecarPath), false);
  assert.equal(fs.existsSync(attachedPath), false);
});

test("recoverOrphanDecisionArtifacts recovers orphan sidecar when no canonical requirement exists", () => {
  const runtime = createRuntimeWithQueues();
  const sidecarPath = path.join(runtime.queues.refinement, "REQ-NEW-sidecar-recover.md.decision.json");
  const attachedPath = sidecarPath.slice(0, -".decision.json".length);
  fs.writeFileSync(
    sidecarPath,
    JSON.stringify({
      id: "REQ-NEW-sidecar-recover",
      status: "selected",
      target_queue: "selected",
      summary: "Recovered from sidecar.",
    }),
    "utf8"
  );

  const result = __test.recoverOrphanDecisionArtifacts(runtime, { verbose: false });
  assert.equal(result.recovered, 1);
  assert.equal(result.deduped, 0);
  assert.equal(fs.existsSync(attachedPath), true);
  const recoveredRaw = fs.readFileSync(attachedPath, "utf8");
  assert.match(recoveredRaw, /target_queue:\s*selected/i);
  assert.match(recoveredRaw, /decision_reason:\s*selected_ready_now/i);
});

test("extractPoResultsStatusFromRequirement reads closed status from PO block", () => {
  const filePath = writeTempRequirement(
    [
      "---",
      "id: REQ-TEST",
      "title: Test",
      "status: refinement",
      "---",
      "",
      "## PO Results",
      "- status: closed",
      "- target: wontDo",
      "- decision_reason: already_implemented",
      "",
    ].join("\n")
  );

  assert.equal(__test.extractPoResultsStatusFromRequirement(filePath), "closed");
});
