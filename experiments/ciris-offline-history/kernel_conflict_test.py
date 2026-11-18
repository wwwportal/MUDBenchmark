#!/usr/bin/env python3
"""Exercise CIRISKernel's executable causal model, not a CIRIS network."""

import itertools
import os
from pathlib import Path
import subprocess
import sys
import unittest

REVISION = "78b2f677df7722a41c643c728530394469d7f354"
root = os.environ.get("CIRIS_KERNEL_DIR")
if not root:
    sys.exit("Set CIRIS_KERNEL_DIR to a CIRISKernel checkout at " + REVISION)
root = Path(root).resolve()
revision = subprocess.check_output(
    ["git", "-C", str(root), "rev-parse", "HEAD"], text=True
).strip()
if revision != REVISION:
    sys.exit(f"Expected CIRISKernel {REVISION}, got {revision}")
sys.dont_write_bytecode = True
sys.path.insert(0, str(root / "models" / "causal_kernel"))
import causal_kernel as kernel  # noqa: E402


def rule(row, past, _is_ancestor):
    if row["kind"] == "decision":
        return any(parent["id"] == row["picks"] for parent in past)
    return row["kind"] in {"genesis", "claim"}


genesis = kernel.row("g", "genesis", "owner")
alice = kernel.row("a", "claim", "alice", ("g",), slot="sword")
bob = kernel.row("b", "claim", "bob", ("g",), slot="sword")
decision = kernel.row("d", "decision", "owner", ("a", "b"), slot="sword", picks="a")
counter_decision = kernel.row("e", "decision", "other", ("a", "b"), slot="sword", picks="b")


def read_slot(rows):
    state = kernel.arrive(rows, rule, root=lambda row: row["id"] == "g")
    candidates = [row for row in state.Cs if row.get("slot") == "sword"]
    return set(state.by), kernel.slot(state, candidates)


class CausalConflictTest(unittest.TestCase):
    def test_isolated_claims_are_locally_held_but_merge_is_contested(self):
        self.assertEqual(read_slot([genesis, alice])[1], ("a", 1))
        self.assertEqual(read_slot([genesis, bob])[1], ("b", 1))
        for rows in itertools.permutations([genesis, alice, bob]):
            self.assertEqual(read_slot(rows), ({"g", "a", "b"}, (None, 2)))

    def test_a_decision_resolves_the_model_but_a_concurrent_one_reopens_it(self):
        rows = [genesis, alice, bob, decision]
        for order in itertools.permutations(rows):
            self.assertEqual(read_slot(order)[1], ("a", 1))
        for order in itertools.permutations(rows + [counter_decision]):
            self.assertEqual(read_slot(order)[1], (None, 2))


if __name__ == "__main__":
    unittest.main()
