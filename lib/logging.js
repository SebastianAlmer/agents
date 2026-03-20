"use strict";

function timestampMinute() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function installTimestampedConsole() {
  if (global.__agentsTimestampedConsoleInstalled) {
    return;
  }
  global.__agentsTimestampedConsoleInstalled = true;

  const originalLog = console.log.bind(console);
  console.log = (...args) => {
    originalLog(`${timestampMinute()}`, ...args);
  };
}

module.exports = {
  installTimestampedConsole,
  timestampMinute,
};
