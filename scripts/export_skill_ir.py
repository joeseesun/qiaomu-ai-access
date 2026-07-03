#!/usr/bin/env python3
"""Export a compact Skill IR for qiaomu-ai-access."""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Any

try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover
    yaml = None


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    payload = json.loads(read_text(path))
    return payload if isinstance(payload, dict) else {}


def load_yaml(path: Path) -> dict[str, Any]:
    if yaml is None or not path.exists():
        return {}
    payload = yaml.safe_load(read_text(path)) or {}
    return payload if isinstance(payload, dict) else {}


def parse_frontmatter(path: Path) -> dict[str, Any]:
    text = read_text(path)
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
    return {}


def case_texts(cases: dict[str, Any], bucket: str) -> list[str]:
    output: list[str] = []
    for raw in cases.get(bucket, []):
        if isinstance(raw, str):
            output.append(raw)
        elif isinstance(raw, dict) and raw.get("text"):
            output.append(str(raw["text"]))
    return output


def build_ir(root: Path) -> dict[str, Any]:
    manifest = load_json(root / "manifest.json")
    package = load_json(root / "package.json")
    frontmatter = parse_frontmatter(root / "SKILL.md")
    interface = load_yaml(root / "agents/interface.yaml")
    cases = load_json(root / "evals/trigger_cases.json")
    compatibility = interface.get("compatibility", {}) if isinstance(interface, dict) else {}

    return {
        "schema_version": "2.0.0-qiaomu-lite",
        "generated_at": date.today().isoformat(),
        "package": {
            "name": manifest.get("name"),
            "version": manifest.get("version"),
            "owner": manifest.get("owner"),
            "maturity_tier": manifest.get("maturity_tier"),
            "lifecycle_stage": manifest.get("lifecycle_stage"),
            "license": package.get("license"),
            "upstream_dependency": "yArna/isChinaUser / npm:is-china-user",
        },
        "intent": {
            "description": frontmatter.get("description", ""),
            "job_to_be_done": "Detect China-related AI access environment signals, report them transparently, then ask for consent before safe privacy hygiene.",
            "target_users": [
                "Qiaomu operator",
                "AI builders checking local/browser runtime signals",
                "agent users who need a safe boundary before model access setup"
            ],
            "non_goals": [
                "geofence bypass",
                "VPN/proxy evasion",
                "identity, payment, KYC, account-region, CAPTCHA, or fingerprint bypass"
            ],
        },
        "triggers": {
            "should_trigger": case_texts(cases, "should_trigger"),
            "should_not_trigger": case_texts(cases, "should_not_trigger"),
            "near_neighbor": case_texts(cases, "near_neighbor"),
        },
        "workflow": [
            "state safety boundary",
            "run npm run detect",
            "summarize signal report",
            "ask required consent question",
            "provide only compliant, non-destructive privacy hygiene if user agrees"
        ],
        "resources": {
            "runtime_script": "scripts/ai_access_check.mjs",
            "references": [
                "references/safety-boundary.md",
                "references/upstream-is-china-user.md"
            ],
            "evals": ["evals/trigger_cases.json"],
            "reports": ["reports/trust-boundary.md", "reports/trigger-eval.json"]
        },
        "portability": {
            "canonical_format": compatibility.get("canonical_format"),
            "adapter_targets": compatibility.get("adapter_targets", []),
            "activation": compatibility.get("activation", {}),
            "execution": compatibility.get("execution", {}),
            "trust": compatibility.get("trust", {}),
            "permissions": compatibility.get("permissions", {}),
            "degradation": compatibility.get("degradation", {}),
        },
        "gates": manifest.get("release_gates", {}),
        "evidence_boundary": {
            "local_cli_detection": "verified by npm test and npm run detect",
            "browser_dom_canvas_detection": "missing evidence unless user runs upstream in a browser context",
            "network_probe": "optional and off by default",
            "upstream_license_review": "missing evidence; upstream has no declared license metadata",
            "public_claim_policy": "claim only local validations, install proof, and GitHub state verified in the current run"
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Skill IR for qiaomu-ai-access.")
    parser.add_argument("skill_dir", nargs="?", default=".")
    parser.add_argument("--output", "-o")
    args = parser.parse_args()
    root = Path(args.skill_dir).resolve()
    payload = build_ir(root)
    rendered = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output:
        output = Path(args.output)
        if not output.is_absolute():
            output = root / output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
