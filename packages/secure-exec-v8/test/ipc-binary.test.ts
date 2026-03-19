/**
 * Unit tests for the binary header IPC framing module.
 *
 * Covers: round-trip encode/decode for all 12 message types,
 * session_id extraction, edge cases, framing validation, and
 * interop byte-level verification matching Rust ipc_binary.rs.
 */

import { describe, it, expect } from "vitest";
import v8 from "node:v8";
import {
	encodeFrame,
	decodeFrame,
	extractSessionId,
	serializePayload,
	deserializePayload,
	type BinaryFrame,
} from "../src/ipc-binary.js";

function roundtrip(frame: BinaryFrame): void {
	const encoded = encodeFrame(frame);
	// Body starts after 4-byte length prefix
	const body = encoded.subarray(4);
	const decoded = decodeFrame(body);
	expect(decoded).toEqual(frame);
}

// -- Host → Rust message types --

describe("Host → Rust messages", () => {
	it("round-trips Authenticate", () => {
		roundtrip({
			type: "Authenticate",
			token: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
		});
	});

	it("round-trips CreateSession", () => {
		roundtrip({
			type: "CreateSession",
			sessionId: "sess-abc-123",
			heapLimitMb: 128,
			cpuTimeLimitMs: 5000,
		});
	});

	it("round-trips CreateSession with no limits", () => {
		roundtrip({
			type: "CreateSession",
			sessionId: "sess-1",
			heapLimitMb: 0,
			cpuTimeLimitMs: 0,
		});
	});

	it("round-trips DestroySession", () => {
		roundtrip({ type: "DestroySession", sessionId: "sess-7" });
	});

	it("round-trips InjectGlobals", () => {
		roundtrip({
			type: "InjectGlobals",
			sessionId: "sess-3",
			payload: Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]),
		});
	});

	it("round-trips Execute (exec mode)", () => {
		roundtrip({
			type: "Execute",
			sessionId: "sess-1",
			mode: 0,
			filePath: "",
			bridgeCode: "(function(){ /* bridge */ })()",
			userCode: "console.log('hello')",
		});
	});

	it("round-trips Execute (run mode)", () => {
		roundtrip({
			type: "Execute",
			sessionId: "sess-2",
			mode: 1,
			filePath: "/app/index.mjs",
			bridgeCode: "(function(){ /* bridge */ })()",
			userCode: "export default 42",
		});
	});

	it("round-trips BridgeResponse (success)", () => {
		roundtrip({
			type: "BridgeResponse",
			sessionId: "sess-4",
			callId: 100,
			status: 0,
			payload: Buffer.from([0x93, 0x01, 0x02, 0x03]),
		});
	});

	it("round-trips BridgeResponse (error)", () => {
		roundtrip({
			type: "BridgeResponse",
			sessionId: "sess-5",
			callId: 101,
			status: 1,
			payload: Buffer.from("ENOENT: no such file", "utf8"),
		});
	});

	it("round-trips StreamEvent", () => {
		roundtrip({
			type: "StreamEvent",
			sessionId: "sess-5",
			eventType: "child_stdout",
			payload: Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]),
		});
	});

	it("round-trips TerminateExecution", () => {
		roundtrip({ type: "TerminateExecution", sessionId: "sess-6" });
	});
});

// -- Rust → Host message types --

