#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { parseToml } = require("../lib/runtime");

function parseArgs(argv) {
  const args = {
    help: false,
    repoRoot: "",
    requirementsRoot: "",
    docsDir: "",
    flow: "",
    maxReq: undefined,
    verbose: undefined,
    detail: undefined,
    preflight: "",
    deployMode: "",
    finalPushOnSuccess: undefined,
    requireCleanStartForCommits: undefined,
    devRoutingMode: "",
    useFe: undefined,
    useBe: undefined,
    useFs: undefined,
    qaChecks: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const key = raw.toLowerCase();

    if (key === "-h" || key === "--help") {
      args.help = true;
      continue;
    }

    if (key === "--repo-root") {
      args.repoRoot = argv[++i] || "";
      continue;
    }
    if (key.startsWith("--repo-root=")) {
      args.repoRoot = raw.split("=", 2)[1] || "";
      continue;
    }

    if (key === "--requirements-root") {
      args.requirementsRoot = argv[++i] || "";
      continue;
    }
    if (key.startsWith("--requirements-root=")) {
      args.requirementsRoot = raw.split("=", 2)[1] || "";
      continue;
    }

    if (key === "--docs-dir") {
      args.docsDir = argv[++i] || "";
      continue;
    }
    if (key.startsWith("--docs-dir=")) {
      args.docsDir = raw.split("=", 2)[1] || "";
      continue;
    }

    if (key === "--flow") {
      args.flow = (argv[++i] || "").toLowerCase();
      continue;
    }
    if (key.startsWith("--flow=")) {
      args.flow = (raw.split("=", 2)[1] || "").toLowerCase();
      continue;
    }

    if (key === "--max-req") {
      args.maxReq = parseInt(argv[++i] || "0", 10);
      continue;
    }
    if (key.startsWith("--max-req=")) {
      args.maxReq = parseInt(raw.split("=", 2)[1] || "0", 10);
      continue;
    }

    if (key === "--verbose") {
      args.verbose = true;
      continue;
    }
    if (key === "--no-verbose") {
      args.verbose = false;
      continue;
    }

    if (key === "--detail") {
      args.detail = true;
      continue;
    }
    if (key === "--no-detail") {
      args.detail = false;
      continue;
    }

    if (key === "--preflight") {
      args.preflight = (argv[++i] || "").toLowerCase();
      continue;
    }
    if (key.startsWith("--preflight=")) {
      args.preflight = (raw.split("=", 2)[1] || "").toLowerCase();
      continue;
    }

    if (key === "--deploy-mode") {
      args.deployMode = (argv[++i] || "").toLowerCase();
      continue;
    }
    if (key.startsWith("--deploy-mode=")) {
      args.deployMode = (raw.split("=", 2)[1] || "").toLowerCase();
      continue;
    }

    if (key === "--final-push-on-success") {
      args.finalPushOnSuccess = true;
      continue;
    }
    if (key === "--no-final-push-on-success") {
      args.finalPushOnSuccess = false;
      continue;
    }

    if (key === "--require-clean-start-for-commits") {
      args.requireCleanStartForCommits = true;
      continue;
    }
    if (key === "--no-require-clean-start-for-commits") {
      args.requireCleanStartForCommits = false;
      continue;
    }

    if (key === "--dev-routing") {
      args.devRoutingMode = (argv[++i] || "").toLowerCase();
      continue;
    }
    if (key.startsWith("--dev-routing=")) {
      args.devRoutingMode = (raw.split("=", 2)[1] || "").toLowerCase();
      continue;
    }

    if (key === "--enable-dev-fe") {
      args.useFe = true;
      continue;
    }
    if (key === "--disable-dev-fe") {
      args.useFe = false;
      continue;
    }
    if (key === "--enable-dev-be") {
      args.useBe = true;
      continue;
    }
    if (key === "--disable-dev-be") {
      args.useBe = false;
      continue;
    }
    if (key === "--enable-dev-fs") {
      args.useFs = true;
      continue;
    }
    if (key === "--disable-dev-fs") {
      args.useFs = false;
      continue;
    }

    if (key === "--qa-check") {
      const check = String(argv[++i] || "").trim();
      if (check) {
        args.qaChecks.push(check);
      }
      continue;
    }
    if (key.startsWith("--qa-check=")) {
      const check = String(raw.split("=", 2)[1] || "").trim();
      if (check) {
        args.qaChecks.push(check);
      }
      continue;
    }
  }

  return args;
}

