import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { gzipSync } from "node:zlib";

const profile = await mkdtemp("/tmp/tutor-weblinux-smoke-");
const chrome = spawn(process.env.CHROME ?? "/opt/google/chrome/chrome", [
  "--headless", "--no-sandbox", "--disable-dev-shm-usage",
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });
const closed = new Promise((resolve) => chrome.once("close", resolve));
const url = process.argv[2] ?? "http://127.0.0.1:8765/";
let socket;

async function until(check, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await sleep(100);
  }
  throw new Error(`Timed out after ${timeout / 1000}s`);
}

try {
  const port = await until(async () => {
    try {
      return (await readFile(`${profile}/DevToolsActivePort`, "utf8")).split("\n")[0];
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }, 10_000);
  const [page] = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") {
      console.error("Browser exception:", JSON.stringify(message.params));
    }
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  };
  const send = async (method, params = {}) => {
    const message = await new Promise((resolve) => {
      pending.set(++sequence, resolve);
      socket.send(JSON.stringify({ id: sequence, method, params }));
    });
    if (message.error) throw new Error(message.error.message);
    return message.result;
  };
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  };
  await send("Runtime.enable");
  await send("Page.bringToFront");
  const screen = () => evaluate(`import('./terminal.js').then(({ terminal }) => {
    const buffer = terminal.buffer.active;
    return Array.from({ length: buffer.length },
      (_, index) => buffer.getLine(index).translateToString(true)).join('\\n');
  })`);
  const expect = async (text, timeout = 30_000) => {
    try {
      await until(async () => (await screen()).includes(text), timeout);
    } catch (error) {
      throw new Error(`${error.message}: expected ${JSON.stringify(text)}\n${await screen()}`);
    }
  };
  const line = async (text) => {
    await evaluate(`(() => {
      const area = document.querySelector('.xterm-helper-textarea');
      area.focus();
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', ${JSON.stringify(text)});
      area.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData, bubbles: true, cancelable: true,
      }));
    })()`);
    await sleep(100);
    await send("Input.dispatchKeyEvent", { type: "char", text: "\r", key: "Enter" });
  };
  const vimCommand = async (text) => {
    for (const character of text) {
      await send("Input.dispatchKeyEvent", { type: "char", text: character });
    }
    await send("Input.dispatchKeyEvent", { type: "char", text: "\r", key: "Enter" });
  };
  let job = 0;
  const shell = async (command, timeout = 120_000, expectedStatus = 0) => {
    const marker = `TUTOR_JOB_${++job}_DONE`;
    const start = Date.now();
    await line(`${command}; _status=$?; printf '\\n%s%s:%s\\n' 'TUTOR_JOB_${job}_' 'DONE' "$_status"`);
    await expect(`${marker}:`, timeout);
    const output = await screen();
    const status = Number(output.match(new RegExp(`${marker}:(\\d+)`))?.[1]);
    assert.equal(status, expectedStatus, output);
    console.log(JSON.stringify({ job, seconds: (Date.now() - start) / 1000, command, status }));
    return output;
  };
  const boot = async (label) => {
    const target = new URL(url);
    target.searchParams.set("smoke", label);
    await send("Page.navigate", { url: target.href });
    await until(() => evaluate(`location.href === ${JSON.stringify(target.href)} &&
      document.readyState === 'complete' && !!document.querySelector('#boot')`), 10_000);
    assert.equal(await evaluate("crossOriginIsolated"), true);
    const start = Date.now();
    await evaluate("document.querySelector('#boot').click()");
    await expect("tutor:~#", 90_000);
    console.log(JSON.stringify({ boot: label, seconds: (Date.now() - start) / 1000 }));
  };

  await boot("cold");
  await shell("tutor pick 000a-hello-world --no-edit && cd ~/tutor-workspace/000a-hello-world && cat spec.txt");
  const source = '#include <string>\nstd::string hello_world(){ return "Hello, World!"; }\nstd::string greet(std::string_view name){ return name.empty() ? hello_world() : "Hello, " + std::string(name) + "!"; }\n';
  await shell(`printf '%s' '${Buffer.from(source).toString("base64")}' | base64 -d > solution.hpp`);
  if (process.env.DIAGNOSTICS) {
    console.log(await shell("printf 'int main(){return 0;}' > /tmp/tiny.cpp; timeout 45 g++ -v /tmp/tiny.cpp -o /tmp/tiny; result=$?; echo compiler_result=$result; test $result = 0", 70_000));
    console.log(await shell("timeout 20 nvim --headless solution.hpp '+lua print(vim.inspect(vim.v.errmsg))' +qa", 30_000));
  } else if (process.env.REMOTE) {
    console.log(await shell("tutor test 000a --remote bridge --compile-timeout 90", 150_000));
    assert.match(await screen(), /ALL TESTS PASSED/);
    await shell("printf '%s\\n' 'invalid C++' > solution.hpp && tutor test 000a --remote bridge --compile-timeout 90", 150_000, 1);
    assert.match(await screen(), /Compilation Error:/);
  } else if (process.env.BENCHMARK) {
    const script = gzipSync(await readFile(new URL("./benchmark.py", import.meta.url))).toString("base64");
    await shell(`printf '%s' '${script}' | base64 -d | gzip -d > /tmp/tutor-benchmark.py`);
    console.log(await shell("PYTHONPATH=/opt/tutor python3 /tmp/tutor-benchmark.py", 800_000));
  } else if (process.env.PROFILE) {
    const script = await readFile("/tmp/prof.sh");
    await shell(`printf '%s' '${script.toString("base64")}' | base64 -d > /tmp/prof.sh`);
    console.log(await shell("bash /tmp/prof.sh 2>&1 | grep -E '^PROF'", 900_000));
  } else if (process.env.COMPILER_ONLY) {
    console.log(await shell("g++ -H -O3 -std=c++20 -Wall -Wextra -I. harness.cpp -o harness-local", 180_000));
    console.log(await shell("./harness-local", 60_000));
  } else {
    if (!process.env.SKIP_ERROR_CASE) {
      await shell("printf '%s\\n' 'invalid C++' > solution.hpp && tutor test 000a --compile-timeout 240", 270_000, 1);
      assert.match(await screen(), /Compilation Error:/);
      assert.doesNotMatch(await screen(), /Compiler timed out/);
    }
    await shell(`printf '%s' '${Buffer.from(source).toString("base64")}' | base64 -d > solution.hpp`);
    await line("nvim solution.hpp");
    await expect("name.empty()", 60_000);
    await vimCommand(":call append('$', '// Edited in Synvim')");
    await vimCommand(":wq");
    await until(async () => (await evaluate(`import('./terminal.js').then(({ terminal }) => terminal.buffer.active.type)`)) === "normal", 30_000);
    await sleep(500);
    await shell("grep -qx '// Edited in Synvim' solution.hpp");
    assert.match(await shell("tutor test 000a --compile-timeout 240", 270_000), /ALL TESTS PASSED/);
    await shell("tutor-save");
    assert.equal(await evaluate("document.querySelector('#backup-status').textContent"), "Solution saved in this browser.");
    await line("tutor-debug");
    await expect("(gdb)", 240_000);
    await line("break greet");
    await expect("Breakpoint 1 at");
    await line("run");
    await expect("Breakpoint 1, greet", 60_000);
    await line("print name");
    await expect("$1 =");
    await line("step");
    await expect("(gdb)");
    await line("quit");
    await line("y");
    await shell("printf 'Debugger returned to shell\\n'");
    await boot("reload");
    const restore = await evaluate(`(() => {
      document.querySelector('#restore').click();
      return document.querySelector('#restore-command').value;
    })()`);
    assert.match(restore, /^tutor-restore '[A-Za-z0-9+/=]+'$/);
    await shell(restore);
    await shell("grep -qx '// Edited in Synvim' ~/tutor-workspace/000a-hello-world/solution.hpp");
    assert.match(await shell("tutor test 000a --compile-timeout 240", 270_000), /ALL TESTS PASSED/);
    console.log("Verified edit, tests, debugger, and recovered solution.");
  }
} finally {
  socket?.close();
  chrome.kill();
  await closed;
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
