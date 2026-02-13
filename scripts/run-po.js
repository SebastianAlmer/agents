#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawn } = require("child_process");

const scriptPath = path.join(__dirname, "..", "po", "po.js");
const proc = spawn(process.execPath, [scriptPath, "--runner", ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
});

proc.on("close", (code) => {
  process.exit(Number.isInteger(code) ? code : 1);
});
