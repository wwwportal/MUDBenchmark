#!/usr/bin/env python3
"""Stage a Tutor rootfs with the signed mvm smoke pack and its WebLinux worker."""

import argparse
import gzip
import json
import re
import shutil
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for path in ("mvm", "pack", "rootfs", "output"):
        parser.add_argument(path, type=Path)
    args = parser.parse_args()
    here = Path(__file__).parent
    args.output.mkdir()

    pack_js = (args.pack / "pack.js").read_text()
    match, = re.finditer(r"loadPackage\((\{\"files\":.*\})\);", pack_js)
    manifest = json.loads(match[1])
    parts = []
    offset = 0
    for entry in manifest["files"]:
        filename = entry["filename"]
        if not re.fullmatch(r"/pack/[\w.-]+", filename):
            raise ValueError(f"Unexpected pack path: {filename!r}")
        source = args.rootfs if filename == "/pack/rootfs.bin" else args.pack / filename[1:]
        entry["start"] = offset
        with source.open("rb") as stream:
            while chunk := stream.read(20 * 1024 * 1024):
                name = f"pack.data.part-{len(parts):03d}"
                with (args.output / name).open("wb") as target:
                    with gzip.GzipFile(filename="", mode="wb", fileobj=target, mtime=0) as compressed:
                        compressed.write(chunk)
                parts.append(name)
                offset += len(chunk)
        entry["end"] = offset
    manifest["remote_package_size"] = offset
    (args.output / "pack.js").write_text(pack_js[:match.start(1)] + json.dumps(manifest) + pack_js[match.end(1):])
    (args.output / "pack.data.parts.json").write_text(json.dumps({"size": offset, "parts": parts}))
    for name in ("qemu-system-x86_64.js", "qemu-system-x86_64.worker.js", "xterm-pty.js"):
        shutil.copyfile(args.pack / name, args.output / name)
    with (args.pack / "qemu-system-x86_64.wasm").open("rb") as source:
        with (args.output / "qemu-system-x86_64.wasm.gz").open("wb") as target:
            with gzip.GzipFile(filename="", mode="wb", fileobj=target, mtime=0) as compressed:
                shutil.copyfileobj(source, compressed)

    def replace_once(text, old, new):
        if text.count(old) != 1:
            raise ValueError(f"Unexpected upstream WebLinux worker around {old!r}")
        return text.replace(old, new)

    worker = (args.mvm / "web/weblinux-demo/worker.js").read_text()
    worker = replace_once(worker, "root=/dev/vda rw", "root=/dev/vda rw init=/init")
    worker = replace_once(worker, '      "-netdev",\n      "user,id=net0",\n      "-device",\n      "virtio-net-pci,netdev=net0,romfile=",', '      "-nic",\n      "none",')
    worker = replace_once(worker, "new Uint8Array(await response.arrayBuffer())",
                          'new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer())')
    worker = replace_once(worker, "      outputBuffer += text;", '      self.postMessage({ type: "terminal", text });\n      outputBuffer += text;')
    worker = replace_once(worker, "      flushOutputBuffer();\n      if (callback)", "      if (outputBuffer.length > 4096) outputBuffer = outputBuffer.slice(-256);\n      if (callback)")
    (args.output / "worker.js").write_text(worker)
    shutil.copyfile(args.mvm / "LICENSE", args.output / "LICENSE-MVM")
    shutil.copyfile(here / "node_modules/@xterm/xterm/LICENSE", args.output / "LICENSE-XTERM")
    for name in ("index.html", "terminal.js"):
        shutil.copyfile(here / name, args.output / name)
    for name, source in (
        ("xterm.js", "node_modules/@xterm/xterm/lib/xterm.js"),
        ("xterm.css", "node_modules/@xterm/xterm/css/xterm.css"),
    ):
        shutil.copyfile(here / source, args.output / name)


if __name__ == "__main__":
    main()
