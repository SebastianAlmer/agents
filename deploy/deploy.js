#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  getFirstFile,
  readConfigArgs,
  readThreadId,
  writeThreadId,
  getThreadFilePath,
  runCodexExec,
  startInteractiveCodexAgent,
} = require("../lib/agent");
const { installTimestampedConsole } = require("../lib/logging");
const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");

installTimestampedConsole();

function parseArgs(argv) {
  const args = {
    requirement: "",
    auto: false,
    finalPass: false,
    batch: false,
    releaseHistory: false,
    bundleId: "",
    version: "",
    previousVersion: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i] || "");
    const arg = raw;
    const normalized = arg.toLowerCase();
    if (normalized === "-auto" || normalized === "--auto") {
      args.auto = true;
      continue;
    }
    if (normalized === "--final-pass" || normalized === "-final-pass") {
      args.finalPass = true;
      continue;
    }
    if (normalized === "--batch" || normalized === "-batch") {
      args.batch = true;
      continue;
    }
    if (normalized === "--release-history" || normalized === "-release-history") {
      args.releaseHistory = true;
      continue;
    }
    if (normalized === "-requirement" || normalized === "--requirement") {
      args.requirement = argv[i + 1] || "";
      i++;
      continue;
    }
    if (normalized === "--bundle-id" || normalized === "-bundle-id") {
      args.bundleId = argv[i + 1] || "";
      i++;
      continue;
    }
    if (normalized.startsWith("--bundle-id=")) {
      args.bundleId = String(raw.split("=", 2)[1] || "");
      continue;
    }
    if (normalized === "--version" || normalized === "-version") {
      args.version = argv[i + 1] || "";
      i++;
      continue;
    }
    if (normalized.startsWith("--version=")) {
      args.version = String(raw.split("=", 2)[1] || "");
      continue;
    }
    if (normalized === "--previous-version" || normalized === "-previous-version") {
      args.previousVersion = argv[i + 1] || "";
      i++;
      continue;
    }
    if (normalized.startsWith("--previous-version=")) {
      args.previousVersion = String(raw.split("=", 2)[1] || "");
      continue;
    }
  }
  return args;
}

