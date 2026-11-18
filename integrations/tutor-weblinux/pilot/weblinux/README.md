# Tutor WebLinux pilot

This is a standalone one-problem pilot for desktop Chromium. The browser runs
QEMU-Wasm and can run learner code locally. An optional bridge runs tests
remotely. Guest networking is disabled: the pinned QEMU binary does not
implement the upstream demo's optional `-netdev user` switch.

## Current validation status

**The WebLinux pilot is not yet a complete, usable replacement.** Interactive
editing and saving with `:wq` have been exercised, but local Tutor compile/test,
GDB, source export/import, and reload recovery remain unverified. The bridge
has passed and rejected example solutions remotely. No hosted preview exists.

Chromium reached the Tutor shell in approximately 16 seconds and successfully
listed and scaffolded the warmup problem. A standalone warmup build and test
run completed in 148 seconds with precompiled standard-library headers. The
staged bundle is approximately 227 MiB; preload data expands to approximately
827 MiB before the guest starts.

The original runner's 25-second compilation timeout is too short for this
environment. `tutor test --compile-timeout 240` is an explicit opt-in for the
pilot, not a change to the default or the CI/submission path. A compiler failure
caused by invalid source has been observed separately from a timeout.

The browser smoke driver synchronizes shell jobs using completion markers and
exit codes. Its earlier versions incorrectly accepted a generic failure message
as evidence that a failing test had executed. Do not rely on those earlier
results.

This is not evidence that WebLinux has acceptable learner-facing performance
or is faster than v86.

The guest-only Synvim configuration disables the optional `scribe` plugin:
it was missing from the built plugin set and tried to clone itself during
offline startup. Upstream Synvim defaults are unchanged.

## Building and serving locally

Use an x86-64 Linux build host with Docker, e2fsprogs, Python 3, Node, `gh`,
and `cosign`. From the Tutor repository root:

```sh
git clone https://github.com/tinylabscom/mvm.git ../mvm-reference
git -C ../mvm-reference checkout 980f39164779ef92272bdac47f0fbac91a7898bc
../mvm-reference/scripts/download-qemu-wasm-smoke-pack.sh "$PWD/build/weblinux-reference"
npm ci --prefix pilot/weblinux
docker build --platform linux/amd64 -t tutor-weblinux-pilot -f pilot/weblinux/Dockerfile .
mkdir -p build/weblinux-root
container=$(docker create tutor-weblinux-pilot)
(set -o pipefail; docker export "$container" | tar -xf - -C build/weblinux-root)
docker rm "$container"
mkfs.ext2 -F -m 0 -d build/weblinux-root build/weblinux-rootfs.bin 800M
python3 pilot/weblinux/stage.py ../mvm-reference build/weblinux-reference \
    build/weblinux-rootfs.bin build/weblinux-site
python3 ../mvm-reference/web/weblinux-demo/serve.py build/weblinux-site
```

Use fresh build paths on subsequent runs. The base image, Synvim revision and
Synvim plugin commits are pinned, but Debian package resolution is not locked;
this recipe does not promise byte-identical builds. The image is large and
requires substantial browser memory.

The image build precompiles the warmup's standard-library headers for optimized
tests and debug builds. Only the guest copy of the warmup harness includes this
prelude; the source problem in the repository is unchanged. User solutions are
still compiled inside the browser. The guest is not a trusted judge, and its
timing-derived scoreboard values are not comparable to native leaderboard data.

## Using the pilot

Open `http://127.0.0.1:8765/`, start Linux, and use:

```sh
tutor list
tutor pick 000a-hello-world --no-edit
cd ~/tutor-workspace/000a-hello-world
cat spec.txt
nvim solution.hpp
tutor test 000a --compile-timeout 240
tutor-debug
```

In GDB, use `break greet`, `run`, `print name`, and `step`. The debug helper
uses an unoptimized binary; normal Tutor compilation and execution retain their
existing default timeouts unless the compilation override is explicitly passed.

Write the file in Synvim, then run `tutor-save` at the shell. After reloading
and booting a fresh guest, use **Show restore command**, copy the command, and
run it at the Linux prompt. Only this problem's saved `solution.hpp` (at most
2 KiB) is backed up; the guest disk, test history, and unsaved editor buffers are
not retained. Export the source to carry it between origins or protect it from
browser storage eviction.

## Hosting

Serve `build/weblinux-site` as-is on a controlled HTTPS origin. Apply
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`, host all assets on the same origin,
and serve `.js` with a JavaScript MIME type. Serve the precompressed files as
gzip file bytes (do not set `Content-Encoding: gzip` for them); the worker
decompresses them explicitly. Do not assume stock GitHub Pages supplies the
headers.

## Checks and limitations

From the Tutor repository root:

```sh
python3 -m unittest discover -s pilot/weblinux -p 'test_*.py'
node pilot/weblinux/smoke.mjs http://127.0.0.1:8765/
```

The Python checks cover scaffolding, compilation timeouts, editor selection,
and remote feedback. They do not establish that the browser workflow works.

The browser check requires Node with built-in WebSocket support and Chromium.
Set `CHROME` to its executable path. It must finish successfully before claiming
the end-to-end pilot is verified. It launches an isolated temporary browser
profile, synchronizes shell jobs by completion markers, and cleans up its own
browser process. `COMPILER_ONLY=1` measures a standalone warmup build and run;
`DIAGNOSTICS=1` isolates a header-free compile and headless editor startup.

`BENCHMARK=1 node pilot/weblinux/smoke.mjs` measures the real local Tutor test
path with a known warmup solution. It records compiler version and source hashes,
whether GCC used a precompiled header, GCC phase reports, and pass/fail for
successive `-O3`, experimental `-O0`, and `-O3` runs. The latter runs are warm
relative to the first, but no cache state is controlled. The benchmark adds GCC
diagnostic flags and does not change Tutor's production optimization settings.
Each compilation has a 240-second timeout; any failure fails the benchmark.

Local observations are recorded in `evidence.json`. They were made in a shared
execution environment, not a controlled performance lab, and do not establish
performance on learner hardware. No comparison with a complete v86 toolchain
has been performed. The R4 fork's existence supports evaluating mvm; it does not
establish that this implementation meets R4's requirements.
