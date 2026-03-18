import ivm from "isolated-vm";
import { randomFillSync, randomUUID } from "node:crypto";
import {
	getInitialBridgeGlobalsSetupCode,
	getIsolateRuntimeSource,
	loadFile,
	resolveModule,
	normalizeBuiltinSpecifier,
	mkdir,
} from "@secure-exec/core";
import { getBridgeAttachCode, getRawBridgeCode } from "./bridge-loader.js";
import { bundlePolyfill, hasPolyfill } from "./polyfills.js";
import {
	transformDynamicImport,
} from "@secure-exec/core/internal/shared/esm-utils";
import { getConsoleSetupCode } from "@secure-exec/core/internal/shared/console-formatter";
import { getRequireSetupCode } from "@secure-exec/core/internal/shared/require-setup";
import {
	HOST_BRIDGE_GLOBAL_KEYS,
	RUNTIME_BRIDGE_GLOBAL_KEYS,
} from "@secure-exec/core/internal/shared/bridge-contract";
import {
	createCommandExecutorStub,
	createNetworkStub,
} from "@secure-exec/core/internal/shared/permissions";
import type {
	NetworkAdapter,
	SpawnedProcess,
} from "@secure-exec/core";
import type {
	StdioEvent,
	StdioHook,
	ProcessConfig,
	TimingMitigation,
} from "@secure-exec/core/internal/shared/api-types";
import {
	checkBridgeBudget,
	assertPayloadByteLength,
	assertTextPayloadSize,
	getBase64EncodedByteLength,
	parseJsonWithLimit,
	polyfillCodeCache,
	PAYLOAD_LIMIT_ERROR_CODE,
	RESOURCE_BUDGET_ERROR_CODE,
} from "./isolate-bootstrap.js";
import type { DriverDeps } from "./isolate-bootstrap.js";

// Env vars that could hijack child processes (library injection, node flags)
const DANGEROUS_ENV_KEYS = new Set([
	"LD_PRELOAD",
	"LD_LIBRARY_PATH",
	"NODE_OPTIONS",
	"DYLD_INSERT_LIBRARIES",
]);

/** Strip env vars that allow library injection or node flag smuggling. */
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
>;

export function emitConsoleEvent(
	onStdio: StdioHook | undefined,
	event: StdioEvent,
): void {
	if (!onStdio) {
		return;
	}
	try {
		onStdio(event);
	} catch {
		// Keep runtime execution deterministic even when host hooks fail.
	}
}

/**
 * Set up console with optional streaming log hook.
 */
export async function setupConsole(
	deps: BridgeDeps,
	context: ivm.Context,
	jail: ivm.Reference<Record<string, unknown>>,
	onStdio?: StdioHook,
): Promise<void> {
	const logRef = new ivm.Reference((msg: string) => {
		const str = String(msg);
		// Enforce output byte budget — reject messages that would exceed the limit
		if (deps.maxOutputBytes !== undefined) {
			const bytes = Buffer.byteLength(str, "utf8");
			if (deps.budgetState.outputBytes + bytes > deps.maxOutputBytes) return;
			deps.budgetState.outputBytes += bytes;
		}
		emitConsoleEvent(onStdio, { channel: "stdout", message: str });
	});
	const errorRef = new ivm.Reference((msg: string) => {
		const str = String(msg);
		if (deps.maxOutputBytes !== undefined) {
			const bytes = Buffer.byteLength(str, "utf8");
			if (deps.budgetState.outputBytes + bytes > deps.maxOutputBytes) return;
			deps.budgetState.outputBytes += bytes;
		}
		emitConsoleEvent(onStdio, { channel: "stderr", message: str });
	});

	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.log, logRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.error, errorRef);

	await context.eval(getConsoleSetupCode());
}

/**
 * Set up the require() system in a context.
 */
