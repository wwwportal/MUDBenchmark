# Offline history experiment

This is an isolated investigation, not a distributed MUDBenchmark implementation
or a selected conflict policy. The production server remains unchanged.

The Node test uses the real world reducer. Two replicas begin from the same
state, each accepts a pickup of the same unique object, and the reducer replays
both pickups in opposite orders. It demonstrates that identical action sets do
not imply identical world state without an agreed order.

The Python test uses the executable
[CIRISKernel causal model](https://github.com/CIRISAI/CIRISKernel/tree/78b2f677df7722a41c643c728530394469d7f354/models/causal_kernel).
It models each pickup as a claim to a slot. Each isolated claim initially holds
the slot; after both claims are visible, the slot is contested. A decision
naming both claims resolves this model's slot, but a concurrent counter-decision
makes it contested again. This is an example of a possible model, **not** an
adopted game rule. Its minimal admission rule is local to this experiment; the
model does not verify signatures or define who is allowed to decide.

Run with Node and a checkout of the exact CIRISKernel revision:

```sh
node --test experiments/ciris-offline-history/world-conflict.test.mjs
CIRIS_KERNEL_DIR=/path/to/CIRISKernel python3 experiments/ciris-offline-history/kernel_conflict_test.py
```

Separately, upstream's `models/causal_kernel/check.py --bound 4` passed at the
same revision: 1,887 bounded sets and 32,391 arrival orders, with zero
disagreements against its set function. That is a bounded model result, not a
test of the Rust server or a proof of game-world convergence.

**Not tested:** two actual CIRIS nodes, network disconnection/reconnection,
durable replication, player switching, authentication, adversarial behavior,
or a complete game history. The upstream server's multi-node harness uses
Docker, which was inaccessible in the environment where this experiment was
created. No claim is made that CIRISKernel is wired into CIRISServer's runtime.
