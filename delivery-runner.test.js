const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeBundleRegistry } = require("./lib/flow-core");

const {
  gateFromAgentResult,
  createQaExecutionFailureGate,
  isTechnicalGateFailure,
  routeTechnicalGateFailureToHumanInput,
  findingsFingerprint,
  shouldSkipMaintForReleasedBundle,
  __test,
} = require("./delivery-runner");

function mkTempQueues() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-runner-test-"));
  const qaDir = path.join(root, "requirements", "qa");
  const devDir = path.join(root, "requirements", "dev");
  const humanInputDir = path.join(root, "requirements", "human-input");
  const humanDecisionNeededDir = path.join(root, "requirements", "human-decision-needed");
  fs.mkdirSync(qaDir, { recursive: true });
  fs.mkdirSync(devDir, { recursive: true });
  fs.mkdirSync(humanInputDir, { recursive: true });
  fs.mkdirSync(humanDecisionNeededDir, { recursive: true });
  return { root, qaDir, devDir, humanInputDir, humanDecisionNeededDir };
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

test("gateFromAgentResult keeps a definitive parsed gate even when the runner exits non-zero", () => {
  const gate = gateFromAgentResult({
    result: { ok: false, exitCode: 1, stderr: "qa exited after persisting fail gate" },
    parsedGate: {
      status: "fail",
      summary: "QA batch-tests failed to produce a definitive gate result",
      blocking_findings: ["P1: QA batch-tests did not finish with a definitive gate result."],
      findings: [
        {
          severity: "P1",
          title: "QA batch-tests technical failure",
          details: "QA batch-tests execution failed: invalid gate",
        },
      ],
      manual_uat: [],
      failure_type: "technical_gate_invalid",
    },
    createFailureGate: createQaExecutionFailureGate,
    command: "node qa/qa.js --auto --batch-tests",
    gateLabel: "QA bundle gate",
  });

  assert.equal(gate.failure_type, "technical_gate_invalid");
  assert.equal(gate.summary, "QA batch-tests failed to produce a definitive gate result");
  assert.equal(isTechnicalGateFailure(gate), true);
});

test("technical gate failure routes to dev first, then escalates after retries", () => {
  const { root, qaDir, devDir, humanDecisionNeededDir } = mkTempQueues();

  const writeReq = (dir) => {
    const reqPath = path.join(dir, "REQ-TEST.md");
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
    return reqPath;
  };

  const mkRuntime = () => ({
    agentsRoot: root,
    bundleFlow: {
      enabled: false,
      allowCrossBundleMoves: true,
    },
    deliveryQuality: {
      routeToDevOnFail: true,
      maxFixCycles: 2,
    },
    queues: {
      qa: qaDir,
      dev: devDir,
      humanDecisionNeeded: humanDecisionNeededDir,
    },
  });
  const controls = { verbose: false };
  const gate = {
    status: "fail",
    summary: "QA bundle gate completed without writing a definitive gate result.",
    blocking_findings: [],
    findings: [],
    manual_uat: [],
    failure_type: "technical_gate_pending",
  };

  // First failure: should route to dev
  writeReq(qaDir);
  const routed1 = routeTechnicalGateFailureToHumanInput(mkRuntime(), controls, {
    gateName: "qa",
    sourceQueue: "qa",
    gate,
  });
  assert.equal(routed1.progressed, true);
  assert.equal(routed1.routedTo, "dev");
  assert.equal(fs.existsSync(path.join(devDir, "REQ-TEST.md")), true);
  assert.equal(fs.existsSync(path.join(qaDir, "REQ-TEST.md")), false);

  // Second failure: still routes to dev (attempt 2 <= maxFixCycles 2)
  fs.renameSync(path.join(devDir, "REQ-TEST.md"), path.join(qaDir, "REQ-TEST.md"));
  const routed2 = routeTechnicalGateFailureToHumanInput(mkRuntime(), controls, {
    gateName: "qa",
    sourceQueue: "qa",
    gate,
  });
  assert.equal(routed2.progressed, true);
  assert.equal(routed2.routedTo, "dev");

  // Third failure: retries exhausted, escalates to human-decision-needed
  fs.renameSync(path.join(devDir, "REQ-TEST.md"), path.join(qaDir, "REQ-TEST.md"));
  const routed3 = routeTechnicalGateFailureToHumanInput(mkRuntime(), controls, {
    gateName: "qa",
    sourceQueue: "qa",
    gate,
  });
  assert.equal(routed3.progressed, true);
  assert.equal(routed3.routedTo, "human-decision-needed");
  assert.equal(fs.existsSync(path.join(humanDecisionNeededDir, "REQ-TEST.md")), true);
});

