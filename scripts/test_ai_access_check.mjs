import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = path.join(root, "scripts", "ai_access_check.mjs");

async function runJson(args = []) {
  const { stdout } = await execFileAsync(process.execPath, [
    script,
    "--json",
    ...args,
  ], {
    timeout: 30000,
  });
  return JSON.parse(stdout);
}

test("fixture with a positive signal produces consent prompt and detected status", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "qiaomu-ai-access-"));
  const fixturePath = path.join(dir, "fixture.json");
  await writeFile(
    fixturePath,
    JSON.stringify({
      signals: {
        isChinaUser: {
          label: "Combined isChinaUser()",
          value: true,
          source: "fixture",
          layer: "runtime",
        },
        timeZone: {
          label: "Timezone",
          value: true,
          source: "fixture",
          layer: "runtime",
        },
        network: {
          label: "Network",
          value: "skipped",
          source: "fixture",
          layer: "runtime",
        },
      },
      coverage: [
        {
          layer: "runtime",
          status: "verified",
          note: "fixture",
        },
      ],
      environment: {
        runtime: {
          timeZone: "Asia/Shanghai",
        },
      },
    }),
    "utf8",
  );

  const report = await runJson(["--fixture", fixturePath]);
  assert.equal(report.analysis.status, "china-signals-detected");
  assert.equal(report.analysis.coverageLevel, "runtime");
  assert.match(report.consentPrompt, /合规隐私卫生检查/);
  assert.match(report.consentPrompt, /不会帮助绕过平台地域限制/);
  assert.ok(report.disallowedNextSteps.some((item) => item.includes("KYC")));
});

test("live runtime import works and reports the required signal ids", async () => {
  const report = await runJson();
  const ids = new Set(report.signals.map((signal) => signal.id));
  for (const id of [
    "isChinaUser",
    "language",
    "timeZone",
    "emoji",
    "font",
    "network",
  ]) {
    assert.ok(ids.has(id), `missing signal id: ${id}`);
  }
  assert.equal(report.tool, "qiaomu-ai-access");
  assert.ok(report.coverage.some((item) => item.layer === "runtime"));
  assert.equal(report.environment.runtime.platform, process.platform);
  assert.equal(report.signals.find((signal) => signal.id === "network").value, "skipped");
});

test("browser layer is either verified or explicitly unavailable", async () => {
  const report = await runJson(["--include-browser"]);
  const browserCoverage = report.coverage.find((item) => item.layer === "browser");
  assert.ok(browserCoverage, "missing browser coverage");
  assert.ok(["verified", "unavailable"].includes(browserCoverage.status));

  if (browserCoverage.status === "verified") {
    const ids = new Set(report.signals.map((signal) => signal.id));
    for (const id of [
      "browser.isChinaUser",
      "browser.language",
      "browser.timeZone",
      "browser.emoji",
      "browser.font",
      "browser.network",
    ]) {
      assert.ok(ids.has(id), `missing browser signal id: ${id}`);
    }
    assert.ok(report.environment.browser.userAgent);
  }
});
