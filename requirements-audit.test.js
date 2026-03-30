const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { loadRuntimeConfig } = require("./lib/runtime");
const { collectRequirementDuplicateGroups } = require("./lib/requirement-canonical");

test("requirements tree has no duplicate requirement ids across queues", () => {
  const runtime = loadRuntimeConfig(path.resolve(__dirname));
  const groups = collectRequirementDuplicateGroups(runtime);
  const summary = groups.map((group) => (
    `${group.id}: ${group.copies.map((copy) => `${copy.queueName}/${path.basename(copy.filePath)}`).join(", ")}`
  ));
  assert.equal(groups.length, 0, summary.join("\n"));
});
