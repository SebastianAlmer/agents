const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadRuntimeConfig } = require("./runtime");

test("loadRuntimeConfig maps delivery_runner.workspace_branches_enabled", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-config-test-"));
  const repoRoot = path.join(root, "repo");
  fs.mkdirSync(repoRoot, { recursive: true });

  fs.writeFileSync(
    path.join(root, "config.defaults.toml"),
    [
      "[paths]",
      `repo_root = ${JSON.stringify(repoRoot)}`,
      "",
      "[delivery_runner]",
      'default_mode = "full"',
      "workspace_branches_enabled = true",
      "",
      "[codex]",
      'model = "gpt-5.3-codex-spark"',
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      'model_reasoning_effort = "medium"',
      "",
    ].join("\n"),
    "utf8"
  );

  fs.writeFileSync(
    path.join(root, "config.local.toml"),
    [
      "[delivery_runner]",
      "workspace_branches_enabled = false",
      "",
    ].join("\n"),
    "utf8"
  );

  const runtime = loadRuntimeConfig(root);
  assert.equal(runtime.deliveryRunner.workspaceBranchesEnabled, false);
});

test("loadRuntimeConfig maps delivery_quality.uat_enabled", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-config-uat-test-"));
  const repoRoot = path.join(root, "repo");
  fs.mkdirSync(repoRoot, { recursive: true });

  fs.writeFileSync(
    path.join(root, "config.defaults.toml"),
    [
      "[paths]",
      `repo_root = ${JSON.stringify(repoRoot)}`,
      "",
      "[delivery_quality]",
      "uat_enabled = true",
      "",
      "[codex]",
      'model = "gpt-5.3-codex-spark"',
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      'model_reasoning_effort = "medium"',
      "",
    ].join("\n"),
    "utf8"
  );

  fs.writeFileSync(
    path.join(root, "config.local.toml"),
    [
      "[delivery_quality]",
      "uat_enabled = false",
      "",
    ].join("\n"),
    "utf8"
  );

  const runtime = loadRuntimeConfig(root);
  assert.equal(runtime.deliveryQuality.uatEnabled, false);
});

test("loadRuntimeConfig maps release_history paths relative to target repo", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-config-release-history-test-"));
  const repoRoot = path.join(root, "repo");
  fs.mkdirSync(path.join(repoRoot, "docs"), { recursive: true });

  fs.writeFileSync(
    path.join(root, "config.defaults.toml"),
    [
      "[paths]",
      `repo_root = ${JSON.stringify(repoRoot)}`,
      "",
      "[release_history]",
      "enabled = true",
      "required = true",
      'file = "docs/release-history.md"',
      'source_file = "docs/release-source.md"',
      'agent = "deploy"',
      "",
      "[codex]",
      'model = "gpt-5.3-codex-spark"',
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      'model_reasoning_effort = "medium"',
      "",
    ].join("\n"),
    "utf8"
  );

  const runtime = loadRuntimeConfig(root);
  assert.equal(runtime.releaseHistory.enabled, true);
  assert.equal(runtime.releaseHistory.required, true);
  assert.equal(runtime.releaseHistory.agent, "deploy");
  assert.equal(runtime.releaseHistory.file, path.join(repoRoot, "docs", "release-history.md"));
  assert.equal(runtime.releaseHistory.sourceFile, path.join(repoRoot, "docs", "release-source.md"));
});

test("loadRuntimeConfig resolves configured target repos and aliases", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-config-target-repos-test-"));
  const legacyRoot = path.join(root, "legacy");
  const agentenRoot = path.join(root, "bA-Agenten");
  const ragRoot = path.join(root, "bA-RAG-db");
  fs.mkdirSync(path.join(legacyRoot, "docs"), { recursive: true });
  fs.mkdirSync(path.join(agentenRoot, "docs"), { recursive: true });
  fs.mkdirSync(ragRoot, { recursive: true });

  fs.writeFileSync(
    path.join(root, "config.defaults.toml"),
    [
      "[paths]",
      `repo_root = ${JSON.stringify(legacyRoot)}`,
      "",
      "[target_repo_routing]",
      'mode = "from_requirement"',
      'fixed_target_repo = "agenten"',
      "",
      "[target_repos.agenten]",
      `path = ${JSON.stringify(agentenRoot)}`,
      'aliases = ["bA-Agenten", "agenten"]',
      "",
      "[target_repos.agenten.release_history]",
      "enabled = false",
      "",
      "[target_repos.rag_db]",
      `path = ${JSON.stringify(ragRoot)}`,
      'aliases = ["bA-RAG-db", "rag_db"]',
      "",
      "[target_repos.rag_db.qa]",
      "mandatory_checks = []",
      "",
      "[codex]",
      'model = "gpt-5.3-codex-spark"',
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      'model_reasoning_effort = "medium"',
      "",
    ].join("\n"),
    "utf8"
  );

  const previousEnv = process.env.AGENTS_TARGET_REPO_KEY;
  process.env.AGENTS_TARGET_REPO_KEY = "bA-Agenten";
  try {
    const runtime = loadRuntimeConfig(root);
    assert.equal(runtime.targetRepoRouting.mode, "from_requirement");
    assert.equal(runtime.targetRepoKey, "agenten");
    assert.equal(runtime.repoRoot, agentenRoot);
    assert.equal(runtime.resolveTargetRepoContext("bA-RAG-db").repoRoot, ragRoot);
    assert.deepEqual(runtime.withTargetRepo("rag_db").qa.mandatoryChecks, []);
  } finally {
    if (previousEnv === undefined) {
      delete process.env.AGENTS_TARGET_REPO_KEY;
    } else {
      process.env.AGENTS_TARGET_REPO_KEY = previousEnv;
    }
  }
});

