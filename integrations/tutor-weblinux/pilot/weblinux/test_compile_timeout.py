import contextlib
import io
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tutor.cli import main
from tutor.remote import RemoteResult, bundle_sources
from tutor.runner import TestRunner


class CliOnlyTests(unittest.TestCase):
    def test_studio_commands_follow_docs_presence(self):
        for available in (True, False):
            with self.subTest(available=available), patch("tutor.cli._studio_available", return_value=available):
                with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                    if available:
                        with patch("tutor.cli.cmd_serve", return_value=0) as serve:
                            self.assertEqual(main(["studio"]), 0)
                            serve.assert_called_once()
                    else:
                        with self.assertRaises(SystemExit) as error:
                            main(["studio"])
                        self.assertEqual(error.exception.code, 2)


class CompileTimeoutTests(unittest.TestCase):
    def test_cli_default_and_explicit_timeout(self):
        for arguments, expected in (([], 25), (["--compile-timeout", "240"], 240)):
            with self.subTest(arguments=arguments), patch("tutor.cli.cmd_test", return_value=0) as command:
                self.assertEqual(main(["test", "000a", *arguments]), 0)
                self.assertEqual(command.call_args.args[0].compile_timeout, expected)

    def test_cli_rejects_nonpositive_timeout(self):
        for value in ("0", "-1"):
            with self.subTest(value=value), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    main(["test", "--compile-timeout", value])
                self.assertEqual(error.exception.code, 2)

    def test_runner_passes_timeout_to_compiler_and_reports_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "problem" / "cpp"
            source.mkdir(parents=True)
            (source / "harness.cpp").write_text("int main() { return 0; }")
            workspace = root / "workspace"
            workspace.mkdir()
            (workspace / "solution.hpp").write_text("")
            with patch("tutor.runner.get_config", return_value={"workspace_dir": str(root)}):
                runner = TestRunner()
            problem = {"id": "warmup", "dir": str(source.parent)}
            with patch("tutor.runner.subprocess.run", side_effect=subprocess.TimeoutExpired("g++", 7)) as compiler:
                success, log, _, _ = runner.run_test(problem, submission_dir=workspace, compile_timeout=7)
            self.assertFalse(success)
            self.assertIn("Compiler timed out (> 7s)", log)
            self.assertEqual(compiler.call_args.kwargs["timeout"], 7)


class RemoteTests(unittest.TestCase):
    def test_bundle_inlines_only_allowed_includes(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside:
            root = Path(tmp)
            (root / "solution.hpp").write_text("#pragma once\nint answer();\n")
            secret = Path(outside) / "secret.hpp"
            secret.write_text("int leaked;\n")
            bundle = bundle_sources(f'#include "solution.hpp"\n#include "solution.hpp"\n#include "{secret}"\n', root)
        self.assertEqual(bundle.count("int answer();"), 1)
        self.assertNotIn("#pragma once", bundle)
        self.assertNotIn("int leaked", bundle)
        self.assertIn(f'#include "{secret}"', bundle)

    def test_remote_result_is_graded_like_a_local_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            problem_dir = root / "warmup"
            (problem_dir / "cpp").mkdir(parents=True)
            (problem_dir / "cpp" / "harness.cpp").write_text("#include <cassert>\nint main(){}\n")
            workspace = root / "work"
            workspace.mkdir()
            (workspace / "solution.hpp").write_text("// stub\n")
            with patch("tutor.runner.get_config", return_value={"workspace_dir": str(root)}):
                runner = TestRunner()
            problem = {"id": "warmup", "dir": str(problem_dir)}
            build_failure = RemoteResult(-1, "", "", 1, "boom", 1.0)
            with patch("tutor.remote.run_remote", return_value=build_failure) as remote, \
                 patch("tutor.runner.subprocess.run") as local:
                success, log, _, _ = runner.run_test(problem, submission_dir=workspace, remote="bridge")
        self.assertFalse(success)
        self.assertIn("Compilation Error:\nboom", log)
        self.assertEqual(remote.call_args.args[1], "bridge")
        local.assert_not_called()


if __name__ == "__main__":
    unittest.main()
