#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
from dataclasses import dataclass


@dataclass
class Case:
    id: str
    contract: str
    bug_class: str
    vulnerable: bool
    slither_checks: tuple[str, ...]
    foundry_test: str


CASES = [
    Case(
        id="replay-vuln",
        contract="contracts/benchmark2/VulnReplayWallet.sol",
        bug_class="signature-replay",
        vulnerable=True,
        slither_checks=(),
        foundry_test="testReplayVulnerabilityConfirmed",
    ),
    Case(
        id="replay-safe",
        contract="contracts/benchmark2/SafeNonceWallet.sol",
        bug_class="signature-replay",
        vulnerable=False,
        slither_checks=(),
        foundry_test="testReplayBlockedInSafeWallet",
    ),
    Case(
        id="init-hijack-vuln",
        contract="contracts/benchmark2/VulnInitHijackVault.sol",
        bug_class="unprotected-initialize",
        vulnerable=True,
        slither_checks=(),
        foundry_test="testInitHijackVulnerabilityConfirmed",
    ),
    Case(
        id="init-hijack-safe",
        contract="contracts/benchmark2/SafeInitializableVault.sol",
        bug_class="unprotected-initialize",
        vulnerable=False,
        slither_checks=(),
        foundry_test="testInitHijackBlockedInSafeVault",
    ),
    Case(
        id="stale-oracle-vuln",
        contract="contracts/benchmark2/VulnStaleOracleConsumer.sol",
        bug_class="stale-oracle",
        vulnerable=True,
        slither_checks=(),
        foundry_test="testStalePriceAcceptedInVulnerableConsumer",
    ),
    Case(
        id="stale-oracle-safe",
        contract="contracts/benchmark2/SafeOracleConsumer.sol",
        bug_class="stale-oracle",
        vulnerable=False,
        slither_checks=(),
        foundry_test="testStalePriceRejectedInSafeConsumer",
    ),
    Case(
        id="storage-collision-vuln",
        contract="contracts/benchmark2/VulnProxyStorageCollision.sol",
        bug_class="proxy-storage-collision",
        vulnerable=True,
        slither_checks=(),
        foundry_test="testProxyStorageCollisionDrainsFunds",
    ),
]


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def load_slither_findings(path: str) -> dict[str, set[str]]:
    with open(path, encoding="utf-8") as f:
        payload = json.load(f)

    findings: dict[str, set[str]] = {}
    for row in payload["results"]["detectors"]:
        file_name = row["elements"][0]["source_mapping"]["filename_relative"]
        findings.setdefault(file_name, set()).add(row["check"])
    return findings


def parse_foundry_passed_tests(output: str) -> set[str]:
    passed = set()
    for line in output.splitlines():
        m = re.search(r"\[PASS\]\s+([^(\s]+)", line)
        if m:
            passed.add(m.group(1))
    return passed


def confusion(cases: list[Case], pred: dict[str, bool]) -> tuple[int, int, int, int]:
    tp = fp = fn = tn = 0
    for case in cases:
        actual = case.vulnerable
        predicted = pred[case.id]
        if predicted and actual:
            tp += 1
        elif predicted and not actual:
            fp += 1
        elif (not predicted) and actual:
            fn += 1
        else:
            tn += 1
    return tp, fp, fn, tn


def metrics(tp: int, fp: int, fn: int, tn: int) -> tuple[float, float, float]:
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    accuracy = (tp + tn) / (tp + fp + fn + tn) if (tp + fp + fn + tn) else 0.0
    return precision, recall, accuracy


