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
