#!/usr/bin/env node

import process from "node:process";

async function readStdin() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

const report = JSON.parse(await readStdin());
const browserCoverage = report.coverage?.find((item) => item.layer === "browser");
const signalIds = new Set((report.signals ?? []).map((signal) => signal.id));
const requiredSignals = [
  "browser.isChinaUser",
  "browser.language",
  "browser.timeZone",
  "browser.emoji",
  "browser.font",
  "browser.network",
];

if (browserCoverage?.status !== "verified") {
  throw new Error(
    `Expected verified browser coverage, got ${browserCoverage?.status ?? "missing"}.`,
  );
}

for (const id of requiredSignals) {
  if (!signalIds.has(id)) throw new Error(`Missing browser signal: ${id}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      status: report.analysis?.status,
      coverage: report.analysis?.coverageLevel,
      browser: browserCoverage.status,
    },
    null,
    2,
  ),
);
