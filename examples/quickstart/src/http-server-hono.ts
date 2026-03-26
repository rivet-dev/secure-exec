import {
  NodeRuntime,
  NodeFileSystem,
  allowAll,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
} from "secure-exec";

const port = 3000;
const runtime = new NodeRuntime({
  systemDriver: createNodeDriver({
    filesystem: new NodeFileSystem(),
    useDefaultNetwork: true,
    permissions: allowAll,
  }),
  runtimeDriverFactory: createNodeRuntimeDriverFactory(),
});

// Start a Hono server inside the sandbox
const execPromise = runtime.exec(`
  (async () => {
    const { Hono } = require("hono");
    const { serve } = require("@hono/node-server");

    const app = new Hono();
    app.get("/", (c) => c.text("hello from hono"));

    serve({ fetch: app.fetch, port: ${port}, hostname: "127.0.0.1" });
    await new Promise(() => {});
  })();
`);

// Wait for the server to be ready, then fetch from the host
const url = "http://127.0.0.1:" + port + "/";
for (let i = 0; i < 50; i++) {
  try {
    const r = await runtime.network.fetch(url, { method: "GET" });
    if (r.status === 200) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const response = await runtime.network.fetch(url, { method: "GET" });

console.log(response.status); // 200
console.log(response.body);   // "hello from hono"

await runtime.terminate();
await execPromise.catch(() => {});
