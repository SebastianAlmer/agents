const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  runNodeScript,
  detectLimitFailure,
  getActivePauseState,
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