function listRequirementFiles(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
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

function normalizeScope(value) {
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

function summarizeScopes(files) {
  const summary = {
    frontend: 0,
    backend: 0,
    fullstack: 0,
    unknown: 0,
  };
  for (const file of files) {
    const fm = parseFrontMatter(file);
    const scope = normalizeScope(fm.implementation_scope || fm.dev_scope || fm.scope || "");
    if (!scope) {
      summary.unknown += 1;
      continue;
    }
    summary[scope] += 1;
  }
  return summary;
}

function listReleasedFilesForBundle(releasedDir, bundleId) {
  const files = listRequirementFiles(releasedDir);
  const normalizedBundleId = String(bundleId || "").trim();
  if (!normalizedBundleId) {
    return files;
  }
  return files.filter((file) => String(parseFrontMatter(file).bundle_id || "").trim() === normalizedBundleId);
}

function readBundleRegistrySafe(runtime) {
  const agentsRoot = String((runtime && runtime.agentsRoot) || "").trim();
  if (!agentsRoot) {
    return null;
  }
  try {
    const filePath = path.join(agentsRoot, ".runtime", "bundles", "registry.json");
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function listAdditionalIncompleteReleasedFiles(runtime, bundleId) {
  const releasedDir = runtime && runtime.queues ? runtime.queues.released : "";
  const files = listRequirementFiles(releasedDir);
  const normalizedBundleId = String(bundleId || "").trim();
  if (!normalizedBundleId || files.length === 0) {
    return [];
  }

  const registry = readBundleRegistrySafe(runtime);
  const bundles = registry && registry.bundles && typeof registry.bundles === "object"
    ? registry.bundles
    : {};
  const incompleteBundleIds = new Set();
  for (const [id, entry] of Object.entries(bundles)) {
    const currentId = String(id || "").trim();
    if (!currentId || currentId === normalizedBundleId) {
      continue;
    }
    const status = String(entry && entry.status || "").trim().toLowerCase();
    if (["active", "release-pending", "aborted", "blocked", "needs-human"].includes(status)) {
      incompleteBundleIds.add(currentId);
    }
  }

  return files.filter((file) => {
    const fileBundleId = String(parseFrontMatter(file).bundle_id || "").trim();
    return fileBundleId && incompleteBundleIds.has(fileBundleId);
  });
}

function listReleaseHistoryRequirementFiles(runtime, bundleId) {
  const primary = listReleasedFilesForBundle(runtime.queues.released, bundleId);
  const additional = listAdditionalIncompleteReleasedFiles(runtime, bundleId);
  const seen = new Set();
  const combined = [];
  for (const file of [...primary, ...additional]) {
    const key = path.resolve(file);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    combined.push(file);
  }
  return {
    primary,
    additional,
    combined,
  };
}

function validateReleaseHistoryInputs(runtime) {
  const cfg = runtime.releaseHistory || {};
  const historyFile = String(cfg.file || "").trim();
  const sourceFile = String(cfg.sourceFile || "").trim();
  if (!historyFile) {
    throw new Error("Release history file is not configured");
  }
  if (fs.existsSync(historyFile)) {
    return {
      historyFile,
      sourceFile,
      historyExists: true,
      sourceExists: Boolean(sourceFile && fs.existsSync(sourceFile)),
    };
  }
  if (!sourceFile || !fs.existsSync(sourceFile)) {
    throw new Error(
      `Release history file missing and source cannot be read: history=${historyFile}, source=${sourceFile || "<none>"}`
    );
  }
  return {
    historyFile,
    sourceFile,
    historyExists: false,
    sourceExists: true,
  };
}

function buildReleaseHistoryContext(runtime, args) {
  const paths = validateReleaseHistoryInputs(runtime);
  const releaseFiles = listReleaseHistoryRequirementFiles(runtime, args.bundleId);
  const primaryListText = releaseFiles.primary.length > 0
    ? releaseFiles.primary.map((file) => `- ${path.basename(file)} (${file})`).join("\n")
    : "- None";
  const additionalListText = releaseFiles.additional.length > 0
    ? releaseFiles.additional.map((file) => `- ${path.basename(file)} (${file})`).join("\n")
    : "- None";
  const combinedListText = releaseFiles.combined.length > 0
    ? releaseFiles.combined.map((file) => `- ${path.basename(file)} (${file})`).join("\n")
    : "- None";
  return [
    "# Context",
    `Repository root: ${runtime.repoRoot}`,
    "Release history mode: true",
    `Bundle ID: ${String(args.bundleId || "").trim() || "unknown"}`,
    `Version: ${String(args.version || "").trim() || "unknown"}`,
    `Previous version: ${String(args.previousVersion || "").trim() || "unknown"}`,
    `Release history file: ${paths.historyFile}`,
    `Release history file exists: ${paths.historyExists ? "yes" : "no"}`,
    `Release history source file: ${paths.sourceFile || "None"}`,
    `Release history source exists: ${paths.sourceExists ? "yes" : "no"}`,
    `Released dir: ${runtime.queues.released}`,
    "Release requirements to document in this release:",
    combinedListText,
    "Primary bundle requirements:",
    primaryListText,
    "Prior incomplete bundle requirements already in released queue and included in this release:",
    additionalListText,
    "If the prior incomplete list is not empty, the release section must cover both the primary bundle and those prior incomplete released requirements.",
    "Git actions are executed by flow runner, not by this agent.",
    "",
  ].join("\n");
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (process.env.CODEX_FLOW_AUTO === "1") {
    parsed.auto = true;
  }
  const { requirement, auto, finalPass, batch, releaseHistory } = parsed;

  const agentRoot = __dirname;
  const runtime = loadRuntimeConfig(path.resolve(agentRoot, ".."));
  ensureQueueDirs(runtime.queues);

  const repoRoot = runtime.repoRoot;
  const docsDir = runtime.docsDir;
  const deployDir = runtime.queues.deploy;
  const releasedDir = runtime.queues.released;

  let reqFile = "";
  let deployFiles = [];
  if (releaseHistory) {
    console.log("DEPLOY: release history mode");
  } else if (!finalPass) {
    console.log(`DEPLOY: scan deploy ${deployDir}`);
    deployFiles = listRequirementFiles(deployDir);

    if (batch) {
      if (deployFiles.length === 0) {
        console.log("DEPLOY: deploy queue empty");
        if (auto) {
          process.exit(0);
        }
      }

      if (requirement) {
        const reqPath = path.isAbsolute(requirement)
          ? requirement
          : path.join(deployDir, requirement);
        if (!fs.existsSync(reqPath)) {
          throw new Error(`Requirement not found: ${reqPath}`);
        }
        reqFile = reqPath;
      } else if (deployFiles.length > 0) {
        reqFile = deployFiles[0];
      }
    } else if (requirement) {
      const reqPath = path.isAbsolute(requirement)
        ? requirement
        : path.join(deployDir, requirement);
      if (!fs.existsSync(reqPath)) {
        throw new Error(`Requirement not found: ${reqPath}`);
      }
      reqFile = reqPath;
    } else {
      const firstFile = getFirstFile(deployDir);
      if (!firstFile) {
        console.log("DEPLOY: deploy queue empty");
        if (auto) {
          process.exit(0);
        }
      } else {
        reqFile = firstFile;
      }
    }
  } else {
    console.log(`DEPLOY: final pass over released ${releasedDir}`);
  }

  if (reqFile) {
    console.log(`DEPLOY: using ${reqFile}`);
  }
  console.log(`DEPLOY: batch mode ${batch}`);
  console.log(`DEPLOY: released dir ${releasedDir}`);

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");

  const reqLine = reqFile || "None";
  const deployNames = deployFiles.map((file) => path.basename(file));
  const deployListText = deployNames.length > 0 ? deployNames.map((name) => `- ${name}`).join("\n") : "- None";
  const scopeSummary = summarizeScopes(deployFiles);
  const scopeSummaryText = `frontend=${scopeSummary.frontend}, backend=${scopeSummary.backend}, fullstack=${scopeSummary.fullstack}, unknown=${scopeSummary.unknown}`;

  const context = releaseHistory
    ? buildReleaseHistoryContext(runtime, parsed)
    : `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nFinal pass: ${finalPass}\nBatch mode: ${batch}\nRelease history mode: false\nDeploy dir: ${deployDir}\nReleased dir: ${releasedDir}\nDocs dir: ${docsDir}\nDeploy mode: ${runtime.deploy.mode}\nFinal push on success: ${runtime.deploy.finalPushOnSuccess}\nDeploy queue files:\n${deployListText}\nBatch scope summary: ${scopeSummaryText}\nGit actions are executed by flow runner, not by this agent.\n`;
  const fullPrompt = `${prompt}\n\n${context}`;

  const configArgs = readConfigArgs(runtime.resolveAgentCodexConfigPath("DEPLOY"));

  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto,
    threadKey: releaseHistory ? "release-history" : "",
  });
  let threadId = readThreadId(threadFile);

  if (!auto) {
    await startInteractiveCodexAgent({
      agentLabel: "DEPLOY",
      repoRoot,
      configArgs,
      threadFile,
      agentsRoot: runtime.agentsRoot,
      bootstrapPrompt: fullPrompt,
      threadId,
      runtime,
      autoMode: false,
    });
    process.exit(0);
  }

  const result = await runCodexExec({
    prompt: fullPrompt,
    repoRoot,
    configArgs,
    threadId,
    threadFile,
    agentsRoot: runtime.agentsRoot,
    agentLabel: "DEPLOY",
    autoCompact: auto,
    runtime,
    autoMode: auto,
  });

  if (result.threadId) {
    writeThreadId(threadFile, result.threadId);
    console.log(`DEPLOY: thread saved ${result.threadId}`);
  } else {
    console.log("DEPLOY: warning - no session id found");
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  listReleasedFilesForBundle,
  validateReleaseHistoryInputs,
  buildReleaseHistoryContext,
  listAdditionalIncompleteReleasedFiles,
  listReleaseHistoryRequirementFiles,
};
