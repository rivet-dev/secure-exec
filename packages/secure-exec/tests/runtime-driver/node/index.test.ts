import * as nodeHttp from "node:http";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
	allowAllEnv,
	allowAllFs,
	allowAllNetwork,
	NodeFileSystem,
	NodeRuntime,
	createInMemoryFileSystem,
	createDefaultNetworkAdapter,
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

const HTTP2_TEST_KEY = readFileSync(
	new URL("../../node-conformance/fixtures/keys/agent8-key.pem", import.meta.url),
	"utf8",
);
const HTTP2_TEST_CERT = readFileSync(
	new URL("../../node-conformance/fixtures/keys/agent8-cert.pem", import.meta.url),
	"utf8",
);
const HTTP2_TEST_CA = readFileSync(
	new URL("../../node-conformance/fixtures/keys/fake-startcom-root-cert.pem", import.meta.url),
	"utf8",
);

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
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			resourceBudgets: { maxOutputBytes: 1024 },
		});
		const result = await proc.exec(`
      for (let i = 0; i < 5000; i += 1) {
        console.log("line-" + i);
      }
      console.error("done");
    `);
		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(result.errorMessage).toBeUndefined();
		// Verify some events arrive (proving output was produced)
		expect(capture.events.length).toBeGreaterThan(0);
		// Verify count is bounded below total (proving budget caps output)
		expect(capture.events.length).toBeLessThan(5001);
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

	it("crypto.getRandomValues succeeds at the 65536-byte Web Crypto API limit", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({ onStdio: capture.onStdio });
		const result = await proc.exec(`
			const bytes = new Uint8Array(65536);
			crypto.getRandomValues(bytes);
			console.log(bytes.byteLength, bytes.some(b => b !== 0));
		`);
		expect(result.code).toBe(0);
		expect(capture.stdout().trim()).toBe("65536 true");
	});

	it("crypto.getRandomValues throws RangeError above 65536 bytes", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({ onStdio: capture.onStdio });
		const result = await proc.exec(`
			try {
				crypto.getRandomValues(new Uint8Array(65537));
				console.log("no error");
			} catch (e) {
				console.log(e.constructor.name, e.message.includes("65536"));
			}
		`);
		expect(result.code).toBe(0);
		expect(capture.stdout().trim()).toBe("RangeError true");
	});

	it("crypto.getRandomValues rejects huge allocation without host OOM", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({ onStdio: capture.onStdio });
		// Allocation of 2GB typed array may itself throw in the sandbox;
		// either way, the host must never allocate the buffer.
		const result = await proc.exec(`
			let threw = false;
			try {
				crypto.getRandomValues(new Uint8Array(2_000_000_000));
			} catch (e) {
				threw = true;
			}
			console.log("threw", threw);
		`);
		expect(result.code).toBe(0);
		expect(capture.stdout().trim()).toBe("threw true");
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

	it("v8.serialize roundtrips Map", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
			const v8 = require('v8');
			const m = new Map([['a', 1], ['b', 2]]);
			const buf = v8.serialize(m);
			const out = v8.deserialize(buf);
			module.exports = {
				isMap: out instanceof Map,
				size: out.size,
				a: out.get('a'),
				b: out.get('b'),
			};
		`);
		const e = result.exports as Record<string, unknown>;
		expect(e.isMap).toBe(true);
		expect(e.size).toBe(2);
		expect(e.a).toBe(1);
		expect(e.b).toBe(2);
	});

	it("v8.serialize roundtrips Set", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
			const v8 = require('v8');
			const s = new Set([1, 2, 3]);
			const buf = v8.serialize(s);
			const out = v8.deserialize(buf);
			module.exports = {
				isSet: out instanceof Set,
				size: out.size,
				has1: out.has(1),
				has2: out.has(2),
				has3: out.has(3),
			};
		`);
		const e = result.exports as Record<string, unknown>;
		expect(e.isSet).toBe(true);
		expect(e.size).toBe(3);
		expect(e.has1).toBe(true);
		expect(e.has2).toBe(true);
		expect(e.has3).toBe(true);
	});

	it("v8.serialize roundtrips RegExp", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
			const v8 = require('v8');
			const r = /foo/gi;
			const buf = v8.serialize(r);
			const out = v8.deserialize(buf);
			module.exports = {
				isRegExp: out instanceof RegExp,
				source: out.source,
				flags: out.flags,
			};
		`);
		const e = result.exports as Record<string, unknown>;
		expect(e.isRegExp).toBe(true);
		expect(e.source).toBe("foo");
		expect(e.flags).toBe("gi");
	});

	it("v8.serialize roundtrips Date", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
			const v8 = require('v8');
			const d = new Date(0);
			const buf = v8.serialize(d);
			const out = v8.deserialize(buf);
			module.exports = {
				isDate: out instanceof Date,
				time: out.getTime(),
			};
		`);
		const e = result.exports as Record<string, unknown>;
		expect(e.isDate).toBe(true);
		expect(e.time).toBe(0);
	});

	it("v8.serialize roundtrips circular references", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
			const v8 = require('v8');
			const obj = { a: 1 };
			obj.self = obj;
			const buf = v8.serialize(obj);
			const out = v8.deserialize(buf);
			module.exports = {
				a: out.a,
				selfIsObj: out.self === out,
			};
		`);
		const e = result.exports as Record<string, unknown>;
		expect(e.a).toBe(1);
		expect(e.selfIsObj).toBe(true);
	});

	it("v8.serialize preserves undefined, NaN, Infinity, -Infinity, BigInt", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
			const v8 = require('v8');
			function rt(v) { return v8.deserialize(v8.serialize(v)); }
			const undef = rt(undefined);
			const nan = rt(NaN);
			const inf = rt(Infinity);
			const ninf = rt(-Infinity);
			const big = rt(42n);
			module.exports = {
				undefIsUndefined: undef === undefined,
				nanIsNaN: Number.isNaN(nan),
				infIsInfinity: inf === Infinity,
				ninfIsNegInfinity: ninf === -Infinity,
				bigIsBigInt: typeof big === 'bigint',
				bigValue: Number(big),
			};
		`);
		const e = result.exports as Record<string, unknown>;
		expect(e.undefIsUndefined).toBe(true);
		expect(e.nanIsNaN).toBe(true);
		expect(e.infIsInfinity).toBe(true);
		expect(e.ninfIsNegInfinity).toBe(true);
		expect(e.bigIsBigInt).toBe(true);
		expect(e.bigValue).toBe(42);
	});

	it("v8.serialize preserves ArrayBuffer and typed arrays", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
			const v8 = require('v8');
			const ab = new ArrayBuffer(4);
			new Uint8Array(ab).set([1, 2, 3, 4]);
			const abOut = v8.deserialize(v8.serialize(ab));

			const u8 = new Uint8Array([10, 20, 30]);
			const u8Out = v8.deserialize(v8.serialize(u8));

			const f32 = new Float32Array([1.5, 2.5]);
			const f32Out = v8.deserialize(v8.serialize(f32));

			module.exports = {
				abIsArrayBuffer: abOut instanceof ArrayBuffer,
				abBytes: Array.from(new Uint8Array(abOut)),
				u8IsUint8Array: u8Out instanceof Uint8Array,
				u8Values: Array.from(u8Out),
				f32IsFloat32Array: f32Out instanceof Float32Array,
				f32Len: f32Out.length,
			};
		`);
		const e = result.exports as Record<string, unknown>;
		expect(e.abIsArrayBuffer).toBe(true);
		expect(e.abBytes).toEqual([1, 2, 3, 4]);
		expect(e.u8IsUint8Array).toBe(true);
		expect(e.u8Values).toEqual([10, 20, 30]);
		expect(e.f32IsFloat32Array).toBe(true);
		expect(e.f32Len).toBe(2);
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

	it("resolves deep ESM import chains via O(1) reverse lookup", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		// Create a chain: entry → m0 → m1 → ... → m49 → leaf
		const depth = 50;
		for (let i = 0; i < depth; i++) {
			const next = i < depth - 1 ? `./m${i + 1}.mjs` : "./leaf.mjs";
			await fs.writeFile(
				`/app/m${i}.mjs`,
				`import { value } from '${next}';\nexport { value };`,
			);
		}
		await fs.writeFile("/app/leaf.mjs", "export const value = 'deep-chain-ok';");

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(
			`
			import { value } from './m0.mjs';
			console.log(value);
			`,
			{ filePath: "/app/entry.mjs" },
		);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("deep-chain-ok");
	});

	it("resolves 1000-module ESM import graph within performance budget", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		// Create a wide fan-out: entry imports m0..m999, each exports a constant
		const moduleCount = 1000;
		const imports: string[] = [];
		const logs: string[] = [];
		for (let i = 0; i < moduleCount; i++) {
			await fs.writeFile(`/app/m${i}.mjs`, `export const v${i} = ${i};`);
			imports.push(`import { v${i} } from './m${i}.mjs';`);
			logs.push(`v${i}`);
		}
		const entryCode = `${imports.join("\n")}\nconsole.log(${logs.slice(0, 5).join(" + ")});`;

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});

		const start = performance.now();
		const result = await proc.exec(entryCode, { filePath: "/app/entry.mjs" });
		const elapsed = performance.now() - start;

		expect(result.code).toBe(0);
		// 0+1+2+3+4 = 10
		expect(capture.stdout()).toContain("10");
		// Generous budget — the reverse lookup itself should be <10ms; total includes compile time
		expect(elapsed).toBeLessThan(30_000);
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

	it("waits for entry-module top-level await before exec resolves", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({ onStdio: capture.onStdio });
		const result = await proc.exec(
			`
	      console.log("before");
	      await new Promise((resolve) => {
	        setTimeout(() => {
	          console.log("during");
	          resolve(undefined);
	        }, 10);
	      });
	      console.log("after");
	    `,
			{ filePath: "/entry.mjs" },
		);

		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe("before\nduring\nafter\n");
	});

	it("waits for statically imported modules with top-level await", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		await fs.writeFile(
			"/app/dep.mjs",
			`
	      console.log("dep-before");
	      await new Promise((resolve) => {
	        setTimeout(() => {
	          console.log("dep-after");
	          resolve(undefined);
	        }, 10);
	      });
	      export const value = "ready";
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
	      import { value } from "./dep.mjs";
	      console.log("entry", value);
	    `,
			{ filePath: "/app/entry.mjs" },
		);

		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe("dep-before\ndep-after\nentry ready\n");
	});

	it("waits for dynamic imports of modules with top-level await", async () => {
		const fs = createFs();
		await fs.mkdir("/app");
		await fs.writeFile(
			"/app/tla.mjs",
			`
	      console.log("import-before");
	      await new Promise((resolve) => {
	        setTimeout(() => {
	          console.log("import-after");
	          resolve(undefined);
	        }, 10);
	      });
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
	      console.log("before");
	      const mod = await import("./tla.mjs");
	      console.log("after", mod.value);
	    `,
			{ filePath: "/app/entry.mjs" },
		);

		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe(
			"before\nimport-before\nimport-after\nafter 42\n",
		);
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

	it("SharedArrayBuffer global cannot be restored by sandbox code", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
      let restored = false;
      try {
        Object.defineProperty(globalThis, 'SharedArrayBuffer', {
          value: function FakeSAB() {},
          configurable: true,
        });
        restored = true;
      } catch (e) {
        restored = false;
      }
      // Also try direct assignment
      globalThis.SharedArrayBuffer = function FakeSAB2() {};
      module.exports = {
        stillUndefined: typeof SharedArrayBuffer === 'undefined',
        definePropertyFailed: !restored,
      };
    `);
		expect(result.exports).toEqual({
			stillUndefined: true,
			definePropertyFailed: true,
		});
	});

	it("saved SharedArrayBuffer reference is non-functional after freeze", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
      // Even if somehow a reference was obtained, the prototype is neutered
      const desc = Object.getOwnPropertyDescriptor(globalThis, 'SharedArrayBuffer');
      let protoNeutered = false;
      try {
        // SharedArrayBuffer.prototype should have been neutered before deletion;
        // verify we can't construct anything useful
        const sab = new ArrayBuffer(8);
        // Attempt to access SharedArrayBuffer-specific props on a real SAB
        // (they shouldn't exist on ArrayBuffer, this confirms SAB is gone)
        protoNeutered = typeof sab.grow === 'undefined';
      } catch {
        protoNeutered = true;
      }
      module.exports = {
        isUndefined: desc !== undefined && desc.value === undefined,
        isNonConfigurable: desc !== undefined && desc.configurable === false,
        isNonWritable: desc !== undefined && desc.writable === false,
        protoNeutered,
      };
    `);
		expect(result.exports).toEqual({
			isUndefined: true,
			isNonConfigurable: true,
			isNonWritable: true,
			protoNeutered: true,
		});
	});

	it("Date.now cannot be overridden by sandbox code", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
      const frozenBefore = Date.now();

      // Assignment is silently ignored (setter is a no-op for Node.js compat)
      let assignThrew = false;
      try {
        (function() { 'use strict'; Date.now = () => 999; })();
      } catch (e) {
        assignThrew = e instanceof TypeError;
      }

      let defineThrew = false;
      try {
        Object.defineProperty(Date, 'now', {
          value: () => 999,
          configurable: true,
        });
      } catch (e) {
        defineThrew = e instanceof TypeError;
      }

      module.exports = {
        assignThrew,
        defineThrew,
        stillFrozen: Date.now() === frozenBefore,
      };
    `);
		expect(result.exports).toEqual({
			assignThrew: false,
			defineThrew: true,
			stillFrozen: true,
		});
	});

	it("new Date().getTime() returns degraded value matching Date.now()", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
      const now = Date.now();
      const constructed = new Date().getTime();
      const withArg = new Date(1234567890000).getTime();
      module.exports = {
        matchesFrozen: constructed === now,
        explicitArgPreserved: withArg === 1234567890000,
        dateCallReturnsString: typeof Date() === 'string',
      };
    `);
		expect(result.exports).toEqual({
			matchesFrozen: true,
			explicitArgPreserved: true,
			dateCallReturnsString: true,
		});
	});

	it("performance.now cannot be overridden by sandbox code", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
      let assignThrew = false;
      try {
        (function() { 'use strict'; performance.now = () => 12345; })();
      } catch (e) {
        assignThrew = e instanceof TypeError;
      }

      let defineThrew = false;
      try {
        Object.defineProperty(performance, 'now', {
          value: () => 12345,
        });
      } catch (e) {
        defineThrew = e instanceof TypeError;
      }

      module.exports = {
        assignThrew,
        defineThrew,
        stillZero: performance.now() === 0,
      };
    `);
		expect(result.exports).toEqual({
			assignThrew: true,
			defineThrew: true,
			stillZero: true,
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

	it("times out top-level await during ESM startup", async () => {
		proc = createTestNodeRuntime({ cpuTimeLimitMs: 100 });
		const result = await proc.exec(
			`
	      await new Promise((resolve) => setTimeout(resolve, 10));
	      while (true) {}
	    `,
			{ filePath: "/entry.mjs" },
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

	it("fetch API globals remain functional after hardening", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			driver: createNodeDriver({ useDefaultNetwork: true }),
		});
		const result = await proc.exec(`
			const results = {};
			results.fetchType = typeof fetch;
			results.headersOk = typeof new Headers() === "object";
			results.requestOk = new Request("http://localhost") instanceof Request;
			results.responseOk = new Response("ok") instanceof Response;
			results.blobType = typeof Blob;
			console.log(JSON.stringify(results));
		`);
		expect(result.code).toBe(0);
		const results = JSON.parse(capture.stdout().trim()) as Record<string, unknown>;
		expect(results.fetchType).toBe("function");
		expect(results.headersOk).toBe(true);
		expect(results.requestOk).toBe(true);
		expect(results.responseOk).toBe(true);
		expect(results.blobType).toBe("function");
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

	it("serves a basic bridged http2 request/response over plaintext", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			driver: createNodeDriver({
				filesystem: new NodeFileSystem(),
				networkAdapter: createDefaultNetworkAdapter(),
				permissions: allowFsNetworkEnv,
			}),
		});

		const result = await proc.exec(`
			const http2 = require('http2');
			const server = http2.createServer();
			server.on('stream', (stream, headers, flags) => {
				console.log('server', headers[':method'], headers[':scheme'], flags);
				stream.respond({ ':status': 200, 'content-type': 'text/plain' });
				stream.write('alpha');
				stream.end('beta');
			});
			server.listen(0, () => {
				const client = http2.connect('http://localhost:' + server.address().port);
				const req = client.request();
				let body = '';
				client.on('connect', () => {
					console.log('client-connect', client.encrypted, client.alpnProtocol);
				});
				req.setEncoding('utf8');
				req.on('response', (headers) => {
					console.log('response', headers[':status'], headers['content-type']);
				});
				req.on('data', (chunk) => body += chunk);
				req.on('end', () => {
					console.log('body', body);
					client.close();
					server.close();
				});
				req.end();
			});
		`);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("server GET http 5");
		expect(capture.stdout()).toContain("client-connect false h2c");
		expect(capture.stdout()).toContain("response 200 text/plain");
		expect(capture.stdout()).toContain("body alphabeta");
	});

	it("serves a basic bridged http2 request/response over tls", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			driver: createNodeDriver({
				filesystem: new NodeFileSystem(),
				networkAdapter: createDefaultNetworkAdapter(),
				permissions: allowFsNetworkEnv,
			}),
		});

		const result = await proc.exec(
			`
			const http2 = require('http2');
			const tls = require('tls');
			const { kSocket } = require('internal/http2/util');
			const key = ${JSON.stringify(HTTP2_TEST_KEY)};
			const cert = ${JSON.stringify(HTTP2_TEST_CERT)};
			const ca = ${JSON.stringify(HTTP2_TEST_CA)};
			const server = http2.createSecureServer({ key, cert });
			server.on('stream', (stream) => {
				stream.respond({ ':status': 200, 'content-type': 'application/json' });
				stream.end(JSON.stringify({
					servername: stream.session[kSocket].servername,
					alpnProtocol: stream.session.alpnProtocol,
				}));
			});
			server.listen(0, () => {
				const secureContext = tls.createSecureContext({ ca });
				const client = http2.connect('https://localhost:' + server.address().port, { secureContext });
				console.log('secure-listeners', client.socket.listenerCount('secureConnect'));
				client.on('connect', () => {
					console.log('secure-connect', client.encrypted, client.alpnProtocol, client.originSet.length);
					const req = client.request();
					let body = '';
					req.setEncoding('utf8');
					req.on('data', (chunk) => body += chunk);
					req.on('end', () => {
						console.log('secure-body', body);
						client[kSocket].destroy();
						server.close();
					});
					req.end();
				});
			});
		`,
		);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("secure-listeners 1");
		expect(capture.stdout()).toContain("secure-connect true h2 1");
		expect(capture.stdout()).toContain('"alpnProtocol":"h2"');
	});

	it("supports bridged http2 push streams and nested-push errors", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			driver: createNodeDriver({
				filesystem: new NodeFileSystem(),
				networkAdapter: createDefaultNetworkAdapter(),
				permissions: allowFsNetworkEnv,
			}),
		});

		const result = await proc.exec(`
			const assert = require('assert');
			const http2 = require('http2');
			const server = http2.createServer();
			server.on('stream', (stream, headers) => {
				if (headers[':path'] !== '/') return;
				const port = server.address().port;
				stream.pushStream({
					':scheme': 'http',
					':path': '/pushed',
					':authority': 'localhost:' + port,
				}, (err, push, pushHeaders) => {
					assert.ifError(err);
					console.log('push-callback', pushHeaders[':path']);
					push.respond({ ':status': 200, 'x-push': 'yes' });
					push.end('pushed-body');
					try {
						push.pushStream({}, () => {});
					} catch (error) {
						console.log('nested-push', error.code);
					}
					stream.end('main-body');
				});
				stream.respond({ ':status': 200 });
			});
			server.listen(0, () => {
				const client = http2.connect('http://localhost:' + server.address().port);
				client.on('stream', (stream, headers) => {
					console.log('client-stream', headers[':path']);
					let body = '';
					stream.setEncoding('utf8');
					stream.on('push', (pushHeaders, flags) => {
						console.log('push-headers', pushHeaders[':status'], pushHeaders['x-push'], typeof flags);
					});
					stream.on('data', (chunk) => body += chunk);
					stream.on('end', () => {
						console.log('push-body', body);
						client.close();
						server.close();
					});
					stream.resume();
				});
				const req = client.request({ ':path': '/' });
				let body = '';
				req.setEncoding('utf8');
				req.on('data', (chunk) => body += chunk);
				req.on('end', () => {
					console.log('main-body', body);
				});
				req.end();
			});
		`);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("push-callback /pushed");
		expect(capture.stdout()).toContain("nested-push ERR_HTTP2_NESTED_PUSH");
		expect(capture.stdout()).toContain("client-stream /pushed");
		expect(capture.stdout()).toContain("push-headers 200 yes number");
		expect(capture.stdout()).toContain("push-body pushed-body");
		expect(capture.stdout()).toContain("main-body main-body");
	});

	it("marks HEAD push streams ended before writes", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			driver: createNodeDriver({
				filesystem: new NodeFileSystem(),
				networkAdapter: createDefaultNetworkAdapter(),
				permissions: allowFsNetworkEnv,
			}),
		});

			const result = await proc.exec(`
				const assert = require('assert');
				const http2 = require('http2');
				const server = http2.createServer();
				let pendingCloses = 2;
				const closeWhenSettled = (client) => {
					pendingCloses -= 1;
					if (pendingCloses === 0) {
						server.close();
						client.close();
					}
				};
				server.on('stream', (stream) => {
					stream.pushStream({
						':scheme': 'http',
						':method': 'HEAD',
					':path': '/',
					':authority': 'localhost:' + server.address().port,
				}, (err, push, headers) => {
					assert.ifError(err);
					console.log('head-ended', push._writableState.ended, headers[':method']);
					push.respond();
					push.on('error', (error) => console.log('head-error', error.code));
					console.log('head-write', push.write('ignored'));
					stream.end('done');
				});
				stream.respond({ ':status': 200 });
				});
				server.listen(0, () => {
					const client = http2.connect('http://localhost:' + server.address().port);
					client.on('stream', (stream, headers) => {
						console.log('head-stream', headers[':method']);
						stream.on('push', () => {
							console.log('head-push');
							stream.on('data', () => console.log('head-data'));
							stream.on('end', () => console.log('head-push-end'));
						});
						stream.on('close', () => closeWhenSettled(client));
						stream.resume();
					});
					const req = client.request();
					req.setEncoding('utf8');
					let body = '';
					req.on('data', (chunk) => body += chunk);
					req.on('end', () => console.log('head-main-end', body));
					req.on('close', () => closeWhenSettled(client));
					req.end();
				});
			`);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("head-ended true HEAD");
		expect(capture.stdout()).toContain("head-write false");
			expect(capture.stdout()).toContain("head-error ERR_STREAM_WRITE_AFTER_END");
			expect(capture.stdout()).toContain("head-stream HEAD");
			expect(capture.stdout()).toContain("head-push");
			expect(capture.stdout()).toContain("head-push-end");
			expect(capture.stdout()).toContain("head-main-end done");
		});

	it("tracks bridged http2 settings state and goaway events", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			driver: createNodeDriver({
				filesystem: new NodeFileSystem(),
				networkAdapter: createDefaultNetworkAdapter(),
				permissions: allowFsNetworkEnv,
			}),
		});

		const result = await proc.exec(`
			const assert = require('assert');
			const http2 = require('http2');
			const server = http2.createServer({
				settings: { customSettings: { 1244: 456 } },
				remoteCustomSettings: [55],
			});
			const optionsSymbol = Object.getOwnPropertySymbols(server).find((symbol) => String(symbol) === 'Symbol(options)');
			server.updateSettings({ enablePush: false, maxFrameSize: 16385 });
			console.log('server-settings', server[optionsSymbol].settings.enablePush, server[optionsSymbol].settings.maxFrameSize);
			server.on('session', (session) => {
				console.log('server-session', session.localSettings.customSettings[1244], session.remoteSettings.maxConcurrentStreams);
				session.settings({ maxConcurrentStreams: 2 }, () => console.log('server-settings-ack'));
			});
			server.on('stream', (stream) => {
				console.log('server-remote-settings', stream.session.remoteSettings.enablePush, stream.session.remoteSettings.customSettings[55]);
				stream.session.goaway(0, 0, Buffer.from([1, 2, 3]));
				stream.respond({ ':status': 200 });
				stream.end('ok');
			});
			server.listen(0, () => {
				const client = http2.connect('http://localhost:' + server.address().port, {
					settings: {
						enablePush: false,
						initialWindowSize: 123456,
						customSettings: { 55: 12 },
					},
					remoteCustomSettings: [1244],
				});
				client.on('localSettings', (settings) => console.log('client-local', settings.enablePush, settings.initialWindowSize, settings.customSettings[55]));
				client.on('remoteSettings', (settings) => console.log('client-remote', settings.maxConcurrentStreams, settings.customSettings[1244]));
				client.on('goaway', (code, lastStreamID, buf) => console.log('client-goaway', code, lastStreamID, Buffer.from(buf).toString('hex')));
				const req = client.request({ ':path': '/' });
				req.on('ready', () => {
					console.log('pending-settings', client.pendingSettingsAck);
					client.settings({ maxHeaderListSize: 1 }, () => console.log('client-settings-ack'));
				});
				req.resume();
				req.on('end', () => {
					client.close();
					server.close();
				});
				req.end();
			});
		`);

			expect(result.code).toBe(0);
			expect(capture.stdout()).toContain("server-settings false 16385");
			expect(capture.stdout()).toContain("server-session 456 4294967295");
			expect(capture.stdout()).toContain("server-remote-settings false 12");
			expect(capture.stdout()).toContain("pending-settings true");
			expect(capture.stdout()).toContain("client-local false 123456 12");
			expect(capture.stdout()).toContain("client-remote 2 456");
		expect(capture.stdout()).toContain("client-goaway 0 1 010203");
		expect(capture.stdout()).toContain("client-settings-ack");
	});

	it("tracks bridged http2 session state after setLocalWindowSize", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			driver: createNodeDriver({
				filesystem: new NodeFileSystem(),
				networkAdapter: createDefaultNetworkAdapter(),
				permissions: allowFsNetworkEnv,
			}),
		});

		const result = await proc.exec(`
			const http2 = require('http2');
			const server = http2.createServer();
			server.on('stream', (stream) => {
				stream.respond({ ':status': 200 });
				stream.end('ok');
			});
			server.on('session', (session) => {
				session.setLocalWindowSize(1024 * 1024);
				console.log('server-state', session.state.effectiveLocalWindowSize, session.state.localWindowSize, session.state.remoteWindowSize);
			});
			server.listen(0, () => {
				const client = http2.connect('http://localhost:' + server.address().port);
				client.on('connect', () => {
					client.setLocalWindowSize(20);
					console.log('client-state', client.state.effectiveLocalWindowSize, client.state.localWindowSize, client.state.remoteWindowSize);
					const req = client.request({ ':path': '/' });
					req.resume();
					req.on('end', () => {
						client.close();
						server.close();
					});
					req.end();
				});
			});
		`);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("server-state 1048576 1048576 65535");
		expect(capture.stdout()).toContain("client-state 20 65535 65535");
	});

	it("serves a bridged http2 response from a sandbox FileHandle", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			filesystem: new NodeFileSystem(),
			driver: createNodeDriver({
				filesystem: new NodeFileSystem(),
				networkAdapter: createDefaultNetworkAdapter(),
				permissions: allowFsNetworkEnv,
			}),
		});

		const result = await proc.exec(`
			const fs = require('fs');
			const http2 = require('http2');
			fs.writeFileSync('/tmp/http2-filehandle.txt', 'file-handle-body');
			const handlePromise = fs.promises.open('/tmp/http2-filehandle.txt', 'r');
			handlePromise.then((handle) => {
				const server = http2.createServer();
				server.on('stream', (stream) => {
					stream.respondWithFD(handle, {
						'content-type': 'text/plain',
						'content-length': 16,
					});
				});
				server.on('close', () => handle.close());
				server.listen(0, () => {
					const client = http2.connect('http://localhost:' + server.address().port);
					const req = client.request();
					let body = '';
					req.setEncoding('utf8');
					req.on('response', (headers) => {
						console.log('headers', headers['content-type'], headers['content-length']);
					});
					req.on('data', (chunk) => body += chunk);
					req.on('end', () => {
						console.log('body', body);
						client.close();
						server.close();
					});
					req.end();
				});
			});
		`);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("headers text/plain 16");
		expect(capture.stdout()).toContain("body file-handle-body");
	});

	it("handles bridged secure http2 allowHTTP1 fallback requests", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			driver: createNodeDriver({
				filesystem: new NodeFileSystem(),
				networkAdapter: createDefaultNetworkAdapter(),
				permissions: allowFsNetworkEnv,
			}),
		});

		const result = await proc.exec(`
			const http2 = require('http2');
			const https = require('https');
			const key = ${JSON.stringify(HTTP2_TEST_KEY)};
			const cert = ${JSON.stringify(HTTP2_TEST_CERT)};
			const server = http2.createSecureServer({ key, cert, allowHTTP1: true }, (req, res) => {
				console.log('compat-request', req.httpVersion, req.method, req.url);
				res.writeHead(200, { 'content-type': 'text/plain' });
				res.end('compat-ok');
			});
			server.listen(0, () => {
				https.get(
					'https://localhost:' + server.address().port,
					{ rejectUnauthorized: false },
					(res) => {
						let body = '';
						res.setEncoding('utf8');
						res.on('data', (chunk) => body += chunk);
						res.on('end', () => {
							console.log('compat-response', res.statusCode, body);
							server.close();
						});
					},
				);
			});
		`);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("compat-request 1.1 GET /");
		expect(capture.stdout()).toContain("compat-response 200 compat-ok");
	});

	it("streams bridged http2 request bodies through pipeline callbacks without hanging", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			driver: createNodeDriver({
				filesystem: new NodeFileSystem(),
				networkAdapter: createDefaultNetworkAdapter(),
				permissions: allowFsNetworkEnv,
			}),
		});

		const result = await proc.exec(`
			const { Readable, pipeline } = require('stream');
			const http2 = require('http2');

			const server = http2.createServer((req, res) => {
				pipeline(req, res, () => {});
			});
			server.on('close', () => console.log('server-close'));
			server.listen(0, () => {
				const client = http2.connect('http://localhost:' + server.address().port);
				client.on('close', () => console.log('client-close'));
				const req = client.request({ ':method': 'POST' });
				const source = new Readable({
					read() {
						source.push('hello');
					},
				});
				let count = 0;
				req.on('data', () => {
					count += 1;
					if (count === 10) {
						console.log('client-count', count);
						source.destroy();
					}
				});
				pipeline(source, req, (err) => {
					console.log('pipeline-cb', err ? 'err' : 'ok');
					server.close();
					client.close();
				});
			});
		`);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("client-count 10");
		expect(capture.stdout()).toContain("pipeline-cb err");
		expect(capture.stdout()).toContain("server-close");
		expect(capture.stdout()).toContain("client-close");
	});

	// http.Agent pooling — maxSockets limits concurrency through bridged server
	it("http.Agent with maxSockets=1 serializes concurrent requests", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			networkAdapter: createDefaultNetworkAdapter(),
			permissions: allowFsNetworkEnv,
		});
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			driver,
			processConfig: { cwd: "/" },
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(
			`
			(async () => {
				const http = require('http');
				let concurrent = 0;
				let maxConcurrent = 0;

				const server = http.createServer(async (_req, res) => {
					concurrent++;
					maxConcurrent = Math.max(maxConcurrent, concurrent);
					await new Promise((resolve) => setTimeout(resolve, 100));
					concurrent--;
					res.writeHead(200, { 'content-type': 'text/plain' });
					res.end(String(maxConcurrent));
				});

				await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
				const port = server.address().port;
				const agent = new http.Agent({ maxSockets: 1, keepAlive: true });

				const makeRequest = () => new Promise((resolve, reject) => {
					const req = http.request({
						hostname: '127.0.0.1',
						port,
						path: '/',
						agent,
					}, (res) => {
						let body = '';
						res.on('data', (d) => body += d);
						res.on('end', () => resolve(body));
					});
					req.on('error', reject);
					req.end();
				});

				const results = await Promise.all([makeRequest(), makeRequest()]);
				console.log('RESULTS:' + JSON.stringify(results));
				console.log('MAX:' + maxConcurrent);
				agent.destroy();
				await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
			})();
		`,
		);

		expect(result.code).toBe(0);
		const stdout = capture.stdout();
		const match = stdout.match(/RESULTS:(.+)/);
		expect(match).toBeTruthy();
		const results = JSON.parse(match![1]) as string[];
		expect(results).toHaveLength(2);
		expect(stdout).toContain("MAX:1");
	});

	it("http.Agent exposes Node-compatible naming and _http_agent aliasing", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			networkAdapter: createDefaultNetworkAdapter(),
			permissions: allowFsNetworkEnv,
		});
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			driver,
			processConfig: { cwd: "/" },
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(
			`
			(() => {
				const assert = require('node:assert');
				const http = require('http');
				const httpAgent = require('_http_agent');

				assert.strictEqual(httpAgent.Agent, http.Agent);
				assert.strictEqual(httpAgent.globalAgent, http.globalAgent);

				const agent = new http.Agent({ maxSockets: 2, maxTotalSockets: 3 });
				assert.strictEqual(agent.getName(), 'localhost::');
				assert.strictEqual(agent.getName({ port: 80, localAddress: '192.168.1.1' }), 'localhost:80:192.168.1.1');
				assert.strictEqual(agent.getName({ socketPath: '/tmp/test.sock' }), 'localhost:::/tmp/test.sock');
				assert.strictEqual(agent.getName({ family: 6 }), 'localhost:::6');
				assert.throws(() => new http.Agent({ maxTotalSockets: 'bad' }), (err) => err && err.code === 'ERR_INVALID_ARG_TYPE');
				assert.throws(() => new http.Agent({ maxTotalSockets: 0 }), (err) => err && err.code === 'ERR_OUT_OF_RANGE');
				console.log('AGENT_OK');
			})();
		`,
		);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("AGENT_OK");
	});

	it("http.Agent does not reuse a destroyed keepalive socket for queued requests", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			networkAdapter: createDefaultNetworkAdapter(),
			permissions: allowFsNetworkEnv,
		});
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			driver,
			processConfig: { cwd: "/" },
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(
			`
			(async () => {
				const assert = require('node:assert');
				const http = require('http');

				const server = http.createServer((_req, res) => {
					res.end('ok');
				});

				await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
				const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
				const options = {
					host: '127.0.0.1',
					port: server.address().port,
					path: '/',
					agent,
				};

				const req1 = http.get(options, (res) => {
					res.resume();
					res.on('end', () => {
						req1.socket.destroy();
					});
				});

				const req2 = http.get(options, (res) => {
					res.resume();
					res.on('end', async () => {
						assert.notStrictEqual(req1.socket, req2.socket);
						assert.strictEqual(req2.reusedSocket, false);
						await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
						agent.destroy();
						console.log('DESTROY_OK');
					});
				});

				await new Promise((resolve, reject) => {
					req1.on('error', reject);
					req2.on('error', reject);
					req1.on('socket', (socket) => {
						socket.once('close', resolve);
					});
				});
			})();
		`,
		);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("DESTROY_OK");
	});

	it("http.Agent keeps aborted sockets visible during the response turn", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			networkAdapter: createDefaultNetworkAdapter(),
			permissions: allowFsNetworkEnv,
		});
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			driver,
			processConfig: { cwd: "/" },
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(
			`
			(async () => {
				const assert = require('node:assert');
				const http = require('http');

				const agent = new http.Agent({
					keepAlive: true,
					keepAliveMsecs: 1000,
					maxSockets: 2,
					maxFreeSockets: 2,
				});

				const server = http.createServer((_req, res) => {
					res.end('hello world');
				});

				await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

				await new Promise((resolve, reject) => {
					let responses = 0;
					for (let i = 0; i < 6; i += 1) {
						const req = http.get({
							host: 'localhost',
							port: server.address().port,
							agent,
							path: '/',
						}, () => {});

						req.on('response', () => {
							req.abort();
							const key = Object.keys(agent.sockets)[0];
							const sockets = key ? agent.sockets[key] : undefined;
							assert.ok(sockets);
							assert.ok(sockets.length <= 2);
							responses += 1;
							if (responses === 6) {
								server.close((err) => {
									if (err) reject(err);
									else resolve(undefined);
								});
							}
						});

						req.on('error', reject);
					}
				});

				agent.destroy();
				console.log('ABORT_BOOKKEEPING_OK');
			})();
		`,
		);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("ABORT_BOOKKEEPING_OK");
	});

	it("http.ClientRequest abort emits request close and loopback server aborted events", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			networkAdapter: createDefaultNetworkAdapter(),
			permissions: allowFsNetworkEnv,
		});
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			driver,
			processConfig: { cwd: "/" },
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(
			`
			(async () => {
				const assert = require('node:assert');
				const http = require('http');

				const server = http.createServer((req, res) => {
					req.on('aborted', () => {
						assert.strictEqual(req.aborted, true);
						console.log('SERVER_ABORTED');
						server.close();
					});
					req.on('error', (err) => {
						assert.strictEqual(err.code, 'ECONNRESET');
						assert.strictEqual(err.message, 'aborted');
						console.log('SERVER_ABORT_ERROR');
					});
					res.write('hello');
				});

				await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

				await new Promise((resolve, reject) => {
					const req = http.get({ port: server.address().port }, (res) => {
						res.resume();
						req.abort();
					});

					req.on('abort', () => console.log('REQ_ABORT'));
					req.on('close', () => {
						assert.strictEqual(req.destroyed, true);
						console.log('REQ_CLOSE');
						resolve();
					});
					req.on('error', reject);
				});
			})();
		`,
		);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("REQ_ABORT");
		expect(capture.stdout()).toContain("REQ_CLOSE");
		expect(capture.stdout()).toContain("SERVER_ABORTED");
		expect(capture.stdout()).toContain("SERVER_ABORT_ERROR");
	});

	it("http.ClientRequest abort closes a custom createConnection socket before dispatch", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			networkAdapter: createDefaultNetworkAdapter(),
			permissions: allowFsNetworkEnv,
		});
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			driver,
			processConfig: { cwd: "/" },
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(
			`
			(async () => {
				const http = require('http');
				const net = require('net');

				const server = http.createServer(() => {
					throw new Error('request should not reach the server');
				});

				await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

				await new Promise((resolve, reject) => {
					const req = http.get({
						port: server.address().port,
						createConnection(options, oncreate) {
							const socket = net.createConnection(options, oncreate);
							socket.once('close', () => {
								console.log('CUSTOM_SOCKET_CLOSE');
								server.close(resolve);
							});
							return socket;
						},
					});

					req.on('error', reject);
					req.abort();
				});
			})();
		`,
		);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("CUSTOM_SOCKET_CLOSE");
	});

	it("http.ClientRequest AbortSignal destroys the request with AbortError", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			networkAdapter: createDefaultNetworkAdapter(),
			permissions: allowFsNetworkEnv,
		});
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			driver,
			processConfig: { cwd: "/" },
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(
			`
			(async () => {
				const assert = require('node:assert');
				const http = require('http');

				const controller = new AbortController();
				const server = http.createServer(() => {
					throw new Error('request should not reach the server');
				});

				await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

				await new Promise((resolve) => {
					const req = http.get({
						port: server.address().port,
						signal: controller.signal,
					});

					req.on('error', (err) => {
						assert.strictEqual(err.name, 'AbortError');
						assert.strictEqual(err.code, 'ABORT_ERR');
						console.log('ABORT_SIGNAL_ERROR');
					});

					req.on('close', () => {
						assert.strictEqual(req.aborted, false);
						assert.strictEqual(req.destroyed, true);
						console.log('ABORT_SIGNAL_CLOSE');
						server.close();
						resolve();
					});

					controller.abort();
				});
			})();
		`,
		);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("ABORT_SIGNAL_ERROR");
		expect(capture.stdout()).toContain("ABORT_SIGNAL_CLOSE");
	});

	it("http fake sockets remove once listeners via the original callback", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			networkAdapter: createDefaultNetworkAdapter(),
			permissions: allowFsNetworkEnv,
		});
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			driver,
			processConfig: { cwd: "/" },
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(
			`
			(async () => {
				const http = require('http');

				const server = http.createServer((_req, res) => {
					res.end('ok');
				});

				await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
				const agent = new http.Agent({ keepAlive: true });

				await new Promise((resolve, reject) => {
					const req = http.get({
						host: 'localhost',
						port: server.address().port,
						path: '/',
						agent,
					}, (res) => {
						res.resume();
						res.on('end', async () => {
							const onClose = () => {
								throw new Error('close listener should have been removed');
							};
							req.socket.once('close', onClose);
							req.socket.off('close', onClose);
							req.socket.destroy();
							await new Promise((resolve) => setTimeout(resolve, 0));
							await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
							agent.destroy();
							console.log('SOCKET_ONCE_OFF_OK');
						});
					});

					req.on('error', reject);
					req.on('close', resolve);
				});
			})();
		`,
		);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("SOCKET_ONCE_OFF_OK");
	});

	it("http.Agent evicts a kept-alive socket after the server closes it on the next turn", async () => {
		const driver = createNodeDriver({
			filesystem: new NodeFileSystem(),
			networkAdapter: createDefaultNetworkAdapter(),
			permissions: allowFsNetworkEnv,
		});
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			driver,
			processConfig: { cwd: "/" },
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(
			`
			(async () => {
				const assert = require('node:assert');
				const http = require('http');

				const agent = new http.Agent({
					keepAlive: true,
					keepAliveMsecs: 1000,
					maxSockets: 1,
					maxFreeSockets: 1,
				});

				const server = http.createServer((_req, res) => {
					const socket = res.connection;
					setImmediate(() => socket.end());
					res.end('hello world');
				});

				await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
				const name = 'localhost:' + server.address().port + ':';

				await new Promise((resolve, reject) => {
					const req = http.get({
						host: 'localhost',
						port: server.address().port,
						path: '/',
						agent,
					}, (res) => {
						res.resume();
						res.on('end', () => {
							process.nextTick(() => {
								assert.strictEqual(agent.freeSockets[name].length, 1);
								setTimeout(async () => {
									assert.strictEqual(agent.freeSockets[name], undefined);
									assert.strictEqual(agent.totalSocketCount, 0);
									await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
									agent.destroy();
									console.log('REMOTE_CLOSE_EVICT_OK');
									resolve(undefined);
								}, 200);
							});
						});
					});

					req.on('error', reject);
				});
			})();
		`,
		);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("REMOTE_CLOSE_EVICT_OK");
	});

	// HTTP upgrade — 101 response fires upgrade event
	it("upgrade request fires upgrade event with response and socket", async () => {
		// Upgrade requires raw socket handling — use external server with SSRF exemption
		const testServer = nodeHttp.createServer();
		testServer.on("upgrade", (_req, socket) => {
			socket.write(
				"HTTP/1.1 101 Switching Protocols\r\n" +
					"Upgrade: websocket\r\n" +
					"Connection: Upgrade\r\n" +
					"\r\n",
			);
			socket.end();
		});

		await new Promise<void>((resolve) =>
			testServer.listen(0, "127.0.0.1", resolve),
		);
		const port = (testServer.address() as { port: number }).port;

		try {
			const adapter = createDefaultNetworkAdapter({ initialExemptPorts: [port] });
			const driver = createNodeDriver({
				filesystem: new NodeFileSystem(),
				networkAdapter: adapter,
				permissions: allowFsNetworkEnv,
			});
			const capture = createConsoleCapture();
			proc = createTestNodeRuntime({
				driver,
				processConfig: { cwd: "/" },
				onStdio: capture.onStdio,
			});

			const result = await proc.exec(
				`
				(async () => {
					const http = require('http');

					const upgradeResult = await new Promise((resolve, reject) => {
						const req = http.request({
							hostname: '127.0.0.1',
							port: ${port},
							path: '/',
							headers: { 'Connection': 'Upgrade', 'Upgrade': 'websocket' },
							agent: false,
						});

						let socketFired = false;
						req.on('socket', () => {
							socketFired = true;
						});

						req.on('upgrade', (res, socket) => {
							resolve({
								statusCode: res.statusCode,
								hasSocket: socket !== null && socket !== undefined,
								socketFired,
							});
						});

						req.on('error', reject);
						req.end();
					});

					console.log('UPGRADE:' + JSON.stringify(upgradeResult));
				})();
			`,
			);

			expect(result.code).toBe(0);
			const stdout = capture.stdout();
			const match = stdout.match(/UPGRADE:(.+)/);
			expect(match).toBeTruthy();
			const upgradeResult = JSON.parse(match![1]);
			expect(upgradeResult.statusCode).toBe(101);
			expect(upgradeResult.hasSocket).toBe(true);
			expect(upgradeResult.socketFired).toBe(true);
		} finally {
			await new Promise<void>((resolve) =>
				testServer.close(() => resolve()),
			);
		}
	});

	it("loopback CONNECT requests fire the server connect event", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(async () => {
				const assert = require('node:assert');
				const http = require('http');

				const server = http.createServer((_req, res) => {
					res.end('unexpected');
				});

				server.on('connect', (req, socket) => {
					assert.strictEqual(req.method, 'CONNECT');
					assert.strictEqual(req.url, 'example.com:80');
					socket.write('HTTP/1.1 200 Connection established\\r\\n\\r\\n');
					socket.end('tunnel-ok');
				});

				await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

				const connectResult = await new Promise((resolve, reject) => {
					const req = http.request({
						host: '127.0.0.1',
						port: server.address().port,
						method: 'CONNECT',
						path: 'example.com:80',
						agent: false,
					});

					req.on('connect', (res, socket, head) => {
						socket.destroy();
						resolve({ statusCode: res.statusCode, body: head.toString() });
					});
					req.on('error', reject);
					req.end();
				});

				await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
				console.log('CONNECT:' + JSON.stringify(connectResult));
			})();
		`);

		expect(result.code).toBe(0);
		const match = capture.stdout().match(/CONNECT:(.+)/);
		expect(match).toBeTruthy();
		expect(JSON.parse(match![1])).toEqual({
			statusCode: 200,
			body: "",
		});
	});

	it("loopback requests preserve timer-delayed responses after CONNECT tunnel teardown", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(async () => {
				const assert = require('node:assert');
				const http = require('http');

				const server = http.createServer((req, res) => {
					req.resume();
					res.writeHead(200);
					setTimeout(() => res.end(req.url), 50);
				});

				server.on('connect', (_req, socket) => {
					socket.write('HTTP/1.1 200 Connection established\\r\\n\\r\\n');
					socket.on('end', () => socket.end());
				});

				await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

				await new Promise((resolve, reject) => {
					const req = http.request({
						host: '127.0.0.1',
						port: server.address().port,
						method: 'CONNECT',
						path: 'example.com:80',
					});

					req.on('connect', (_res, socket) => {
						socket.on('end', resolve);
						socket.end();
						socket.resume();
					});
					req.on('error', reject);
					req.end();
				});

				const bodies = await Promise.all([0, 1].map((index) => new Promise((resolve, reject) => {
					http.get({
						host: '127.0.0.1',
						port: server.address().port,
						path: '/request' + index,
					}, (res) => {
						let body = '';
						res.setEncoding('utf8');
						res.on('data', (chunk) => {
							body += chunk;
						});
						res.on('end', () => resolve(body));
					}).on('error', reject);
				})));

				assert.deepStrictEqual(bodies, ['/request0', '/request1']);
				await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
				console.log('CONNECT-TIMER:' + JSON.stringify(bodies));
			})();
		`);

		expect(result.code).toBe(0);
		const match = capture.stdout().match(/CONNECT-TIMER:(.+)/);
		expect(match).toBeTruthy();
		expect(JSON.parse(match![1])).toEqual(["/request0", "/request1"]);
	});

	it("http server listen callbacks receive the server as this", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(async () => {
				const assert = require('node:assert');
				const http = require('http');

				const server = http.createServer((_req, res) => {
					res.end('ok');
				});

				server.listen(0, function() {
					assert.strictEqual(this, server);
					console.log('LISTEN-THIS:' + JSON.stringify({
						port: this.address().port,
						sameServer: this === server,
					}));
					server.close();
				});
			})();
		`);

		expect(result.code).toBe(0);
		const match = capture.stdout().match(/LISTEN-THIS:(.+)/);
		expect(match).toBeTruthy();
		expect(JSON.parse(match![1])).toEqual({
			port: expect.any(Number),
			sameServer: true,
		});
	});

	it("loopback informational responses emit information before the final response", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(async () => {
				const assert = require('node:assert');
				const http = require('http');
				let rawCallbackCount = 0;

				const server = http.createServer((_req, res) => {
					res._writeRaw('HTTP/1.1 102 Processing\\r\\n');
					res._writeRaw('Foo: Bar\\r\\n');
					res._writeRaw('\\r\\n', () => {
						rawCallbackCount += 1;
					});
					res.writeHead(103, { Link: '</main.css>; rel=preload; as=style' });
					res.writeHead(200, { 'Content-Type': 'text/plain', 'ABCD': '1' });
					res.end('done');
				});

				await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

				const events = [];
				const responseResult = await new Promise((resolve, reject) => {
					const req = http.request({
						host: '127.0.0.1',
						port: server.address().port,
						path: '/',
						agent: false,
					});

					req.on('information', (res) => {
						events.push({
							statusCode: res.statusCode,
							statusMessage: res.statusMessage,
							httpVersion: res.httpVersion,
							httpVersionMajor: res.httpVersionMajor,
							httpVersionMinor: res.httpVersionMinor,
							headers: res.headers,
							rawHeaders: res.rawHeaders,
						});
					});

					req.on('response', (res) => {
						let body = '';
						res.setEncoding('utf8');
						res.on('data', (chunk) => {
							body += chunk;
						});
						res.on('end', () => resolve({
							statusCode: res.statusCode,
							body,
							eventCountAtResponse: events.length,
							rawCallbackCount,
							headers: res.headers,
						}));
					});
					req.on('error', reject);
					req.end();
				});

				await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
				console.log('INFO:' + JSON.stringify({ events, responseResult }));
			})();
		`);

		expect(result.code).toBe(0);
		const match = capture.stdout().match(/INFO:(.+)/);
		expect(match).toBeTruthy();
		const payload = JSON.parse(match![1]);
		expect(payload.events).toEqual([
			{
				statusCode: 102,
				statusMessage: "Processing",
				httpVersion: "1.1",
				httpVersionMajor: 1,
				httpVersionMinor: 1,
				headers: { foo: "Bar" },
				rawHeaders: ["Foo", "Bar"],
			},
			{
				statusCode: 103,
				statusMessage: "Early Hints",
				httpVersion: "1.1",
				httpVersionMajor: 1,
				httpVersionMinor: 1,
				headers: { link: "</main.css>; rel=preload; as=style" },
				rawHeaders: ["Link", "</main.css>; rel=preload; as=style"],
			},
		]);
		expect(payload.responseResult).toEqual({
			statusCode: 200,
			body: "done",
			eventCountAtResponse: 2,
			rawCallbackCount: 1,
			headers: {
				abcd: "1",
				"content-type": "text/plain",
			},
		});
	});

	it("http bridge validates methods headers and request paths like Node", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(() => {
				const assert = require('node:assert');
				const common = require('_http_common');
				const http = require('http');

				assert.deepStrictEqual(http.METHODS, [
					'ACL', 'BIND', 'CHECKOUT', 'CONNECT', 'COPY', 'DELETE', 'GET',
					'HEAD', 'LINK', 'LOCK', 'M-SEARCH', 'MERGE', 'MKACTIVITY',
					'MKCALENDAR', 'MKCOL', 'MOVE', 'NOTIFY', 'OPTIONS', 'PATCH',
					'POST', 'PROPFIND', 'PROPPATCH', 'PURGE', 'PUT', 'QUERY',
					'REBIND', 'REPORT', 'SEARCH', 'SOURCE', 'SUBSCRIBE', 'TRACE',
					'UNBIND', 'UNLINK', 'UNLOCK', 'UNSUBSCRIBE',
				]);

				assert.strictEqual(common._checkIsHttpToken('Content-Type'), true);
				assert.strictEqual(common._checkIsHttpToken('bad name'), false);
				assert.strictEqual(common._checkInvalidHeaderChar('ok\\tvalue'), false);
				assert.strictEqual(common._checkInvalidHeaderChar('bad\\u0000value'), true);

				http.validateHeaderName('x-test');
				http.validateHeaderValue('x-test', '1');
				assert.throws(() => http.validateHeaderName('bad name'), { code: 'ERR_INVALID_HTTP_TOKEN' });
				assert.throws(() => http.validateHeaderValue('x-test', undefined), { code: 'ERR_HTTP_INVALID_HEADER_VALUE' });
				assert.throws(() => http.validateHeaderValue('x-test', 'לא תקין'), { code: 'ERR_INVALID_CHAR' });

				assert.throws(() => http.request({ method: '\\u0000', createConnection: () => ({}) }), {
					code: 'ERR_INVALID_HTTP_TOKEN',
				});
				assert.throws(() => http.request({ method: true, createConnection: () => ({}) }), {
					code: 'ERR_INVALID_ARG_TYPE',
				});
				assert.throws(() => http.request({ path: '/bad\\u0000path', createConnection: () => ({}) }), {
					code: 'ERR_UNESCAPED_CHARACTERS',
				});
				assert.throws(() => http.request({ path: '/bad\\uffe2', createConnection: () => ({}) }), {
					code: 'ERR_UNESCAPED_CHARACTERS',
				});

				console.log('HTTP-VALIDATION:ok');
			})();
		`);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("HTTP-VALIDATION:ok");
	});

	it("http bridge preserves request defaults and duplicate set-cookie headers", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(async () => {
				const assert = require('node:assert');
				const http = require('http');

				const server = http.createServer((req, res) => {
					res.setHeader('set-cookie', ['a=b', 'c=d']);
					res.setHeader('x-test-array-header', [1, 2, 3]);
					res.end('ok');
				});

				await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

				const payload = await new Promise((resolve, reject) => {
					const req = http.get({
						host: '127.0.0.1',
						port: server.address().port,
						headers: { 'X-foo': 'bar' },
					}, (res) => {
						res.resume();
						res.on('end', () => resolve({
							method: req.method,
							path: req.path,
							headerNames: req.getHeaderNames(),
							rawHeaderNames: req.getRawHeaderNames(),
							headers: res.headers,
						}));
					});
					req.on('error', reject);
				});

				await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));

				assert.deepStrictEqual(payload, {
					method: 'GET',
					path: '/',
					headerNames: ['x-foo', 'host'],
					rawHeaderNames: ['X-foo', 'Host'],
					headers: {
						'set-cookie': ['a=b', 'c=d'],
						'x-test-array-header': '1, 2, 3',
					},
				});
				console.log('HTTP-HEADERS:' + JSON.stringify(payload));
			})();
		`);

		expect(result.code).toBe(0);
		const match = capture.stdout().match(/HTTP-HEADERS:(.+)/);
		expect(match).toBeTruthy();
		expect(JSON.parse(match![1])).toEqual({
			method: "GET",
			path: "/",
			headerNames: ["x-foo", "host"],
			rawHeaderNames: ["X-foo", "Host"],
			headers: {
				"set-cookie": ["a=b", "c=d"],
				"x-test-array-header": "1, 2, 3",
			},
		});
	});

	it("raw loopback upgrade errors surface through uncaughtException", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(() => {
				const http = require('http');
				const net = require('net');

				const server = http.createServer((_req, _res) => {});
				server.on('upgrade', () => {
					throw new Error('upgrade error');
				});

				process.on('uncaughtException', (error) => {
					process.stdout.write('UPGRADE-ERROR:' + error.message + '\\n');
					process.exit(0);
				});

				server.listen(0, function() {
					const socket = net.createConnection(this.address().port);
					socket.on('connect', () => {
						socket.write(
							'GET /blah HTTP/1.1\\r\\n' +
							'Upgrade: WebSocket\\r\\n' +
							'Connection: Upgrade\\r\\n' +
							'\\r\\n\\r\\nhello world',
						);
					});
				});
			})();
		`);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("UPGRADE-ERROR:upgrade error");
	});

	it("raw loopback net clients reject repeated chunked transfer-encoding", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(() => {
				const assert = require('node:assert');
				const http = require('http');
				const net = require('net');

				const server = http.createServer(() => {
					throw new Error('unexpected request dispatch');
				});

				server.listen(0, () => {
					const client = net.connect(server.address().port, '127.0.0.1');
					let response = '';
					client.setEncoding('utf8');
					client.on('data', (chunk) => {
						response += chunk;
					});
					client.on('end', () => {
						console.log('RAW-400:' + JSON.stringify(response));
						server.close();
					});
					client.on('error', (error) => {
						throw error;
					});
					client.write([
						'POST / HTTP/1.1',
						'Host: 127.0.0.1',
						'Transfer-Encoding: chunkedchunked',
						'',
						'1',
						'A',
						'0',
						'',
					].join('\\r\\n'));
					client.resume();
				});
			})();
		`);

			expect(result.code).toBe(0);
			const match = capture.stdout().match(/RAW-400:(.+)/);
			expect(match).toBeTruthy();
			expect(JSON.parse(match![1])).toBe(
				"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n",
			);
	});

	it("raw loopback net clients pipeline requests separated by extra CRLF", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(() => {
				const assert = require('node:assert');
				const http = require('http');
				const net = require('net');

				const seen = [];
				const server = http.createServer((req, res) => {
					seen.push(req.url);
					res.end(req.url);
				});

				server.listen(0, () => {
					const client = net.connect(server.address().port, '127.0.0.1');
					let response = '';
					client.setEncoding('utf8');
					client.on('data', (chunk) => {
						response += chunk;
					});
					client.on('end', () => {
						console.log('PIPELINE:' + JSON.stringify({ seen, response }));
						server.close();
					});
					client.on('error', (error) => {
						throw error;
					});
					client.write(
						'GET /first HTTP/1.1\\r\\nHost: localhost\\r\\n\\r\\n\\r\\n' +
						'GET /second HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n',
					);
					client.resume();
				});
			})();
		`);

		expect(result.code).toBe(0);
		const match = capture.stdout().match(/PIPELINE:(.+)/);
			expect(match).toBeTruthy();
			expect(JSON.parse(match![1])).toEqual({
				seen: ["/first", "/second"],
				response:
					"HTTP/1.1 200 OK\r\nContent-Length: 6\r\n\r\n/first" +
					"HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\n/second",
			});
	});

	it("net servers preserve keepalive hooks and socket address metadata", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(() => {
				const net = require('net');

				const calls = {
					client: [],
					serverHandle: [],
					serverSocket: [],
					clientInfo: null,
					serverInfo: null,
				};

				const server = net.createServer({
					keepAlive: true,
					keepAliveInitialDelay: 1000,
				}, (socket) => {
					const original = socket._handle.setKeepAlive;
					socket._handle.setKeepAlive = (enable, delay) => {
						calls.serverSocket.push([enable, delay]);
						return original.call(socket._handle, enable, delay);
					};
					calls.serverInfo = {
						localAddress: socket.localAddress,
						localPort: socket.localPort,
						remoteAddress: socket.remoteAddress,
						remotePort: socket.remotePort,
						remoteFamily: socket.remoteFamily,
						address: socket.address(),
					};
					socket.setKeepAlive(true, 1000);
					socket.setKeepAlive(true, 2000);
					socket.setKeepAlive(true, 3000);
					socket.end('done');
					server.close();
				});

				const originalOnConnection = server._handle.onconnection;
				server._handle.onconnection = (err, clientHandle) => {
					const original = clientHandle.setKeepAlive;
					clientHandle.setKeepAlive = (enable, delay) => {
						calls.serverHandle.push([enable, delay]);
						return original.call(clientHandle, enable, delay);
					};
					return originalOnConnection.call(server._handle, err, clientHandle);
				};

				server.listen(0, '127.0.0.1', () => {
					const client = net.connect({
						port: server.address().port,
						host: '127.0.0.1',
						keepAlive: true,
						keepAliveInitialDelay: 456123,
					}, () => client.end());

					const original = client._handle.setKeepAlive;
					client._handle.setKeepAlive = (enable, delay) => {
						calls.client.push([enable, delay]);
						return original.call(client._handle, enable, delay);
					};

					client.on('connect', () => {
						calls.clientInfo = {
							localAddress: client.localAddress,
							localPort: client.localPort,
							remoteAddress: client.remoteAddress,
							remotePort: client.remotePort,
							remoteFamily: client.remoteFamily,
							address: client.address(),
						};
					});

					client.on('close', () => {
						console.log('NET-SOCKET:' + JSON.stringify(calls));
					});
				});
			})();
		`);

		expect(result.code).toBe(0);
		const match = capture.stdout().match(/NET-SOCKET:(.+)/);
		expect(match).toBeTruthy();
		expect(JSON.parse(match![1])).toEqual({
			client: [[true, 456]],
			serverHandle: [[true, 1000]],
			serverSocket: [[true, 2], [true, 3]],
			clientInfo: {
				localAddress: "127.0.0.1",
				localPort: expect.any(Number),
				remoteAddress: "127.0.0.1",
				remotePort: expect.any(Number),
				remoteFamily: "IPv4",
				address: {
					address: "127.0.0.1",
					family: "IPv4",
					port: expect.any(Number),
				},
			},
			serverInfo: {
				localAddress: "127.0.0.1",
				localPort: expect.any(Number),
				remoteAddress: "127.0.0.1",
				remotePort: expect.any(Number),
				remoteFamily: "IPv4",
				address: {
					address: "127.0.0.1",
					family: "IPv4",
					port: expect.any(Number),
				},
			},
		});
	});

	it("net listen exposes address immediately and validates socket timeouts", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(() => {
				const net = require('net');

				const invalidValues = ['100', true, false, undefined, null, '', {}, () => {}, []];
				const rangeValues = [-0.001, -1, -Infinity, Infinity, NaN];
				const invalidCallbacks = [1, '100', true, false, null, {}, [], Symbol('test')];

				const invalidCodes = invalidValues.map((value) => {
					try {
						new net.Socket().setTimeout(value, () => {});
						return 'ok';
					} catch (error) {
						return error.code;
					}
				});

				const rangeCodes = rangeValues.map((value) => {
					try {
						new net.Socket().setTimeout(value, () => {});
						return 'ok';
					} catch (error) {
						return error.code;
					}
				});

				const callbackCodes = invalidCallbacks.map((value) => {
					try {
						new net.Socket().setTimeout(1, value);
						return 'ok';
					} catch (error) {
						return error.code;
					}
				});

				const server = net.createServer(() => {});
				server.listen(0, '127.0.0.1', () => {
					console.log('NET-TIMEOUT-VALIDATION:' + JSON.stringify({
						invalidCodes,
						rangeCodes,
						callbackCodes,
						immediateAddress,
					}));
					server.close();
				});

				const immediateAddress = server.address();
			})();
		`);

		expect(result.code).toBe(0);
		const match = capture.stdout().match(/NET-TIMEOUT-VALIDATION:(.+)/);
		expect(match).toBeTruthy();
		expect(JSON.parse(match![1])).toEqual({
			invalidCodes: Array(9).fill("ERR_INVALID_ARG_TYPE"),
			rangeCodes: Array(5).fill("ERR_OUT_OF_RANGE"),
			callbackCodes: Array(8).fill("ERR_INVALID_ARG_TYPE"),
			immediateAddress: {
				address: "127.0.0.1",
				family: "IPv4",
				port: expect.any(Number),
			},
		});
	});

	it("net listen validates invalid server options like Node", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(() => {
				const net = require('net');

				function captureError(run) {
					try {
						run();
						return null;
					} catch (error) {
						return {
							name: error.name,
							code: error.code,
							message: error.message,
						};
					}
				}

				const validation = {
					booleanListen: captureError(() => net.createServer().listen(false)),
					exclusiveOnly: captureError(() => net.createServer().listen({ exclusive: true })),
					booleanPort: captureError(() => net.createServer().listen({ port: false })),
					invalidFd: captureError(() => net.createServer().listen({ fd: -1 })),
					badPort: captureError(() => net.createServer().listen(-1)),
				};

				const server = net.createServer(() => {});
				server.listen('0', () => {
					console.log('NET-LISTEN-VALIDATION:' + JSON.stringify({
						validation,
						address: server.address(),
					}));
					server.close();
				});
			})();
		`);

		expect(result.code).toBe(0);
		const match = capture.stdout().match(/NET-LISTEN-VALIDATION:(.+)/);
		expect(match).toBeTruthy();
		expect(JSON.parse(match![1])).toEqual({
			validation: {
				booleanListen: {
					name: "TypeError",
					code: "ERR_INVALID_ARG_VALUE",
					message: expect.stringContaining("The argument 'options' is invalid."),
				},
				exclusiveOnly: {
					name: "TypeError",
					code: "ERR_INVALID_ARG_VALUE",
					message: expect.stringContaining('must have the property "port" or "path"'),
				},
				booleanPort: {
					name: "TypeError",
					code: "ERR_INVALID_ARG_VALUE",
					message: expect.stringContaining("The argument 'options' is invalid."),
				},
				invalidFd: {
					name: "TypeError",
					code: "ERR_INVALID_ARG_VALUE",
					message: expect.stringContaining('must have the property "port" or "path"'),
				},
				badPort: {
					name: "RangeError",
					code: "ERR_SOCKET_BAD_PORT",
					message: expect.stringContaining("options.port should be >= 0 and < 65536"),
				},
			},
			address: {
				address: "127.0.0.1",
				family: "IPv4",
				port: expect.any(Number),
			},
		});
	});

	it("net supports Unix path listeners and socket file modes", async () => {
		const fs = createFs();
		await fs.mkdir("/tmp");
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowFsNetworkEnv,
		});

		const result = await proc.exec(`
			const assert = require('assert');
			const fs = require('fs');
			const net = require('net');
			const path = '/tmp/runtime-driver-net.sock';
			const server = net.createServer(() => {});
			const timeout = setTimeout(() => {
				throw new Error('net path listen callback did not fire');
			}, 1000);
			server.on('error', (error) => {
				throw error;
			});
			server.listen({ path, readableAll: true, writableAll: true }, () => {
				const mode = fs.statSync(path).mode & 0o777;
				clearTimeout(timeout);
				assert.strictEqual(server.address(), path);
				assert.strictEqual(mode, 0o666);
				process.exit(0);
			});
		`);

		expect(result.code).toBe(0);
	});

	it("net validates IPv4 and IPv6 addresses like Node", async () => {
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
		});

		const result = await proc.run(`
			const net = require('net');
			module.exports = {
				ipv4: net.isIP('127.0.0.1'),
				badIpv4: net.isIP('999.0.0.1'),
				ipv6: net.isIP('::1'),
				zonedIpv6: net.isIP('fe80::2008%eth0'),
				badIpv6: net.isIP('::anything'),
				objectIpv4: net.isIPv4({ toString: () => '127.0.0.1' }),
				objectIpv6: net.isIPv6({ toString: () => '2001:db8::1' }),
				badObjectIpv6: net.isIPv6({ toString: () => 'bla' }),
			};
		`);

		expect(result.exports).toEqual({
			ipv4: 4,
			badIpv4: 0,
			ipv6: 6,
			zonedIpv6: 6,
			badIpv6: 0,
			objectIpv4: true,
			objectIpv6: true,
			badObjectIpv6: false,
		});
	});

	it("net servers expose getConnections and drop sockets above maxConnections", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(() => {
				const net = require('net');

				const state = {
					accepted: 0,
					getConnectionsCounts: [],
					returnedServer: null,
					serverMatches: [],
					drops: [],
					address: null,
					dropCount: null,
				};

				function connectClient(port) {
					const client = net.createConnection({ port, host: '127.0.0.1' });
					client.on('error', () => {});
					return client;
				}

				const server = net.createServer({ allowHalfOpen: true }, (socket) => {
					state.accepted += 1;
					state.serverMatches.push(socket.server === server);
					state.returnedServer = server === server.getConnections((error, count) => {
						state.getConnectionsCounts.push({
							error: error ? error.message : null,
							count,
						});
					});
					socket.end('accepted-' + state.accepted);
				});

				server.maxConnections = 1;
				server.on('drop', (info) => {
					state.drops.push({
						localAddress: info.localAddress,
						localPort: info.localPort,
						remoteAddress: info.remoteAddress,
						remotePort: info.remotePort,
						remoteFamily: info.remoteFamily,
					});
					server.getConnections((error, count) => {
						state.dropCount = {
							error: error ? error.message : null,
							count,
						};
						process.stdout.write(
							'NET-SERVER-BOOKKEEPING:' + JSON.stringify(state) + '\\n',
						);
						process.exit(0);
					});
				});

				server.listen({ port: 0, host: '127.0.0.1', backlog: 4 }, async () => {
					state.address = server.address();
					connectClient(server.address().port);
					connectClient(server.address().port);
				});
			})();
		`);

		expect(result.code).toBe(0);
		const match = capture.stdout().match(/NET-SERVER-BOOKKEEPING:(.+)/);
		expect(match).toBeTruthy();
		expect(JSON.parse(match![1])).toEqual({
			accepted: 1,
			getConnectionsCounts: [{ error: null, count: 1 }],
			returnedServer: true,
			serverMatches: [true],
			drops: [
				{
					localAddress: "127.0.0.1",
					localPort: expect.any(Number),
					remoteAddress: "127.0.0.1",
					remotePort: expect.any(Number),
					remoteFamily: "IPv4",
				},
			],
			address: {
				address: "127.0.0.1",
				family: "IPv4",
				port: expect.any(Number),
			},
			dropCount: {
				error: null,
				count: 1,
			},
		});
	});

	it("unrefed net socket timeouts do not keep the runtime alive", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(() => {
				const net = require('net');

				const server = net.createServer((socket) => {
					socket.write('hello');
					socket.unref();
				});
				server.listen(0, '127.0.0.1');
				const port = server.address().port;
				server.unref();

				const client = net.createConnection(port, '127.0.0.1');
				client.on('connect', () => {
					client.setTimeout(500, () => {
						throw new Error('timeout fired unexpectedly');
					});
					client.unref();
					console.log('NET-TIMEOUT-UNREF:' + port);
				});
			})();
		`);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("NET-TIMEOUT-UNREF:");
	});

	it("unrefed net servers do not keep the runtime alive", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
			onStdio: capture.onStdio,
		});

		const result = await proc.exec(`
			(() => {
				const net = require('net');
				const server = net.createServer(() => {});
				server.listen(0, '127.0.0.1', () => {
					console.log('NET-UNREF:' + server.address().port);
					server.unref();
				});
			})();
		`);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toContain("NET-UNREF:");
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

	it("fs.promises.open returns FileHandle helpers for reads, writes, and streams", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			(async () => {
				const closeEvents = [];

				const writeHandle = await fs.promises.open('/data/file.txt', 'w+');
				writeHandle.on('close', () => closeEvents.push('write'));
				await writeHandle.writeFile(Buffer.from('hello'));
				await writeHandle.close();

				const readHandle = await fs.promises.open('/data/file.txt', 'r');
				const readText = await fs.promises.readFile(readHandle, 'utf8');
				await readHandle.close();

				const streamWriteHandle = await fs.promises.open('/data/stream.txt', 'w+');
				streamWriteHandle.on('close', () => closeEvents.push('stream-write'));
				await new Promise((resolve, reject) => {
					const stream = streamWriteHandle.createWriteStream();
					stream.on('error', reject);
					stream.on('close', resolve);
					stream.end('world');
				});

				const streamReadHandle = await fs.promises.open('/data/stream.txt', 'r');
				streamReadHandle.on('close', () => closeEvents.push('stream-read'));
				const streamed = await new Promise((resolve, reject) => {
					let text = '';
					const stream = fs.createReadStream(null, { fd: streamReadHandle });
					stream.setEncoding('utf8');
					stream.on('error', reject);
					stream.on('data', (chunk) => text += chunk);
					stream.on('close', () => resolve(text));
				});

				module.exports = {
					readText,
					streamed,
					closedFds: [writeHandle.fd, readHandle.fd, streamWriteHandle.fd, streamReadHandle.fd],
					closeEvents,
				};
			})();
		`);
		expect(result.exports).toEqual({
			readText: "hello",
			streamed: "world",
			closedFds: [-1, -1, -1, -1],
			closeEvents: ["write", "stream-write", "stream-read"],
		});
	});

	it("supports Readable.from, stream/consumers, and abort semantics for FileHandle streams", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const { Readable } = require('stream');
			const { buffer } = require('stream/consumers');
			(async () => {
				const writeHandle = await fs.promises.open('/data/from.txt', 'w+');
				await writeHandle.writeFile(Readable.from(['a', 'b', 'c']));
				await writeHandle.close();

				const readHandle = await fs.promises.open('/data/from.txt', 'r');
				const consumed = (await buffer(readHandle.createReadStream())).toString('utf8');
				await readHandle.close();

				const abortHandle = await fs.promises.open('/data/from.txt', 'r');
				const controller = new AbortController();
				const abortState = await new Promise((resolve, reject) => {
					const stream = abortHandle.createReadStream({ signal: controller.signal });
					stream.on('error', (error) => {
						if (error && error.name !== 'AbortError') {
							reject(error);
						}
					});
					stream.on('close', () => {
						resolve({
							closedBeforeManualClose: abortHandle.closed,
							fdBeforeManualClose: abortHandle.fd,
						});
					});
					controller.abort(new Error('stop'));
				});
				await abortHandle.close();

				module.exports = {
					consumed,
					abortState,
					finalAbortFd: abortHandle.fd,
					readHandleClosed: readHandle.closed,
				};
			})();
		`);
		expect(result.exports).toEqual({
			consumed: "abc",
			abortState: {
				closedBeforeManualClose: false,
				fdBeforeManualClose: expect.any(Number),
			},
			finalAbortFd: -1,
			readHandleClosed: true,
		});
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

	// fs.fsyncSync / fs.fdatasyncSync — no-op for in-memory VFS
	it("fsyncSync succeeds on open file descriptor", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/file.txt", "content");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const fd = fs.openSync('/data/file.txt', 'r');
			fs.fsyncSync(fd);
			fs.closeSync(fd);
			module.exports = 'ok';
		`);
		expect(result.exports).toBe("ok");
	});

	it("fdatasyncSync succeeds on open file descriptor", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/file.txt", "content");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const fd = fs.openSync('/data/file.txt', 'w');
			fs.writeSync(fd, 'updated');
			fs.fdatasyncSync(fd);
			fs.closeSync(fd);
			module.exports = fs.readFileSync('/data/file.txt', 'utf8');
		`);
		expect(result.exports).toBe("updated");
	});

	it("fsyncSync throws EBADF for invalid fd", async () => {
		proc = createTestNodeRuntime({
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			try {
				fs.fsyncSync(999);
				module.exports = 'no error';
			} catch (e) {
				module.exports = e.code;
			}
		`);
		expect(result.exports).toBe("EBADF");
	});

	it("fdatasyncSync throws EBADF for invalid fd", async () => {
		proc = createTestNodeRuntime({
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			try {
				fs.fdatasyncSync(999);
				module.exports = 'no error';
			} catch (e) {
				module.exports = e.code;
			}
		`);
		expect(result.exports).toBe("EBADF");
	});

	it("fsync callback form succeeds on valid fd", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/file.txt", "hello");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const fd = fs.openSync('/data/file.txt', 'r');
			let cbResult;
			fs.fsync(fd, (err) => {
				cbResult = err ? err.code : 'ok';
				fs.closeSync(fd);
			});
			module.exports = cbResult;
		`);
		expect(result.exports).toBe("ok");
	});

	// fs.readvSync / fs.readv — scatter-read into multiple buffers
	it("readvSync reads into multiple buffers", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/file.txt", "hello world!");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const fd = fs.openSync('/data/file.txt', 'r');
			const buf1 = Buffer.alloc(5);
			const buf2 = Buffer.alloc(7);
			const bytesRead = fs.readvSync(fd, [buf1, buf2]);
			fs.closeSync(fd);
			module.exports = {
				bytesRead,
				buf1: buf1.toString('utf8'),
				buf2: buf2.toString('utf8'),
			};
		`);
		expect(result.exports).toEqual({
			bytesRead: 12,
			buf1: "hello",
			buf2: " world!",
		});
	});

	it("readvSync reads sequentially (second buffer continues from first)", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/file.txt", "abcdef");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const fd = fs.openSync('/data/file.txt', 'r');
			const buf1 = Buffer.alloc(3);
			const buf2 = Buffer.alloc(3);
			const bytesRead = fs.readvSync(fd, [buf1, buf2]);
			fs.closeSync(fd);
			module.exports = {
				bytesRead,
				buf1: buf1.toString('utf8'),
				buf2: buf2.toString('utf8'),
			};
		`);
		expect(result.exports).toEqual({
			bytesRead: 6,
			buf1: "abc",
			buf2: "def",
		});
	});

	it("readvSync throws EBADF for invalid fd", async () => {
		proc = createTestNodeRuntime({
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			try {
				fs.readvSync(999, [Buffer.alloc(10)]);
				module.exports = 'no error';
			} catch (e) {
				module.exports = e.code;
			}
		`);
		expect(result.exports).toBe("EBADF");
	});

	it("readv callback form reads into buffers", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/file.txt", "foobar");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const fd = fs.openSync('/data/file.txt', 'r');
			const buf1 = Buffer.alloc(3);
			const buf2 = Buffer.alloc(3);
			let out;
			fs.readv(fd, [buf1, buf2], null, (err, bytesRead, buffers) => {
				fs.closeSync(fd);
				out = { bytesRead, b1: buf1.toString('utf8'), b2: buf2.toString('utf8') };
			});
			module.exports = out;
		`);
		expect(result.exports).toEqual({
			bytesRead: 6,
			b1: "foo",
			b2: "bar",
		});
	});

	// fs.statfsSync / fs.statfs — synthetic filesystem stats
	it("statfsSync returns filesystem stats", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const stats = fs.statfsSync('/data');
			module.exports = {
				hasType: typeof stats.type === 'number',
				hasBsize: typeof stats.bsize === 'number',
				hasBlocks: stats.blocks > 0,
				hasBfree: stats.bfree > 0,
				hasFiles: stats.files > 0,
			};
		`);
		expect(result.exports).toEqual({
			hasType: true,
			hasBsize: true,
			hasBlocks: true,
			hasBfree: true,
			hasFiles: true,
		});
	});

	it("statfsSync throws ENOENT for missing path", async () => {
		proc = createTestNodeRuntime({
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			try {
				fs.statfsSync('/nonexistent');
				module.exports = 'no error';
			} catch (e) {
				module.exports = e.code;
			}
		`);
		expect(result.exports).toBe("ENOENT");
	});

	it("statfs callback form returns stats", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			let out;
			fs.statfs('/data', (err, stats) => {
				out = err ? err.code : { bsize: stats.bsize, hasBlocks: stats.blocks > 0 };
			});
			module.exports = out;
		`);
		expect(result.exports).toEqual({ bsize: 4096, hasBlocks: true });
	});

	it("fs.promises.statfs returns stats", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			(async () => {
				const stats = await fs.promises.statfs('/data');
				module.exports = {
					type: typeof stats.type,
					bsize: stats.bsize,
				};
			})();
		`);
		expect(result.exports).toEqual({ type: "number", bsize: 4096 });
	});

	// fs.globSync / fs.glob — pattern matching over VFS
	it("globSync matches files by extension pattern", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data/src", { recursive: true });
		await vfs.writeFile("/data/src/a.js", "a");
		await vfs.writeFile("/data/src/b.ts", "b");
		await vfs.writeFile("/data/src/c.js", "c");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			module.exports = fs.globSync('/data/src/*.js');
		`);
		expect(result.exports).toEqual(["/data/src/a.js", "/data/src/c.js"]);
	});

	it("globSync matches files recursively with **", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data/src/sub", { recursive: true });
		await vfs.writeFile("/data/src/a.js", "a");
		await vfs.writeFile("/data/src/sub/b.js", "b");
		await vfs.writeFile("/data/src/sub/c.txt", "c");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			module.exports = fs.globSync('/data/src/**/*.js');
		`);
		expect(result.exports).toEqual(["/data/src/a.js", "/data/src/sub/b.js"]);
	});

	it("globSync returns empty array for no matches", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			module.exports = fs.globSync('/data/*.nope');
		`);
		expect(result.exports).toEqual([]);
	});

	it("glob callback form returns matching files", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/x.js", "x");
		await vfs.writeFile("/data/y.js", "y");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			let out;
			fs.glob('/data/*.js', (err, matches) => {
				out = err ? err.code : matches;
			});
			module.exports = out;
		`);
		expect(result.exports).toEqual(["/data/x.js", "/data/y.js"]);
	});

	it("fs.promises.glob returns matching files", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/a.ts", "a");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			(async () => {
				module.exports = await fs.promises.glob('/data/*.ts');
			})();
		`);
		expect(result.exports).toEqual(["/data/a.ts"]);
	});

	// WriteStream buffer cap — prevent memory exhaustion from unbounded buffering
	it("WriteStream emits error when buffered data exceeds cap", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
			memoryLimit: 64,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const ws = fs.createWriteStream('/data/big.bin');
			// Write 1MB chunks until we exceed the 16MB cap
			const chunk = Buffer.alloc(1024 * 1024, 0x41);
			let writeFailed = false;
			for (let i = 0; i < 20; i++) {
				const ok = ws.write(chunk);
				if (!ok) {
					writeFailed = true;
					break;
				}
			}
			module.exports = {
				writeFailed,
				destroyed: ws.destroyed,
				errorMessage: ws.errored ? ws.errored.message : null,
			};
		`);
		expect(result.exports.writeFailed).toBe(true);
		expect(result.exports.destroyed).toBe(true);
		expect(result.exports.errorMessage).toContain("WriteStream buffer exceeded");
	});

	// globSync recursion depth limit — prevent stack overflow on deep trees
	it("globSync stops traversal beyond max recursion depth", async () => {
		const vfs = createFs();
		// Build a directory tree deeper than the 100-level limit
		let path = "";
		for (let i = 0; i < 105; i++) {
			path += `/d${i}`;
			await vfs.mkdir(path, { recursive: true });
		}
		// Place a file at depth 105
		await vfs.writeFile(`${path}/deep.txt`, "deep");
		// Place a file at depth 50 (within limit)
		let shallowPath = "";
		for (let i = 0; i < 50; i++) {
			shallowPath += `/d${i}`;
		}
		await vfs.writeFile(`${shallowPath}/shallow.txt`, "shallow");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const matches = fs.globSync('/**/*.txt');
			module.exports = {
				hasShallow: matches.some(m => m.includes('shallow.txt')),
				hasDeep: matches.some(m => m.includes('deep.txt')),
				count: matches.length,
			};
		`);
		// File within depth limit should be found
		expect(result.exports.hasShallow).toBe(true);
		// File beyond depth limit should NOT be found (traversal stopped)
		expect(result.exports.hasDeep).toBe(false);
	});

	// --- Deferred fs APIs: chmod, chown, link, symlink, readlink, truncate, utimes ---

	it("fs.chmodSync succeeds on existing file", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/f.txt", "hello");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			fs.chmodSync('/data/f.txt', 0o755);
			module.exports = true;
		`);
		expect(result.exports).toBe(true);
	});

	it("fs.symlinkSync creates symlink and readlinkSync returns target", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/original.txt", "content");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			fs.symlinkSync('/data/original.txt', '/data/link.txt');
			const target = fs.readlinkSync('/data/link.txt');
			const stat = fs.lstatSync('/data/link.txt');
			module.exports = { target, isSymLink: stat.isSymbolicLink() };
		`);
		expect(result.exports).toEqual({
			target: "/data/original.txt",
			isSymLink: true,
		});
	});

	it("fs.realpathSync resolves symlink to target path", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/real.txt", "content");
		await vfs.symlink("/data/real.txt", "/data/link.txt");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			module.exports = fs.realpathSync('/data/link.txt');
		`);
		expect(result.exports).toBe("/data/real.txt");
	});

	it("fs.realpathSync normalizes . and .. segments", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.mkdir("/data/sub");
		await vfs.writeFile("/data/sub/file.txt", "ok");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			module.exports = fs.realpathSync('/data/sub/../sub/./file.txt');
		`);
		expect(result.exports).toBe("/data/sub/file.txt");
	});

	it("fs.realpathSync resolves chained symlinks", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/target.txt", "hello");
		await vfs.symlink("/data/target.txt", "/data/link1");
		await vfs.symlink("/data/link1", "/data/link2");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			module.exports = fs.realpathSync('/data/link2');
		`);
		expect(result.exports).toBe("/data/target.txt");
	});

	it("fs.linkSync creates hard link", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/src.txt", "hello");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			fs.linkSync('/data/src.txt', '/data/dest.txt');
			module.exports = fs.readFileSync('/data/dest.txt', 'utf8');
		`);
		expect(result.exports).toBe("hello");
	});

	it("fs.truncateSync truncates file", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/big.txt", "hello world");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			fs.truncateSync('/data/big.txt', 5);
			module.exports = fs.readFileSync('/data/big.txt', 'utf8');
		`);
		expect(result.exports).toBe("hello");
	});

	it("fs.utimesSync updates timestamps", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/f.txt", "x");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			fs.utimesSync('/data/f.txt', 1000, 2000);
			module.exports = true;
		`);
		expect(result.exports).toBe(true);
	});

	it("fs.chownSync succeeds on existing file", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/f.txt", "x");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			fs.chownSync('/data/f.txt', 1000, 1000);
			module.exports = true;
		`);
		expect(result.exports).toBe(true);
	});

	it("deferred fs watcher APIs throw clear unsupported errors", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/f.txt", "x");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const fsPromises = require('fs/promises');
			(async () => {
				const outcomes = {};
				try { fs.watch('/data/f.txt'); } catch (err) { outcomes.watch = err.message; }
				try { fs.watchFile('/data/f.txt', () => {}); } catch (err) { outcomes.watchFile = err.message; }
				try {
					for await (const _ of fsPromises.watch('/data/f.txt')) {
						throw new Error('unexpected watch event');
					}
				} catch (err) {
					outcomes.promisesWatch = err.message;
				}
				module.exports = outcomes;
			})();
		`);
		expect(result.exports).toEqual({
			watch: "fs.watch is not supported in sandbox — use polling",
			watchFile: "fs.watchFile is not supported in sandbox — use polling",
			promisesWatch: "fs.promises.watch is not supported in sandbox — use polling",
		});
	});

	it("fs.promises.chmod works", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/f.txt", "x");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			(async () => {
				await fs.promises.chmod('/data/f.txt', 0o700);
				module.exports = true;
			})();
		`);
		expect(result.exports).toBe(true);
	});

	it("fs.promises.symlink and readlink work", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/file.txt", "content");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			(async () => {
				await fs.promises.symlink('/data/file.txt', '/data/sl.txt');
				module.exports = await fs.promises.readlink('/data/sl.txt');
			})();
		`);
		expect(result.exports).toBe("/data/file.txt");
	});

	it("fs.promises.truncate works", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/big.txt", "abcdefghij");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			(async () => {
				await fs.promises.truncate('/data/big.txt', 3);
				module.exports = fs.readFileSync('/data/big.txt', 'utf8');
			})();
		`);
		expect(result.exports).toBe("abc");
	});

	it("callback forms work for chmod, link, symlink, readlink, truncate, utimes, chown", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/f.txt", "hello world");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const results = [];
			fs.chmod('/data/f.txt', 0o700, (err) => { results.push(err === null ? 'chmod ok' : err.message); });
			fs.chown('/data/f.txt', 1, 1, (err) => { results.push(err === null ? 'chown ok' : err.message); });
			fs.link('/data/f.txt', '/data/link.txt', (err) => { results.push(err === null ? 'link ok' : err.message); });
			fs.symlink('/data/f.txt', '/data/sym.txt', (err) => { results.push(err === null ? 'symlink ok' : err.message); });
			fs.readlink('/data/sym.txt', (err, target) => { results.push(err === null ? 'readlink=' + target : err.message); });
			fs.truncate('/data/f.txt', 5, (err) => { results.push(err === null ? 'truncate ok' : err.message); });
			fs.utimes('/data/f.txt', 1, 2, (err) => { results.push(err === null ? 'utimes ok' : err.message); });
			module.exports = results;
		`);
		expect(result.exports).toEqual([
			"chmod ok",
			"chown ok",
			"link ok",
			"symlink ok",
			"readlink=/data/f.txt",
			"truncate ok",
			"utimes ok",
		]);
	});

	it("throws synchronously for callback-style fs validation paths and preserves exists semantics", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/f.txt", "x");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const errors = {};
			try { fs.exists('/data/f.txt'); } catch (err) { errors.exists = err.code; }
			try { fs.open('/data/f.txt'); } catch (err) { errors.open = err.code; }
			try { fs.close(1); } catch (err) { errors.close = err.code; }
			try { fs.stat('/data/f.txt', null); } catch (err) { errors.stat = err.code; }
			try { fs.mkdtemp('/tmp/fs-', {}, null); } catch (err) { errors.mkdtemp = err.code; }
			try { fs.lchown('/data/f.txt', 1, 1, false); } catch (err) { errors.lchown = err.code; }
			fs.exists({}, (value) => {
				module.exports = { errors, invalidExists: value };
			});
		`);
		expect(result.exports).toEqual({
			errors: {
				exists: "ERR_INVALID_ARG_TYPE",
				open: "ERR_INVALID_ARG_TYPE",
				close: "ERR_INVALID_ARG_TYPE",
				stat: "ERR_INVALID_ARG_TYPE",
				mkdtemp: "ERR_INVALID_ARG_TYPE",
				lchown: "ERR_INVALID_ARG_TYPE",
			},
			invalidExists: false,
		});
	});

	it("reports Node-style fs validation codes for encodings, stream ranges, and fd-backed metadata helpers", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/f.txt", "hello");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const fs = require('fs');
			const codes = {};
			try { fs.readFileSync('/data/f.txt', 'test'); } catch (err) { codes.readFile = err.code; }
			try { fs.watch('/data/f.txt', 'test', () => {}); } catch (err) { codes.watch = err.code; }
			try { fs.createReadStream('/data/f.txt', { start: '4' }); } catch (err) { codes.readStream = err.code; }
			try { fs.createWriteStream('/data/f.txt', { start: '4' }); } catch (err) { codes.writeStream = err.code; }
			try { fs.fchmodSync(false, 0o600); } catch (err) { codes.fchmod = err.code; }
			try { fs.fchownSync(false, 1, 1); } catch (err) { codes.fchown = err.code; }
			module.exports = codes;
		`);
		expect(result.exports).toEqual({
			readFile: "ERR_INVALID_ARG_VALUE",
			watch: "ERR_INVALID_ARG_VALUE",
			readStream: "ERR_INVALID_ARG_TYPE",
			writeStream: "ERR_INVALID_ARG_TYPE",
			fchmod: "ERR_INVALID_ARG_TYPE",
			fchown: "ERR_INVALID_ARG_TYPE",
		});
	});

	it("fs.promises.watch preserves validation and abort errors before deferred unsupported failures", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/f.txt", "hello");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: allowAllFs,
		});
		const result = await proc.run(`
			const watch = require('fs/promises').watch;
			(async () => {
				const outcomes = {};
				try {
					for await (const _ of watch(1)) {}
				} catch (err) {
					outcomes.path = err.code;
				}
				try {
					for await (const _ of watch('/data/f.txt', 1)) {}
				} catch (err) {
					outcomes.options = err.code;
				}
				try {
					for await (const _ of watch('/data/f.txt', { recursive: 1 })) {}
				} catch (err) {
					outcomes.recursive = err.code;
				}
				try {
					for await (const _ of watch('/data/f.txt', { encoding: 1 })) {}
				} catch (err) {
					outcomes.encoding = err.code;
				}
				try {
					for await (const _ of watch('/data/f.txt', { signal: 1 })) {}
				} catch (err) {
					outcomes.signal = err.code;
				}
				try {
					const ac = new AbortController();
					ac.abort('reason');
					for await (const _ of watch('/data/f.txt', { signal: ac.signal })) {}
				} catch (err) {
					outcomes.aborted = { name: err.name, code: err.code };
				}
				module.exports = outcomes;
			})();
		`);
		expect(result.exports).toEqual({
			path: "ERR_INVALID_ARG_TYPE",
			options: "ERR_INVALID_ARG_TYPE",
			recursive: "ERR_INVALID_ARG_TYPE",
			encoding: "ERR_INVALID_ARG_VALUE",
			signal: "ERR_INVALID_ARG_TYPE",
			aborted: { name: "AbortError", code: "ABORT_ERR" },
		});
	});

	it("exposes Node-style URL globals and prototype descriptors", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
			const util = require('util');
			const globalUrl = Object.getOwnPropertyDescriptor(globalThis, 'URL');
			const globalSearchParams = Object.getOwnPropertyDescriptor(globalThis, 'URLSearchParams');
			const hrefDescriptor = Object.getOwnPropertyDescriptor(URL.prototype, 'href');
			const appendDescriptor = Object.getOwnPropertyDescriptor(URLSearchParams.prototype, 'append');
			const url = new URL('https://username:password@host.name:8080/path/name/?que=ry#hash');
			module.exports = {
				globals: {
					url: {
						same: globalUrl.value === URL,
						writable: globalUrl.writable,
						configurable: globalUrl.configurable,
						enumerable: globalUrl.enumerable,
					},
					searchParams: {
						same: globalSearchParams.value === URLSearchParams,
						writable: globalSearchParams.writable,
						configurable: globalSearchParams.configurable,
						enumerable: globalSearchParams.enumerable,
					},
				},
				descriptors: {
					hrefEnumerable: hrefDescriptor.enumerable,
					appendEnumerable: appendDescriptor.enumerable,
				},
				inspect: util.inspect(url),
				searchValue: url.searchParams.get('que'),
			};
		`);
		expect(result.exports).toEqual({
			globals: {
				url: {
					same: true,
					writable: true,
					configurable: true,
					enumerable: false,
				},
				searchParams: {
					same: true,
					writable: true,
					configurable: true,
					enumerable: false,
				},
			},
			descriptors: {
				hrefEnumerable: true,
				appendEnumerable: true,
			},
			inspect:
				"URL {\n" +
				"  href: 'https://username:password@host.name:8080/path/name/?que=ry#hash',\n" +
				"  origin: 'https://host.name:8080',\n" +
				"  protocol: 'https:',\n" +
				"  username: 'username',\n" +
				"  password: 'password',\n" +
				"  host: 'host.name:8080',\n" +
				"  hostname: 'host.name',\n" +
				"  port: '8080',\n" +
				"  pathname: '/path/name/',\n" +
				"  search: '?que=ry',\n" +
				"  searchParams: URLSearchParams { 'que' => 'ry' },\n" +
				"  hash: '#hash'\n" +
				"}",
			searchValue: "ry",
		});
	});

	it("preserves Node-style WHATWG URL validation and iterator errors", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
			const outcomes = {};
			try {
				new URL();
			} catch (err) {
				outcomes.urlMissing = { code: err.code, message: err.message };
			}
			try {
				new URL('test');
			} catch (err) {
				outcomes.urlInvalid = { code: err.code, message: err.message };
			}
			const params = new URLSearchParams('a=b&c=d');
			const iterator = params.keys();
			try {
				params.get();
			} catch (err) {
				outcomes.getMissing = { code: err.code, message: err.message };
			}
			try {
				params.entries.call(undefined);
			} catch (err) {
				outcomes.badReceiver = { code: err.code, message: err.message };
			}
			try {
				iterator.next.call(undefined);
			} catch (err) {
				outcomes.badIterator = { code: err.code, message: err.message };
			}
			try {
				new URLSearchParams({ [Symbol.iterator]: 42 });
			} catch (err) {
				outcomes.notIterable = { code: err.code, message: err.message };
			}
			try {
				new URLSearchParams([[1]]);
			} catch (err) {
				outcomes.invalidTuple = { code: err.code, message: err.message };
			}
			module.exports = outcomes;
		`);
		expect(result.exports).toEqual({
			urlMissing: {
				code: "ERR_MISSING_ARGS",
				message: 'The "url" argument must be specified',
			},
			urlInvalid: {
				code: "ERR_INVALID_URL",
				message: "Invalid URL",
			},
			getMissing: {
				code: "ERR_MISSING_ARGS",
				message: 'The "name" argument must be specified',
			},
			badReceiver: {
				code: "ERR_INVALID_THIS",
				message: 'Value of "this" must be of type URLSearchParams',
			},
			badIterator: {
				code: "ERR_INVALID_THIS",
				message: 'Value of "this" must be of type URLSearchParamsIterator',
			},
			notIterable: {
				code: "ERR_ARG_NOT_ITERABLE",
				message: "Query pairs must be iterable",
			},
			invalidTuple: {
				code: "ERR_INVALID_TUPLE",
				message: "Each query pair must be an iterable [name, value] tuple",
			},
		});
	});

	it("preserves scalar-value UTF-8 encoding for WHATWG URL inputs", async () => {
		proc = createTestNodeRuntime();
		const result = await proc.run(`
			const url = new URL('https://example.com/nodejs/\\uD83D\\uDE00node?emoji=\\uD83D\\uDE00');
			url.username = '\\uD83D\\uDE00';
			module.exports = {
				href: url.href,
				pathname: url.pathname,
				search: url.search,
				searchParams: url.searchParams.toString(),
			};
		`);
		expect(result.exports).toEqual({
			href: "https://%F0%9F%98%80@example.com/nodejs/%F0%9F%98%80node?emoji=%F0%9F%98%80",
			pathname: "/nodejs/%F0%9F%98%80node",
			search: "?emoji=%F0%9F%98%80",
			searchParams: "emoji=%F0%9F%98%80",
		});
	});

	it("deferred fs APIs respect permission deny", async () => {
		const vfs = createFs();
		await vfs.mkdir("/data");
		await vfs.writeFile("/data/f.txt", "x");

		proc = createTestNodeRuntime({
			filesystem: vfs,
			permissions: {
				fs: (req) => ({ allow: req.path.startsWith("/tmp") }),
			},
		});
		const result = await proc.run(`
			const fs = require('fs');
			const errors = [];
			try { fs.chmodSync('/data/f.txt', 0o755); } catch (e) { errors.push(e.code); }
			try { fs.symlinkSync('/data/f.txt', '/data/link'); } catch (e) { errors.push(e.code); }
			try { fs.readlinkSync('/data/f.txt'); } catch (e) { errors.push(e.code); }
			try { fs.linkSync('/data/f.txt', '/data/lnk'); } catch (e) { errors.push(e.code); }
			try { fs.truncateSync('/data/f.txt', 0); } catch (e) { errors.push(e.code); }
			try { fs.utimesSync('/data/f.txt', 1, 2); } catch (e) { errors.push(e.code); }
			try { fs.chownSync('/data/f.txt', 1, 1); } catch (e) { errors.push(e.code); }
			module.exports = errors;
		`);
		expect(result.exports).toEqual([
			"EACCES", "EACCES", "EACCES", "EACCES", "EACCES", "EACCES", "EACCES",
		]);
	});

	it("bridges dgram bind, address, and socket buffer getters", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			permissions: allowFsNetworkEnv,
		});
		const result = await proc.run(`
			import dgram from 'node:dgram';
			await new Promise((resolve, reject) => {
				const socket = dgram.createSocket({
					type: 'udp4',
					recvBufferSize: 10000,
					sendBufferSize: 15000,
				});
				socket.once('error', reject);
				socket.bind(0, '127.0.0.1', function() {
					const address = socket.address();
					const recv = socket.getRecvBufferSize();
					const send = socket.getSendBufferSize();
					socket.close(() => {
						console.log(JSON.stringify({
							address: address.address,
							family: address.family,
							portIsPositive: address.port > 0,
							recv,
							send,
						}));
						resolve();
					});
				});
			});
		`, "/entry.mjs");
		expect(result.code).toBe(0);
		expect(JSON.parse(capture.stdout().trim())).toEqual({
			address: "127.0.0.1",
			family: "IPv4",
			portIsPositive: true,
			recv: process.platform === "linux" ? 20000 : 10000,
			send: process.platform === "linux" ? 30000 : 15000,
		});
	});

	it("bridges dgram multicast and membership socket options", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			permissions: allowFsNetworkEnv,
		});
		const result = await proc.run(`
			import dgram from 'node:dgram';
			await new Promise((resolve, reject) => {
				const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
				socket.once('error', reject);
				socket.bind(0, '127.0.0.1', () => {
					const report = {
						unboundBroadcastError: '',
						loopbackEnabled: socket.setMulticastLoopback(16),
						loopbackDisabled: socket.setMulticastLoopback(0),
						ttl: socket.setTTL(16),
						multicastTtl: socket.setMulticastTTL(8),
						closedMembershipError: '',
					};

					const unbound = dgram.createSocket('udp4');
					try {
						unbound.setBroadcast(true);
					} catch (error) {
						report.unboundBroadcastError = String(error);
					} finally {
						unbound.close();
					}

					socket.addMembership('224.0.0.114');
					socket.dropMembership('224.0.0.114');
					socket.setMulticastInterface('0.0.0.0');
					socket.close(() => {
						try {
							socket.addMembership('224.0.0.114');
						} catch (error) {
							report.closedMembershipError = String(error && error.code);
						}
						console.log(JSON.stringify(report));
						resolve();
					});
				});
			});
		`, "/entry.mjs");
		expect(result.code).toBe(0);
		expect(JSON.parse(capture.stdout().trim())).toEqual({
			unboundBroadcastError: "Error: setBroadcast EBADF",
			loopbackEnabled: 16,
			loopbackDisabled: 0,
			ttl: 16,
			multicastTtl: 8,
			closedMembershipError: "ERR_SOCKET_DGRAM_NOT_RUNNING",
		});
	});

	it("matches dgram socket buffer error semantics", async () => {
		proc = createTestNodeRuntime({
			permissions: allowFsNetworkEnv,
		});
		const result = await proc.run(`
			import dgram from 'node:dgram';

			const socket = dgram.createSocket('udp4');
			let unboundCode = '';
			let invalidCode = '';
			let overflowCode = '';

			try {
				socket.getSendBufferSize();
			} catch (error) {
				unboundCode = [error.name, error.code, error.info?.code, error.info?.syscall].join('|');
			}

			await new Promise((resolve, reject) => {
				socket.once('error', reject);
				socket.bind(0, '127.0.0.1', () => {
					try {
						socket.setRecvBufferSize(-1);
					} catch (error) {
						invalidCode = [error.name, error.code, error.message].join('|');
					}
					try {
						socket.setSendBufferSize(2147483648);
					} catch (error) {
						overflowCode = [error.name, error.code, error.info?.code, error.info?.syscall].join('|');
					}
					socket.close(resolve);
				});
			});

			export default { unboundCode, invalidCode, overflowCode };
		`, "/entry.mjs");
		expect(result.code).toBe(0);
		expect((result.exports as { default: Record<string, string> }).default).toEqual({
			unboundCode: "SystemError [ERR_SOCKET_BUFFER_SIZE]|ERR_SOCKET_BUFFER_SIZE|EBADF|uv_send_buffer_size",
			invalidCode: "TypeError|ERR_SOCKET_BAD_BUFFER_SIZE|Buffer size must be a positive integer",
			overflowCode: "SystemError [ERR_SOCKET_BUFFER_SIZE]|ERR_SOCKET_BUFFER_SIZE|EINVAL|uv_send_buffer_size",
		});
	});

	it("bridges dgram implicit bind, send callback bytes, and message delivery", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			permissions: allowFsNetworkEnv,
		});
		const result = await proc.run(`
			import dgram from 'node:dgram';
			await new Promise((resolve, reject) => {
				const server = dgram.createSocket('udp4');
				const client = dgram.createSocket('udp4');
				let bytesSent = 0;
				server.once('error', reject);
				client.once('error', reject);
				server.on('message', (message, rinfo) => {
					server.send(message, rinfo.port, rinfo.address);
				});
				server.bind(0, '127.0.0.1', () => {
					client.on('message', (message, rinfo) => {
						console.log(JSON.stringify({
							bytesSent,
							message: message.toString(),
							address: rinfo.address,
							family: rinfo.family,
							portMatches: rinfo.port === server.address().port,
							size: rinfo.size,
						}));
						client.close(() => {
							server.close(() => resolve());
						});
					});
					client.send(Buffer.from('ping'), server.address().port, '127.0.0.1', (err, bytes) => {
						if (err) {
							reject(err);
							return;
						}
						bytesSent = bytes;
					});
				});
			});
		`, "/entry.mjs");
		expect(result.code).toBe(0);
		expect(JSON.parse(capture.stdout().trim())).toEqual({
			bytesSent: 4,
			message: "ping",
			address: "127.0.0.1",
			family: "IPv4",
			portMatches: true,
			size: 4,
		});
	});

	it("blocks fetch to real URLs when network permissions are absent", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			onStdio: capture.onStdio,
			driver: createNodeDriver({ useDefaultNetwork: true }),
		});
		const result = await proc.run(`
			let blocked = false;
			let error = "";
			try {
				const r = fetch("https://example.com");
				if (r && typeof r.then === "function") {
					await r;
				}
			} catch (e) {
				blocked = true;
				error = e.message || String(e);
			}
			export default { blocked, error };
		`, "/entry.mjs");
		expect(result.code).toBe(0);
		const exports = result.exports as { default: { blocked: boolean; error: string } };
		expect(exports.default.blocked).toBe(true);
		expect(exports.default.error).toContain("EACCES");
	});
});
