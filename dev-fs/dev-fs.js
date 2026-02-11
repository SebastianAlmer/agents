#!/usr/bin/env node
"use strict";

const { runDevAgent } = require("../lib/dev-agent-runner");

runDevAgent({
  agentRoot: __dirname,
  agentLabel: "DEV_FS",
  promptLabel: "Fullstack",
  targetScope: "fullstack",
}).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
