#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  if (!dir) {
    return;
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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

function looksLikeInlineRequirementText(value) {
  const text = String(value || "");
  return text.startsWith("---") && text.includes("\n") && /(^|\n)id\s*:/i.test(text);
}

function parseFrontMatterFromRaw(raw) {
  const text = String(raw || "");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return {};
  }

  const map = {};
  for (const line of match[1].split(/\r?\n/)) {
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function getFirstFile(dir) {
  const files = listQueueFiles(dir);
  return files.length > 0 ? files[0] : "";
}

function countFiles(dir) {
  return listQueueFiles(dir).length;
}

function moveRequirementFile(sourcePath, targetPath) {
  if (!sourcePath || !targetPath) {
    return false;
  }
  if (!fs.existsSync(sourcePath)) {
    return false;
  }
  if (sourcePath === targetPath) {
    return true;
  }

  ensureDir(path.dirname(targetPath));

  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }

  try {
    fs.renameSync(sourcePath, targetPath);
    return true;
  } catch (error) {
    if (error && error.code === "EXDEV") {
      fs.copyFileSync(sourcePath, targetPath);
      fs.unlinkSync(sourcePath);
      return true;
    }
    throw error;
  }
}

function parseFrontMatter(filePath) {
  if (!filePath) {
    return {};
  }
  const candidate = String(filePath);
  if (looksLikeInlineRequirementText(candidate)) {
    return parseFrontMatterFromRaw(candidate);
  }
  if (!fs.existsSync(candidate)) {
    return {};
  }
  const raw = fs.readFileSync(candidate, "utf8");
  return parseFrontMatterFromRaw(raw);
}

function parseBusinessScore(filePath) {
  const frontMatter = parseFrontMatter(filePath);
  const raw = frontMatter.business_score || frontMatter.priority_score || frontMatter.score || "";
  const parsed = Number.parseFloat(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortByBusinessScore(files) {
  return [...(files || [])].sort((a, b) => {
    const scoreDelta = parseBusinessScore(b) - parseBusinessScore(a);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return path.basename(a).localeCompare(path.basename(b));
  });
}

function setFrontMatterStatus(filePath, nextStatus) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  let raw = fs.readFileSync(filePath, "utf8");
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

  raw = raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, `---\n${frontMatter}\n---`);
  fs.writeFileSync(filePath, raw, "utf8");
}

function upsertMarkdownSection(filePath, heading, lines) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const body = Array.isArray(lines)
    ? lines.filter(Boolean).map((line) => String(line)).join("\n")
    : String(lines || "");
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\n## ${escaped}\\n[\\s\\S]*?(?=\\n## [^\\n]+\\n|$)`);
  const replacement = `\n## ${heading}\n${body}\n`;
  if (pattern.test(raw)) {
    fs.writeFileSync(filePath, raw.replace(pattern, replacement), "utf8");
  } else {
    fs.writeFileSync(
      filePath,
      raw.endsWith("\n") ? `${raw}\n${replacement}` : `${raw}\n\n${replacement}`,
      "utf8"
    );
  }
}

function appendQueueSection(filePath, lines) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }
  const normalized = Array.isArray(lines) ? lines : [String(lines || "")];
  upsertMarkdownSection(filePath, "Flow Routing Notes", normalized);
}

function isRetryable(stderrText) {
  if (!stderrText) {
    return false;
  }
  return /(network error|reconnecting|stream disconnected|econnreset|etimedout|econnrefused|eai_again|temporar|429|rate limit|timeout)/i.test(
    String(stderrText)
  );
}

async function runNodeScript({ scriptPath, args, cwd, env, maxRetries, retryDelaySeconds }) {
  const retries = Math.max(0, Number.parseInt(String(maxRetries || 0), 10));
  const attempts = retries + 1;
  let lastError = "";

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const delay = Math.max(0, Number.parseInt(String(retryDelaySeconds || 0), 10)) * Math.pow(2, attempt - 1);
      if (delay > 0) {
        await sleep(delay * 1000);
      }
    }

    const proc = spawn(process.execPath, [scriptPath, ...(Array.isArray(args) ? args : [])], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "inherit", "pipe"],
    });

    let stderrText = "";
    proc.stderr.on("data", (chunk) => {
      stderrText += String(chunk);
      if (stderrText.length > 120000) {
        stderrText = stderrText.slice(-120000);
      }
    });

    const exitCode = await new Promise((resolve) => proc.once("close", resolve));
    if (exitCode === 0) {
      return { ok: true, stderr: stderrText, exitCode: 0 };
    }

    lastError = stderrText || `exit_code_${exitCode}`;
    if (attempt + 1 < attempts && isRetryable(lastError)) {
      continue;
    }
    return { ok: false, stderr: lastError, exitCode: exitCode || 1 };
  }

  return { ok: false, stderr: lastError || "script failed", exitCode: 1 };
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["pass", "ok", "done", "success", "released", "deploy"].includes(status)) {
    return "pass";
  }
  if (["block", "blocked", "fail", "failed", "security-block"].includes(status)) {
    return "block";
  }
  if ([
    "clarify",
    "to-clarify",
    "human-decision-needed",
    "human decision needed",
    "question",
    "rework",
    "todo",
    "to-do",
    "to_do",
    "improve",
  ].includes(status)) {
    return "clarify";
  }
  return "unknown";
}

