// Build a BridgeHandlers map for V8Session.execute().
//
// Each handler is a plain function that performs the host-side operation.
// Handler names match HOST_BRIDGE_GLOBAL_KEYS from the bridge contract.

import { randomFillSync, randomUUID } from "node:crypto";
import { serialize as v8Serialize, deserialize as v8Deserialize } from "node:v8";
import {
	loadFile,
	resolveModule,
	normalizeBuiltinSpecifier,
	mkdir,
} from "@secure-exec/core";
import {
	transformDynamicImport,
} from "@secure-exec/core/internal/shared/esm-utils";
import {
	HOST_BRIDGE_GLOBAL_KEYS,
	RUNTIME_BRIDGE_GLOBAL_KEYS,
} from "@secure-exec/core/internal/shared/bridge-contract";
import {
	createCommandExecutorStub,
	createNetworkStub,
} from "@secure-exec/core/internal/shared/permissions";
import { bundlePolyfill, hasPolyfill } from "./polyfills.js";
import {
	checkBridgeBudget,
	assertPayloadByteLength,
	assertTextPayloadSize,
	getUtf8ByteLength,
	parseJsonWithLimit,
	polyfillCodeCache,
	PAYLOAD_LIMIT_ERROR_CODE,
	RESOURCE_BUDGET_ERROR_CODE,
} from "./isolate-bootstrap.js";
import type { DriverDeps } from "./isolate-bootstrap.js";
import type { BridgeHandlers } from "@secure-exec/v8";
import type { StdioHook, StdioEvent } from "@secure-exec/core/internal/shared/api-types";

// Estimate serialized size of a network response object for payload limit checks
function estimateResponseSize(result: { body?: string; headers?: Record<string, string>; url?: string; statusText?: string; [k: string]: unknown }): number {
	let size = 64; // Fixed overhead for object structure
	if (result.body) size += getUtf8ByteLength(result.body);
	if (result.url) size += result.url.length;
	if (result.statusText) size += result.statusText.length;
	if (result.headers) {
		for (const [k, v] of Object.entries(result.headers)) {
			size += k.length + v.length;
		}
	}
	return size;
}

// Env vars that could hijack child processes (library injection, node flags)
const DANGEROUS_ENV_KEYS = new Set([
	"LD_PRELOAD",
	"LD_LIBRARY_PATH",
	"NODE_OPTIONS",
	"DYLD_INSERT_LIBRARIES",
]);

function stripDangerousEnv(
	env: Record<string, string> | undefined,
): Record<string, string> | undefined {
	if (!env) return env;
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		if (!DANGEROUS_ENV_KEYS.has(key)) {
			result[key] = value;
		}
	}
	return result;
}

function emitConsoleEvent(
	onStdio: StdioHook | undefined,
	event: StdioEvent,
): void {
	if (!onStdio) return;
	try {
		onStdio(event);
	} catch {
		// Keep runtime execution deterministic even when host hooks fail.
	}
}

type BridgeDeps = Pick<
	DriverDeps,
	| "filesystem"
	| "commandExecutor"
	| "networkAdapter"
	| "processConfig"
	| "osConfig"
	| "budgetState"
	| "maxBridgeCalls"
	| "maxOutputBytes"
	| "maxTimers"
	| "maxChildProcesses"
	| "maxHandles"
	| "bridgeBase64TransferLimitBytes"
	| "isolateJsonPayloadLimitBytes"
	| "activeHttpServerIds"
	| "activeChildProcesses"
	| "activeHostTimers"
	| "resolutionCache"
	| "onPtySetRawMode"
>;

export interface BuildBridgeHandlersOptions {
	deps: BridgeDeps;
	onStdio?: StdioHook;
	/** Send a stream event into V8 (for child process dispatch). */
	sendStreamEvent: (eventType: string, payload: Uint8Array) => void;
	/** Callback for stream responses from V8 (for HTTP server dispatch). */
	onStreamCallback?: (callbackType: string, payload: Uint8Array) => void;
}

/**
 * Build a BridgeHandlers map from driver deps.
 *
 * All handler functions are plain functions (no ivm.Reference wrapping).
 * The Rust V8 runtime registers these by name on the V8 global.
 */
