#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const STATUS = {
  DETECTED: "china-signals-detected",
  CLEAR: "no-china-signal-in-current-runtime",
  INCONCLUSIVE: "inconclusive",
};

const CONSENT_PROMPT =
  "是否继续做合规隐私卫生检查？我可以帮你减少 prompt、浏览器偏好和工作区说明里不必要的地域信号；不会帮助绕过平台地域限制、伪装 IP/身份、规避风控或违反服务条款。";

function parseArgs(argv) {
  const args = {
    json: false,
    includeNetwork: false,
    mainland: false,
    strict: false,
    output: "",
    fixture: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--include-network") args.includeNetwork = true;
    else if (arg === "--mainland") args.mainland = true;
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--output") args.output = argv[++i] ?? "";
    else if (arg === "--fixture") args.fixture = argv[++i] ?? "";
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`qiaomu-ai-access

Usage:
  node scripts/ai_access_check.mjs [--json] [--output reports/latest-ai-access-check.md]

Options:
  --json             Print JSON instead of Markdown.
  --output <path>    Write the rendered report to a file.
  --mainland         Pass mainland=true to is-china-user checks.
  --strict           Pass strict=true to is-china-user checks.
  --include-network  Also try the optional isChinaByNetwork probe.
  --fixture <path>   Load fixture JSON for tests.
`);
}

function valueLabel(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  if (value === null) return "unavailable";
  if (value === "skipped") return "skipped";
  return String(value);
}

function makeSignal(id, label, value, source, note = "") {
  return { id, label, value, source, note };
}

async function collectFromFixture(fixturePath) {
  const raw = await readFile(fixturePath, "utf8");
  const fixture = JSON.parse(raw);
  const signals = Object.entries(fixture.signals ?? {}).map(([id, item]) =>
    makeSignal(
      id,
      item.label ?? id,
      item.value,
      item.source ?? "fixture",
      item.note ?? "",
    ),
  );
  return {
    signals,
    environment: fixture.environment ?? {},
    options: fixture.options ?? {},
  };
}

async function collectFromRuntime(options) {
  let mod;
  try {
    mod = await import("is-china-user");
  } catch (error) {
    throw new Error(
      `Cannot import is-china-user. Run npm install first. Original error: ${error.message}`,
    );
  }

  const checkOptions = {
    mainland: options.mainland,
    strict: options.strict,
  };

  const safeCall = (fn, unavailableValue = null) => {
    try {
      return fn();
    } catch {
      return unavailableValue;
    }
  };

  const signals = [
    makeSignal(
      "isChinaUser",
      "Combined isChinaUser()",
      safeCall(() => mod.isChinaUser(checkOptions), null),
      "is-china-user",
      "Synchronous aggregate of language, timezone, emoji, and font signals.",
    ),
    makeSignal(
      "language",
      "Language",
      safeCall(() => mod.isChinaByLanguage(checkOptions), null),
      "is-china-user",
      "Uses navigator.language/languages when available.",
    ),
    makeSignal(
      "timeZone",
      "Timezone",
      safeCall(() => mod.isChinaByTimeZone(checkOptions), null),
      "is-china-user",
      "Uses Intl timezone or UTC+8 fallback unless strict=true.",
    ),
    makeSignal(
      "emoji",
      "Emoji rendering",
      safeCall(() => mod.isChinaByEmoji(), null),
      "is-china-user",
      "Requires DOM/canvas; usually unavailable in Node.js.",
    ),
    makeSignal(
      "font",
      "Chinese font availability",
      safeCall(() => mod.isChinaByFont(), null),
      "is-china-user",
      "Requires DOM/canvas; Node.js usually returns false.",
    ),
  ];

  if (options.includeNetwork) {
    const network = await safeAsyncCall(async () =>
      mod.isChinaByNetwork({ detail: true, timeout: 3000 }),
    );
    signals.push(
      makeSignal(
        "network",
        "Optional network probe",
        network && typeof network === "object" ? network.result : network,
        "is-china-user",
        "Optional remote image reachability probe.",
      ),
    );
  } else {
    signals.push(
      makeSignal(
        "network",
        "Optional network probe",
        "skipped",
        "is-china-user",
        "Skipped by default to avoid remote requests.",
      ),
    );
  }

  return {
    signals,
    environment: collectEnvironment(),
    options: checkOptions,
  };
}

