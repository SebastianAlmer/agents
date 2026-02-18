#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawn } = require("child_process");

const reqengScript = path.join(__dirname, "reqeng", "reqeng.js");
const passthroughArgs = process.argv.slice(2);

const child = spawn(process.execPath, [reqengScript, ...passthroughArgs], {
  cwd: __dirname,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(Number.isInteger(code) ? code : 1);
});