export function buildBridgeHandlers(options: BuildBridgeHandlersOptions): BridgeHandlers {
	const { deps, onStdio, sendStreamEvent } = options;
	const handlers: BridgeHandlers = {};
	const K = HOST_BRIDGE_GLOBAL_KEYS;

	// Console
	handlers[K.log] = (msg: unknown) => {
		const str = String(msg);
		if (deps.maxOutputBytes !== undefined) {
			const bytes = Buffer.byteLength(str, "utf8");
			if (deps.budgetState.outputBytes + bytes > deps.maxOutputBytes) return;
			deps.budgetState.outputBytes += bytes;
		}
		emitConsoleEvent(onStdio, { channel: "stdout", message: str });
	};
	handlers[K.error] = (msg: unknown) => {
		const str = String(msg);
		if (deps.maxOutputBytes !== undefined) {
			const bytes = Buffer.byteLength(str, "utf8");
			if (deps.budgetState.outputBytes + bytes > deps.maxOutputBytes) return;
			deps.budgetState.outputBytes += bytes;
		}
		emitConsoleEvent(onStdio, { channel: "stderr", message: str });
	};

	// Module loading
	handlers[K.loadPolyfill] = async (moduleName: unknown): Promise<string | null> => {
		const name = String(moduleName).replace(/^node:/, "");
		if (name === "fs" || name === "child_process" || name === "os" || name === "module") return null;
		if (name === "http" || name === "https" || name === "http2" || name === "dns") return null;
		if (!hasPolyfill(name)) return null;
		let code = polyfillCodeCache.get(name);
		if (!code) {
			code = await bundlePolyfill(name);
			polyfillCodeCache.set(name, code);
		}
		return code;
	};
	handlers[K.resolveModule] = async (request: unknown, fromDir: unknown): Promise<string | null> => {
		const builtinSpecifier = normalizeBuiltinSpecifier(String(request));
		if (builtinSpecifier) return builtinSpecifier;
		return resolveModule(String(request), String(fromDir), deps.filesystem, "require", deps.resolutionCache);
	};
	handlers[K.loadFile] = async (path: unknown): Promise<string | null> => {
		const source = await loadFile(String(path), deps.filesystem);
		if (source === null) return null;
		return transformDynamicImport(source);
	};

	// Batch module resolution — resolves multiple specifiers in one IPC round-trip.
	// Each entry is [specifier, referrer]. Returns array of {resolved, source} or null.
	handlers[K.batchResolveModules] = async (requests: unknown): Promise<unknown> => {
		if (!Array.isArray(requests)) return [];
		const results = await Promise.all(
			requests.map(async (entry: unknown) => {
				try {
					const pair = entry as [string, string];
					const specifier = String(pair[0]);
					const referrer = String(pair[1]);
					const builtinSpecifier = normalizeBuiltinSpecifier(specifier);
					if (builtinSpecifier) return null; // builtins don't need source loading
					const resolved = await resolveModule(specifier, referrer, deps.filesystem, "require", deps.resolutionCache);
					if (!resolved) return null;
					const source = await loadFile(resolved, deps.filesystem);
					if (source === null) return null;
					return { resolved, source: transformDynamicImport(source) };
				} catch {
					return null;
				}
			}),
		);
		return results;
	};

	// Timer
	handlers[K.scheduleTimer] = (delayMs: unknown) => {
		checkBridgeBudget(deps);
		return new Promise<void>((resolve) => {
			const id = globalThis.setTimeout(() => {
				deps.activeHostTimers.delete(id);
				resolve();
			}, Number(delayMs));
			deps.activeHostTimers.add(id);
		});
	};

	// Crypto
	handlers[K.cryptoRandomFill] = (byteLength: unknown) => {
		const len = Number(byteLength);
		if (len > 65536) {
			throw new RangeError(
				`The ArrayBufferView's byte length (${len}) exceeds the number of bytes of entropy available via this API (65536)`,
			);
		}
		const buffer = Buffer.allocUnsafe(len);
		randomFillSync(buffer);
		return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	};
	handlers[K.cryptoRandomUuid] = () => randomUUID();

	// Filesystem
	{
		const fs = deps.filesystem;
		const base64Limit = deps.bridgeBase64TransferLimitBytes;
		const fsJsonPayloadLimit = deps.isolateJsonPayloadLimitBytes;

		handlers[K.fsReadFile] = async (path: unknown) => {
			checkBridgeBudget(deps);
			const text = await fs.readTextFile(String(path));
			assertTextPayloadSize(`fs.readFile ${path}`, text, fsJsonPayloadLimit);
			return text;
		};
		handlers[K.fsWriteFile] = async (path: unknown, content: unknown) => {
			checkBridgeBudget(deps);
			await fs.writeFile(String(path), String(content));
		};
		handlers[K.fsReadFileBinary] = async (path: unknown) => {
			checkBridgeBudget(deps);
			const data = await fs.readFile(String(path));
			assertPayloadByteLength(`fs.readFileBinary ${path}`, data.byteLength, base64Limit);
			return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
		};
		handlers[K.fsWriteFileBinary] = async (path: unknown, binaryContent: unknown) => {
			checkBridgeBudget(deps);
			const data = binaryContent instanceof Uint8Array
				? binaryContent
				: Buffer.from(String(binaryContent));
			assertPayloadByteLength(`fs.writeFileBinary ${path}`, data.byteLength, base64Limit);
			await fs.writeFile(String(path), data);
		};
		handlers[K.fsReadDir] = async (path: unknown) => {
			checkBridgeBudget(deps);
			const entries = await fs.readDirWithTypes(String(path));
			// Estimate payload size: each entry ~= name byte length + fixed overhead
			const estimated = entries.reduce((sum, e) => sum + e.name.length + 20, 0);
			assertPayloadByteLength(`fs.readDir ${path}`, estimated, fsJsonPayloadLimit);
			return entries;
		};
		handlers[K.fsMkdir] = async (path: unknown) => {
			checkBridgeBudget(deps);
			await mkdir(fs, String(path));
		};
		handlers[K.fsRmdir] = async (path: unknown) => {
			checkBridgeBudget(deps);
			await fs.removeDir(String(path));
		};
		handlers[K.fsExists] = async (path: unknown) => {
			checkBridgeBudget(deps);
			return fs.exists(String(path));
		};
		handlers[K.fsStat] = async (path: unknown) => {
			checkBridgeBudget(deps);
			const s = await fs.stat(String(path));
			return {
				mode: s.mode, size: s.size, isDirectory: s.isDirectory,
				atimeMs: s.atimeMs, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs, birthtimeMs: s.birthtimeMs,
			};
		};
		handlers[K.fsUnlink] = async (path: unknown) => { checkBridgeBudget(deps); await fs.removeFile(String(path)); };
		handlers[K.fsRename] = async (oldPath: unknown, newPath: unknown) => { checkBridgeBudget(deps); await fs.rename(String(oldPath), String(newPath)); };
		handlers[K.fsChmod] = async (path: unknown, mode: unknown) => { checkBridgeBudget(deps); await fs.chmod(String(path), Number(mode)); };
		handlers[K.fsChown] = async (path: unknown, uid: unknown, gid: unknown) => { checkBridgeBudget(deps); await fs.chown(String(path), Number(uid), Number(gid)); };
		handlers[K.fsLink] = async (oldPath: unknown, newPath: unknown) => { checkBridgeBudget(deps); await fs.link(String(oldPath), String(newPath)); };
		handlers[K.fsSymlink] = async (target: unknown, linkPath: unknown) => { checkBridgeBudget(deps); await fs.symlink(String(target), String(linkPath)); };
		handlers[K.fsReadlink] = async (path: unknown) => { checkBridgeBudget(deps); return fs.readlink(String(path)); };
		handlers[K.fsLstat] = async (path: unknown) => {
			checkBridgeBudget(deps);
			const s = await fs.lstat(String(path));
			return {
				mode: s.mode, size: s.size, isDirectory: s.isDirectory, isSymbolicLink: s.isSymbolicLink,
				atimeMs: s.atimeMs, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs, birthtimeMs: s.birthtimeMs,
			};
		};
		handlers[K.fsTruncate] = async (path: unknown, length: unknown) => { checkBridgeBudget(deps); await fs.truncate(String(path), Number(length)); };
		handlers[K.fsUtimes] = async (path: unknown, atime: unknown, mtime: unknown) => { checkBridgeBudget(deps); await fs.utimes(String(path), Number(atime), Number(mtime)); };
	}

	// Child process
	{
		const executor = deps.commandExecutor ?? createCommandExecutorStub();
		let nextSessionId = 1;
		const sessions = deps.activeChildProcesses;
		const jsonPayloadLimit = deps.isolateJsonPayloadLimitBytes;

		handlers[K.childProcessSpawnStart] = (command: unknown, argsJson: unknown, optionsJson: unknown): number => {
			checkBridgeBudget(deps);
			if (deps.maxChildProcesses !== undefined && deps.budgetState.childProcesses >= deps.maxChildProcesses) {
				throw new Error(`${RESOURCE_BUDGET_ERROR_CODE}: maximum child processes exceeded`);
			}
			deps.budgetState.childProcesses++;
			const args = parseJsonWithLimit<string[]>("child_process.spawn args", String(argsJson), jsonPayloadLimit);
			const spawnOpts = parseJsonWithLimit<{ cwd?: string; env?: Record<string, string> }>("child_process.spawn options", String(optionsJson), jsonPayloadLimit);
			const sessionId = nextSessionId++;
			const childEnv = stripDangerousEnv(spawnOpts.env ?? deps.processConfig.env);

			const proc = executor.spawn(String(command), args, {
				cwd: spawnOpts.cwd,
				env: childEnv,
				onStdout: (data) => {
					sendStreamEvent("child_stdout", new Uint8Array(v8Serialize([sessionId, "stdout", data])));
				},
				onStderr: (data) => {
					sendStreamEvent("child_stderr", new Uint8Array(v8Serialize([sessionId, "stderr", data])));
				},
			});

			proc.wait().then((code) => {
				sendStreamEvent("child_exit", new Uint8Array(v8Serialize([sessionId, "exit", code])));
				sessions.delete(sessionId);
			});

			sessions.set(sessionId, proc);
			return sessionId;
		};

		handlers[K.childProcessStdinWrite] = (sessionId: unknown, data: unknown) => {
			sessions.get(Number(sessionId))?.writeStdin(data as Uint8Array);
		};
		handlers[K.childProcessStdinClose] = (sessionId: unknown) => {
			sessions.get(Number(sessionId))?.closeStdin();
		};
		handlers[K.childProcessKill] = (sessionId: unknown, signal: unknown) => {
			sessions.get(Number(sessionId))?.kill(Number(signal));
		};

		handlers[K.childProcessSpawnSync] = async (command: unknown, argsJson: unknown, optionsJson: unknown) => {
			checkBridgeBudget(deps);
			if (deps.maxChildProcesses !== undefined && deps.budgetState.childProcesses >= deps.maxChildProcesses) {
				throw new Error(`${RESOURCE_BUDGET_ERROR_CODE}: maximum child processes exceeded`);
			}
			deps.budgetState.childProcesses++;
			const args = parseJsonWithLimit<string[]>("child_process.spawnSync args", String(argsJson), jsonPayloadLimit);
			const spawnOpts = parseJsonWithLimit<{ cwd?: string; env?: Record<string, string>; maxBuffer?: number }>("child_process.spawnSync options", String(optionsJson), jsonPayloadLimit);
			const maxBuffer = spawnOpts.maxBuffer ?? 1024 * 1024;
			const stdoutChunks: Uint8Array[] = [];
			const stderrChunks: Uint8Array[] = [];
			let stdoutBytes = 0;
			let stderrBytes = 0;
			let maxBufferExceeded = false;
			const childEnv = stripDangerousEnv(spawnOpts.env ?? deps.processConfig.env);

			const proc = executor.spawn(String(command), args, {
				cwd: spawnOpts.cwd,
				env: childEnv,
				onStdout: (data) => {
					if (maxBufferExceeded) return;
					stdoutBytes += data.length;
					if (maxBuffer !== undefined && stdoutBytes > maxBuffer) { maxBufferExceeded = true; proc.kill(15); return; }
					stdoutChunks.push(data);
				},
				onStderr: (data) => {
					if (maxBufferExceeded) return;
					stderrBytes += data.length;
					if (maxBuffer !== undefined && stderrBytes > maxBuffer) { maxBufferExceeded = true; proc.kill(15); return; }
					stderrChunks.push(data);
				},
			});
			const exitCode = await proc.wait();
			const decoder = new TextDecoder();
			const stdout = stdoutChunks.map((c) => decoder.decode(c)).join("");
			const stderr = stderrChunks.map((c) => decoder.decode(c)).join("");
			return { stdout, stderr, code: exitCode, maxBufferExceeded };
		};
	}

	// Network
	{
		const adapter = deps.networkAdapter ?? createNetworkStub();
		const jsonPayloadLimit = deps.isolateJsonPayloadLimitBytes;

		handlers[K.networkFetchRaw] = (url: unknown, optionsJson: unknown) => {
			checkBridgeBudget(deps);
			const fetchOpts = parseJsonWithLimit<{ method?: string; headers?: Record<string, string>; body?: string | null }>("network.fetch options", String(optionsJson), jsonPayloadLimit);
			return adapter.fetch(String(url), fetchOpts).then((result) => {
				const estimated = estimateResponseSize(result);
				assertPayloadByteLength("network.fetch response", estimated, jsonPayloadLimit);
				return result;
			});
		};
		handlers[K.networkDnsLookupRaw] = async (hostname: unknown) => {
			checkBridgeBudget(deps);
			return adapter.dnsLookup(String(hostname));
		};
		handlers[K.networkHttpRequestRaw] = (url: unknown, optionsJson: unknown) => {
			checkBridgeBudget(deps);
			const reqOpts = parseJsonWithLimit<{ method?: string; headers?: Record<string, string>; body?: string | null; rejectUnauthorized?: boolean }>("network.httpRequest options", String(optionsJson), jsonPayloadLimit);
			return adapter.httpRequest(String(url), reqOpts).then((result) => {
				const estimated = estimateResponseSize(result);
				assertPayloadByteLength("network.httpRequest response", estimated, jsonPayloadLimit);
				return result;
			});
		};

		// HTTP server listen/close — simplified for V8 IPC architecture.
		// The full bidirectional dispatch (request → V8 → response) uses
		// StreamEvent + onStreamCallback for the roundtrip.
		const ownedHttpServers = new Set<number>();
		const pendingHttpResponses = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
		let nextRequestId = 1;

		// Wire up stream callback receiver for HTTP server responses
		if (options.onStreamCallback) {
			const originalCallback = options.onStreamCallback;
			options.onStreamCallback = (callbackType: string, payload: Uint8Array) => {
				if (callbackType === "http_response") {
					const [requestId, response] = v8Deserialize(payload) as [number, unknown];
					const pending = pendingHttpResponses.get(requestId);
					if (pending) {
						pendingHttpResponses.delete(requestId);
						pending.resolve(response);
					}
					return;
				}
				originalCallback(callbackType, payload);
			};
		}

		handlers[K.networkHttpServerListenRaw] = (optionsJson: unknown) => {
			if (!adapter.httpServerListen) {
				throw new Error("http.createServer requires NetworkAdapter.httpServerListen support");
			}
			const listenOpts = parseJsonWithLimit<{ serverId: number; port?: number; hostname?: string }>("network.httpServer.listen options", String(optionsJson), jsonPayloadLimit);

			return (async () => {
				const result = await adapter.httpServerListen!({
					serverId: listenOpts.serverId,
					port: listenOpts.port,
					hostname: listenOpts.hostname,
					onRequest: async (request) => {
						const requestId = nextRequestId++;

						// Send request into V8 via stream event
						sendStreamEvent("http_request", new Uint8Array(v8Serialize([listenOpts.serverId, requestId, request])));

						// Wait for response via stream callback
						return new Promise((resolve, reject) => {
							pendingHttpResponses.set(requestId, {
								resolve: (v) => resolve(v as { status: number; headers?: Array<[string, string]>; body?: string; bodyEncoding?: "utf8" | "base64" }),
								reject,
							});
							// Timeout after 30s to prevent orphaned requests
							setTimeout(() => {
								if (pendingHttpResponses.has(requestId)) {
									pendingHttpResponses.delete(requestId);
									reject(new Error("HTTP server request timed out"));
								}
							}, 30000);
						});
					},
				});
				ownedHttpServers.add(listenOpts.serverId);
				deps.activeHttpServerIds.add(listenOpts.serverId);
				return result;
			})();
		};

		handlers[K.networkHttpServerCloseRaw] = (serverId: unknown): Promise<void> => {
			if (!adapter.httpServerClose) {
				throw new Error("http.createServer close requires NetworkAdapter.httpServerClose support");
			}
			const id = Number(serverId);
			if (!ownedHttpServers.has(id)) {
				throw new Error(`Cannot close server ${id}: not owned by this execution context`);
			}
			return adapter.httpServerClose(id).then(() => {
				ownedHttpServers.delete(id);
				deps.activeHttpServerIds.delete(id);
			});
		};
	}

	// PTY
	if (deps.processConfig.stdinIsTTY && deps.onPtySetRawMode) {
		const onSetRawMode = deps.onPtySetRawMode;
		handlers[K.ptySetRawMode] = (mode: unknown) => {
			onSetRawMode(Boolean(mode));
		};
	}

	// Dynamic import (async)
	handlers[K.dynamicImport] = async (specifier: unknown, fromPath: unknown) => {
		// Dynamic import resolution uses the same module resolution as require
		const builtinSpecifier = normalizeBuiltinSpecifier(String(specifier));
		if (builtinSpecifier) return builtinSpecifier;
		const resolved = await resolveModule(
			String(specifier),
			String(fromPath || "/"),
			deps.filesystem,
			"import",
			deps.resolutionCache,
		);
		if (!resolved) return null;
		const source = await loadFile(resolved, deps.filesystem);
		if (source === null) return null;
		return transformDynamicImport(source);
	};

	return handlers;
}