describe("Rust → Host messages", () => {
	it("round-trips BridgeCall", () => {
		roundtrip({
			type: "BridgeCall",
			sessionId: "sess-1",
			callId: 200,
			method: "_fsReadFile",
			payload: Buffer.from([0x91, 0xa5, 0x2f, 0x74, 0x6d, 0x70]),
		});
	});

	it("round-trips ExecutionResult (success with exports)", () => {
		roundtrip({
			type: "ExecutionResult",
			sessionId: "sess-1",
			exitCode: 0,
			exports: Buffer.from([0xc0]),
			error: null,
		});
	});

	it("round-trips ExecutionResult (error without code)", () => {
		roundtrip({
			type: "ExecutionResult",
			sessionId: "sess-2",
			exitCode: 1,
			exports: null,
			error: {
				errorType: "TypeError",
				message: "Cannot read properties of undefined",
				stack:
					"TypeError: Cannot read properties of undefined\n    at main.js:1:5",
				code: "",
			},
		});
	});

	it("round-trips ExecutionResult (error with code)", () => {
		roundtrip({
			type: "ExecutionResult",
			sessionId: "sess-3",
			exitCode: 1,
			exports: null,
			error: {
				errorType: "Error",
				message: "Cannot find module './missing'",
				stack:
					"Error: Cannot find module './missing'\n    at resolve (node:internal)",
				code: "ERR_MODULE_NOT_FOUND",
			},
		});
	});

	it("round-trips ExecutionResult (exports AND error)", () => {
		roundtrip({
			type: "ExecutionResult",
			sessionId: "sess-4",
			exitCode: 1,
			exports: Buffer.from([0x01, 0x02]),
			error: {
				errorType: "Error",
				message: "partial failure",
				stack: "",
				code: "",
			},
		});
	});

	it("round-trips ExecutionResult (no exports, no error)", () => {
		roundtrip({
			type: "ExecutionResult",
			sessionId: "sess-5",
			exitCode: 0,
			exports: null,
			error: null,
		});
	});

	it("round-trips Log (stdout)", () => {
		roundtrip({
			type: "Log",
			sessionId: "sess-1",
			channel: 0,
			message: "hello world\n",
		});
	});

	it("round-trips Log (stderr)", () => {
		roundtrip({
			type: "Log",
			sessionId: "sess-1",
			channel: 1,
			message: "warning: deprecated API\n",
		});
	});

	it("round-trips StreamCallback", () => {
		roundtrip({
			type: "StreamCallback",
			sessionId: "sess-1",
			callbackType: "child_dispatch",
			payload: Buffer.from([0x92, 0x01, 0xa3, 0x66, 0x6f, 0x6f]),
		});
	});
});

// -- Edge cases --

describe("edge cases", () => {
	it("handles empty payloads", () => {
		roundtrip({
			type: "BridgeResponse",
			sessionId: "s",
			callId: 0,
			status: 0,
			payload: Buffer.alloc(0),
		});
		roundtrip({
			type: "StreamEvent",
			sessionId: "s",
			eventType: "",
			payload: Buffer.alloc(0),
		});
		roundtrip({
			type: "BridgeCall",
			sessionId: "s",
			callId: 0,
			method: "",
			payload: Buffer.alloc(0),
		});
		roundtrip({
			type: "InjectGlobals",
			sessionId: "s",
			payload: Buffer.alloc(0),
		});
	});

	it("handles empty session_id", () => {
		roundtrip({ type: "DestroySession", sessionId: "" });
	});

	it("handles large binary payload", () => {
		roundtrip({
			type: "BridgeResponse",
			sessionId: "sess-big",
			callId: 42,
			status: 0,
			payload: Buffer.alloc(1024, 0xaa),
		});
	});
});

// -- Framing validation --

describe("framing validation", () => {
	it("length prefix is u32 big-endian", () => {
		const frame: BinaryFrame = { type: "DestroySession", sessionId: "x" };
		const encoded = encodeFrame(frame);
		const len = encoded.readUInt32BE(0);
		expect(len).toBe(encoded.length - 4);
	});

	it("multiple frames in a stream", () => {
		const frames: BinaryFrame[] = [
			{
				type: "CreateSession",
				sessionId: "a",
				heapLimitMb: 64,
				cpuTimeLimitMs: 1000,
			},
			{
				type: "Execute",
				sessionId: "a",
				mode: 0,
				filePath: "",
				bridgeCode: "bridge()",
				userCode: "1+1",
			},
			{ type: "DestroySession", sessionId: "a" },
		];

		const bufs = frames.map(encodeFrame);
		const stream = Buffer.concat(bufs);

		let pos = 0;
		for (const expected of frames) {
			const len = stream.readUInt32BE(pos);
			const body = stream.subarray(pos + 4, pos + 4 + len);
			const decoded = decodeFrame(body);
			expect(decoded).toEqual(expected);
			pos += 4 + len;
		}
		expect(pos).toBe(stream.length);
	});

	it("rejects unknown message type", () => {
		const body = Buffer.from([0xff, 0x00]); // msg_type=0xFF, sid_len=0
		expect(() => decodeFrame(body)).toThrow("Unknown message type");
	});

	it("rejects empty frame", () => {
		expect(() => decodeFrame(Buffer.alloc(0))).toThrow("Empty frame");
	});
});

