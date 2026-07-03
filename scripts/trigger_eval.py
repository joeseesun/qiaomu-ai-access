#!/usr/bin/env python3
"""Lightweight trigger-boundary eval for qiaomu-ai-access."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


POSITIVE_TERMS = [
    "qiaomu-ai-access",
    "ischinauser",
    "中国用户",
    "中国用户特征",
    "顶级ai",
    "ai access",
    "region signal",
    "环境信号",
    "浏览器检测",
    "真实浏览器",
    "全面吸收",
    "全面检测",
    "browser",
    "network probe",
    "隐私卫生",
]

HARD_NEGATIVE_TERMS = [
    "购买 vpn",
    "vpn",
    "绕过 openai",
    "绕过平台",
    "伪造付款",
    "kyc",
    "验证码",
    "设备指纹",
    "风控",
]


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def should_trigger(text: str) -> bool:
    text = normalize(text)
    if any(term in text for term in HARD_NEGATIVE_TERMS):
        return False
    hits = sum(1 for term in POSITIVE_TERMS if term in text)
    has_ai = "ai" in text or "模型" in text
    has_detect = "检测" in text or "check" in text or "signal" in text
    return hits >= 1 or (has_ai and has_detect and ("中国" in text or "region" in text))


def iter_cases(cases: dict[str, Any], bucket: str) -> list[dict[str, str]]:
    output = []
    for raw in cases.get(bucket, []):
        if isinstance(raw, str):
            output.append({"text": raw, "family": "default"})
        elif isinstance(raw, dict):
            output.append({"text": str(raw.get("text", "")), "family": str(raw.get("family", "default"))})
    return output


def evaluate(cases: dict[str, Any]) -> dict[str, Any]:
    results: dict[str, list[dict[str, Any]]] = {}
    failures: list[dict[str, Any]] = []
    total = 0
    passed = 0
    expected_by_bucket = {
        "should_trigger": True,
        "should_not_trigger": False,
        "near_neighbor": False,
    }

    for bucket, expected in expected_by_bucket.items():
        results[bucket] = []
        for case in iter_cases(cases, bucket):
            prediction = should_trigger(case["text"])
            ok = prediction == expected
            item = {
                "prompt": case["text"],
                "family": case["family"],
                "expected_trigger": expected,
                "predicted_trigger": prediction,
                "passed": ok,
            }
            results[bucket].append(item)
            total += 1
            if ok:
                passed += 1
            else:
                failures.append({"bucket": bucket, **item})

    return {
        "ok": not failures,
        "summary": {
            "total": total,
            "passed": passed,
            "pass_rate": round(passed / total, 3) if total else 0,
        },
        "failures": failures,
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate qiaomu-ai-access trigger cases.")
    parser.add_argument("skill_dir", nargs="?", default=".")
    parser.add_argument("--cases", default="evals/trigger_cases.json")
    parser.add_argument("--output", "-o")
    args = parser.parse_args()

    root = Path(args.skill_dir).resolve()
    cases_path = Path(args.cases)
    if not cases_path.is_absolute():
        cases_path = root / cases_path
    result = evaluate(load_json(cases_path))
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        output = Path(args.output)
        if not output.is_absolute():
            output = root / output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    if not result["ok"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
