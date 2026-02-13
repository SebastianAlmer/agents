#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  paths: {
    repo_root: "",
    requirements_root: "./requirements",
    docs_dir: "",
    product_vision_dir: "",
  },
  loops: {
    window_size: 3,
    po_poll_seconds: 20,
    ops_poll_seconds: 20,
    max_retries: 2,
    retry_delay_seconds: 2,
  },
  flow: {
    default_mode: "standard",
    idle_poll_seconds: 300,
    max_retries: 2,
    retry_delay_seconds: 2,
  },
  run_defaults: {
    flow: "standard",
    max_req: 0,
    verbose: false,
    detail: false,
    preflight: "soft",
  },
  preflight: {
    snapshot_commit_message_prefix: "chore(flow): preflight snapshot",
  },
  deploy: {
    mode: "commit",
    final_push_on_success: true,
    require_clean_start_for_commits: true,
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
  models: {
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
  },
  codex: {
    model: "gpt-5.3-codex-spark",
    approval_policy: "never",
    sandbox_mode: "danger-full-access",
    model_reasoning_effort: "xhigh",
  },
};

function ensureDir(dir) {
  if (!dir) {
    return;
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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
  if ((value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    const inner = value.slice(1, -1);
    if (value.startsWith("\"")) {
      return inner
        .replace(/\\\\/g, "\\")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, "\"");
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
    return Number.parseInt(value, 10);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return inner
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map(parseValue);
  }
  return parseString(value);
}

function ensureObjectPath(root, keyPath) {
  const parts = String(keyPath || "").split(".").filter(Boolean);
  let node = root;
  for (const part of parts) {
    if (!node[part] || typeof node[part] !== "object" || Array.isArray(node[part])) {
      node[part] = {};
    }
    node = node[part];
  }
  return node;
}

function parseToml(content) {
  const result = {};
  let sectionPath = "";
  for (const line of content.split(/\r?\n/)) {
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
    if (!key) {
      continue;
    }
    const target = sectionPath ? ensureObjectPath(result, sectionPath) : result;
    target[key] = parseValue(withoutComment.slice(eqIndex + 1).trim());
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
      output[key] &&
      typeof output[key] === "object" &&
      !Array.isArray(output[key])
    ) {
      output[key] = deepMerge(output[key], value);
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

function toBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function toInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMode(value, fallback, allowed) {
  const normalized = String(value || fallback || "").toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeFlowMode(value, fallback = "standard") {
  const normalized = String(value || fallback || "").toLowerCase();
  if (normalized === "auto") {
    return "auto";
  }
  if (["dev-only", "dev_only", "devonly"].includes(normalized)) {
    return "dev-only";
  }
  return "standard";
}

function selectFirstExistingFile(candidates, fallbackPath) {
  for (const candidate of candidates || []) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return fallbackPath;
}

function normalizeScope(value, fallback) {
  const normalized = String(value || fallback || "").toLowerCase();
  if (["frontend", "fe", "ui"].includes(normalized)) {
    return "frontend";
  }
  if (["backend", "be", "api", "server"].includes(normalized)) {
    return "backend";
  }
  if (["fullstack", "fs", "full-stack", "full_stack"].includes(normalized)) {
    return "fullstack";
  }
  return fallback;
}

function normalizeQueueChecks(value, fallback) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const checks = value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return checks.length ? checks : fallback;
}

function normalizeWindowSize(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(4, Math.max(2, parsed));
}

function normalizePositiveSeconds(value, fallback, min = 1) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
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
  const normalized = Array.isArray(values) ? values : [];
  return `[${normalized.map((x) => JSON.stringify(String(x))).join(", ")}]`;
}

function writeCodexConfigFile({ agentsRoot, codex, fileName }) {
  const runtimeDir = path.join(agentsRoot, ".runtime");
  ensureDir(runtimeDir);
  const target = path.join(runtimeDir, fileName || "codex.generated.toml");
  const keys = Object.keys(codex || {});
  const lines = keys.sort().map((key) => `${key} = ${toTomlString(codex[key])}`);
  fs.writeFileSync(target, lines.join("\n") + "\n", "utf8");
  return target;
}

function normalizeAgentLabel(agentLabel) {
  return String(agentLabel || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeModelName(value, fallback) {
  const valueString = String(value || "").trim();
  return valueString || String(fallback || "").trim();
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
  return {
    defaultModel,
    byAgent: {
      REQENG: map.reqeng || defaultModel,
      PO: map.po || defaultModel,
      ARCH: map.arch || defaultModel,
      DEV_FE: map.dev_fe || defaultModel,
      DEV_BE: map.dev_be || defaultModel,
      DEV_FS: map.dev_fs || defaultModel,
      QA: map.qa || defaultModel,
      SEC: map.sec || defaultModel,
      UX: map.ux || defaultModel,
      DEPLOY: map.deploy || defaultModel,
    },
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
    wontDo: path.join(requirementsRoot, "wont-do"),
  };
}

function ensureQueueDirs(queueMap) {
  for (const dir of Object.values(queueMap)) {
    ensureDir(dir);
  }
}

function loadRuntimeConfig(agentsRoot) {
  const defaultsPath = path.join(agentsRoot, "config.defaults.toml");
  const explicitLocalPath = process.env.AGENTS_CONFIG;
  const localPath = explicitLocalPath
    ? path.resolve(explicitLocalPath)
    : path.join(agentsRoot, "config.local.toml");

  const merged = deepMerge(
    DEFAULTS,
    fs.existsSync(defaultsPath)
      ? parseToml(fs.readFileSync(defaultsPath, "utf8"))
      : {}
  );
  const local = fs.existsSync(localPath)
    ? parseToml(fs.readFileSync(localPath, "utf8"))
    : {};
  const config = deepMerge(merged, local);

  const configBaseDir = fs.existsSync(localPath) ? path.dirname(localPath) : agentsRoot;

  const repoRoot = resolvePathValue(config.paths && config.paths.repo_root, configBaseDir);
  if (!repoRoot) {
    throw new Error(`Missing [paths].repo_root in ${localPath}`);
  }

  const requirementsRoot = resolvePathValue(
    config.paths && config.paths.requirements_root,
    configBaseDir
  ) || path.join(agentsRoot, "requirements");

  const docsRaw = config.paths && config.paths.docs_dir ? String(config.paths.docs_dir) : "";
  const docsDir = docsRaw.trim()
    ? resolvePathValue(docsRaw, configBaseDir)
    : path.join(repoRoot, "docs");

  const productVisionRaw = config.paths && config.paths.product_vision_dir
    ? String(config.paths.product_vision_dir)
    : "";
  const legacyVisionFile = config.pos && config.pos.vision_file
    ? resolvePathValue(String(config.pos.vision_file), repoRoot)
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

  const loopsCfg = config.loops || {};
  const loops = {
    windowSize: normalizeWindowSize(loopsCfg.window_size, DEFAULTS.loops.window_size),
    poPollSeconds: normalizePositiveSeconds(
      loopsCfg.po_poll_seconds,
      DEFAULTS.loops.po_poll_seconds,
      1
    ),
    opsPollSeconds: normalizePositiveSeconds(
      loopsCfg.ops_poll_seconds,
      DEFAULTS.loops.ops_poll_seconds,
      1
    ),
    maxRetries: Math.max(0, toInteger(loopsCfg.max_retries, DEFAULTS.loops.max_retries)),
    retryDelaySeconds: Math.max(0, toInteger(loopsCfg.retry_delay_seconds, DEFAULTS.loops.retry_delay_seconds)),
  };

  const flow = {
    defaultMode: normalizeFlowMode(config.flow && config.flow.default_mode, DEFAULTS.flow.default_mode),
    idlePollSeconds: normalizePositiveSeconds(
      config.flow && config.flow.idle_poll_seconds,
      DEFAULTS.flow.idle_poll_seconds,
      1
    ),
    maxRetries: Math.max(0, toInteger(config.flow && config.flow.max_retries, DEFAULTS.flow.max_retries)),
    retryDelaySeconds: Math.max(0, toInteger(config.flow && config.flow.retry_delay_seconds, DEFAULTS.flow.retry_delay_seconds)),
  };

  const runDefaults = {
    flow: normalizeFlowMode(config.run_defaults && config.run_defaults.flow, flow.defaultMode),
    maxReq: toInteger(config.run_defaults && config.run_defaults.max_req, DEFAULTS.run_defaults.max_req),
    verbose: toBoolean(config.run_defaults && config.run_defaults.verbose, false),
    detail: toBoolean(config.run_defaults && config.run_defaults.detail, false),
    preflight: normalizeMode(
      config.run_defaults && config.run_defaults.preflight,
      "soft",
      ["hard", "soft", "none", "snapshot"]
    ),
  };

  const preflight = {
    snapshotCommitMessagePrefix:
      String(
        (config.preflight && config.preflight.snapshot_commit_message_prefix) ||
          DEFAULTS.preflight.snapshot_commit_message_prefix
      ).trim() || DEFAULTS.preflight.snapshot_commit_message_prefix,
  };

  const deployMode = String((config.deploy && config.deploy.mode) || "commit").toLowerCase();
  const deploy = {
    mode: ["check", "commit", "commit_push"].includes(deployMode) ? deployMode : "commit",
    finalPushOnSuccess: toBoolean(
      config.deploy && config.deploy.final_push_on_success,
      DEFAULTS.deploy.final_push_on_success
    ),
    requireCleanStartForCommits: toBoolean(
      config.deploy && config.deploy.require_clean_start_for_commits,
      DEFAULTS.deploy.require_clean_start_for_commits
    ),
  };

  const devRouting = {
    mode: normalizeMode(config.dev_routing && config.dev_routing.mode, DEFAULTS.dev_routing.mode, ["fullstack_only", "split"]),
    defaultScope: normalizeScope(
      config.dev_routing && config.dev_routing.default_scope,
      DEFAULTS.dev_routing.default_scope
    ),
  };

  const devAgents = {
    useFe: toBoolean(config.dev_agents && config.dev_agents.use_fe, DEFAULTS.dev_agents.use_fe),
    useBe: toBoolean(config.dev_agents && config.dev_agents.use_be, DEFAULTS.dev_agents.use_be),
    useFs: toBoolean(config.dev_agents && config.dev_agents.use_fs, DEFAULTS.dev_agents.use_fs),
  };
  if (!devAgents.useFe && !devAgents.useBe && !devAgents.useFs) {
    devAgents.useFs = true;
  }

  const qa = {
    mandatoryChecks: normalizeQueueChecks(
      config.qa && config.qa.mandatory_checks,
      DEFAULTS.qa.mandatory_checks
    ),
  };

  const codex = config.codex && typeof config.codex === "object" ? config.codex : {};
  const codexConfigPath = writeCodexConfigFile({
    agentsRoot,
    codex,
    fileName: "codex.generated.toml",
  });
  const models = resolveCodexModels({
    rawModels: config.models,
    fallbackModel: normalizeModelName(codex.model, DEFAULTS.codex.model),
  });
  const codexConfigPathsByAgent = {};
  for (const [agent, model] of Object.entries(models.byAgent)) {
    codexConfigPathsByAgent[agent] = writeCodexConfigFile({
      agentsRoot,
      codex: { ...codex, model },
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
    devRouting,
    devAgents,
    qa,
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
  ensureDir,
};
