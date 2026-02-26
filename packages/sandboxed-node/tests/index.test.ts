import { afterEach, describe, expect, it } from "vitest";
import {
	NodeFileSystem,
	NodeProcess,
	createInMemoryFileSystem,
	createNodeDriver,
} from "../src/index.js";

function createFs() {
	return createInMemoryFileSystem();
}

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

		proc = new NodeProcess({ filesystem: fs });
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

		proc = new NodeProcess({ filesystem: fs });
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

		proc = new NodeProcess({ filesystem: fs });

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

	it("serves a request via @hono/node-server bridge", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			useDefaultNetwork: true,
		});
		proc = new NodeProcess({
			driver,
			processConfig: {
				cwd: "/",
			},
		});

		const result = await proc.exec(`
      const { serve } = require('@hono/node-server');
      const server = serve({
        fetch: () => new Response('bridge-ok', { status: 200 }),
        port: 0,
        hostname: '127.0.0.1',
      });

      server.once('listening', async () => {
        const address = server.address();
        const res = await fetch('http://127.0.0.1:' + address.port + '/');
        console.log(await res.text());
        server.close(() => console.log('closed'));
      });
    `);

		expect(result.code).toBe(0);
		expect(result.stdout).toContain("bridge-ok");
		expect(result.stdout).toContain("closed");
	});
});
