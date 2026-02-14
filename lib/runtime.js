"use strict";

const fs = require("fs");
const path = require("path");
const { ensureDir } = require("./agent");

const DEFAULTS = {
  paths: {
    repo_root: "",
    requirements_root: "./requirements",
    docs_dir: "",
    product_vision_dir: "",
  },
  loops: {
    bundle_min_size: 5,
    bundle_max_size: 20,
    po_poll_seconds: 20,
    delivery_poll_seconds: 20,
    max_retries: 3,
    retry_delay_seconds: 2,
    force_underfilled_after_cycles: 3,
  },
  flow: {
    default_mode: "standard",
    idle_poll_seconds: 300,
    max_retries: 3,
    retry_delay_seconds: 2,
  },
  run_defaults: {
    flow: "standard",
    max_req: 0,
    verbose: false,
    detail: false,
    preflight: "soft",
    manual_downstream: false,
  },
  preflight: {
    snapshot_commit_message_prefix: "chore(flow): preflight snapshot",
  },
  deploy: {
    mode: "commit_push",
    final_push_on_success: true,
    require_clean_start_for_commits: true,
    pr: {
      enabled: false,
      provider: "github",
      remote: "origin",
      base_branch: "main",
      head_mode: "current",
      head_branch: "",
      draft: false,
      create_only_after_push: true,
      title_template: "chore(release): ${branch} -> ${base}",
      body_template: "Automated PR from ${branch} to ${base} after deploy bundle.",
    },
  },
  po: {
    default_mode: "vision",
    vision_max_cycles: 100,
    vision_max_requirements: 1000,
    vision_stable_cycles: 2,
    selected_low_watermark: 1,
    selected_high_watermark: 3,
    intake_max_per_cycle: 3,
    intake_loop_cooldown_cycles: 3,
    intake_idempotence_enabled: true,
  },
  arch: {
    routing_mode: "triggered",
    require_for_scopes: ["fullstack"],
    require_for_review_risks: ["high"],
    require_for_review_scopes: ["qa_sec", "full"],
    trigger_keywords: [
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
    ],
    trigger_frontmatter_flags: ["arch_required", "needs_arch"],
    digest_enabled: true,
    digest_file: ".runtime/arch-docs-digest.md",
    digest_max_files: 12,
    digest_max_headings_per_file: 20,
    max_retries: 0,
  },
  dev_routing: {
    mode: "fullstack_only",
    default_scope: "fullstack",
  },
  dev_agents: {
    use_fe: false,
    use_be: false,
    use_fs: true,
  },
  qa: {
    mandatory_checks: [],
  },
  review: {
    strategy: "bundle",
    parallel: false,
    default_risk: "low",
    medium_scope_policy: "single_specialist",
  },
  models: {
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
  },
  codex: {
    model: "gpt-5.3-codex-spark",
    approval_policy: "never",
    sandbox_mode: "danger-full-access",
    model_reasoning_effort: "xhigh",
  },
};

function stripInlineComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === "\"" && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === "#" && !inSingle && !inDouble) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseString(raw) {
  const value = raw.trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const inner = value.slice(1, -1);
    if (value.startsWith("\"")) {
      return inner
        .replace(/\\\\/g, "\\")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\\"/g, "\"");
    }
    return inner;
  }
  return value;
}

function parseValue(raw) {
  const value = raw.trim();
  if (!value) {
    return "";
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    const parts = inner.split(",").map((part) => part.trim()).filter(Boolean);
    return parts.map(parseValue);
  }
  return parseString(value);
}

function ensureObjectPath(root, keyPath) {
  const parts = keyPath.split(".").map((part) => part.trim()).filter(Boolean);
  let node = root;
  for (const part of parts) {
    if (!Object.prototype.hasOwnProperty.call(node, part) || typeof node[part] !== "object") {
      node[part] = {};
    }
    node = node[part];
  }
  return node;
}

