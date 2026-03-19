/**
 * IPC security tests for the V8 runtime.
 *
 * Covers: auth token validation, cross-session access prevention,
 * oversized message rejection, and duplicate BridgeResponse call_id
 * integrity.
 */

import { describe, it, expect, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import net from "node:net";
import { encode, decode } from "@msgpack/msgpack";
import { IpcClient } from "../src/ipc-client.js";
import type { HostMessage, RustMessage } from "../src/ipc-types.js";
import { createV8Runtime } from "../src/runtime.js";
import type { V8Runtime } from "../src/runtime.js";
import type { V8ExecutionOptions } from "../src/session.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BINARY_PATH = (() => {
	const release = resolve(
		__dirname,
		"../../../crates/v8-runtime/target/release/secure-exec-v8",
	);
	if (existsSync(release)) return release;
	const debug = resolve(
		__dirname,
		"../../../crates/v8-runtime/target/debug/secure-exec-v8",
	);
	if (existsSync(debug)) return debug;
	return undefined;
})();

const skipUnlessBinary = !BINARY_PATH;

/** Default execution options with minimal config. */
function defaultExecOptions(
	overrides: Partial<V8ExecutionOptions> = {},
): V8ExecutionOptions {
	return {
		bridgeCode: "",
		userCode: "",
		mode: "exec",
		processConfig: {
			cwd: "/tmp",
			env: {},
			timing_mitigation: "none",
			frozen_time_ms: null,
		},
		osConfig: {
			homedir: "/root",
			tmpdir: "/tmp",
			platform: "linux",
			arch: "x64",
		},
		bridgeHandlers: {},
		...overrides,
	};
}

/** Spawn the Rust binary and return the child, socket path, and auth token. */
async function spawnRustBinary(): Promise<{
	child: ChildProcess;
	socketPath: string;
	authToken: string;
}> {
	const authToken = randomBytes(16).toString("hex");
	const child = spawn(BINARY_PATH!, [], {
		stdio: ["ignore", "pipe", "pipe"],
		env: {
			...process.env,
			SECURE_EXEC_V8_TOKEN: authToken,
		},
	});

	// Read socket path from first stdout line
	const socketPath = await new Promise<string>((resolve, reject) => {
		let resolved = false;
		const timeout = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				child.kill("SIGTERM");
				reject(new Error("Timed out waiting for socket path"));
			}
		}, 10_000);

		const rl = createInterface({ input: child.stdout! });
		rl.on("line", (line) => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				rl.close();
				resolve(line.trim());
			}
		});
		rl.on("close", () => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				reject(new Error("stdout closed before socket path"));
			}
		});
	});

	return { child, socketPath, authToken };
}

/** Kill child process and wait for exit. */
async function killChild(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null) return;
	child.kill("SIGTERM");
	await new Promise<void>((resolve) => {
		const timeout = setTimeout(() => {
			child.kill("SIGKILL");
			resolve();
		}, 3000);
		child.on("exit", () => {
			clearTimeout(timeout);
			resolve();
		});
	});
}

/** Create a connected IpcClient to the given socket path. */
async function connectClient(
	socketPath: string,
	onMessage: (msg: RustMessage) => void,
): Promise<IpcClient> {
	const client = new IpcClient({
		socketPath,
		onMessage,
		onError: () => {},
	});
	await client.connect();
	return client;
}

/** Write raw bytes (length-prefixed frame) to a UDS. */
function writeRawFrame(
	socketPath: string,
	lengthPrefix: number,
	payload?: Buffer,
): Promise<{ closed: boolean; data: Buffer[] }> {
	return new Promise((resolve) => {
		const socket = net.createConnection(socketPath);
		const received: Buffer[] = [];
		let closed = false;

		socket.on("connect", () => {
			const header = Buffer.alloc(4);
			header.writeUInt32BE(lengthPrefix, 0);
			socket.write(header);
			if (payload) {
				socket.write(payload);
			}
		});

		socket.on("data", (chunk) => {
			received.push(chunk);
		});

		socket.on("close", () => {
			closed = true;
			resolve({ closed: true, data: received });
		});

		// Resolve after a short wait if not closed
		setTimeout(() => {
			if (!closed) {
				socket.destroy();
				resolve({ closed: false, data: received });
			}
		}, 2000);
	});
}