function mkTempReleasedQueue() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-runner-maint-test-"));
  const releasedDir = path.join(root, "requirements", "released");
  fs.mkdirSync(releasedDir, { recursive: true });
  return { root, releasedDir };
}

function writeReleasedReq(releasedDir, fileName, frontMatter) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontMatter || {})) {
    lines.push(`${key}: ${value}`);
  }
  lines.push("---", "", "# Goal", "test");
  fs.writeFileSync(path.join(releasedDir, fileName), `${lines.join("\n")}\n`, "utf8");
}

test("shouldSkipMaintForReleasedBundle skips maint-only released bundles", () => {
  const { releasedDir } = mkTempReleasedQueue();
  writeReleasedReq(releasedDir, "A.md", {
    id: "REQ-MAINT-HOTFIX-2026-03-03T06-20-54-077Z",
    source: "maint-gate",
    bundle_id: "B9999",
  });
  writeReleasedReq(releasedDir, "B.md", {
    id: "REQ-MAINT-FOLLOWUP-2026-03-03T06-20-54-078Z",
    source: "maint-gate",
    bundle_id: "B9999",
  });

  const verdict = shouldSkipMaintForReleasedBundle({
    queues: { released: releasedDir },
  });
  assert.equal(verdict.skip, true);
  assert.equal(verdict.bundleId, "B9999");
});

test("shouldSkipMaintForReleasedBundle does not skip mixed-scope released bundles", () => {
  const { releasedDir } = mkTempReleasedQueue();
  writeReleasedReq(releasedDir, "A.md", {
    id: "REQ-MAINT-HOTFIX-2026-03-03T06-20-54-077Z",
    source: "maint-gate",
    bundle_id: "B9998",
  });
  writeReleasedReq(releasedDir, "B.md", {
    id: "REQ-NEW-user-facing-feature",
    source: "reqeng-chat",
    bundle_id: "B9998",
  });

  const verdict = shouldSkipMaintForReleasedBundle({
    queues: { released: releasedDir },
  });
  assert.equal(verdict.skip, false);
  assert.equal(verdict.bundleId, "B9998");
});