export async function setupRequire(
	deps: BridgeDeps,
	context: ivm.Context,
	jail: ivm.Reference<Record<string, unknown>>,
	timingMitigation: TimingMitigation,
	frozenTimeMs: number,
): Promise<void> {
	// Create a reference that can load polyfills on demand
	const loadPolyfillRef = new ivm.Reference(
		async (moduleName: string): Promise<string | null> => {
			const name = moduleName.replace(/^node:/, "");

			// fs is handled specially
			if (name === "fs") {
				return null;
			}

			// child_process is handled specially
			if (name === "child_process") {
				return null;
			}

			// Network modules are handled specially
			if (
				name === "http" ||
				name === "https" ||
				name === "http2" ||
				name === "dns"
			) {
				return null;
			}

			// os module is handled specially with our own polyfill
			if (name === "os") {
				return null;
			}

			// module is handled specially with our own polyfill
			if (name === "module") {
				return null;
			}

			if (!hasPolyfill(name)) {
				return null;
			}
			// Check cache first
			let code = polyfillCodeCache.get(name);
			if (!code) {
				code = await bundlePolyfill(name);
				polyfillCodeCache.set(name, code);
			}
			return code;
		},
	);

	// Create a reference for resolving module paths
	const resolveModuleRef = new ivm.Reference(
		async (request: string, fromDir: string): Promise<string | null> => {
			const builtinSpecifier = normalizeBuiltinSpecifier(request);
			if (builtinSpecifier) {
				return builtinSpecifier;
			}
			return resolveModule(request, fromDir, deps.filesystem, "require", deps.resolutionCache);
		},
	);

	// Create a reference for loading file content
	// Also transforms dynamic import() calls to __dynamicImport()
	const loadFileRef = new ivm.Reference(
		async (path: string): Promise<string | null> => {
			const source = await loadFile(path, deps.filesystem);
			if (source === null) {
				return null;
			}
			// Transform dynamic import() to __dynamicImport() for V8 compatibility
			return transformDynamicImport(source);
		},
	);

	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.loadPolyfill, loadPolyfillRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.resolveModule, resolveModuleRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.loadFile, loadFileRef);

	// Set up timer Reference for actual delays (not just microtasks)
	const scheduleTimerRef = new ivm.Reference((delayMs: number) => {
		checkBridgeBudget(deps);
		return new Promise<void>((resolve) => {
			const id = globalThis.setTimeout(() => {
				deps.activeHostTimers.delete(id);
				resolve();
			}, delayMs);
			deps.activeHostTimers.add(id);
		});
	});
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.scheduleTimer, scheduleTimerRef);

	// Inject maxTimers limit for bridge-side enforcement (synchronous check)
	if (deps.maxTimers !== undefined) {
		await jail.set("_maxTimers", deps.maxTimers, { copy: true });
	}

	// Inject maxHandles limit for bridge-side active handle cap
	if (deps.maxHandles !== undefined) {
		await jail.set("_maxHandles", deps.maxHandles, { copy: true });
	}

	// Set up host crypto references for secure randomness.
	// Cap matches Web Crypto API spec (65536 bytes) to prevent host OOM.
	const cryptoRandomFillRef = new ivm.Reference((byteLength: number) => {
		if (byteLength > 65536) {
			throw new RangeError(
				`The ArrayBufferView's byte length (${byteLength}) exceeds the number of bytes of entropy available via this API (65536)`,
			);
		}
		const buffer = Buffer.allocUnsafe(byteLength);
		randomFillSync(buffer);
		return buffer.toString("base64");
	});
	const cryptoRandomUuidRef = new ivm.Reference(() => {
		return randomUUID();
	});
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoRandomFill, cryptoRandomFillRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoRandomUuid, cryptoRandomUuidRef);

	// Set up fs References (stubbed if filesystem is disabled)
	{
		const fs = deps.filesystem;
		const base64Limit = deps.bridgeBase64TransferLimitBytes;
		const fsJsonPayloadLimit = deps.isolateJsonPayloadLimitBytes;

		// Create individual References for each fs operation
		const readFileRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			const text = await fs.readTextFile(path);
			assertTextPayloadSize(
				`fs.readFile ${path}`,
				text,
				fsJsonPayloadLimit,
			);
			return text;
		});
		const writeFileRef = new ivm.Reference(
			async (path: string, content: string) => {
				checkBridgeBudget(deps);
				await fs.writeFile(path, content);
			},
		);
		// Binary file operations using base64 encoding
		const readFileBinaryRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			const data = await fs.readFile(path);
				assertPayloadByteLength(
					`fs.readFileBinary ${path}`,
					getBase64EncodedByteLength(data.byteLength),
					base64Limit,
				);
			// Convert to base64 for transfer across isolate boundary
			return Buffer.from(data).toString("base64");
		});
		const writeFileBinaryRef = new ivm.Reference(
			async (path: string, base64Content: string) => {
				checkBridgeBudget(deps);
					assertTextPayloadSize(
						`fs.writeFileBinary ${path}`,
						base64Content,
						base64Limit,
					);
				// Decode base64 and write as binary
				const data = Buffer.from(base64Content, "base64");
				await fs.writeFile(path, data);
			},
		);
		const readDirRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			const entries = await fs.readDirWithTypes(path);
			// Validate payload size before transfer
			const json = JSON.stringify(entries);
			assertTextPayloadSize(`fs.readDir ${path}`, json, fsJsonPayloadLimit);
			return json;
		});
		const mkdirRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			await mkdir(fs, path);
		});
		const rmdirRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			await fs.removeDir(path);
		});
		const existsRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			return fs.exists(path);
		});
		const statRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			const statInfo = await fs.stat(path);
			// Return as JSON string for transfer
			return JSON.stringify({
				mode: statInfo.mode,
				size: statInfo.size,
				isDirectory: statInfo.isDirectory,
				atimeMs: statInfo.atimeMs,
				mtimeMs: statInfo.mtimeMs,
				ctimeMs: statInfo.ctimeMs,
				birthtimeMs: statInfo.birthtimeMs,
			});
		});
		const unlinkRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			await fs.removeFile(path);
		});
		const renameRef = new ivm.Reference(
			async (oldPath: string, newPath: string) => {
				checkBridgeBudget(deps);
				await fs.rename(oldPath, newPath);
			},
		);
		const chmodRef = new ivm.Reference(
			async (path: string, mode: number) => {
				checkBridgeBudget(deps);
				await fs.chmod(path, mode);
			},
		);
		const chownRef = new ivm.Reference(
			async (path: string, uid: number, gid: number) => {
				checkBridgeBudget(deps);
				await fs.chown(path, uid, gid);
			},
		);
		const linkRef = new ivm.Reference(
			async (oldPath: string, newPath: string) => {
				checkBridgeBudget(deps);
				await fs.link(oldPath, newPath);
			},
		);
		const symlinkRef = new ivm.Reference(
			async (target: string, linkPath: string) => {
				checkBridgeBudget(deps);
				await fs.symlink(target, linkPath);
			},
		);
		const readlinkRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			return fs.readlink(path);
		});
		const lstatRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			const statInfo = await fs.lstat(path);
			return JSON.stringify({
				mode: statInfo.mode,
				size: statInfo.size,
				isDirectory: statInfo.isDirectory,
				isSymbolicLink: statInfo.isSymbolicLink,
				atimeMs: statInfo.atimeMs,
				mtimeMs: statInfo.mtimeMs,
				ctimeMs: statInfo.ctimeMs,
				birthtimeMs: statInfo.birthtimeMs,
			});
		});
		const truncateRef = new ivm.Reference(
			async (path: string, length: number) => {
				checkBridgeBudget(deps);
				await fs.truncate(path, length);
			},
		);
		const utimesRef = new ivm.Reference(
			async (path: string, atime: number, mtime: number) => {
				checkBridgeBudget(deps);
				await fs.utimes(path, atime, mtime);
			},
		);

		// Set up each fs Reference individually in the isolate
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsReadFile, readFileRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsWriteFile, writeFileRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsReadFileBinary, readFileBinaryRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsWriteFileBinary, writeFileBinaryRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsReadDir, readDirRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsMkdir, mkdirRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsRmdir, rmdirRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsExists, existsRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsStat, statRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsUnlink, unlinkRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsRename, renameRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsChmod, chmodRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsChown, chownRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsLink, linkRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsSymlink, symlinkRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsReadlink, readlinkRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsLstat, lstatRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsTruncate, truncateRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsUtimes, utimesRef);

		// Create the _fs object inside the isolate.
		await context.eval(getIsolateRuntimeSource("setupFsFacade"));
	}

	// Set up child_process References (stubbed when disabled)
	{
		const executor = deps.commandExecutor ?? createCommandExecutorStub();
		let nextSessionId = 1;
		const sessions = deps.activeChildProcesses;
		const jsonPayloadLimit = deps.isolateJsonPayloadLimitBytes;

		// Lazy-initialized dispatcher reference from isolate
		// We can't get this upfront because _childProcessDispatch is set by bridge code
		// which loads AFTER these references are set up
		let dispatchRef: ivm.Reference<
			(
				sessionId: number,
				type: "stdout" | "stderr" | "exit",
				data: Uint8Array | number,
			) => void
		> | null = null;

		const getDispatchRef = () => {
			if (!dispatchRef) {
				dispatchRef = context.global.getSync(
					RUNTIME_BRIDGE_GLOBAL_KEYS.childProcessDispatch,
					{
					reference: true,
					},
				) as ivm.Reference<
					(
						sessionId: number,
						type: "stdout" | "stderr" | "exit",
						data: Uint8Array | number,
					) => void
				>;
			}
			return dispatchRef!;
		};

		// Start a spawn - returns session ID
		const spawnStartRef = new ivm.Reference(
			(command: string, argsJson: string, optionsJson: string): number => {
				checkBridgeBudget(deps);
				if (deps.maxChildProcesses !== undefined && deps.budgetState.childProcesses >= deps.maxChildProcesses) {
					throw new Error(`${RESOURCE_BUDGET_ERROR_CODE}: maximum child processes exceeded`);
				}
				deps.budgetState.childProcesses++;
				const args = parseJsonWithLimit<string[]>(
					"child_process.spawn args",
					argsJson,
					jsonPayloadLimit,
				);
				const options = parseJsonWithLimit<{
					cwd?: string;
					env?: Record<string, string>;
				}>("child_process.spawn options", optionsJson, jsonPayloadLimit);
				const sessionId = nextSessionId++;

				// Use init-time filtered env when no explicit env — sandbox
				// process.env mutations must not propagate to children
				const childEnv = stripDangerousEnv(options.env ?? deps.processConfig.env);

				const proc = executor.spawn(command, args, {
					cwd: options.cwd,
					env: childEnv,
					onStdout: (data) => {
						getDispatchRef().applySync(
							undefined,
							[sessionId, "stdout", data],
							{ arguments: { copy: true } },
						);
					},
					onStderr: (data) => {
						getDispatchRef().applySync(
							undefined,
							[sessionId, "stderr", data],
							{ arguments: { copy: true } },
						);
					},
				});

				proc.wait().then((code) => {
					getDispatchRef().applySync(undefined, [sessionId, "exit", code]);
					sessions.delete(sessionId);
				});

				sessions.set(sessionId, proc);
				return sessionId;
			},
		);

		// Stdin write
		const stdinWriteRef = new ivm.Reference(
			(sessionId: number, data: Uint8Array): void => {
				sessions.get(sessionId)?.writeStdin(data);
			},
		);

		// Stdin close
		const stdinCloseRef = new ivm.Reference((sessionId: number): void => {
			sessions.get(sessionId)?.closeStdin();
		});

		// Kill
		const killRef = new ivm.Reference(
			(sessionId: number, signal: number): void => {
				sessions.get(sessionId)?.kill(signal);
			},
		);

		// Synchronous spawn - blocks until process exits, returns all output
		// Used by execSync/spawnSync which need to wait for completion
		const spawnSyncRef = new ivm.Reference(
			async (
				command: string,
				argsJson: string,
				optionsJson: string,
			): Promise<string> => {
				checkBridgeBudget(deps);
				if (deps.maxChildProcesses !== undefined && deps.budgetState.childProcesses >= deps.maxChildProcesses) {
					throw new Error(`${RESOURCE_BUDGET_ERROR_CODE}: maximum child processes exceeded`);
				}
				deps.budgetState.childProcesses++;
				const args = parseJsonWithLimit<string[]>(
					"child_process.spawnSync args",
					argsJson,
					jsonPayloadLimit,
				);
				const options = parseJsonWithLimit<{
					cwd?: string;
					env?: Record<string, string>;
					maxBuffer?: number;
				}>("child_process.spawnSync options", optionsJson, jsonPayloadLimit);

				// Collect stdout/stderr with maxBuffer enforcement (default 1MB)
				const maxBuffer = options.maxBuffer ?? 1024 * 1024;
				const stdoutChunks: Uint8Array[] = [];
				const stderrChunks: Uint8Array[] = [];
				let stdoutBytes = 0;
				let stderrBytes = 0;
				let maxBufferExceeded = false;

				// Use init-time filtered env when no explicit env — sandbox
				// process.env mutations must not propagate to children
				const childEnv = stripDangerousEnv(options.env ?? deps.processConfig.env);

				const proc = executor.spawn(command, args, {
					cwd: options.cwd,
					env: childEnv,
					onStdout: (data) => {
						if (maxBufferExceeded) return;
						stdoutBytes += data.length;
						if (maxBuffer !== undefined && stdoutBytes > maxBuffer) {
							maxBufferExceeded = true;
							proc.kill(15);
							return;
						}
						stdoutChunks.push(data);
					},
					onStderr: (data) => {
						if (maxBufferExceeded) return;
						stderrBytes += data.length;
						if (maxBuffer !== undefined && stderrBytes > maxBuffer) {
							maxBufferExceeded = true;
							proc.kill(15);
							return;
						}
						stderrChunks.push(data);
					},
				});

				// Wait for process to exit
				const exitCode = await proc.wait();

				// Combine chunks into strings
				const decoder = new TextDecoder();
				const stdout = stdoutChunks.map((c) => decoder.decode(c)).join("");
				const stderr = stderrChunks.map((c) => decoder.decode(c)).join("");

				return JSON.stringify({ stdout, stderr, code: exitCode, maxBufferExceeded });
			},
		);

		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.childProcessSpawnStart, spawnStartRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.childProcessStdinWrite, stdinWriteRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.childProcessStdinClose, stdinCloseRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.childProcessKill, killRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.childProcessSpawnSync, spawnSyncRef);
	}

	// Set up network References (stubbed when disabled)
	{
		const adapter = deps.networkAdapter ?? createNetworkStub();
		const jsonPayloadLimit = deps.isolateJsonPayloadLimitBytes;

		// Reference for fetch - returns JSON string for transfer
		const networkFetchRef = new ivm.Reference(
			(url: string, optionsJson: string): Promise<string> => {
				checkBridgeBudget(deps);
				const options = parseJsonWithLimit<{
					method?: string;
					headers?: Record<string, string>;
					body?: string | null;
				}>("network.fetch options", optionsJson, jsonPayloadLimit);
				return adapter
					.fetch(url, options)
					.then((result) => {
						const json = JSON.stringify(result);
						assertTextPayloadSize("network.fetch response", json, jsonPayloadLimit);
						return json;
					});
			},
		);

		// Reference for DNS lookup - returns JSON string for transfer
		const networkDnsLookupRef = new ivm.Reference(
			async (hostname: string): Promise<string> => {
				checkBridgeBudget(deps);
				const result = await adapter.dnsLookup(hostname);
				return JSON.stringify(result);
			},
		);

		// Reference for HTTP request - returns JSON string for transfer
		const networkHttpRequestRef = new ivm.Reference(
			(url: string, optionsJson: string): Promise<string> => {
				checkBridgeBudget(deps);
				const options = parseJsonWithLimit<{
					method?: string;
					headers?: Record<string, string>;
					body?: string | null;
				}>("network.httpRequest options", optionsJson, jsonPayloadLimit);
				return adapter
					.httpRequest(url, options)
					.then((result) => {
						const json = JSON.stringify(result);
						assertTextPayloadSize("network.httpRequest response", json, jsonPayloadLimit);
						return json;
					});
			},
		);

		// Track server IDs created in this context for ownership validation
		const ownedHttpServers = new Set<number>();

		// Lazy dispatcher reference for in-sandbox HTTP server callbacks
		let httpServerDispatchRef: ivm.Reference<
			(serverId: number, requestJson: string) => Promise<string>
		> | null = null;

		const getHttpServerDispatchRef = () => {
			if (!httpServerDispatchRef) {
				httpServerDispatchRef = context.global.getSync(
					RUNTIME_BRIDGE_GLOBAL_KEYS.httpServerDispatch,
					{
						reference: true,
					},
				) as ivm.Reference<
					(serverId: number, requestJson: string) => Promise<string>
				>;
			}
			return httpServerDispatchRef!;
		};

		// Reference for starting an in-sandbox HTTP server
		const networkHttpServerListenRef = new ivm.Reference(
			(optionsJson: string): Promise<string> => {
				if (!adapter.httpServerListen) {
					throw new Error(
						"http.createServer requires NetworkAdapter.httpServerListen support",
					);
				}

				const options = parseJsonWithLimit<{
					serverId: number;
					port?: number;
					hostname?: string;
				}>("network.httpServer.listen options", optionsJson, jsonPayloadLimit);

				return (async () => {
					const result = await adapter.httpServerListen!({
						serverId: options.serverId,
						port: options.port,
						hostname: options.hostname,
						onRequest: async (request) => {
							const requestJson = JSON.stringify(request);

							const responseJson = await getHttpServerDispatchRef().apply(
								undefined,
								[options.serverId, requestJson],
								{ result: { promise: true } },
							);
							return parseJsonWithLimit<{
								status: number;
								headers?: Array<[string, string]>;
								body?: string;
								bodyEncoding?: "utf8" | "base64";
							}>("network.httpServer response", String(responseJson), jsonPayloadLimit);
						},
					});
					ownedHttpServers.add(options.serverId);
					deps.activeHttpServerIds.add(options.serverId);
					return JSON.stringify(result);
				})();
			},
		);

		// Reference for closing an in-sandbox HTTP server
		const networkHttpServerCloseRef = new ivm.Reference(
			(serverId: number): Promise<void> => {
				if (!adapter.httpServerClose) {
					throw new Error(
						"http.createServer close requires NetworkAdapter.httpServerClose support",
					);
				}
				// Ownership check: only allow closing servers created in this context
				if (!ownedHttpServers.has(serverId)) {
					throw new Error(
						`Cannot close server ${serverId}: not owned by this execution context`,
					);
				}
				return adapter.httpServerClose(serverId).then(() => {
					ownedHttpServers.delete(serverId);
					deps.activeHttpServerIds.delete(serverId);
				});
			},
		);

		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.networkFetchRaw, networkFetchRef);
		await jail.set(
			HOST_BRIDGE_GLOBAL_KEYS.networkDnsLookupRaw,
			networkDnsLookupRef,
		);
		await jail.set(
			HOST_BRIDGE_GLOBAL_KEYS.networkHttpRequestRaw,
			networkHttpRequestRef,
		);
		await jail.set(
			HOST_BRIDGE_GLOBAL_KEYS.networkHttpServerListenRaw,
			networkHttpServerListenRef,
		);
		await jail.set(
			HOST_BRIDGE_GLOBAL_KEYS.networkHttpServerCloseRaw,
			networkHttpServerCloseRef,
		);
	}

	// Install isolate-global descriptor helpers before runtime bootstrap scripts.
	await context.eval(getIsolateRuntimeSource("globalExposureHelpers"));

	// Set up globals needed by the bridge BEFORE loading it.
	const initialCwd = deps.processConfig.cwd ?? "/";
	await jail.set(
		"__runtimeBridgeSetupConfig",
		{
			initialCwd,
			jsonPayloadLimitBytes: deps.isolateJsonPayloadLimitBytes,
			payloadLimitErrorCode: PAYLOAD_LIMIT_ERROR_CODE,
		},
		{ copy: true },
	);
	await context.eval(getInitialBridgeGlobalsSetupCode());

	// Load the bridge bundle which sets up all polyfill modules.
	await jail.set(
		HOST_BRIDGE_GLOBAL_KEYS.processConfig,
		createProcessConfigForExecution(deps.processConfig, timingMitigation, frozenTimeMs),
		{ copy: true },
	);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.osConfig, deps.osConfig, {
		copy: true,
	});
	await context.eval(getRawBridgeCode());
	await context.eval(getBridgeAttachCode());
	await applyTimingMitigation(context, timingMitigation, frozenTimeMs);

	// Set up the require system with dynamic CommonJS resolution
	await context.eval(getRequireSetupCode());
	// module and process are already initialized by the bridge
}

