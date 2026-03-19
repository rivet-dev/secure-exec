// V8 runtime process manager: spawns the Rust binary, connects over UDS,
// and exposes session lifecycle.

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { IpcClient } from "./ipc-client.js";
import type { RustMessage } from "./ipc-types.js";
import type { V8Session, V8SessionOptions } from "./session.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Options for creating a V8 runtime. */
export interface V8RuntimeOptions {
	/** Path to the Rust binary. Auto-detected if omitted. */
	binaryPath?: string;
	/** Maximum concurrent sessions. Passed via SECURE_EXEC_V8_MAX_SESSIONS. */
	maxSessions?: number;
}

/** Manages the Rust V8 child process and session lifecycle. */
export interface V8Runtime {
	/** Create a new session (V8 isolate) in the runtime process. */
	createSession(options?: V8SessionOptions): Promise<V8Session>;
	/** Kill the child process and clean up. */
	dispose(): Promise<void>;
}

/** Resolve the platform-specific binary path. */
function resolveBinaryPath(): string {
	// TODO(US-026): resolve from platform-specific npm packages
	// For now, expect cargo-built binary at crate target path or on PATH
	const crateRelative = resolve(
		__dirname,
		"../../../crates/v8-runtime/target/release/secure-exec-v8",
	);
	if (existsSync(crateRelative)) return crateRelative;

	const crateDebug = resolve(
		__dirname,
		"../../../crates/v8-runtime/target/debug/secure-exec-v8",
	);
	if (existsSync(crateDebug)) return crateDebug;

	// Fallback: assume on PATH
	return "secure-exec-v8";
}

/**
 * Spawn the Rust V8 runtime process and return a handle.
 *
 * Generates a 128-bit auth token, passes it via SECURE_EXEC_V8_TOKEN,
 * reads the socket path from stdout, connects over UDS, and authenticates.
 */
