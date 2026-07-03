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
  ]);
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
        },
        timeZone: {
          label: "Timezone",
          value: true,
          source: "fixture",
        },
        network: {
          label: "Network",
          value: "skipped",
          source: "fixture",
        },
      },
      environment: {
        timeZone: "Asia/Shanghai",
      },
    }),
    "utf8",
  );

  const report = await runJson(["--fixture", fixturePath]);
  assert.equal(report.analysis.status, "china-signals-detected");
  assert.match(report.consentPrompt, /合规隐私卫生检查/);
  assert.match(report.consentPrompt, /不会帮助绕过平台地域限制/);
  assert.ok(report.disallowedNextSteps.some((item) => item.includes("KYC")));
});

test("live runtime import works and reports the required signal ids", async () => {
  const report = await runJson();
  const ids = new Set(report.signals.map((signal) => signal.id));
  for (const id of ["isChinaUser", "language", "timeZone", "emoji", "font", "network"]) {
    assert.ok(ids.has(id), `missing signal id: ${id}`);
  }
  assert.equal(report.tool, "qiaomu-ai-access");
  assert.equal(report.signals.find((signal) => signal.id === "network").value, "skipped");
});
