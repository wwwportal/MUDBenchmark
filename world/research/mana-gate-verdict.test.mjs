import assert from "node:assert/strict";
import { test } from "node:test";
import { plan } from "./mana-gate-plan.mjs";
import { transferVerdict } from "./mana-gate-verdict.mjs";

test("a player plan is checked against the current network, not its old snapshot", () => {
  const snapshot = { network: { directOpen: true, bypassOpen: true }, mana: 2, upkeep: true };
  const proposal = plan(snapshot);
  assert.deepEqual(proposal.routes, ["direct"]);
  const current = { ...snapshot.network, directOpen: false };
  assert.equal(transferVerdict(current, snapshot.mana, proposal.routes[0]), "routeClosed");
});

test("the decision uses the current network and shared balance", () => {
  const intact = { directOpen: true, bypassOpen: true };
  const cut = { directOpen: false, bypassOpen: true };
  assert.equal(transferVerdict(intact, 2, "direct"), "delivered");
  assert.equal(transferVerdict(cut, 2, "direct"), "routeClosed");
  assert.equal(transferVerdict(cut, 1, "bypass"), "insufficientMana");
  assert.equal(transferVerdict(cut, 2, "bypass"), "delivered");
  assert.equal(transferVerdict(cut, Number.MAX_SAFE_INTEGER, "bypass"), "delivered");
  assert.equal(transferVerdict({ directOpen: false, bypassOpen: false }, 0, "direct"), "routeClosed");
});

test("invalid proposals do not reach the lookup", () => {
  const network = { directOpen: true, bypassOpen: true };
  assert.throws(() => transferVerdict(network, -1, "direct"));
  assert.throws(() => transferVerdict(network, Number.MAX_SAFE_INTEGER + 1, "direct"));
  assert.throws(() => transferVerdict(network, 1, "other"));
  assert.throws(() => transferVerdict({ directOpen: true }, 1, "direct"));
});