function parseDecisionFile(filePath, fallbackLabel = "agent") {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      status: "",
      summary: `Decision file not found for ${fallbackLabel}`,
      findings: [],
      new_requirements: [],
      targetQueue: "",
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const findings = Array.isArray(raw.findings)
      ? raw.findings.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    return {
      status: normalizeStatus(raw.status),
      summary: String(raw.summary || "").trim() || `Decision from ${fallbackLabel}`,
      findings,
      new_requirements: Array.isArray(raw.new_requirements) ? raw.new_requirements : [],
      targetQueue: String(
        raw.target_queue || raw.targetQueue || raw.target || raw.next_queue || raw.nextQueue || ""
      ).trim(),
    };
  } catch (error) {
    return {
      status: "",
      summary: `Invalid decision file for ${fallbackLabel}: ${error.message}`,
      findings: [],
      new_requirements: [],
      targetQueue: "",
    };
  }
}

function normalizeQueueName(value) {
  if (!value) {
    return "";
  }
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "human-decision-needed" ||
    normalized === "human decision needed" ||
    normalized === "decision-needed" ||
    normalized === "decision needed"
  ) {
    return "humanDecisionNeeded";
  }
  if (
    normalized === "to-clarify" ||
    normalized === "to clarify" ||
    normalized === "to_clarify" ||
    normalized === "toclarify"
  ) {
    return "toClarify";
  }
  if (
    normalized === "human-input" ||
    normalized === "human input" ||
    normalized === "human_input"
  ) {
    return "humanInput";
  }
  if (normalized === "wont-do" || normalized === "wont do") {
    return "wontDo";
  }
  return normalized;
}

function queuePathByName(runtimeQueues, queueName) {
  const normalized = normalizeQueueName(queueName);
  if (!runtimeQueues || !normalized) {
    return "";
  }
  return runtimeQueues[normalized] || "";
}

function writeRefinementItems(runtime, origin, newItems) {
  if (!Array.isArray(newItems) || newItems.length === 0 || !runtime.queues.refinement) {
    return [];
  }

  const created = [];
  const now = String(Date.now());

  for (const item of newItems) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const title = String(item.title || item.name || item.summary || item.description || "refinement item").trim();
    const id = String(item.id || `REQ-${now}`)
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toUpperCase();
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 45) || "item";
    const filename = `${id}-${slug}.md`;
    const filePath = path.join(runtime.queues.refinement, filename);

    const frontMatter = [
      "---",
      `id: ${id}`,
      `title: ${title}`,
      "status: refinement",
      "source: delivery-runner",
      "---",
      "",
    ].join("\n");

    const body = [
      "# Goal",
      String(item.goal || item.summary || item.description || item.text || "Needs follow-up").trim(),
      "",
      "## New requirement source",
      `From: ${origin}`,
      "",
      "## Clarifications",
      "- Created by automated flow loop.",
      "",
      "## Changes",
      "- None.",
      "",
    ].join("\n");

    fs.writeFileSync(filePath, frontMatter + body, "utf8");
    created.push(filePath);
  }

  return created;
}

function detectCurrentQueue(fileName, queues) {
  for (const [name, queueDir] of Object.entries(queues || {})) {
    const candidate = path.join(queueDir, fileName);
    if (fs.existsSync(candidate)) {
      return { name, path: candidate, dir: queueDir };
    }
  }
  return { name: "", path: "", dir: "" };
}

function routeByStatus({ runtime, filePath, status, routeMap, fallbackQueue }) {
  const fm = parseFrontMatter(filePath);
  const normalized = normalizeStatus(status || fm.status || "");

  if (normalized === "pass" && routeMap.pass) {
    return routeMap.pass;
  }
  if (normalized === "clarify" && routeMap.clarify) {
    return routeMap.clarify;
  }
  if (normalized === "block" && routeMap.block) {
    return routeMap.block;
  }

  if (typeof fm.status === "string") {
    const fmStatus = normalizeStatus(fm.status);
    if (fmStatus === "pass" && routeMap.pass) {
      return routeMap.pass;
    }
    if (fmStatus === "clarify" && routeMap.clarify) {
      return routeMap.clarify;
    }
    if (fmStatus === "block" && routeMap.block) {
      return routeMap.block;
    }
  }

  const fallback = normalizeQueueName(fallbackQueue || "toClarify");
  if (runtime && runtime.queues && runtime.queues[fallback]) {
    return fallback;
  }
  return "toClarify";
}

function resolveSourcePath(runtime, candidate) {
  const name = path.basename(candidate || "");
  if (!name) {
    return "";
  }
  if (candidate && fs.existsSync(candidate)) {
    return candidate;
  }

  const located = detectCurrentQueue(name, runtime.queues);
  return located.path || "";
}

function chooseBundleByBusinessScore(dir, maxSize) {
  const files = listQueueFiles(dir);
  if (files.length === 0) {
    return [];
  }
  const sorted = sortByBusinessScore(files);
  const size = Math.max(1, Number.parseInt(String(maxSize || sorted.length), 10) || sorted.length);
  return sorted.slice(0, size);
}

module.exports = {
  sleep,
  ensureDir,
  listQueueFiles,
  getFirstFile,
  countFiles,
  moveRequirementFile,
  parseFrontMatter,
  parseBusinessScore,
  sortByBusinessScore,
  setFrontMatterStatus,
  upsertMarkdownSection,
  appendQueueSection,
  runNodeScript,
  normalizeStatus,
  parseDecisionFile,
  queuePathByName,
  normalizeQueueName,
  writeRefinementItems,
  detectCurrentQueue,
  routeByStatus,
  resolveSourcePath,
  chooseBundleByBusinessScore,
};
