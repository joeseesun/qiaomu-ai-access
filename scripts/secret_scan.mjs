#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", "node_modules", ".DS_Store"]);
const SKIP_FILES = new Set(["package-lock.json"]);

const PATTERNS = [
  { name: "OpenAI-style secret key", regex: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: "GitHub token", regex: /gh[opsu]_[A-Za-z0-9_]{20,}/g },
  { name: "AWS access key", regex: /AKIA[0-9A-Z]{16}/g },
  {
    name: "Private key block",
    regex: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g,
  },
  {
    name: "Hard-coded password assignment",
    regex: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{8,}["']/gi,
  },
];

async function walk(dir, files = []) {
  for (const entry of await readdir(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const rel = path.relative(ROOT, full);
    const info = await stat(full);
    if (info.isDirectory()) await walk(full, files);
    else if (!SKIP_FILES.has(entry)) files.push(rel);
  }
  return files;
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

const findings = [];
for (const rel of await walk(ROOT)) {
  const full = path.join(ROOT, rel);
  let text;
  try {
    text = await readFile(full, "utf8");
  } catch {
    continue;
  }
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern.regex)) {
      findings.push({
        file: rel,
        line: lineNumber(text, match.index ?? 0),
        pattern: pattern.name,
      });
    }
  }
}

const result = {
  ok: findings.length === 0,
  scannedRoot: ROOT,
  findings,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(2);
