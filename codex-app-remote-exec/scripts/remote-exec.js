#!/usr/bin/env node

const http = require("http");

function parseArgs(argv) {
  const parsed = {
    port: 9223,
    cwd: process.env.HOME || "/",
    timeoutMs: 120000,
    hostId: "",
    command: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      parsed.command = argv.slice(i + 1);
      break;
    }
    if (arg === "--host-id") {
      parsed.hostId = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--port") {
      parsed.port = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--cwd") {
      parsed.cwd = argv[i + 1] || parsed.cwd;
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      parsed.timeoutMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!parsed.hostId) {
    throw new Error("Missing --host-id");
  }
  if (!parsed.command.length) {
    throw new Error("Missing command after --");
  }
  if (!Number.isFinite(parsed.port) || parsed.port <= 0) {
    throw new Error("Invalid --port");
  }
  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) {
    throw new Error("Invalid --timeout-ms");
  }
  return parsed;
}

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "localhost", port, path }, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

async function evaluate(port, expression, timeoutMs) {
  const targets = await getJson(port, "/json/list");
  const page = targets.find((target) => target.type === "page" && target.url.startsWith("app://"));
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error("Codex App page not found on the DevTools port");
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        item.reject(new Error(JSON.stringify(message.error)));
      } else {
        item.resolve(message.result);
      }
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  function send(method, params) {
    id += 1;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  }

  try {
    await send("Runtime.enable", {});
    return await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: timeoutMs + 10000
    });
  } finally {
    ws.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const requestId = `remote-exec-${Date.now()}`;
  const expression = `
(async () => {
  const hostId = ${JSON.stringify(args.hostId)};
  const requestId = ${JSON.stringify(requestId)};
  const response = await new Promise(async (resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve({ timeout: true });
    }, ${JSON.stringify(args.timeoutMs)});
    const handler = (event) => {
      const data = event.data;
      if (data && data.hostId === hostId && data.message && data.message.id === requestId) {
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        resolve(data);
      }
    };
    window.addEventListener("message", handler);
    try {
      await window.electronBridge.sendMessageFromView({
        type: "mcp-request",
        hostId,
        request: {
          id: requestId,
          method: "command/exec",
          params: {
            command: ${JSON.stringify(args.command)},
            cwd: ${JSON.stringify(args.cwd)},
            timeoutMs: ${JSON.stringify(Math.max(1000, args.timeoutMs - 1000))},
            disableOutputCap: true
          }
        }
      });
    } catch (error) {
      clearTimeout(timer);
      window.removeEventListener("message", handler);
      resolve({ sendError: String(error), stack: error && error.stack });
    }
  });
  return response;
})()
`;

  const result = await evaluate(args.port, expression, args.timeoutMs + 10000);
  const value = result.result && result.result.value;
  if (!value) {
    throw new Error(JSON.stringify(result));
  }
  if (value.timeout) {
    throw new Error("Timed out waiting for mcp-response");
  }
  if (value.sendError) {
    throw new Error(value.sendError);
  }

  const payload = value.message && value.message.result;
  if (!payload) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (payload.stdout) {
    process.stdout.write(payload.stdout);
  }
  if (payload.stderr) {
    process.stderr.write(payload.stderr);
  }
  process.exitCode = payload.exitCode || 0;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
