import { createServer } from "node:net";
import {
  NodeRuntime,
  allowAllNetwork,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
} from "secure-exec";

const host = "127.0.0.1";
const port = await findOpenPort();
const logs: string[] = [];

const runtime = new NodeRuntime({
  systemDriver: createNodeDriver({
    useDefaultNetwork: true,
    permissions: { ...allowAllNetwork },
  }),
  runtimeDriverFactory: createNodeRuntimeDriverFactory(),
  memoryLimit: 128,
  cpuTimeLimitMs: 5000,
});

const execPromise = runtime.exec(`
  (async () => {
    const { Hono } = require("hono");
    const { serve } = require("@hono/node-server");

    const app = new Hono();
    app.get("/", (c) => c.text("hello from sandboxed hono"));
    app.get("/health", (c) => c.json({ ok: true }));

    serve({
      fetch: app.fetch,
      port: ${port},
      hostname: "${host}",
    });

    console.log("server:listening:${port}");
    await new Promise(() => {});
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
`, {
  onStdio: (event) => logs.push(`[${event.channel}] ${event.message}`),
});

try {
  await waitForServer(runtime, `http://${host}:${port}/health`);

  const response = await runtime.network.fetch(`http://${host}:${port}/`, {
    method: "GET",
  });

  console.log(response.status); // 200
  console.log(response.body); // "hello from sandboxed hono"
} finally {
  await runtime.terminate();
  await execPromise.catch(() => undefined);
}

async function findOpenPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Failed to allocate a port"));
        server.close();
        return;
      }

      const allocatedPort = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(allocatedPort);
      });
    });
  });
}

async function waitForServer(runtime: NodeRuntime, url: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await runtime.network.fetch(url, { method: "GET" });
      if (response.status === 200) {
        return;
      }
    } catch {
      // Retry until the server is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for ${url}`);
}
