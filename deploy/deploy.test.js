const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  validateReleaseHistoryInputs,
  buildReleaseHistoryContext,
} = require("./deploy");

test("parseArgs recognizes release history mode fields", () => {
  const args = parseArgs([
    "--auto",
    "--release-history",
    "--bundle-id",
    "B0013",
    "--version=v0.1.13",
    "--previous-version",
    "v0.1.12",
  ]);

  assert.equal(args.auto, true);
  assert.equal(args.releaseHistory, true);
  assert.equal(args.bundleId, "B0013");
  assert.equal(args.version, "v0.1.13");
  assert.equal(args.previousVersion, "v0.1.12");
});

test("validateReleaseHistoryInputs blocks when history and source are missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-history-missing-test-"));
  const runtime = {
    releaseHistory: {
      file: path.join(root, "docs", "release-history.md"),
      sourceFile: path.join(root, "docs", "source.md"),
    },
  };

  assert.throws(
    () => validateReleaseHistoryInputs(runtime),
    /Release history file missing and source cannot be read/
  );
});

test("buildReleaseHistoryContext includes version, bundle and released requirements", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-history-context-test-"));
  const releasedDir = path.join(root, "requirements", "released");
  const docsDir = path.join(root, "repo", "docs");
  fs.mkdirSync(releasedDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });
  const sourceFile = path.join(docsDir, "release-source.md");
  fs.writeFileSync(sourceFile, "# Source\n", "utf8");
  fs.writeFileSync(
    path.join(releasedDir, "REQ-TEST.md"),
    "---\nid: REQ-TEST\nbundle_id: B0013\n---\n# Goal\n",
    "utf8"
  );
  fs.mkdirSync(path.join(root, "agents", ".runtime", "bundles"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "agents", ".runtime", "bundles", "registry.json"),
    JSON.stringify({
      bundles: {
        B0012: { id: "B0012", status: "completed" },
        B0014: { id: "B0014", status: "aborted" },
      },
    }),
    "utf8"
  );
  fs.writeFileSync(
    path.join(releasedDir, "REQ-OLD-COMPLETED.md"),
    "---\nid: REQ-OLD-COMPLETED\nbundle_id: B0012\n---\n# Goal\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(releasedDir, "REQ-OLD-INCOMPLETE.md"),
    "---\nid: REQ-OLD-INCOMPLETE\nbundle_id: B0014\n---\n# Goal\n",
    "utf8"
  );

  const context = buildReleaseHistoryContext(
    {
      agentsRoot: path.join(root, "agents"),
      repoRoot: path.join(root, "repo"),
      releaseHistory: {
        file: path.join(docsDir, "release-history.md"),
        sourceFile,
      },
      queues: {
        released: releasedDir,
      },
    },
    {
      bundleId: "B0013",
      version: "v0.1.13",
      previousVersion: "v0.1.12",
    }
  );

  assert.match(context, /Release history mode: true/);
  assert.match(context, /Bundle ID: B0013/);
  assert.match(context, /Version: v0\.1\.13/);
  assert.match(context, /REQ-TEST\.md/);
  assert.match(context, /Release requirements to document in this release:/);
  assert.match(context, /Primary bundle requirements:/);
  assert.match(context, /Prior incomplete bundle requirements already in released queue and included in this release:/);
  assert.match(context, /REQ-OLD-INCOMPLETE\.md/);
  assert.doesNotMatch(context, /REQ-OLD-COMPLETED\.md/);
});
