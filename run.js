#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn, spawnSync } = require("child_process");
const { getFirstFile, shouldPrintLine, ensureDir } = require("./lib/agent");
const { loadRuntimeConfig, ensureQueueDirs } = require("./lib/runtime");

function parseArgs(argv) {
  const args = {
    help: false,
    flow: undefined,
    maxReq: undefined,
    verbose: undefined,
    detail: undefined,
    preflight: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const arg = raw.toLowerCase();

    if (arg === "-h" || arg === "--help") {
      args.help = true;
      continue;
    }

    if (arg === "-v" || arg === "--verbose") {
      args.verbose = true;
      continue;
    }
    if (arg === "--no-verbose") {
      args.verbose = false;
      continue;
    }

    if (arg === "-d" || arg === "--detail") {
      args.detail = true;
      continue;
    }
    if (arg === "--no-detail") {
      args.detail = false;
      continue;
    }

    if (arg === "-m" || arg === "--max-req" || arg === "--maxreq") {
      const value = argv[i + 1];
      i++;
      args.maxReq = parseInt(value, 10) || 0;
      continue;
    }
    if (arg.startsWith("--max-req=") || arg.startsWith("--maxreq=")) {
      const value = raw.split("=", 2)[1];
      args.maxReq = parseInt(value, 10) || 0;
      continue;
    }

    if (arg === "--flow" || arg === "--mode") {
      args.flow = String(argv[i + 1] || "").toLowerCase();
      i++;
      continue;
    }
    if (arg.startsWith("--flow=") || arg.startsWith("--mode=")) {
      args.flow = String(raw.split("=", 2)[1] || "").toLowerCase();
      continue;
    }

    if (arg === "--standard") {
      args.flow = "standard";
      continue;
    }
    if (arg === "--detailed") {
      args.flow = "detailed";
      continue;
    }
    if (arg === "--bulk") {
      args.flow = "bulk";
      continue;
    }
    if (arg === "--fast") {
      args.flow = "fast";
      continue;
    }

    if (arg === "--preflight") {
      args.preflight = String(argv[i + 1] || "").toLowerCase();
      i++;
      continue;
    }
    if (arg.startsWith("--preflight=")) {
      args.preflight = String(raw.split("=", 2)[1] || "").toLowerCase();
      continue;
    }
    if (arg === "--no-preflight") {
      args.preflight = "none";
      continue;
    }

    // Backward compatibility
    if (arg === "--profile") {
      const value = String(argv[i + 1] || "").toLowerCase();
      i++;
      if (value === "lean" || value === "compact" || value === "fast") {
        args.flow = "fast";
      } else if (value === "full") {
        args.flow = "detailed";
      }
      continue;
    }
    if (arg.startsWith("--profile=")) {
      const value = String(raw.split("=", 2)[1] || "").toLowerCase();
      if (value === "lean" || value === "compact" || value === "fast") {
        args.flow = "fast";
      } else if (value === "full") {
        args.flow = "detailed";
      }
      continue;
    }
  }

  return args;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatTimestamp(date) {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("") + "-" + [
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
  ].join("");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countFiles(dir) {
  if (!fs.existsSync(dir)) {
    return 0;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (entry.isFile() && !entry.name.startsWith(".")) {
      count += 1;
    }
  }
  return count;
}

function createLineBuffer(onLine) {
  let buffer = "";
  return {
    push(text) {
      buffer += text;
      let idx = buffer.indexOf("\n");
      while (idx !== -1) {
        let line = buffer.slice(0, idx);
        if (line.endsWith("\r")) {
          line = line.slice(0, -1);
        }
        onLine(line);
        buffer = buffer.slice(idx + 1);
        idx = buffer.indexOf("\n");
      }
    },
    flush() {
      if (buffer.length === 0) {
        return;
      }
      let line = buffer;
      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }
      onLine(line);
      buffer = "";
    },
  };
}

function isRetryable(stderrText) {
  if (!stderrText) {
    return false;
  }
  return /network error|stream disconnected before completion|Reconnecting\.\.\./i.test(stderrText);
}

function printUsage() {
  console.log(
    "Usage: node run.js [--flow standard|detailed|bulk|fast] [--preflight hard|soft|none|snapshot] [--max-req N] [--verbose|--no-verbose] [--detail|--no-detail]"
  );
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "0s";
  }
  const totalSeconds = Math.round(ms / 100) / 10;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds - minutes * 60).toFixed(1).padStart(4, "0");
  return `${minutes}m${seconds}s`;
}

function parseNodeVersion(value) {
  if (!value) {
    return null;
  }
  const cleaned = value.startsWith("v") ? value.slice(1) : value;
  const parts = cleaned.split(".").map((part) => parseInt(part, 10));
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  return { major: parts[0], minor: parts[1], patch: parts[2] || 0 };
}

function compareVersions(a, b) {
  if (!a || !b) {
    return 0;
  }
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  return a.patch - b.patch;
}

function normalizeFlow(value, fallback) {
  const v = String(value || fallback || "").toLowerCase();
  return ["standard", "detailed", "bulk", "fast"].includes(v) ? v : fallback;
}

function normalizePreflight(value, fallback) {
  const v = String(value || fallback || "").toLowerCase();
  return ["hard", "soft", "none", "snapshot"].includes(v) ? v : fallback;
}

