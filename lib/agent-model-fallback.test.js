const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runCodexExec, readConfigArgs } = require("./agent");
const {
  runNodeScript,
  getActivePauseState,
  readPauseState,
  writePauseState,
} = require("./flow-core");
const deliveryRunner = require("../delivery-runner").__test;
const poRunner = require("../po-runner").__test;

function mkRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFakeCodex(root) {
  const binDir = path.join(root, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, "codex");
  fs.writeFileSync(
    scriptPath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "count_file=\"${FAKE_CODEX_COUNT}\"",
      "args_file=\"${FAKE_CODEX_ARGS}\"",
      "count=0",
      "if [ -f \"$count_file\" ]; then count=$(cat \"$count_file\"); fi",
      "echo \"$((count + 1))\" > \"$count_file\"",
      "printf '%s\\n' \"$*\" >> \"$args_file\"",
      "case \"${FAKE_CODEX_MODE:-pass}\" in",
      "  fail-then-pass)",
      "    if [ \"$count\" -eq 0 ]; then",
      "      echo '{\"type\":\"error\",\"message\":\"usage limit reached\"}'",
      "      exit 1",
      "    fi",
      "    ;;",
      "  always-usage)",
      "    echo '{\"type\":\"error\",\"message\":\"usage limit reached\"}'",
      "    exit 1",
      "    ;;",
      "  auth-fail)",
      "    echo '{\"type\":\"error\",\"message\":\"HTTP error: 403 Forbidden\"}'",
      "    exit 1",
      "    ;;",
      "esac",
      "echo '{\"type\":\"thread.started\",\"thread_id\":\"thread-fallback\"}'",
      "echo '{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":1,\"output_tokens\":1}}'",
      "exit 0",
      "",
    ].join("\n"),
    "utf8"
  );
  fs.chmodSync(scriptPath, 0o755);
  return binDir;
}

function writeConfig(root, fileName, model) {
  const filePath = path.join(root, fileName);
  fs.writeFileSync(
    filePath,
    [
      `model = "${model}"`,
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      'model_reasoning_effort = "medium"',
      "",
    ].join("\n"),
    "utf8"
  );
  return filePath;
}

function makeRuntime(root, fallbackPath) {
  return {
    agentsRoot: root,
    memory: { enabled: false },
    modelFallback: {
      maxAttemptsPerCodexRun: 1,
      reuseThread: true,
      triggerReasons: [
        "usage_limit",
        "rate_limit",
        "too_many_requests",
        "retry_later",
        "insufficient_quota",
        "quota_exceeded",
      ],
    },
    resolveAgentFallbackCodexConfigPath: () => fallbackPath,
  };
}

function makePauseProbeRuntime(root, primaryPath, fallbackPath) {
  return {
    agentsRoot: root,
    repoRoot: root,
    pausePolicy: {
      probeOnStartup: true,
      probeTimeoutSeconds: 1,
      probeCooldownSeconds: 300,
    },
    resolveAgentCodexConfigPath: () => primaryPath,
    resolveAgentFallbackCodexConfigPath: () => fallbackPath,
  };
}

async function withFakeCodex(root, mode, fn) {
  const oldPath = process.env.PATH;
  const oldMode = process.env.FAKE_CODEX_MODE;
  const oldCount = process.env.FAKE_CODEX_COUNT;
  const oldArgs = process.env.FAKE_CODEX_ARGS;
  const oldFallback = process.env.CODEX_MODEL_FALLBACK_ENABLED;
  const binDir = writeFakeCodex(root);
  process.env.PATH = `${binDir}${path.delimiter}${oldPath || ""}`;
  process.env.FAKE_CODEX_MODE = mode;
  process.env.FAKE_CODEX_COUNT = path.join(root, "codex-count.txt");
  process.env.FAKE_CODEX_ARGS = path.join(root, "codex-args.txt");
  try {
    return await fn();
  } finally {
    process.env.PATH = oldPath;
    if (oldMode === undefined) delete process.env.FAKE_CODEX_MODE;
    else process.env.FAKE_CODEX_MODE = oldMode;
    if (oldCount === undefined) delete process.env.FAKE_CODEX_COUNT;
    else process.env.FAKE_CODEX_COUNT = oldCount;
    if (oldArgs === undefined) delete process.env.FAKE_CODEX_ARGS;
    else process.env.FAKE_CODEX_ARGS = oldArgs;
    if (oldFallback === undefined) delete process.env.CODEX_MODEL_FALLBACK_ENABLED;
    else process.env.CODEX_MODEL_FALLBACK_ENABLED = oldFallback;
  }
}

