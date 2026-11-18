#!/usr/bin/env python3
"""Measure the real local Tutor test path inside the pilot guest."""

import argparse
import contextlib
import hashlib
import io
import json
import re
import subprocess
import sys
import time
from pathlib import Path

from tutor.cli import main
import tutor.runner as runner


def emit(data):
    print("BENCH " + json.dumps(data, sort_keys=True), flush=True)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_case(optimization, timeout):
    original_run = subprocess.run
    compiler = {}

    def measured_run(command, *args, **kwargs):
        if not isinstance(command, list) or not command or command[0] != "g++":
            return original_run(command, *args, **kwargs)
        command = [
            f"-{optimization}" if arg == "-O3" else arg for arg in command
        ] + ["-H", "-Winvalid-pch", "-ftime-report"]
        started = time.monotonic()
        try:
            result = original_run(command, *args, **kwargs)
        except subprocess.TimeoutExpired:
            compiler.update(seconds=round(time.monotonic() - started, 3), timeout=True)
            raise
        stderr = result.stderr or ""
        compiler.update(
            seconds=round(time.monotonic() - started, 3),
            status=result.returncode,
            pch_used=re.findall(r"^! (.+\.gch/\S+)", stderr, re.MULTILINE),
            pch_rejected=re.findall(r"^x (.+\.gch/\S+)", stderr, re.MULTILINE),
            phases=[
                line.strip() for line in stderr.splitlines()
                if re.match(r"\s*(phase\b.*|TOTAL)\s*:", line)
            ],
        )
        return result

    output = io.StringIO()
    started = time.monotonic()
    runner.subprocess.run = measured_run
    try:
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            status = main(["test", "000a", "--compile-timeout", str(timeout)])
    finally:
        runner.subprocess.run = original_run
    text = output.getvalue()
    passed = status == 0 and "ALL TESTS PASSED" in text
    result = {
        "optimization": optimization,
        "seconds": round(time.monotonic() - started, 3),
        "status": status,
        "passed": passed,
        "compiler": compiler,
    }
    if not passed:
        result["output"] = text[-2000:]
    return result


def main_benchmark():
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout", type=int, default=240)
    parser.add_argument("--cases", nargs="+", choices=("O0", "O3"), default=["O3", "O0", "O3"])
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")

    solution = Path.home() / "tutor-workspace/000a-hello-world/solution.hpp"
    harness = Path("/opt/tutor/problems/000a-hello-world/cpp/harness.cpp")
    if not solution.is_file() or not harness.is_file():
        parser.error("prepare the pilot warmup solution and run inside the pilot image")
    emit({
        "compiler_version": subprocess.run(
            ["g++", "--version"], capture_output=True, text=True, check=True
        ).stdout.splitlines()[0],
        "harness_sha256": digest(harness),
        "solution_sha256": digest(solution),
        "cases": args.cases,
        "compile_timeout_seconds": args.timeout,
        "instrumentation": "-H -Winvalid-pch -ftime-report",
    })
    results = []
    for optimization in args.cases:
        result = run_case(optimization, args.timeout)
        results.append(result)
        emit(result)
    return 0 if all(result["passed"] for result in results) else 1


if __name__ == "__main__":
    sys.exit(main_benchmark())