function runGit(repoRoot, args) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function normalizePathSafe(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function gitTopLevel(repoRoot) {
  const res = runGit(repoRoot, ["rev-parse", "--show-toplevel"]);
  if (res.status !== 0) {
    return "";
  }
  const output = String(res.stdout || "").trim();
  return output ? normalizePathSafe(output) : "";
}

function isGitRepo(repoRoot) {
  const res = runGit(repoRoot, ["rev-parse", "--is-inside-work-tree"]);
  return res.status === 0;
}

function gitHasChanges(repoRoot) {
  if (!isGitRepo(repoRoot)) {
    return false;
  }
  const res = runGit(repoRoot, ["status", "--porcelain"]);
  return res.status === 0 && Boolean((res.stdout || "").trim());
}

function gitSnapshotCommit(repoRoot, messagePrefix) {
  const addRes = runGit(repoRoot, ["add", "-A"]);
  if (addRes.status !== 0) {
    throw new Error(`preflight snapshot git add failed: ${(addRes.stderr || "").trim()}`);
  }

  const msg = `${messagePrefix} ${formatTimestamp(new Date())}`;
  const commitRes = runGit(repoRoot, ["commit", "-m", msg]);
  if (commitRes.status !== 0) {
    const output = `${commitRes.stdout || ""}\n${commitRes.stderr || ""}`;
    if (!/nothing to commit/i.test(output)) {
      throw new Error(`preflight snapshot git commit failed: ${output.trim()}`);
    }
  }
}

function ensureDirectoryPath(label, dir) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Missing required directory: ${label} (${dir})`);
  }
}

function parseFrontMatter(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return {};
  }

  const map = {};
  const lines = match[1].split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const idx = trimmed.indexOf(":");
    if (idx === -1) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim().toLowerCase().replace(/-/g, "_");
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function normalizeRequirementScope(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["frontend", "fe", "ui"].includes(normalized)) {
    return "frontend";
  }
  if (["backend", "be", "api", "server"].includes(normalized)) {
    return "backend";
  }
  if (["fullstack", "fs", "full-stack", "full_stack"].includes(normalized)) {
    return "fullstack";
  }
  return "";
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function readGateFile(filePath, role) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing final gate file for ${role}: ${filePath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(`invalid final gate JSON for ${role}: ${err.message}`);
  }
  const status = String(parsed.status || "").toLowerCase();
  const summary = String(parsed.summary || "").trim();
  if (!["pass", "fail"].includes(status)) {
    throw new Error(`invalid final gate status for ${role}: ${status || "<empty>"}`);
  }
  return {
    role,
    status,
    summary: summary || "no summary",
    blockingFindings: Array.isArray(parsed.blocking_findings)
      ? parsed.blocking_findings.map((x) => String(x))
      : [],
  };
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    printUsage();
    process.exit(0);
  }

  const runtime = loadRuntimeConfig(__dirname);
  const flow = normalizeFlow(cli.flow, runtime.runDefaults.flow || runtime.flow.defaultMode);
  const maxReq = Number.isFinite(cli.maxReq) ? cli.maxReq : runtime.runDefaults.maxReq;
  const preflightMode = normalizePreflight(cli.preflight, runtime.runDefaults.preflight);

  const queue = runtime.queues;
  ensureQueueDirs(queue);

  const scripts = {
    PO: path.join(__dirname, "po", "po.js"),
    ARCH: path.join(__dirname, "arch", "arch.js"),
    DEV_FE: path.join(__dirname, "dev-fe", "dev-fe.js"),
    DEV_BE: path.join(__dirname, "dev-be", "dev-be.js"),
    DEV_FS: path.join(__dirname, "dev-fs", "dev-fs.js"),
    QA: path.join(__dirname, "qa", "qa.js"),
    SEC: path.join(__dirname, "sec", "sec.js"),
    UX: path.join(__dirname, "ux", "ux.js"),
    DEPLOY: path.join(__dirname, "deploy", "deploy.js"),
  };

  const logDir = path.join(__dirname, "logs");
  ensureDir(logDir);
  const logPath = path.join(logDir, `flow-${formatTimestamp(new Date())}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  const maxRetries = (() => {
    const raw = process.env.CODEX_FLOW_RETRIES;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : runtime.flow.maxRetries;
  })();

  const retryBaseDelay = (() => {
    const raw = process.env.CODEX_FLOW_RETRY_DELAY;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : runtime.flow.retryDelaySeconds;
  })();

  const idlePollSeconds = (() => {
    const raw = process.env.CODEX_FLOW_IDLE_POLL_SECONDS;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : runtime.flow.idlePollSeconds;
  })();
  const idlePollMs = idlePollSeconds * 1000;

  const state = {
    verbose:
      typeof cli.verbose === "boolean" ? cli.verbose : Boolean(runtime.runDefaults.verbose),
    detail:
      typeof cli.detail === "boolean" ? cli.detail : Boolean(runtime.runDefaults.detail),
    currentPhase: "",
    currentReqName: "",
    currentPhaseStart: 0,
    processed: 0,
  };

  const releasedSinceFinal = new Set();

  const preflightState = {
    mode: preflightMode,
    gitRepo: false,
    startedDirty: false,
    allowDeployCommits: true,
    targetIsAgentsRepo: false,
    targetGitTopLevel: "",
    agentsGitTopLevel: "",
  };

  function assertGitWriteTarget(actionLabel) {
    if (preflightState.targetIsAgentsRepo) {
      throw new Error(
        `Refusing ${actionLabel}: target repo (${runtime.repoRoot}) resolves to agents repository git root (${preflightState.targetGitTopLevel}).`
      );
    }
  }

  function writeLog(message) {
    process.stdout.write(message + "\n");
    logStream.write(message + "\n");
  }

  function moveRequirementFile(sourcePath, targetPath) {
    try {
      fs.renameSync(sourcePath, targetPath);
      return;
    } catch (error) {
      if (error && error.code === "EXDEV") {
        fs.copyFileSync(sourcePath, targetPath);
        fs.unlinkSync(sourcePath);
        return;
      }
      throw error;
    }
  }

  function bypassPhase({ phase, reqName, fromPath, toPath }) {
    if (!fs.existsSync(fromPath)) {
      return false;
    }
    const fromLabel = path.basename(path.dirname(fromPath));
    const toLabel = path.basename(path.dirname(toPath));
    if (fs.existsSync(toPath)) {
      fs.unlinkSync(fromPath);
      writeLog(
        `FLOW: ${phase} bypass req=${reqName} from=${fromLabel} to=${toLabel} (already existed)`
      );
      return true;
    }
    moveRequirementFile(fromPath, toPath);
    writeLog(`FLOW: ${phase} bypass req=${reqName} from=${fromLabel} to=${toLabel}`);
    return true;
  }

  function writeDetailStatus(reqName) {
    if (!state.detail) {
      return;
    }
    const selectedCount = countFiles(queue.selected);
    writeLog(
      `DETAIL: run=${state.processed + 1} phase=${state.currentPhase} req=${reqName} selected=${selectedCount}`
    );
  }

  function countActivePipeline() {
    return (
      countFiles(queue.selected) +
      countFiles(queue.arch) +
      countFiles(queue.dev) +
      countFiles(queue.qa) +
      countFiles(queue.sec) +
      countFiles(queue.ux) +
      countFiles(queue.deploy)
    );
  }

  function emitSummaryStatus() {
    const refinementCount = countFiles(queue.refinement);
    const backlogCount = countFiles(queue.backlog);
    const selectedCount = countFiles(queue.selected);
    const archCount = countFiles(queue.arch);
    const devCount = countFiles(queue.dev);
    const qaCount = countFiles(queue.qa);
    const secCount = countFiles(queue.sec);
    const uxCount = countFiles(queue.ux);
    const deployCount = countFiles(queue.deploy);
    const releasedCount = countFiles(queue.released);
    const clarifyCount = countFiles(queue.toClarify);
    const blockedCount = countFiles(queue.blocked);

    const activeLine = state.currentPhase
      ? `STATUS: active=${state.currentPhase} req=${state.currentReqName || "?"} elapsed=${formatDuration(
          Date.now() - state.currentPhaseStart
        )}`
      : "STATUS: active=none";

    writeLog(activeLine);
    writeLog(
      `STATUS: refinement=${refinementCount} backlog=${backlogCount} selected=${selectedCount}`
    );
    writeLog(
      `STATUS: arch=${archCount} dev=${devCount} qa=${qaCount} sec=${secCount} ux=${uxCount}`
    );
    writeLog(`STATUS: deploy=${deployCount} released=${releasedCount}`);
    writeLog(`STATUS: clarify=${clarifyCount} blocked=${blockedCount}`);
    writeLog(`STATUS: active_pipeline=${countActivePipeline()}`);
  }

  function setupKeypress() {
    if (!process.stdin.isTTY) {
      return;
    }
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on("keypress", (_str, key) => {
      if (!key) {
        return;
      }
      const name = (key.name || "").toLowerCase();
      if (name === "v") {
        state.verbose = !state.verbose;
        writeLog(`MODE: verbose=${state.verbose}`);
        return;
      }
      if (name === "d") {
        state.detail = !state.detail;
        writeLog(`MODE: detail=${state.detail}`);
        if (state.detail && state.currentReqName) {
          writeDetailStatus(state.currentReqName);
        }
        return;
      }
      if (name === "s") {
        emitSummaryStatus();
        return;
      }
      if (key.ctrl && name === "c") {
        process.stdin.setRawMode(false);
        writeLog("FLOW: interrupted");
        process.exit(130);
      }
    });
  }

  async function spawnAgent({ scriptPath, args: agentArgs, stdoutPath, stderrPath }) {
    return new Promise((resolve) => {
      let stderrText = "";
      const stdoutFile = fs.createWriteStream(stdoutPath, { flags: "a" });
      const stderrFile = fs.createWriteStream(stderrPath, { flags: "a" });
      let finished = false;

      const proc = spawn(process.execPath, [scriptPath, ...agentArgs], {
        cwd: __dirname,
        env: { ...process.env, CODEX_FLOW_AUTO: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });

      const stdoutLines = createLineBuffer((line) => {
        if (state.verbose && shouldPrintLine(line, state.verbose)) {
          writeLog(line);
        }
      });
      const stderrLines = createLineBuffer((line) => {
        if (state.verbose && shouldPrintLine(line, state.verbose)) {
          writeLog(line);
        }
      });

      proc.stdout.on("data", (chunk) => {
        stdoutFile.write(chunk);
        stdoutLines.push(chunk.toString("utf8"));
      });

      proc.stderr.on("data", (chunk) => {
        stderrFile.write(chunk);
        const text = chunk.toString("utf8");
        stderrText += text;
        if (stderrText.length > 20000) {
          stderrText = stderrText.slice(-20000);
        }
        stderrLines.push(text);
      });

      const finalize = (exitCode) => {
        if (finished) {
          return;
        }
        finished = true;
        stdoutLines.flush();
        stderrLines.flush();
        stdoutFile.end();
        stderrFile.end();
        resolve({ exitCode, stderrText });
      };

      proc.on("error", (err) => {
        stderrText = `${stderrText}\n${err.message}`;
        finalize(1);
      });

      proc.on("close", (code) => {
        finalize(code);
      });
    });
  }

  async function runAgentScript({ phase, scriptPath, args: agentArgs, reqName }) {
    const phaseStart = Date.now();
    state.currentPhase = phase;
    state.currentReqName = reqName;
    state.currentPhaseStart = phaseStart;

    const emitStatus = () => {
      if (!state.verbose) {
        writeLog(
          `FLOW: ${phase} running req=${reqName} elapsed=${formatDuration(
            Date.now() - phaseStart
          )}`
        );
      }
    };

    if (state.verbose) {
      writeLog(`FLOW: ${phase} start req=${reqName}`);
    } else {
      emitStatus();
    }
    writeDetailStatus(reqName);

    const statusTimer = setInterval(emitStatus, 10000);
    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          writeLog(`FLOW: retrying ${phase} attempt ${attempt + 1}`);
          await sleep(retryBaseDelay * attempt * 1000);
        }

        const suffix = attempt > 0 ? `-r${attempt + 1}` : "";
        const timestamp = formatTimestamp(new Date());
        const stdoutPath = path.join(logDir, `agent-${phase}-${timestamp}${suffix}.out`);
        const stderrPath = path.join(logDir, `agent-${phase}-${timestamp}${suffix}.err`);

        const { exitCode, stderrText } = await spawnAgent({
          scriptPath,
          args: agentArgs,
          stdoutPath,
          stderrPath,
        });

        if (exitCode === 0) {
          writeLog(
            `FLOW: ${phase} done req=${reqName} duration=${formatDuration(Date.now() - phaseStart)}`
          );
          return;
        }

        if (isRetryable(stderrText)) {
          writeLog(
            `FLOW: ${phase} network error detected; retrying (set CODEX_FLOW_RETRIES/CODEX_FLOW_RETRY_DELAY to adjust)`
          );
          continue;
        }

        throw new Error(
          `${phase} failed for ${reqName} after ${formatDuration(Date.now() - phaseStart)}`
        );
      }
    } finally {
      clearInterval(statusTimer);
      state.currentPhase = "";
      state.currentReqName = "";
      state.currentPhaseStart = 0;
    }
  }

  async function runPhase({ phase, scriptPath, args: agentArgs, reqName, successPaths }) {
    try {
      await runAgentScript({ phase, scriptPath, args: agentArgs, reqName });
      return;
    } catch (err) {
      for (const successPath of successPaths || []) {
        if (successPath && fs.existsSync(successPath)) {
          writeLog(`FLOW: ${phase} reported error but output exists; continuing`);
          return;
        }
      }
      throw err;
    }
  }

  function resolveDevAgent(reqPath) {
    const defaultScope = runtime.devRouting.defaultScope || "fullstack";
    let requestedScope = defaultScope;
    let source = "default";

    if (runtime.devRouting.mode === "split") {
      const fm = parseFrontMatter(reqPath);
      const scopeCandidate =
        fm.implementation_scope || fm.dev_scope || fm.scope || fm.implementation || "";
      const normalized = normalizeRequirementScope(scopeCandidate);
      if (normalized) {
        requestedScope = normalized;
        source = "front_matter";
      } else if (scopeCandidate) {
        requestedScope = defaultScope;
        source = "invalid_front_matter";
      }
    } else {
      requestedScope = "fullstack";
      source = "routing_mode";
    }

    let selectedScope = requestedScope;
    const reasons = [];

    function fallbackToAvailable() {
      if (runtime.devAgents.useFs) {
        selectedScope = "fullstack";
        return true;
      }
      if (runtime.devAgents.useFe) {
        selectedScope = "frontend";
        return true;
      }
      if (runtime.devAgents.useBe) {
        selectedScope = "backend";
        return true;
      }
      return false;
    }

    if (selectedScope === "frontend" && !runtime.devAgents.useFe) {
      reasons.push("frontend agent disabled");
      if (!fallbackToAvailable()) {
        throw new Error("No enabled dev agent is available (frontend requested)");
      }
    }
    if (selectedScope === "backend" && !runtime.devAgents.useBe) {
      reasons.push("backend agent disabled");
      if (!fallbackToAvailable()) {
        throw new Error("No enabled dev agent is available (backend requested)");
      }
    }
    if (selectedScope === "fullstack" && !runtime.devAgents.useFs) {
      reasons.push("fullstack agent disabled");
      if (!fallbackToAvailable()) {
        throw new Error("No enabled dev agent is available (fullstack requested)");
      }
    }

    if (!runtime.devAgents.useFe && !runtime.devAgents.useBe && !runtime.devAgents.useFs) {
      throw new Error("No enabled dev agents. Configure [dev_agents] in config.");
    }

    const mapping = {
      frontend: { phase: "DEV_FE", scriptPath: scripts.DEV_FE },
      backend: { phase: "DEV_BE", scriptPath: scripts.DEV_BE },
      fullstack: { phase: "DEV_FS", scriptPath: scripts.DEV_FS },
    };

    const selected = mapping[selectedScope];
    if (!selected || !selected.scriptPath) {
      throw new Error(`Unable to resolve dev agent for scope=${selectedScope}`);
    }

    return {
      ...selected,
      requestedScope,
      selectedScope,
      source,
      reasons,
    };
  }

  function gitCommitRequirement(reqName) {
    if (!preflightState.allowDeployCommits) {
      writeLog(`FLOW: deploy commit skipped by preflight policy req=${reqName}`);
      return;
    }

    if (runtime.deploy.mode === "check") {
      writeLog(`FLOW: deploy mode=check; skip commit req=${reqName}`);
      return;
    }

    assertGitWriteTarget(`deploy commit for req=${reqName}`);

    if (!preflightState.gitRepo || !isGitRepo(runtime.repoRoot)) {
      writeLog(`FLOW: deploy skip git action, not a git repo: ${runtime.repoRoot}`);
      return;
    }

    if (!gitHasChanges(runtime.repoRoot)) {
      writeLog(`FLOW: deploy no git changes for req=${reqName}`);
      return;
    }

    const addRes = runGit(runtime.repoRoot, ["add", "-A"]);
    if (addRes.status !== 0) {
      throw new Error(`git add failed for ${reqName}: ${(addRes.stderr || "").trim()}`);
    }

    const msg = `chore(deploy): ${reqName}`;
    const commitRes = runGit(runtime.repoRoot, ["commit", "-m", msg]);
    if (commitRes.status !== 0) {
      const output = `${commitRes.stdout || ""}\n${commitRes.stderr || ""}`;
      if (/nothing to commit/i.test(output)) {
        writeLog(`FLOW: deploy nothing to commit for req=${reqName}`);
      } else {
        throw new Error(`git commit failed for ${reqName}: ${output.trim()}`);
      }
    } else {
      writeLog(`FLOW: deploy committed req=${reqName}`);
    }

    if (runtime.deploy.mode === "commit_push") {
      assertGitWriteTarget(`deploy push for req=${reqName}`);
      const pushRes = runGit(runtime.repoRoot, ["push"]);
      if (pushRes.status !== 0) {
        throw new Error(`git push failed for ${reqName}: ${(pushRes.stderr || "").trim()}`);
      }
      writeLog(`FLOW: deploy pushed req=${reqName}`);
    }
  }

  function gitFinalPush() {
    if (!preflightState.allowDeployCommits) {
      writeLog("FLOW: final push skipped by preflight policy");
      return;
    }
    if (runtime.deploy.mode === "check") {
      writeLog("FLOW: deploy mode=check; final push skipped");
      return;
    }
    if (!runtime.deploy.finalPushOnSuccess) {
      writeLog("FLOW: final push disabled by config");
      return;
    }
    if (!preflightState.gitRepo || !isGitRepo(runtime.repoRoot)) {
      writeLog(`FLOW: final push skipped, not a git repo: ${runtime.repoRoot}`);
      return;
    }
    assertGitWriteTarget("final git push");
    const pushRes = runGit(runtime.repoRoot, ["push"]);
    if (pushRes.status !== 0) {
      throw new Error(`final git push failed: ${(pushRes.stderr || "").trim()}`);
    }
    writeLog("FLOW: final git push done");
  }

  function getRequirementPaths(name) {
    return {
      selected: path.join(queue.selected, name),
      arch: path.join(queue.arch, name),
      dev: path.join(queue.dev, name),
      qa: path.join(queue.qa, name),
      sec: path.join(queue.sec, name),
      ux: path.join(queue.ux, name),
      deploy: path.join(queue.deploy, name),
      released: path.join(queue.released, name),
      clarify: path.join(queue.toClarify, name),
      blocked: path.join(queue.blocked, name),
    };
  }

  function hasTerminalState(paths) {
    if (fs.existsSync(paths.clarify)) {
      return "to-clarify";
    }
    if (fs.existsSync(paths.blocked)) {
      return "blocked";
    }
    if (fs.existsSync(paths.released)) {
      return "released";
    }
    return "";
  }

  function terminalStateFor(name) {
    return hasTerminalState(getRequirementPaths(name));
  }

  async function processRequirement({ name, fastBypass }) {
    const paths = getRequirementPaths(name);

    if (fs.existsSync(paths.selected)) {
      await runPhase({
        phase: "PO",
        scriptPath: scripts.PO,
        args: ["--auto", "--requirement", paths.selected],
        reqName: name,
        successPaths: [paths.arch, paths.clarify],
      });
    }

    let terminal = hasTerminalState(paths);
    if (terminal) {
      return terminal;
    }

    if (fs.existsSync(paths.arch)) {
      if (fastBypass) {
        bypassPhase({
          phase: "ARCH",
          reqName: name,
          fromPath: paths.arch,
          toPath: paths.dev,
        });
      } else {
        await runPhase({
          phase: "ARCH",
          scriptPath: scripts.ARCH,
          args: ["--auto", "--requirement", paths.arch],
          reqName: name,
          successPaths: [paths.dev, paths.clarify],
        });
      }
    }

    terminal = hasTerminalState(paths);
    if (terminal) {
      return terminal;
    }

    if (fs.existsSync(paths.dev)) {
      const devAgent = resolveDevAgent(paths.dev);
      if (state.detail || state.verbose) {
        const reasonSuffix = devAgent.reasons.length > 0 ? ` reason=${devAgent.reasons.join(",")}` : "";
        writeLog(
          `FLOW: dev-routing req=${name} requested=${devAgent.requestedScope} selected=${devAgent.selectedScope} source=${devAgent.source}${reasonSuffix}`
        );
      }
      await runPhase({
        phase: devAgent.phase,
        scriptPath: devAgent.scriptPath,
        args: ["--auto", "--requirement", paths.dev],
        reqName: name,
        successPaths: [paths.qa, paths.clarify],
      });
    }

    terminal = hasTerminalState(paths);
    if (terminal) {
      return terminal;
    }

    if (fs.existsSync(paths.qa)) {
      await runPhase({
        phase: "QA",
        scriptPath: scripts.QA,
        args: ["--auto", "--requirement", paths.qa],
        reqName: name,
        successPaths: [paths.sec, paths.clarify, paths.blocked],
      });
    }

    terminal = hasTerminalState(paths);
    if (terminal) {
      return terminal;
    }

    if (fs.existsSync(paths.sec)) {
      if (fastBypass) {
        bypassPhase({
          phase: "SEC",
          reqName: name,
          fromPath: paths.sec,
          toPath: paths.deploy,
        });
      } else {
        await runPhase({
          phase: "SEC",
          scriptPath: scripts.SEC,
          args: ["--auto", "--requirement", paths.sec],
          reqName: name,
          successPaths: [paths.ux, paths.clarify, paths.blocked],
        });
      }
    }

    terminal = hasTerminalState(paths);
    if (terminal) {
      return terminal;
    }

    if (fs.existsSync(paths.ux)) {
      if (fastBypass) {
        bypassPhase({
          phase: "UX",
          reqName: name,
          fromPath: paths.ux,
          toPath: paths.deploy,
        });
      } else {
        await runPhase({
          phase: "UX",
          scriptPath: scripts.UX,
          args: ["--auto", "--requirement", paths.ux],
          reqName: name,
          successPaths: [paths.deploy, paths.clarify, paths.blocked],
        });
      }
    }

    terminal = hasTerminalState(paths);
    if (terminal) {
      return terminal;
    }

    if (fs.existsSync(paths.deploy)) {
      await runPhase({
        phase: "DEPLOY",
        scriptPath: scripts.DEPLOY,
        args: ["--auto", "--requirement", paths.deploy],
        reqName: name,
        successPaths: [paths.released],
      });
    }

    if (fs.existsSync(paths.released)) {
      gitCommitRequirement(name);
      releasedSinceFinal.add(name);
      return "released";
    }

    terminal = hasTerminalState(paths);
    if (terminal) {
      return terminal;
    }

    if (
      fs.existsSync(paths.selected) ||
      fs.existsSync(paths.arch) ||
      fs.existsSync(paths.dev) ||
      fs.existsSync(paths.qa) ||
      fs.existsSync(paths.sec) ||
      fs.existsSync(paths.ux) ||
      fs.existsSync(paths.deploy)
    ) {
      return "pending";
    }

    return "none";
  }

  function getNextTarget(stageOrder) {
    for (const stage of stageOrder) {
      const file = getFirstFile(queue[stage]);
      if (file) {
        return { stage, file };
      }
    }
    return null;
  }

  async function runFinalGate(role, scriptPath) {
    const gateDir = path.join(runtime.agentsRoot, ".runtime", "final-gates");
    ensureDir(gateDir);
    const gateFile = path.join(gateDir, `${role.toLowerCase()}.json`);

    writeJson(gateFile, {
      role,
      status: "fail",
      summary: "Gate file not updated by final-pass agent",
      blocking_findings: ["missing gate output"],
    });

    await runAgentScript({
      phase: `${role}-FINAL`,
      scriptPath,
      args: ["--auto", "--final-pass", "--gate-file", gateFile],
      reqName: "ALL",
    });

    const gate = readGateFile(gateFile, role);
    writeLog(
      `FLOW: final gate role=${role} status=${gate.status} summary=${gate.summary}`
    );
    if (gate.status !== "pass") {
      const findings = gate.blockingFindings.length > 0 ? ` findings=${gate.blockingFindings.join(" | ")}` : "";
      throw new Error(`Final ${role} gate failed.${findings}`);
    }
  }

  async function runFinalPassIfNeeded() {
    if (flow !== "standard" && flow !== "detailed") {
      return;
    }
    if (releasedSinceFinal.size === 0) {
      return;
    }

    const names = Array.from(releasedSinceFinal).sort();
    writeLog(`FLOW: final pass start count=${names.length}`);

    await runFinalGate("QA", scripts.QA);
    await runFinalGate("SEC", scripts.SEC);
    await runFinalGate("UX", scripts.UX);

    await runAgentScript({
      phase: "DEPLOY-FINAL",
      scriptPath: scripts.DEPLOY,
      args: ["--auto", "--final-pass"],
      reqName: "ALL",
    });

    gitFinalPush();
    writeLog(`FLOW: final pass done items=${names.join(",")}`);
    releasedSinceFinal.clear();
  }

  async function runDetailedOrFast() {
    const stageOrder = ["selected"];
    const fastBypass = flow === "fast";

    while (true) {
      if (maxReq > 0 && state.processed >= maxReq) {
        writeLog(`FLOW: max req reached (${state.processed})`);
        break;
      }

      const target = getNextTarget(stageOrder);
      if (!target) {
        const active = countActivePipeline();
        if (active > 0) {
          writeLog(
            "FLOW: active requirements exist outside selected; run starts from selected only. Move items back to selected or finish manually."
          );
          if (maxReq > 0) {
            break;
          }
          await sleep(idlePollMs);
          continue;
        }
        await runFinalPassIfNeeded();
        writeLog("FLOW: active queues empty");
        if (maxReq > 0) {
          break;
        }
        writeLog(`FLOW: waiting ${idlePollSeconds}s before next selected check`);
        await sleep(idlePollMs);
        continue;
      }

      const name = path.basename(target.file);
      if (state.detail || state.verbose) {
        writeLog(`FLOW: start ${name} (from ${target.stage})`);
      }

      const result = await processRequirement({ name, fastBypass });
      if (["released", "to-clarify", "blocked", "none"].includes(result)) {
        writeLog(`FLOW: terminal req=${name} status=${result}`);
        state.processed += 1;
      } else if (result === "pending") {
        writeLog(`FLOW: req=${name} remains pending in active pipeline`);
      }
    }
  }

  function countPlanningQueues() {
    return countFiles(queue.selected) + countFiles(queue.arch) + countFiles(queue.dev);
  }

  async function runStandard() {
    while (true) {
      if (maxReq > 0 && state.processed >= maxReq) {
        writeLog(`FLOW: max req reached (${state.processed})`);
        break;
      }

      const before = countActivePipeline();
      if (before === 0) {
        await runFinalPassIfNeeded();
        writeLog("FLOW: active queues empty");
        if (maxReq > 0) {
          break;
        }
        writeLog(`FLOW: waiting ${idlePollSeconds}s before next selected check`);
        await sleep(idlePollMs);
        continue;
      }

      const planningAtStart = countPlanningQueues();
      if (planningAtStart > 0 && countFiles(queue.selected) === 0) {
        writeLog(
          "FLOW: planning requirements exist outside selected; move items to selected or finish PO/ARCH/DEV queues manually."
        );
        if (maxReq > 0) {
          break;
        }
        await sleep(idlePollMs);
        continue;
      }

      // Phase 1: process each selected requirement through PO -> ARCH -> DEV.
      let upstreamMadeProgress = false;
      while (true) {
        if (maxReq > 0 && state.processed >= maxReq) {
          break;
        }

        const selectedFile = getFirstFile(queue.selected);
        if (!selectedFile) {
          break;
        }

        upstreamMadeProgress = true;
        const name = path.basename(selectedFile);

        await runPhase({
          phase: "PO",
          scriptPath: scripts.PO,
          args: ["--auto", "--requirement", selectedFile],
          reqName: name,
          successPaths: [path.join(queue.arch, name), path.join(queue.toClarify, name)],
        });

        let terminal = terminalStateFor(name);
        if (terminal) {
          writeLog(`FLOW: terminal req=${name} status=${terminal}`);
          state.processed += 1;
          continue;
        }

        let p = getRequirementPaths(name);
        if (fs.existsSync(p.arch)) {
          await runPhase({
            phase: "ARCH",
            scriptPath: scripts.ARCH,
            args: ["--auto", "--requirement", p.arch],
            reqName: name,
            successPaths: [path.join(queue.dev, name), path.join(queue.toClarify, name)],
          });
        }

        terminal = terminalStateFor(name);
        if (terminal) {
          writeLog(`FLOW: terminal req=${name} status=${terminal}`);
          state.processed += 1;
          continue;
        }

        p = getRequirementPaths(name);
        if (fs.existsSync(p.dev)) {
          const devAgent = resolveDevAgent(p.dev);
          if (state.detail || state.verbose) {
            const reasonSuffix = devAgent.reasons.length > 0 ? ` reason=${devAgent.reasons.join(",")}` : "";
            writeLog(
              `FLOW: dev-routing req=${name} requested=${devAgent.requestedScope} selected=${devAgent.selectedScope} source=${devAgent.source}${reasonSuffix}`
            );
          }
          await runPhase({
            phase: devAgent.phase,
            scriptPath: devAgent.scriptPath,
            args: ["--auto", "--requirement", p.dev],
            reqName: name,
            successPaths: [path.join(queue.qa, name), path.join(queue.toClarify, name)],
          });
        }

        terminal = terminalStateFor(name);
        if (terminal) {
          writeLog(`FLOW: terminal req=${name} status=${terminal}`);
          state.processed += 1;
          continue;
        }

        p = getRequirementPaths(name);
        if (
          !fs.existsSync(p.qa) &&
          (fs.existsSync(p.selected) || fs.existsSync(p.arch) || fs.existsSync(p.dev))
        ) {
          writeLog(
            `FLOW: standard no progress for req=${name} in PO/ARCH/DEV chain; waiting for manual intervention`
          );
          break;
        }

        if (maxReq > 0 && state.processed >= maxReq) {
          break;
        }
      }

      if (maxReq > 0 && state.processed >= maxReq) {
        writeLog(`FLOW: max req reached (${state.processed})`);
        break;
      }

      const planningLeft = countPlanningQueues();
      if (planningLeft > 0) {
        if (!upstreamMadeProgress) {
          writeLog("FLOW: standard no progress in PO/ARCH/DEV phase, waiting for manual intervention");
        }
        if (maxReq > 0) {
          break;
        }
        await sleep(idlePollMs);
        continue;
      }

      // Phase 2: one global QA -> SEC -> UX -> DEPLOY pass over accumulated work.
      await processQueueStage({
        inputDir: queue.qa,
        runOne: async ({ file, name }) => {
          await runPhase({
            phase: "QA",
            scriptPath: scripts.QA,
            args: ["--auto", "--requirement", file],
            reqName: name,
            successPaths: [
              path.join(queue.sec, name),
              path.join(queue.toClarify, name),
              path.join(queue.blocked, name),
            ],
          });
        },
        terminalCheck: (name) => terminalStateFor(name),
      });

      if (maxReq > 0 && state.processed >= maxReq) {
        writeLog(`FLOW: max req reached (${state.processed})`);
        break;
      }

      await processQueueStage({
        inputDir: queue.sec,
        runOne: async ({ file, name }) => {
          await runPhase({
            phase: "SEC",
            scriptPath: scripts.SEC,
            args: ["--auto", "--requirement", file],
            reqName: name,
            successPaths: [
              path.join(queue.ux, name),
              path.join(queue.toClarify, name),
              path.join(queue.blocked, name),
            ],
          });
        },
        terminalCheck: (name) => terminalStateFor(name),
      });

      if (maxReq > 0 && state.processed >= maxReq) {
        writeLog(`FLOW: max req reached (${state.processed})`);
        break;
      }

      await processQueueStage({
        inputDir: queue.ux,
        runOne: async ({ file, name }) => {
          await runPhase({
            phase: "UX",
            scriptPath: scripts.UX,
            args: ["--auto", "--requirement", file],
            reqName: name,
            successPaths: [
              path.join(queue.deploy, name),
              path.join(queue.toClarify, name),
              path.join(queue.blocked, name),
            ],
          });
        },
        terminalCheck: (name) => terminalStateFor(name),
      });

      if (maxReq > 0 && state.processed >= maxReq) {
        writeLog(`FLOW: max req reached (${state.processed})`);
        break;
      }

      await processQueueStage({
        inputDir: queue.deploy,
        runOne: async ({ file, name }) => {
          await runPhase({
            phase: "DEPLOY",
            scriptPath: scripts.DEPLOY,
            args: ["--auto", "--requirement", file],
            reqName: name,
            successPaths: [path.join(queue.released, name)],
          });
          const p = getRequirementPaths(name);
          if (fs.existsSync(p.released)) {
            gitCommitRequirement(name);
          }
        },
        terminalCheck: (name) => {
          const p = getRequirementPaths(name);
          return fs.existsSync(p.released) ? "released" : "";
        },
      });

      const after = countActivePipeline();
      if (after === 0) {
        await runFinalPassIfNeeded();
        writeLog("FLOW: active queues empty");
        if (maxReq > 0) {
          break;
        }
        writeLog(`FLOW: waiting ${idlePollSeconds}s before next selected check`);
        await sleep(idlePollMs);
        continue;
      }

      if (after >= before) {
        writeLog("FLOW: standard no progress detected, waiting for manual intervention");
        if (maxReq > 0) {
          break;
        }
        await sleep(idlePollMs);
      }
    }
  }

  async function processQueueStage({
    inputDir,
    runOne,
    terminalCheck,
  }) {
    while (true) {
      const file = getFirstFile(inputDir);
      if (!file) {
        break;
      }
      const name = path.basename(file);
      await runOne({ file, name });

      const terminal = terminalCheck(name);
      if (terminal) {
        writeLog(`FLOW: terminal req=${name} status=${terminal}`);
        state.processed += 1;
      }

      if (maxReq > 0 && state.processed >= maxReq) {
        break;
      }
    }
  }

  async function runBulk() {
    while (true) {
      if (maxReq > 0 && state.processed >= maxReq) {
        writeLog(`FLOW: max req reached (${state.processed})`);
        break;
      }

      const before = countActivePipeline();
      if (before === 0) {
        writeLog("FLOW: active queues empty");
        if (maxReq > 0) {
          break;
        }
        writeLog(`FLOW: waiting ${idlePollSeconds}s before next selected check`);
        await sleep(idlePollMs);
        continue;
      }

      if (countFiles(queue.selected) === 0) {
        writeLog(
          "FLOW: active requirements exist outside selected; run starts from selected only. Move items back to selected or finish manually."
        );
        if (maxReq > 0) {
          break;
        }
        await sleep(idlePollMs);
        continue;
      }

      await processQueueStage({
        inputDir: queue.selected,
        runOne: async ({ file, name }) => {
          await runPhase({
            phase: "PO",
            scriptPath: scripts.PO,
            args: ["--auto", "--requirement", file],
            reqName: name,
            successPaths: [path.join(queue.arch, name), path.join(queue.toClarify, name)],
          });
        },
        terminalCheck: (name) => {
          const p = getRequirementPaths(name);
          return fs.existsSync(p.clarify) ? "to-clarify" : "";
        },
      });

      await processQueueStage({
        inputDir: queue.arch,
        runOne: async ({ file, name }) => {
          await runPhase({
            phase: "ARCH",
            scriptPath: scripts.ARCH,
            args: ["--auto", "--requirement", file],
            reqName: name,
            successPaths: [path.join(queue.dev, name), path.join(queue.toClarify, name)],
          });
        },
        terminalCheck: (name) => {
          const p = getRequirementPaths(name);
          return fs.existsSync(p.clarify) ? "to-clarify" : "";
        },
      });

      await processQueueStage({
        inputDir: queue.dev,
        runOne: async ({ file, name }) => {
          const devAgent = resolveDevAgent(file);
          if (state.detail || state.verbose) {
            const reasonSuffix = devAgent.reasons.length > 0 ? ` reason=${devAgent.reasons.join(",")}` : "";
            writeLog(
              `FLOW: dev-routing req=${name} requested=${devAgent.requestedScope} selected=${devAgent.selectedScope} source=${devAgent.source}${reasonSuffix}`
            );
          }
          await runPhase({
            phase: devAgent.phase,
            scriptPath: devAgent.scriptPath,
            args: ["--auto", "--requirement", file],
            reqName: name,
            successPaths: [
              path.join(queue.qa, name),
              path.join(queue.toClarify, name),
            ],
          });
        },
        terminalCheck: (name) => terminalStateFor(name),
      });

      await processQueueStage({
        inputDir: queue.qa,
        runOne: async ({ file, name }) => {
          await runPhase({
            phase: "QA",
            scriptPath: scripts.QA,
            args: ["--auto", "--requirement", file],
            reqName: name,
            successPaths: [
              path.join(queue.sec, name),
              path.join(queue.toClarify, name),
              path.join(queue.blocked, name),
            ],
          });
        },
        terminalCheck: (name) => terminalStateFor(name),
      });

      await processQueueStage({
        inputDir: queue.sec,
        runOne: async ({ file, name }) => {
          await runPhase({
            phase: "SEC",
            scriptPath: scripts.SEC,
            args: ["--auto", "--requirement", file],
            reqName: name,
            successPaths: [
              path.join(queue.ux, name),
              path.join(queue.toClarify, name),
              path.join(queue.blocked, name),
            ],
          });
        },
        terminalCheck: (name) => terminalStateFor(name),
      });

      await processQueueStage({
        inputDir: queue.ux,
        runOne: async ({ file, name }) => {
          await runPhase({
            phase: "UX",
            scriptPath: scripts.UX,
            args: ["--auto", "--requirement", file],
            reqName: name,
            successPaths: [
              path.join(queue.deploy, name),
              path.join(queue.toClarify, name),
              path.join(queue.blocked, name),
            ],
          });
        },
        terminalCheck: (name) => terminalStateFor(name),
      });

      await processQueueStage({
        inputDir: queue.deploy,
        runOne: async ({ file, name }) => {
          await runPhase({
            phase: "DEPLOY",
            scriptPath: scripts.DEPLOY,
            args: ["--auto", "--requirement", file],
            reqName: name,
            successPaths: [path.join(queue.released, name)],
          });
          const p = getRequirementPaths(name);
          if (fs.existsSync(p.released)) {
            gitCommitRequirement(name);
          }
        },
        terminalCheck: (name) => {
          const p = getRequirementPaths(name);
          return fs.existsSync(p.released) ? "released" : "";
        },
      });

      const after = countActivePipeline();
      if (after >= before) {
        writeLog("FLOW: bulk no progress detected, waiting for manual intervention");
        if (maxReq > 0) {
          break;
        }
        await sleep(idlePollMs);
      }
    }
  }

  function runPreflight() {
    preflightState.mode = preflightMode;
    preflightState.agentsGitTopLevel = gitTopLevel(runtime.agentsRoot);
    preflightState.targetGitTopLevel = gitTopLevel(runtime.repoRoot);
    preflightState.targetIsAgentsRepo =
      Boolean(preflightState.agentsGitTopLevel) &&
      Boolean(preflightState.targetGitTopLevel) &&
      preflightState.agentsGitTopLevel === preflightState.targetGitTopLevel;

    if (preflightState.targetIsAgentsRepo) {
      throw new Error(
        `Unsafe configuration: paths.repo_root resolves to agents repo git root (${preflightState.targetGitTopLevel}). Configure a separate project repository.`
      );
    }

    if (preflightMode === "none") {
      writeLog("FLOW: preflight=none (skipped)");
      preflightState.allowDeployCommits = true;
      preflightState.gitRepo = isGitRepo(runtime.repoRoot);
      return;
    }

    ensureDirectoryPath("repo_root", runtime.repoRoot);
    ensureDirectoryPath("docs_dir", runtime.docsDir);
    ensureDirectoryPath("requirements_root", runtime.requirementsRoot);

    const requiredScripts = [
      scripts.PO,
      scripts.ARCH,
      scripts.QA,
      scripts.SEC,
      scripts.UX,
      scripts.DEPLOY,
      scripts.DEV_FS,
    ];
    if (runtime.devAgents.useFe) {
      requiredScripts.push(scripts.DEV_FE);
    }
    if (runtime.devAgents.useBe) {
      requiredScripts.push(scripts.DEV_BE);
    }
    for (const scriptPath of requiredScripts) {
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Missing required script: ${scriptPath}`);
      }
    }

    preflightState.gitRepo = isGitRepo(runtime.repoRoot);

    if (!preflightState.gitRepo) {
      if (preflightMode === "hard" || preflightMode === "snapshot") {
        throw new Error(`Preflight ${preflightMode} requires a git repository at ${runtime.repoRoot}`);
      }
      writeLog("WARN: preflight soft - target is not a git repository; commit/push steps disabled");
      preflightState.allowDeployCommits = false;
      return;
    }

    const dirty = gitHasChanges(runtime.repoRoot);
    preflightState.startedDirty = dirty;

    if (!dirty) {
      preflightState.allowDeployCommits = true;
      writeLog(`FLOW: preflight=${preflightMode} passed (clean git state)`);
      return;
    }

    if (preflightMode === "hard") {
      throw new Error("Preflight hard failed: git worktree is dirty");
    }

    if (preflightMode === "snapshot") {
      writeLog("FLOW: preflight snapshot detected dirty worktree; creating snapshot commit");
      gitSnapshotCommit(runtime.repoRoot, runtime.preflight.snapshotCommitMessagePrefix);
      if (gitHasChanges(runtime.repoRoot)) {
        throw new Error("Preflight snapshot failed: worktree still dirty after snapshot commit");
      }
      preflightState.startedDirty = false;
      preflightState.allowDeployCommits = true;
      writeLog("FLOW: preflight snapshot commit complete; starting from clean state");
      return;
    }

    writeLog("WARN: preflight soft - git worktree is dirty at start");
    if (runtime.deploy.requireCleanStartForCommits) {
      preflightState.allowDeployCommits = false;
      writeLog("WARN: deploy commits/push disabled for this run (require_clean_start_for_commits=true)");
    } else {
      preflightState.allowDeployCommits = true;
    }
  }

  setupKeypress();

  const currentNode = parseNodeVersion(process.version);
  const requiredNode = { major: 20, minor: 9, patch: 0 };
  if (compareVersions(currentNode, requiredNode) < 0) {
    writeLog(`WARN: Node ${process.version} detected; Node >=20.9.0 is recommended.`);
  }

  writeLog(`FLOW: mode=${flow}`);
  writeLog(`FLOW: preflight=${preflightMode}`);
  writeLog(`FLOW: repo=${runtime.repoRoot}`);
  writeLog(`FLOW: requirements=${runtime.requirementsRoot}`);
  writeLog(`FLOW: docs=${runtime.docsDir}`);
  writeLog(`FLOW: run_defaults max_req=${maxReq} verbose=${state.verbose} detail=${state.detail}`);
  writeLog(`FLOW: dev_routing mode=${runtime.devRouting.mode} default_scope=${runtime.devRouting.defaultScope}`);
  writeLog(
    `FLOW: dev_agents fe=${runtime.devAgents.useFe} be=${runtime.devAgents.useBe} fs=${runtime.devAgents.useFs}`
  );
  writeLog(
    `FLOW: deploy_mode=${runtime.deploy.mode} final_push_on_success=${runtime.deploy.finalPushOnSuccess} require_clean_start_for_commits=${runtime.deploy.requireCleanStartForCommits}`
  );

  try {
    runPreflight();

    if (flow === "bulk") {
      await runBulk();
    } else if (flow === "standard") {
      await runStandard();
    } else {
      await runDetailedOrFast();
    }

    await runFinalPassIfNeeded();

    const remaining = countActivePipeline();
    writeLog(`FLOW: complete processed=${state.processed} active_left=${remaining}`);
    writeLog(`FLOW: log file ${logPath}`);
  } catch (err) {
    writeLog("FLOW: error");
    writeLog(err && err.message ? err.message : String(err));
    writeLog(`FLOW: log file ${logPath}`);
    process.exitCode = 1;
  } finally {
    logStream.end();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  }
}

main();
