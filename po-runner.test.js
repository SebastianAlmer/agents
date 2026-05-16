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
  return {
    root,
    agentsRoot: root,
    queues,
    po: {
      intakeIdempotenceEnabled: false,
      backlogPromoteEnabled: true,
      backlogPromoteMinBusinessScore: 0,
      backlogPromoteAfterCycles: 1,
      backlogPromoteMaxPerCycle: 1,
    },
    loops: {
      bundleMinSize: 1,
      forceUnderfilledAfterCycles: 3,
      poPollSeconds: 20,
    },
    bundleFlow: {
      idPrefix: "B",
      idPad: 4,
    },
  };
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
  assert.equal(__test.normalizeWontDoDecisionReason("duplicate_of_released_carrier"), "duplicate");
  assert.equal(__test.normalizeWontDoDecisionReason("duplicate-of-canonical-carrier"), "duplicate");
  assert.equal(__test.normalizeWontDoDecisionReason("already-implemented"), "already_implemented");
  assert.equal(__test.normalizeWontDoDecisionReason("random"), "");
});

test("findDecisionArtifactForRequirement reports disabled sidecar lookup", () => {
  const runtime = createRuntimeWithQueues();
  const requirementPath = path.join(runtime.queues.backlog, "B0100-REQ-NEW-routing-hardening.md");
  writeRequirement(requirementPath, "REQ-NEW-routing-hardening", "backlog");

  const picked = __test.findDecisionArtifactForRequirement(runtime, requirementPath);
  assert.equal(picked.state, "missing");
  assert.equal(picked.path, "");
  assert.equal(picked.reason, "decision_artifacts_disabled");
});

test("recoverOrphanDecisionArtifacts is a no-op with sidecar artifacts disabled", () => {
  const runtime = createRuntimeWithQueues();
  const result = __test.recoverOrphanDecisionArtifacts(runtime, { verbose: false });
  assert.equal(result.recovered, 0);
  assert.equal(result.deduped, 0);
});

