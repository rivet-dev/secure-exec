const { serve } = require("@hono/node-server");
const { Hono } = require("hono");

(async () => {
  const app = new Hono();

  app.get("/", (c) => c.text("hello from sandboxed hono"));
  app.get("/json", (c) => c.json({ ok: true, runtime: "sandboxed-node" }));

  const server = serve({
    fetch: app.fetch,
    port: 0,
    hostname: "127.0.0.1",
  });

  await new Promise((resolve, reject) => {
    server.once("listening", () => resolve(undefined));
    server.once("error", (err) => reject(err));
  });

  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("Server did not expose an address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const textResponse = await fetch(`${baseUrl}/`);
  const jsonResponse = await fetch(`${baseUrl}/json`);

  console.log(`text:${textResponse.status}:${await textResponse.text()}`);
  console.log(`json:${jsonResponse.status}:${await jsonResponse.text()}`);

  await new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve(undefined);
    });
  });

  console.log("server:closed");
})();
