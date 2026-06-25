#!/usr/bin/env python3
"""
Quick validation wrapper for local skills.

Delegates to the repository's Node-based skill-spec validator so packaging,
registry validation, and local one-off checks stay aligned.
"""

import json
import subprocess
import sys
from pathlib import Path


def _validator_path():
    return Path(__file__).resolve().parents[5] / "bin" / "skill-spec-validator.js"


def validate_skill(skill_path):
    validator = _validator_path()
    command = ["node", str(validator), str(skill_path), "--json"]
    result = subprocess.run(command, capture_output=True, text=True)

    if result.returncode not in (0, 1):
        message = result.stderr.strip() or result.stdout.strip() or "validator execution failed"
        return False, message

    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError:
        message = result.stderr.strip() or result.stdout.strip() or "validator returned invalid JSON"
        return False, message

    if report.get("errors"):
        return False, "; ".join(report["errors"])

    warning_count = len(report.get("warnings", []))
    if warning_count > 0:
        return True, f"Skill is valid with {warning_count} warning(s)"

    return True, "Skill is valid!"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python quick_validate.py <skill_directory>")
        sys.exit(1)

    valid, message = validate_skill(sys.argv[1])
    print(message)
    sys.exit(0 if valid else 1)