test("runtime requirement target status validates target_repo frontmatter", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-config-req-target-test-"));
  const legacyRoot = path.join(root, "legacy");
  const agentenRoot = path.join(root, "bA-Agenten");
  fs.mkdirSync(legacyRoot, { recursive: true });
  fs.mkdirSync(agentenRoot, { recursive: true });
  const reqDir = path.join(root, "requirements");
  fs.mkdirSync(reqDir, { recursive: true });

  fs.writeFileSync(
    path.join(root, "config.defaults.toml"),
    [
      "[paths]",
      `repo_root = ${JSON.stringify(legacyRoot)}`,
      `requirements_root = ${JSON.stringify(reqDir)}`,
      "",
      "[target_repo_routing]",
      'mode = "from_requirement"',
      "",
      "[target_repos.agenten]",
      `path = ${JSON.stringify(agentenRoot)}`,
      'aliases = ["bA-Agenten"]',
      "",
      "[codex]",
      'model = "gpt-5.3-codex-spark"',
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      'model_reasoning_effort = "medium"',
      "",
    ].join("\n"),
    "utf8"
  );

  const okReq = path.join(reqDir, "REQ-OK.md");
  const missingReq = path.join(reqDir, "REQ-MISSING.md");
  const badReq = path.join(reqDir, "REQ-BAD.md");
  fs.writeFileSync(okReq, "---\nid: REQ-OK\ntarget_repo: bA-Agenten\n---\n# OK\n", "utf8");
  fs.writeFileSync(missingReq, "---\nid: REQ-MISSING\n---\n# Missing\n", "utf8");
  fs.writeFileSync(badReq, "---\nid: REQ-BAD\ntarget_repo: unknown\n---\n# Bad\n", "utf8");

  const runtime = loadRuntimeConfig(root);
  assert.equal(runtime.requirementTargetRepoStatus(okReq).ok, true);
  assert.equal(runtime.requirementTargetRepoStatus(okReq).key, "agenten");
  assert.equal(runtime.requirementTargetRepoStatus(missingReq).ok, false);
  assert.match(runtime.requirementTargetRepoStatus(missingReq).reason, /missing target_repo/);
  assert.equal(runtime.requirementTargetRepoStatus(badReq).ok, false);
  assert.match(runtime.requirementTargetRepoStatus(badReq).reason, /unknown target_repo/);
});

test("loadRuntimeConfig maps pause_policy probe settings", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-config-pause-policy-test-"));
  const repoRoot = path.join(root, "repo");
  fs.mkdirSync(repoRoot, { recursive: true });

  fs.writeFileSync(
    path.join(root, "config.defaults.toml"),
    [
      "[paths]",
      `repo_root = ${JSON.stringify(repoRoot)}`,
      "",
      "[pause_policy]",
      "probe_on_startup = false",
      "probe_cooldown_seconds = 42",
      "probe_timeout_seconds = 9",
      "",
      "[codex]",
      'model = "gpt-5.3-codex-spark"',
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      'model_reasoning_effort = "medium"',
      "",
    ].join("\n"),
    "utf8"
  );

  const runtime = loadRuntimeConfig(root);
  assert.equal(runtime.pausePolicy.probeOnStartup, false);
  assert.equal(runtime.pausePolicy.probeCooldownSeconds, 42);
  assert.equal(runtime.pausePolicy.probeTimeoutSeconds, 9);
});

test("loadRuntimeConfig maps model fallback policy and per-agent configs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-config-model-fallback-test-"));
  const repoRoot = path.join(root, "repo");
  fs.mkdirSync(repoRoot, { recursive: true });

  fs.writeFileSync(
    path.join(root, "config.defaults.toml"),
    [
      "[paths]",
      `repo_root = ${JSON.stringify(repoRoot)}`,
      "",
      "[models]",
      'default = "gpt-5.3-codex-spark"',
      'qa = "gpt-5.3-codex-spark"',
      "",
      "[model_fallback]",
      "max_attempts_per_codex_run = 1",
      "reuse_thread = true",
      'trigger_reasons = ["usage_limit", "rate_limit"]',
      "",
      "[model_fallback.models]",
      'default = "gpt-5.4-mini"',
      'po = "gpt-5.4"',
      "",
      "[codex]",
      'model = "gpt-5.3-codex-spark"',
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      'model_reasoning_effort = "medium"',
      "",
    ].join("\n"),
    "utf8"
  );

  const runtime = loadRuntimeConfig(root);
  assert.equal(runtime.modelFallback.maxAttemptsPerCodexRun, 1);
  assert.equal(runtime.modelFallback.reuseThread, true);
  assert.deepEqual(runtime.modelFallback.triggerReasons, ["usage_limit", "rate_limit"]);
  assert.equal(runtime.modelFallback.models.byAgent.PO, "gpt-5.4");
  assert.equal(runtime.modelFallback.models.byAgent.QA, "gpt-5.4-mini");
  assert.match(
    fs.readFileSync(runtime.resolveAgentFallbackCodexConfigPath("QA"), "utf8"),
    /model = "gpt-5\.4-mini"/
  );
});