// -- Session ID routing --

describe("session_id extraction", () => {
	it("extracts session_id from BridgeCall raw bytes", () => {
		const frame: BinaryFrame = {
			type: "BridgeCall",
			sessionId: "my-session-42",
			callId: 7,
			method: "_fsReadFile",
			payload: Buffer.from([0x01, 0x02]),
		};
		const encoded = encodeFrame(frame);
		const raw = encoded.subarray(4); // skip length prefix
		expect(extractSessionId(raw)).toBe("my-session-42");
	});

	it("extracts session_id from various message types", () => {
		const testCases: [BinaryFrame, string][] = [
			[
				{
					type: "CreateSession",
					sessionId: "sess-create",
					heapLimitMb: 0,
					cpuTimeLimitMs: 0,
				},
				"sess-create",
			],
			[{ type: "DestroySession", sessionId: "sess-destroy" }, "sess-destroy"],
			[
				{
					type: "Execute",
					sessionId: "sess-exec",
					mode: 0,
					filePath: "",
					bridgeCode: "",
					userCode: "",
				},
				"sess-exec",
			],
			[
				{
					type: "BridgeResponse",
					sessionId: "sess-resp",
					callId: 1,
					status: 0,
					payload: Buffer.alloc(0),
				},
				"sess-resp",
			],
			[
				{
					type: "ExecutionResult",
					sessionId: "sess-result",
					exitCode: 0,
					exports: null,
					error: null,
				},
				"sess-result",
			],
			[
				{ type: "Log", sessionId: "sess-log", channel: 0, message: "hi" },
				"sess-log",
			],
		];

		for (const [frame, expectedSid] of testCases) {
			const encoded = encodeFrame(frame);
			const raw = encoded.subarray(4);
			expect(extractSessionId(raw)).toBe(expectedSid);
		}
	});

	it("returns null for Authenticate", () => {
		const frame: BinaryFrame = {
			type: "Authenticate",
			token: "secret-token",
		};
		const encoded = encodeFrame(frame);
		const raw = encoded.subarray(4);
		expect(extractSessionId(raw)).toBeNull();
	});

	it("throws on too-short buffer", () => {
		expect(() => extractSessionId(Buffer.from([0x02]))).toThrow(
			"Frame too short",
		);
	});
});

// -- Wire format byte-level verification (interop with Rust) --

