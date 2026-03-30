#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { parseFrontMatter, listQueueFiles } = require("./flow-core");

const TERMINAL_DUPLICATE_QUEUE_PRIORITY = ["released", "wontDo", "humanDecisionNeeded"];
const NON_TERMINAL_INPUT_QUEUES = ["backlog", "refinement", "humanInput", "toClarify"];
const DELIVERY_ACTIVE_DUPLICATE_QUEUES = ["selected", "arch", "dev", "qa", "ux", "sec", "deploy", "blocked"];

function stripBundleSuffix(stem) {
  return String(stem || "")
    .replace(/^B\d{4}-/i, "")
    .replace(/-B\d{4}(?:-carry-\d{2}-from-B\d{4})?$/i, "")
    .replace(/-carry-\d{2}-from-B\d{4}$/i, "");
}

function stripCarryoverSuffix(stem) {
  return String(stem || "")
    .replace(/^carry-\d{2}-from-B\d{4}-/i, "")
    .replace(/-carry-\d{2}-from-B\d{4}$/i, "");
}

function normalizeRequirementKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canonicalRequirementKeyFromFileName(fileName) {
  let stem = String(fileName || "").trim();
  if (!stem) {
    return "";
  }
  if (stem.endsWith(".decision.json")) {
    stem = stem.slice(0, -".decision.json".length);
  }
  if (stem.toLowerCase().endsWith(".md")) {
    stem = stem.slice(0, -".md".length);
  }
  const canonical = stripCarryoverSuffix(stripBundleSuffix(stem));
  return normalizeRequirementKey(canonical);
}

function canonicalRequirementKeyFromPath(filePath) {
  if (!filePath) {
    return "";
  }
  if (fs.existsSync(filePath) && path.extname(filePath).toLowerCase() === ".md") {
    const fm = parseFrontMatter(filePath);
    const id = normalizeRequirementKey(fm.id || "");
    if (id) {
      return id;
    }
  }
  return canonicalRequirementKeyFromFileName(path.basename(String(filePath || "")));
}

function findDuplicateRequirementCopies(runtime, sourcePath, options = {}) {
  const key = canonicalRequirementKeyFromPath(sourcePath);
  if (!key || !runtime || !runtime.queues) {
    return [];
  }
  const sourceResolved = path.resolve(String(sourcePath || ""));
  const queueNames = Array.isArray(options.queueNames) && options.queueNames.length > 0
    ? options.queueNames
    : Object.keys(runtime.queues);
  const skipQueues = new Set(Array.isArray(options.skipQueues) ? options.skipQueues : []);
  const copies = [];

  for (const queueName of queueNames) {
    if (skipQueues.has(queueName)) {
      continue;
    }
    const queueDir = runtime.queues[queueName];
    for (const filePath of listQueueFiles(queueDir)) {
      if (path.resolve(filePath) === sourceResolved) {
        continue;
      }
      const currentKey = canonicalRequirementKeyFromPath(filePath);
      if (!currentKey || currentKey !== key) {
        continue;
      }
      copies.push({ queueName, filePath });
    }
  }

  return copies;
}

function findBlockingDuplicateRequirementCopy(runtime, sourcePath, options = {}) {
  const duplicates = findDuplicateRequirementCopies(runtime, sourcePath, options);
  if (duplicates.length === 0) {
    return null;
  }

  const terminalPriority = Array.isArray(options.terminalQueuePriority) && options.terminalQueuePriority.length > 0
    ? options.terminalQueuePriority
    : TERMINAL_DUPLICATE_QUEUE_PRIORITY;
  const inputQueues = new Set(
    Array.isArray(options.inputQueues) && options.inputQueues.length > 0
      ? options.inputQueues
      : NON_TERMINAL_INPUT_QUEUES
  );

  for (const queueName of terminalPriority) {
    const match = duplicates.find((item) => item.queueName === queueName);
    if (match) {
      return {
        kind: "terminal",
        reasonCode: "duplicate_terminal_winner",
        queueName: match.queueName,
        filePath: match.filePath,
      };
    }
  }

  const activeDuplicate = duplicates.find((item) => !inputQueues.has(item.queueName));
  if (activeDuplicate) {
    return {
      kind: "active",
      reasonCode: "duplicate_active_copy_exists",
      queueName: activeDuplicate.queueName,
      filePath: activeDuplicate.filePath,
    };
  }

  const otherInputDuplicate = duplicates[0];
  return {
    kind: "input",
    reasonCode: "duplicate_copy_exists",
    queueName: otherInputDuplicate.queueName,
    filePath: otherInputDuplicate.filePath,
  };
}

function collectRequirementDuplicateGroups(runtime, options = {}) {
  const queueNames = Array.isArray(options.queueNames) && options.queueNames.length > 0
    ? options.queueNames
    : Object.keys(runtime && runtime.queues ? runtime.queues : {});
  const byId = new Map();

  for (const queueName of queueNames) {
    const queueDir = runtime && runtime.queues ? runtime.queues[queueName] : "";
    for (const filePath of listQueueFiles(queueDir)) {
      const id = canonicalRequirementKeyFromPath(filePath);
      if (!id) {
        continue;
      }
      const copies = byId.get(id) || [];
      copies.push({ queueName, filePath });
      byId.set(id, copies);
    }
  }

  return Array.from(byId.entries())
    .filter(([, copies]) => copies.length > 1)
    .map(([id, copies]) => ({ id, copies }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

module.exports = {
  TERMINAL_DUPLICATE_QUEUE_PRIORITY,
  NON_TERMINAL_INPUT_QUEUES,
  DELIVERY_ACTIVE_DUPLICATE_QUEUES,
  stripBundleSuffix,
  stripCarryoverSuffix,
  normalizeRequirementKey,
  canonicalRequirementKeyFromFileName,
  canonicalRequirementKeyFromPath,
  findDuplicateRequirementCopies,
  findBlockingDuplicateRequirementCopy,
  collectRequirementDuplicateGroups,
};