test("resumeActiveBundleSelectedIntake requeues selected work for an active bundle", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-runner-active-bundle-test-"));
  const selectedDir = path.join(root, "requirements", "selected");
  const archDir = path.join(root, "requirements", "arch");
  const bundlesDir = path.join(root, ".runtime", "bundles");
  fs.mkdirSync(selectedDir, { recursive: true });
  fs.mkdirSync(archDir, { recursive: true });
  fs.mkdirSync(bundlesDir, { recursive: true });

  const bundleId = "B1234";
  writeBundleRegistry(root, {
    version: 1,
    next_bundle_seq: 2,
    active_bundle_id: bundleId,
    ready_bundle_id: "",
    bundles: {
      [bundleId]: {
        id: bundleId,
        seq: 1,
        status: "active",
        createdAt: "2026-03-28T18:00:00Z",
        startedAt: "2026-03-28T18:01:00Z",
        finishedAt: "",
        sourceReqIds: ["REQ-TEST"],
        carryoversIn: [],
        carryoversOut: [],
      },
    },
    updatedAt: "2026-03-28T18:01:00Z",
  });

  const reqPath = path.join(selectedDir, `${bundleId}-REQ-TEST.md`);
  fs.writeFileSync(
    reqPath,
    [
      "---",
      "id: REQ-TEST",
      "title: Test requirement",
      "status: selected",
      `bundle_id: ${bundleId}`,
      "bundle_seq: 1",
      "---",
      "",
      "# Goal",
      "Resume active bundle.",
      "",
    ].join("\n"),
    "utf8"
  );

  const runtime = {
    agentsRoot: root,
    queues: {
      selected: selectedDir,
      arch: archDir,
    },
  };

  const result = __test.resumeActiveBundleSelectedIntake(runtime, { verbose: false });
  assert.equal(result.progressed, true);
  assert.equal(fs.existsSync(reqPath), false);

  const archPath = path.join(archDir, `${bundleId}-REQ-TEST.md`);
  assert.equal(fs.existsSync(archPath), true);
  const raw = fs.readFileSync(archPath, "utf8");
  assert.match(raw, /^---\nid: REQ-TEST[\s\S]*\nstatus: arch\n/m);
  assert.match(raw, /Delivery runner: active bundle resume/);
});

test("findingsFingerprint for maint ignores count-only churn", () => {
  const a = findingsFingerprint("maint", "selected", [
    {
      severity: "P1",
      title: "Unclassified i18n candidates (candidateCount=83)",
      details: "web i18n:audit:auth enCount=1548 deCount=1548 enOnly=0 deOnly=0",
    },
  ]);
  const b = findingsFingerprint("maint", "selected", [
    {
      severity: "P1",
      title: "Unclassified i18n candidates (candidateCount=65)",
      details: "web i18n:audit:auth enCount=1560 deCount=1560 enOnly=0 deOnly=0",
    },
  ]);
  assert.equal(a, b);
});

function initGitRepoWithBranch(branchName) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-runner-branch-test-"));
  const repoRoot = path.join(root, "repo");
  const agentsRoot = path.join(root, "agents");
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.mkdirSync(agentsRoot, { recursive: true });

  childProcess.execFileSync("git", ["init", "-b", branchName], { cwd: repoRoot });
  childProcess.execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoRoot });
  childProcess.execFileSync("git", ["config", "user.name", "Test User"], { cwd: repoRoot });
  fs.writeFileSync(path.join(repoRoot, "README.md"), "test\n", "utf8");
  childProcess.execFileSync("git", ["add", "README.md"], { cwd: repoRoot });
  childProcess.execFileSync("git", ["commit", "-m", "init"], { cwd: repoRoot });

  return { root, repoRoot, agentsRoot };
}

test("workspace branch setup stays on current branch when disabled in config", () => {
  const { repoRoot, agentsRoot } = initGitRepoWithBranch("feature/manual");
  const runtime = {
    repoRoot,
    agentsRoot,
    deliveryRunner: {
      workspaceBranchesEnabled: false,
    },
    bundleFlow: {
      idPrefix: "B",
      idPad: 4,
      branchPrefix: "rb",
    },
    releaseAutomation: {
      baseBranch: "main",
      remote: "origin",
    },
  };

  const outcome = __test.ensureBundleWorkspaceBranch(runtime, { verbose: false }, "B0001");
  const currentBranch = childProcess.execFileSync(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: repoRoot, encoding: "utf8" }
  ).trim();
  const branches = childProcess.execFileSync(
    "git",
    ["branch", "--format=%(refname:short)"],
    { cwd: repoRoot, encoding: "utf8" }
  ).trim().split(/\r?\n/).filter(Boolean);

  assert.equal(outcome.ok, true);
  assert.equal(outcome.branch, "feature/manual");
  assert.equal(currentBranch, "feature/manual");
  assert.deepEqual(branches, ["feature/manual"]);
});

