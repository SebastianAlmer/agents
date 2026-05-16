const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  runNodeScript,
  detectLimitFailure,
  getActivePauseState,
  probeActivePauseState,
  readPauseState,
  writePauseState,
  isAutoResumePauseReason,
  isHumanEscalationPauseReason,
  pauseDispositionForReason,
} = require("./lib/flow-core");
const deliveryRunner = require("./delivery-runner").__test;
const poRunner = require("./po-runner").__test;

function mkTempRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("usage-limit failures create auto-resume pause state", async () => {
  const root = mkTempRoot("agents-pause-usage-");
  const scriptPath = path.join(root, "usage-limit.js");
  fs.writeFileSync(
    scriptPath,
    "console.error('Usage limit reached. Please try again later.'); process.exit(1);\n",
    "utf8"
  );

  const result = await runNodeScript({
    scriptPath,
    args: [],
    cwd: root,
    env: {},
    maxRetries: 0,
    retryDelaySeconds: 0,
  });

  assert.equal(result.paused, true);
  assert.equal(result.pauseState.reason, "usage_limit");
  assert.equal(isAutoResumePauseReason(result.pauseState.reason), true);
  assert.equal(pauseDispositionForReason(result.pauseState.reason), "auto_resume");
  assert.equal(getActivePauseState(root).reason, "usage_limit");
});

test("auth failures remain human-escalation pauses", () => {
  const detection = detectLimitFailure("HTTP error: 403 Forbidden");

  assert.equal(detection.reason, "auth_forbidden");
  assert.equal(isHumanEscalationPauseReason(detection.reason), true);
  assert.equal(isAutoResumePauseReason(detection.reason), false);
  assert.equal(pauseDispositionForReason(detection.reason), "human_escalation");
});

test("retry-later wording is classified as auto-resume", () => {
  const detection = detectLimitFailure("Provider busy; try again at 11:59 pm.");

  assert.equal(detection.reason, "retry_later");
  assert.equal(isAutoResumePauseReason(detection.reason), true);
  assert.equal(pauseDispositionForReason(detection.reason), "auto_resume");
});

test("delivery startup preserves active pause state", () => {
  const root = mkTempRoot("agents-pause-startup-");
  const resumeAfter = new Date(Date.now() + 60_000).toISOString();
  writePauseState(root, {
    active: true,
    reason: "usage_limit",
    source: "test",
    resumeAfter,
  });

  deliveryRunner.preserveGlobalPauseOnStartup({ agentsRoot: root }, { verbose: false });

  const state = readPauseState(root);
  assert.equal(state.active, true);
  assert.equal(state.reason, "usage_limit");
  assert.equal(state.resumeAfter, resumeAfter);
});

test("startup pause probe clears auto-resume pause when probe succeeds", async () => {
  const root = mkTempRoot("agents-pause-probe-clear-");
  const now = new Date("2026-05-16T08:00:00.000Z");
  writePauseState(root, {
    active: true,
    reason: "usage_limit",
    source: "ux.js",
    resumeAfter: "2026-05-16T09:00:00.000Z",
  });

  const result = await probeActivePauseState({
    agentsRoot: root,
    repoRoot: root,
    now,
    runProbe: async () => ({ ok: true, exitCode: 0, stdout: "READY", stderr: "" }),
  });

  assert.equal(result.status, "cleared_probe_ok");
  assert.equal(readPauseState(root), null);
});

test("startup pause probe preserves pause and records cooldown when limit remains", async () => {
  const root = mkTempRoot("agents-pause-probe-still-");
  const now = new Date("2026-05-16T08:00:00.000Z");
  writePauseState(root, {
    active: true,
    reason: "usage_limit",
    source: "ux.js",
    resumeAfter: "2026-05-16T09:00:00.000Z",
  });

  const result = await probeActivePauseState({
    agentsRoot: root,
    repoRoot: root,
    now,
    cooldownMs: 300_000,
    runProbe: async () => ({
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: "Usage limit reached. Please try again later.",
    }),
  });

  const state = readPauseState(root);
  assert.equal(result.status, "still_paused");
  assert.equal(state.active, true);
  assert.equal(state.reason, "usage_limit");
  assert.equal(state.source, "ux.js");
  assert.equal(state.lastProbeResult, "still-paused");
  assert.equal(state.nextProbeAfter, "2026-05-16T08:05:00.000Z");
});

test("startup pause probe respects probe cooldown", async () => {
  const root = mkTempRoot("agents-pause-probe-cooldown-");
  const now = new Date("2026-05-16T08:01:00.000Z");
  writePauseState(root, {
    active: true,
    reason: "usage_limit",
    source: "ux.js",
    resumeAfter: "2026-05-16T09:00:00.000Z",
    lastProbeAt: "2026-05-16T08:00:00.000Z",
    nextProbeAfter: "2026-05-16T08:05:00.000Z",
  });
  let probeCount = 0;

  const result = await probeActivePauseState({
    agentsRoot: root,
    repoRoot: root,
    now,
    cooldownMs: 300_000,
    runProbe: async () => {
      probeCount += 1;
      return { ok: true, exitCode: 0, stdout: "READY", stderr: "" };
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "probe-cooldown");
  assert.equal(probeCount, 0);
  assert.equal(readPauseState(root).active, true);
});

test("startup pause probe can be forced for model fallback", async () => {
  const root = mkTempRoot("agents-pause-probe-force-");
  const now = new Date("2026-05-16T08:01:00.000Z");
  writePauseState(root, {
    active: true,
    reason: "usage_limit",
    source: "qa.js",
    resumeAfter: "2026-05-16T09:00:00.000Z",
    lastProbeAt: "2026-05-16T08:00:00.000Z",
    nextProbeAfter: "2026-05-16T08:05:00.000Z",
  });

  const result = await probeActivePauseState({
    agentsRoot: root,
    repoRoot: root,
    now,
    cooldownMs: 300_000,
    forceProbe: true,
    runProbe: async () => ({ ok: true, exitCode: 0, stdout: "READY", stderr: "" }),
  });

  assert.equal(result.status, "cleared_probe_ok");
  assert.equal(readPauseState(root), null);
});

test("delivery and PO do not escalate auto-resume pauses", () => {
  const runtime = {
    deliveryRunner: { maxPausedCyclesPerItem: 1 },
  };

  assert.equal(deliveryRunner.shouldEscalatePausedStage(runtime, "usage_limit", 99), false);
  assert.equal(deliveryRunner.shouldEscalatePausedStage(runtime, "rate_limit", 99), false);
  assert.equal(deliveryRunner.shouldEscalatePausedStage(runtime, "auth_forbidden", 1), true);
  assert.equal(poRunner.shouldEscalatePausedPoRun(runtime, "usage_limit", 99), false);
  assert.equal(poRunner.shouldEscalatePausedPoRun(runtime, "quota_exceeded", 99), false);
  assert.equal(poRunner.shouldEscalatePausedPoRun(runtime, "auth_forbidden", 1), true);
});