function parseToml(content) {
  const result = {};
  let sectionPath = "";

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const withoutComment = stripInlineComment(line).trim();
    if (!withoutComment) {
      continue;
    }

    const sectionMatch = withoutComment.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (sectionMatch) {
      sectionPath = sectionMatch[1];
      ensureObjectPath(result, sectionPath);
      continue;
    }

    const eqIndex = withoutComment.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = withoutComment.slice(0, eqIndex).trim();
    const rawValue = withoutComment.slice(eqIndex + 1).trim();
    if (!key) {
      continue;
    }

    const target = sectionPath ? ensureObjectPath(result, sectionPath) : result;
    target[key] = parseValue(rawValue);
  }

  return result;
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

function resolvePathValue(rawValue, baseDir) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }
  if (path.isAbsolute(value)) {
    return path.normalize(value);
  }
  return path.resolve(baseDir, value);
}

function listMarkdownFiles(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function selectFirstExistingFile(candidates, fallbackPath) {
  for (const candidate of candidates || []) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return fallbackPath;
}

function tomlScalar(value) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return JSON.stringify(String(value));
}

function writeCodexConfigFile({ agentsRoot, codex, fileName }) {
  const runtimeDir = path.join(agentsRoot, ".runtime");
  ensureDir(runtimeDir);
  const target = path.join(runtimeDir, fileName || "codex.generated.toml");
  const keys = Object.keys(codex || {}).sort();
  const lines = keys.map((key) => `${key} = ${tomlScalar(codex[key])}`);
  fs.writeFileSync(target, lines.join("\n") + "\n", "utf8");
  return target;
}

const AGENT_MODEL_ALIASES = {
  PO: ["po"],
  ARCH: ["arch"],
  DEV_FE: ["dev_fe", "devfe", "frontend", "dev"],
  DEV_BE: ["dev_be", "devbe", "backend", "dev"],
  DEV_FS: ["dev_fs", "devfs", "fullstack", "dev"],
  QA: ["qa"],
  UAT: ["uat", "acceptance", "user_acceptance"],
  MAINT: ["maint", "hygiene", "cleanup"],
  SEC: ["sec", "security"],
  UX: ["ux"],
  DEPLOY: ["deploy", "release"],
  REQENG: ["reqeng", "requirements", "requirements_engineer"],
};