describe("wire format interop", () => {
	it("message type bytes match Rust constants", () => {
		const cases: [BinaryFrame, number][] = [
			[{ type: "Authenticate", token: "t" }, 0x01],
			[
				{
					type: "CreateSession",
					sessionId: "s",
					heapLimitMb: 0,
					cpuTimeLimitMs: 0,
				},
				0x02,
			],
			[{ type: "DestroySession", sessionId: "s" }, 0x03],
			[
				{ type: "InjectGlobals", sessionId: "s", payload: Buffer.alloc(0) },
				0x04,
			],
			[
				{
					type: "Execute",
					sessionId: "s",
					mode: 0,
					filePath: "",
					bridgeCode: "",
					userCode: "",
				},
				0x05,
			],
			[
				{
					type: "BridgeResponse",
					sessionId: "s",
					callId: 0,
					status: 0,
					payload: Buffer.alloc(0),
				},
				0x06,
			],
			[
				{
					type: "StreamEvent",
					sessionId: "s",
					eventType: "",
					payload: Buffer.alloc(0),
				},
				0x07,
			],
			[{ type: "TerminateExecution", sessionId: "s" }, 0x08],
			[
				{
					type: "BridgeCall",
					sessionId: "s",
					callId: 0,
					method: "",
					payload: Buffer.alloc(0),
				},
				0x81,
			],
			[
				{
					type: "ExecutionResult",
					sessionId: "s",
					exitCode: 0,
					exports: null,
					error: null,
				},
				0x82,
			],
			[{ type: "Log", sessionId: "s", channel: 0, message: "" }, 0x83],
			[
				{
					type: "StreamCallback",
					sessionId: "s",
					callbackType: "",
					payload: Buffer.alloc(0),
				},
				0x84,
			],
		];

		for (const [frame, expectedType] of cases) {
			const encoded = encodeFrame(frame);
			// Byte 4 (after 4-byte length prefix) is the message type
			expect(encoded[4]).toBe(expectedType);
		}
	});

	it("session_id is at bytes 5 through 5+N in the frame", () => {
		const frame: BinaryFrame = {
			type: "DestroySession",
			sessionId: "test-sid",
		};
		const encoded = encodeFrame(frame);
		// byte 4 = msg_type (0x03)
		// byte 5 = sid_len (8)
		// bytes 6..13 = "test-sid"
		expect(encoded[4]).toBe(0x03);
		expect(encoded[5]).toBe(8);
		expect(encoded.toString("utf8", 6, 14)).toBe("test-sid");
	});

	it("CreateSession fixed fields match Rust layout", () => {
		const frame: BinaryFrame = {
			type: "CreateSession",
			sessionId: "AB",
			heapLimitMb: 256,
			cpuTimeLimitMs: 10000,
		};
		const encoded = encodeFrame(frame);
		// After length prefix (4): msg_type(1) sid_len(1) sid(2) heap(4) cpu(4)
		const body = encoded.subarray(4);
		expect(body[0]).toBe(0x02); // msg_type
		expect(body[1]).toBe(2); // sid_len
		expect(body.toString("utf8", 2, 4)).toBe("AB"); // sid
		expect(body.readUInt32BE(4)).toBe(256); // heap_limit_mb
		expect(body.readUInt32BE(8)).toBe(10000); // cpu_time_limit_ms
	});

	it("BridgeCall fixed fields match Rust layout", () => {
		const frame: BinaryFrame = {
			type: "BridgeCall",
			sessionId: "X",
			callId: 42,
			method: "fn",
			payload: Buffer.from([0xaa, 0xbb]),
		};
		const encoded = encodeFrame(frame);
		const body = encoded.subarray(4);
		expect(body[0]).toBe(0x81); // msg_type
		expect(body[1]).toBe(1); // sid_len
		expect(body.toString("utf8", 2, 3)).toBe("X"); // sid
		expect(body.readUInt32BE(3)).toBe(42); // call_id
		expect(body.readUInt16BE(7)).toBe(2); // method_len
		expect(body.toString("utf8", 9, 11)).toBe("fn"); // method
		expect(Buffer.compare(body.subarray(11), Buffer.from([0xaa, 0xbb]))).toBe(
			0,
		); // payload
	});

	it("ExecutionResult flags and error layout match Rust", () => {
		const frame: BinaryFrame = {
			type: "ExecutionResult",
			sessionId: "Z",
			exitCode: -1,
			exports: null,
			error: {
				errorType: "E",
				message: "M",
				stack: "S",
				code: "C",
			},
		};
		const encoded = encodeFrame(frame);
		const body = encoded.subarray(4);
		expect(body[0]).toBe(0x82); // msg_type
		expect(body[1]).toBe(1); // sid_len
		expect(body.toString("utf8", 2, 3)).toBe("Z"); // sid
		expect(body.readInt32BE(3)).toBe(-1); // exit_code
		expect(body[7]).toBe(0x02); // flags = HAS_ERROR only
		// error fields are u16-length-prefixed strings
		let pos = 8;
		expect(body.readUInt16BE(pos)).toBe(1);
		expect(body.toString("utf8", pos + 2, pos + 3)).toBe("E");
		pos += 3;
		expect(body.readUInt16BE(pos)).toBe(1);
		expect(body.toString("utf8", pos + 2, pos + 3)).toBe("M");
		pos += 3;
		expect(body.readUInt16BE(pos)).toBe(1);
		expect(body.toString("utf8", pos + 2, pos + 3)).toBe("S");
		pos += 3;
		expect(body.readUInt16BE(pos)).toBe(1);
		expect(body.toString("utf8", pos + 2, pos + 3)).toBe("C");
	});
});

