#!/usr/bin/env node
// Generate offline; the live world does not invoke Lean.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "world/research/mana-gate-verdicts.json");
let input;
if (process.argv.includes("--stdin")) {
  input = readFileSync(0, "utf8");
} else {
  const run = spawnSync("lean", ["--run", "research/ManaGate.lean"], {
    cwd: join(root, "world"),
    encoding: "utf8",
  });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`Lean failed:\n${run.stderr}\n${run.stdout}`);
  input = run.stdout;
}

const data = JSON.parse(input);
if (data.schema !== "mudbenchmark/mana-gate-verdicts/1" || data.entries?.length !== 24) {
  throw new Error("unexpected Lean verdict table");
}
const output = `${JSON.stringify(data, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== output) throw new Error("mana-gate verdict table has drifted");
  console.log("mana-gate verdict table matches the Lean model");
} else {
  writeFileSync(target, output);
  console.log(`wrote ${target}`);
}
