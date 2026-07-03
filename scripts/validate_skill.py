#!/usr/bin/env python3
"""Validate the qiaomu-ai-access skill package."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover
    yaml = None


REQUIRED_FILES = [
    "SKILL.md",
    "README.md",
    "LICENSE",
    "package.json",
    "agents/interface.yaml",
    "manifest.json",
    "evals/trigger_cases.json",
    "references/safety-boundary.md",
    "references/upstream-is-china-user.md",
    "scripts/ai_access_check.mjs",
    "scripts/assert_browser_smoke.mjs",
    "scripts/secret_scan.mjs",
]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(read_text(path))
    if not isinstance(payload, dict):
        raise ValueError(f"{path}: expected JSON object")
    return payload


def load_yaml(path: Path) -> dict[str, Any]:
    if yaml is None:
        return {}
    payload = yaml.safe_load(read_text(path)) or {}
    return payload if isinstance(payload, dict) else {}


def parse_frontmatter(text: str) -> dict[str, Any]:
    if not text.startswith("---\n"):
        return {}
    lines = text.splitlines()
    try:
        end = lines[1:].index("---") + 1
    except ValueError:
        return {}
    raw = "\n".join(lines[1:end])
    if yaml is not None:
        payload = yaml.safe_load(raw) or {}
        return payload if isinstance(payload, dict) else {}
    output: dict[str, Any] = {}
    for line in raw.splitlines():
        if ":" in line and not line.startswith(" "):
            key, value = line.split(":", 1)
            output[key.strip()] = value.strip().strip("'\"|")
    return output


def validate(root: Path) -> dict[str, Any]:
    root = root.resolve()
    failures: list[str] = []
    warnings: list[str] = []

    for rel in REQUIRED_FILES:
        if not (root / rel).exists():
            failures.append(f"missing required file: {rel}")

    if (root / "SKILL.md").exists():
        frontmatter = parse_frontmatter(read_text(root / "SKILL.md"))
        if frontmatter.get("name") != "qiaomu-ai-access":
            failures.append("SKILL.md frontmatter name must be qiaomu-ai-access")
        description = str(frontmatter.get("description", ""))
        for term in ("qiaomu", "skill", "isChinaUser", "AI", "consent"):
            if term.lower() not in description.lower():
                failures.append(f"SKILL.md description missing routing term: {term}")
        for disallowed in ("KYC", "fingerprint", "geofence"):
            if disallowed.lower() not in description.lower():
                warnings.append(f"SKILL.md description may be missing boundary term: {disallowed}")

    if (root / "README.md").exists():
        readme = read_text(root / "README.md")
        required_snippets = [
            "npx skills add joeseesun/qiaomu-ai-access",
            "你可以直接这样说",
            "安全边界",
            "is-china-user",
            "Troubleshooting",
            "npm run detect:browser",
            "npm run detect:full",
            "# English",
        ]
        for snippet in required_snippets:
            if snippet not in readme:
                failures.append(f"README.md missing required snippet: {snippet}")
        if "不会帮助绕过平台地域限制" not in readme:
            failures.append("README.md must include the explicit non-bypass boundary")

    if (root / "package.json").exists():
        package = load_json(root / "package.json")
        if package.get("name") != "qiaomu-ai-access":
            failures.append("package.json name must be qiaomu-ai-access")
        deps = package.get("dependencies", {})
        if "is-china-user" not in deps:
            failures.append("package.json must depend on is-china-user")
        if "playwright-core" not in deps:
            failures.append("package.json must depend on playwright-core for browser coverage")
        for script in (
            "test",
            "detect",
            "detect:browser",
            "detect:full",
            "smoke:browser",
            "validate:skill",
            "eval:trigger",
            "export:ir",
            "secret:scan",
        ):
            if script not in package.get("scripts", {}):
                failures.append(f"package.json missing script: {script}")

    if (root / "agents/interface.yaml").exists():
        interface = load_yaml(root / "agents/interface.yaml")
        meta = interface.get("interface", {}) if isinstance(interface, dict) else {}
        compatibility = interface.get("compatibility", {}) if isinstance(interface, dict) else {}
        for field in ("display_name", "short_description", "default_prompt"):
            if not meta.get(field):
                failures.append(f"agents/interface.yaml missing interface.{field}")
        targets = compatibility.get("adapter_targets", [])
        for target in ("openai", "claude", "generic", "agent-skills-compatible"):
            if target not in targets:
                failures.append(f"agents/interface.yaml missing target: {target}")

    if (root / "manifest.json").exists():
        manifest = load_json(root / "manifest.json")
        for field in ("name", "version", "owner", "updated_at", "status", "maturity_tier", "release_gates"):
            if not manifest.get(field):
                failures.append(f"manifest.json missing field: {field}")

    if (root / "evals/trigger_cases.json").exists():
        cases = load_json(root / "evals/trigger_cases.json")
        for bucket in ("should_trigger", "should_not_trigger", "near_neighbor"):
            if not cases.get(bucket):
                failures.append(f"trigger cases missing bucket: {bucket}")

    vendored_patterns = [
        "src/isChinaByLanguage.ts",
        "src/isChinaByTimeZone.ts",
        "src/isChinaByEmoji.ts",
        "src/isChinaByFont.ts",
    ]
    for rel in vendored_patterns:
        if (root / rel).exists():
            failures.append(f"do not vendor upstream source without license: {rel}")

    for path in root.rglob("*"):
        if ".git" in path.parts or "node_modules" in path.parts:
            continue
        if path.is_file() and path.suffix in {".md", ".yaml", ".json", ".mjs", ".py"}:
            text = read_text(path)
            if re.search(r"gh[opsu]_[A-Za-z0-9_]{20,}", text):
                failures.append(f"possible GitHub token in {path.relative_to(root)}")

    return {
        "ok": not failures,
        "root": str(root),
        "failures": failures,
        "warnings": warnings,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate qiaomu-ai-access.")
    parser.add_argument("skill_dir", nargs="?", default=".")
    args = parser.parse_args()
    result = validate(Path(args.skill_dir))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result["ok"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