test("workspace branch enforcement is a no-op when disabled in config", () => {
  const { repoRoot, agentsRoot } = initGitRepoWithBranch("feature/manual");
  writeBundleRegistry(agentsRoot, {
    active_bundle_id: "B0001",
    ready_bundle_id: "",
    bundles: {
      B0001: {
        id: "B0001",
        status: "active",
      },
    },
  });

  const runtime = {
    repoRoot,
    agentsRoot,
    deliveryRunner: {
      workspaceBranchesEnabled: false,
    },
    bundleFlow: {
      enabled: true,
      idPrefix: "B",
      idPad: 4,
      branchPrefix: "rb",
    },
    releaseAutomation: {
      baseBranch: "main",
      remote: "origin",
    },
  };

  const outcome = __test.enforceActiveWorkspaceBranch(runtime, { verbose: false });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.branch, "feature/manual");
});

function mkTempUatRuntime() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-runner-uat-test-"));
  const qaDir = path.join(root, "requirements", "qa");
  const uxDir = path.join(root, "requirements", "ux");
  const secDir = path.join(root, "requirements", "sec");
  const deployDir = path.join(root, "requirements", "deploy");
  const releasedDir = path.join(root, "requirements", "released");
  const blockedDir = path.join(root, "requirements", "blocked");
  fs.mkdirSync(qaDir, { recursive: true });
  fs.mkdirSync(uxDir, { recursive: true });
  fs.mkdirSync(secDir, { recursive: true });
  fs.mkdirSync(deployDir, { recursive: true });
  fs.mkdirSync(releasedDir, { recursive: true });
  fs.mkdirSync(blockedDir, { recursive: true });
  fs.writeFileSync(path.join(deployDir, "REQ-DEPLOY.md"), "---\nid: REQ-DEPLOY\n---\n", "utf8");
  fs.writeFileSync(path.join(releasedDir, "REQ-RELEASED.md"), "---\nid: REQ-RELEASED\n---\n", "utf8");
  return {
    root,
    runtime: {
      agentsRoot: root,
      repoRoot: root,
      deliveryQuality: {
        uatEnabled: false,
      },
      queues: {
        qa: qaDir,
        ux: uxDir,
        sec: secDir,
        deploy: deployDir,
        blocked: blockedDir,
        released: releasedDir,
      },
    },
  };
}

test("uat bundle is skipped when disabled in config", async () => {
  const { runtime } = mkTempUatRuntime();
  const result = await __test.runUatBundle(runtime, { verbose: false });

  assert.equal(result.progressed, false);
  assert.equal(result.gate, null);
  assert.equal(result.skipped, true);
});

test("uat full regression is skipped when disabled in config", async () => {
  const { runtime } = mkTempUatRuntime();
  const result = await __test.runUatFullRegression(runtime, { verbose: false });

  assert.equal(result.progressed, false);
  assert.equal(result.gate, null);
  assert.equal(result.skipped, true);
});

test("fast downstream skips deploy actions and releases directly", async () => {
  const { runtime } = mkTempUatRuntime();
  const result = await __test.runFastDownstream(runtime, { verbose: false });

  assert.equal(result.progressed, true);
  assert.equal(fs.existsSync(path.join(runtime.queues.deploy, "REQ-DEPLOY.md")), false);
  assert.equal(fs.existsSync(path.join(runtime.queues.released, "REQ-DEPLOY.md")), true);
});

