#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const { spawn } = require("child_process");

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

function getThreadFilePath({ agentsRoot, agentRoot, auto }) {
  const role = path.basename(agentRoot);
  const threadsDir = path.join(agentsRoot, ".runtime", "threads", role);
  ensureDir(threadsDir);
  return path.join(threadsDir, auto ? "thread.auto.txt" : "thread.txt");
}

function readFirstLine(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(4096);
    let data = "";
    while (true) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead <= 0) {
        break;
      }
      data += buffer.slice(0, bytesRead).toString("utf8");
      const idx = data.indexOf("\n");
      if (idx !== -1) {
        data = data.slice(0, idx);
        break;
      }
      if (data.length > 1024 * 1024) {
        break;
      }
    }
    return data.replace(/\r$/, "");
  } finally {
    fs.closeSync(fd);
  }
}

function walkJsonlFiles(dir, files) {
  if (!fs.existsSync(dir)) {
    return;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonlFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }
}

function getLatestSessionId({ since, cwd }) {
  const sessionRoot = path.join(os.homedir(), ".codex", "sessions");
  if (!fs.existsSync(sessionRoot)) {
    return null;
  }
  const files = [];
  walkJsonlFiles(sessionRoot, files);
  const threshold = since.getTime() - 10 * 60 * 1000;
  const filtered = files.map((filePath) => {
    try {
      const stat = fs.statSync(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    } catch {
      return null;
    }
  }).filter((entry) => entry && entry.mtimeMs >= threshold);

  filtered.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const target = cwd ? cwd.toLowerCase() : "";
  for (const entry of filtered) {
    const line = readFirstLine(entry.filePath);
    if (!line) {
      continue;
    }
    let meta;
    try {
      meta = JSON.parse(line);
    } catch {
      continue;
    }
    if (meta.type !== "session_meta") {
      continue;
    }
    const metaCwd = meta.payload && meta.payload.cwd ? String(meta.payload.cwd) : "";
    if (!metaCwd) {
      continue;
    }
    if (metaCwd.toLowerCase() === target) {
      return meta.payload.id || null;
    }
  }

  return null;
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

async function runCodexExecFiltered({ prompt, repoRoot, configArgs, threadId, verboseRef }) {
  const args = ["exec"];
  if (threadId) {
    args.push("resume", threadId);
  }
  if (configArgs && configArgs.length) {
    args.push(...configArgs);
  }
  args.push("-");

  const proc = spawn("codex", args, {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });

  proc.stdin.write(prompt);
  proc.stdin.end();

  const handleLine = (line) => {
    if (shouldPrintLine(line, verboseRef.value)) {
      process.stdout.write(line + "\n");
    }
  };

  const rlOut = readline.createInterface({ input: proc.stdout });
  const rlErr = readline.createInterface({ input: proc.stderr });
  rlOut.on("line", handleLine);
  rlErr.on("line", handleLine);

  const exitCode = await new Promise((resolve) => {
    proc.on("close", resolve);
  });

  rlOut.close();
  rlErr.close();

  return exitCode;
}

async function runCodexExec({ prompt, repoRoot, configArgs, threadId }) {
  const args = ["exec"];
  if (threadId) {
    args.push("resume", threadId);
  }
  if (configArgs && configArgs.length) {
    args.push(...configArgs);
  }
  args.push("-");

  const proc = spawn("codex", args, {
    cwd: repoRoot,
    stdio: ["pipe", "inherit", "inherit"],
  });

  proc.stdin.write(prompt);
  proc.stdin.end();

  return new Promise((resolve) => {
    proc.on("close", resolve);
  });
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
  getLatestSessionId,
  shouldPrintLine,
  runCodexExecFiltered,
  runCodexExec,
  readInputWithHotkeys,
};
