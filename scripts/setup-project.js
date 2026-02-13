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
    productVisionDir: "",
    flow: "",
    maxReq: undefined,
    verbose: undefined,
    detail: undefined,
    preflight: "",
    deployMode: "",
    devRoutingMode: "",
    useFe: undefined,
    useBe: undefined,
    useFs: undefined,
    qaChecks: [],
    windowSize: undefined,
    poPollSeconds: undefined,
    opsPollSeconds: undefined,
    loopMaxRetries: undefined,
    loopRetryDelay: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const key = String(raw || "").toLowerCase();

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

    if (key === "--product-vision-dir") {
      args.productVisionDir = argv[++i] || "";
      continue;
    }
    if (key.startsWith("--product-vision-dir=")) {
      args.productVisionDir = raw.split("=", 2)[1] || "";
      continue;
    }

    if (key === "--flow") {
      args.flow = (argv[++i] || "").toLowerCase();
      continue;
    }
    if (key.startsWith("--flow=")) {
      args.flow = String(raw.split("=", 2)[1] || "").toLowerCase();
      continue;
    }

    if (key === "--max-req") {
      args.maxReq = parseInt(argv[++i] || "", 10);
      continue;
    }
    if (key.startsWith("--max-req=")) {
      args.maxReq = parseInt(String(raw.split("=", 2)[1] || ""), 10);
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
      args.preflight = String(raw.split("=", 2)[1] || "").toLowerCase();
      continue;
    }

    if (key === "--deploy-mode") {
      args.deployMode = (argv[++i] || "").toLowerCase();
      continue;
    }
    if (key.startsWith("--deploy-mode=")) {
      args.deployMode = String(raw.split("=", 2)[1] || "").toLowerCase();
      continue;
    }

    if (key === "--dev-routing") {
      args.devRoutingMode = (argv[++i] || "").toLowerCase();
      continue;
    }
    if (key.startsWith("--dev-routing=")) {
      args.devRoutingMode = String(raw.split("=", 2)[1] || "").toLowerCase();
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

    if (key === "--window-size") {
      args.windowSize = parseInt(argv[++i] || "", 10);
      continue;
    }
    if (key.startsWith("--window-size=")) {
      args.windowSize = parseInt(String(raw.split("=", 2)[1] || ""), 10);
      continue;
    }

    if (key === "--po-poll-seconds") {
      args.poPollSeconds = parseInt(argv[++i] || "", 10);
      continue;
    }
    if (key.startsWith("--po-poll-seconds=")) {
      args.poPollSeconds = parseInt(String(raw.split("=", 2)[1] || ""), 10);
      continue;
    }

    if (key === "--ops-poll-seconds") {
      args.opsPollSeconds = parseInt(argv[++i] || "", 10);
      continue;
    }
    if (key.startsWith("--ops-poll-seconds=")) {
      args.opsPollSeconds = parseInt(String(raw.split("=", 2)[1] || ""), 10);
      continue;
    }

    if (key === "--max-retries") {
      args.loopMaxRetries = parseInt(argv[++i] || "", 10);
      continue;
    }
    if (key.startsWith("--max-retries=")) {
      args.loopMaxRetries = parseInt(String(raw.split("=", 2)[1] || ""), 10);
      continue;
    }

    if (key === "--retry-delay-seconds") {
      args.loopRetryDelay = parseInt(argv[++i] || "", 10);
      continue;
    }
    if (key.startsWith("--retry-delay-seconds=")) {
      args.loopRetryDelay = parseInt(String(raw.split("=", 2)[1] || ""), 10);
      continue;
    }
  }

  return args;
}

