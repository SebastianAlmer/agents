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
const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");

function parseArgs(argv) {
  const args = { requirement: "", auto: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const normalized = arg.toLowerCase();
    if (normalized === "-auto" || normalized === "--auto") {
      args.auto = true;
      continue;
    }
    if (normalized === "-requirement" || normalized === "--requirement") {
      args.requirement = argv[i + 1] || "";
      i++;
      continue;
    }
  }
  return args;
}

function resolveArchDigestPath(runtime) {
  const configured = String(
    (runtime.arch && runtime.arch.digestFile) || ".runtime/arch-docs-digest.md"
  ).trim();
  if (path.isAbsolute(configured)) {
    return configured;
  }
  return path.resolve(runtime.agentsRoot, configured);
}

function uniquePaths(paths) {
  const out = [];
  const seen = new Set();
  for (const item of paths || []) {
    const p = String(item || "").trim();
    if (!p) {
      continue;
    }
    const key = path.resolve(p);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(key);
  }
  return out;
}

function collectDigestDocs(runtime) {
  const docsDir = runtime.docsDir;
  const candidates = [];

  if (Array.isArray(runtime.productVisionFiles)) {
    candidates.push(...runtime.productVisionFiles);
  }

  const pos = runtime.posDocs || {};
  candidates.push(pos.vision, pos.blueprint, pos.epicMatrix, pos.notBuilding, pos.visionAchieved);

  candidates.push(
    path.join(docsDir, "web-governance.md"),
    path.join(docsDir, "architecture.md"),
    path.join(docsDir, "api-reference.md"),
    path.join(docsDir, "data-model-reference.md"),
    path.join(docsDir, "roles-and-functions.md")
  );

  return uniquePaths(candidates).filter((p) => fs.existsSync(p));
}

function readMarkdownHeadings(filePath, maxHeadings) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const headings = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
    });
    if (headings.length >= maxHeadings) {
      break;
    }
  }
  return headings;
}

function writeArchDocsDigest(runtime) {
  if (!(runtime.arch && runtime.arch.digestEnabled)) {
    return "";
  }

  const digestPath = resolveArchDigestPath(runtime);
  const maxFiles = Number.isInteger(runtime.arch.digestMaxFiles)
    ? runtime.arch.digestMaxFiles
    : 12;
  const maxHeadings = Number.isInteger(runtime.arch.digestMaxHeadingsPerFile)
    ? runtime.arch.digestMaxHeadingsPerFile
    : 20;

  const docs = collectDigestDocs(runtime).slice(0, Math.max(1, maxFiles));
  const rel = (p) => {
    try {
      return path.relative(runtime.repoRoot, p) || p;
    } catch {
      return p;
    }
  };

  const lines = [
    "# ARCH Docs Digest",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Use this digest first. Open full docs only for high-risk or contradictory requirements.",
    "",
  ];

  for (const doc of docs) {
    lines.push(`## ${rel(doc)}`);
    const headings = readMarkdownHeadings(doc, Math.max(1, maxHeadings));
    if (headings.length === 0) {
      lines.push("- (no markdown headings found)");
      lines.push("");
      continue;
    }
    for (const item of headings) {
      const indent = "  ".repeat(Math.max(0, item.level - 1));
      lines.push(`${indent}- ${item.text}`);
    }
    lines.push("");
  }

  fs.mkdirSync(path.dirname(digestPath), { recursive: true });
  fs.writeFileSync(digestPath, `${lines.join("\n")}\n`, "utf8");
  return digestPath;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (process.env.CODEX_FLOW_AUTO === "1") {
    parsed.auto = true;
  }
  const { requirement, auto } = parsed;

  const agentRoot = __dirname;
  const runtime = loadRuntimeConfig(path.resolve(agentRoot, ".."));
  ensureQueueDirs(runtime.queues);

  const repoRoot = runtime.repoRoot;
  const docsDir = runtime.docsDir;
  const archDir = runtime.queues.arch;
  const devDir = runtime.queues.dev;
  const clarifyDir = runtime.queues.toClarify;

  console.log(`ARCH: scan arch ${archDir}`);

  let reqFile = "";
  if (requirement) {
    const reqPath = path.isAbsolute(requirement)
      ? requirement
      : path.join(archDir, requirement);
    if (!fs.existsSync(reqPath)) {
      throw new Error(`Requirement not found: ${reqPath}`);
    }
    reqFile = reqPath;
  } else {
    const firstFile = getFirstFile(archDir);
    if (!firstFile) {
      console.log("ARCH: arch queue empty");
      if (auto) {
        process.exit(0);
      }
    } else {
      reqFile = firstFile;
    }
  }

  if (reqFile) {
    console.log(`ARCH: using ${reqFile}`);
  }
  console.log(`ARCH: dev dir ${devDir}`);
  console.log(`ARCH: to-clarify dir ${clarifyDir}`);

  const promptPath = path.join(agentRoot, "prompt.md");
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const prompt = fs.readFileSync(promptPath, "utf8");
  const digestPath = writeArchDocsDigest(runtime);

  const reqLine = reqFile || "None";
  const context = `# Context\nRepository root: ${repoRoot}\nRequirement file: ${reqLine}\nArch dir: ${archDir}\nDev dir: ${devDir}\nTo-clarify dir: ${clarifyDir}\nDocs dir: ${docsDir}\nDocs digest: ${digestPath || "None"}\n`;
  const fullPrompt = `${prompt}\n\n${context}`;

  const configArgs = readConfigArgs(runtime.resolveAgentCodexConfigPath("ARCH"));

  const threadFile = getThreadFilePath({
    agentsRoot: runtime.agentsRoot,
    agentRoot,
    auto,
  });
  let threadId = readThreadId(threadFile);

  if (!auto) {
    await startInteractiveCodexAgent({
      agentLabel: "ARCH",
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
    agentLabel: "ARCH",
    autoCompact: auto,
    runtime,
    autoMode: auto,
  });

  if (result.threadId) {
    writeThreadId(threadFile, result.threadId);
    console.log(`ARCH: thread saved ${result.threadId}`);
  } else {
    console.log("ARCH: warning - no session id found");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
