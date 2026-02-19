#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

const DEFAULT_AUTO_COMPACT_EVERY_RAW = Number.parseInt(
  process.env.CODEX_AUTO_COMPACT_EVERY || "20",
  10
);
const DEFAULT_AUTO_COMPACT_EVERY = Number.isInteger(DEFAULT_AUTO_COMPACT_EVERY_RAW)
  ? DEFAULT_AUTO_COMPACT_EVERY_RAW
  : 20;

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
}) {
  const label = agentLabel || "AGENT";
  const initialThreadId = threadId || "";

  let result = await runCodexExecOnce({
    prompt,
    repoRoot,
    configArgs,
    threadId: initialThreadId,
    filtered,
    verboseRef,
  });

  if (result.exitCode !== 0 && initialThreadId && isContextOverflow(result.stderrText)) {
    emitLine({
      line: `${label}: context window exceeded; resetting thread and retrying once`,
      filtered,
      verboseRef,
    });
    clearThreadState({ threadFile, threadId: initialThreadId, agentsRoot });
    result = await runCodexExecOnce({
      prompt,
      repoRoot,
      configArgs,
      threadId: "",
      filtered,
      verboseRef,
    });
  }

  if (result.exitCode !== 0) {
    const tail = splitLines(result.stderrText).slice(-3).join(" | ");
    const suffix = tail ? ` (${tail})` : "";
    throw new Error(`${label}: codex exec failed with exit code ${result.exitCode}${suffix}`);
  }

  let finalThreadId = result.threadId || initialThreadId;

  if (finalThreadId) {
    try {
      finalThreadId = await maybeRunCompact({
        repoRoot,
        configArgs,
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
  };
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
}) {
  return runCodexWithRecovery({
    prompt,
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
  });
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
}) {
  return runCodexWithRecovery({
    prompt,
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
  });
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
}) {
  const label = agentLabel || "AGENT";
  let activeThreadId = String(threadId || "").trim();
  if (!activeThreadId) {
    activeThreadId = readThreadId(threadFile);
  }
  if (!activeThreadId) {
    activeThreadId = await seedInteractiveThread({
      bootstrapPrompt,
      repoRoot,
      configArgs,
      threadFile,
      agentsRoot,
      agentLabel: label,
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
};
