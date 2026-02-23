"use strict";

const fs = require("fs");
const path = require("path");

function sanitizeAgentLabel(value) {
  return String(value || "agent")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "agent";
}

function ensureDirectory(dirPath) {
  if (!dirPath) {
    return;
  }
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureFile(filePath, content) {
  if (!filePath) {
    return;
  }
  if (!fs.existsSync(filePath)) {
    ensureDirectory(path.dirname(filePath));
    fs.writeFileSync(filePath, content, "utf8");
  }
}

function normalizeLineBreaks(text) {
  return String(text || "").replace(/\r\n/g, "\n");
}

function tailByChars(text, maxChars) {
  const raw = normalizeLineBreaks(text);
  if (!Number.isFinite(maxChars) || maxChars <= 0 || raw.length <= maxChars) {
    return raw;
  }
  return raw.slice(raw.length - maxChars);
}

function readTail(filePath, maxChars) {
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return tailByChars(raw, maxChars);
}

function defaultSharedTemplate() {
  return [
    "# Shared Project Memory",
    "",
    "## Stable Facts",
    "- ",
    "",
    "## Decisions",
    "- ",
    "",
    "## Known Pitfalls",
    "- ",
    "",
    "## Open Questions",
    "- ",
    "",
  ].join("\n");
}

function defaultAgentTemplate(agentLabel) {
  return [
    `# Agent Memory: ${String(agentLabel || "AGENT").trim() || "AGENT"}`,
    "",
    "## Working Notes",
    "- ",
    "",
    "## Recent Learnings",
    "- ",
    "",
    "## Risks / Follow-ups",
    "- ",
    "",
    "## Obsolete (remove regularly)",
    "- ",
    "",
  ].join("\n");
}

function resolveMemoryFiles(runtime, agentLabel) {
  const memory = runtime && runtime.memory ? runtime.memory : {};
  const dir = String(memory.dir || "").trim() || path.join(runtime.agentsRoot, ".runtime", "memory");
  const sharedFile = String(memory.sharedFile || "shared.md").trim() || "shared.md";
  const agentFile = `${sanitizeAgentLabel(agentLabel)}.md`;
  const sharedPath = path.join(dir, sharedFile);
  const agentPath = path.join(dir, agentFile);
  return {
    dir,
    sharedPath,
    agentPath,
    agentFile,
  };
}

function ensureMemoryFiles(runtime, agentLabel) {
  const files = resolveMemoryFiles(runtime, agentLabel);
  ensureDirectory(files.dir);
  ensureFile(files.sharedPath, defaultSharedTemplate());
  ensureFile(files.agentPath, defaultAgentTemplate(agentLabel));
  return files;
}

function captureFileStats(filePaths) {
  const stats = {};
  for (const filePath of filePaths || []) {
    if (!filePath) {
      continue;
    }
    try {
      const st = fs.statSync(filePath);
      stats[filePath] = {
        mtimeMs: Number(st.mtimeMs || 0),
        size: Number(st.size || 0),
      };
    } catch {
      stats[filePath] = null;
    }
  }
  return stats;
}

function didAnyFileChange(before, after) {
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  for (const key of keys) {
    const b = before && before[key] ? before[key] : null;
    const a = after && after[key] ? after[key] : null;
    if (!b && a) {
      return true;
    }
    if (b && !a) {
      return true;
    }
    if (!b && !a) {
      continue;
    }
    if (Number(b.mtimeMs) !== Number(a.mtimeMs) || Number(b.size) !== Number(a.size)) {
      return true;
    }
  }
  return false;
}

function buildMemoryReadContext(runtime, agentLabel) {
  if (!runtime || !runtime.memory || !runtime.memory.enabled || !runtime.memory.includeInPrompt) {
    return {
      enabled: false,
      context: "",
      files: null,
      snapshots: null,
    };
  }
  const files = ensureMemoryFiles(runtime, agentLabel);
  const maxChars = Math.max(500, Number.parseInt(String(runtime.memory.maxContextCharsPerFile || 4000), 10) || 4000);
  const sharedText = readTail(files.sharedPath, maxChars);
  const agentText = readTail(files.agentPath, maxChars);
  const snapshots = captureFileStats([files.sharedPath, files.agentPath]);
  const context = [
    "# Memory Context (Local, Project-Specific)",
    `Memory directory: ${files.dir}`,
    `Shared memory file: ${files.sharedPath}`,
    `Agent memory file: ${files.agentPath}`,
    "Memory priority: Use memory as helper context; docs and requirement files remain source of truth.",
    "",
    "## Shared Memory Snapshot",
    "```markdown",
    sharedText || "(empty)",
    "```",
    "",
    "## Agent Memory Snapshot",
    "```markdown",
    agentText || "(empty)",
    "```",
  ].join("\n");

  return {
    enabled: true,
    context,
    files,
    snapshots,
  };
}

function buildMemoryUpdatePrompt(runtime, agentLabel, files) {
  const softShared = Math.max(20, Number.parseInt(String(runtime.memory.softMaxLinesShared || 250), 10) || 250);
  const softAgent = Math.max(20, Number.parseInt(String(runtime.memory.softMaxLinesAgent || 180), 10) || 180);
  return [
    "# Memory Update Task",
    "Update local memory files now.",
    "",
    `Target shared file: ${files.sharedPath}`,
    `Target agent file: ${files.agentPath}`,
    "",
    "Goals:",
    "- Keep only stable, reusable project knowledge.",
    "- Add new durable learnings from this run.",
    "- Remove obsolete or contradictory entries.",
    "- Merge duplicates and keep entries concise.",
    "",
    "Rules:",
    "- Do not change requirement queue files in this step.",
    "- Do not store secrets/tokens/passwords in memory.",
    "- If uncertain, prefer shorter notes over speculative detail.",
    `- Keep shared memory near <= ${softShared} lines.`,
    `- Keep agent memory near <= ${softAgent} lines.`,
    "",
    `Agent label: ${agentLabel}`,
  ].join("\n");
}

function shouldUpdateMemoryForRun(runtime, autoMode) {
  if (!runtime || !runtime.memory || !runtime.memory.enabled) {
    return false;
  }
  if (autoMode) {
    return Boolean(runtime.memory.updateOnAuto);
  }
  return Boolean(runtime.memory.updateOnInteractive);
}

module.exports = {
  sanitizeAgentLabel,
  ensureMemoryFiles,
  buildMemoryReadContext,
  buildMemoryUpdatePrompt,
  captureFileStats,
  didAnyFileChange,
  shouldUpdateMemoryForRun,
};
