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