function usage() {
  console.log(
    "Usage: node scripts/setup-project.js --repo-root /abs/path " +
      "[--flow auto|standard|dev-only] [--preflight hard|soft|none|snapshot] " +
      "[--deploy-mode check|commit|commit_push] [--dev-routing fullstack_only|split] " +
      "[--product-vision-dir /abs/path/to/docs/product-operating-system] " +
      "[--window-size 2-4] [--po-poll-seconds N] [--ops-poll-seconds N] " +
      "[--max-retries N] [--retry-delay-seconds N] [--qa-check <cmd>]"
  );
}

function parseEnum(value, allowed, fallback) {
  const normalized = String(value || "").toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function parseFlowMode(value, fallback = "standard") {
  const normalized = String(value || fallback || "").toLowerCase();
  if (normalized === "auto") {
    return "auto";
  }
  if (["dev-only", "dev_only", "devonly"].includes(normalized)) {
    return "dev-only";
  }
  return "standard";
}

function parseBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function clampNumber(value, fallback, min, max) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (typeof min === "number" && value < min) {
    return min;
  }
  if (typeof max === "number" && value > max) {
    return max;
  }
  return value;
}

function toTomlString(value) {
  return JSON.stringify(String(value));
}

function toTomlBool(value) {
  return value ? "true" : "false";
}

function toTomlInt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : "0";
}

