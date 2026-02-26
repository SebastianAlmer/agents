#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { parseToml } = require("./lib/runtime");

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
    manualDownstream: undefined,
    deployMode: "",
    finalPushOnSuccess: undefined,
    requireCleanStartForCommits: undefined,
    devRoutingMode: "",
    useFe: undefined,
    useBe: undefined,
    useFs: undefined,
    bundleMinSize: undefined,
    bundleMaxSize: undefined,
    poMode: "",
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

    if (key === "--manual-downstream") {
      args.manualDownstream = true;
      continue;
    }
    if (key === "--no-manual-downstream") {
      args.manualDownstream = false;
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

    if (key === "--bundle-min-size") {
      args.bundleMinSize = parseInt(argv[++i] || "0", 10);
      continue;
    }
    if (key.startsWith("--bundle-min-size=")) {
      args.bundleMinSize = parseInt(raw.split("=", 2)[1] || "0", 10);
      continue;
    }
    if (key === "--bundle-max-size") {
      args.bundleMaxSize = parseInt(argv[++i] || "0", 10);
      continue;
    }
    if (key.startsWith("--bundle-max-size=")) {
      args.bundleMaxSize = parseInt(raw.split("=", 2)[1] || "0", 10);
      continue;
    }
    if (key === "--po-mode") {
      args.poMode = (argv[++i] || "").toLowerCase();
      continue;
    }
    if (key.startsWith("--po-mode=")) {
      args.poMode = (raw.split("=", 2)[1] || "").toLowerCase();
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
    "Usage: node setup-project.js --repo-root /abs/path [--flow full|fast|test] [--product-vision-dir /abs/path] [--po-mode vision|intake] [--bundle-min-size N --bundle-max-size N] [--dev-routing fullstack_only|split] [--deploy-mode check|commit|commit_push] [--qa-check <cmd>]"
  );
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || "").toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeReasoningEffort(value, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["low", "medium", "high", "xhigh"].includes(normalized)) {
    return normalized;
  }
  return String(fallback || "").trim().toLowerCase() || "xhigh";
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
  const agentsRoot = path.resolve(__dirname);
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
  const productVisionDir = args.productVisionDir !== ""
    ? args.productVisionDir
    : ((base.paths && base.paths.product_vision_dir) || "");

  const deliveryRunnerDefaultRaw = String(
    args.flow || (base.delivery_runner && base.delivery_runner.default_mode) || "full"
  ).toLowerCase();
  let deliveryRunnerDefault = deliveryRunnerDefaultRaw;
  if (["dev-only", "dev_only", "devonly"].includes(deliveryRunnerDefaultRaw)) {
    deliveryRunnerDefault = "fast";
  } else if (["uat", "regression", "full-test", "full_test"].includes(deliveryRunnerDefaultRaw)) {
    deliveryRunnerDefault = "test";
  } else {
    deliveryRunnerDefault = normalizeEnum(deliveryRunnerDefaultRaw, ["full", "fast", "test"], "full");
  }
  const deliveryRunnerTimeoutSeconds = Number.isFinite(
    base.delivery_runner && base.delivery_runner.agent_timeout_seconds
  )
    ? Math.max(0, base.delivery_runner.agent_timeout_seconds)
    : 1800;
  const deliveryRunnerNoOutputTimeoutSeconds = Number.isFinite(
    base.delivery_runner && base.delivery_runner.no_output_timeout_seconds
  )
    ? Math.max(0, base.delivery_runner.no_output_timeout_seconds)
    : 600;
  const deliveryRunnerMaxPausedCyclesPerItem = Number.isFinite(
    base.delivery_runner && base.delivery_runner.max_paused_cycles_per_item
  )
    ? Math.max(1, base.delivery_runner.max_paused_cycles_per_item)
    : 2;
  const retryPolicyBase = base.retry_policy && typeof base.retry_policy === "object"
    ? base.retry_policy
    : {};
  const loopPolicyBase = base.loop_policy && typeof base.loop_policy === "object"
    ? base.loop_policy
    : {};
  const deliveryQualityBase = base.delivery_quality && typeof base.delivery_quality === "object"
    ? base.delivery_quality
    : {};
  const deliveryQualityStrictGate = normalizeBool(deliveryQualityBase.strict_gate, true);
  const deliveryQualityRequireQaPass = normalizeBool(deliveryQualityBase.require_qa_pass, true);
  const deliveryQualityRequireUatPass = normalizeBool(deliveryQualityBase.require_uat_pass, true);
  const deliveryQualityRouteToDevOnFail = normalizeBool(deliveryQualityBase.route_to_dev_on_fail, true);
  const deliveryQualityMaxFixCycles = Number.isFinite(deliveryQualityBase.max_fix_cycles)
    ? Math.max(1, deliveryQualityBase.max_fix_cycles)
    : 2;
  const deliveryQualityEmitFollowupsOnFail = normalizeBool(
    deliveryQualityBase.emit_followups_on_fail,
    false
  );

  const deployMode = normalizeEnum(
    args.deployMode || (base.deploy && base.deploy.mode) || "commit_push",
    ["check", "commit", "commit_push"],
    "commit_push"
  );

  const routingMode = normalizeEnum(
    args.devRoutingMode || (base.dev_routing && base.dev_routing.mode) || "fullstack_only",
    ["fullstack_only", "split"],
    "fullstack_only"
  );

  const finalPushOnSuccess = normalizeBool(
    args.finalPushOnSuccess,
    normalizeBool(base.deploy && base.deploy.final_push_on_success, true)
  );
  const requireCleanStartForCommits = normalizeBool(
    args.requireCleanStartForCommits,
    normalizeBool(base.deploy && base.deploy.require_clean_start_for_commits, true)
  );
  const deployPrBase = (base.deploy && typeof base.deploy.pr === "object") ? base.deploy.pr : {};
  const deployPrEnabled = normalizeBool(deployPrBase.enabled, false);
  const deployPrProvider = normalizeEnum(
    deployPrBase.provider || "github",
    ["github", "gitlab"],
    "github"
  );
  const deployPrRemote = String(deployPrBase.remote || "origin").trim() || "origin";
  const deployPrBaseBranch = String(deployPrBase.base_branch || "main").trim() || "main";
  const deployPrHeadMode = normalizeEnum(
    deployPrBase.head_mode || "current",
    ["current", "fixed"],
    "current"
  );
  const deployPrHeadBranch = String(deployPrBase.head_branch || "").trim();
  const deployPrDraft = normalizeBool(deployPrBase.draft, false);
  const deployPrCreateOnlyAfterPush = normalizeBool(deployPrBase.create_only_after_push, true);
  const deployPrTitleTemplate = String(
    deployPrBase.title_template || "chore(release): ${branch} -> ${base}"
  ).trim() || "chore(release): ${branch} -> ${base}";
  const deployPrBodyTemplate = String(
    deployPrBase.body_template || "Automated PR from ${branch} to ${base} after deploy bundle."
  ).trim() || "Automated PR from ${branch} to ${base} after deploy bundle.";
  const releaseBase = (base.release_automation && typeof base.release_automation === "object")
    ? base.release_automation
    : {};
  const releaseAutomationEnabled = normalizeBool(releaseBase.enabled, true);
  const releaseAutomationBaseBranch = String(releaseBase.base_branch || "dev").trim() || "dev";
  const releaseAutomationRemote = String(releaseBase.remote || "origin").trim() || "origin";
  const releaseAutomationBranchPrefix = String(releaseBase.branch_prefix || "rb").trim() || "rb";
  const releaseAutomationVersionScope = String(releaseBase.version_scope || "root").trim().toLowerCase() || "root";
  const releaseAutomationVersionCommand = String(
    releaseBase.version_command || "npm version patch --no-git-tag-version"
  ).trim() || "npm version patch --no-git-tag-version";
  const releaseAutomationMergeMode = "ff-only";
  const releaseAutomationTagEnabled = normalizeBool(releaseBase.tag_enabled, true);
  const releaseAutomationTagPrefix = String(releaseBase.tag_prefix || "v").trim() || "v";
  const releaseAutomationAutoResolveConflicts = normalizeBool(releaseBase.auto_resolve_conflicts, true);
  const releaseAutomationMaxConflictFixAttempts = Number.isFinite(releaseBase.max_conflict_fix_attempts)
    ? Math.max(0, releaseBase.max_conflict_fix_attempts)
    : 1;
  const releaseAutomationAllowWithHumanDecision = normalizeBool(
    releaseBase.allow_release_with_human_decision_needed,
    true
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

  const baseLoops = base.loops && typeof base.loops === "object" ? base.loops : {};
  const bundleMinSize = Number.isFinite(args.bundleMinSize)
    ? Math.max(1, args.bundleMinSize)
    : Number.isFinite(baseLoops.bundle_min_size)
      ? Math.max(1, baseLoops.bundle_min_size)
      : 5;
  const bundleMaxSizeRaw = Number.isFinite(args.bundleMaxSize)
    ? Math.max(1, args.bundleMaxSize)
    : Number.isFinite(baseLoops.bundle_max_size)
      ? Math.max(1, baseLoops.bundle_max_size)
      : 20;
  const bundleMaxSize = Math.max(bundleMinSize, bundleMaxSizeRaw);
  const bundleFlowBase = base.bundle_flow && typeof base.bundle_flow === "object"
    ? base.bundle_flow
    : {};
  const bundleFlowEnabled = normalizeBool(bundleFlowBase.enabled, true);
  const bundleFlowIdPrefix = String(bundleFlowBase.id_prefix || "B").trim() || "B";
  const bundleFlowIdPad = Number.isFinite(bundleFlowBase.id_pad)
    ? Math.max(1, bundleFlowBase.id_pad)
    : 4;
  const bundleFlowMaxReadyAhead = Number.isFinite(bundleFlowBase.max_ready_ahead)
    ? Math.max(1, bundleFlowBase.max_ready_ahead)
    : 1;
  const bundleFlowEnforceSingleActiveBundle = normalizeBool(
    bundleFlowBase.enforce_single_active_bundle,
    true
  );
  const bundleFlowCarryoverTargetQueue = String(bundleFlowBase.carryover_target_queue || "refinement").trim() || "refinement";
  const bundleFlowBranchPrefix = String(bundleFlowBase.branch_prefix || "rb").trim() || "rb";
  const bundleFlowAllowCrossBundleMoves = normalizeBool(
    bundleFlowBase.allow_cross_bundle_moves,
    false
  );
  const poMode = normalizeEnum(
    args.poMode || (base.po && base.po.default_mode) || "vision",
    ["vision", "intake"],
    "vision"
  );
  const poVisionMaxCycles = Number.isFinite(base.po && base.po.vision_max_cycles)
    ? base.po.vision_max_cycles
    : 100;
  const poVisionMaxRequirements = Number.isFinite(base.po && base.po.vision_max_requirements)
    ? base.po.vision_max_requirements
    : 1000;
  const poVisionStableCycles = Number.isFinite(base.po && base.po.vision_stable_cycles)
    ? base.po.vision_stable_cycles
    : 2;
  const poIntakeMaxPerCycle = Number.isFinite(base.po && base.po.intake_max_per_cycle)
    ? base.po.intake_max_per_cycle
    : 3;
  const poIntakeLoopCooldownCycles = Number.isFinite(base.po && base.po.intake_loop_cooldown_cycles)
    ? base.po.intake_loop_cooldown_cycles
    : 3;
  const poIntakeIdempotenceEnabled = normalizeBool(
    base.po && base.po.intake_idempotence_enabled,
    true
  );
  const poBacklogPromoteEnabled = normalizeBool(
    base.po && base.po.backlog_promote_enabled,
    true
  );
  const poBacklogPromoteAfterCycles = Number.isFinite(base.po && base.po.backlog_promote_after_cycles)
    ? Math.max(1, base.po.backlog_promote_after_cycles)
    : 3;
  const poBacklogPromoteMinBusinessScore = Number.isFinite(base.po && base.po.backlog_promote_min_business_score)
    ? Math.max(0, base.po.backlog_promote_min_business_score)
    : 80;
  const poBacklogPromoteMaxPerCycle = Number.isFinite(base.po && base.po.backlog_promote_max_per_cycle)
    ? Math.max(1, base.po.backlog_promote_max_per_cycle)
    : 2;

  const baseArch = base.arch && typeof base.arch === "object" ? base.arch : {};
  const archRoutingMode = normalizeEnum(
    baseArch.routing_mode || "triggered",
    ["always", "triggered", "never"],
    "triggered"
  );
  const archRequireForScopes = Array.isArray(baseArch.require_for_scopes)
    ? baseArch.require_for_scopes.map((x) => String(x))
    : ["fullstack"];
  const archRequireForReviewRisks = Array.isArray(baseArch.require_for_review_risks)
    ? baseArch.require_for_review_risks.map((x) => String(x))
    : ["high"];
  const archRequireForReviewScopes = Array.isArray(baseArch.require_for_review_scopes)
    ? baseArch.require_for_review_scopes.map((x) => String(x))
    : ["qa_sec", "full"];
  const archTriggerFrontmatterFlags = Array.isArray(baseArch.trigger_frontmatter_flags)
    ? baseArch.trigger_frontmatter_flags.map((x) => String(x))
    : ["arch_required", "needs_arch"];
  const archTriggerKeywords = Array.isArray(baseArch.trigger_keywords)
    ? baseArch.trigger_keywords.map((x) => String(x))
    : [
        "auth",
        "authorization",
        "permission",
        "security",
        "secret",
        "token",
        "login",
        "password",
        "encryption",
        "privacy",
        "compliance",
        "gdpr",
        "pii",
        "payment",
        "billing",
        "migration",
        "schema",
        "database",
        "prisma",
        "webhook",
        "oauth",
        "rbac",
        "acl",
        "sso",
        "destructive",
      ];
  const archDigestEnabled = normalizeBool(baseArch.digest_enabled, true);
  const archDigestFile = String(baseArch.digest_file || ".runtime/arch-docs-digest.md");
  const archDigestMaxFiles = Number.isFinite(baseArch.digest_max_files) ? baseArch.digest_max_files : 12;
  const archDigestMaxHeadingsPerFile = Number.isFinite(baseArch.digest_max_headings_per_file)
    ? baseArch.digest_max_headings_per_file
    : 20;
  const archMaxRetries = Number.isFinite(baseArch.max_retries) ? baseArch.max_retries : 0;
  const baseDev = base.dev && typeof base.dev === "object" ? base.dev : {};
  const devRunTimeoutSeconds = Number.isFinite(baseDev.run_timeout_seconds)
    ? Math.max(0, baseDev.run_timeout_seconds)
    : 900;
  const devSameThreadRetries = Number.isFinite(baseDev.same_thread_retries)
    ? Math.max(0, baseDev.same_thread_retries)
    : 1;
  const devFreshThreadRetries = Number.isFinite(baseDev.fresh_thread_retries)
    ? Math.max(0, baseDev.fresh_thread_retries)
    : 1;

  const qaChecks = args.qaChecks.length > 0
    ? args.qaChecks
    : Array.isArray(base.qa && base.qa.mandatory_checks) && base.qa.mandatory_checks.length > 0
      ? base.qa.mandatory_checks.map((x) => String(x))
      : [];
  const qaRunChecksInRunner = normalizeBool(
    base.qa && base.qa.run_checks_in_runner,
    true
  );
  const qaAutoFixOnMandatoryFail = normalizeBool(
    base.qa && base.qa.auto_fix_on_mandatory_fail,
    true
  );
  const qaAutoFixMaxAttempts = Number.isFinite(base.qa && base.qa.auto_fix_max_attempts)
    ? Math.max(0, base.qa.auto_fix_max_attempts)
    : 1;
  const qaAutoFixCommands = Array.isArray(base.qa && base.qa.auto_fix_commands)
    ? base.qa.auto_fix_commands.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const qaAutoFixUseCodex = normalizeBool(
    base.qa && base.qa.auto_fix_use_codex,
    true
  );
  const baseMemory = base.memory && typeof base.memory === "object" ? base.memory : {};
  const memoryEnabled = normalizeBool(baseMemory.enabled, true);
  const memoryDir = String(baseMemory.dir || ".runtime/memory").trim() || ".runtime/memory";
  const memoryIncludeInPrompt = normalizeBool(baseMemory.include_in_prompt, true);
  const memoryUpdateOnAuto = normalizeBool(baseMemory.update_on_auto, true);
  const memoryUpdateOnInteractive = normalizeBool(baseMemory.update_on_interactive, true);
  const memorySharedFile = String(baseMemory.shared_file || "shared.md").trim() || "shared.md";
  const memoryMaxContextCharsPerFile = Number.isFinite(baseMemory.max_context_chars_per_file)
    ? Math.max(500, baseMemory.max_context_chars_per_file)
    : 4000;
  const memorySoftMaxLinesShared = Number.isFinite(baseMemory.soft_max_lines_shared)
    ? Math.max(20, baseMemory.soft_max_lines_shared)
    : 250;
  const memorySoftMaxLinesAgent = Number.isFinite(baseMemory.soft_max_lines_agent)
    ? Math.max(20, baseMemory.soft_max_lines_agent)
    : 180;

  const baseE2e = base.e2e && typeof base.e2e === "object" ? base.e2e : {};
  const e2eEnabled = normalizeBool(baseE2e.enabled, false);
  const e2eRequiredInTestMode = normalizeBool(baseE2e.required_in_test_mode, true);
  const e2eRunOnFullCompletion = normalizeBool(baseE2e.run_on_full_completion, true);
  const e2eWorkingDir = String(baseE2e.working_dir || "").trim();
  const e2eTimeoutSeconds = Number.isFinite(baseE2e.timeout_seconds)
    ? Math.max(30, baseE2e.timeout_seconds)
    : 1800;
  const e2eSetupCommands = Array.isArray(baseE2e.setup_commands)
    ? baseE2e.setup_commands.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const e2eHealthcheckCommands = Array.isArray(baseE2e.healthcheck_commands)
    ? baseE2e.healthcheck_commands.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const e2eTestCommand = String(baseE2e.test_command || "").trim();
  const e2eTeardownCommand = String(baseE2e.teardown_command || "").trim();
  const e2eEnv = Array.isArray(baseE2e.env)
    ? baseE2e.env.map((x) => String(x || "").trim()).filter(Boolean)
    : [];

  const baseModels = base.models && typeof base.models === "object" ? base.models : {};
  const modelDefaults = {
    default: "gpt-5.3-codex-spark",
    po: "gpt-5.3-codex",
    arch: "gpt-5.3-codex",
    reqeng: "gpt-5.3-codex",
    sec: "gpt-5.3-codex",
    dev_fe: "gpt-5.3-codex-spark",
    dev_be: "gpt-5.3-codex-spark",
    dev_fs: "gpt-5.3-codex-spark",
    qa: "gpt-5.3-codex-spark",
    uat: "gpt-5.3-codex-spark",
    maint: "gpt-5.3-codex-spark",
    ux: "gpt-5.3-codex-spark",
    deploy: "gpt-5.3-codex-spark",
  };

  const models = {};
  for (const [key, fallback] of Object.entries(modelDefaults)) {
    const candidate = String(baseModels[key] || "").trim();
    models[key] = candidate || fallback;
  }

  const codex = {
    model: (base.codex && base.codex.model) || models.default || "gpt-5.3-codex-spark",
    approval_policy: (base.codex && base.codex.approval_policy) || "never",
    sandbox_mode: (base.codex && base.codex.sandbox_mode) || "danger-full-access",
    model_reasoning_effort: normalizeReasoningEffort(
      base.codex && base.codex.model_reasoning_effort,
      "xhigh"
    ),
  };
  const baseReasoning =
    base.codex && base.codex.reasoning_effort && typeof base.codex.reasoning_effort === "object"
      ? base.codex.reasoning_effort
      : {};
  const reasoningKeys = [
    "default",
    "po",
    "arch",
    "reqeng",
    "sec",
    "dev_fe",
    "dev_be",
    "dev_fs",
    "qa",
    "uat",
    "maint",
    "ux",
    "deploy",
  ];
  const reasoningEffort = {};
  for (const key of reasoningKeys) {
    reasoningEffort[key] = normalizeReasoningEffort(
      baseReasoning[key],
      codex.model_reasoning_effort
    );
  }
  codex.model_reasoning_effort = reasoningEffort.default;

  const content = [
    "[paths]",
    `repo_root = ${toTomlString(repoRoot)}`,
    `requirements_root = ${toTomlString(requirementsRoot)}`,
    `docs_dir = ${toTomlString(docsDir)}`,
    `product_vision_dir = ${toTomlString(productVisionDir)}`,
    "",
    "[loops]",
    `bundle_min_size = ${toTomlInt(bundleMinSize)}`,
    `bundle_max_size = ${toTomlInt(bundleMaxSize)}`,
    `po_poll_seconds = ${toTomlInt(Number.isFinite(baseLoops.po_poll_seconds) ? baseLoops.po_poll_seconds : 20)}`,
    `delivery_poll_seconds = ${toTomlInt(Number.isFinite(baseLoops.delivery_poll_seconds) ? baseLoops.delivery_poll_seconds : 20)}`,
    `max_retries = ${toTomlInt(Number.isFinite(baseLoops.max_retries) ? baseLoops.max_retries : 3)}`,
    `retry_delay_seconds = ${toTomlInt(Number.isFinite(baseLoops.retry_delay_seconds) ? baseLoops.retry_delay_seconds : 2)}`,
    `force_underfilled_after_cycles = ${toTomlInt(Number.isFinite(baseLoops.force_underfilled_after_cycles) ? baseLoops.force_underfilled_after_cycles : 3)}`,
    "",
    "[bundle_flow]",
    `enabled = ${toTomlBool(bundleFlowEnabled)}`,
    `id_prefix = ${toTomlString(bundleFlowIdPrefix)}`,
    `id_pad = ${toTomlInt(bundleFlowIdPad)}`,
    `max_ready_ahead = ${toTomlInt(bundleFlowMaxReadyAhead)}`,
    `enforce_single_active_bundle = ${toTomlBool(bundleFlowEnforceSingleActiveBundle)}`,
    `carryover_target_queue = ${toTomlString(bundleFlowCarryoverTargetQueue)}`,
    `branch_prefix = ${toTomlString(bundleFlowBranchPrefix)}`,
    `allow_cross_bundle_moves = ${toTomlBool(bundleFlowAllowCrossBundleMoves)}`,
    "",
    "[delivery_runner]",
    `default_mode = ${toTomlString(deliveryRunnerDefault)}`,
    `agent_timeout_seconds = ${toTomlInt(deliveryRunnerTimeoutSeconds)}`,
    `no_output_timeout_seconds = ${toTomlInt(deliveryRunnerNoOutputTimeoutSeconds)}`,
    `max_paused_cycles_per_item = ${toTomlInt(deliveryRunnerMaxPausedCyclesPerItem)}`,
    "",
    "[retry_policy]",
    `arch_retry_max = ${toTomlInt(Number.isFinite(retryPolicyBase.arch_retry_max) ? Math.max(0, retryPolicyBase.arch_retry_max) : 1)}`,
    `ux_retry_max = ${toTomlInt(Number.isFinite(retryPolicyBase.ux_retry_max) ? Math.max(0, retryPolicyBase.ux_retry_max) : 0)}`,
    `sec_retry_max = ${toTomlInt(Number.isFinite(retryPolicyBase.sec_retry_max) ? Math.max(0, retryPolicyBase.sec_retry_max) : 0)}`,
    `qa_retry_max = ${toTomlInt(Number.isFinite(retryPolicyBase.qa_retry_max) ? Math.max(0, retryPolicyBase.qa_retry_max) : 1)}`,
    `uat_retry_max = ${toTomlInt(Number.isFinite(retryPolicyBase.uat_retry_max) ? Math.max(0, retryPolicyBase.uat_retry_max) : 1)}`,
    `deploy_retry_max = ${toTomlInt(Number.isFinite(retryPolicyBase.deploy_retry_max) ? Math.max(0, retryPolicyBase.deploy_retry_max) : 0)}`,
    `po_intake_retry_max = ${toTomlInt(Number.isFinite(retryPolicyBase.po_intake_retry_max) ? Math.max(0, retryPolicyBase.po_intake_retry_max) : 1)}`,
    `po_vision_retry_max = ${toTomlInt(Number.isFinite(retryPolicyBase.po_vision_retry_max) ? Math.max(0, retryPolicyBase.po_vision_retry_max) : 1)}`,
    `maint_retry_max = ${toTomlInt(Number.isFinite(retryPolicyBase.maint_retry_max) ? Math.max(0, retryPolicyBase.maint_retry_max) : 0)}`,
    `qa_post_retry_max = ${toTomlInt(Number.isFinite(retryPolicyBase.qa_post_retry_max) ? Math.max(0, retryPolicyBase.qa_post_retry_max) : 0)}`,
    `ux_final_retry_max = ${toTomlInt(Number.isFinite(retryPolicyBase.ux_final_retry_max) ? Math.max(0, retryPolicyBase.ux_final_retry_max) : 0)}`,
    `sec_final_retry_max = ${toTomlInt(Number.isFinite(retryPolicyBase.sec_final_retry_max) ? Math.max(0, retryPolicyBase.sec_final_retry_max) : 0)}`,
    `uat_full_retry_max = ${toTomlInt(Number.isFinite(retryPolicyBase.uat_full_retry_max) ? Math.max(0, retryPolicyBase.uat_full_retry_max) : 0)}`,
    "",
    "[loop_policy]",
    `loop_window_cycles = ${toTomlInt(Number.isFinite(loopPolicyBase.loop_window_cycles) ? Math.max(1, loopPolicyBase.loop_window_cycles) : 20)}`,
    `loop_threshold = ${toTomlInt(Number.isFinite(loopPolicyBase.loop_threshold) ? Math.max(2, loopPolicyBase.loop_threshold) : 3)}`,
    `max_total_attempts_per_req = ${toTomlInt(Number.isFinite(loopPolicyBase.max_total_attempts_per_req) ? Math.max(1, loopPolicyBase.max_total_attempts_per_req) : 5)}`,
    `escalate_business_loop_to_human_decision = ${toTomlBool(normalizeBool(loopPolicyBase.escalate_business_loop_to_human_decision, true))}`,
    "",
    "[delivery_quality]",
    `strict_gate = ${toTomlBool(deliveryQualityStrictGate)}`,
    `require_qa_pass = ${toTomlBool(deliveryQualityRequireQaPass)}`,
    `require_uat_pass = ${toTomlBool(deliveryQualityRequireUatPass)}`,
    `route_to_dev_on_fail = ${toTomlBool(deliveryQualityRouteToDevOnFail)}`,
    `max_fix_cycles = ${toTomlInt(deliveryQualityMaxFixCycles)}`,
    `emit_followups_on_fail = ${toTomlBool(deliveryQualityEmitFollowupsOnFail)}`,
    "",
    "[e2e]",
    `enabled = ${toTomlBool(e2eEnabled)}`,
    `required_in_test_mode = ${toTomlBool(e2eRequiredInTestMode)}`,
    `run_on_full_completion = ${toTomlBool(e2eRunOnFullCompletion)}`,
    `working_dir = ${toTomlString(e2eWorkingDir)}`,
    `timeout_seconds = ${toTomlInt(e2eTimeoutSeconds)}`,
    `setup_commands = ${toTomlArray(e2eSetupCommands)}`,
    `healthcheck_commands = ${toTomlArray(e2eHealthcheckCommands)}`,
    `test_command = ${toTomlString(e2eTestCommand)}`,
    `teardown_command = ${toTomlString(e2eTeardownCommand)}`,
    `env = ${toTomlArray(e2eEnv)}`,
    "",
    "[deploy]",
    `mode = ${toTomlString(deployMode)}`,
    `final_push_on_success = ${toTomlBool(finalPushOnSuccess)}`,
    `require_clean_start_for_commits = ${toTomlBool(requireCleanStartForCommits)}`,
    "",
    "[deploy.pr]",
    `enabled = ${toTomlBool(deployPrEnabled)}`,
    `provider = ${toTomlString(deployPrProvider)}`,
    `remote = ${toTomlString(deployPrRemote)}`,
    `base_branch = ${toTomlString(deployPrBaseBranch)}`,
    `head_mode = ${toTomlString(deployPrHeadMode)}`,
    `head_branch = ${toTomlString(deployPrHeadBranch)}`,
    `draft = ${toTomlBool(deployPrDraft)}`,
    `create_only_after_push = ${toTomlBool(deployPrCreateOnlyAfterPush)}`,
    `title_template = ${toTomlString(deployPrTitleTemplate)}`,
    `body_template = ${toTomlString(deployPrBodyTemplate)}`,
    "",
    "[release_automation]",
    `enabled = ${toTomlBool(releaseAutomationEnabled)}`,
    `base_branch = ${toTomlString(releaseAutomationBaseBranch)}`,
    `remote = ${toTomlString(releaseAutomationRemote)}`,
    `branch_prefix = ${toTomlString(releaseAutomationBranchPrefix)}`,
    `version_scope = ${toTomlString(releaseAutomationVersionScope)}`,
    `version_command = ${toTomlString(releaseAutomationVersionCommand)}`,
    `merge_mode = ${toTomlString(releaseAutomationMergeMode)}`,
    `tag_enabled = ${toTomlBool(releaseAutomationTagEnabled)}`,
    `tag_prefix = ${toTomlString(releaseAutomationTagPrefix)}`,
    `auto_resolve_conflicts = ${toTomlBool(releaseAutomationAutoResolveConflicts)}`,
    `max_conflict_fix_attempts = ${toTomlInt(releaseAutomationMaxConflictFixAttempts)}`,
    `allow_release_with_human_decision_needed = ${toTomlBool(releaseAutomationAllowWithHumanDecision)}`,
    "",
    "[po]",
    `default_mode = ${toTomlString(poMode)}`,
    `vision_max_cycles = ${toTomlInt(poVisionMaxCycles)}`,
    `vision_max_requirements = ${toTomlInt(poVisionMaxRequirements)}`,
    `vision_stable_cycles = ${toTomlInt(poVisionStableCycles)}`,
    `intake_max_per_cycle = ${toTomlInt(poIntakeMaxPerCycle)}`,
    `intake_loop_cooldown_cycles = ${toTomlInt(poIntakeLoopCooldownCycles)}`,
    `intake_idempotence_enabled = ${toTomlBool(poIntakeIdempotenceEnabled)}`,
    `backlog_promote_enabled = ${toTomlBool(poBacklogPromoteEnabled)}`,
    `backlog_promote_after_cycles = ${toTomlInt(poBacklogPromoteAfterCycles)}`,
    `backlog_promote_min_business_score = ${toTomlInt(poBacklogPromoteMinBusinessScore)}`,
    `backlog_promote_max_per_cycle = ${toTomlInt(poBacklogPromoteMaxPerCycle)}`,
    "",
    "[arch]",
    `routing_mode = ${toTomlString(archRoutingMode)}`,
    `require_for_scopes = ${toTomlArray(archRequireForScopes)}`,
    `require_for_review_risks = ${toTomlArray(archRequireForReviewRisks)}`,
    `require_for_review_scopes = ${toTomlArray(archRequireForReviewScopes)}`,
    `trigger_frontmatter_flags = ${toTomlArray(archTriggerFrontmatterFlags)}`,
    `trigger_keywords = ${toTomlArray(archTriggerKeywords)}`,
    `digest_enabled = ${toTomlBool(archDigestEnabled)}`,
    `digest_file = ${toTomlString(archDigestFile)}`,
    `digest_max_files = ${toTomlInt(archDigestMaxFiles)}`,
    `digest_max_headings_per_file = ${toTomlInt(archDigestMaxHeadingsPerFile)}`,
    `max_retries = ${toTomlInt(archMaxRetries)}`,
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
    "[dev]",
    `run_timeout_seconds = ${toTomlInt(devRunTimeoutSeconds)}`,
    `same_thread_retries = ${toTomlInt(devSameThreadRetries)}`,
    `fresh_thread_retries = ${toTomlInt(devFreshThreadRetries)}`,
    "",
    "[qa]",
    `mandatory_checks = ${toTomlArray(qaChecks)}`,
    `run_checks_in_runner = ${toTomlBool(qaRunChecksInRunner)}`,
    `auto_fix_on_mandatory_fail = ${toTomlBool(qaAutoFixOnMandatoryFail)}`,
    `auto_fix_max_attempts = ${toTomlInt(qaAutoFixMaxAttempts)}`,
    `auto_fix_commands = ${toTomlArray(qaAutoFixCommands)}`,
    `auto_fix_use_codex = ${toTomlBool(qaAutoFixUseCodex)}`,
    "",
    "[memory]",
    `enabled = ${toTomlBool(memoryEnabled)}`,
    `dir = ${toTomlString(memoryDir)}`,
    `include_in_prompt = ${toTomlBool(memoryIncludeInPrompt)}`,
    `update_on_auto = ${toTomlBool(memoryUpdateOnAuto)}`,
    `update_on_interactive = ${toTomlBool(memoryUpdateOnInteractive)}`,
    `shared_file = ${toTomlString(memorySharedFile)}`,
    `max_context_chars_per_file = ${toTomlInt(memoryMaxContextCharsPerFile)}`,
    `soft_max_lines_shared = ${toTomlInt(memorySoftMaxLinesShared)}`,
    `soft_max_lines_agent = ${toTomlInt(memorySoftMaxLinesAgent)}`,
    "",
    "[models]",
    `default = ${toTomlString(models.default)}`,
    `po = ${toTomlString(models.po)}`,
    `arch = ${toTomlString(models.arch)}`,
    `reqeng = ${toTomlString(models.reqeng)}`,
    `sec = ${toTomlString(models.sec)}`,
    `dev_fe = ${toTomlString(models.dev_fe)}`,
    `dev_be = ${toTomlString(models.dev_be)}`,
    `dev_fs = ${toTomlString(models.dev_fs)}`,
    `qa = ${toTomlString(models.qa)}`,
    `uat = ${toTomlString(models.uat)}`,
    `maint = ${toTomlString(models.maint)}`,
    `ux = ${toTomlString(models.ux)}`,
    `deploy = ${toTomlString(models.deploy)}`,
    "",
    "[codex]",
    `model = ${toTomlString(codex.model)}`,
    `approval_policy = ${toTomlString(codex.approval_policy)}`,
    `sandbox_mode = ${toTomlString(codex.sandbox_mode)}`,
    `model_reasoning_effort = ${toTomlString(codex.model_reasoning_effort)}`,
    "",
    "[codex.reasoning_effort]",
    `default = ${toTomlString(reasoningEffort.default)}`,
    `po = ${toTomlString(reasoningEffort.po)}`,
    `arch = ${toTomlString(reasoningEffort.arch)}`,
    `reqeng = ${toTomlString(reasoningEffort.reqeng)}`,
    `sec = ${toTomlString(reasoningEffort.sec)}`,
    `dev_fe = ${toTomlString(reasoningEffort.dev_fe)}`,
    `dev_be = ${toTomlString(reasoningEffort.dev_be)}`,
    `dev_fs = ${toTomlString(reasoningEffort.dev_fs)}`,
    `qa = ${toTomlString(reasoningEffort.qa)}`,
    `uat = ${toTomlString(reasoningEffort.uat)}`,
    `maint = ${toTomlString(reasoningEffort.maint)}`,
    `ux = ${toTomlString(reasoningEffort.ux)}`,
    `deploy = ${toTomlString(reasoningEffort.deploy)}`,
    "",
  ].join("\n");

  fs.writeFileSync(localPath, content, "utf8");

  console.log(`Wrote ${localPath}`);
  console.log(`- repo_root: ${repoRoot}`);
  console.log(`- product_vision_dir: ${productVisionDir || "<default>"}`);
  console.log(`- loops.bundle_min_size: ${bundleMinSize}`);
  console.log(`- loops.bundle_max_size: ${bundleMaxSize}`);
  console.log(`- bundle_flow: enabled=${bundleFlowEnabled} id_prefix=${bundleFlowIdPrefix} id_pad=${bundleFlowIdPad} max_ready_ahead=${bundleFlowMaxReadyAhead} carryover_target_queue=${bundleFlowCarryoverTargetQueue} branch_prefix=${bundleFlowBranchPrefix} allow_cross_bundle_moves=${bundleFlowAllowCrossBundleMoves}`);
  console.log(`- delivery_runner: mode=${deliveryRunnerDefault} agent_timeout_seconds=${deliveryRunnerTimeoutSeconds} no_output_timeout_seconds=${deliveryRunnerNoOutputTimeoutSeconds} max_paused_cycles_per_item=${deliveryRunnerMaxPausedCyclesPerItem}`);
  console.log(`- delivery_quality: strict=${deliveryQualityStrictGate} qa_pass=${deliveryQualityRequireQaPass} uat_pass=${deliveryQualityRequireUatPass} route_to_dev=${deliveryQualityRouteToDevOnFail} max_fix_cycles=${deliveryQualityMaxFixCycles} emit_followups_on_fail=${deliveryQualityEmitFollowupsOnFail}`);
  console.log(`- qa autofix: enabled=${qaAutoFixOnMandatoryFail} max_attempts=${qaAutoFixMaxAttempts} shell_cmds=${qaAutoFixCommands.length} codex=${qaAutoFixUseCodex}`);
  console.log(`- memory: enabled=${memoryEnabled} dir=${memoryDir} include_in_prompt=${memoryIncludeInPrompt} update_on_auto=${memoryUpdateOnAuto} update_on_interactive=${memoryUpdateOnInteractive}`);
  console.log(`- e2e: enabled=${e2eEnabled} required_in_test_mode=${e2eRequiredInTestMode} run_on_full_completion=${e2eRunOnFullCompletion} timeout=${e2eTimeoutSeconds}s`);
  console.log(`- deploy.mode: ${deployMode}`);
  console.log(`- release_automation: enabled=${releaseAutomationEnabled} base=${releaseAutomationBaseBranch} remote=${releaseAutomationRemote} merge=${releaseAutomationMergeMode} tag=${releaseAutomationTagEnabled}`);
  console.log(`- po.default_mode: ${poMode} (intake_max_per_cycle=${poIntakeMaxPerCycle}, cooldown=${poIntakeLoopCooldownCycles}, idempotence=${poIntakeIdempotenceEnabled}, backlog_promote_enabled=${poBacklogPromoteEnabled}, backlog_promote_after_cycles=${poBacklogPromoteAfterCycles}, backlog_promote_min_business_score=${poBacklogPromoteMinBusinessScore}, backlog_promote_max_per_cycle=${poBacklogPromoteMaxPerCycle})`);
  console.log(`- arch.routing_mode: ${archRoutingMode}`);
  console.log(`- dev_routing.mode: ${routingMode}`);
  console.log(`- dev_agents: fe=${useFe}, be=${useBe}, fs=${useFs}`);
  console.log(`- dev watchdog: timeout=${devRunTimeoutSeconds}s same_thread_retries=${devSameThreadRetries} fresh_thread_retries=${devFreshThreadRetries}`);
  console.log(`- models: po=${models.po}, arch=${models.arch}, reqeng=${models.reqeng}, sec=${models.sec}, dev_fe=${models.dev_fe}, dev_be=${models.dev_be}, dev_fs=${models.dev_fs}, qa=${models.qa}, uat=${models.uat}, maint=${models.maint}, ux=${models.ux}, deploy=${models.deploy}`);
  console.log("If you change dev_routing mode later, run setup-project again to realign defaults.");
}

main();