function readCount(root) {
  const filePath = path.join(root, "codex-count.txt");
  return Number.parseInt(fs.readFileSync(filePath, "utf8"), 10);
}

function readArgs(root) {
  return fs.readFileSync(path.join(root, "codex-args.txt"), "utf8")
    .trim()
    .split(/\r?\n/);
}

test("runner CLI parses model fallback switch and alias", () => {
  assert.equal(
    deliveryRunner.parseArgs(["--mode", "full", "--allow-model-fallback"]).allowModelFallback,
    true
  );
  assert.equal(
    poRunner.parseArgs(["--mode=intake", "--model-fallback"]).allowModelFallback,
    true
  );
});

test("usage limit does not fallback without runner switch env", async () => {
  const root = mkRoot("agent-fallback-off-");
  const primaryPath = writeConfig(root, "primary.toml", "gpt-5.3-codex-spark");
  const fallbackPath = writeConfig(root, "fallback.toml", "gpt-5.4-mini");

  await withFakeCodex(root, "fail-then-pass", async () => {
    process.env.CODEX_MODEL_FALLBACK_ENABLED = "0";
    await assert.rejects(() => runCodexExec({
      prompt: "hello",
      repoRoot: root,
      configArgs: readConfigArgs(primaryPath),
      threadId: "thread-primary",
      threadFile: path.join(root, "thread.txt"),
      agentsRoot: root,
      agentLabel: "QA",
      runtime: makeRuntime(root, fallbackPath),
      autoMode: true,
    }), /usage limit/i);
    assert.equal(readCount(root), 1);
  });
});

test("usage limit triggers one configured fallback attempt with same thread", async () => {
  const root = mkRoot("agent-fallback-pass-");
  const primaryPath = writeConfig(root, "primary.toml", "gpt-5.3-codex-spark");
  const fallbackPath = writeConfig(root, "fallback.toml", "gpt-5.4-mini");

  await withFakeCodex(root, "fail-then-pass", async () => {
    process.env.CODEX_MODEL_FALLBACK_ENABLED = "1";
    const result = await runCodexExec({
      prompt: "hello",
      repoRoot: root,
      configArgs: readConfigArgs(primaryPath),
      threadId: "thread-primary",
      threadFile: path.join(root, "thread.txt"),
      agentsRoot: root,
      agentLabel: "QA",
      runtime: makeRuntime(root, fallbackPath),
      autoMode: true,
    });

    assert.equal(result.threadId, "thread-fallback");
    assert.equal(readCount(root), 2);
    const args = readArgs(root);
    assert.match(args[0], /model="gpt-5\.3-codex-spark"/);
    assert.match(args[1], /model="gpt-5\.4-mini"/);
    assert.match(args[1], /resume thread-primary/);
    assert.equal(fs.existsSync(path.join(root, ".runtime", "pause-state.json")), false);
    const events = fs.readFileSync(path.join(root, ".runtime", "model-fallback", "events.jsonl"), "utf8");
    assert.match(events, /"result":"pass"/);
  });
});

test("auth forbidden does not trigger model fallback", async () => {
  const root = mkRoot("agent-fallback-auth-");
  const primaryPath = writeConfig(root, "primary.toml", "gpt-5.3-codex-spark");
  const fallbackPath = writeConfig(root, "fallback.toml", "gpt-5.4-mini");

  await withFakeCodex(root, "auth-fail", async () => {
    process.env.CODEX_MODEL_FALLBACK_ENABLED = "1";
    await assert.rejects(() => runCodexExec({
      prompt: "hello",
      repoRoot: root,
      configArgs: readConfigArgs(primaryPath),
      threadId: "thread-primary",
      threadFile: path.join(root, "thread.txt"),
      agentsRoot: root,
      agentLabel: "QA",
      runtime: makeRuntime(root, fallbackPath),
      autoMode: true,
    }), /403 Forbidden/i);
    assert.equal(readCount(root), 1);
  });
});

