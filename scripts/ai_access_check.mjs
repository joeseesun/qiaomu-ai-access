#!/usr/bin/env node

import {
  access,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";

const STATUS = {
  DETECTED: "china-signals-detected",
  CLEAR: "no-china-signal-detected",
  INCONCLUSIVE: "inconclusive",
};

const CONSENT_PROMPT =
  "是否继续做合规隐私卫生检查？我可以帮你减少 prompt、浏览器偏好和工作区说明里不必要的地域信号；不会帮助绕过平台地域限制、伪装 IP/身份、规避风控或违反服务条款。";

const DEFAULT_NETWORK_TIMEOUT_MS = 3000;

function parseArgs(argv) {
  const args = {
    json: false,
    includeBrowser: false,
    includeNetwork: false,
    mainland: false,
    strict: false,
    output: "",
    fixture: "",
    browserExecutable: process.env.QIAOMU_AI_ACCESS_BROWSER ?? "",
    networkTimeout: DEFAULT_NETWORK_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--include-browser") args.includeBrowser = true;
    else if (arg === "--include-network") args.includeNetwork = true;
    else if (arg === "--mainland") args.mainland = true;
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--output") args.output = argv[++i] ?? "";
    else if (arg === "--fixture") args.fixture = argv[++i] ?? "";
    else if (arg === "--browser-executable") args.browserExecutable = argv[++i] ?? "";
    else if (arg === "--network-timeout") {
      const raw = Number(argv[++i] ?? "");
      if (!Number.isInteger(raw) || raw <= 0) {
        throw new Error("--network-timeout must be a positive integer in milliseconds");
      }
      args.networkTimeout = raw;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.includeNetwork && !args.includeBrowser) {
    args.includeBrowser = true;
  }

  return args;
}

function printHelp() {
  console.log(`qiaomu-ai-access

Usage:
  node scripts/ai_access_check.mjs [--json] [--output reports/latest-ai-access-check.md]

Options:
  --json                       Print JSON instead of Markdown.
  --output <path>              Write the rendered report to a file.
  --mainland                   Pass mainland=true to is-china-user checks.
  --strict                     Pass strict=true to is-china-user checks.
  --include-browser            Run browser DOM/canvas checks in a temporary Chrome/Chromium context.
  --include-network            Also run the upstream network probe in browser context.
  --browser-executable <path>  Use a specific Chrome/Chromium executable.
  --network-timeout <ms>       Network probe timeout per image. Default: ${DEFAULT_NETWORK_TIMEOUT_MS}.
  --fixture <path>             Load fixture JSON for tests.
`);
}

function valueLabel(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  if (value === null) return "unavailable";
  if (value === "skipped") return "skipped";
  return String(value);
}

function makeSignal(id, label, value, source, note = "", extra = {}) {
  return { id, label, value, source, note, ...extra };
}

function makeCoverage(layer, status, note = "") {
  return { layer, status, note };
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
      {
        layer: item.layer ?? "fixture",
        detail: item.detail,
      },
    ),
  );
  return {
    signals,
    coverage: fixture.coverage ?? [
      makeCoverage("fixture", "verified", "Loaded from a file-backed fixture."),
    ],
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

  const signals = collectNodeSignals(mod, checkOptions, options);
  const coverage = [
    makeCoverage(
      "runtime",
      "verified",
      "Node.js runtime checked language, timezone, and package imports. DOM/canvas signals are not available here.",
    ),
  ];

  let browserEnvironment = null;
  if (options.includeBrowser) {
    const browserResult = await collectBrowserSignals(checkOptions, options);
    coverage.push(browserResult.coverage);
    if (browserResult.networkCoverage) coverage.push(browserResult.networkCoverage);
    signals.push(...browserResult.signals);
    browserEnvironment = browserResult.environment;
  } else {
    coverage.push(
      makeCoverage(
        "browser",
        "skipped",
        "Run with --include-browser to measure navigator, timezone, emoji, and font in a real browser context.",
      ),
    );
    coverage.push(
      makeCoverage(
        "network",
        "skipped",
        "Run with --include-network to measure upstream remote image reachability probes.",
      ),
    );
  }

  return {
    signals,
    coverage,
    environment: {
      runtime: collectNodeEnvironment(),
      browser: browserEnvironment,
    },
    options: {
      mainland: options.mainland,
      strict: options.strict,
      includeBrowser: options.includeBrowser,
      includeNetwork: options.includeNetwork,
      networkTimeout: options.networkTimeout,
      browserExecutable: options.browserExecutable || null,
    },
  };
}

function collectNodeSignals(mod, checkOptions, options) {
  const safeCall = (fn, unavailableValue = null) => {
    try {
      return fn();
    } catch {
      return unavailableValue;
    }
  };

  return [
    makeSignal(
      "isChinaUser",
      "Combined isChinaUser()",
      safeCall(() => mod.isChinaUser(checkOptions), null),
      "is-china-user",
      "Node runtime aggregate of language, timezone, emoji, and font signals.",
      { layer: "runtime" },
    ),
    makeSignal(
      "language",
      "Language",
      safeCall(() => mod.isChinaByLanguage(checkOptions), null),
      "is-china-user",
      "Uses navigator.language/languages when available.",
      { layer: "runtime" },
    ),
    makeSignal(
      "timeZone",
      "Timezone",
      safeCall(() => mod.isChinaByTimeZone(checkOptions), null),
      "is-china-user",
      "Uses Intl timezone or UTC+8 fallback unless strict=true.",
      { layer: "runtime" },
    ),
    makeSignal(
      "emoji",
      "Emoji rendering",
      safeCall(() => mod.isChinaByEmoji(), null),
      "is-china-user",
      "Requires DOM/canvas; unavailable in Node.js.",
      { layer: "runtime" },
    ),
    makeSignal(
      "font",
      "Chinese font availability",
      safeCall(() => mod.isChinaByFont(), null),
      "is-china-user",
      "Requires DOM/canvas; Node.js usually returns false.",
      { layer: "runtime" },
    ),
    makeSignal(
      "network",
      "Optional network probe",
      options.includeNetwork ? null : "skipped",
      "is-china-user",
      options.includeNetwork
        ? "Network probing requires browser Image loading; measured in browser layer when available."
        : "Skipped by default to avoid remote requests.",
      { layer: "runtime" },
    ),
  ];
}

async function collectBrowserSignals(checkOptions, options) {
  let playwright;
  try {
    playwright = await import("playwright-core");
  } catch (error) {
    return {
      signals: [],
      environment: null,
      coverage: makeCoverage(
        "browser",
        "unavailable",
        `Cannot import playwright-core. Run npm install. Original error: ${error.message}`,
      ),
      networkCoverage: options.includeNetwork
        ? makeCoverage("network", "unavailable", "Browser layer was unavailable.")
        : makeCoverage("network", "skipped", "Run with --include-network to measure remote probes."),
    };
  }

  const executablePaths = await resolveBrowserExecutables(
    options.browserExecutable,
    playwright,
  );
  if (executablePaths.length === 0) {
    return {
      signals: [],
      environment: null,
      coverage: makeCoverage(
        "browser",
        "unavailable",
        "No Chrome/Chromium executable found. Pass --browser-executable or install Google Chrome/Chromium.",
      ),
      networkCoverage: options.includeNetwork
        ? makeCoverage("network", "unavailable", "Browser layer was unavailable.")
        : makeCoverage("network", "skipped", "Run with --include-network to measure remote probes."),
    };
  }

  const errors = [];
  for (const executablePath of executablePaths) {
    try {
      return await runBrowserProbe(playwright, executablePath, checkOptions, options);
    } catch (error) {
      errors.push(`${executablePath}: ${compactError(error)}`);
    }
  }

  return {
    signals: [],
    environment: null,
    coverage: makeCoverage(
      "browser",
      "unavailable",
      `No browser probe completed. ${errors.join(" | ")}`,
    ),
    networkCoverage: options.includeNetwork
      ? makeCoverage("network", "unavailable", "Browser probe failed before network measurement.")
      : makeCoverage("network", "skipped", "Run with --include-network to measure remote probes."),
  };
}

async function runBrowserProbe(playwright, executablePath, checkOptions, options) {
  let browser;
  try {
    const packageScript = await loadBrowserPackageScript();
    browser = await playwright.chromium.launch({
      headless: true,
      executablePath,
      timeout: 10000,
    });
    const page = await browser.newPage();
    await page.setContent("<!doctype html><meta charset=\"utf-8\">", {
      waitUntil: "domcontentloaded",
    });
    await page.addScriptTag({ content: packageScript });
    const payload = await withTimeout(
      page.evaluate(
        async ({ browserCheckOptions, includeNetwork, networkTimeout }) => {
          const mod = window.__qiaomuIsChinaUser;
          if (!mod) throw new Error("is-china-user browser bundle was not injected.");

          const safe = (key, fn) => {
            try {
              return { key, value: fn(), error: null };
            } catch (error) {
              return {
                key,
                value: null,
                error: error && error.message ? error.message : String(error),
              };
            }
          };

          const checks = [
            safe("isChinaUser", () => mod.isChinaUser(browserCheckOptions)),
            safe("language", () => mod.isChinaByLanguage(browserCheckOptions)),
            safe("timeZone", () => mod.isChinaByTimeZone(browserCheckOptions)),
            safe("emoji", () => mod.isChinaByEmoji()),
            safe("font", () => mod.isChinaByFont()),
          ];
          const values = Object.fromEntries(checks.map((item) => [item.key, item.value]));
          const errors = Object.fromEntries(
            checks
              .filter((item) => item.error)
              .map((item) => [item.key, item.error]),
          );

          let networkDetail = null;
          if (includeNetwork) {
            try {
              networkDetail = await mod.isChinaByNetwork({
                detail: true,
                timeout: networkTimeout,
              });
            } catch (error) {
              errors.network = error && error.message ? error.message : String(error);
            }
          }

          return {
            environment: {
              userAgent: navigator.userAgent,
              platform: navigator.platform,
              language: navigator.language,
              languages: Array.from(navigator.languages || []),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              timezoneOffsetMinutes: new Date().getTimezoneOffset(),
            },
            signals: {
              ...values,
              network: includeNetwork ? networkDetail?.result ?? null : "skipped",
            },
            errors,
            networkDetail,
          };
        },
        {
          browserCheckOptions: checkOptions,
          includeNetwork: options.includeNetwork,
          networkTimeout: options.networkTimeout,
        },
      ),
      Math.max(options.networkTimeout + 3000, 8000),
      "Timed out waiting for browser signal probe.",
    );

    const signals = browserPayloadToSignals(payload, options);
    return {
      signals,
      environment: payload.environment,
      coverage: makeCoverage(
        "browser",
        "verified",
        `Measured in a temporary browser context using ${executablePath}. No personal browser profile was used.`,
      ),
      networkCoverage: options.includeNetwork
        ? makeCoverage(
            "network",
            payload.networkDetail?.result === null
              ? "verified-inconclusive"
              : "verified",
            "Measured through upstream isChinaByNetwork() remote image probes.",
          )
        : makeCoverage(
            "network",
            "skipped",
            "Run with --include-network to measure upstream remote image reachability probes.",
          ),
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function resolveBrowserExecutables(explicitPath, playwright) {
  if (explicitPath) {
    return (await canAccess(explicitPath)) ? [explicitPath] : [];
  }

  const candidates = [
    ...(await findPlaywrightHeadlessShellCandidates()),
    safeExecutablePath(() => playwright.chromium.executablePath()),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  const uniqueCandidates = [...new Set(candidates)];
  const executablePaths = [];
  for (const candidate of uniqueCandidates) {
    if (await canAccess(candidate)) executablePaths.push(candidate);
  }
  return executablePaths;
}

async function findPlaywrightHeadlessShellCandidates() {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== "0"
      ? process.env.PLAYWRIGHT_BROWSERS_PATH
      : "",
    path.join(homedir(), "Library", "Caches", "ms-playwright"),
    path.join(homedir(), ".cache", "ms-playwright"),
    path.join(homedir(), "AppData", "Local", "ms-playwright"),
  ].filter(Boolean);
  const platformExecutables = [
    path.join("chrome-headless-shell-mac-arm64", "chrome-headless-shell"),
    path.join("chrome-headless-shell-mac-x64", "chrome-headless-shell"),
    path.join("chrome-headless-shell-linux64", "chrome-headless-shell"),
    path.join("chrome-headless-shell-linux", "chrome-headless-shell"),
    path.join("chrome-headless-shell-win64", "chrome-headless-shell.exe"),
  ];
  const candidates = [];

  for (const root of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries
      .filter((item) => item.isDirectory() && item.name.startsWith("chromium_headless_shell-"))
      .sort((a, b) => b.name.localeCompare(a.name))) {
      for (const executable of platformExecutables) {
        candidates.push(path.join(root, entry.name, executable));
      }
    }
  }

  return candidates;
}

function safeExecutablePath(fn) {
  try {
    return fn();
  } catch {
    return "";
  }
}

async function canAccess(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

function compactError(error) {
  return String(error && error.message ? error.message : error)
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
}

async function loadBrowserPackageScript() {
  const packageModulePath = path.resolve("node_modules/is-china-user/dist/index.cjs");
  const packageCode = await readFile(packageModulePath, "utf8");
  return `window.__qiaomuIsChinaUser = {};
{
  const exports = window.__qiaomuIsChinaUser;
${packageCode}
}`;
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function browserPayloadToSignals(payload, options) {
  const source = "is-china-user/browser";
  const note = (key, base) => {
    const error = payload.errors?.[key];
    return error ? `${base} Probe error: ${compactError(error)}.` : base;
  };
  return [
    makeSignal(
      "browser.isChinaUser",
      "Browser combined isChinaUser()",
      payload.signals.isChinaUser,
      source,
      note("isChinaUser", "Browser aggregate of language, timezone, emoji, and font signals."),
      { layer: "browser" },
    ),
    makeSignal(
      "browser.language",
      "Browser language",
      payload.signals.language,
      source,
      note("language", "Uses browser navigator.language/languages."),
      { layer: "browser" },
    ),
    makeSignal(
      "browser.timeZone",
      "Browser timezone",
      payload.signals.timeZone,
      source,
      note("timeZone", "Uses browser Intl timezone or UTC+8 fallback unless strict=true."),
      { layer: "browser" },
    ),
    makeSignal(
      "browser.emoji",
      "Browser emoji rendering",
      payload.signals.emoji,
      source,
      note("emoji", "Uses browser canvas rendering of emoji and flag characters."),
      { layer: "browser" },
    ),
    makeSignal(
      "browser.font",
      "Browser Chinese font availability",
      payload.signals.font,
      source,
      note("font", "Uses browser canvas text metrics against upstream Chinese font list."),
      { layer: "browser" },
    ),
    makeSignal(
      "browser.network",
      "Browser optional network probe",
      payload.signals.network,
      source,
      note(
        "network",
        options.includeNetwork
          ? "Uses upstream remote image reachability probes."
          : "Skipped by default to avoid remote requests.",
      ),
      {
        layer: "browser",
        detail: payload.networkDetail,
      },
    ),
  ];
}

function collectNodeEnvironment() {
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
  const coverageLevel = payload.coverage
    .filter((item) => item.status.startsWith("verified"))
    .map((item) => item.layer)
    .join("+");

  let status = STATUS.INCONCLUSIVE;
  if (positive.length > 0) status = STATUS.DETECTED;
  else if (measured.length > 0 && unavailable.length < payload.signals.length) {
    status = STATUS.CLEAR;
  }

  return {
    status,
    coverageLevel: coverageLevel || "none",
    positiveSignalCount: positive.length,
    measuredSignalCount: measured.length,
    unavailableSignalCount: unavailable.length,
    caveat:
      "This is a runtime and optional browser/network signal report, not a legal, identity, residency, or eligibility determination.",
  };
}

function buildReport(payload) {
  const analysis = analyze(payload);
  return {
    tool: "qiaomu-ai-access",
    generatedAt: new Date().toISOString(),
    analysis,
    options: payload.options,
    coverage: payload.coverage,
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
  lines.push(`Coverage: \`${report.analysis.coverageLevel}\``);
  lines.push("");
  lines.push("> This report describes runtime, browser, and optional network signals only. It is not a legal, identity, residency, or eligibility determination.");
  lines.push("");
  lines.push("## Coverage");
  lines.push("");
  lines.push("| Layer | Status | Note |");
  lines.push("|---|---|---|");
  for (const item of report.coverage) {
    lines.push(`| ${item.layer} | \`${item.status}\` | ${item.note} |`);
  }
  lines.push("");
  lines.push("## Signals");
  lines.push("");
  lines.push("| Layer | Signal | Value | Source | Note |");
  lines.push("|---|---|---:|---|---|");
  for (const signal of report.signals) {
    lines.push(
      `| ${signal.layer ?? "runtime"} | ${signal.label} | \`${valueLabel(signal.value)}\` | ${signal.source} | ${signal.note} |`,
    );
  }
  lines.push("");
  lines.push("## Environment");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.environment, null, 2));
  lines.push("```");
  lines.push("");
  const networkDetails = report.signals
    .filter((signal) => signal.detail)
    .map((signal) => ({ id: signal.id, detail: signal.detail }));
  if (networkDetails.length) {
    lines.push("## Probe Details");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(networkDetails, null, 2));
    lines.push("```");
    lines.push("");
  }
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
