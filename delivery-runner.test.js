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
  const deployDir = path.join(root, "requirements", "deploy");
  const releasedDir = path.join(root, "requirements", "released");
  fs.mkdirSync(deployDir, { recursive: true });
  fs.mkdirSync(releasedDir, { recursive: true });
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
        deploy: deployDir,
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
