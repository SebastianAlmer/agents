#!/usr/bin/env node
"use strict";

const { runDevAgent } = require("../lib/dev-agent-runner");

runDevAgent({
  agentRoot: __dirname,
  agentLabel: "DEV_BE",
  promptLabel: "Backend",
  targetScope: "backend",
}).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
