#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");
const {
  buildMemoryReadContext,
  buildMemoryUpdatePrompt,
  captureFileStats,
  didAnyFileChange,
  shouldUpdateMemoryForRun,
} = require("./memory");
const {
  detectLimitFailure,
  isAutoResumePauseReason,
} = require("./flow-core");

const DEFAULT_AUTO_COMPACT_EVERY_RAW = Number.parseInt(
  process.env.CODEX_AUTO_COMPACT_EVERY || "20",
  10
);
const DEFAULT_AUTO_COMPACT_EVERY = Number.isInteger(DEFAULT_AUTO_COMPACT_EVERY_RAW)
  ? DEFAULT_AUTO_COMPACT_EVERY_RAW
  : 20;
const DEFAULT_THREAD_ROTATE_AFTER_RUNS_RAW = Number.parseInt(
  process.env.CODEX_THREAD_ROTATE_AFTER_RUNS || "0",
  10
);
const DEFAULT_THREAD_ROTATE_AFTER_RUNS = Number.isInteger(DEFAULT_THREAD_ROTATE_AFTER_RUNS_RAW)
  ? DEFAULT_THREAD_ROTATE_AFTER_RUNS_RAW
  : 0;
const MODEL_FALLBACK_ENABLED_ENV = "CODEX_MODEL_FALLBACK_ENABLED";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getFirstFile(dir) {
  if (!fs.existsSync(dir)) {
    return null;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  if (entries.length === 0) {
    return null;
  }
  return path.join(dir, entries[0]);
}

function readConfigArgs(configPath) {
  if (!fs.existsSync(configPath)) {
    return [];
  }
  const lines = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
  const args = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const idx = trimmed.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && value) {
      args.push("-c", `${key}=${value}`);
    }
  }
  return args;
}

function readThreadId(threadFile) {
  if (!fs.existsSync(threadFile)) {
    return "";
  }
  const content = fs.readFileSync(threadFile, "utf8").trim();
  return content || "";
}

function writeThreadId(threadFile, threadId) {
  ensureDir(path.dirname(threadFile));
  fs.writeFileSync(threadFile, threadId, "utf8");
}

