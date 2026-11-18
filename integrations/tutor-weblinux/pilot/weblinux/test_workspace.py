import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tutor.workspace import WorkspaceManager


class WorkspaceSpecificationTests(unittest.TestCase):
    def test_scaffolds_inline_spec_and_preserves_existing_solution(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "problems" / "warmup"
            (source / "cpp").mkdir(parents=True)
            (source / "cpp" / "solution_stub.hpp").write_text("starter")
            with patch("tutor.workspace.get_config", return_value={"workspace_dir": str(root / "workspace")}):
                manager = WorkspaceManager()
            problem = {"id": "warmup", "dir": str(source), "spec": "Problem statement"}
            solution, specification = manager.scaffold(problem)
            self.assertEqual(specification.read_text(), "Problem statement")
            self.assertEqual(solution.read_text(), "starter")
            solution.write_text("learner work")
            manager.scaffold(problem)
            self.assertEqual(solution.read_text(), "learner work")

    def test_returns_copied_readme_when_inline_spec_is_absent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "problems" / "warmup"
            (source / "cpp").mkdir(parents=True)
            (source / "README.md").write_text("File specification")
            with patch("tutor.workspace.get_config", return_value={"workspace_dir": str(root / "workspace")}):
                manager = WorkspaceManager()
            _, specification = manager.scaffold({"id": "warmup", "dir": str(source)})
            self.assertEqual(specification.name, "spec.txt")
            self.assertEqual(specification.read_text(), "File specification")


if __name__ == "__main__":
    unittest.main()