function normalizeAgentLabel(agentLabel) {
  return String(agentLabel || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeModelName(value, fallback) {
  const model = String(value || "").trim();
  if (model) {
    return model;
  }
  return String(fallback || "").trim();
}

function resolveCodexModels({ rawModels, fallbackModel }) {
  const map = {};
  if (rawModels && typeof rawModels === "object") {
    for (const [key, value] of Object.entries(rawModels)) {
      map[String(key).toLowerCase()] = String(value || "").trim();
    }
  }

  const defaultModel = normalizeModelName(
    map.default || map.all || map.fallback,
    fallbackModel
  );

  function pickModel(keys) {
    for (const key of keys) {
      const candidate = normalizeModelName(map[String(key).toLowerCase()], "");
      if (candidate) {
        return candidate;
      }
    }
    return defaultModel;
  }

  const byAgent = {};
  for (const [agent, aliases] of Object.entries(AGENT_MODEL_ALIASES)) {
    byAgent[agent] = pickModel(aliases);
  }

  return {
    defaultModel,
    byAgent,
  };
}

function getQueues(requirementsRoot) {
  return {
    refinement: path.join(requirementsRoot, "refinement"),
    backlog: path.join(requirementsRoot, "backlog"),
    selected: path.join(requirementsRoot, "selected"),
    arch: path.join(requirementsRoot, "arch"),
    dev: path.join(requirementsRoot, "dev"),
    qa: path.join(requirementsRoot, "qa"),
    sec: path.join(requirementsRoot, "sec"),
    ux: path.join(requirementsRoot, "ux"),
    deploy: path.join(requirementsRoot, "deploy"),
    released: path.join(requirementsRoot, "released"),
    toClarify: path.join(requirementsRoot, "to-clarify"),
    humanDecisionNeeded: path.join(requirementsRoot, "human-decision-needed"),
    humanInput: path.join(requirementsRoot, "human-input"),
    blocked: path.join(requirementsRoot, "blocked"),
    wontDo: path.join(requirementsRoot, "wont-do"),
  };
}

function ensureQueueDirs(queueMap) {
  for (const dir of Object.values(queueMap)) {
    ensureDir(dir);
  }
}

function toBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

function toInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeFlow(value, fallback) {
  const normalized = String(value || fallback || "").toLowerCase();
  return ["standard", "dev-only", "auto"].includes(normalized)
    ? normalized
    : fallback;
}

function normalizePreflightMode(value, fallback) {
  const normalized = String(value || fallback || "").toLowerCase();
  return ["hard", "soft", "none", "snapshot"].includes(normalized) ? normalized : fallback;
}

function normalizeDevRoutingMode(value, fallback) {
  const normalized = String(value || fallback || "").toLowerCase();
  return ["fullstack_only", "split"].includes(normalized) ? normalized : fallback;
}

function normalizeScope(value, fallback) {
  const normalized = String(value || fallback || "").toLowerCase();
  if (["frontend", "backend", "fullstack"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizePoMode(value, fallback) {
  const normalized = String(value || fallback || "").toLowerCase();
  if (["vision", "product-vision", "pos"].includes(normalized)) {
    return "vision";
  }
  return "intake";
}

function clamp(value, min, max, fallback = min) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

function normalizeChecks(value, fallback) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const checks = value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return checks.length > 0 ? checks : fallback;
}

function normalizeStringArray(value, fallback) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const normalized = value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeArchRoutingMode(value, fallback) {
  const normalized = String(value || fallback || "").toLowerCase();
  return ["always", "triggered", "never"].includes(normalized) ? normalized : fallback;
}

function normalizeReviewStrategy(value, fallback) {
  const normalized = String(value || fallback || "").toLowerCase();
  return ["bundle", "classic"].includes(normalized) ? normalized : fallback;
}

function normalizeRisk(value, fallback) {
  const normalized = String(value || fallback || "").toLowerCase();
  if (["low", "medium", "high"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeMediumScopePolicy(value, fallback) {
  const normalized = String(value || fallback || "").toLowerCase();
  return ["single_specialist", "full"].includes(normalized) ? normalized : fallback;
}

function loadRuntimeConfig(agentsRoot) {
  const defaultsPath = path.join(agentsRoot, "config.defaults.toml");
  const explicitLocalPath = process.env.AGENTS_CONFIG;
  const localPath = explicitLocalPath
    ? path.resolve(explicitLocalPath)
    : path.join(agentsRoot, "config.local.toml");

  const defaults = fs.existsSync(defaultsPath)
    ? parseToml(fs.readFileSync(defaultsPath, "utf8"))
    : {};
  const local = fs.existsSync(localPath)
    ? parseToml(fs.readFileSync(localPath, "utf8"))
    : {};

  const merged = deepMerge(DEFAULTS, deepMerge(defaults, local));

  const configBaseDir = fs.existsSync(localPath) ? path.dirname(localPath) : agentsRoot;
  const repoRoot = resolvePathValue(merged.paths && merged.paths.repo_root, configBaseDir);
  if (!repoRoot) {
    throw new Error(
      `Missing paths.repo_root in ${localPath}. Create config.local.toml from config.local.example.toml.`
    );
  }

  const requirementsRoot = resolvePathValue(
    merged.paths && merged.paths.requirements_root,
    configBaseDir
  ) || path.join(agentsRoot, "requirements");

  const docsRaw = merged.paths && merged.paths.docs_dir ? String(merged.paths.docs_dir) : "";
  const docsDir = docsRaw.trim()
    ? resolvePathValue(docsRaw, configBaseDir)
    : path.join(repoRoot, "docs");

  const productVisionRaw = merged.paths && merged.paths.product_vision_dir
    ? String(merged.paths.product_vision_dir)
    : "";
  const legacyVisionFile = merged.pos && merged.pos.vision_file
    ? resolvePathValue(String(merged.pos.vision_file), repoRoot)
    : "";
  const legacyProductVisionDir = legacyVisionFile ? path.dirname(legacyVisionFile) : "";
  const productVisionDir = productVisionRaw.trim()
    ? resolvePathValue(productVisionRaw, configBaseDir)
    : (legacyProductVisionDir || path.join(docsDir, "product-operating-system"));
  const productVisionFiles = listMarkdownFiles(productVisionDir);
  const posDocs = {
    vision: selectFirstExistingFile(
      [
        path.join(productVisionDir, "vision.md"),
        path.join(productVisionDir, "01_Product_Vision.md"),
      ],
      path.join(productVisionDir, "vision.md")
    ),
    blueprint: selectFirstExistingFile(
      [
        path.join(productVisionDir, "blueprint.md"),
        path.join(productVisionDir, "02_Product_Spec_CORE.md"),
      ],
      path.join(productVisionDir, "blueprint.md")
    ),
    epicMatrix: selectFirstExistingFile(
      [
        path.join(productVisionDir, "epic-matrix.md"),
        path.join(productVisionDir, "11_Epic_Map_and_Delivery_Plan.md"),
      ],
      path.join(productVisionDir, "epic-matrix.md")
    ),
    notBuilding: selectFirstExistingFile(
      [
        path.join(productVisionDir, "not-building.md"),
        path.join(productVisionDir, "09_Open_Decisions_and_Risks.md"),
      ],
      path.join(productVisionDir, "not-building.md")
    ),
    visionAchieved: selectFirstExistingFile(
      [
        path.join(productVisionDir, "vision-achieved.md"),
        path.join(productVisionDir, "06_Product_Quality_Framework.md"),
      ],
      path.join(productVisionDir, "vision-achieved.md")
    ),
  };

  const loops = {
    bundleMinSize: clamp(
      merged.loops && merged.loops.bundle_min_size,
      1,
      10_000,
      DEFAULTS.loops.bundle_min_size
    ),
    bundleMaxSize: clamp(
      merged.loops && merged.loops.bundle_max_size,
      1,
      10_000,
      DEFAULTS.loops.bundle_max_size
    ),
    poPollSeconds: clamp(
      merged.loops && merged.loops.po_poll_seconds,
      1,
      86_400,
      DEFAULTS.loops.po_poll_seconds
    ),
    deliveryPollSeconds: clamp(
      merged.loops && merged.loops.delivery_poll_seconds,
      1,
      86_400,
      DEFAULTS.loops.delivery_poll_seconds
    ),
    maxRetries: Math.max(
      0,
      toInteger(merged.loops && merged.loops.max_retries, DEFAULTS.loops.max_retries)
    ),
    retryDelaySeconds: Math.max(
      0,
      toInteger(
        merged.loops && merged.loops.retry_delay_seconds,
        DEFAULTS.loops.retry_delay_seconds
      )
    ),
    forceUnderfilledAfterCycles: Math.max(
      1,
      toInteger(
        merged.loops && merged.loops.force_underfilled_after_cycles,
        DEFAULTS.loops.force_underfilled_after_cycles
      )
    ),
  };

  if (loops.bundleMaxSize < loops.bundleMinSize) {
    loops.bundleMaxSize = loops.bundleMinSize;
  }

  const flow = {
    defaultMode: normalizeFlow(
      merged.flow && merged.flow.default_mode,
      DEFAULTS.flow.default_mode
    ),
    idlePollSeconds: toInteger(
      merged.flow && merged.flow.idle_poll_seconds,
      DEFAULTS.flow.idle_poll_seconds
    ),
    maxRetries: Math.max(0, toInteger(
      merged.flow && merged.flow.max_retries,
      DEFAULTS.flow.max_retries
    )),
    retryDelaySeconds: Math.max(0, toInteger(
      merged.flow && merged.flow.retry_delay_seconds,
      DEFAULTS.flow.retry_delay_seconds
    )),
  };

  const po = {
    defaultMode: normalizePoMode(
      merged.po && merged.po.default_mode,
      DEFAULTS.po.default_mode
    ),
    visionMaxCycles: Math.max(
      1,
      toInteger(merged.po && merged.po.vision_max_cycles, DEFAULTS.po.vision_max_cycles)
    ),
    visionMaxRequirements: Math.max(
      1,
      toInteger(
        merged.po && merged.po.vision_max_requirements,
        DEFAULTS.po.vision_max_requirements
      )
    ),
    visionStableCycles: Math.max(
      1,
      toInteger(
        merged.po && merged.po.vision_stable_cycles,
        DEFAULTS.po.vision_stable_cycles
      )
    ),
    selectedLowWatermark: Math.max(
      0,
      toInteger(
        merged.po && merged.po.selected_low_watermark,
        DEFAULTS.po.selected_low_watermark
      )
    ),
    selectedHighWatermark: Math.max(
      1,
      toInteger(
        merged.po && merged.po.selected_high_watermark,
        DEFAULTS.po.selected_high_watermark
      )
    ),
    intakeMaxPerCycle: Math.max(
      1,
      toInteger(
        merged.po && merged.po.intake_max_per_cycle,
        DEFAULTS.po.intake_max_per_cycle
      )
    ),
    intakeLoopCooldownCycles: Math.max(
      1,
      toInteger(
        merged.po && merged.po.intake_loop_cooldown_cycles,
        DEFAULTS.po.intake_loop_cooldown_cycles
      )
    ),
    intakeIdempotenceEnabled: toBoolean(
      merged.po && merged.po.intake_idempotence_enabled,
      DEFAULTS.po.intake_idempotence_enabled
    ),
  };
  po.selectedHighWatermark = Math.max(po.selectedLowWatermark, po.selectedHighWatermark);

  const arch = {
    routingMode: normalizeArchRoutingMode(
      merged.arch && merged.arch.routing_mode,
      DEFAULTS.arch.routing_mode
    ),
    requireForScopes: normalizeStringArray(
      merged.arch && merged.arch.require_for_scopes,
      DEFAULTS.arch.require_for_scopes
    ),
    requireForReviewRisks: normalizeStringArray(
      merged.arch && merged.arch.require_for_review_risks,
      DEFAULTS.arch.require_for_review_risks
    ),
    requireForReviewScopes: normalizeStringArray(
      merged.arch && merged.arch.require_for_review_scopes,
      DEFAULTS.arch.require_for_review_scopes
    ),
    triggerKeywords: normalizeStringArray(
      merged.arch && merged.arch.trigger_keywords,
      DEFAULTS.arch.trigger_keywords
    ),
    triggerFrontmatterFlags: normalizeStringArray(
      merged.arch && merged.arch.trigger_frontmatter_flags,
      DEFAULTS.arch.trigger_frontmatter_flags
    ),
    digestEnabled: toBoolean(
      merged.arch && merged.arch.digest_enabled,
      DEFAULTS.arch.digest_enabled
    ),
    digestFile: String(
      (merged.arch && merged.arch.digest_file) || DEFAULTS.arch.digest_file
    ).trim() || DEFAULTS.arch.digest_file,
    digestMaxFiles: clamp(
      merged.arch && merged.arch.digest_max_files,
      1,
      200,
      DEFAULTS.arch.digest_max_files
    ),
    digestMaxHeadingsPerFile: clamp(
      merged.arch && merged.arch.digest_max_headings_per_file,
      1,
      200,
      DEFAULTS.arch.digest_max_headings_per_file
    ),
    maxRetries: Math.max(
      0,
      toInteger(merged.arch && merged.arch.max_retries, DEFAULTS.arch.max_retries)
    ),
  };

  const runDefaults = {
    flow: normalizeFlow(
      merged.run_defaults && merged.run_defaults.flow,
      DEFAULTS.run_defaults.flow
    ),
    maxReq: toInteger(
      merged.run_defaults && merged.run_defaults.max_req,
      DEFAULTS.run_defaults.max_req
    ),
    verbose: toBoolean(
      merged.run_defaults && merged.run_defaults.verbose,
      DEFAULTS.run_defaults.verbose
    ),
    detail: toBoolean(
      merged.run_defaults && merged.run_defaults.detail,
      DEFAULTS.run_defaults.detail
    ),
    preflight: normalizePreflightMode(
      merged.run_defaults && merged.run_defaults.preflight,
      DEFAULTS.run_defaults.preflight
    ),
    manualDownstream: toBoolean(
      merged.run_defaults && merged.run_defaults.manual_downstream,
      DEFAULTS.run_defaults.manual_downstream
    ),
  };

  const deployMode = String((merged.deploy && merged.deploy.mode) || "commit").toLowerCase();
  const deployPrRaw = (merged.deploy && merged.deploy.pr && typeof merged.deploy.pr === "object")
    ? merged.deploy.pr
    : {};
  const deployPrProvider = String(
    deployPrRaw.provider || (DEFAULTS.deploy.pr && DEFAULTS.deploy.pr.provider) || "github"
  ).toLowerCase();
  const deployPrHeadMode = String(
    deployPrRaw.head_mode || (DEFAULTS.deploy.pr && DEFAULTS.deploy.pr.head_mode) || "current"
  ).toLowerCase();
  const deploy = {
    mode: ["check", "commit", "commit_push"].includes(deployMode) ? deployMode : "commit",
    finalPushOnSuccess:
      typeof (merged.deploy && merged.deploy.final_push_on_success) === "boolean"
        ? merged.deploy.final_push_on_success
        : DEFAULTS.deploy.final_push_on_success,
    requireCleanStartForCommits:
      typeof (merged.deploy && merged.deploy.require_clean_start_for_commits) === "boolean"
        ? merged.deploy.require_clean_start_for_commits
        : DEFAULTS.deploy.require_clean_start_for_commits,
    pr: {
      enabled: toBoolean(
        deployPrRaw.enabled,
        DEFAULTS.deploy.pr && DEFAULTS.deploy.pr.enabled
      ),
      provider: ["github", "gitlab"].includes(deployPrProvider) ? deployPrProvider : "github",
      remote: String(
        deployPrRaw.remote || (DEFAULTS.deploy.pr && DEFAULTS.deploy.pr.remote) || "origin"
      ).trim() || "origin",
      baseBranch: String(
        deployPrRaw.base_branch || (DEFAULTS.deploy.pr && DEFAULTS.deploy.pr.base_branch) || "main"
      ).trim() || "main",
      headMode: ["current", "fixed"].includes(deployPrHeadMode) ? deployPrHeadMode : "current",
      headBranch: String(
        deployPrRaw.head_branch || (DEFAULTS.deploy.pr && DEFAULTS.deploy.pr.head_branch) || ""
      ).trim(),
      draft: toBoolean(
        deployPrRaw.draft,
        DEFAULTS.deploy.pr && DEFAULTS.deploy.pr.draft
      ),
      createOnlyAfterPush: toBoolean(
        deployPrRaw.create_only_after_push,
        DEFAULTS.deploy.pr && DEFAULTS.deploy.pr.create_only_after_push
      ),
      titleTemplate: String(
        deployPrRaw.title_template
          || (DEFAULTS.deploy.pr && DEFAULTS.deploy.pr.title_template)
          || "chore(release): ${branch} -> ${base}"
      ).trim() || "chore(release): ${branch} -> ${base}",
      bodyTemplate: String(
        deployPrRaw.body_template
          || (DEFAULTS.deploy.pr && DEFAULTS.deploy.pr.body_template)
          || "Automated PR from ${branch} to ${base} after deploy bundle."
      ).trim() || "Automated PR from ${branch} to ${base} after deploy bundle.",
    },
  };

  const preflight = {
    snapshotCommitMessagePrefix:
      String(
        (merged.preflight && merged.preflight.snapshot_commit_message_prefix) ||
          DEFAULTS.preflight.snapshot_commit_message_prefix
      ).trim() || DEFAULTS.preflight.snapshot_commit_message_prefix,
  };

  const devRouting = {
    mode: normalizeDevRoutingMode(
      merged.dev_routing && merged.dev_routing.mode,
      DEFAULTS.dev_routing.mode
    ),
    defaultScope: normalizeScope(
      merged.dev_routing && merged.dev_routing.default_scope,
      DEFAULTS.dev_routing.default_scope
    ),
  };

  const devAgents = {
    useFe: toBoolean(merged.dev_agents && merged.dev_agents.use_fe, DEFAULTS.dev_agents.use_fe),
    useBe: toBoolean(merged.dev_agents && merged.dev_agents.use_be, DEFAULTS.dev_agents.use_be),
    useFs: toBoolean(merged.dev_agents && merged.dev_agents.use_fs, DEFAULTS.dev_agents.use_fs),
  };
  if (!devAgents.useFe && !devAgents.useBe && !devAgents.useFs) {
    devAgents.useFs = true;
  }

  const qa = {
    mandatoryChecks: normalizeChecks(
      merged.qa && merged.qa.mandatory_checks,
      DEFAULTS.qa.mandatory_checks
    ),
  };

  const review = {
    strategy: normalizeReviewStrategy(
      merged.review && merged.review.strategy,
      DEFAULTS.review.strategy
    ),
    parallel: toBoolean(
      merged.review && merged.review.parallel,
      DEFAULTS.review.parallel
    ),
    defaultRisk: normalizeRisk(
      merged.review && merged.review.default_risk,
      DEFAULTS.review.default_risk
    ),
    mediumScopePolicy: normalizeMediumScopePolicy(
      merged.review && merged.review.medium_scope_policy,
      DEFAULTS.review.medium_scope_policy
    ),
  };

  const codex = merged.codex && typeof merged.codex === "object" ? merged.codex : {};
  const codexConfigPath = writeCodexConfigFile({
    agentsRoot,
    codex,
    fileName: "codex.generated.toml",
  });

  const models = resolveCodexModels({
    rawModels: merged.models,
    fallbackModel: normalizeModelName(codex.model, DEFAULTS.codex.model),
  });

  const codexConfigPathsByAgent = {};
  for (const [agent, model] of Object.entries(models.byAgent)) {
    codexConfigPathsByAgent[agent] = writeCodexConfigFile({
      agentsRoot,
      codex: {
        ...codex,
        model,
      },
      fileName: `codex.generated.${agent.toLowerCase()}.toml`,
    });
  }

  const resolveAgentCodexConfigPath = (agentLabel) => {
    const normalized = normalizeAgentLabel(agentLabel);
    return codexConfigPathsByAgent[normalized] || codexConfigPath;
  };

  return {
    agentsRoot,
    defaultsPath,
    localPath,
    hasLocalConfig: fs.existsSync(localPath),
    repoRoot,
    requirementsRoot,
    docsDir,
    productVisionDir,
    productVisionFiles,
    posDocs,
    loops,
    flow,
    runDefaults,
    preflight,
    deploy,
    po,
    arch,
    devRouting,
    devAgents,
    qa,
    review,
    codex,
    models,
    codexConfigPath,
    codexConfigPathsByAgent,
    resolveAgentCodexConfigPath,
    queues: getQueues(requirementsRoot),
  };
}

module.exports = {
  parseToml,
  loadRuntimeConfig,
  getQueues,
  ensureQueueDirs,
};