export async function createV8Runtime(
	options?: V8RuntimeOptions,
): Promise<V8Runtime> {
	const binaryPath = options?.binaryPath ?? resolveBinaryPath();

	// Generate 128-bit random auth token
	const authToken = randomBytes(16).toString("hex");

	// Build child environment
	const childEnv: Record<string, string> = {
		...process.env as Record<string, string>,
		SECURE_EXEC_V8_TOKEN: authToken,
	};
	if (options?.maxSessions != null) {
		childEnv.SECURE_EXEC_V8_MAX_SESSIONS = String(options.maxSessions);
	}

	// Spawn the Rust binary
	const child = spawn(binaryPath, [], {
		stdio: ["ignore", "pipe", "pipe"],
		env: childEnv,
	});

	// Track whether the process is alive
	let processAlive = true;
	let exitError: Error | null = null;

	child.on("exit", (code, signal) => {
		processAlive = false;
		if (code !== 0 && code !== null) {
			exitError = new Error(
				`V8 runtime process exited with code ${code}`,
			);
		} else if (signal) {
			exitError = new Error(
				`V8 runtime process killed by signal ${signal}`,
			);
		}
	});

	// Collect stderr for error reporting
	let stderrBuf = "";
	child.stderr!.on("data", (chunk: Buffer) => {
		stderrBuf += chunk.toString();
		// Cap buffer to avoid unbounded growth
		if (stderrBuf.length > 8192) {
			stderrBuf = stderrBuf.slice(-4096);
		}
	});

	// Read socket path from first line of stdout
	const socketPath = await readSocketPath(child);

	// Connect IPC client
	let ipcClient: IpcClient | null = null;
	let disposed = false;

	// Message routing: session-level handlers registered per session_id
	const sessionHandlers = new Map<
		string,
		(msg: RustMessage) => void
	>();

	ipcClient = new IpcClient({
		socketPath,
		onMessage: (msg) => {
			// Route message to the appropriate session handler
			if ("session_id" in msg) {
				const handler = sessionHandlers.get(
					msg.session_id as string,
				);
				handler?.(msg);
			}
		},
		onClose: () => {
			ipcClient = null;
		},
		onError: (err) => {
			// Surface IPC errors as exit errors if process is still alive
			if (!exitError) {
				exitError = err;
			}
		},
	});

	try {
		await ipcClient.connect();
		ipcClient.authenticate(authToken);
	} catch (err) {
		// Connection failed — kill child and surface error
		child.kill("SIGTERM");
		const msg =
			err instanceof Error ? err.message : String(err);
		throw new Error(
			`Failed to connect to V8 runtime: ${msg}${stderrBuf ? `\nstderr: ${stderrBuf}` : ""}`,
		);
	}

	/** Ensure the process is alive, throw if crashed. */
	function ensureAlive(): void {
		if (!processAlive || disposed) {
			throw exitError ?? new Error("V8 runtime process is not running");
		}
	}

	const runtime: V8Runtime = {
		async createSession(sessionOptions?: V8SessionOptions): Promise<V8Session> {
			ensureAlive();
			if (!ipcClient) {
				throw new Error("IPC client is not connected");
			}

			// Generate 128-bit session ID
			const sessionId = randomBytes(16).toString("hex");

			// Send CreateSession
			ipcClient.send({
				type: "CreateSession",
				session_id: sessionId,
				heap_limit_mb: sessionOptions?.heapLimitMb ?? null,
				cpu_time_limit_ms: sessionOptions?.cpuTimeLimitMs ?? null,
			});

			// Create session proxy
			const client = ipcClient;
			const session: V8Session = {
				async execute(execOptions) {
					ensureAlive();
					if (!client.isConnected) {
						throw new Error("IPC client is not connected");
					}

					// Inject globals first
					client.send({
						type: "InjectGlobals",
						session_id: sessionId,
						process_config: execOptions.processConfig,
						os_config: execOptions.osConfig,
					});

					// Set up result promise
					return new Promise((resolve, reject) => {
						// Register session message handler
						sessionHandlers.set(sessionId, (msg) => {
							switch (msg.type) {
								case "BridgeCall": {
									// Route to bridge handler
									const handler =
										execOptions.bridgeHandlers[msg.method];
									if (!handler) {
										client.send({
											type: "BridgeResponse",
											call_id: msg.call_id,
											result: null,
											error: `No handler for bridge method: ${msg.method}`,
										});
										return;
									}
									// Deserialize args and call handler
									void (async () => {
										try {
											const { decode } = await import(
												"@msgpack/msgpack"
											);
											const args = decode(
												msg.args,
											) as unknown[];
											const result = await handler(
												...(Array.isArray(args)
													? args
													: [args]),
											);
											const { encode } = await import(
												"@msgpack/msgpack"
											);
											client.send({
												type: "BridgeResponse",
												call_id: msg.call_id,
												result:
													result !== undefined
														? new Uint8Array(
																encode(result),
															)
														: null,
												error: null,
											});
										} catch (err) {
											client.send({
												type: "BridgeResponse",
												call_id: msg.call_id,
												result: null,
												error:
													err instanceof Error
														? err.message
														: String(err),
											});
										}
									})();
									break;
								}
								case "ExecutionResult": {
									// Clean up handler and resolve
									sessionHandlers.delete(sessionId);
									resolve({
										code: msg.code,
										exports: msg.exports,
										error: msg.error,
									});
									break;
								}
								case "Log":
									// Emit to stdout/stderr
									if (msg.channel === "stderr") {
										process.stderr.write(msg.message);
									} else {
										process.stdout.write(msg.message);
									}
									break;
								case "StreamCallback":
									// Handled by session-level callback if registered
									break;
							}
						});

						// Send Execute
						client.send({
							type: "Execute",
							session_id: sessionId,
							bridge_code: execOptions.bridgeCode,
							user_code: execOptions.userCode,
							mode: execOptions.mode,
							file_path: execOptions.filePath ?? null,
						});
					});
				},

				async destroy(): Promise<void> {
					sessionHandlers.delete(sessionId);
					if (client.isConnected) {
						client.send({
							type: "DestroySession",
							session_id: sessionId,
						});
					}
				},
			};

			return session;
		},

		async dispose(): Promise<void> {
			if (disposed) return;
			disposed = true;

			// Close IPC connection
			ipcClient?.close();
			ipcClient = null;

			// Terminate child process
			if (processAlive) {
				child.kill("SIGTERM");

				// Wait for exit with timeout
				await new Promise<void>((resolve) => {
					const timeout = setTimeout(() => {
						if (processAlive) {
							child.kill("SIGKILL");
						}
						resolve();
					}, 5000);

					child.on("exit", () => {
						clearTimeout(timeout);
						resolve();
					});
				});
			}
		},
	};

	return runtime;
}

/** Read the socket path from the child's first stdout line. */
function readSocketPath(child: ChildProcess): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		let resolved = false;

		// Timeout if socket path is not received within 10s
		const timeout = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				child.kill("SIGTERM");
				reject(
					new Error(
						"Timed out waiting for V8 runtime socket path",
					),
				);
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
				reject(
					new Error(
						"V8 runtime process closed stdout before sending socket path",
					),
				);
			}
		});

		child.on("exit", (code, signal) => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				reject(
					new Error(
						`V8 runtime process exited (code=${code}, signal=${signal}) before sending socket path`,
					),
				);
			}
		});
	});
}