test("fast downstream completes active bundle after direct release", async () => {
  const { root, runtime } = mkTempUatRuntime();
  const bundleId = "B0042";
  const deployPath = path.join(runtime.queues.deploy, `${bundleId}-REQ-DEPLOY.md`);
  fs.writeFileSync(
    deployPath,
    [
      "---",
      "id: REQ-DEPLOY",
      "title: Deploy test",
      "status: deploy",
      `bundle_id: ${bundleId}`,
      "bundle_seq: 42",
      "---",
      "",
      "# Goal",
      "release directly",
      "",
    ].join("\n"),
    "utf8"
  );
  writeBundleRegistry(root, {
    version: 1,
    next_bundle_seq: 43,
    active_bundle_id: bundleId,
    ready_bundle_id: "",
    bundles: {
      [bundleId]: {
        id: bundleId,
        seq: 42,
        status: "active",
        createdAt: "2026-03-29T16:00:00Z",
        startedAt: "2026-03-29T16:01:00Z",
        finishedAt: "",
        sourceReqIds: ["REQ-DEPLOY"],
        carryoversIn: [],
        carryoversOut: [],
      },
    },
    updatedAt: "2026-03-29T16:01:00Z",
  });
  runtime.bundleFlow = {
    enabled: true,
    allowCrossBundleMoves: false,
  };

  const result = await __test.runFastDownstream(runtime, { verbose: false });
  const registry = JSON.parse(fs.readFileSync(path.join(root, ".runtime", "bundles", "registry.json"), "utf8"));

  assert.equal(result.progressed, true);
  assert.equal(registry.active_bundle_id, "");
  assert.equal(registry.bundles[bundleId].status, "completed");
  assert.equal(fs.existsSync(path.join(runtime.queues.released, `${bundleId}-REQ-DEPLOY.md`)), true);
});

test("release history update blocks release when history and source are missing", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-runner-release-history-missing-test-"));
  const runtime = {
    agentsRoot: root,
    releaseHistory: {
      enabled: true,
      agent: "deploy",
      file: path.join(root, "repo", "docs", "release-history.md"),
      sourceFile: path.join(root, "repo", "docs", "missing-source.md"),
    },
    queues: {
      released: path.join(root, "requirements", "released"),
    },
  };
  fs.mkdirSync(runtime.queues.released, { recursive: true });

  const result = await __test.runReleaseHistoryUpdate(runtime, { verbose: false }, {
    bundleId: "B0013",
    version: "0.1.13",
    previousVersion: "0.1.12",
  });

  assert.equal(result.ok, false);
  assert.equal(result.skipped, false);
  assert.match(result.reason, /source cannot be read/);
});

test("release-pending active bundles are not completed by direct released-drain cleanup", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-runner-release-pending-test-"));
  const releasedDir = path.join(root, "requirements", "released");
  fs.mkdirSync(releasedDir, { recursive: true });
  const bundleId = "B0077";
  fs.writeFileSync(
    path.join(releasedDir, `${bundleId}-REQ-RELEASED.md`),
    [
      "---",
      "id: REQ-RELEASED",
      "status: released",
      `bundle_id: ${bundleId}`,
      "---",
      "",
      "# Goal",
      "released",
      "",
    ].join("\n"),
    "utf8"
  );
  writeBundleRegistry(root, {
    active_bundle_id: bundleId,
    ready_bundle_id: "",
    bundles: {
      [bundleId]: {
        id: bundleId,
        status: "release-pending",
        releaseVersion: "0.1.77",
      },
    },
  });

  const completed = __test.completeReleasedBundleWithoutDeploy({
    agentsRoot: root,
    queues: {
      selected: path.join(root, "requirements", "selected"),
      arch: path.join(root, "requirements", "arch"),
      dev: path.join(root, "requirements", "dev"),
      qa: path.join(root, "requirements", "qa"),
      ux: path.join(root, "requirements", "ux"),
      sec: path.join(root, "requirements", "sec"),
      deploy: path.join(root, "requirements", "deploy"),
      released: releasedDir,
    },
  }, { verbose: false });

  const registry = JSON.parse(fs.readFileSync(path.join(root, ".runtime", "bundles", "registry.json"), "utf8"));
  assert.equal(completed, false);
  assert.equal(registry.active_bundle_id, bundleId);
  assert.equal(registry.bundles[bundleId].status, "release-pending");
});

