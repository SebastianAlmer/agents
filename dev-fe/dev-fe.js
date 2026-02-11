#!/usr/bin/env node
"use strict";

const { runDevAgent } = require("../lib/dev-agent-runner");

runDevAgent({
  agentRoot: __dirname,
  agentLabel: "DEV_FE",
  promptLabel: "Frontend",
  targetScope: "frontend",
}).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