// -- V8 serialize/deserialize integration --

describe("V8 serialize/deserialize payload integration", () => {
	it("round-trips V8-serialized payload in BridgeCall", () => {
		const args = ["/tmp/foo.txt", { encoding: "utf8" }];
		const serialized = serializePayload(args);

		const frame: BinaryFrame = {
			type: "BridgeCall",
			sessionId: "sess-v8",
			callId: 1,
			method: "_fsReadFile",
			payload: serialized,
		};

		const encoded = encodeFrame(frame);
		const decoded = decodeFrame(encoded.subarray(4));
		expect(decoded.type).toBe("BridgeCall");

		if (decoded.type === "BridgeCall") {
			const deserialized = deserializePayload(decoded.payload);
			expect(deserialized).toEqual(args);
		}
	});

	it("round-trips V8-serialized payload in BridgeResponse", () => {
		const result = Buffer.from("file contents here");
		const serialized = serializePayload(result);

		const frame: BinaryFrame = {
			type: "BridgeResponse",
			sessionId: "sess-v8",
			callId: 1,
			status: 0,
			payload: serialized,
		};

		const encoded = encodeFrame(frame);
		const decoded = decodeFrame(encoded.subarray(4));
		expect(decoded.type).toBe("BridgeResponse");

		if (decoded.type === "BridgeResponse") {
			const deserialized = deserializePayload(decoded.payload);
			expect(Buffer.from(deserialized)).toEqual(result);
		}
	});

	it("round-trips V8-serialized payload in InjectGlobals", () => {
		const config = {
			processConfig: {
				cwd: "/tmp",
				env: { NODE_ENV: "test" },
				timing_mitigation: "none",
				frozen_time_ms: null,
			},
			osConfig: {
				homedir: "/root",
				tmpdir: "/tmp",
				platform: "linux",
				arch: "x64",
			},
		};
		const serialized = serializePayload(config);

		const frame: BinaryFrame = {
			type: "InjectGlobals",
			sessionId: "sess-v8",
			payload: serialized,
		};

		const encoded = encodeFrame(frame);
		const decoded = decodeFrame(encoded.subarray(4));
		expect(decoded.type).toBe("InjectGlobals");

		if (decoded.type === "InjectGlobals") {
			const deserialized = deserializePayload(decoded.payload);
			expect(deserialized).toEqual(config);
		}
	});

	it("V8 serialize handles complex types (Date, Map, Set, RegExp)", () => {
		const complex = {
			date: new Date("2026-01-01T00:00:00Z"),
			map: new Map([
				["a", 1],
				["b", 2],
			]),
			set: new Set([1, 2, 3]),
			regex: /test\d+/gi,
			buffer: new Uint8Array([1, 2, 3]),
		};
		const serialized = serializePayload(complex);

		const frame: BinaryFrame = {
			type: "StreamEvent",
			sessionId: "sess-complex",
			eventType: "test",
			payload: serialized,
		};

		const encoded = encodeFrame(frame);
		const decoded = decodeFrame(encoded.subarray(4));

		if (decoded.type === "StreamEvent") {
			const result = deserializePayload(decoded.payload) as typeof complex;
			expect(result.date).toEqual(complex.date);
			expect(result.map).toEqual(complex.map);
			expect(result.set).toEqual(complex.set);
			expect(result.regex.source).toBe(complex.regex.source);
			expect(result.regex.flags).toBe(complex.regex.flags);
			expect(Buffer.from(result.buffer)).toEqual(
				Buffer.from(complex.buffer),
			);
		}
	});
});