test("failed fallback preserves normal auto-resume pause through runner wrapper", async () => {
  const root = mkRoot("agent-fallback-pause-");
  const primaryPath = writeConfig(root, "primary.toml", "gpt-5.3-codex-spark");
  const fallbackPath = writeConfig(root, "fallback.toml", "gpt-5.4-mini");
  const childPath = path.join(root, "child.js");
  fs.writeFileSync(
    childPath,
    [
      `const { runCodexExec, readConfigArgs } = require(${JSON.stringify(path.join(__dirname, "agent"))});`,
      `const root = ${JSON.stringify(root)};`,
      `const fallbackPath = ${JSON.stringify(fallbackPath)};`,
      "const runtime = {",
      "  agentsRoot: root,",
      "  memory: { enabled: false },",
      "  modelFallback: { maxAttemptsPerCodexRun: 1, reuseThread: true, triggerReasons: ['usage_limit'] },",
      "  resolveAgentFallbackCodexConfigPath: () => fallbackPath,",
      "};",
      "runCodexExec({",
      "  prompt: 'hello',",
      "  repoRoot: root,",
      `  configArgs: readConfigArgs(${JSON.stringify(primaryPath)}),`,
      "  threadId: 'thread-primary',",
      "  threadFile: root + '/thread.txt',",
      "  agentsRoot: root,",
      "  agentLabel: 'QA',",
      "  runtime,",
      "  autoMode: true,",
      "}).catch((err) => { console.error(err.message || err); process.exit(1); });",
      "",
    ].join("\n"),
    "utf8"
  );

  await withFakeCodex(root, "always-usage", async () => {
    process.env.CODEX_MODEL_FALLBACK_ENABLED = "1";
    const result = await runNodeScript({
      scriptPath: childPath,
      args: [],
      cwd: root,
      maxRetries: 0,
      retryDelaySeconds: 0,
    });

    assert.equal(readCount(root), 2);
    assert.equal(result.paused, true);
    assert.equal(result.pauseState.reason, "usage_limit");
    assert.equal(getActivePauseState(root).reason, "usage_limit");
  });
});

test("pause probe config prefers fallback config only when switch is enabled", () => {
  const root = mkRoot("agent-fallback-probe-");
  const primaryPath = writeConfig(root, "primary.toml", "gpt-5.3-codex-spark");
  const fallbackPath = writeConfig(root, "fallback.toml", "gpt-5.4-mini");
  const runtime = {
    resolveAgentCodexConfigPath: () => primaryPath,
    resolveAgentFallbackCodexConfigPath: () => fallbackPath,
  };

  assert.match(
    deliveryRunner.resolvePauseProbeConfigArgs(runtime, "QA", false).join(" "),
    /gpt-5\.3-codex-spark/
  );
  assert.match(
    deliveryRunner.resolvePauseProbeConfigArgs(runtime, "QA", true).join(" "),
    /gpt-5\.4-mini/
  );
});

test("startup pause fallback probes primary model before fallback model", async () => {
  for (const [name, runner, label] of [
    ["delivery", deliveryRunner, "DELIVERY-RUNNER"],
    ["po", poRunner, "PO-RUNNER"],
  ]) {
    const root = mkRoot(`agent-fallback-startup-${name}-`);
    const primaryPath = writeConfig(root, "primary.toml", "gpt-5.3-codex-spark");
    const fallbackPath = writeConfig(root, "fallback.toml", "gpt-5.5");
    writePauseState(root, {
      active: true,
      reason: "usage_limit",
      source: "qa.js",
      resumeAfter: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      nextProbeAfter: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    await withFakeCodex(root, "fail-then-pass", async () => {
      const result = await runner.probeGlobalPauseOnStartupWithFallback(
        makePauseProbeRuntime(root, primaryPath, fallbackPath),
        { verbose: false },
        label,
        true
      );

      assert.equal(result.status, "cleared_probe_ok");
      assert.equal(readCount(root), 2);
      const args = readArgs(root);
      assert.match(args[0], /model="gpt-5\.3-codex-spark"/);
      assert.match(args[1], /model="gpt-5\.5"/);
      assert.equal(readPauseState(root), null);
    });
  }
});

test("startup fallback limit keeps normal auto-resume pause", async () => {
  const root = mkRoot("agent-fallback-startup-pause-");
  const primaryPath = writeConfig(root, "primary.toml", "gpt-5.3-codex-spark");
  const fallbackPath = writeConfig(root, "fallback.toml", "gpt-5.5");
  writePauseState(root, {
    active: true,
    reason: "usage_limit",
    source: "qa.js",
    resumeAfter: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });

  await withFakeCodex(root, "always-usage", async () => {
    const result = await deliveryRunner.probeGlobalPauseOnStartupWithFallback(
      makePauseProbeRuntime(root, primaryPath, fallbackPath),
      { verbose: false },
      "DELIVERY-RUNNER",
      true
    );

    assert.equal(result.status, "still_paused");
    assert.equal(readCount(root), 2);
    const state = readPauseState(root);
    assert.equal(state.active, true);
    assert.equal(state.reason, "usage_limit");
    assert.equal(state.lastProbeResult, "still-paused");
    assert.match(state.lastProbeSource, /fallback/);
  });
});