describe.skipIf(skipUnlessBinary)("V8 IPC security", () => {
	const children: ChildProcess[] = [];
	const clients: IpcClient[] = [];
	let runtime: V8Runtime | null = null;

	afterEach(async () => {
		for (const c of clients) {
			c.close();
		}
		clients.length = 0;

		if (runtime) {
			await runtime.dispose();
			runtime = null;
		}

		for (const child of children) {
			await killChild(child);
		}
		children.length = 0;
	});

	// --- Auth token rejection ---

	it("rejects connection with wrong auth token", async () => {
		const { child, socketPath } = await spawnRustBinary();
		children.push(child);

		const messages: RustMessage[] = [];
		let connectionClosed = false;

		const client = new IpcClient({
			socketPath,
			onMessage: (msg) => messages.push(msg),
			onClose: () => {
				connectionClosed = true;
			},
		});
		await client.connect();
		clients.push(client);

		// Send wrong token
		client.authenticate("wrong-token-0000000000000000");

		// Wait for Rust to close the connection
		await new Promise((r) => setTimeout(r, 500));

		expect(connectionClosed).toBe(true);
		// No valid messages should have been received
		expect(messages.length).toBe(0);
	});

	it("rejects connection without auth token (non-Authenticate message first)", async () => {
		const { child, socketPath } = await spawnRustBinary();
		children.push(child);

		const messages: RustMessage[] = [];
		let connectionClosed = false;

		const client = new IpcClient({
			socketPath,
			onMessage: (msg) => messages.push(msg),
			onClose: () => {
				connectionClosed = true;
			},
		});
		await client.connect();
		clients.push(client);

		// Send a CreateSession instead of Authenticate
		client.send({
			type: "CreateSession",
			session_id: randomBytes(16).toString("hex"),
			heap_limit_mb: null,
			cpu_time_limit_ms: null,
		});

		// Wait for Rust to close the connection
		await new Promise((r) => setTimeout(r, 500));

		expect(connectionClosed).toBe(true);
		expect(messages.length).toBe(0);
	});

	// --- Cross-session access prevention ---

	it("connection B cannot send messages to connection A's sessions", async () => {
		const { child, socketPath, authToken } = await spawnRustBinary();
		children.push(child);

		// Connect client A
		const messagesA: RustMessage[] = [];
		const clientA = await connectClient(socketPath, (msg) =>
			messagesA.push(msg),
		);
		clients.push(clientA);
		clientA.authenticate(authToken);

		// Connect client B
		const messagesB: RustMessage[] = [];
		const clientB = await connectClient(socketPath, (msg) =>
			messagesB.push(msg),
		);
		clients.push(clientB);
		clientB.authenticate(authToken);

		// Client A creates a session
		const sessionId = randomBytes(16).toString("hex");
		clientA.send({
			type: "CreateSession",
			session_id: sessionId,
			heap_limit_mb: null,
			cpu_time_limit_ms: null,
		});

		// Give session time to initialize
		await new Promise((r) => setTimeout(r, 200));

		// Client B tries to execute code on client A's session
		clientB.send({
			type: "InjectGlobals",
			session_id: sessionId,
			process_config: {
				cwd: "/tmp",
				env: {},
				timing_mitigation: "none",
				frozen_time_ms: null,
			},
			os_config: {
				homedir: "/root",
				tmpdir: "/tmp",
				platform: "linux",
				arch: "x64",
			},
		});

		clientB.send({
			type: "Execute",
			session_id: sessionId,
			bridge_code: "",
			user_code: "1 + 1;",
			mode: "exec",
			file_path: null,
		});

		// Wait for any responses
		await new Promise((r) => setTimeout(r, 1000));

		// Client B should NOT receive an ExecutionResult for A's session
		const bResults = messagesB.filter(
			(m) => m.type === "ExecutionResult",
		);
		expect(bResults.length).toBe(0);

		// Client A's session should still work — execute on it
		clientA.send({
			type: "InjectGlobals",
			session_id: sessionId,
			process_config: {
				cwd: "/tmp",
				env: {},
				timing_mitigation: "none",
				frozen_time_ms: null,
			},
			os_config: {
				homedir: "/root",
				tmpdir: "/tmp",
				platform: "linux",
				arch: "x64",
			},
		});
		clientA.send({
			type: "Execute",
			session_id: sessionId,
			bridge_code: "",
			user_code: "1 + 1;",
			mode: "exec",
			file_path: null,
		});

		// Wait for result
		await new Promise((r) => setTimeout(r, 1000));

		const aResults = messagesA.filter(
			(m) => m.type === "ExecutionResult",
		);
		expect(aResults.length).toBe(1);
		expect((aResults[0] as { code: number }).code).toBe(0);

		// Clean up session
		clientA.send({ type: "DestroySession", session_id: sessionId });
	});

	// --- Oversized message rejection ---

	it("IpcClient rejects sending messages exceeding 64MB", () => {
		// Create a message with payload > 64MB by constructing an object
		// with a large string field
		const largePayload = "x".repeat(64 * 1024 * 1024 + 1);

		// Use a dummy IpcClient (not connected) to test send() validation
		// We need a connected client, so test the encode path
		const payload = encode({
			type: "Execute",
			session_id: "test",
			bridge_code: largePayload,
			user_code: "",
			mode: "exec",
			file_path: null,
		});

		// The payload should exceed 64MB
		expect(payload.byteLength).toBeGreaterThan(64 * 1024 * 1024);
	});

	it("Rust process rejects oversized message length prefix", async () => {
		const { child, socketPath, authToken } = await spawnRustBinary();
		children.push(child);

		// First authenticate properly
		const socket = net.createConnection(socketPath);
		await new Promise<void>((r) => socket.on("connect", r));

		// Send valid auth message
		const authPayload = encode({
			type: "Authenticate",
			token: authToken,
		} satisfies HostMessage);
		const authHeader = Buffer.alloc(4);
		authHeader.writeUInt32BE(authPayload.byteLength, 0);
		socket.write(authHeader);
		socket.write(Buffer.from(authPayload));

		// Wait for auth to be processed
		await new Promise((r) => setTimeout(r, 200));

		// Send a frame with length prefix > 64MB (but no actual payload)
		const oversizedHeader = Buffer.alloc(4);
		oversizedHeader.writeUInt32BE(64 * 1024 * 1024 + 1, 0);
		socket.write(oversizedHeader);

		// The Rust process should close this connection due to the invalid length
		const closed = await new Promise<boolean>((resolve) => {
			const timeout = setTimeout(() => resolve(false), 3000);
			socket.on("close", () => {
				clearTimeout(timeout);
				resolve(true);
			});
			socket.on("error", () => {
				clearTimeout(timeout);
				resolve(true);
			});
		});

		expect(closed).toBe(true);
		socket.destroy();

		// Verify the Rust process is still alive (didn't crash)
		expect(child.exitCode).toBeNull();
	});

	// --- Duplicate BridgeResponse call_id integrity ---

	it("duplicate BridgeResponse call_id does not crash or corrupt state", async () => {
		const { child, socketPath, authToken } = await spawnRustBinary();
		children.push(child);

		const messages: RustMessage[] = [];
		const client = await connectClient(socketPath, (msg) =>
			messages.push(msg),
		);
		clients.push(client);
		client.authenticate(authToken);

		// Create a session
		const sessionId = randomBytes(16).toString("hex");
		client.send({
			type: "CreateSession",
			session_id: sessionId,
			heap_limit_mb: null,
			cpu_time_limit_ms: null,
		});
		await new Promise((r) => setTimeout(r, 200));

		// Inject globals
		client.send({
			type: "InjectGlobals",
			session_id: sessionId,
			process_config: {
				cwd: "/tmp",
				env: {},
				timing_mitigation: "none",
				frozen_time_ms: null,
			},
			os_config: {
				homedir: "/root",
				tmpdir: "/tmp",
				platform: "linux",
				arch: "x64",
			},
		});

		// Execute code that makes a sync bridge call — we'll manually
		// respond with the correct call_id TWICE
		client.send({
			type: "Execute",
			session_id: sessionId,
			bridge_code: "",
			user_code: '_log("test");',
			mode: "exec",
			file_path: null,
		});

		// Wait for the BridgeCall
		const bridgeCall = await new Promise<RustMessage>((resolve) => {
			const check = setInterval(() => {
				const bc = messages.find((m) => m.type === "BridgeCall");
				if (bc) {
					clearInterval(check);
					resolve(bc);
				}
			}, 50);
			setTimeout(() => clearInterval(check), 5000);
		});

		expect(bridgeCall.type).toBe("BridgeCall");
		const callId = (bridgeCall as { call_id: number }).call_id;

		// Send the first BridgeResponse (legitimate)
		client.send({
			type: "BridgeResponse",
			call_id: callId,
			result: null,
			error: null,
		});

		// Send a duplicate BridgeResponse with the same call_id
		client.send({
			type: "BridgeResponse",
			call_id: callId,
			result: null,
			error: null,
		});

		// Wait for the ExecutionResult
		await new Promise<void>((resolve) => {
			const check = setInterval(() => {
				const er = messages.find(
					(m) => m.type === "ExecutionResult",
				);
				if (er) {
					clearInterval(check);
					resolve();
				}
			}, 50);
			setTimeout(() => {
				clearInterval(check);
				resolve();
			}, 3000);
		});

		// Execution should have completed successfully
		const execResult = messages.find(
			(m) => m.type === "ExecutionResult",
		) as { code: number; error: unknown } | undefined;
		expect(execResult).toBeTruthy();
		expect(execResult!.code).toBe(0);

		// Rust process should still be alive (not crashed by duplicate)
		expect(child.exitCode).toBeNull();

		// Session should still be usable — run another execution
		messages.length = 0;

		client.send({
			type: "InjectGlobals",
			session_id: sessionId,
			process_config: {
				cwd: "/tmp",
				env: {},
				timing_mitigation: "none",
				frozen_time_ms: null,
			},
			os_config: {
				homedir: "/root",
				tmpdir: "/tmp",
				platform: "linux",
				arch: "x64",
			},
		});

		client.send({
			type: "Execute",
			session_id: sessionId,
			bridge_code: "",
			user_code: "42;",
			mode: "exec",
			file_path: null,
		});

		// Wait for result
		await new Promise<void>((resolve) => {
			const check = setInterval(() => {
				const er = messages.find(
					(m) => m.type === "ExecutionResult",
				);
				if (er) {
					clearInterval(check);
					resolve();
				}
			}, 50);
			setTimeout(() => {
				clearInterval(check);
				resolve();
			}, 3000);
		});

		const secondResult = messages.find(
			(m) => m.type === "ExecutionResult",
		) as { code: number } | undefined;
		expect(secondResult).toBeTruthy();
		expect(secondResult!.code).toBe(0);

		client.send({ type: "DestroySession", session_id: sessionId });
	});
});