test("recoverOrphanDecisionArtifacts does not recreate sidecars when disabled", () => {
  const runtime = createRuntimeWithQueues();
  const result = __test.recoverOrphanDecisionArtifacts(runtime, { verbose: false });
  assert.equal(result.recovered, 0);
  assert.equal(result.deduped, 0);
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

test("tryPrepareReadyBundle starts final underfilled bundle when no intake candidates remain", () => {
  const runtime = createRuntimeWithQueues();
  const selectedPath = path.join(runtime.queues.selected, "REQ-TEST-004-final-bundle.md");
  writeRequirement(selectedPath, "REQ-TEST-004", "selected");

  const prepared = __test.tryPrepareReadyBundle(runtime, { verbose: false }, { underfilledSelectedCycles: 0 }, 3);

  assert.equal(prepared, true);
  const bundledPath = path.join(runtime.queues.selected, "B0001-REQ-TEST-004-final-bundle.md");
  assert.equal(fs.existsSync(bundledPath), true);

  const registryPath = path.join(runtime.root, ".runtime", "bundles", "registry.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  assert.equal(registry.ready_bundle_id, "B0001");
  assert.deepEqual(registry.bundles.B0001.sourceReqIds, ["REQ-TEST-004"]);
});

test("tryPrepareReadyBundle forces partial bundle after configured wait cycles", () => {
  const runtime = createRuntimeWithQueues();
  writeRequirement(path.join(runtime.queues.selected, "REQ-TEST-004.md"), "REQ-TEST-004", "selected");
  writeRequirement(path.join(runtime.queues.selected, "REQ-TEST-005.md"), "REQ-TEST-005", "selected");
  writeRequirement(path.join(runtime.queues.refinement, "REQ-TEST-006.md"), "REQ-TEST-006", "refinement");

  const prepared = __test.tryPrepareReadyBundle(
    runtime,
    { verbose: false },
    { underfilledSelectedCycles: 2 },
    3
  );

  assert.equal(prepared, true);
  const registryPath = path.join(runtime.root, ".runtime", "bundles", "registry.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  assert.equal(registry.ready_bundle_id, "B0001");
  assert.deepEqual(registry.bundles.B0001.sourceReqIds, ["REQ-TEST-004", "REQ-TEST-005"]);
});

test("waitReason reports actual bundle target instead of min bundle size", () => {
  const runtime = createRuntimeWithQueues();
  writeRequirement(path.join(runtime.queues.selected, "REQ-TEST-004-final-bundle.md"), "REQ-TEST-004", "selected");
  writeRequirement(path.join(runtime.queues.backlog, "REQ-TEST-005-follow-up.md"), "REQ-TEST-005", "backlog");

  const info = __test.waitReason(runtime, { bundleLocked: false }, 3, "vision");

  assert.match(info.reason, /waiting for full bundle \(1\/3\)/);
});

test("poIdleWaitMs respects poPollSeconds config", () => {
  const runtime = createRuntimeWithQueues();
  runtime.loops.poPollSeconds = 20;
  assert.equal(__test.poIdleWaitMs(runtime), 20000);
});

test("topUpSelectedFromBacklogForBundle skips manual cleanup backlog items", () => {
  const runtime = createRuntimeWithQueues();
  const selectedPath = path.join(runtime.queues.selected, "REQ-TEST-004-selected.md");
  writeRequirement(selectedPath, "REQ-TEST-004", "selected");

  const manualCleanupPath = path.join(runtime.queues.backlog, "REQ-QA-HISTORY.md");
  fs.writeFileSync(
    manualCleanupPath,
    [
      "---",
      "id: REQ-QA-HISTORY",
      "title: Historical cleanup",
      "status: backlog",
      "source: qa-gate",
      "business_score: 99",
      "---",
      "",
      "## Flow Routing Notes",
      "Manual bundle cleanup",
      "- returned to backlog after manual cleanup",
      "",
      "## Manual Cleanup Results",
      "- preserved as backlog history",
      "",
    ].join("\n"),
    "utf8"
  );

  const eligiblePath = path.join(runtime.queues.backlog, "REQ-TEST-005-follow-up.md");
  writeRequirement(eligiblePath, "REQ-TEST-005", "backlog");

  const moved = __test.topUpSelectedFromBacklogForBundle(
    runtime,
    { verbose: false },
    { bundleLocked: false, underfilledSelectedCycles: 0, items: {}, pausedCounts: {}, loopCounters: {} },
    1,
    2
  );

  assert.equal(moved, 1);
  assert.equal(fs.existsSync(path.join(runtime.queues.selected, "REQ-TEST-005-follow-up.md")), true);
  assert.equal(fs.existsSync(path.join(runtime.queues.backlog, "REQ-QA-HISTORY.md")), true);
  assert.equal(__test.isManualBundleCleanupBacklogItem(manualCleanupPath), true);
});

test("findBlockingDuplicateRequirementCopy prefers terminal winner queues", () => {
  const runtime = createRuntimeWithQueues();
  const backlogPath = path.join(runtime.queues.backlog, "REQ-NEXUS-042.md");
  writeRequirement(backlogPath, "REQ-NEXUS-042", "backlog");
  writeRequirement(
    path.join(runtime.queues.humanDecisionNeeded, "B0025-REQ-NEXUS-042.md"),
    "REQ-NEXUS-042",
    "human-decision-needed"
  );
  writeRequirement(
    path.join(runtime.queues.selected, "B0028-REQ-NEXUS-042.md"),
    "REQ-NEXUS-042",
    "selected"
  );

  const duplicate = __test.findBlockingDuplicateRequirementCopy(runtime, backlogPath);

  assert.equal(duplicate.kind, "terminal");
  assert.equal(duplicate.reasonCode, "duplicate_terminal_winner");
  assert.equal(duplicate.queueName, "humanDecisionNeeded");
});

test("promoteBacklogForProgress skips backlog items with terminal duplicate winners", () => {
  const runtime = createRuntimeWithQueues();
  const backlogPath = path.join(runtime.queues.backlog, "REQ-NEXUS-042.md");
  writeRequirement(backlogPath, "REQ-NEXUS-042", "backlog");
  writeRequirement(
    path.join(runtime.queues.humanDecisionNeeded, "B0025-REQ-NEXUS-042.md"),
    "REQ-NEXUS-042",
    "human-decision-needed"
  );

  const moved = __test.promoteBacklogForProgress(
    runtime,
    { verbose: false },
    { bundleLocked: false, underfilledSelectedCycles: 0, items: {}, pausedCounts: {}, loopCounters: {} },
    1
  );

  assert.equal(moved, false);
  assert.equal(fs.existsSync(path.join(runtime.queues.selected, "REQ-NEXUS-042.md")), false);
  assert.equal(fs.existsSync(backlogPath), true);
});

test("topUpSelectedFromBacklogForBundle skips duplicate-backed backlog items", () => {
  const runtime = createRuntimeWithQueues();
  writeRequirement(path.join(runtime.queues.selected, "REQ-TEST-004-selected.md"), "REQ-TEST-004", "selected");

  const duplicateBacklogPath = path.join(runtime.queues.backlog, "REQ-NEXUS-042.md");
  writeRequirement(duplicateBacklogPath, "REQ-NEXUS-042", "backlog");
  writeRequirement(
    path.join(runtime.queues.humanDecisionNeeded, "B0025-REQ-NEXUS-042.md"),
    "REQ-NEXUS-042",
    "human-decision-needed"
  );

  const eligiblePath = path.join(runtime.queues.backlog, "REQ-TEST-005-follow-up.md");
  writeRequirement(eligiblePath, "REQ-TEST-005", "backlog");

  const moved = __test.topUpSelectedFromBacklogForBundle(
    runtime,
    { verbose: false },
    { bundleLocked: false, underfilledSelectedCycles: 0, items: {}, pausedCounts: {}, loopCounters: {} },
    1,
    2
  );

  assert.equal(moved, 1);
  assert.equal(fs.existsSync(path.join(runtime.queues.selected, "REQ-NEXUS-042.md")), false);
  assert.equal(fs.existsSync(path.join(runtime.queues.selected, "REQ-TEST-005-follow-up.md")), true);
  assert.equal(fs.existsSync(duplicateBacklogPath), true);
});