test("quarantineForeignExecutionQueues blocks foreign active-stage bundle files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-runner-scope-test-"));
  const qaDir = path.join(root, "requirements", "qa");
  const blockedDir = path.join(root, "requirements", "blocked");
  fs.mkdirSync(qaDir, { recursive: true });
  fs.mkdirSync(blockedDir, { recursive: true });

  const activeBundleId = "B0100";
  const foreignBundleId = "B0101";
  writeBundleRegistry(root, {
    version: 1,
    next_bundle_seq: 102,
    active_bundle_id: activeBundleId,
    ready_bundle_id: "",
    bundles: {
      [activeBundleId]: { id: activeBundleId, seq: 100, status: "active" },
      [foreignBundleId]: { id: foreignBundleId, seq: 101, status: "active" },
    },
    updatedAt: "2026-03-29T16:20:00Z",
  });

  const writeReq = (bundleId, fileName) => {
    fs.writeFileSync(
      path.join(qaDir, fileName),
      [
        "---",
        `id: ${fileName.replace(/\.md$/i, "")}`,
        "title: Scope test",
        "status: qa",
        `bundle_id: ${bundleId}`,
        "---",
        "",
        "# Goal",
        "scope test",
        "",
      ].join("\n"),
      "utf8"
    );
  };

  writeReq(activeBundleId, `${activeBundleId}-REQ-ACTIVE.md`);
  writeReq(foreignBundleId, `${foreignBundleId}-REQ-FOREIGN.md`);

  const runtime = {
    agentsRoot: root,
    bundleFlow: {
      enabled: true,
      allowCrossBundleMoves: false,
    },
    queues: {
      arch: path.join(root, "requirements", "arch"),
      dev: path.join(root, "requirements", "dev"),
      qa: qaDir,
      ux: path.join(root, "requirements", "ux"),
      sec: path.join(root, "requirements", "sec"),
      deploy: path.join(root, "requirements", "deploy"),
      blocked: blockedDir,
    },
  };
  for (const queueName of ["arch", "dev", "ux", "sec", "deploy"]) {
    fs.mkdirSync(runtime.queues[queueName], { recursive: true });
  }

  const moved = __test.quarantineForeignExecutionQueues(runtime, { verbose: false });

  assert.equal(moved, 1);
  assert.equal(fs.existsSync(path.join(qaDir, `${activeBundleId}-REQ-ACTIVE.md`)), true);
  assert.equal(fs.existsSync(path.join(qaDir, `${foreignBundleId}-REQ-FOREIGN.md`)), false);
  assert.equal(fs.existsSync(path.join(blockedDir, `${foreignBundleId}-REQ-FOREIGN.md`)), true);
});

test("collectConflictingRequirementDuplicates ignores terminal-only history and reports active conflicts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-runner-duplicate-diagnostic-test-"));
  const selectedDir = path.join(root, "requirements", "selected");
  const releasedDir = path.join(root, "requirements", "released");
  const humanDecisionNeededDir = path.join(root, "requirements", "human-decision-needed");
  fs.mkdirSync(selectedDir, { recursive: true });
  fs.mkdirSync(releasedDir, { recursive: true });
  fs.mkdirSync(humanDecisionNeededDir, { recursive: true });

  const writeReq = (dir, fileName, id, status) => {
    fs.writeFileSync(
      path.join(dir, fileName),
      [
        "---",
        `id: ${id}`,
        "title: Duplicate diagnostic",
        `status: ${status}`,
        "---",
        "",
        "# Goal",
        "diagnose duplicates",
        "",
      ].join("\n"),
      "utf8"
    );
  };

  writeReq(releasedDir, "B0001-REQ-HISTORY.md", "REQ-HISTORY", "released");
  writeReq(releasedDir, "B0002-REQ-HISTORY.md", "REQ-HISTORY", "released");
  writeReq(humanDecisionNeededDir, "B0025-REQ-NEXUS-042.md", "REQ-NEXUS-042", "human-decision-needed");
  writeReq(selectedDir, "B0028-REQ-NEXUS-042.md", "REQ-NEXUS-042", "selected");

  const runtime = {
    agentsRoot: root,
    queues: {
      selected: selectedDir,
      released: releasedDir,
      humanDecisionNeeded: humanDecisionNeededDir,
    },
  };

  const conflicts = __test.collectConflictingRequirementDuplicates(runtime);

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].id, "REQ-NEXUS-042");
  assert.equal(conflicts[0].reason, "terminal-wins-conflict");
  assert.deepEqual(
    conflicts[0].copies.map((item) => item.queueName).sort(),
    ["humanDecisionNeeded", "selected"]
  );
});

