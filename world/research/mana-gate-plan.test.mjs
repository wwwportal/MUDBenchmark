import assert from "node:assert/strict";
import { test } from "node:test";
import { plan } from "./mana-gate-plan.mjs";

test("the program chooses a feasible route based on the snapshot", () => {
  const intact = { network: { directOpen: true, bypassOpen: true }, mana: 2, upkeep: true };
  assert.deepEqual(plan(intact), { routes: ["direct"] });
  assert.deepEqual(plan({ ...intact, network: { ...intact.network, directOpen: false } }),
    { routes: ["bypass"] });
  assert.deepEqual(plan({ ...intact, network: { ...intact.network, directOpen: false }, mana: 1 }),
    { routes: [] });
  assert.deepEqual(plan({ ...intact, upkeep: false }), { routes: [] });
});

test("malformed snapshots are rejected", () => {
  assert.throws(() => plan({ network: { directOpen: true, bypassOpen: true }, mana: -1, upkeep: true }));
  assert.throws(() => plan({ network: { directOpen: true }, mana: 2, upkeep: true }));
});
