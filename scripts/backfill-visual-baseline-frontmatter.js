#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const OPEN_QUEUES = [
  "refinement",
  "backlog",
  "selected",
  "arch",
  "dev",
  "qa",
  "sec",
  "ux",
  "deploy",
  "to-clarify",
  "human-decision-needed",
  "human-input",
  "blocked",
];

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md") && !entry.name.startsWith("."))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function hasFrontMatter(raw) {
  return /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(raw);
}

function upsertFrontMatterField(frontMatter, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedKey}\\s*:.*$`, "m");
  if (pattern.test(frontMatter)) {
    return {
      next: frontMatter,
      changed: false,
      present: true,
    };
  }
  const trimmed = frontMatter.replace(/\s+$/, "");
  return {
    next: `${trimmed}\n${key}: ${value}`,
    changed: true,
    present: false,
  };
}

function backfillFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  if (!hasFrontMatter(raw)) {
    return {
      changed: false,
      skipped: true,
      reason: "no-frontmatter",
      filePath,
    };
  }

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return {
      changed: false,
      skipped: true,
      reason: "frontmatter-parse-failed",
      filePath,
    };
  }

  const current = match[1];
  const intentUpdate = upsertFrontMatterField(current, "visual_change_intent", "false");
  const decisionUpdate = upsertFrontMatterField(intentUpdate.next, "baseline_decision", "none");

  if (!intentUpdate.changed && !decisionUpdate.changed) {
    return {
      changed: false,
      skipped: false,
      reason: "already-present",
      filePath,
    };
  }

  const updatedRaw = raw.replace(
    /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,
    `---\n${decisionUpdate.next}\n---\n`
  );
  fs.writeFileSync(filePath, updatedRaw, "utf8");
  return {
    changed: true,
    skipped: false,
    reason: "updated",
    filePath,
    added: {
      visual_change_intent: !intentUpdate.present,
      baseline_decision: !decisionUpdate.present,
    },
  };
}

function main() {
  const agentsRoot = path.resolve(__dirname, "..");
  const requirementsRoot = path.join(agentsRoot, "requirements");
  const reportDir = path.join(agentsRoot, ".runtime", "reports");
  fs.mkdirSync(reportDir, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    root: agentsRoot,
    requirementsRoot,
    queues: {},
    totals: {
      filesSeen: 0,
      changed: 0,
      skippedNoFrontmatter: 0,
      unchanged: 0,
    },
    changedFiles: [],
  };

  for (const queueName of OPEN_QUEUES) {
    const dir = path.join(requirementsRoot, queueName);
    const files = listMarkdownFiles(dir);
    const queueStats = {
      filesSeen: files.length,
      changed: 0,
      skippedNoFrontmatter: 0,
      unchanged: 0,
    };

    for (const filePath of files) {
      const outcome = backfillFile(filePath);
      report.totals.filesSeen += 1;

      if (outcome.changed) {
        queueStats.changed += 1;
        report.totals.changed += 1;
        report.changedFiles.push(path.relative(agentsRoot, filePath));
      } else if (outcome.skipped) {
        queueStats.skippedNoFrontmatter += 1;
        report.totals.skippedNoFrontmatter += 1;
      } else {
        queueStats.unchanged += 1;
        report.totals.unchanged += 1;
      }
    }

    report.queues[queueName] = queueStats;
  }

  const reportPath = path.join(reportDir, "baseline-frontmatter-backfill.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  process.stdout.write(`Backfill complete: changed=${report.totals.changed}, seen=${report.totals.filesSeen}\n`);
  process.stdout.write(`Report: ${reportPath}\n`);
}

if (require.main === module) {
  main();
}