test("sanitizeBundleRegistryState suppresses ready bundle items with terminal winners", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-runner-ready-duplicate-test-"));
  const selectedDir = path.join(root, "requirements", "selected");
  const backlogDir = path.join(root, "requirements", "backlog");
  const humanDecisionNeededDir = path.join(root, "requirements", "human-decision-needed");
  fs.mkdirSync(selectedDir, { recursive: true });
  fs.mkdirSync(backlogDir, { recursive: true });
  fs.mkdirSync(humanDecisionNeededDir, { recursive: true });

  const bundleId = "B0028";
  const selectedPath = path.join(selectedDir, `${bundleId}-REQ-NEXUS-042.md`);
  fs.writeFileSync(
    selectedPath,
    [
      "---",
      "id: REQ-NEXUS-042",
      "title: Nexus Supervisor Agent Identity and Role",
      "status: selected",
      `bundle_id: ${bundleId}`,
      "bundle_seq: 28",
      "---",
      "",
      "# Goal",
      "duplicate selected copy",
      "",
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(humanDecisionNeededDir, "B0025-REQ-NEXUS-042.md"),
    [
      "---",
      "id: REQ-NEXUS-042",
      "title: Nexus Supervisor Agent Identity and Role",
      "status: human-decision-needed",
      "bundle_id: B0025",
      "bundle_seq: 25",
      "---",
      "",
      "# Goal",
      "canonical human decision copy",
      "",
    ].join("\n"),
    "utf8"
  );

  writeBundleRegistry(root, {
    version: 1,
    next_bundle_seq: 29,
    active_bundle_id: "",
    ready_bundle_id: bundleId,
    bundles: {
      [bundleId]: {
        id: bundleId,
        seq: 28,
        status: "ready",
        createdAt: "2026-03-29T16:02:12.443Z",
        startedAt: "",
        finishedAt: "",
        sourceReqIds: ["REQ-NEXUS-042"],
        carryoversIn: [],
        carryoversOut: [],
      },
    },
    updatedAt: "2026-03-29T16:17:42.817Z",
  });

  const runtime = {
    agentsRoot: root,
    queues: {
      selected: selectedDir,
      backlog: backlogDir,
      humanDecisionNeeded: humanDecisionNeededDir,
    },
  };

  __test.sanitizeBundleRegistryState(runtime, { verbose: false }, "startup");

  const backlogPath = path.join(backlogDir, `${bundleId}-REQ-NEXUS-042.md`);
  const registry = JSON.parse(fs.readFileSync(path.join(root, ".runtime", "bundles", "registry.json"), "utf8"));

  assert.equal(fs.existsSync(selectedPath), false);
  assert.equal(fs.existsSync(backlogPath), true);
  assert.equal(registry.ready_bundle_id, "");
  assert.equal(registry.bundles[bundleId].status, "aborted");
  assert.deepEqual(registry.bundles[bundleId].sourceReqIds, []);

  const backlogRaw = fs.readFileSync(backlogPath, "utf8");
  assert.match(backlogRaw, /^---\nid: REQ-NEXUS-042[\s\S]*\nstatus: backlog\n/m);
  assert.doesNotMatch(backlogRaw, /\nbundle_id\s*:/);
  assert.match(backlogRaw, /Delivery runner duplicate cleanup/);
  assert.match(backlogRaw, /human-decision-needed/);
  assert.match(backlogRaw, /No active bundle assignment\./);
});
