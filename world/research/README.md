# Mana gate research

`ManaGate.lean` is a one-tick model, not part of the live world or its generated
rules. From `world/`, verify it with the pinned toolchain:

```sh
lean research/ManaGate.lean
```

An initially bonded gate stays shut for the tick if it receives one unit of
mana. The direct and bypass routes cost one and two mana respectively. Route
availability is a scenario input. Ordered proposals share a balance, and a
closed route is refused before checking funds.

The model proves the transfer verdicts, accounting and no-double-spend
properties. It also proves that a proposal for a route that is now closed
cannot spend or deliver mana, even if a player computed it from an earlier
view. With both routes open and two mana, the direct route is optimal for
keeping the gate shut while minimizing spending. If the direct route is cut,
the bypass is the only feasible single-route plan. With no upkeep, idling is
optimal.

`mana-gate-plan.mjs` is an example of a separate player-authored program, not
server code. It reads a JSON snapshot from stdin and writes a proposed plan:

```sh
printf '%s\n' '{"network":{"directOpen":false,"bypassOpen":true},"mana":2,"upkeep":true}' |
  node world/research/mana-gate-plan.mjs
```

It outputs `{"routes":["bypass"]}`. Another program can use a different
algorithm. This example does not search a topology; the two routes stand in for
paths. Neither the snapshot nor the plan is yet a live protocol, and there is
no game command or authoritative integration. The live world must revalidate
proposals against current state, preserve ordered shared-supply accounting,
and connect its runtime decisions to the proved model before this can affect
gameplay. Lean verification is offline; it is not run for each tick.

Run the example checks from the repository root with:

```sh
node --test world/research/mana-gate-plan.test.mjs
```