def build_markdown_report(
    rows: list[dict[str, object]],
    metric_rows: list[dict[str, object]],
    mode_label: str,
    blockers: int,
) -> str:
    lines: list[str] = []
    lines.append("# Benchmark2 Combined Security Report")
    lines.append("")
    lines.append("## Matrix")
    lines.append("")
    lines.append("| id | class | vulnerable | slither | foundry | combined | tier |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- |")
    for row in rows:
        lines.append(
            f"| {row['id']} | {row['bug_class']} | {row['vulnerable']} | {row['slither']} | {row['foundry']} | {row['combined']} | {row['tier']} |"
        )

    lines.append("")
    lines.append("## Metrics")
    lines.append("")
    lines.append("| mode | TP | FP | FN | TN | precision | recall | accuracy |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for m in metric_rows:
        lines.append(
            f"| {m['label']} | {m['tp']} | {m['fp']} | {m['fn']} | {m['tn']} | {m['precision']:.2f} | {m['recall']:.2f} | {m['accuracy']:.2f} |"
        )

    lines.append("")
    lines.append("## Policy")
    lines.append("")
    lines.append(f"- Mode: `{mode_label}`")
    lines.append("- Block: Tier A + Tier C")
    lines.append("- Manual review: Tier B")
    lines.append("- Log only: Tier D")
    lines.append(f"- Current blockers (A/C): `{blockers}`")
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run combined Slither + Foundry benchmark2 report")
    parser.add_argument(
        "--artifact",
        default="output/benchmark2-combined-report.md",
        help="Path to markdown artifact file",
    )
    parser.add_argument(
        "--json-artifact",
        default="output/benchmark2-combined-report.json",
        help="Path to JSON artifact file",
    )
    parser.add_argument(
        "--fail-on-blockers",
        action="store_true",
        help="Exit non-zero when Tier A/C blockers are present",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    slither_json = "benchmark2-slither.json"
    if os.path.exists(slither_json):
        os.remove(slither_json)

    slither_cmd = [
        "slither",
        "contracts/benchmark2",
        "--config-file",
        "slither.config.json",
        "--json",
        slither_json,
        "--json-types",
        "detectors",
    ]
    slither_res = run(slither_cmd)
    if slither_res.returncode != 0 and not os.path.exists(slither_json):
        print(slither_res.stdout)
        print(slither_res.stderr)
        print("ERROR: slither execution failed")
        return 1

    forge_cmd = [
        "forge",
        "test",
        "--match-path",
        "contracts/test/Benchmark2Cycle.t.sol",
        "-vv",
    ]
    forge_res = run(forge_cmd)
    if forge_res.returncode != 0:
        print(forge_res.stdout)
        print(forge_res.stderr)
        print("ERROR: forge tests failed")
        return 1

    slither_findings = load_slither_findings(slither_json)
    foundry_pass = parse_foundry_passed_tests(forge_res.stdout)

    slither_pred: dict[str, bool] = {}
    foundry_pred: dict[str, bool] = {}
    combined_pred: dict[str, bool] = {}
    rows: list[dict[str, object]] = []
    blockers = 0

    print("Benchmark2 Combined Security Report")
    print("=" * 35)
    print("id | class | vulnerable | slither | foundry | combined | tier")

    for case in CASES:
        checks = slither_findings.get(case.contract, set())
        slither_detected = any(check in checks for check in case.slither_checks)

        foundry_passed = case.foundry_test in foundry_pass
        foundry_detected = foundry_passed and case.vulnerable

        combined_detected = slither_detected or foundry_detected

        if combined_detected and case.vulnerable:
            tier = "A" if slither_detected and foundry_detected else "C"
        elif combined_detected and not case.vulnerable:
            tier = "D"
        elif (not combined_detected) and case.vulnerable:
            tier = "miss"
        else:
            tier = "clean"

        if tier in {"A", "C"}:
            blockers += 1

        slither_pred[case.id] = slither_detected
        foundry_pred[case.id] = foundry_detected
        combined_pred[case.id] = combined_detected
        rows.append(
            {
                "id": case.id,
                "bug_class": case.bug_class,
                "vulnerable": case.vulnerable,
                "slither": slither_detected,
                "foundry": foundry_detected,
                "combined": combined_detected,
                "tier": tier,
            }
        )

        print(
            f"{case.id} | {case.bug_class} | {case.vulnerable} | {slither_detected} | {foundry_detected} | {combined_detected} | {tier}"
        )

    print("\nMetrics")
    metric_rows: list[dict[str, object]] = []
    for label, pred in (
        ("slither", slither_pred),
        ("foundry", foundry_pred),
        ("combined", combined_pred),
    ):
        tp, fp, fn, tn = confusion(CASES, pred)
        precision, recall, accuracy = metrics(tp, fp, fn, tn)
        metric_rows.append(
            {
                "label": label,
                "tp": tp,
                "fp": fp,
                "fn": fn,
                "tn": tn,
                "precision": precision,
                "recall": recall,
                "accuracy": accuracy,
            }
        )
        print(
            f"- {label}: TP={tp} FP={fp} FN={fn} TN={tn} | precision={precision:.2f} recall={recall:.2f} accuracy={accuracy:.2f}"
        )

    print("\nPolicy verdict (Mode 2)")
    print("- Block: Tier A + Tier C")
    print("- Manual review: Tier B")
    print("- Log only: Tier D")
    print(f"- Current blockers (A/C): {blockers}")

    artifact_dir = os.path.dirname(args.artifact)
    if artifact_dir:
        os.makedirs(artifact_dir, exist_ok=True)
    json_artifact_dir = os.path.dirname(args.json_artifact)
    if json_artifact_dir:
        os.makedirs(json_artifact_dir, exist_ok=True)

    markdown = build_markdown_report(rows, metric_rows, "balanced", blockers)
    with open(args.artifact, "w", encoding="utf-8") as f:
        f.write(markdown)

    with open(args.json_artifact, "w", encoding="utf-8") as f:
        json.dump({"rows": rows, "metrics": metric_rows, "blockers": blockers}, f, indent=2)

    if args.fail_on_blockers and blockers > 0:
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
