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
    manualDownstream: undefined,
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

    if (arg === "--manual-downstream") {
      args.manualDownstream = true;
      continue;
    }
    if (arg === "--no-manual-downstream") {
      args.manualDownstream = false;
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
function listQueueFiles(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
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
    "Usage: node run.js [--flow standard|detailed|bulk|fast] [--preflight hard|soft|none|snapshot] [--manual-downstream|--no-manual-downstream] [--max-req N] [--verbose|--no-verbose] [--detail|--no-detail]"
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

function normalizeReviewRisk(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["low", "small", "minor", "trivial"].includes(normalized)) {
    return "low";
  }
  if (["high", "critical", "major", "severe"].includes(normalized)) {
    return "high";
  }
  if (["medium", "med", "normal", "default"].includes(normalized)) {
    return "medium";
  }
  return "";
}

function normalizeReviewScopeHint(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  if (["qa_only", "qa-only", "qa", "quick", "fast"].includes(normalized)) {
    return ["QA"];
  }
  if (["qa_sec", "qa-sec", "sec", "security"].includes(normalized)) {
    return ["QA", "SEC"];
  }
  if (["qa_ux", "qa-ux", "ux", "design"].includes(normalized)) {
    return ["QA", "UX"];
  }
  if (["full", "full_review", "qa_sec_ux", "qa-sec-ux", "all"].includes(normalized)) {
    return ["QA", "SEC", "UX"];
  }
  return [];
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
  const manualDownstreamConfigured =
    typeof cli.manualDownstream === "boolean"
      ? cli.manualDownstream
      : Boolean(runtime.runDefaults.manualDownstream);
  const manualDownstreamActive = manualDownstreamConfigured && process.stdin.isTTY;

  const reviewStrategy = runtime.review && runtime.review.strategy === "classic" ? "classic" : "bundle";
  const reviewParallel =
    runtime.review && typeof runtime.review.parallel === "boolean" ? runtime.review.parallel : false;
  const reviewDefaultRisk =
    runtime.review && runtime.review.defaultRisk ? runtime.review.defaultRisk : "medium";
  const reviewMediumScopePolicy =
    runtime.review && runtime.review.mediumScopePolicy ? runtime.review.mediumScopePolicy : "single_specialist";

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
    manualDownstreamRequested: false,
    manualDownstreamPromptShown: false,
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
      if (name === "n") {
        if (!manualDownstreamActive || flow !== "standard") {
          return;
        }
        state.manualDownstreamRequested = true;
        state.manualDownstreamPromptShown = false;
        const planningLeft = countPlanningQueues();
        if (planningLeft > 0) {
          writeLog(
            `FLOW: downstream requested; waiting for PO/ARCH/DEV queues to drain (selected+arch+dev=${planningLeft})`
          );
        } else {
          writeLog("FLOW: downstream requested; starting QA/SEC/UX/DEPLOY in this cycle");
        }
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

  async function runAgentScriptDetached({ phase, scriptPath, args: agentArgs, reqName }) {
    const phaseStart = Date.now();

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
    }
  }

  function sanitizePathToken(value) {
    return String(value || "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "req";
  }

  function setRequirementStatus(filePath, nextStatus) {
    if (!filePath || !nextStatus || !fs.existsSync(filePath)) {
      return;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) {
      return;
    }

    let frontMatter = match[1];
    if (/^status\s*:/m.test(frontMatter)) {
      frontMatter = frontMatter.replace(/^status\s*:.*$/m, `status: ${nextStatus}`);
    } else {
      frontMatter = `${frontMatter}\nstatus: ${nextStatus}`;
    }

    const start = match.index || 0;
    const end = start + match[0].length;
    const updated = `---\n${frontMatter}\n---\n${raw.slice(end)}`;
    fs.writeFileSync(filePath, updated, "utf8");
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function upsertMarkdownSection(filePath, heading, lines) {
    if (!filePath || !heading || !fs.existsSync(filePath)) {
      return;
    }
    const content = fs.readFileSync(filePath, "utf8");
    const body = Array.isArray(lines) ? lines.filter(Boolean).join("\n") : String(lines || "");
    const block = `## ${heading}\n${body}`.trimEnd();
    const escapedHeading = escapeRegExp(heading);
    const sectionPattern = new RegExp(`\n## ${escapedHeading}\n[\\s\\S]*?(?=\n## [^\n]+\n|$)`, "m");

    let next = content;
    if (sectionPattern.test(next)) {
      next = next.replace(sectionPattern, `\n${block}\n`);
    } else {
      next = next.endsWith("\n") ? next : `${next}\n`;
      next = `${next}\n${block}\n`;
    }
    fs.writeFileSync(filePath, next, "utf8");
  }

  function deriveReviewPlan(reqPath) {
    const fm = parseFrontMatter(reqPath);
    const scopeCandidate =
      fm.implementation_scope || fm.dev_scope || fm.scope || fm.implementation || "";
    const scope = normalizeRequirementScope(scopeCandidate) || runtime.devRouting.defaultScope || "fullstack";

    const explicitReviewRoles = normalizeReviewScopeHint(
      fm.review_scope || fm.review_path || fm.review_mode || ""
    );

    const explicitRisk = normalizeReviewRisk(fm.review_risk || fm.risk_level || fm.risk || "");
    const fallbackRisk = normalizeReviewRisk(reviewDefaultRisk) || "medium";
    const risk = explicitRisk || fallbackRisk;

    let roles = [];
    let roleSource = "risk";

    if (explicitReviewRoles.length > 0) {
      roles = explicitReviewRoles;
      roleSource = "front_matter_scope";
    } else if (risk === "low") {
      roles = ["QA"];
    } else if (risk === "high") {
      roles = ["QA", "SEC", "UX"];
    } else if (reviewMediumScopePolicy === "full") {
      roles = ["QA", "SEC", "UX"];
    } else if (scope === "frontend") {
      roles = ["QA", "UX"];
    } else if (scope === "backend") {
      roles = ["QA", "SEC"];
    } else {
      roles = ["QA", "SEC", "UX"];
    }

    const seen = new Set();
    const deduped = [];
    for (const role of ["QA", ...roles]) {
      if (!role || seen.has(role)) {
        continue;
      }
      seen.add(role);
      deduped.push(role);
    }

    return {
      risk,
      scope,
      roles: deduped,
      riskSource: explicitRisk ? "front_matter" : "config_default",
      roleSource,
    };
  }

  function readReviewDecisionFile({ role, decisionFile, fallbackMessage }) {
    if (!decisionFile || !fs.existsSync(decisionFile)) {
      return {
        role,
        status: "clarify",
        summary: fallbackMessage || "missing decision file",
        findings: ["missing decision file"],
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(decisionFile, "utf8"));
    } catch (err) {
      return {
        role,
        status: "clarify",
        summary: `invalid decision JSON: ${err.message}`,
        findings: ["invalid decision file"],
      };
    }

    const status = String(parsed.status || "").toLowerCase();
    const normalizedStatus = ["pass", "clarify", "block"].includes(status)
      ? status
      : "clarify";
    const summary = String(parsed.summary || "").trim() || "no summary";
    const findings = Array.isArray(parsed.findings)
      ? parsed.findings.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    return {
      role,
      status: normalizedStatus,
      summary,
      findings,
    };
  }

  function aggregateReviewDecisions(decisions) {
    const hasBlock = decisions.some((decision) => decision.status === "block");
    if (hasBlock) {
      return { targetQueue: queue.blocked, status: "blocked", label: "blocked" };
    }

    const hasClarify = decisions.some((decision) => decision.status === "clarify");
    if (hasClarify) {
      return { targetQueue: queue.toClarify, status: "to-clarify", label: "to-clarify" };
    }

    return { targetQueue: queue.deploy, status: "deploy", label: "deploy" };
  }

  function mapQaDecisionToRoute(status) {
    if (status === "pass") {
      return { targetQueue: queue.sec, status: "sec", label: "sec" };
    }
    if (status === "block") {
      return { targetQueue: queue.blocked, status: "blocked", label: "blocked" };
    }
    return { targetQueue: queue.toClarify, status: "to-clarify", label: "to-clarify" };
  }

  function isTerminalStatus(status) {
    return status === "to-clarify" || status === "blocked" || status === "released";
  }

  function bypassQueueToDeploy({ phase, inputDir }) {
    const files = listQueueFiles(inputDir);
    if (files.length === 0) {
      return [];
    }

    const fromLabel = path.basename(inputDir);
    const outcomes = [];

    for (const file of files) {
      const name = path.basename(file);
      const paths = getRequirementPaths(name);
      const terminal = hasTerminalState(paths);
      if (terminal) {
        outcomes.push({ name, status: terminal });
        continue;
      }

      if (!fs.existsSync(file)) {
        continue;
      }

      setRequirementStatus(file, "deploy");
      if (fs.existsSync(paths.deploy)) {
        fs.unlinkSync(paths.deploy);
      }
      moveRequirementFile(file, paths.deploy);
      writeLog(`FLOW: ${phase} bypass req=${name} from=${fromLabel} to=deploy`);
      outcomes.push({ name, status: "deploy" });
    }

    return outcomes;
  }

  async function runQaRequirementReviewStage() {
    const qaFiles = listQueueFiles(queue.qa);
    if (qaFiles.length === 0) {
      return [];
    }

    const workspace = path.join(
      runtime.agentsRoot,
      ".runtime",
      "qa-review",
      `${formatTimestamp(new Date())}-batch`
    );
    ensureDir(workspace);

    const outcomes = [];
    for (const file of qaFiles) {
      const name = path.basename(file);
      const decisionFile = path.join(workspace, `${sanitizePathToken(name)}.decision.json`);
      writeJson(decisionFile, {
        status: "clarify",
        summary: "QA review decision file missing",
        findings: ["missing QA review decision"],
      });

      await runPhase({
        phase: "QA-REVIEW",
        scriptPath: scripts.QA,
        args: [
          "--auto",
          "--review-only",
          "--quick-review",
          "--requirement",
          file,
          "--decision-file",
          decisionFile,
        ],
        reqName: name,
        successPaths: [decisionFile],
      });

      const decision = readReviewDecisionFile({
        role: "QA",
        decisionFile,
        fallbackMessage: "missing QA review decision output",
      });
      const route = mapQaDecisionToRoute(decision.status);
      const reqPath = path.join(queue.qa, name);
      if (!fs.existsSync(reqPath)) {
        const terminal = terminalStateFor(name);
        if (terminal) {
          outcomes.push({ name, status: terminal });
        }
        continue;
      }

      const findings = decision.findings.length > 0 ? decision.findings : ["none"];
      const sectionLines = [
        `- Mode: quick per-requirement code review`,
        `- Decision: ${decision.status}`,
        `- Summary: ${decision.summary}`,
        `- Findings: ${findings.join(" | ")}`,
      ];
      upsertMarkdownSection(reqPath, "QA Review Results", sectionLines);
      setRequirementStatus(reqPath, route.status);

      const targetPath = path.join(route.targetQueue, name);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      moveRequirementFile(reqPath, targetPath);
      writeLog(`FLOW: qa-review req=${name} decision=${decision.status} target=${route.label}`);

      outcomes.push({ name, status: route.status });
    }

    return outcomes;
  }

  async function runQaBatchTestsStage() {
    const secFiles = listQueueFiles(queue.sec);
    if (secFiles.length === 0) {
      return [];
    }

    const names = secFiles.map((file) => path.basename(file));
    const workspace = path.join(
      runtime.agentsRoot,
      ".runtime",
      "qa-batch-tests",
      `${formatTimestamp(new Date())}-batch`
    );
    ensureDir(workspace);
    const gateFile = path.join(workspace, "qa-batch-gate.json");
    writeJson(gateFile, {
      status: "fail",
      summary: "Batch QA gate output missing",
      blocking_findings: ["missing batch QA gate output"],
    });

    const batchReqName = names.length === 1 ? names[0] : `BATCH:${names.length}`;
    await runPhase({
      phase: "QA-TEST-BATCH",
      scriptPath: scripts.QA,
      args: [
        "--auto",
        "--batch-tests",
        "--requirement",
        secFiles[0],
        "--gate-file",
        gateFile,
      ],
      reqName: batchReqName,
      successPaths: [gateFile],
    });

    let gate;
    try {
      gate = readGateFile(gateFile, "QA-BATCH");
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      gate = {
        status: "fail",
        summary: "invalid QA batch gate: " + msg,
        blockingFindings: ["invalid QA batch gate output"],
      };
    }

    writeLog(`FLOW: qa-batch-tests status=${gate.status} summary=${gate.summary}`);
    if (gate.status === "pass") {
      return [];
    }

    const findings =
      gate.blockingFindings.length > 0 ? gate.blockingFindings : ["batch FE/BE tests failed"];
    const outcomes = [];
    for (const name of names) {
      const secPath = path.join(queue.sec, name);
      if (!fs.existsSync(secPath)) {
        continue;
      }

      const sectionLines = [
        "- Status: fail",
        `- Summary: ${gate.summary}`,
        `- Blocking findings: ${findings.join(" | ")}`,
      ];
      upsertMarkdownSection(secPath, "QA Batch Test Results", sectionLines);
      setRequirementStatus(secPath, "blocked");

      const targetPath = path.join(queue.blocked, name);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      moveRequirementFile(secPath, targetPath);
      writeLog(`FLOW: qa-batch-tests req=${name} target=blocked`);
      outcomes.push({ name, status: "blocked" });
    }

    return outcomes;
  }

  async function runUxBatchStage() {
    const uxFiles = listQueueFiles(queue.ux);
    if (uxFiles.length === 0) {
      return [];
    }

    const names = uxFiles.map((file) => path.basename(file));
    const anchorRequirement = uxFiles[0];
    const batchReqName = names.length === 1 ? names[0] : `BATCH:${names.length}`;

    await runPhase({
      phase: "UX-BATCH",
      scriptPath: scripts.UX,
      args: ["--auto", "--batch", "--requirement", anchorRequirement],
      reqName: batchReqName,
      successPaths: [
        ...names.map((name) => path.join(queue.deploy, name)),
        ...names.map((name) => path.join(queue.toClarify, name)),
        ...names.map((name) => path.join(queue.blocked, name)),
      ],
    });

    const outcomes = [];
    for (const name of names) {
      const paths = getRequirementPaths(name);
      const terminal = hasTerminalState(paths);
      if (terminal) {
        outcomes.push({ name, status: terminal });
        continue;
      }

      if (fs.existsSync(paths.ux)) {
        setRequirementStatus(paths.ux, "deploy");
        if (fs.existsSync(paths.deploy)) {
          fs.unlinkSync(paths.deploy);
        }
        moveRequirementFile(paths.ux, paths.deploy);
        writeLog(`FLOW: ux-batch auto-forward req=${name} target=deploy`);
      }

      if (fs.existsSync(paths.deploy)) {
        outcomes.push({ name, status: "deploy" });
        continue;
      }

      throw new Error(`ux batch produced no output state for ${name}`);
    }

    return outcomes;
  }

  async function runReviewBundleForRequirement({ file, name }) {

    const plan = deriveReviewPlan(file);
    const keepWorkspace = process.env.CODEX_KEEP_REVIEW_BUNDLE === "1";
    const workspace = path.join(
      runtime.agentsRoot,
      ".runtime",
      "review-bundle",
      `${formatTimestamp(new Date())}-${sanitizePathToken(name)}`
    );
    ensureDir(workspace);

    if (state.detail || state.verbose) {
      writeLog(
        `FLOW: review-plan req=${name} risk=${plan.risk} scope=${plan.scope} roles=${plan.roles.join(",")} risk_source=${plan.riskSource} role_source=${plan.roleSource} parallel=${reviewParallel}`
      );
    }

    const roleScripts = {
      QA: { phase: "QA-BUNDLE", scriptPath: scripts.QA },
      SEC: { phase: "SEC-BUNDLE", scriptPath: scripts.SEC },
      UX: { phase: "UX-BUNDLE", scriptPath: scripts.UX },
    };

    const tasks = plan.roles.map((role) => {
      const token = String(role || "").toLowerCase();
      return {
        role,
        script: roleScripts[role],
        reqCopy: path.join(workspace, `${token}-${name}`),
        decisionFile: path.join(workspace, `${token}.decision.json`),
      };
    });

    for (const task of tasks) {
      fs.copyFileSync(file, task.reqCopy);
    }

    const runTask = async (task) => {
      if (!task.script || !task.script.scriptPath) {
        return {
          role: task.role,
          ok: false,
          error: `missing script mapping for role ${task.role}`,
          decisionFile: task.decisionFile,
        };
      }
      try {
        await runAgentScriptDetached({
          phase: task.script.phase,
          scriptPath: task.script.scriptPath,
          args: [
            "--auto",
            "--review-only",
            "--requirement",
            task.reqCopy,
            "--decision-file",
            task.decisionFile,
          ],
          reqName: name,
        });
        return { role: task.role, ok: true, error: "", decisionFile: task.decisionFile };
      } catch (err) {
        return {
          role: task.role,
          ok: false,
          error: err && err.message ? err.message : String(err),
          decisionFile: task.decisionFile,
        };
      }
    };

    let runResults = [];
    try {
      if (reviewParallel && tasks.length > 1) {
        runResults = await Promise.all(tasks.map((task) => runTask(task)));
      } else {
        for (const task of tasks) {
          runResults.push(await runTask(task));
        }
      }

      const decisions = runResults.map((result) => {
        const fallbackMessage = result.ok
          ? "missing decision output"
          : `review agent failed: ${result.error}`;
        const decision = readReviewDecisionFile({
          role: result.role,
          decisionFile: result.decisionFile,
          fallbackMessage,
        });
        if (!result.ok && decision.status === "pass") {
          return {
            ...decision,
            status: "clarify",
            summary: `agent error: ${result.error}`,
            findings: ["agent execution error"],
          };
        }
        return decision;
      });

      const aggregate = aggregateReviewDecisions(decisions);
      const sectionLines = [
        `- Risk: ${plan.risk}`,
        `- Scope: ${plan.scope}`,
        `- Roles: ${plan.roles.join(", ")}`,
        ...decisions.map((decision) => `- ${decision.role}: ${decision.status} - ${decision.summary}`),
        `- Aggregated outcome: ${aggregate.label}`,
      ];
      upsertMarkdownSection(file, "Review Bundle Results", sectionLines);
      setRequirementStatus(file, aggregate.status);

      const targetPath = path.join(aggregate.targetQueue, name);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      moveRequirementFile(file, targetPath);
      writeLog(
        `FLOW: review-bundle req=${name} outcome=${aggregate.label} target=${path.basename(aggregate.targetQueue)}`
      );
    } finally {
      if (!keepWorkspace) {
        fs.rmSync(workspace, { recursive: true, force: true });
      }
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

  function gitCommitRequirementBatch(reqNames) {
    const names = Array.isArray(reqNames)
      ? reqNames.map((name) => String(name || "").trim()).filter(Boolean)
      : [];

    if (names.length === 0) {
      return;
    }

    if (!preflightState.allowDeployCommits) {
      writeLog(`FLOW: deploy commit skipped by preflight policy batch_count=${names.length}`);
      return;
    }

    if (runtime.deploy.mode === "check") {
      writeLog(`FLOW: deploy mode=check; skip batch commit count=${names.length}`);
      return;
    }

    assertGitWriteTarget(`deploy batch commit count=${names.length}`);

    if (!preflightState.gitRepo || !isGitRepo(runtime.repoRoot)) {
      writeLog(`FLOW: deploy skip git action, not a git repo: ${runtime.repoRoot}`);
      return;
    }

    if (!gitHasChanges(runtime.repoRoot)) {
      writeLog(`FLOW: deploy no git changes for batch count=${names.length}`);
      return;
    }

    const addRes = runGit(runtime.repoRoot, ["add", "-A"]);
    if (addRes.status !== 0) {
      throw new Error(`git add failed for deploy batch: ${(addRes.stderr || "").trim()}`);
    }

    const preview = names.slice(0, 3).join(",");
    const suffix = names.length > 3 ? `,+${names.length - 3}` : "";
    const msg = names.length === 1
      ? `chore(deploy): ${names[0]}`
      : `chore(deploy): batch ${names.length} requirements (${preview}${suffix})`;
    const commitRes = runGit(runtime.repoRoot, ["commit", "-m", msg]);
    if (commitRes.status !== 0) {
      const output = `${commitRes.stdout || ""}\n${commitRes.stderr || ""}`;
      if (/nothing to commit/i.test(output)) {
        writeLog(`FLOW: deploy nothing to commit for batch count=${names.length}`);
      } else {
        throw new Error(`git commit failed for deploy batch: ${output.trim()}`);
      }
    } else {
      writeLog(`FLOW: deploy committed batch count=${names.length}`);
    }

    if (runtime.deploy.mode === "commit_push") {
      assertGitWriteTarget(`deploy batch push count=${names.length}`);
      const pushRes = runGit(runtime.repoRoot, ["push"]);
      if (pushRes.status !== 0) {
        throw new Error(`git push failed for deploy batch: ${(pushRes.stderr || "").trim()}`);
      }
      writeLog(`FLOW: deploy pushed batch count=${names.length}`);
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

  function cleanupStaleRequirementCopies(name, terminal) {
    const paths = getRequirementPaths(name);
    const keep = new Set();

    if (terminal === "to-clarify") {
      keep.add(paths.clarify);
    } else if (terminal === "blocked") {
      keep.add(paths.blocked);
    } else if (terminal === "released") {
      keep.add(paths.released);
    }

    const candidates = [
      paths.selected,
      paths.arch,
      paths.dev,
      paths.qa,
      paths.sec,
      paths.ux,
      paths.deploy,
      paths.clarify,
      paths.blocked,
      paths.released,
    ];

    let removed = 0;
    for (const target of candidates) {
      if (!target || keep.has(target)) {
        continue;
      }
      if (!fs.existsSync(target)) {
        continue;
      }
      fs.unlinkSync(target);
      removed += 1;
    }

    if (removed > 0) {
      writeLog(`FLOW: cleanup req=${name} terminal=${terminal} removed=${removed}`);
    }
  }

  function recordTerminal(name, terminal) {
    cleanupStaleRequirementCopies(name, terminal);
    writeLog(`FLOW: terminal req=${name} status=${terminal}`);
    state.processed += 1;
  }

  async function processRequirement({ name, fastBypass, stopAfterDev }) {
    const paths = getRequirementPaths(name);
    const planningOnly = Boolean(stopAfterDev);

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

    if (planningOnly) {
      if (
        fs.existsSync(paths.qa) ||
        fs.existsSync(paths.sec) ||
        fs.existsSync(paths.ux) ||
        fs.existsSync(paths.deploy)
      ) {
        return "pending";
      }
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
    const fastBypass = flow === "fast";
    const stageOrder = fastBypass
      ? ["selected", "arch", "dev", "qa"]
      : ["selected", "arch", "dev", "qa", "sec", "ux"];

    while (true) {
      if (maxReq > 0 && state.processed >= maxReq) {
        writeLog(`FLOW: max req reached (${state.processed})`);
        break;
      }

      if (fastBypass) {
        const fastBypassOutcomes = [
          ...bypassQueueToDeploy({ phase: "SEC", inputDir: queue.sec }),
          ...bypassQueueToDeploy({ phase: "UX", inputDir: queue.ux }),
        ];
        for (const outcome of fastBypassOutcomes) {
          if (isTerminalStatus(outcome.status)) {
            recordTerminal(outcome.name, outcome.status);
          }
        }
        if (maxReq > 0 && state.processed >= maxReq) {
          writeLog(`FLOW: max req reached (${state.processed})`);
          break;
        }
      }

      const target = getNextTarget(stageOrder);
      if (!target) {
        if (countFiles(queue.deploy) > 0) {
          const deployOutcomes = await runDeployBatchStage();
          for (const outcome of deployOutcomes) {
            if (outcome.status === "released") {
              releasedSinceFinal.add(outcome.name);
            }
            recordTerminal(outcome.name, outcome.status);
          }
          continue;
        }

        const active = countActivePipeline();
        if (active > 0) {
          writeLog("FLOW: runnable queue detection mismatch; waiting for manual intervention.");
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

      if (target.stage === "qa") {
        const qaReviewOutcomes = await runQaRequirementReviewStage();
        for (const outcome of qaReviewOutcomes) {
          if (isTerminalStatus(outcome.status)) {
            recordTerminal(outcome.name, outcome.status);
          }
        }

        if (maxReq > 0 && state.processed >= maxReq) {
          writeLog(`FLOW: max req reached (${state.processed})`);
          break;
        }

        const qaBatchOutcomes = await runQaBatchTestsStage();
        for (const outcome of qaBatchOutcomes) {
          if (isTerminalStatus(outcome.status)) {
            recordTerminal(outcome.name, outcome.status);
          }
        }

        if (fastBypass) {
          const postQaBypassOutcomes = [
            ...bypassQueueToDeploy({ phase: "SEC", inputDir: queue.sec }),
            ...bypassQueueToDeploy({ phase: "UX", inputDir: queue.ux }),
          ];
          for (const outcome of postQaBypassOutcomes) {
            if (isTerminalStatus(outcome.status)) {
              recordTerminal(outcome.name, outcome.status);
            }
          }
        }

        continue;
      }

      if (target.stage === "sec") {
        await processQueueStage({
          inputDir: queue.sec,
          runOne: async ({ file, name: secName }) => {
            await runPhase({
              phase: "SEC",
              scriptPath: scripts.SEC,
              args: ["--auto", "--requirement", file],
              reqName: secName,
              successPaths: [
                path.join(queue.ux, secName),
                path.join(queue.toClarify, secName),
                path.join(queue.blocked, secName),
              ],
            });
          },
          terminalCheck: (secName) => terminalStateFor(secName),
        });
        continue;
      }

      if (target.stage === "ux") {
        const uxBatchOutcomes = await runUxBatchStage();
        for (const outcome of uxBatchOutcomes) {
          if (isTerminalStatus(outcome.status)) {
            recordTerminal(outcome.name, outcome.status);
          }
        }
        continue;
      }

      const result = await processRequirement({ name, fastBypass, stopAfterDev: true });
      if (["released", "to-clarify", "blocked", "none"].includes(result)) {
        if (result === "none") {
          writeLog(`FLOW: terminal req=${name} status=${result}`);
          state.processed += 1;
        } else {
          recordTerminal(name, result);
        }
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

      // Phase 1: continue PO -> ARCH -> DEV work until planning queues are empty.
      // This also resumes partially processed requirements left in arch/dev.
      let upstreamMadeProgress = false;
      while (true) {
        if (maxReq > 0 && state.processed >= maxReq) {
          break;
        }

        const selectedFile = getFirstFile(queue.selected);
        const archFile = getFirstFile(queue.arch);
        const devFile = getFirstFile(queue.dev);

        if (!selectedFile && !archFile && !devFile) {
          break;
        }

        upstreamMadeProgress = true;
        let name = "";

        if (selectedFile) {
          name = path.basename(selectedFile);
          await runPhase({
            phase: "PO",
            scriptPath: scripts.PO,
            args: ["--auto", "--requirement", selectedFile],
            reqName: name,
            successPaths: [path.join(queue.arch, name), path.join(queue.toClarify, name)],
          });
        } else if (archFile) {
          name = path.basename(archFile);
          if (state.detail || state.verbose) {
            writeLog(`FLOW: standard resume req=${name} from ARCH queue`);
          }
        } else {
          name = path.basename(devFile);
          if (state.detail || state.verbose) {
            writeLog(`FLOW: standard resume req=${name} from DEV queue`);
          }
        }

        let terminal = terminalStateFor(name);
        if (terminal) {
          recordTerminal(name, terminal);
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
          recordTerminal(name, terminal);
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
          recordTerminal(name, terminal);
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
        state.manualDownstreamPromptShown = false;
        if (!upstreamMadeProgress) {
          writeLog("FLOW: standard no progress in PO/ARCH/DEV phase, waiting for manual intervention");
        }
        if (maxReq > 0) {
          break;
        }
        await sleep(idlePollMs);
        continue;
      }

      if (manualDownstreamActive) {
        if (!state.manualDownstreamRequested) {
          if (!state.manualDownstreamPromptShown) {
            writeLog(
              "FLOW: standard downstream paused; press 'n' to run QA/SEC/UX/DEPLOY once selected+arch+dev are empty"
            );
            state.manualDownstreamPromptShown = true;
          }
          await sleep(idlePollMs);
          continue;
        }
        state.manualDownstreamRequested = false;
        state.manualDownstreamPromptShown = false;
        writeLog("FLOW: standard downstream trigger accepted; running QA/SEC/UX/DEPLOY");
      }

      // Phase 2: one global QA review + QA batch tests + SEC + UX batch + DEPLOY batch pass.
      const qaReviewOutcomes = await runQaRequirementReviewStage();
      for (const outcome of qaReviewOutcomes) {
        if (isTerminalStatus(outcome.status)) {
          recordTerminal(outcome.name, outcome.status);
        }
      }

      if (maxReq > 0 && state.processed >= maxReq) {
        writeLog(`FLOW: max req reached (${state.processed})`);
        break;
      }

      const qaBatchOutcomes = await runQaBatchTestsStage();
      for (const outcome of qaBatchOutcomes) {
        if (isTerminalStatus(outcome.status)) {
          recordTerminal(outcome.name, outcome.status);
        }
      }

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

      const uxBatchOutcomes = await runUxBatchStage();
      for (const outcome of uxBatchOutcomes) {
        if (isTerminalStatus(outcome.status)) {
          recordTerminal(outcome.name, outcome.status);
        }
      }

      if (maxReq > 0 && state.processed >= maxReq) {
        writeLog(`FLOW: max req reached (${state.processed})`);
        break;
      }

      const standardDeployOutcomes = await runDeployBatchStage();
      for (const outcome of standardDeployOutcomes) {
        if (outcome.status === "released") {
          releasedSinceFinal.add(outcome.name);
        }
        recordTerminal(outcome.name, outcome.status);
      }

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
        recordTerminal(name, terminal);
      }

      if (maxReq > 0 && state.processed >= maxReq) {
        break;
      }
    }
  }

  async function runDeployBatchStage() {
    const deployFiles = listQueueFiles(queue.deploy);
    if (deployFiles.length === 0) {
      return [];
    }

    const names = deployFiles.map((file) => path.basename(file));
    const anchorRequirement = deployFiles[0];
    const batchReqName = names.length === 1 ? names[0] : ("BATCH:" + names.length);

    await runPhase({
      phase: "DEPLOY-BATCH",
      scriptPath: scripts.DEPLOY,
      args: ["--auto", "--batch", "--requirement", anchorRequirement],
      reqName: batchReqName,
      successPaths: names.map((name) => path.join(queue.released, name)),
    });

    const outcomes = [];
    const releasedNames = [];

    for (const name of names) {
      const paths = getRequirementPaths(name);
      let terminal = hasTerminalState(paths);

      if (!terminal && fs.existsSync(paths.deploy)) {
        setRequirementStatus(paths.deploy, "released");
        if (fs.existsSync(paths.released)) {
          fs.unlinkSync(paths.released);
        }
        moveRequirementFile(paths.deploy, paths.released);
        terminal = "released";
        writeLog("FLOW: deploy-batch auto-release req=" + name);
      }

      if (!terminal) {
        throw new Error("deploy batch produced no terminal state for " + name);
      }

      if (terminal === "released") {
        releasedNames.push(name);
      }
      outcomes.push({ name, status: terminal });
    }

    if (releasedNames.length > 0) {
      gitCommitRequirementBatch(releasedNames);
    }

    return outcomes;
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

      const bulkQaReviewOutcomes = await runQaRequirementReviewStage();
      for (const outcome of bulkQaReviewOutcomes) {
        if (isTerminalStatus(outcome.status)) {
          recordTerminal(outcome.name, outcome.status);
        }
      }

      if (maxReq > 0 && state.processed >= maxReq) {
        writeLog(`FLOW: max req reached (${state.processed})`);
        break;
      }

      const bulkQaBatchOutcomes = await runQaBatchTestsStage();
      for (const outcome of bulkQaBatchOutcomes) {
        if (isTerminalStatus(outcome.status)) {
          recordTerminal(outcome.name, outcome.status);
        }
      }

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

      const bulkUxBatchOutcomes = await runUxBatchStage();
      for (const outcome of bulkUxBatchOutcomes) {
        if (isTerminalStatus(outcome.status)) {
          recordTerminal(outcome.name, outcome.status);
        }
      }

      if (maxReq > 0 && state.processed >= maxReq) {
        writeLog(`FLOW: max req reached (${state.processed})`);
        break;
      }

      const bulkDeployOutcomes = await runDeployBatchStage();
      for (const outcome of bulkDeployOutcomes) {
        if (outcome.status === "released") {
          releasedSinceFinal.add(outcome.name);
        }
        recordTerminal(outcome.name, outcome.status);
      }

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
  writeLog(
    `FLOW: run_defaults max_req=${maxReq} verbose=${state.verbose} detail=${state.detail} manual_downstream=${manualDownstreamConfigured}`
  );
  if (flow === "standard" && manualDownstreamConfigured && !process.stdin.isTTY) {
    writeLog("WARN: manual_downstream=true but no TTY detected; continuing without manual downstream gate");
  }
  if (flow === "standard" && manualDownstreamActive) {
    writeLog("FLOW: manual downstream gate enabled; press 'n' to run QA/SEC/UX/DEPLOY");
  }
  writeLog(`FLOW: dev_routing mode=${runtime.devRouting.mode} default_scope=${runtime.devRouting.defaultScope}`);
  writeLog(
    `FLOW: dev_agents fe=${runtime.devAgents.useFe} be=${runtime.devAgents.useBe} fs=${runtime.devAgents.useFs}`
  );
  writeLog(
    `FLOW: deploy_mode=${runtime.deploy.mode} final_push_on_success=${runtime.deploy.finalPushOnSuccess} require_clean_start_for_commits=${runtime.deploy.requireCleanStartForCommits}`
  );
  writeLog(
    `FLOW: review strategy=${reviewStrategy} parallel=${reviewParallel} default_risk=${reviewDefaultRisk} medium_scope_policy=${reviewMediumScopePolicy} (legacy bundle settings)`
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
