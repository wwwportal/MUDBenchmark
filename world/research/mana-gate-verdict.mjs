// Experimental lookup of offline-generated decisions; not wired into the world.
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("./mana-gate-verdicts.json", import.meta.url), "utf8"));
if (data.schema !== "mudbenchmark/mana-gate-verdicts/1" || !Array.isArray(data.entries)) {
  throw new Error("invalid mana-gate verdict table");
}
const table = new Map();
const key = (directOpen, bypassOpen, route, mana) =>
  `${Number(directOpen)}:${Number(bypassOpen)}:${route}:${mana}`;
for (const entry of data.entries) {
  if (typeof entry.directOpen !== "boolean" || typeof entry.bypassOpen !== "boolean"
      || !["direct", "bypass"].includes(entry.route) || ![0, 1, 2].includes(entry.mana)
      || !["delivered", "routeClosed", "insufficientMana"].includes(entry.verdict)) {
    throw new Error("invalid mana-gate verdict entry");
  }
  const index = key(entry.directOpen, entry.bypassOpen, entry.route, entry.mana);
  if (table.has(index)) throw new Error("duplicate mana-gate verdict entry");
  table.set(index, entry.verdict);
}
if (table.size !== 24) throw new Error("incomplete mana-gate verdict table");

export function transferVerdict(network, mana, route) {
  if (!network || typeof network.directOpen !== "boolean" || typeof network.bypassOpen !== "boolean"
      || !Number.isSafeInteger(mana) || mana < 0 || !["direct", "bypass"].includes(route)) {
    throw new TypeError("invalid transfer proposal");
  }
  return table.get(key(network.directOpen, network.bypassOpen, route, Math.min(mana, 2)));
}