/**
 * Set up ESM-compatible globals (process, Buffer, etc.)
 */
export async function setupESMGlobals(
	deps: BridgeDeps,
	context: ivm.Context,
	jail: ivm.Reference<Record<string, unknown>>,
	timingMitigation: TimingMitigation,
	frozenTimeMs: number,
): Promise<void> {
	await setupRequire(deps, context, jail, timingMitigation, frozenTimeMs);
}

export function createProcessConfigForExecution(
	processConfig: ProcessConfig,
	timingMitigation: TimingMitigation,
	frozenTimeMs: number,
): ProcessConfig {
	return {
		...processConfig,
		timingMitigation,
		frozenTimeMs: timingMitigation === "freeze" ? frozenTimeMs : undefined,
	};
}

async function applyTimingMitigation(
	context: ivm.Context,
	timingMitigation: TimingMitigation,
	frozenTimeMs: number,
): Promise<void> {
	if (timingMitigation !== "freeze") {
		await context.eval(getIsolateRuntimeSource("applyTimingMitigationOff"));
		return;
	}

	await context.global.set(
		"__runtimeTimingMitigationConfig",
		{ frozenTimeMs },
		{ copy: true },
	);
	await context.eval(getIsolateRuntimeSource("applyTimingMitigationFreeze"));
}