function deepMerge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return override === undefined ? base : override;
  }

  const output = { ...(base || {}) };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      output[key] = deepMerge(base[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function usage() {
  console.log(
    "Usage: node scripts/setup-project.js --repo-root /abs/path [--dev-routing fullstack_only|split] [--deploy-mode check|commit|commit_push] [--preflight hard|soft|none|snapshot] [--qa-check <cmd>]"
  );
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || "").toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function toTomlString(value) {
  return JSON.stringify(String(value));
}

function toTomlBool(value) {
  return value ? "true" : "false";
}

function toTomlInt(value) {
  return String(Number.isFinite(value) ? value : 0);
}

function toTomlArray(values) {
  const items = values.map((value) => JSON.stringify(String(value)));
  return `[${items.join(", ")}]`;
}

function main() {
  const agentsRoot = path.resolve(__dirname, "..");
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    usage();
    process.exit(0);
  }

  const defaultsPath = path.join(agentsRoot, "config.defaults.toml");
  const localPath = path.join(agentsRoot, "config.local.toml");

  const defaults = fs.existsSync(defaultsPath)
    ? parseToml(fs.readFileSync(defaultsPath, "utf8"))
    : {};
  const existingLocal = fs.existsSync(localPath)
    ? parseToml(fs.readFileSync(localPath, "utf8"))
    : {};

  const base = deepMerge(defaults, existingLocal);

  const repoRootInput = args.repoRoot || (base.paths && base.paths.repo_root) || "";
  const repoRoot = repoRootInput ? path.resolve(repoRootInput) : "";
  if (!repoRoot) {
    throw new Error("Missing repo root. Provide --repo-root /abs/path.");
  }

  const requirementsRoot = args.requirementsRoot || (base.paths && base.paths.requirements_root) || "./requirements";
  const docsDir = args.docsDir !== "" ? args.docsDir : ((base.paths && base.paths.docs_dir) || "");

  const flow = normalizeEnum(
    args.flow || (base.run_defaults && base.run_defaults.flow) || "standard",
    ["standard", "bulk", "fast"],
    "standard"
  );

  const preflight = normalizeEnum(
    args.preflight || (base.run_defaults && base.run_defaults.preflight) || "soft",
    ["hard", "soft", "none", "snapshot"],
    "soft"
  );

  const deployMode = normalizeEnum(
    args.deployMode || (base.deploy && base.deploy.mode) || "commit",
    ["check", "commit", "commit_push"],
    "commit"
  );

  const routingMode = normalizeEnum(
    args.devRoutingMode || (base.dev_routing && base.dev_routing.mode) || "fullstack_only",
    ["fullstack_only", "split"],
    "fullstack_only"
  );

  const maxReq = Number.isFinite(args.maxReq)
    ? args.maxReq
    : Number.isFinite(base.run_defaults && base.run_defaults.max_req)
      ? base.run_defaults.max_req
      : 0;

  const verbose = normalizeBool(args.verbose, normalizeBool(base.run_defaults && base.run_defaults.verbose, false));
  const detail = normalizeBool(args.detail, normalizeBool(base.run_defaults && base.run_defaults.detail, false));

  const finalPushOnSuccess = normalizeBool(
    args.finalPushOnSuccess,
    normalizeBool(base.deploy && base.deploy.final_push_on_success, true)
  );
  const requireCleanStartForCommits = normalizeBool(
    args.requireCleanStartForCommits,
    normalizeBool(base.deploy && base.deploy.require_clean_start_for_commits, true)
  );

  let useFe = args.useFe;
  let useBe = args.useBe;
  let useFs = args.useFs;

  if (routingMode === "fullstack_only") {
    useFe = typeof useFe === "boolean" ? useFe : false;
    useBe = typeof useBe === "boolean" ? useBe : false;
    useFs = typeof useFs === "boolean" ? useFs : true;
  } else {
    useFe = typeof useFe === "boolean" ? useFe : true;
    useBe = typeof useBe === "boolean" ? useBe : true;
    useFs = typeof useFs === "boolean" ? useFs : true;
  }

  if (!useFe && !useBe && !useFs) {
    throw new Error("Invalid dev agent selection: at least one of FE/BE/FS must be enabled.");
  }

  const qaChecks = args.qaChecks.length > 0
    ? args.qaChecks
    : Array.isArray(base.qa && base.qa.mandatory_checks) && base.qa.mandatory_checks.length > 0
      ? base.qa.mandatory_checks.map((x) => String(x))
      : [];

  const codex = {
    model: (base.codex && base.codex.model) || "gpt-5.3-codex",
    approval_policy: (base.codex && base.codex.approval_policy) || "never",
    sandbox_mode: (base.codex && base.codex.sandbox_mode) || "danger-full-access",
    model_reasoning_effort: (base.codex && base.codex.model_reasoning_effort) || "xhigh",
  };

  const snapshotCommitMessagePrefix =
    (base.preflight && base.preflight.snapshot_commit_message_prefix) ||
    "chore(flow): preflight snapshot";

  const content = [
    "[paths]",
    `repo_root = ${toTomlString(repoRoot)}`,
    `requirements_root = ${toTomlString(requirementsRoot)}`,
    `docs_dir = ${toTomlString(docsDir)}`,
    "",
    "[flow]",
    `default_mode = ${toTomlString((base.flow && base.flow.default_mode) || "standard")}`,
    `idle_poll_seconds = ${toTomlInt(Number.isFinite(base.flow && base.flow.idle_poll_seconds) ? base.flow.idle_poll_seconds : 300)}`,
    `max_retries = ${toTomlInt(Number.isFinite(base.flow && base.flow.max_retries) ? base.flow.max_retries : 2)}`,
    `retry_delay_seconds = ${toTomlInt(Number.isFinite(base.flow && base.flow.retry_delay_seconds) ? base.flow.retry_delay_seconds : 2)}`,
    "",
    "[run_defaults]",
    `flow = ${toTomlString(flow)}`,
    `max_req = ${toTomlInt(maxReq)}`,
    `verbose = ${toTomlBool(verbose)}`,
    `detail = ${toTomlBool(detail)}`,
    `preflight = ${toTomlString(preflight)}`,
    "",
    "[preflight]",
    `snapshot_commit_message_prefix = ${toTomlString(snapshotCommitMessagePrefix)}`,
    "",
    "[deploy]",
    `mode = ${toTomlString(deployMode)}`,
    `final_push_on_success = ${toTomlBool(finalPushOnSuccess)}`,
    `require_clean_start_for_commits = ${toTomlBool(requireCleanStartForCommits)}`,
    "",
    "[dev_routing]",
    `mode = ${toTomlString(routingMode)}`,
    `default_scope = ${toTomlString((base.dev_routing && base.dev_routing.default_scope) || "fullstack")}`,
    "",
    "[dev_agents]",
    `use_fe = ${toTomlBool(useFe)}`,
    `use_be = ${toTomlBool(useBe)}`,
    `use_fs = ${toTomlBool(useFs)}`,
    "",
    "[qa]",
    `mandatory_checks = ${toTomlArray(qaChecks)}`,
    "",
    "[codex]",
    `model = ${toTomlString(codex.model)}`,
    `approval_policy = ${toTomlString(codex.approval_policy)}`,
    `sandbox_mode = ${toTomlString(codex.sandbox_mode)}`,
    `model_reasoning_effort = ${toTomlString(codex.model_reasoning_effort)}`,
    "",
  ].join("\n");

  fs.writeFileSync(localPath, content, "utf8");

  console.log(`Wrote ${localPath}`);
  console.log(`- repo_root: ${repoRoot}`);
  console.log(`- run_defaults.flow: ${flow}`);
  console.log(`- run_defaults.preflight: ${preflight}`);
  console.log(`- deploy.mode: ${deployMode}`);
  console.log(`- dev_routing.mode: ${routingMode}`);
  console.log(`- dev_agents: fe=${useFe}, be=${useBe}, fs=${useFs}`);
  console.log("If you change dev_routing mode later, run setup-project again to realign defaults.");
}

main();
