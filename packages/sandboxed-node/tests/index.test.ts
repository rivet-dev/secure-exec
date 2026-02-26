import { afterEach, describe, expect, it } from "vitest";
import {
	allowAllEnv,
	allowAllFs,
	allowAllNetwork,
	NodeFileSystem,
	NodeProcess,
	createInMemoryFileSystem,
	createNodeDriver,
} from "../src/index.js";

function createFs() {
	return createInMemoryFileSystem();
}

const allowFsNetworkEnv = {
	...allowAllFs,
	...allowAllNetwork,
	...allowAllEnv,
};

describe("NodeProcess", () => {
	let proc: NodeProcess | undefined;

	afterEach(() => {
		proc?.dispose();
		proc = undefined;
	});

	it("runs basic code and returns module.exports", async () => {
		proc = new NodeProcess();
		const result = await proc.run(`module.exports = 1 + 1`);
		expect(result.exports).toBe(2);
	});

	it("returns ESM default export namespace from run()", async () => {
		proc = new NodeProcess();
		const result = await proc.run(`export default 42;`, "/entry.mjs");
		expect(result.exports).toEqual({ default: 42 });
	});

	it("returns ESM named exports from run()", async () => {
		proc = new NodeProcess();
		const result = await proc.run(
			`
	      export const message = 'hello';
	      export const count = 3;
	    `,
			"/entry.mjs",
		);
		expect(result.exports).toEqual({ count: 3, message: "hello" });
	});

	it("returns mixed ESM default and named exports from run()", async () => {
		proc = new NodeProcess();
		const result = await proc.run(
			`
	      export const named = 'value';
	      export default 99;
	    `,
			"/entry.mjs",
		);
		expect(result.exports).toEqual({ default: 99, named: "value" });
	});

	it("captures stdout and stderr", async () => {
		proc = new NodeProcess();
		const result = await proc.exec(`console.log('hello'); console.error('oops');`);
		expect(result.stdout).toBe("hello\n");
		expect(result.stderr).toBe("oops\n");
		expect(result.code).toBe(0);
	});

	it("loads node stdlib polyfills", async () => {
		proc = new NodeProcess();
		const result = await proc.run(`
      const path = require('path');
      module.exports = path.join('foo', 'bar');
    `);
		expect(result.exports).toBe("foo/bar");
	});

	it("does not shim third-party packages in require resolution", async () => {
		proc = new NodeProcess();
		const result = await proc.exec(`require('chalk')`);
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("Cannot find module");
	});

	it("loads tty/constants polyfills and v8 stub", async () => {
		proc = new NodeProcess();
		const result = await proc.run(`
      const tty = require('tty');
      const constants = require('constants');
      const v8 = require('v8');
      let readStreamThrows = false;
      try {
        new tty.ReadStream();
      } catch (error) {
        readStreamThrows = true;
      }
      module.exports = {
        ttyIsatty: tty.isatty(1),
        ttyReadStreamThrows: readStreamThrows,
        constantsKeyCount: Object.keys(constants).length,
        hasSigtermConstant: typeof constants.SIGTERM === 'number',
        heapSizeLimitType: typeof v8.getHeapStatistics().heap_size_limit,
      };
    `);
		const exports = result.exports as {
			ttyIsatty: boolean;
			ttyReadStreamThrows: boolean;
			constantsKeyCount: number;
			hasSigtermConstant: boolean;
			heapSizeLimitType: string;
		};
		expect(exports.ttyIsatty).toBe(false);
		expect(exports.ttyReadStreamThrows).toBe(true);
		expect(exports.constantsKeyCount).toBeGreaterThan(10);
		expect(exports.hasSigtermConstant).toBe(true);
		expect(exports.heapSizeLimitType).toBe("number");
	});

	it("errors for unknown modules", async () => {
		proc = new NodeProcess();
		const result = await proc.exec(`require('nonexistent-module')`);
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("Cannot find module");
	});

	it("loads packages from virtual node_modules", async () => {
		const fs = createFs();
		await fs.mkdir("/node_modules/my-pkg");
		await fs.writeFile(
			"/node_modules/my-pkg/package.json",
			JSON.stringify({ name: "my-pkg", main: "index.js" }),
		);
		await fs.writeFile(
			"/node_modules/my-pkg/index.js",
			"module.exports = { add: (a, b) => a + b };",
		);

		proc = new NodeProcess({ filesystem: fs, permissions: allowAllFs });
		const result = await proc.run(`
      const pkg = require('my-pkg');
      module.exports = pkg.add(2, 3);
    `);
		expect(result.exports).toBe(5);
	});

	it("exposes fs module backed by virtual filesystem", async () => {
		const fs = createFs();
		await fs.mkdir("/data");
		await fs.writeFile("/data/hello.txt", "hello world");

		proc = new NodeProcess({ filesystem: fs, permissions: allowAllFs });
		const result = await proc.run(`
      const fs = require('fs');
      module.exports = fs.readFileSync('/data/hello.txt', 'utf8');
		`);
		expect(result.exports).toBe("hello world");
	});

	it("resolves package exports and ESM entrypoints from node_modules", async () => {
		const fs = createFs();
		await fs.mkdir("/node_modules/exported");
		await fs.mkdir("/node_modules/exported/dist");
		await fs.writeFile(
			"/node_modules/exported/package.json",
			JSON.stringify({
				name: "exported",
				exports: {
					".": {
						import: "./dist/index.mjs",
						require: "./dist/index.cjs",
					},
					"./feature": {
						import: "./dist/feature.mjs",
						require: "./dist/feature.cjs",
					},
				},
			}),
		);
		await fs.writeFile(
			"/node_modules/exported/dist/index.cjs",
			"module.exports = { value: 'cjs-entry' };",
		);
		await fs.writeFile(
			"/node_modules/exported/dist/index.mjs",
			"export const value = 'esm-entry';",
		);
		await fs.writeFile(
			"/node_modules/exported/dist/feature.cjs",
			"module.exports = { feature: 'cjs-feature' };",
		);
		await fs.writeFile(
			"/node_modules/exported/dist/feature.mjs",
			"export const feature = 'esm-feature';",
		);

		proc = new NodeProcess({ filesystem: fs, permissions: allowAllFs });

		const cjsResult = await proc.run(`
      const pkg = require('exported');
      const feature = require('exported/feature');
      module.exports = pkg.value + ':' + feature.feature;
    `);
		expect(cjsResult.exports).toBe("cjs-entry:cjs-feature");

		const esmResult = await proc.exec(
			`
        import { value } from 'exported';
        import { feature } from 'exported/feature';
        console.log(value + ':' + feature);
      `,
			{ filePath: "/entry.mjs" },
		);
		expect(esmResult.code).toBe(0);
		expect(esmResult.stdout).toContain("esm-entry:esm-feature");
	});

	it("serves requests through bridged http.createServer and host network fetch", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			useDefaultNetwork: true,
			permissions: allowFsNetworkEnv,
		});
		proc = new NodeProcess({
			driver,
			processConfig: {
				cwd: "/",
			},
		});

		const port = 33221;
		const execPromise = proc.exec(
			`
      (async () => {
        const http = require('http');
        let server;
        server = http.createServer((req, res) => {
          if (req.url === '/shutdown') {
            res.writeHead(200, { 'content-type': 'text/plain' });
            res.end('closing');
            server.close();
            return;
          }

          if (req.url === '/json') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, runtime: 'sandboxed-node' }));
            return;
          }

          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('bridge-ok');
        });

        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(Number(process.env.TEST_PORT), process.env.TEST_HOST, resolve);
        });

        await new Promise((resolve) => {
          server.once('close', resolve);
        });
      })();
    `,
			{
				env: {
					TEST_PORT: String(port),
					TEST_HOST: "127.0.0.1",
				},
			},
		);

		for (let attempt = 0; attempt < 40; attempt++) {
			try {
				const ready = await proc.network.fetch(
					`http://127.0.0.1:${port}/`,
					{ method: "GET" },
				);
				if (ready.status === 200) {
					break;
				}
			} catch {
				// Retry while server starts.
			}
			await new Promise((resolve) => setTimeout(resolve, 25));
		}

		const textResponse = await proc.network.fetch(
			`http://127.0.0.1:${port}/`,
			{ method: "GET" },
		);
		expect(textResponse.status).toBe(200);
		expect(textResponse.body).toBe("bridge-ok");

		const jsonResponse = await proc.network.fetch(
			`http://127.0.0.1:${port}/json`,
			{ method: "GET" },
		);
		expect(jsonResponse.status).toBe(200);
		expect(jsonResponse.body).toContain('"ok":true');

		const shutdownResponse = await proc.network.fetch(
			`http://127.0.0.1:${port}/shutdown`,
			{ method: "GET" },
		);
		expect(shutdownResponse.status).toBe(200);

		const result = await execPromise;
		expect(result.code).toBe(0);
	});

	it("coerces 0.0.0.0 listen to loopback for strict sandboxing", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			useDefaultNetwork: true,
			permissions: allowFsNetworkEnv,
		});
		proc = new NodeProcess({
			driver,
			processConfig: {
				cwd: "/",
			},
		});

		const port = 33222;
		const execPromise = proc.exec(
			`
      (async () => {
        const http = require('http');
        let server;
        server = http.createServer((req, res) => {
          if (req.url === '/shutdown') {
            res.writeHead(200, { 'content-type': 'text/plain' });
            res.end('closing');
            server.close();
            return;
          }
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('loopback-only');
        });

        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(Number(process.env.TEST_PORT), process.env.TEST_HOST, resolve);
        });
        await new Promise((resolve) => server.once('close', resolve));
      })();
    `,
			{
				env: {
					TEST_PORT: String(port),
					TEST_HOST: "0.0.0.0",
				},
			},
		);

		for (let attempt = 0; attempt < 40; attempt++) {
			try {
				const ready = await proc.network.fetch(
					`http://127.0.0.1:${port}/`,
					{ method: "GET" },
				);
				if (ready.status === 200) {
					break;
				}
			} catch {
				// Retry while server starts.
			}
			await new Promise((resolve) => setTimeout(resolve, 25));
		}

		const response = await proc.network.fetch(
			`http://127.0.0.1:${port}/`,
			{ method: "GET" },
		);
		expect(response.status).toBe(200);
		expect(response.body).toBe("loopback-only");

		const shutdown = await proc.network.fetch(
			`http://127.0.0.1:${port}/shutdown`,
			{ method: "GET" },
		);
		expect(shutdown.status).toBe(200);

		const result = await execPromise;
		expect(result.code).toBe(0);
	});

	it("can terminate a running sandbox HTTP server from host side", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			useDefaultNetwork: true,
			permissions: allowFsNetworkEnv,
		});
		proc = new NodeProcess({
			driver,
			processConfig: {
				cwd: "/",
			},
		});

		const port = 33223;
		const execPromise = proc.exec(
			`
      (async () => {
        const http = require('http');
        const server = http.createServer((_req, res) => {
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('running');
        });

        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(Number(process.env.TEST_PORT), process.env.TEST_HOST, resolve);
        });

        await new Promise(() => {
          // Keep alive until host termination.
        });
      })();
    `,
			{
				env: {
					TEST_PORT: String(port),
					TEST_HOST: "127.0.0.1",
				},
			},
		);

		for (let attempt = 0; attempt < 40; attempt++) {
			try {
				const ready = await proc.network.fetch(
					`http://127.0.0.1:${port}/`,
					{ method: "GET" },
				);
				if (ready.status === 200) {
					break;
				}
			} catch {
				// Retry while server starts.
			}
			await new Promise((resolve) => setTimeout(resolve, 25));
		}

		const response = await proc.network.fetch(
			`http://127.0.0.1:${port}/`,
			{ method: "GET" },
		);
		expect(response.status).toBe(200);
		expect(response.body).toBe("running");

		await proc.terminate();

		const result = await Promise.race([
			execPromise,
			new Promise<{ code: number }>((resolve) =>
				setTimeout(() => resolve({ code: -999 }), 2000),
			),
		]);
		expect(result.code).not.toBe(-999);
	});
});
