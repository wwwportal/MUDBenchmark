Vendored from Syntra-Tutor/tutor
base:   4224b2e935ac23c8c1986242a84df13e8f4529a2
branch: test-weblinux-pilot at e67f0b754f3c2d33cdcddb8e9337198745732499, including the WebLinux pilot, optional remote bridge, CLI-only changes, completion ledger, and local benchmark
Subset: tutor/, tutor.py, problems/000a-hello-world, pilot/weblinux (Docker build context root)
Status: experimental; complete local smoke test does not pass yet (see R4-Laboratories/MUDBenchmark#4)

Vendored from Syntra-Tutor/synvim
rev:    d85674d = 0b4364e872f4ee5674478398e48b3b562eae7e60 (Syntra-Tutor/synvim main) + "Remove unused lsp.lua" (branch remove-unused-lsp, Syntra-Tutor/synvim#5); vendor/synvim, snapshot without history
Note:   pilot/weblinux/Dockerfile still fetches the unmodified 0b4364e from GitHub at build time; it does not yet use vendor/synvim. The only difference is the removed lsp.lua.
Policy: treat as read-only; edit upstream and re-sync.