function sanitizeThreadKey(threadKey) {
  return String(threadKey || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function getThreadFilePath({ agentsRoot, agentRoot, auto, threadKey }) {
  const role = path.basename(agentRoot);
  const threadsDir = path.join(agentsRoot, ".runtime", "threads", role);
  ensureDir(threadsDir);

  const key = sanitizeThreadKey(threadKey);
  if (key) {
    return path.join(threadsDir, auto ? `thread.auto.${key}.txt` : `thread.${key}.txt`);
  }

  return path.join(threadsDir, auto ? "thread.auto.txt" : "thread.txt");
}

function shouldPrintLine(line, verbose) {
  if (verbose) {
    return true;
  }
  if (/^(PO|ARCH|DEV|DEV_FE|DEV_BE|DEV_FS|QA|SEC|UX|DEPLOY|FLOW|REQENG):/.test(line)) {
    return true;
  }
  if (/^(thinking|exec|file update:|mcp startup:|OpenAI Codex|-----|workdir:|model:|provider:|approval:|sandbox:|reasoning|session id:|user$|assistant$|codex$)/.test(line)) {
    return false;
  }
  return true;
}

function isBenignCodexNoiseLine(line) {
  return /codex_core::rollout::list:\s*state db missing rollout path for thread/i.test(String(line || ""));
}

function splitLines(text) {
  return String(text || "").split(/\r?\n/).filter((line) => line.length > 0);
}

function isContextOverflow(stderrText) {
  return /(context window|context_length_exceeded|ran out of room)/i.test(String(stderrText || ""));
}

function isRecoverableThreadError(stderrText) {
  const text = String(stderrText || "");
  if (!text) {
    return false;
  }
  return /compact_remote|failed to run pre-sampling compact|error running remote compact task|model is not supported|not supported when using codex with a chatgpt account/i.test(text);
}

function buildExecArgs({ configArgs, threadId }) {
  const args = ["exec", "--json"];
  if (configArgs && configArgs.length) {
    args.push(...configArgs);
  }
  if (threadId) {
    args.push("resume", threadId);
  }
  args.push("-");
  return args;
}

function parseConfigArgValue(configArgs, keyName) {
  const key = String(keyName || "").trim();
  if (!key || !Array.isArray(configArgs)) {
    return "";
  }
  for (let i = 0; i < configArgs.length; i++) {
    if (String(configArgs[i]) !== "-c") {
      continue;
    }
    const raw = String(configArgs[i + 1] || "");
    const idx = raw.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const candidateKey = raw.slice(0, idx).trim();
    if (candidateKey !== key) {
      continue;
    }
    let value = raw.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return "";
}

function modelFallbackEnabledFromEnv() {
  return String(process.env[MODEL_FALLBACK_ENABLED_ENV] || "").trim() === "1";
}

function modelFallbackEventPath(runtime) {
  if (!runtime || !runtime.agentsRoot) {
    return "";
  }
  const dir = path.join(runtime.agentsRoot, ".runtime", "model-fallback");
  ensureDir(dir);
  return path.join(dir, "events.jsonl");
}

function writeModelFallbackEvent(runtime, event) {
  const filePath = modelFallbackEventPath(runtime);
  if (!filePath) {
    return;
  }
  const payload = {
    ts: new Date().toISOString(),
    ...event,
  };
  try {
    fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    // diagnostics only
  }
}

function resolveModelFallbackAttempt({ runtime, agentLabel, primaryConfigArgs, stderrText, autoMode }) {
  if (!autoMode || !modelFallbackEnabledFromEnv()) {
    return null;
  }
  const policy = runtime && runtime.modelFallback ? runtime.modelFallback : null;
  if (!policy || Math.max(0, Number.parseInt(String(policy.maxAttemptsPerCodexRun || 0), 10) || 0) <= 0) {
    return null;
  }
  const detection = detectLimitFailure(stderrText);
  if (!detection || !isAutoResumePauseReason(detection.reason)) {
    return null;
  }
  const triggerReasons = Array.isArray(policy.triggerReasons) ? policy.triggerReasons : [];
  if (triggerReasons.length > 0 && !triggerReasons.includes(detection.reason)) {
    return null;
  }
  if (typeof runtime.resolveAgentFallbackCodexConfigPath !== "function") {
    return null;
  }
  const fallbackPath = runtime.resolveAgentFallbackCodexConfigPath(agentLabel);
  if (!fallbackPath) {
    return null;
  }
  const fallbackConfigArgs = readConfigArgs(fallbackPath);
  if (fallbackConfigArgs.length === 0) {
    return null;
  }
  const primaryModel = parseConfigArgValue(primaryConfigArgs, "model");
  const fallbackModel = parseConfigArgValue(fallbackConfigArgs, "model");
  if (!fallbackModel || fallbackModel === primaryModel) {
    return null;
  }
  return {
    reason: detection.reason,
    primaryModel,
    fallbackModel,
    fallbackConfigArgs,
    reuseThread: policy.reuseThread !== false,
  };
}

function emitLine({ line, filtered, verboseRef }) {
  if (!line) {
    return;
  }
  if (!filtered) {
    process.stdout.write(line + "\n");
    return;
  }
  const verbose = Boolean(verboseRef && verboseRef.value);
  if (shouldPrintLine(line, verbose)) {
    process.stdout.write(line + "\n");
  }
}

async function runCodexExecOnce({ prompt, repoRoot, configArgs, threadId, filtered, verboseRef }) {
  const args = buildExecArgs({ configArgs, threadId });
  const proc = spawn("codex", args, {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });

  proc.stdin.write(prompt);
  proc.stdin.end();

  let observedThreadId = threadId || "";
  let stderrText = "";
  let usage = null;
  const seenErrorLines = new Set();

  const recordErrorLine = (text) => {
    const line = String(text || "").trim();
    if (!line) {
      return;
    }
    if (seenErrorLines.has(line)) {
      return;
    }
    seenErrorLines.add(line);
    stderrText += `${line}\n`;
    if (stderrText.length > 100_000) {
      stderrText = stderrText.slice(-100_000);
    }
    emitLine({ line, filtered, verboseRef });
  };

  const onStdoutLine = (line) => {
    if (!line) {
      return;
    }

    let event = null;
    try {
      event = JSON.parse(line);
    } catch {
      emitLine({ line, filtered, verboseRef });
      return;
    }

    if (event.type === "thread.started" && event.thread_id) {
      observedThreadId = String(event.thread_id);
      return;
    }

    if (event.type === "item.completed" && event.item && typeof event.item === "object") {
      const item = event.item;
      if ((item.type === "agent_message" || item.type === "reasoning") && item.text) {
        for (const textLine of splitLines(item.text)) {
          emitLine({ line: textLine, filtered, verboseRef });
        }
      }
      return;
    }

    if (event.type === "turn.completed" && event.usage) {
      usage = event.usage;
    }
    if (event.type === "error") {
      recordErrorLine(String(event.message || "codex error"));
      return;
    }
    if (event.type === "turn.failed") {
      const msg = event.error && typeof event.error === "object"
        ? String(event.error.message || "")
        : String(event.message || "");
      recordErrorLine(msg || "codex turn failed");
      return;
    }
  };

  const onStderrLine = (line) => {
    if (!line) {
      return;
    }
    if (isBenignCodexNoiseLine(line)) {
      return;
    }
    recordErrorLine(line);
  };

  const rlOut = readline.createInterface({ input: proc.stdout });
  const rlErr = readline.createInterface({ input: proc.stderr });
  rlOut.on("line", onStdoutLine);
  rlErr.on("line", onStderrLine);

  const exitCode = await new Promise((resolve) => {
    proc.on("close", resolve);
  });

  rlOut.close();
  rlErr.close();

  return {
    exitCode,
    threadId: observedThreadId,
    stderrText,
    usage,
  };
}

function compactStatePath(agentsRoot) {
  return path.join(agentsRoot, ".runtime", "compact-state.json");
}

function readCompactState(agentsRoot) {
  const statePath = compactStatePath(agentsRoot);
  if (!fs.existsSync(statePath)) {
    return { threads: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (parsed && typeof parsed === "object" && parsed.threads && typeof parsed.threads === "object") {
      return parsed;
    }
  } catch {
    // Ignore broken local runtime state and reinitialize.
  }
  return { threads: {} };
}

function writeCompactState(agentsRoot, state) {
  const statePath = compactStatePath(agentsRoot);
  ensureDir(path.dirname(statePath));
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function bumpThreadRunCount({ agentsRoot, threadId }) {
  if (!agentsRoot || !threadId) {
    return 0;
  }
  const state = readCompactState(agentsRoot);
  const key = String(threadId);
  const current = state.threads[key] && Number.isInteger(state.threads[key].count)
    ? state.threads[key].count
    : 0;
  const next = current + 1;
  state.threads[key] = {
    count: next,
    updated_at: new Date().toISOString(),
  };
  writeCompactState(agentsRoot, state);
  return next;
}

function getThreadRunCount({ agentsRoot, threadId }) {
  if (!agentsRoot || !threadId) {
    return 0;
  }
  const state = readCompactState(agentsRoot);
  const key = String(threadId);
  const current = state.threads[key] && Number.isInteger(state.threads[key].count)
    ? state.threads[key].count
    : 0;
  return current;
}

function parsePositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function resolveThreadRotateAfterRuns(runtime) {
  const runtimeValue = runtime && runtime.threadRecovery
    ? runtime.threadRecovery.rotateAfterRuns
    : undefined;
  return parsePositiveInt(runtimeValue, DEFAULT_THREAD_ROTATE_AFTER_RUNS);
}

function shouldResetThreadOnRecoverableError(runtime) {
  const runtimeValue = runtime && runtime.threadRecovery
    ? runtime.threadRecovery.resetOnCompactOrModelError
    : undefined;
  if (runtimeValue === undefined) {
    return true;
  }
  if (typeof runtimeValue === "boolean") {
    return runtimeValue;
  }
  const normalized = String(runtimeValue).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return true;
}

function clearThreadState({ threadFile, threadId, agentsRoot }) {
  if (threadFile && fs.existsSync(threadFile)) {
    try {
      fs.unlinkSync(threadFile);
    } catch {
      // Ignore local runtime cleanup failure.
    }
  }
  if (agentsRoot && threadId) {
    const state = readCompactState(agentsRoot);
    if (state.threads && state.threads[threadId]) {
      delete state.threads[threadId];
      writeCompactState(agentsRoot, state);
    }
  }
}

async function maybeRunCompact({
  repoRoot,
  configArgs,
  threadId,
  filtered,
  verboseRef,
  agentsRoot,
  agentLabel,
  autoCompact,
  compactEvery,
}) {
  const enabled = Boolean(autoCompact);
  const interval = Number.isInteger(compactEvery) ? compactEvery : DEFAULT_AUTO_COMPACT_EVERY;
  if (!enabled || interval <= 0 || !threadId || !agentsRoot) {
    return threadId;
  }

  const count = bumpThreadRunCount({ agentsRoot, threadId });
  if (count <= 0 || count % interval !== 0) {
    return threadId;
  }

  const prefix = agentLabel || "AGENT";
  emitLine({
    line: `${prefix}: running compact for thread ${threadId} after ${count} turns`,
    filtered,
    verboseRef,
  });

  const compactResult = await runCodexExecOnce({
    prompt: "/compact",
    repoRoot,
    configArgs,
    threadId,
    filtered,
    verboseRef,
  });

  if (compactResult.exitCode !== 0) {
    throw new Error(`${prefix}: compact failed with exit code ${compactResult.exitCode}`);
  }

  emitLine({
    line: `${prefix}: compact completed`,
    filtered,
    verboseRef,
  });

  return compactResult.threadId || threadId;
}

async function runCodexWithRecovery({
  prompt,
  repoRoot,
  configArgs,
  threadId,
  filtered,
  verboseRef,
  threadFile,
  agentsRoot,
  agentLabel,
  autoCompact,
  compactEvery,
  runtime,
  autoMode,
  allowThreadRotation,
}) {
  const label = agentLabel || "AGENT";
  const initialThreadId = threadId || "";
  let activeThreadId = initialThreadId;
  let activeConfigArgs = Array.isArray(configArgs) ? configArgs : [];
  let fallbackUsed = false;
  const rotationEnabled = allowThreadRotation !== false;
  const rotateAfterRuns = resolveThreadRotateAfterRuns(runtime);

  if (rotationEnabled && activeThreadId && rotateAfterRuns > 0) {
    const currentRuns = getThreadRunCount({ agentsRoot, threadId: activeThreadId });
    if (currentRuns >= rotateAfterRuns) {
      emitLine({
        line: `${label}: rotating thread after ${currentRuns} runs (threshold=${rotateAfterRuns})`,
        filtered,
        verboseRef,
      });
      clearThreadState({
        threadFile,
        threadId: activeThreadId,
        agentsRoot,
      });
      activeThreadId = "";
    }
  }

  let result = await runCodexExecOnce({
    prompt,
    repoRoot,
    configArgs: activeConfigArgs,
    threadId: activeThreadId,
    filtered,
    verboseRef,
  });

  const recoverableThreadError =
    isContextOverflow(result.stderrText)
    || (shouldResetThreadOnRecoverableError(runtime) && isRecoverableThreadError(result.stderrText));

  if (result.exitCode !== 0 && activeThreadId && recoverableThreadError) {
    const resetReason = isContextOverflow(result.stderrText)
      ? "context window exceeded"
      : "compact/model error";
    emitLine({
      line: `${label}: ${resetReason}; resetting thread and retrying once`,
      filtered,
      verboseRef,
    });
    clearThreadState({ threadFile, threadId: activeThreadId, agentsRoot });
    result = await runCodexExecOnce({
      prompt,
      repoRoot,
      configArgs: activeConfigArgs,
      threadId: "",
      filtered,
      verboseRef,
    });
  }

  if (result.exitCode !== 0) {
    const fallback = resolveModelFallbackAttempt({
      runtime,
      agentLabel: label,
      primaryConfigArgs: activeConfigArgs,
      stderrText: result.stderrText,
      autoMode,
    });
    if (fallback) {
      const fallbackThreadId = fallback.reuseThread ? activeThreadId : "";
      emitLine({
        line: `${label}: model fallback ${fallback.primaryModel || "primary"} -> ${fallback.fallbackModel} after ${fallback.reason}`,
        filtered,
        verboseRef,
      });
      writeModelFallbackEvent(runtime, {
        agent: label,
        primary_model: fallback.primaryModel,
        fallback_model: fallback.fallbackModel,
        reason: fallback.reason,
        result: "start",
        thread_id: fallbackThreadId,
      });
      const fallbackResult = await runCodexExecOnce({
        prompt,
        repoRoot,
        configArgs: fallback.fallbackConfigArgs,
        threadId: fallbackThreadId,
        filtered,
        verboseRef,
      });
      if (fallbackResult.exitCode === 0) {
        fallbackUsed = true;
        activeConfigArgs = fallback.fallbackConfigArgs;
        result = fallbackResult;
        writeModelFallbackEvent(runtime, {
          agent: label,
          primary_model: fallback.primaryModel,
          fallback_model: fallback.fallbackModel,
          reason: fallback.reason,
          result: "pass",
          thread_id: fallbackResult.threadId || fallbackThreadId,
        });
      } else {
        result = fallbackResult;
        writeModelFallbackEvent(runtime, {
          agent: label,
          primary_model: fallback.primaryModel,
          fallback_model: fallback.fallbackModel,
          reason: fallback.reason,
          result: "fail",
          thread_id: fallbackResult.threadId || fallbackThreadId,
          error_excerpt: splitLines(fallbackResult.stderrText).slice(-3).join(" | ").slice(0, 800),
        });
      }
    }
  }

  if (result.exitCode !== 0) {
    const tail = splitLines(result.stderrText).slice(-3).join(" | ");
    const suffix = tail ? ` (${tail})` : "";
    throw new Error(`${label}: codex exec failed with exit code ${result.exitCode}${suffix}`);
  }

  let finalThreadId = result.threadId || activeThreadId;

  if (finalThreadId) {
    try {
      finalThreadId = await maybeRunCompact({
        repoRoot,
        configArgs: activeConfigArgs,
        threadId: finalThreadId,
        filtered,
        verboseRef,
        agentsRoot,
        agentLabel: label,
        autoCompact,
        compactEvery,
      });
    } catch (err) {
      emitLine({
        line: `${label}: warning - compact failed (${err.message || err})`,
        filtered,
        verboseRef,
      });
    }
  }

  return {
    exitCode: 0,
    threadId: finalThreadId,
    usage: result.usage,
    configArgs: activeConfigArgs,
    fallbackUsed,
  };
}

function augmentPromptWithMemory({ prompt, runtime, agentLabel }) {
  if (!runtime || !runtime.memory || !runtime.memory.enabled || !runtime.memory.includeInPrompt) {
    return {
      prompt,
      memoryRead: {
        enabled: false,
        context: "",
        files: null,
        snapshots: null,
      },
    };
  }
  const memoryRead = buildMemoryReadContext(runtime, agentLabel || "AGENT");
  const context = String(memoryRead && memoryRead.context || "").trim();
  if (!context) {
    return { prompt, memoryRead };
  }
  return {
    prompt: `${prompt}\n\n${context}`,
    memoryRead,
  };
}

async function maybeRunMemoryUpdate({
  runtime,
  autoMode,
  agentLabel,
  repoRoot,
  configArgs,
  threadId,
  threadFile,
  agentsRoot,
  filtered,
  verboseRef,
  memoryRead,
}) {
  if (!shouldUpdateMemoryForRun(runtime, autoMode)) {
    return threadId;
  }

  const label = agentLabel || "AGENT";
  const resolvedMemory = memoryRead && memoryRead.enabled
    ? memoryRead
    : buildMemoryReadContext(runtime, label);
  const files = resolvedMemory && resolvedMemory.files ? resolvedMemory.files : null;
  if (!files || !files.sharedPath || !files.agentPath) {
    emitLine({
      line: `${label}: memory warning - files not available`,
      filtered,
      verboseRef,
    });
    return threadId;
  }

  const before = captureFileStats([files.sharedPath, files.agentPath]);
  const updatePrompt = buildMemoryUpdatePrompt(runtime, label, files);
  emitLine({
    line: `${label}: memory update start`,
    filtered,
    verboseRef,
  });

  try {
    const result = await runCodexWithRecovery({
      prompt: updatePrompt,
      repoRoot,
      configArgs,
      threadId,
      filtered,
      verboseRef,
      threadFile,
      agentsRoot,
    agentLabel: `${label}-MEMORY`,
    autoCompact: false,
    runtime,
    autoMode,
    allowThreadRotation: false,
  });
    const activeThreadId = result.threadId || threadId;
    const after = captureFileStats([files.sharedPath, files.agentPath]);
    const changed = didAnyFileChange(before, after);
    emitLine({
      line: `${label}: memory update ${changed ? "applied" : "no changes"}`,
      filtered,
      verboseRef,
    });
    return activeThreadId;
  } catch (err) {
    emitLine({
      line: `${label}: memory warning - update failed (${String(err && err.message || err || "error")})`,
      filtered,
      verboseRef,
    });
    return threadId;
  }
}

async function runCodexExecFiltered({
  prompt,
  repoRoot,
  configArgs,
  threadId,
  verboseRef,
  threadFile,
  agentsRoot,
  agentLabel,
  autoCompact,
  compactEvery,
  runtime,
  autoMode,
}) {
  const prepared = augmentPromptWithMemory({ prompt, runtime, agentLabel });
  const initial = await runCodexWithRecovery({
    prompt: prepared.prompt,
    repoRoot,
    configArgs,
    threadId,
    filtered: true,
    verboseRef,
    threadFile,
    agentsRoot,
    agentLabel,
    autoCompact,
    compactEvery,
    runtime,
    autoMode,
  });
  const finalThreadId = await maybeRunMemoryUpdate({
    runtime,
    autoMode,
    agentLabel,
    repoRoot,
    configArgs: initial.configArgs || configArgs,
    threadId: initial.threadId || threadId,
    threadFile,
    agentsRoot,
    filtered: true,
    verboseRef,
    memoryRead: prepared.memoryRead,
  });
  return {
    ...initial,
    threadId: finalThreadId,
  };
}

async function runCodexExec({
  prompt,
  repoRoot,
  configArgs,
  threadId,
  threadFile,
  agentsRoot,
  agentLabel,
  autoCompact,
  compactEvery,
  runtime,
  autoMode,
}) {
  const prepared = augmentPromptWithMemory({ prompt, runtime, agentLabel });
  const initial = await runCodexWithRecovery({
    prompt: prepared.prompt,
    repoRoot,
    configArgs,
    threadId,
    filtered: false,
    verboseRef: { value: true },
    threadFile,
    agentsRoot,
    agentLabel,
    autoCompact,
    compactEvery,
    runtime,
    autoMode,
  });
  const finalThreadId = await maybeRunMemoryUpdate({
    runtime,
    autoMode,
    agentLabel,
    repoRoot,
    configArgs: initial.configArgs || configArgs,
    threadId: initial.threadId || threadId,
    threadFile,
    agentsRoot,
    filtered: false,
    verboseRef: { value: true },
    memoryRead: prepared.memoryRead,
  });
  return {
    ...initial,
    threadId: finalThreadId,
  };
}

function buildInteractiveArgs({ configArgs, threadId }) {
  const args = [];
  if (configArgs && configArgs.length) {
    args.push(...configArgs);
  }
  if (threadId) {
    args.push("resume", threadId);
  }
  return args;
}

function runInteractiveCodexSession({ repoRoot, configArgs, threadId }) {
  const args = buildInteractiveArgs({ configArgs, threadId });
  return new Promise((resolve) => {
    const proc = spawn("codex", args, {
      cwd: repoRoot,
      stdio: "inherit",
    });
    proc.on("close", (code) => {
      resolve(Number.isInteger(code) ? code : 1);
    });
  });
}

async function seedInteractiveThread({
  bootstrapPrompt,
  repoRoot,
  configArgs,
  threadFile,
  agentsRoot,
  agentLabel,
  runtime,
}) {
  if (!bootstrapPrompt) {
    return "";
  }
  const result = await runCodexWithRecovery({
    prompt: bootstrapPrompt,
    repoRoot,
    configArgs,
    threadId: "",
    filtered: false,
    verboseRef: { value: true },
    threadFile,
    agentsRoot,
    agentLabel: `${agentLabel || "AGENT"}-BOOTSTRAP`,
    autoCompact: false,
    runtime,
  });
  if (result.threadId) {
    writeThreadId(threadFile, result.threadId);
    return result.threadId;
  }
  return "";
}

async function startInteractiveCodexAgent({
  agentLabel,
  repoRoot,
  configArgs,
  threadFile,
  agentsRoot,
  bootstrapPrompt,
  threadId,
  runtime,
  autoMode,
}) {
  const label = agentLabel || "AGENT";
  const prepared = augmentPromptWithMemory({
    prompt: bootstrapPrompt || "",
    runtime,
    agentLabel: label,
  });
  const effectiveBootstrapPrompt = prepared.prompt;
  const interactiveAutoMode = Boolean(autoMode);
  let activeThreadId = String(threadId || "").trim();
  if (!activeThreadId) {
    activeThreadId = readThreadId(threadFile);
  }
  if (!activeThreadId) {
    activeThreadId = await seedInteractiveThread({
      bootstrapPrompt: effectiveBootstrapPrompt,
      repoRoot,
      configArgs,
      threadFile,
      agentsRoot,
      agentLabel: label,
      runtime,
    });
  }

  if (activeThreadId) {
    process.stdout.write(`${label}: interactive codex resume ${activeThreadId}\n`);
  } else {
    process.stdout.write(`${label}: interactive codex new session\n`);
  }

  let exitCode = await runInteractiveCodexSession({
    repoRoot,
    configArgs,
    threadId: activeThreadId,
  });

  if (exitCode !== 0 && exitCode !== 130 && activeThreadId) {
    process.stdout.write(`${label}: interactive resume failed, resetting thread and retrying once\n`);
    clearThreadState({ threadFile, threadId: activeThreadId, agentsRoot });
    activeThreadId = await seedInteractiveThread({
      bootstrapPrompt,
      repoRoot,
      configArgs,
      threadFile,
      agentsRoot,
      agentLabel: label,
      runtime,
    });
    exitCode = await runInteractiveCodexSession({
      repoRoot,
      configArgs,
      threadId: activeThreadId,
    });
  }

  if (activeThreadId) {
    writeThreadId(threadFile, activeThreadId);
  }

  if (exitCode === 0 || exitCode === 130) {
    const updatedThreadId = await maybeRunMemoryUpdate({
      runtime,
      autoMode: interactiveAutoMode,
      agentLabel: label,
      repoRoot,
      configArgs,
      threadId: activeThreadId,
      threadFile,
      agentsRoot,
      filtered: false,
      verboseRef: { value: true },
      memoryRead: prepared.memoryRead,
    });
    if (updatedThreadId && updatedThreadId !== activeThreadId) {
      writeThreadId(threadFile, updatedThreadId);
    }
    return;
  }
  throw new Error(`${label}: interactive codex exited with code ${exitCode}`);
}

async function readInputWithHotkeys({ prompt, verboseRef, detailRef }) {
  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let buffer = "";

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);

    const reprintPrompt = () => {
      stdout.write("\n");
      stdout.write(prompt);
      stdout.write(buffer);
    };

    const onKeypress = (str, key) => {
      if (!key) {
        return;
      }

      if (key.meta && key.name === "v") {
        verboseRef.value = !verboseRef.value;
        stdout.write(`\nMODE: verbose=${verboseRef.value}`);
        reprintPrompt();
        return;
      }

      if (key.meta && key.name === "d") {
        detailRef.value = !detailRef.value;
        stdout.write(`\nMODE: detail=${detailRef.value}`);
        reprintPrompt();
        return;
      }

      if (key.ctrl && key.name === "c") {
        stdin.setRawMode(false);
        stdin.removeListener("keypress", onKeypress);
        stdout.write("\n");
        process.exit(0);
      }

      if (key.name === "return") {
        stdin.setRawMode(false);
        stdin.removeListener("keypress", onKeypress);
        stdout.write("\n");
        resolve(buffer);
        return;
      }

      if (key.name === "backspace") {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          stdout.write("\b \b");
        }
        return;
      }

      if (str) {
        buffer += str;
        stdout.write(str);
      }
    };

    stdout.write(prompt);
    stdin.on("keypress", onKeypress);
  });
}

module.exports = {
  ensureDir,
  getFirstFile,
  readConfigArgs,
  readThreadId,
  writeThreadId,
  getThreadFilePath,
  shouldPrintLine,
  runCodexExecFiltered,
  runCodexExec,
  startInteractiveCodexAgent,
  readInputWithHotkeys,
  isContextOverflow,
  clearThreadState,
  __test: {
    parseConfigArgValue,
    resolveModelFallbackAttempt,
    modelFallbackEnabledFromEnv,
  },
};
