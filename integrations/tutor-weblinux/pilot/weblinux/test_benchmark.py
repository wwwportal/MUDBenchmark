import subprocess
import unittest
from unittest.mock import patch

import benchmark


class BenchmarkTests(unittest.TestCase):
    def test_records_pch_and_phases_for_actual_compiler_call(self):
        response = subprocess.CompletedProcess(
            [], 0, "",
            "! /opt/tutor/pilot/prelude.hpp.gch/debug\n"
            " phase opt and generate : 0.3 0.0 0.3\n"
            " TOTAL : 0.3 0.0 0.3\n",
        )

        def fake_cli(_args):
            subprocess.run(["g++", "-O3", "harness.cpp"], capture_output=True, text=True)
            print("ALL TESTS PASSED")
            return 0

        with patch("benchmark.main", side_effect=fake_cli), \
             patch("benchmark.subprocess.run", return_value=response) as compiler:
            result = benchmark.run_case("O0", 10)

        self.assertTrue(result["passed"])
        self.assertEqual(result["compiler"]["pch_used"], ["/opt/tutor/pilot/prelude.hpp.gch/debug"])
        self.assertEqual(len(result["compiler"]["phases"]), 2)
        command = compiler.call_args.args[0]
        self.assertIn("-O0", command)
        self.assertNotIn("-O3", command)
        self.assertIn("-ftime-report", command)

    def test_compiler_timeout_cannot_be_reported_as_pass(self):
        def fake_cli(_args):
            try:
                subprocess.run(["g++", "-O3"], timeout=1)
            except subprocess.TimeoutExpired:
                print("Compiler timed out")
                return 1

        with patch("benchmark.main", side_effect=fake_cli), \
             patch("benchmark.subprocess.run", side_effect=subprocess.TimeoutExpired("g++", 1)):
            result = benchmark.run_case("O3", 1)

        self.assertFalse(result["passed"])
        self.assertTrue(result["compiler"]["timeout"])
        self.assertIn("Compiler timed out", result["output"])


if __name__ == "__main__":
    unittest.main()
