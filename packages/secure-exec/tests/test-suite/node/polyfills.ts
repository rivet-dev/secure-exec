import { afterEach, expect, it } from "vitest";
import type { NodeSuiteContext } from "./runtime.js";

export function runNodePolyfillSuite(context: NodeSuiteContext): void {
	afterEach(async () => {
		await context.teardown();
	});

	// -- zlib.constants --

	it("zlib.constants has Z_* values", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const zlib = require('zlib');
			module.exports = {
				hasConstants: typeof zlib.constants === 'object' && zlib.constants !== null,
				hasZNoFlush: typeof zlib.constants.Z_NO_FLUSH === 'number',
				hasZDefaultCompression: typeof zlib.constants.Z_DEFAULT_COMPRESSION === 'number',
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hasConstants: true,
			hasZNoFlush: true,
			hasZDefaultCompression: true,
		});
	});

	it("zlib.constants has mode constants (DEFLATE=1..GUNZIP=7)", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const zlib = require('zlib');
			const c = zlib.constants;
			module.exports = {
				DEFLATE: c.DEFLATE,
				INFLATE: c.INFLATE,
				GZIP: c.GZIP,
				DEFLATERAW: c.DEFLATERAW,
				INFLATERAW: c.INFLATERAW,
				UNZIP: c.UNZIP,
				GUNZIP: c.GUNZIP,
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			DEFLATE: 1,
			INFLATE: 2,
			GZIP: 3,
			DEFLATERAW: 4,
			INFLATERAW: 5,
			UNZIP: 6,
			GUNZIP: 7,
		});
	});

	// -- Buffer prototype and constants --

	it("Buffer.kStringMaxLength and Buffer.constants are set", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const { Buffer } = require('buffer');
			module.exports = {
				hasKStringMaxLength: typeof Buffer.kStringMaxLength === 'number',
				hasKMaxLength: typeof Buffer.kMaxLength === 'number',
				hasConstants: typeof Buffer.constants === 'object' && Buffer.constants !== null,
				hasMaxLength: typeof Buffer.constants.MAX_LENGTH === 'number',
				hasMaxStringLength: typeof Buffer.constants.MAX_STRING_LENGTH === 'number',
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hasKStringMaxLength: true,
			hasKMaxLength: true,
			hasConstants: true,
			hasMaxLength: true,
			hasMaxStringLength: true,
		});
	});

	it("Buffer prototype has encoding-specific methods", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const buf = Buffer.from('hello');
			module.exports = {
				hasUtf8Slice: typeof buf.utf8Slice === 'function',
				hasLatin1Slice: typeof buf.latin1Slice === 'function',
				hasBase64Slice: typeof buf.base64Slice === 'function',
				hasUtf8Write: typeof buf.utf8Write === 'function',
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hasUtf8Slice: true,
			hasLatin1Slice: true,
			hasBase64Slice: true,
			hasUtf8Write: true,
		});
	});

	// -- TextDecoder encoding aliases --

	it("TextDecoder accepts 'ascii', 'latin1', 'utf-16le' without throwing", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const results = {};
			const encodings = ['ascii', 'latin1', 'utf-16le'];
			for (const enc of encodings) {
				try {
					new TextDecoder(enc);
					results[enc] = true;
				} catch (e) {
					results[enc] = false;
				}
			}
			module.exports = results;
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			ascii: true,
			latin1: true,
			"utf-16le": true,
		});
	});

	// -- stream prototype chain --

	it("stream.Readable.prototype chain includes Stream.prototype", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const stream = require('stream');
			const readable = new stream.Readable({ read() {} });
			module.exports = {
				isStream: readable instanceof stream,
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			isStream: true,
		});
	});

	// -- FormData stub --

	it("FormData stub class exists on globalThis", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			module.exports = {
				hasFormData: typeof FormData === 'function',
				canInstantiate: typeof new FormData() === 'object',
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hasFormData: true,
			canInstantiate: true,
		});
	});

	it("FormData stub supports append and get", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const fd = new FormData();
			fd.append('key', 'value');
			module.exports = {
				getValue: fd.get('key'),
				hasFn: typeof fd.has === 'function',
				hasKey: fd.has('key'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			getValue: "value",
			hasFn: true,
			hasKey: true,
		});
	});

	// -- Response.body with getReader --

	it("Response.body has ReadableStream-like getReader() method", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const resp = new Response('test body');
			const hasBody = resp.body !== null && resp.body !== undefined;
			const hasGetReader = hasBody && typeof resp.body.getReader === 'function';
			async function readBody() {
				if (!hasGetReader) return null;
				const reader = resp.body.getReader();
				const chunk = await reader.read();
				if (!chunk.done && chunk.value) {
					return new TextDecoder().decode(chunk.value);
				}
				return null;
			}
			readBody().then(function(readValue) {
				module.exports = {
					hasBody: hasBody,
					hasGetReader: hasGetReader,
					readValue: readValue,
				};
			});
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hasBody: true,
			hasGetReader: true,
			readValue: "test body",
		});
	});

	it("Response.body is null when constructed with null body", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const resp = new Response(null);
			module.exports = { bodyIsNull: resp.body === null };
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({ bodyIsNull: true });
	});

	// -- Headers.append --

	it("Headers.append() method works", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const h = new Headers();
			h.append('x-test', 'a');
			h.append('x-test', 'b');
			module.exports = {
				value: h.get('x-test'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			value: "a, b",
		});
	});

	// -- http2.constants --

	it("http2.constants object has pseudo-header constants", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const http2 = require('http2');
			module.exports = {
				hasConstants: typeof http2.constants === 'object' && http2.constants !== null,
				method: http2.constants.HTTP2_HEADER_METHOD,
				path: http2.constants.HTTP2_HEADER_PATH,
				scheme: http2.constants.HTTP2_HEADER_SCHEME,
				authority: http2.constants.HTTP2_HEADER_AUTHORITY,
				status: http2.constants.HTTP2_HEADER_STATUS,
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hasConstants: true,
			method: ":method",
			path: ":path",
			scheme: ":scheme",
			authority: ":authority",
			status: ":status",
		});
	});
}
