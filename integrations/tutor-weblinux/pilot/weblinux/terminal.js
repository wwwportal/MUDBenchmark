const boot = document.querySelector("#boot");
const status = document.querySelector("#status");
const terminal = new Terminal({ cols: 100, rows: 30, scrollback: 1000 });
terminal.open(document.querySelector("#terminal"));
let worker;
let ready = false;
const restore = document.querySelector("#restore");
const exportButton = document.querySelector("#export");
const backupStatus = document.querySelector("#backup-status");
const command = document.querySelector("#restore-command");
const storageKey = "tutor-pilot:000a-hello-world:solution:v1";
let backup;

function setBackup(encoded, writing) {
  const bytes = atob(encoded);
  if (bytes.length > 2048 || btoa(bytes) !== encoded) {
    throw new Error("Expected a valid solution of at most 2048 bytes.");
  }
  if (writing) localStorage.setItem(storageKey, encoded);
  backup = encoded;
  restore.disabled = false;
  exportButton.disabled = false;
  command.hidden = true;
  backupStatus.textContent = writing ? "Solution saved in this browser." : "Saved solution available.";
}

try {
  const saved = localStorage.getItem(storageKey);
  if (saved !== null) setBackup(saved, false);
} catch (error) {
  backupStatus.textContent = `Could not read the backup: ${error.message}`;
}

terminal.parser.registerOscHandler(777, (value) => {
  if (!value.startsWith("tutor-save:")) return false;
  try {
    setBackup(value.slice("tutor-save:".length), true);
  } catch (error) {
    backupStatus.textContent = `Could not save: ${error.message}`;
  }
  return true;
});

// The guest has no network. It asks over OSC 777 and the page makes the one
// allowed request, with fixed flags, so the guest only controls the source.
const GODBOLT_URL = "https://godbolt.org/api/compiler/g132/compile";
const GODBOLT_FLAGS = "-O3 -std=c++20";
const MAX_SOURCE_BYTES = 64 * 1024;
const REPLY_CHUNK = 1000;

async function streamBytes(bytes, transform) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());
}

function toBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function reply(id, kind, rest = "") {
  worker.postMessage({ type: "stdin", data: `R:${id}:${kind}${rest ? ":" + rest : ""}\n` });
}

async function remoteCompile(id, payload) {
  try {
    const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
    const { source } = JSON.parse(new TextDecoder().decode(await streamBytes(bytes, new DecompressionStream("deflate"))));
    if (typeof source !== "string" || source.length > MAX_SOURCE_BYTES) throw new Error("Invalid source.");
    const response = await fetch(GODBOLT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        source,
        lang: "c++",
        options: {
          userArguments: GODBOLT_FLAGS,
          executeParameters: { args: [], stdin: "" },
          filters: { execute: true },
          compilerOptions: { executorRequest: true },
          tools: [],
          libraries: [],
        },
      }),
    });
    if (!response.ok) throw new Error(`Compiler service returned ${response.status}.`);
    const encoded = toBase64(await streamBytes(new TextEncoder().encode(await response.text()), new CompressionStream("deflate")));
    for (let index = 0; index < encoded.length; index += REPLY_CHUNK) {
      reply(id, "d", encoded.slice(index, index + REPLY_CHUNK));
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    reply(id, "end");
  } catch (error) {
    reply(id, "e", String(error.message ?? error).replace(/\s+/g, " "));
  }
}

terminal.parser.registerOscHandler(777, (value) => {
  const match = /^tutor-remote:([0-9a-f]{8}):([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || !ready) return false;
  remoteCompile(match[1], match[2]);
  return true;
});

restore.addEventListener("click", () => {
  command.value = `tutor-restore '${backup}'`;
  command.hidden = false;
  command.focus();
  command.select();
  backupStatus.textContent = "Copy the command and run it at the Linux prompt to replace solution.hpp.";
});

exportButton.addEventListener("click", () => {
  const bytes = Uint8Array.from(atob(backup), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "solution.hpp";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.querySelector("#import").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2048) throw new Error("Choose a solution of at most 2048 bytes.");
    setBackup(btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer()))), true);
  } catch (error) {
    backupStatus.textContent = `Could not import: ${error.message}`;
  } finally {
    event.target.value = "";
  }
});

terminal.onData((data) => {
  if (ready) worker.postMessage({ type: "stdin", data });
});

function fail(message) {
  status.textContent = message;
  ready = false;
  worker?.terminate();
  boot.disabled = false;
}

boot.addEventListener("click", () => {
  if (!crossOriginIsolated) {
    fail("WebLinux needs cross-origin isolation headers.");
    return;
  }
  boot.disabled = true;
  terminal.reset();
  status.textContent = "Starting Linux";
  worker = new Worker(new URL("./worker.js", import.meta.url));
  worker.addEventListener("error", ({ message }) => fail(message || "WebLinux worker failed."));
  worker.addEventListener("message", ({ data }) => {
    if (data.type === "terminal") terminal.write(data.text);
    if (data.type === "status") status.textContent = data.status;
    if (data.type === "error") fail(data.error);
    if (data.type === "ready") {
      status.textContent = "Linux ready";
      ready = true;
      terminal.focus();
    }
  });
  worker.postMessage({ type: "run", allowHost: "" });
});

export { terminal };
