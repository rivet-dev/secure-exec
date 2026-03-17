import { afterEach, describe, expect, it } from "vitest";
import {
	allowAllEnv,
	allowAllFs,
	allowAllNetwork,
	NodeFileSystem,
	NodeRuntime,
	createInMemoryFileSystem,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
} from "../../../src/index.js";
import { createTestNodeRuntime } from "../../test-utils.js";
import {
	HARDENED_NODE_CUSTOM_GLOBALS,
	MUTABLE_NODE_CUSTOM_GLOBALS,
} from "../../../src/shared/global-exposure.js";

function createFs() {
	return createInMemoryFileSystem();
}

const allowFsNetworkEnv = {
	...allowAllFs,
	...allowAllNetwork,
	...allowAllEnv,
};

type CapturedConsoleEvent = {
	channel: "stdout" | "stderr";
	message: string;
};

function formatConsoleChannel(
	events: CapturedConsoleEvent[],
	channel: CapturedConsoleEvent["channel"],
): string {
	const lines = events
		.filter((event) => event.channel === channel)
		.map((event) => event.message);
	return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

function createConsoleCapture() {
	const events: CapturedConsoleEvent[] = [];
	return {
		events,
		onStdio: (event: CapturedConsoleEvent) => {
			events.push(event);
		},
		stdout: () => formatConsoleChannel(events, "stdout"),
		stderr: () => formatConsoleChannel(events, "stderr"),
	};
}

describe("NodeRuntime", () => {
	let proc: NodeRuntime | undefined;

	afterEach(() => {
		proc?.dispose();
		proc = undefined;
	});

	it("runs basic code and returns module.exports", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`module.exports = 1 + 1`);
		expect(result.exports).toBe(2);
	});

	it("accepts explicit execution factory and keeps driver-owned runtime config", async () => {
		const driver = createNodeDriver({
			processConfig: { cwd: "/sandbox-app" },
		});
		proc = new NodeRuntime({
			systemDriver: driver,
			runtimeDriverFactory: createNodeRuntimeDriverFactory(),
		});
		const result = await proc.run(`module.exports = process.cwd();`);
		expect(result.exports).toBe("/sandbox-app");
	});

	it("returns ESM default export namespace from run()", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`export default 42;`, "/entry.mjs");
		expect(result.exports).toEqual({ default: 42 });
	});

	it("returns ESM named exports from run()", async () => {
		proc = createTestNodeRuntime();
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
		proc = createTestNodeRuntime();
		const result = await proc.run(
			`
	      export const named = 'value';
	      export default 99;
	    `,
			"/entry.mjs",
		);
		expect(result.exports).toEqual({ default: 99, named: "value" });
	});

	it("drops console output by default without a hook", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.exec(`console.log('hello'); console.error('oops');`);
		expect(result).not.toHaveProperty("stdout");
		expect(result.errorMessage).toBeUndefined();
		expect(result.code).toBe(0);
	});

	it("streams ordered stdout/stderr hook events", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({ onStdio: capture.onStdio });
		const result = await proc.exec(`
      console.log("first");
      console.warn("second");
      console.error("third");
      console.log("fourth");
    `);
		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(result.errorMessage).toBeUndefined();
		expect(capture.events).toEqual([
			{ channel: "stdout", message: "first" },
			{ channel: "stderr", message: "second" },
			{ channel: "stderr", message: "third" },
			{ channel: "stdout", message: "fourth" },
		]);
	});

	it("continues execution when the host log hook throws", async () => {
		const seen: CapturedConsoleEvent[] = [];
		proc = createTestNodeRuntime({
			onStdio: (event) => {
				seen.push(event);
				throw new Error("hook-failure");
			},
		});
		const result = await proc.exec(`console.log("keep-going");`);
		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(result.errorMessage).toBeUndefined();
		expect(seen).toEqual([{ channel: "stdout", message: "keep-going" }]);
	});

	it("logs circular objects to hook without throwing", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({ onStdio: capture.onStdio });
		const result = await proc.exec(`
      const value = { name: 'root' };
      value.self = value;
      console.log(value);
    `);
		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toContain("[Circular]");
	});

	it("logs null and undefined values to hook", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({ onStdio: capture.onStdio });
		const result = await proc.exec(`console.log(null, undefined);`);
		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe("null undefined\n");
	});

	it("logs circular objects to stderr hook without throwing", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({ onStdio: capture.onStdio });
		const result = await proc.exec(`
      const value = { name: 'root' };
      value.self = value;
      console.error(value);
    `);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(capture.stderr()).toContain("[Circular]");
	});

	it("bounds deep and large console payloads in hook mode", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({ onStdio: capture.onStdio });
		const result = await proc.exec(`
	      const deep = { level: 0 };
	      let cursor = deep;
	      for (let i = 1; i < 30; i += 1) {
	        cursor.next = { level: i };
	        cursor = cursor.next;
	      }
	      const bounded = { deep };
	      for (let i = 0; i < 60; i += 1) {
	        bounded["k" + i] = i;
	      }
	      const wide = {};
	      for (let i = 0; i < 200; i += 1) {
	        wide["w" + i] = i;
	      }
	      console.log(bounded);
	      console.log(wide);
	    `);
		expect(result.code).toBe(0);
		const stdout = capture.stdout();
		expect(stdout).toContain("[MaxDepth]");
		expect(stdout).toContain('"[Truncated]"');
	});

	it("drops high-volume logs by default without building stdout/stderr buffers", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.exec(`
      for (let i = 0; i < 5000; i += 1) {
        console.log("line-" + i);
      }
      console.error("done");
    `);
		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(result.errorMessage).toBeUndefined();
	});

	it("loads node stdlib polyfills", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
	      const path = require('path');
	      module.exports = path.join('foo', 'bar');
	    `);
		expect(result.exports).toBe("foo/bar");
	});

	it("provides host-backed crypto randomness APIs", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({ onStdio: capture.onStdio });
		const result = await proc.exec(`
	      const bytes = new Uint8Array(16);
	      crypto.getRandomValues(bytes);
	      const uuid = crypto.randomUUID();
	      const uuidV4Pattern =
	        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
	      console.log(uuidV4Pattern.test(uuid), uuid.length, bytes.length);
	    `);
		expect(result.code).toBe(0);
		expect(capture.stdout().trim()).toBe("true 36 16");
	});

	it("prevents sandbox override of host entropy bridge hooks", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({ onStdio: capture.onStdio });
		const result = await proc.exec(`
		      const originalFill = globalThis._cryptoRandomFill;
		      const originalUuid = globalThis._cryptoRandomUUID;
		      globalThis._cryptoRandomFill = {
		        applySync() {
		          throw new Error("host entropy unavailable");
		        },
		      };
		      globalThis._cryptoRandomUUID = {
		        applySync() {
		          throw new Error("host entropy unavailable");
		        },
		      };
		      const bytes = new Uint8Array(4);
		      crypto.getRandomValues(bytes);
		      const uuid = crypto.randomUUID();
		      console.log(
		        originalFill === globalThis._cryptoRandomFill,
		        originalUuid === globalThis._cryptoRandomUUID,
		        bytes.length,
		        uuid.length
		      );
		    `);
		expect(result.code).toBe(0);
		expect(capture.stdout().trim()).toBe("true true 4 36");
	});

	it("does not shim third-party packages in require resolution", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.exec(`require('chalk')`);
		expect(result.code).toBe(1);
		expect(result.errorMessage).toMatch(
			/Cannot find module|EACCES: permission denied/,
		);
	});

	it("loads tty/constants polyfills and v8 stub", async () => {
		proc = createTestNodeRuntime();
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
		proc = createTestNodeRuntime();
		const result = await proc.exec(`require('nonexistent-module')`);
		expect(result.code).toBe(1);
		expect(result.errorMessage).toMatch(
			/Cannot find module|EACCES: permission denied/,
		);
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

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
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

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.run(`
      const fs = require('fs');
      module.exports = fs.readFileSync('/data/hello.txt', 'utf8');
		`);
		expect(result.exports).toBe("hello world");
	});

	it("returns typed directory entries via fs.readdirSync({ withFileTypes: true })", async () => {
		const fs = createFs();
		await fs.mkdir("/data");
		await fs.mkdir("/data/sub");
		await fs.writeFile("/data/file.txt", "value");

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.run(`
      const fs = require('fs');
      const entries = fs.readdirSync('/data', { withFileTypes: true })
        .map((entry) => [entry.name, entry.isDirectory()])
        .sort((a, b) => a[0].localeCompare(b[0]));
      module.exports = entries;
		`);

		expect(result.exports).toEqual([
			["file.txt", false],
			["sub", true],
		]);
	});

	it("supports metadata checks and rename without content-probing helpers", async () => {
		const fs = createFs();
		await fs.mkdir("/data");
		await fs.writeFile("/data/large.txt", "x".repeat(1024 * 1024));

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.run(`
      const fs = require('fs');
      const before = fs.existsSync('/data/large.txt');
      const statSize = fs.statSync('/data/large.txt').size;
      fs.renameSync('/data/large.txt', '/data/renamed.txt');
      module.exports = {
        before,
        afterOld: fs.existsSync('/data/large.txt'),
        afterNew: fs.existsSync('/data/renamed.txt'),
        statSize,
        renamedSize: fs.statSync('/data/renamed.txt').size,
      };
		`);

		expect(result.exports).toEqual({
			before: true,
			afterOld: false,
			afterNew: true,
			statSize: 1024 * 1024,
			renamedSize: 1024 * 1024,
		});
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

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});

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
		expect(esmResult).not.toHaveProperty("stdout");
		expect(capture.stdout()).toContain("esm-entry:esm-feature");
	});

	it("treats .js entry files as ESM under package type module", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		await fs.writeFile("/app/package.json", JSON.stringify({ type: "module" }));
		await fs.writeFile("/app/value.js", "export const value = 42;");

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(
			`
	      import { value } from './value.js';
	      console.log(value);
	    `,
			{ filePath: "/app/entry.js" },
		);

		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe("42\n");
	});

	it("uses CommonJS semantics for .js under package type commonjs", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		await fs.writeFile("/app/package.json", JSON.stringify({ type: "commonjs" }));
		await fs.writeFile("/app/value.js", "module.exports = 9;");

		proc = createTestNodeRuntime({ filesystem: fs, permissions: allowAllFs });
		const result = await proc.run("module.exports = require('/app/value.js');", "/app/entry.js");
		expect(result.exports).toBe(9);
	});

	it("uses Node-like main precedence for require and import when exports is absent", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		await fs.mkdir("/node_modules/entry-meta");
		await fs.writeFile(
			"/node_modules/entry-meta/package.json",
			JSON.stringify({
				name: "entry-meta",
				main: "main.cjs",
				module: "module.mjs",
			}),
		);
		await fs.writeFile(
			"/node_modules/entry-meta/main.cjs",
			"module.exports = { value: 'main-entry' };",
		);
		await fs.writeFile(
			"/node_modules/entry-meta/module.mjs",
			"export const value = 'module-entry';",
		);

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});

		const requireResult = await proc.run(`
	      const pkg = require('entry-meta');
	      module.exports = pkg.value;
	    `);
		expect(requireResult.exports).toBe("main-entry");

		const importResult = await proc.exec(
			`
	        import pkg from 'entry-meta';
	        console.log(pkg.value);
	      `,
			{ filePath: "/app/entry.mjs" },
		);
		expect(importResult.code).toBe(0);
		expect(importResult).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe("main-entry\n");
	});

	it("returns builtin identifiers from require.resolve helpers", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
	      const Module = require('module');
	      module.exports = {
	        requireResolve: require.resolve('fs'),
	        createRequireResolve: Module.createRequire('/app/entry.js').resolve('path'),
	      };
	    `);

		expect(result.exports).toEqual({
			requireResolve: "fs",
			createRequireResolve: "path",
		});
	});

	it("supports default and named ESM imports for node:fs and node:path", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({ onStdio: capture.onStdio });
		const result = await proc.exec(
			`
	      import fs, { readFileSync } from 'node:fs';
	      import path, { join, sep } from 'node:path';
	      console.log(
	        typeof readFileSync,
	        readFileSync === fs.readFileSync,
	        join === path.join,
	        sep === path.sep
	      );
	    `,
			{ filePath: "/entry.mjs" },
		);

		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout().trim()).toBe("function true true true");
	});

	it("evaluates dynamic imports only when import() is reached", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		await fs.writeFile(
			"/app/side-effect.mjs",
			`
      console.log("side-effect");
      export const value = 1;
    `,
		);

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(
			`
      (async () => {
        console.log("before");
        await import("./side-effect.mjs");
        console.log("after");
      })();
    `,
			{ filePath: "/app/entry.js" },
		);

		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe("before\nside-effect\nafter\n");
	});

	it("does not evaluate dynamic imports in untaken branches", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		await fs.writeFile(
			"/app/unused.mjs",
			`
      console.log("loaded");
      export const value = 1;
    `,
		);

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(
			`
      (async () => {
        if (false) {
          await import("./unused.mjs");
        }
        console.log("done");
      })();
    `,
			{ filePath: "/app/entry.js" },
		);

		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe("done\n");
		expect(capture.stdout()).not.toContain("loaded");
	});

	it("returns cached namespace for repeated dynamic imports", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		await fs.writeFile(
			"/app/reused.mjs",
			`
      globalThis.__dynamicImportCount = (globalThis.__dynamicImportCount || 0) + 1;
      export const value = 42;
    `,
		);

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(
			`
      (async () => {
        const first = await import("./reused.mjs");
        const second = await import("./reused.mjs");

        if (first !== second) {
          throw new Error("namespace mismatch");
        }
        if (globalThis.__dynamicImportCount !== 1) {
          throw new Error("module evaluated multiple times");
        }

        console.log("ok");
      })();
    `,
			{ filePath: "/app/entry.js" },
		);

		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe("ok\n");
	});

	it("rejects dynamic import for missing modules with descriptive error", async () => {
		const fs = createFs();
		await fs.mkdir("/app");

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(
			`
      (async () => {
        await import("./missing.mjs");
      })();
    `,
			{ filePath: "/app/entry.js" },
		);

		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain("Cannot load module: /app/missing.mjs");
	});

	it("preserves ESM syntax errors from dynamic import", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		await fs.writeFile("/app/broken.mjs", "export const broken = ;");

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(
			`
	      (async () => {
	        await import('./broken.mjs');
	      })();
	    `,
			{ filePath: "/app/entry.js" },
		);

		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain("Unexpected");
		expect(result.errorMessage).not.toContain("Cannot dynamically import");
	});

	it("preserves ESM evaluation errors from dynamic import", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		await fs.writeFile(
			"/app/throws.mjs",
			"throw new Error('dynamic-import-eval-failure');",
		);

		proc = createTestNodeRuntime({ filesystem: fs, permissions: allowAllFs });
		const result = await proc.exec(
			`
	      (async () => {
	        await import('./throws.mjs');
	      })();
	    `,
			{ filePath: "/app/entry.js" },
		);

		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain("dynamic-import-eval-failure");
		expect(result.errorMessage).not.toContain("Cannot dynamically import");
	});

	it("returns safe dynamic-import namespaces for primitive and null CommonJS exports", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		await fs.writeFile("/app/primitive.cjs", "module.exports = 7;");
		await fs.writeFile("/app/nullish.cjs", "module.exports = null;");

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(
			`
	      (async () => {
	        const primitive = await import('./primitive.cjs');
	        const nullish = await import('./nullish.cjs');
	        console.log(String(primitive.default) + '|' + String(nullish.default));
	      })();
	    `,
			{ filePath: "/app/entry.js" },
		);

		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe("7|null\n");
	});

	it("uses frozen timing values by default", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
      module.exports = {
        dateFrozen: Date.now() === Date.now(),
        perfFrozen: performance.now() === performance.now(),
        hrtimeFrozen: process.hrtime.bigint() === process.hrtime.bigint(),
        sharedArrayBufferType: typeof SharedArrayBuffer,
      };
    `);
		expect(result.exports).toEqual({
			dateFrozen: true,
			perfFrozen: true,
			hrtimeFrozen: true,
			sharedArrayBufferType: "undefined",
		});
	});

	it("restores advancing clocks when timing mitigation is off", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			timingMitigation: "off",
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(`
      (async () => {
        const dateStart = Date.now();
        const perfStart = performance.now();
        const hrStart = process.hrtime.bigint();
        await new Promise((resolve) => setTimeout(resolve, 20));
        console.log(JSON.stringify({
          dateAdvanced: Date.now() > dateStart,
          perfAdvanced: performance.now() > perfStart,
          hrtimeAdvanced: process.hrtime.bigint() > hrStart,
        }));
	      })();
	    `);
		expect(result.code).toBe(0);
		const metrics = JSON.parse(capture.stdout().trim()) as {
			dateAdvanced: boolean;
			perfAdvanced: boolean;
			hrtimeAdvanced: boolean;
		};
		expect(metrics.dateAdvanced).toBe(true);
		expect(metrics.perfAdvanced).toBe(true);
		expect(metrics.hrtimeAdvanced).toBe(true);
	});

	it("times out non-terminating CommonJS execution with cpuTimeLimitMs", async () => {
		proc = createTestNodeRuntime({ cpuTimeLimitMs: 100 });
		const result = await proc.exec("while (true) {}");
		expect(result.code).toBe(124);
		expect(result.errorMessage).toContain("CPU time limit exceeded");
	});

	it("times out non-terminating ESM execution with cpuTimeLimitMs", async () => {
		proc = createTestNodeRuntime({ cpuTimeLimitMs: 100 });
		const result = await proc.exec("while (true) {}", { filePath: "/entry.mjs" });
		expect(result.code).toBe(124);
		expect(result.errorMessage).toContain("CPU time limit exceeded");
	});

	it("times out non-terminating dynamic import evaluation", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		await fs.writeFile("/app/loop.mjs", "while (true) {}");

		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			cpuTimeLimitMs: 100,
		});
		const result = await proc.exec(
			`
      (async () => {
        await import("./loop.mjs");
      })();
    `,
			{ filePath: "/app/entry.js" },
		);
		expect(result.code).toBe(124);
		expect(result.errorMessage).toContain("CPU time limit exceeded");
	});

	it("hardens all custom globals as non-writable and non-configurable", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({ onStdio: capture.onStdio });
		const result = await proc.exec(`
		      const targets = ${JSON.stringify(HARDENED_NODE_CUSTOM_GLOBALS)};
		      const failures = [];
		      for (const name of targets) {
		        const originalValue = globalThis[name];
		        let redefineThrew = false;
		        try {
		          globalThis[name] = { replaced: true };
		        } catch {}
		        try {
		          Object.defineProperty(globalThis, name, {
		            value: { redefined: true },
		          });
		        } catch {
		          redefineThrew = true;
		        }
		        const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
		        if (!descriptor) {
		          failures.push([name, "missing"]);
		          continue;
		        }
		        if (descriptor.writable !== false) failures.push([name, "writable"]);
		        if (descriptor.configurable !== false) failures.push([name, "configurable"]);
		        if (globalThis[name] !== originalValue) failures.push([name, "replaced"]);
		        if (!redefineThrew) failures.push([name, "redefine-no-throw"]);
		      }
		      console.log(JSON.stringify({ checked: targets.length, failures }));
			    `);
		expect(result.code).toBe(0);
		const summary = JSON.parse(capture.stdout().trim()) as {
			checked: number;
			failures: Array<[string, string]>;
		};
		expect(summary.checked).toBe(HARDENED_NODE_CUSTOM_GLOBALS.length);
		expect(summary.failures).toEqual([]);
	});

	it("keeps stdlib globals compatible and mutable runtime globals writable", async () => {
		const capture = createConsoleCapture();
		const fs = createFs();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(
			`
		      const processDescriptor = Object.getOwnPropertyDescriptor(globalThis, "process");
		      const mutableTargets = ${JSON.stringify(MUTABLE_NODE_CUSTOM_GLOBALS)};
		      const mutableDescriptors = Object.fromEntries(
		        mutableTargets.map((name) => {
		          const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
		          return [
		            name,
		            descriptor
		              ? {
		                  exists: true,
		                  writable: descriptor.writable,
		                  configurable: descriptor.configurable,
		                }
		              : { exists: false },
		          ];
		        })
		      );
			      console.log(JSON.stringify({
			        processDescriptor: {
			          writable: processDescriptor?.writable,
			          configurable: processDescriptor?.configurable,
			        },
			        mutableDescriptors,
			      }));
			    `,
			{ filePath: "/entry.js" },
		);
		expect(result.code).toBe(0);
		const payload = JSON.parse(capture.stdout().trim()) as {
			processDescriptor: { writable?: boolean; configurable?: boolean };
			mutableDescriptors: Record<
				string,
				{
					exists: boolean;
					writable?: boolean;
					configurable?: boolean;
				}
			>;
		};
		expect(
			payload.processDescriptor.writable === false &&
				payload.processDescriptor.configurable === false,
		).toBe(false);
		for (const name of MUTABLE_NODE_CUSTOM_GLOBALS) {
			expect(payload.mutableDescriptors[name]?.exists).toBe(true);
			expect(payload.mutableDescriptors[name]?.writable).toBe(true);
			expect(payload.mutableDescriptors[name]?.configurable).toBe(true);
		}
	});

	it("enforces shared cpuTimeLimitMs deadline during active-handle wait", async () => {
		proc = createTestNodeRuntime({ cpuTimeLimitMs: 100 });
		const result = await proc.run(`
	      globalThis._registerHandle("test:stuck", "test unresolved handle");
	      module.exports = 42;
	    `);
		expect(result.code).toBe(124);
		expect(result.errorMessage).toContain("CPU time limit exceeded");
	});

	it("keeps isolate usable after cpuTimeLimitMs timeout", async () => {
		proc = createTestNodeRuntime({ cpuTimeLimitMs: 100 });
		const timedOut = await proc.exec("while (true) {}");
		expect(timedOut.code).toBe(124);

		const recovered = await proc.run("module.exports = 7;");
		expect(recovered.code).toBe(0);
		expect(recovered.exports).toBe(7);
	});

	it("serves requests through bridged http.createServer and host network fetch", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			useDefaultNetwork: true,
			permissions: allowFsNetworkEnv,
		});
		proc = createTestNodeRuntime({
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
            res.end(JSON.stringify({ ok: true, runtime: 'secure-exec' }));
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
		proc = createTestNodeRuntime({
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
		proc = createTestNodeRuntime({
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

	// fs.cpSync / fs.cp — recursive directory copy
	it("copies a single file with fs.cpSync", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/src.txt", "content");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			fs.cpSync('/data/src.txt', '/data/dst.txt');
			module.exports = fs.readFileSync('/data/dst.txt', 'utf8');
		`);
		expect(result.exports).toBe("content");
	});

	it("recursively copies a directory tree with fs.cpSync", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data/src/sub", { recursive: true });
		await vfs.writeFile("/data/src/a.txt", "aaa");
		await vfs.writeFile("/data/src/sub/b.txt", "bbb");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			fs.cpSync('/data/src', '/data/dst', { recursive: true });
			const a = fs.readFileSync('/data/dst/a.txt', 'utf8');
			const b = fs.readFileSync('/data/dst/sub/b.txt', 'utf8');
			module.exports = { a, b };
		`);
		expect(result.exports).toEqual({ a: "aaa", b: "bbb" });
	});

	it("cpSync without recursive throws for directories", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data/src");
		await vfs.writeFile("/data/src/a.txt", "aaa");

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.run(`
			const fs = require('fs');
			try {
				fs.cpSync('/data/src', '/data/dst');
				module.exports = 'no error';
			} catch (e) {
				module.exports = e.code || e.message;
			}
		`);
		expect(result.exports).toBe("ERR_FS_EISDIR");
	});

	it("cp callback form copies a file", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/src.txt", "hello");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			fs.cp('/data/src.txt', '/data/dst.txt', (err) => {
				if (err) { module.exports = err.message; return; }
				module.exports = fs.readFileSync('/data/dst.txt', 'utf8');
			});
		`);
		expect(result.exports).toBe("hello");
	});

	it("fs.promises.cp copies recursively", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data/src/sub", { recursive: true });
		await vfs.writeFile("/data/src/f.txt", "val");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			(async () => {
				await fs.promises.cp('/data/src', '/data/dst', { recursive: true });
				module.exports = fs.readFileSync('/data/dst/f.txt', 'utf8');
			})();
		`);
		expect(result.exports).toBe("val");
	});

	// fs.mkdtempSync / fs.mkdtemp — temporary directory creation
	it("creates a unique temp directory with fs.mkdtempSync", async () => {
		const vfs = createFs();
		await vfs.mkdir("/tmp", { recursive: true });

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const dir1 = fs.mkdtempSync('/tmp/prefix-');
			const dir2 = fs.mkdtempSync('/tmp/prefix-');
			const exists1 = fs.existsSync(dir1);
			const exists2 = fs.existsSync(dir2);
			const stat1 = fs.statSync(dir1);
			module.exports = {
				startsWithPrefix: dir1.startsWith('/tmp/prefix-') && dir2.startsWith('/tmp/prefix-'),
				unique: dir1 !== dir2,
				exists1,
				exists2,
				isDir: stat1.isDirectory(),
			};
		`);
		expect(result.exports).toEqual({
			startsWithPrefix: true,
			unique: true,
			exists1: true,
			exists2: true,
			isDir: true,
		});
	});

	it("mkdtemp callback form creates a temp directory", async () => {
		const vfs = createFs();
		await vfs.mkdir("/tmp", { recursive: true });

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			fs.mkdtemp('/tmp/test-', (err, dir) => {
				if (err) { module.exports = err.message; return; }
				module.exports = {
					prefix: dir.startsWith('/tmp/test-'),
					exists: fs.existsSync(dir),
				};
			});
		`);
		expect(result.exports).toEqual({ prefix: true, exists: true });
	});

	it("fs.promises.mkdtemp creates a temp directory", async () => {
		const vfs = createFs();
		await vfs.mkdir("/tmp", { recursive: true });

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			(async () => {
				const dir = await fs.promises.mkdtemp('/tmp/async-');
				module.exports = {
					prefix: dir.startsWith('/tmp/async-'),
					exists: fs.existsSync(dir),
				};
			})();
		`);
		expect(result.exports).toEqual({ prefix: true, exists: true });
	});

	// fs.opendirSync / fs.opendir — directory handle iteration
	it("iterates directory entries with fs.opendirSync", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data/dir");
		await vfs.mkdir("/data/dir/sub");
		await vfs.writeFile("/data/dir/file.txt", "x");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const dir = fs.opendirSync('/data/dir');
			const entries = [];
			let entry;
			while ((entry = dir.readSync()) !== null) {
				entries.push({ name: entry.name, isDir: entry.isDirectory(), isFile: entry.isFile() });
			}
			dir.closeSync();
			entries.sort((a, b) => a.name.localeCompare(b.name));
			module.exports = entries;
		`);
		expect(result.exports).toEqual([
			{ name: "file.txt", isDir: false, isFile: true },
			{ name: "sub", isDir: true, isFile: false },
		]);
	});

	it("opendir callback form returns a Dir handle", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data/dir");
		await vfs.writeFile("/data/dir/a.txt", "a");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			fs.opendir('/data/dir', (err, dir) => {
				if (err) { module.exports = err.message; return; }
				const entry = dir.readSync();
				dir.closeSync();
				module.exports = { name: entry.name, path: dir.path };
			});
		`);
		expect(result.exports).toEqual({ name: "a.txt", path: "/data/dir" });
	});

	it("fs.promises.opendir returns async-iterable Dir", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data/dir");
		await vfs.writeFile("/data/dir/x.txt", "x");
		await vfs.writeFile("/data/dir/y.txt", "y");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			(async () => {
				const dir = await fs.promises.opendir('/data/dir');
				const names = [];
				for await (const entry of dir) {
					names.push(entry.name);
				}
				names.sort();
				module.exports = names;
			})();
		`);
		expect(result.exports).toEqual(["x.txt", "y.txt"]);
	});

	it("opendirSync throws ENOENT for missing directory", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			try {
				fs.opendirSync('/data/nonexistent');
				module.exports = 'no error';
			} catch (e) {
				module.exports = e.code;
			}
		`);
		expect(result.exports).toBe("ENOENT");
	});
});