async function safeAsyncCall(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

function collectEnvironment() {
  const resolved =
    typeof Intl === "object" && typeof Intl.DateTimeFormat === "function"
      ? Intl.DateTimeFormat().resolvedOptions()
      : {};
  return {
    node: process.version,
    platform: process.platform,
    locale: resolved.locale ?? null,
    timeZone: resolved.timeZone ?? null,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    navigatorLanguage: globalThis.navigator?.language ?? null,
    navigatorLanguages: globalThis.navigator?.languages ?? null,
    envLanguage: {
      LANG: process.env.LANG ?? null,
      LC_ALL: process.env.LC_ALL ?? null,
      LC_MESSAGES: process.env.LC_MESSAGES ?? null,
    },
  };
}

function analyze(payload) {
  const positive = payload.signals.filter((signal) => signal.value === true);
  const measured = payload.signals.filter(
    (signal) => signal.value === true || signal.value === false,
  );
  const unavailable = payload.signals.filter(
    (signal) => signal.value === null || signal.value === "skipped",
  );

  let status = STATUS.INCONCLUSIVE;
  if (positive.length > 0) status = STATUS.DETECTED;
  else if (measured.length > 0 && unavailable.length < payload.signals.length) {
    status = STATUS.CLEAR;
  }

  return {
    status,
    positiveSignalCount: positive.length,
    measuredSignalCount: measured.length,
    unavailableSignalCount: unavailable.length,
    caveat:
      "This is a runtime signal report, not a legal, identity, residency, or eligibility determination.",
  };
}

function buildReport(payload) {
  const analysis = analyze(payload);
  return {
    tool: "qiaomu-ai-access",
    generatedAt: new Date().toISOString(),
    analysis,
    options: payload.options,
    environment: payload.environment,
    signals: payload.signals,
    consentPrompt: CONSENT_PROMPT,
    allowedNextSteps: [
      "Review official AI service availability and terms.",
      "Use English prompts or UI preferences when that improves model interaction quality.",
      "Separate AI work into a dedicated browser profile for privacy and workflow clarity.",
      "Remove irrelevant location claims from prompts, docs, and workspace context.",
    ],
    disallowedNextSteps: [
      "Geofence or sanctions evasion.",
      "IP, account-region, KYC, residency, or payment misrepresentation.",
      "CAPTCHA, device-fingerprint, or platform risk-control bypass.",
      "VPN/proxy stealth or anti-detection instructions.",
    ],
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# AI Access Signal Check");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Status: \`${report.analysis.status}\``);
  lines.push("");
  lines.push("> This report describes runtime signals only. It is not a legal, identity, residency, or eligibility determination.");
  lines.push("");
  lines.push("## Signals");
  lines.push("");
  lines.push("| Signal | Value | Source | Note |");
  lines.push("|---|---:|---|---|");
  for (const signal of report.signals) {
    lines.push(
      `| ${signal.label} | \`${valueLabel(signal.value)}\` | ${signal.source} | ${signal.note} |`,
    );
  }
  lines.push("");
  lines.push("## Runtime");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.environment, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Consent Prompt");
  lines.push("");
  lines.push(report.consentPrompt);
  lines.push("");
  lines.push("## Allowed Next Steps");
  lines.push("");
  for (const step of report.allowedNextSteps) lines.push(`- ${step}`);
  lines.push("");
  lines.push("## Disallowed Next Steps");
  lines.push("");
  for (const step of report.disallowedNextSteps) lines.push(`- ${step}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const collected = args.fixture
    ? await collectFromFixture(args.fixture)
    : await collectFromRuntime(args);
  const report = buildReport(collected);
  const rendered = args.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : renderMarkdown(report);

  if (args.output) {
    const outputPath = path.resolve(args.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, rendered, "utf8");
  }

  process.stdout.write(rendered);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
