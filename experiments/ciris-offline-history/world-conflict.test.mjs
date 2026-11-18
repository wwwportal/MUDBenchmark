import assert from "node:assert/strict";
import test from "node:test";
import { digestState, initialState, step } from "../../runtime/world.mjs";

const rooms = { 1: { exits: {} } };
const messages = { actor: "Taken.", others: "Taken." };
const take = (actorId) => ({ kind: "take", actorId, objectId: "sword", messages });

function baseline() {
  const state = initialState(rooms, [], [{ id: "sword", room: 1 }], 1);
  return step({
    state,
    rooms,
    intents: [
      { kind: "join", actorId: 1, name: "Alice" },
      { kind: "join", actorId: 2, name: "Bob" },
    ],
  }).state;
}

test("isolated replicas accept incompatible pickups from the same world", () => {
  const state = baseline();
  const alice = step({ state, rooms, intents: [take(1)] }).state;
  const bob = step({ state, rooms, intents: [take(2)] }).state;

  assert.equal(alice.objects[0].holder, 1);
  assert.equal(bob.objects[0].holder, 2);
  assert.notEqual(digestState(alice), digestState(bob));
  assert.equal(state.objects[0].holder, null);
});

test("replaying the same actions in different orders gives different histories", () => {
  const state = baseline();
  const aliceFirst = step({ state, rooms, intents: [take(1), take(2)] }).state;
  const bobFirst = step({ state, rooms, intents: [take(2), take(1)] }).state;
  const aliceReplay = step({ state, rooms, intents: [take(1), take(2)] }).state;

  assert.equal(aliceFirst.objects[0].holder, 1);
  assert.equal(bobFirst.objects[0].holder, 2);
  assert.notEqual(digestState(aliceFirst), digestState(bobFirst));
  assert.equal(digestState(aliceFirst), digestState(aliceReplay));
});
