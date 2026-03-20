#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { loadRuntimeConfig, ensureQueueDirs } = require("../lib/runtime");
const { readBundleRegistry, writeBundleRegistry, listQueueFiles, parseFrontMatter } = require("../lib/flow-core");

function nowIso() {
  return new Date().toISOString();
}

function collectExecutionBundleIds(runtime) {
  const queues = ["selected", "arch", "dev", "qa", "ux", "sec", "deploy"];
  const ids = new Set();
  for (const queueName of queues) {
    const dir = runtime.queues[queueName];
    for (const filePath of listQueueFiles(dir)) {
      const fm = parseFrontMatter(filePath);
      const id = String(fm.bundle_id || "").trim();
      if (id) {
        ids.add(id);
      }
    }
  }
  return Array.from(ids).sort();
}

function countBundleFilesInExecution(runtime, bundleId) {
  const id = String(bundleId || "").trim();
  if (!id) {
    return 0;
  }
  const queues = ["selected", "arch", "dev", "qa", "ux", "sec", "deploy"];
  let total = 0;
  for (const queueName of queues) {
    const dir = runtime.queues[queueName];
    for (const filePath of listQueueFiles(dir)) {
      const fm = parseFrontMatter(filePath);
      if (String(fm.bundle_id || "").trim() === id) {
        total += 1;
      }
    }
  }
  return total;
}

function healBundleRegistry(runtime) {
  const registry = readBundleRegistry(runtime.agentsRoot);
  const notes = [];
  let changed = false;

  const readyId = String(registry.ready_bundle_id || "").trim();
  if (readyId) {
    const readyEntry = registry.bundles[readyId] && typeof registry.bundles[readyId] === "object"
      ? registry.bundles[readyId]
      : {};
    const sourceReqIds = Array.isArray(readyEntry.sourceReqIds)
      ? readyEntry.sourceReqIds.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const selectedCount = listQueueFiles(runtime.queues.selected).filter((filePath) => {
      const fm = parseFrontMatter(filePath);
      return String(fm.bundle_id || "").trim() === readyId;
    }).length;
    if (sourceReqIds.length === 0 && selectedCount === 0) {
      registry.ready_bundle_id = "";
      registry.bundles[readyId] = {
        ...readyEntry,
        id: readyId,
        status: "aborted",
        finishedAt: nowIso(),
      };
      changed = true;
      notes.push(`cleared empty ready bundle ${readyId}`);
    }
  }

  const executionIds = collectExecutionBundleIds(runtime);
  const activeId = String(registry.active_bundle_id || "").trim();
  if (activeId) {
    const activeCount = countBundleFilesInExecution(runtime, activeId);
    if (activeCount === 0) {
      if (executionIds.length === 1) {
        const inferred = executionIds[0];
        registry.active_bundle_id = inferred;
        const inferredEntry = registry.bundles[inferred] && typeof registry.bundles[inferred] === "object"
          ? registry.bundles[inferred]
          : {};
        registry.bundles[inferred] = {
          ...inferredEntry,
          id: inferred,
          status: "active",
          startedAt: String(inferredEntry.startedAt || nowIso()).trim() || nowIso(),
        };
        changed = true;
        notes.push(`reassigned stale active ${activeId} -> ${inferred}`);
      } else {
        registry.active_bundle_id = "";
        const activeEntry = registry.bundles[activeId] && typeof registry.bundles[activeId] === "object"
          ? registry.bundles[activeId]
          : {};
        registry.bundles[activeId] = {
          ...activeEntry,
          id: activeId,
          status: String(activeEntry.status || "aborted").trim() || "aborted",
          finishedAt: String(activeEntry.finishedAt || nowIso()).trim() || nowIso(),
        };
        changed = true;
        notes.push(`cleared stale active bundle ${activeId}`);
      }
    }
  } else if (executionIds.length === 1) {
    const inferred = executionIds[0];
    registry.active_bundle_id = inferred;
    const inferredEntry = registry.bundles[inferred] && typeof registry.bundles[inferred] === "object"
      ? registry.bundles[inferred]
      : {};
    registry.bundles[inferred] = {
      ...inferredEntry,
      id: inferred,
      status: "active",
      startedAt: String(inferredEntry.startedAt || nowIso()).trim() || nowIso(),
    };
    changed = true;
    notes.push(`restored missing active bundle ${inferred}`);
  }

  const activeAfter = String(registry.active_bundle_id || "").trim();
  const readyAfter = String(registry.ready_bundle_id || "").trim();
  if (activeAfter && readyAfter && activeAfter === readyAfter) {
    registry.ready_bundle_id = "";
    changed = true;
    notes.push(`cleared duplicate ready bundle ${readyAfter}`);
  }

  if (changed) {
    writeBundleRegistry(runtime.agentsRoot, registry);
  }
  return { changed, notes };
}

function clearDeliveryQualityCounters(runtime) {
  const filePath = path.join(runtime.agentsRoot, ".runtime", "delivery-quality", "state.json");
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const next = {
    attempts: {},
    pausedCounts: {},
    loopCounters: {},
  };
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return true;
}

function main() {
  const agentsRoot = path.resolve(__dirname, "..");
  const runtime = loadRuntimeConfig(agentsRoot);
  ensureQueueDirs(runtime.queues);

  const healed = healBundleRegistry(runtime);
  const resetState = clearDeliveryQualityCounters(runtime);

  process.stdout.write(`runner-heal: bundle_registry_changed=${healed.changed ? "yes" : "no"}\n`);
  if (healed.notes.length > 0) {
    for (const note of healed.notes) {
      process.stdout.write(`- ${note}\n`);
    }
  }
  process.stdout.write(`runner-heal: delivery_quality_state_reset=${resetState ? "yes" : "no"}\n`);
}

if (require.main === module) {
  main();
}
