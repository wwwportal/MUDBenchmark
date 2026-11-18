"""Remote compile-and-run for environments where a local g++ is too slow.

Two transports share one request/response shape (Compiler Explorer's API):
  - "godbolt": POST directly from this process.
  - "bridge": ask the hosting page over the terminal (OSC 777); the page makes
    the fetch, so the guest needs no network and the page controls the
    destination and compiler flags.
"""
import base64
import json
import os
import re
import select
import termios
import time
import urllib.request
import uuid
import zlib
from dataclasses import dataclass
from pathlib import Path

GODBOLT_URL = "https://godbolt.org/api/compiler/g132/compile"
GODBOLT_FLAGS = "-O3 -std=c++20"
MODES = ("godbolt", "bridge")
_ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
_LOCAL_INCLUDE = re.compile(r'^\s*#\s*include\s+"([^"]+)"\s*$')
CHUNK = 1000


@dataclass
class RemoteResult:
    returncode: int
    stdout: str
    stderr: str
    build_returncode: int
    build_stderr: str
    elapsed_ms: float


_INSTALL_ROOT = Path(__file__).resolve().parent.parent


def bundle_sources(source: str, root: Path, _seen=None) -> str:
    """Inline quoted local includes so the bundle is a single translation unit.

    Only files under the workspace copy or the Tutor install may be inlined.
    """
    root = Path(root).resolve()
    allowed = (root, _INSTALL_ROOT)
    seen = _seen if _seen is not None else set()
    out = []
    for line in source.splitlines():
        match = _LOCAL_INCLUDE.match(line)
        target = (root / match.group(1)).resolve() if match else None
        if target and any(base in target.parents for base in allowed) and target.is_file():
            if target not in seen:
                seen.add(target)
                text = target.read_text(encoding="utf-8")
                out.append(bundle_sources(text, root, seen))
            continue
        if line.strip() == "#pragma once":
            continue
        out.append(line)
    return "\n".join(out) + "\n"


def request_body(source: str) -> dict:
    return {
        "source": source,
        "lang": "c++",
        "options": {
            "userArguments": GODBOLT_FLAGS,
            "executeParameters": {"args": [], "stdin": ""},
            "filters": {"execute": True},
            "compilerOptions": {"executorRequest": True},
            "tools": [],
            "libraries": [],
        },
    }


def _text(lines) -> str:
    return _ANSI.sub("", "\n".join(item.get("text", "") for item in lines or []))


def parse_response(data: dict, elapsed_ms: float) -> RemoteResult:
    build = data.get("buildResult") or {}
    build_code = build.get("code", 0)
    return RemoteResult(
        returncode=data.get("code", -1) if build_code == 0 else -1,
        stdout=_text(data.get("stdout")),
        stderr=_text(data.get("stderr")),
        build_returncode=build_code,
        build_stderr=_text(build.get("stderr")),
        elapsed_ms=elapsed_ms,
    )


def _direct(source: str, timeout: float) -> dict:
    request = urllib.request.Request(
        GODBOLT_URL,
        json.dumps(request_body(source)).encode(),
        {"Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def _bridge(source: str, timeout: float) -> dict:
    payload = base64.b64encode(zlib.compress(json.dumps({"source": source}).encode())).decode()
    request_id = uuid.uuid4().hex[:8]
    fd = os.open("/dev/tty", os.O_RDWR | os.O_NOCTTY)
    saved = termios.tcgetattr(fd)
    quiet = termios.tcgetattr(fd)
    quiet[3] &= ~termios.ECHO
    termios.tcsetattr(fd, termios.TCSADRAIN, quiet)
    try:
        termios.tcflush(fd, termios.TCIFLUSH)
        os.write(fd, f"\033]777;tutor-remote:{request_id}:{payload}\007".encode())
        deadline = time.monotonic() + timeout
        buffer, chunks = b"", []
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([fd], [], [], remaining)[0]:
                raise TimeoutError("The page did not answer the remote compile request in time.")
            buffer += os.read(fd, 4096)
            *lines, buffer = buffer.split(b"\n")
            for raw in lines:
                line = raw.decode(errors="replace").strip()
                if not line.startswith(f"R:{request_id}:"):
                    continue
                kind, _, rest = line[len(f"R:{request_id}:"):].partition(":")
                if kind == "d":
                    chunks.append(rest)
                elif kind == "e":
                    raise RuntimeError(f"Remote compile failed: {rest}")
                elif kind == "end":
                    return json.loads(zlib.decompress(base64.b64decode("".join(chunks))))
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, saved)
        os.close(fd)


def run_remote(source: str, mode: str, timeout: float) -> RemoteResult:
    if mode not in MODES:
        raise ValueError(f"Unknown remote mode {mode!r}; expected one of {MODES}")
    start = time.perf_counter()
    data = (_direct if mode == "godbolt" else _bridge)(source, timeout)
    return parse_response(data, (time.perf_counter() - start) * 1000.0)
