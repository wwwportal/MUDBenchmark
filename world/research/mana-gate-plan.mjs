#!/usr/bin/env node
// Example player program for the one-tick research model, not a world rule.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function plan(snapshot) {
  const { network, mana, upkeep } = snapshot ?? {};
  if (!network || typeof network.directOpen !== "boolean"
      || typeof network.bypassOpen !== "boolean"
      || !Number.isSafeInteger(mana) || mana < 0 || typeof upkeep !== "boolean") {
    throw new TypeError("expected network availability, nonnegative mana and upkeep");
  }
  if (!upkeep) return { routes: [] };
  if (network.directOpen && mana >= 1) return { routes: ["direct"] };
  if (network.bypassOpen && mana >= 2) return { routes: ["bypass"] };
  return { routes: [] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const snapshot = JSON.parse(readFileSync(0, "utf8"));
    console.log(JSON.stringify(plan(snapshot)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