function toTomlArray(values) {
  const normalized = Array.isArray(values) ? values : [];
  return `[${normalized.map((value) => JSON.stringify(String(value))).join(", ")}]`;
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
  const existing = fs.existsSync(localPath)
    ? parseToml(fs.readFileSync(localPath, "utf8"))
    : {};
  const merged = { ...defaults, ...existing, paths: { ...defaults.paths, ...(existing.paths || {}) } };

  const repoRootInput = args.repoRoot || (merged.paths && merged.paths.repo_root) || "";
  const repoRoot = repoRootInput ? path.resolve(repoRootInput) : "";
  if (!repoRoot) {
    throw new Error("Missing repo_root. Use --repo-root /absolute/path.");
  }

  const requirementsRoot = path.resolve(merged.paths && merged.paths.requirements_root
    ? merged.paths.requirements_root
    : path.join(repoRoot, "requirements")
  );
  const docsDir = args.docsDir !== ""
    ? args.docsDir
    : (merged.paths && merged.paths.docs_dir) || path.join(repoRoot, "docs");
  const productVisionDir = args.productVisionDir !== ""
    ? args.productVisionDir
    : (merged.paths && merged.paths.product_vision_dir) || path.join(docsDir, "product-operating-system");

  const flow = parseFlowMode(
    args.flow || (merged.run_defaults && merged.run_defaults.flow) || "standard",
    "standard"
  );
  const preflight = parseEnum(
    args.preflight || (merged.run_defaults && merged.run_defaults.preflight) || "soft",
    ["hard", "soft", "none", "snapshot"],
    "soft"
  );
  const deployMode = parseEnum(
    args.deployMode || (merged.deploy && merged.deploy.mode) || "commit",
    ["check", "commit", "commit_push"],
    "commit"
  );

  const poDefaultMode = parseEnum(
    (merged.po && merged.po.default_mode) || "intake",
    ["intake", "vision"],
    "intake"
  );
  const poVisionMaxCycles = clampNumber(
    Number.parseInt((merged.po && merged.po.vision_max_cycles), 10),
    100,
    1,
    100000
  );
  const poVisionMaxRequirements = clampNumber(
    Number.parseInt((merged.po && merged.po.vision_max_requirements), 10),
    1000,
    1,
    100000
  );
  const poVisionStableCycles = clampNumber(
    Number.parseInt((merged.po && merged.po.vision_stable_cycles), 10),
    2,
    1,
    1000
  );
  const routingMode = parseEnum(
    args.devRoutingMode || (merged.dev_routing && merged.dev_routing.mode) || "fullstack_only",
    ["fullstack_only", "split"],
    "fullstack_only"
  );

  const maxReq = Number.isFinite(args.maxReq)
    ? args.maxReq
    : Number.parseInt((merged.run_defaults && merged.run_defaults.max_req) || 0, 10) || 0;

  const verbose = parseBool(args.verbose, !!(merged.run_defaults && merged.run_defaults.verbose));
  const detail = parseBool(args.detail, !!(merged.run_defaults && merged.run_defaults.detail));

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
    throw new Error("Invalid dev-agent selection. At least one of FE, BE, FS must be enabled.");
  }

  const defaultQaChecks = Array.isArray(merged.qa && merged.qa.mandatory_checks)
    ? merged.qa.mandatory_checks
    : [];
  const qaChecks = args.qaChecks.length > 0
    ? args.qaChecks
    : defaultQaChecks.map((x) => String(x));

  const windowSize = clampNumber(Number.parseInt(args.windowSize || (merged.loops && merged.loops.window_size), 10), 3, 2, 4);
  const poPollSeconds = clampNumber(
    Number.parseInt(args.poPollSeconds || (merged.loops && merged.loops.po_poll_seconds), 10),
    20,
    1,
    3600
  );
  const opsPollSeconds = clampNumber(
    Number.parseInt(args.opsPollSeconds || (merged.loops && merged.loops.ops_poll_seconds), 10),
    20,
    1,
    3600
  );
  const loopMaxRetries = clampNumber(
    Number.parseInt(args.loopMaxRetries || (merged.loops && merged.loops.max_retries), 10),
    2,
    0,
    20
  );
  const loopRetryDelay = clampNumber(
    Number.parseInt(args.loopRetryDelay || (merged.loops && merged.loops.retry_delay_seconds), 10),
    2,
    0,
    120
  );

  const baseModels = merged.models && typeof merged.models === "object" ? merged.models : {};
  const modelDefaults = {
    default: "gpt-5.3-codex-spark",
    reqeng: "gpt-5.3-codex-spark",
    po: "gpt-5.3-codex",
    arch: "gpt-5.3-codex",
    sec: "gpt-5.3-codex",
    dev_fe: "gpt-5.3-codex-spark",
    dev_be: "gpt-5.3-codex-spark",
    dev_fs: "gpt-5.3-codex-spark",
    qa: "gpt-5.3-codex-spark",
    ux: "gpt-5.3-codex-spark",
    deploy: "gpt-5.3-codex-spark",
  };

  const models = {};
  for (const [key, fallback] of Object.entries(modelDefaults)) {
    const configured = String(baseModels[key] || "").trim();
    models[key] = configured || fallback;
  }

  const codex = {
    model: (merged.codex && merged.codex.model) || models.default || "gpt-5.3-codex-spark",
    approval_policy: (merged.codex && merged.codex.approval_policy) || "never",
    sandbox_mode: (merged.codex && merged.codex.sandbox_mode) || "danger-full-access",
    model_reasoning_effort: (merged.codex && merged.codex.model_reasoning_effort) || "xhigh",
  };

  const snapshotCommitMessagePrefix =
    (merged.preflight && merged.preflight.snapshot_commit_message_prefix) ||
    "chore(flow): preflight snapshot";

  const content = [
    "[paths]",
    `repo_root = ${toTomlString(repoRoot)}`,
    `requirements_root = ${toTomlString(requirementsRoot)}`,
    `docs_dir = ${toTomlString(docsDir)}`,
    `product_vision_dir = ${toTomlString(productVisionDir)}`,
    "",
    "[loops]",
    `window_size = ${toTomlInt(windowSize)}`,
    `po_poll_seconds = ${toTomlInt(poPollSeconds)}`,
    `ops_poll_seconds = ${toTomlInt(opsPollSeconds)}`,
    `max_retries = ${toTomlInt(loopMaxRetries)}`,
    `retry_delay_seconds = ${toTomlInt(loopRetryDelay)}`,
    "",
    "[flow]",
    `default_mode = ${toTomlString(parseFlowMode((merged.flow && merged.flow.default_mode) || "standard", "standard"))}`,
    `idle_poll_seconds = ${toTomlInt(Number.isFinite((merged.flow && merged.flow.idle_poll_seconds)) ? merged.flow.idle_poll_seconds : 300)}`,
    `max_retries = ${toTomlInt(Number.isFinite((merged.flow && merged.flow.max_retries)) ? merged.flow.max_retries : 2)}`,
    `retry_delay_seconds = ${toTomlInt(Number.isFinite((merged.flow && merged.flow.retry_delay_seconds)) ? merged.flow.retry_delay_seconds : 2)}`,
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
    `final_push_on_success = ${toTomlBool(!!(merged.deploy && merged.deploy.final_push_on_success !== false))}`,
    `require_clean_start_for_commits = ${toTomlBool(!!(merged.deploy && merged.deploy.require_clean_start_for_commits !== false))}`,
    "",
    "[po]",
    `default_mode = ${toTomlString(poDefaultMode)}`,
    `vision_max_cycles = ${toTomlInt(poVisionMaxCycles)}`,
    `vision_max_requirements = ${toTomlInt(poVisionMaxRequirements)}`,
    `vision_stable_cycles = ${toTomlInt(poVisionStableCycles)}`,
    "",
    "[dev_routing]",
    `mode = ${toTomlString(routingMode)}`,
    `default_scope = ${toTomlString((merged.dev_routing && merged.dev_routing.default_scope) || "fullstack")}`,
    "",
    "[dev_agents]",
    `use_fe = ${toTomlBool(useFe)}`,
    `use_be = ${toTomlBool(useBe)}`,
    `use_fs = ${toTomlBool(useFs)}`,
    "",
    "[qa]",
    `mandatory_checks = ${toTomlArray(qaChecks)}`,
    "",
    "[models]",
    `default = ${toTomlString(models.default)}`,
    `reqeng = ${toTomlString(models.reqeng)}`,
    `po = ${toTomlString(models.po)}`,
    `arch = ${toTomlString(models.arch)}`,
    `sec = ${toTomlString(models.sec)}`,
    `dev_fe = ${toTomlString(models.dev_fe)}`,
    `dev_be = ${toTomlString(models.dev_be)}`,
    `dev_fs = ${toTomlString(models.dev_fs)}`,
    `qa = ${toTomlString(models.qa)}`,
    `ux = ${toTomlString(models.ux)}`,
    `deploy = ${toTomlString(models.deploy)}`,
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
  console.log(`- product_vision_dir: ${productVisionDir}`);
  console.log(`- run_defaults.flow: ${flow}`);
  console.log(`- run_defaults.preflight: ${preflight}`);
  console.log(`- loops.window_size: ${windowSize}`);
  console.log(`- loops.po_poll_seconds: ${poPollSeconds}`);
  console.log(`- loops.ops_poll_seconds: ${opsPollSeconds}`);
  console.log(`- loops.max_retries: ${loopMaxRetries}`);
  console.log(`- loops.retry_delay_seconds: ${loopRetryDelay}`);
  console.log(`- deploy.mode: ${deployMode}`);
  console.log(`- po.default_mode: ${poDefaultMode}`);
  console.log(`- po.vision_max_cycles: ${poVisionMaxCycles}`);
  console.log(`- po.vision_max_requirements: ${poVisionMaxRequirements}`);
  console.log(`- po.vision_stable_cycles: ${poVisionStableCycles}`);
  console.log(`- dev_routing.mode: ${routingMode}`);
  console.log(`- dev_agents: fe=${useFe}, be=${useBe}, fs=${useFs}`);
  console.log(`- models: reqeng=${models.reqeng}, po=${models.po}, arch=${models.arch}, sec=${models.sec}, dev_fe=${models.dev_fe}, dev_be=${models.dev_be}, dev_fs=${models.dev_fs}, qa=${models.qa}, ux=${models.ux}, deploy=${models.deploy}`);
}

main();
