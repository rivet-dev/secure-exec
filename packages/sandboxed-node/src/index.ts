import ivm from "isolated-vm";
import { getBridgeWithConfig } from "./bridge-loader.js";
import { exists, mkdir, readDirWithTypes, rename, stat } from "./fs-helpers.js";
import { loadFile, resolveModule } from "./package-bundler.js";
import { bundlePolyfill, hasPolyfill } from "./polyfills.js";
import { createNodeDriver } from "./node/driver.js";
import {
	createCommandExecutorStub,
	createFsStub,
	createNetworkStub,
	filterEnv,
	wrapCommandExecutor,
	wrapFileSystem,
	wrapNetworkAdapter,
} from "./shared/permissions.js";
import {
	extractDynamicImportSpecifiers,
	isESM,
	transformDynamicImport,
	wrapCJSForESM,
} from "./shared/esm-utils.js";
import { getRequireSetupCode } from "./shared/require-setup.js";
import type {
	CommandExecutor,
	NetworkAdapter,
	Permissions,
	SandboxDriver,
	VirtualFileSystem,
} from "./types.js";
import type {
	ExecOptions,
	ExecResult,
	OSConfig,
	ProcessConfig,
	RunResult,
} from "./shared/api-types.js";

// Re-export types
export type {
	CommandExecutor,
	NetworkAdapter,
	Permissions,
	SandboxDriver,
	VirtualFileSystem,
} from "./types.js";
export type { DirEntry, StatInfo } from "./fs-helpers.js";
export type {
	ExecOptions,
	ExecResult,
	OSConfig,
	ProcessConfig,
	RunResult,
} from "./shared/api-types.js";
export {
	createDefaultNetworkAdapter,
	createNodeDriver,
	NodeFileSystem,
} from "./node/driver.js";
export { createInMemoryFileSystem } from "./shared/in-memory-fs.js";

// Config types for process and os modules


export interface NodeProcessOptions {
	memoryLimit?: number; // MB, default 128
	driver?: SandboxDriver; // Preferred system driver
	permissions?: Permissions; // Applied when creating default driver
	filesystem?: VirtualFileSystem; // For accessing virtual filesystem
	processConfig?: ProcessConfig; // Process object configuration
	commandExecutor?: CommandExecutor; // For child_process support
	networkAdapter?: NetworkAdapter; // For network support (fetch, http, https, dns)
	osConfig?: OSConfig; // OS module configuration
}

// Cache of bundled polyfills
const polyfillCodeCache: Map<string, string> = new Map();

export class NodeProcess {
	private isolate: ivm.Isolate;
	private memoryLimit: number;
	private filesystem?: VirtualFileSystem;
	private processConfig: ProcessConfig;
	private commandExecutor?: CommandExecutor;
	private networkAdapter?: NetworkAdapter;
	private osConfig: OSConfig;
	private permissions?: Permissions;
	private filesystemEnabled: boolean = false;
	private commandExecutorEnabled: boolean = false;
	private networkEnabled: boolean = false;
	// Cache for compiled ESM modules (per isolate)
	private esmModuleCache: Map<string, ivm.Module> = new Map();

	constructor(options: NodeProcessOptions = {}) {
		this.memoryLimit = options.memoryLimit ?? 128;
		this.isolate = new ivm.Isolate({ memoryLimit: this.memoryLimit });
		const driver =
			options.driver ??
			createNodeDriver({
				filesystem: options.filesystem,
				networkAdapter: options.networkAdapter,
				commandExecutor: options.commandExecutor,
				permissions: options.permissions,
			});
		const permissions = driver.permissions ?? options.permissions;
		this.permissions = permissions;
		this.filesystemEnabled = Boolean(driver.filesystem);
		this.commandExecutorEnabled = Boolean(driver.commandExecutor);
		this.networkEnabled = Boolean(driver.network);
		this.filesystem = driver.filesystem
			? wrapFileSystem(driver.filesystem, permissions)
			: createFsStub();
		this.commandExecutor = driver.commandExecutor
			? wrapCommandExecutor(driver.commandExecutor, permissions)
			: createCommandExecutorStub();
		this.networkAdapter = driver.network
			? wrapNetworkAdapter(driver.network, permissions)
			: createNetworkStub();
		const processConfig = options.processConfig ?? {};
		processConfig.env = filterEnv(processConfig.env, permissions);
		this.processConfig = processConfig;
		this.osConfig = options.osConfig ?? {};
	}

	/**
	 * Set the command executor for child_process support
	 */
	setCommandExecutor(executor: CommandExecutor): void {
		this.commandExecutorEnabled = true;
		this.commandExecutor = wrapCommandExecutor(executor, this.permissions);
	}

	/**
	 * Set the network adapter for fetch/http/https/dns support
	 */
	setNetworkAdapter(adapter: NetworkAdapter): void {
		this.networkEnabled = true;
		this.networkAdapter = wrapNetworkAdapter(adapter, this.permissions);
	}

	/**
	 * Set the filesystem for file access
	 */
	setFilesystem(filesystem: VirtualFileSystem): void {
		this.filesystemEnabled = true;
		this.filesystem = wrapFileSystem(filesystem, this.permissions);
	}

	/**
	 * Resolve a module specifier to an absolute path
	 */
	private async resolveESMPath(
		specifier: string,
		referrerPath: string,
	): Promise<string | null> {
		// Handle node: prefix for built-ins
		if (specifier.startsWith("node:")) {
			return specifier; // Keep as-is for built-in handling
		}

		// Handle bare module names that are polyfills (events, path, etc.)
		const moduleName = specifier.replace(/^node:/, "");
		// Special modules we provide via bridge
		const bridgeModules = [
			"fs",
			"fs/promises",
			"module",
			"os",
			"http",
			"https",
			"dns",
			"child_process",
			"process",
			"@hono/node-server",
		];
		if (hasPolyfill(moduleName) || bridgeModules.includes(moduleName)) {
			return specifier; // Return as-is, compileESMModule will handle it
		}

		// Handle absolute paths - return as-is
		if (specifier.startsWith("/")) {
			return specifier;
		}

		// Get directory of referrer
		const referrerDir = referrerPath.includes("/")
			? referrerPath.substring(0, referrerPath.lastIndexOf("/")) || "/"
			: "/";

		// Handle relative paths
		if (specifier.startsWith("./") || specifier.startsWith("../")) {
			// Resolve relative to referrer directory
			const parts = referrerDir.split("/").filter(Boolean);
			const specParts = specifier.split("/");

			for (const part of specParts) {
				if (part === "..") {
					parts.pop();
				} else if (part !== ".") {
					parts.push(part);
				}
			}

			return `/${parts.join("/")}`;
		}

		// Bare specifier - try to resolve from node_modules
		if (!this.filesystemEnabled || !this.filesystem) {
			return null;
		}

		return resolveModule(specifier, referrerDir, this.filesystem, "import");
	}

	/**
	 * Load and compile an ESM module, handling both ESM and CJS sources
	 */
	private async compileESMModule(
		filePath: string,
		_context: ivm.Context,
	): Promise<ivm.Module> {
		// Check cache first
		const cached = this.esmModuleCache.get(filePath);
		if (cached) {
			return cached;
		}

		let code: string;

		// Handle built-in modules (node: prefix or known polyfills)
		const moduleName = filePath.replace(/^node:/, "");

		// Special handling for modules we provide via bridge
		const specialModules = [
			"fs",
			"fs/promises",
			"module",
			"os",
			"http",
			"https",
			"dns",
			"child_process",
			"process",
			"@hono/node-server",
		];
		const isSpecialModule = specialModules.includes(moduleName);

		if (
			filePath.startsWith("node:") ||
			hasPolyfill(moduleName) ||
			isSpecialModule
		) {
			// Special case for fs
			if (moduleName === "fs") {
				code = `
          const _fs = globalThis.bridge?.fs || globalThis.bridge?.default || {};
          export default _fs;
        `;
			} else if (moduleName === "fs/promises") {
				code = `
          const _fs = globalThis.bridge?.fs || globalThis.bridge?.default || {};
          const _promises = _fs && _fs.promises ? _fs.promises : {};
          export default _promises;
        `;
			} else if (moduleName === "module") {
				// Module polyfill from bridge - provides createRequire, Module class, etc.
				code = `
          const _modulePolyfill = globalThis.bridge?.module || {
            createRequire: globalThis._createRequire || function(f) {
              const dir = f.replace(/\\/[^\\/]*$/, '') || '/';
              return function(m) { return globalThis._requireFrom(m, dir); };
            },
            Module: { builtinModules: [] },
            isBuiltin: () => false,
            builtinModules: []
          };
          export default _modulePolyfill;
          export const createRequire = _modulePolyfill.createRequire;
          export const Module = _modulePolyfill.Module;
          export const isBuiltin = _modulePolyfill.isBuiltin;
          export const builtinModules = _modulePolyfill.builtinModules;
          export const SourceMap = _modulePolyfill.SourceMap;
          export const syncBuiltinESMExports = _modulePolyfill.syncBuiltinESMExports || (() => {});
        `;
			} else if (moduleName === "os") {
				// OS polyfill from bridge
				code = `
          const _osPolyfill = globalThis.bridge?.os || {};
          export default _osPolyfill;
        `;
			} else if (moduleName === "http") {
				code = `
          const _http = globalThis._httpModule || globalThis.bridge?.network?.http || {};
          export default _http;
        `;
			} else if (moduleName === "https") {
				code = `
          const _https = globalThis._httpsModule || globalThis.bridge?.network?.https || {};
          export default _https;
        `;
			} else if (moduleName === "dns") {
				code = `
          const _dns = globalThis._dnsModule || globalThis.bridge?.network?.dns || {};
          export default _dns;
        `;
			} else if (moduleName === "child_process") {
				code = `
          const _cp = globalThis._childProcessModule || globalThis.bridge?.childProcess || {};
          export default _cp;
        `;
			} else if (moduleName === "process") {
				code = `
          const _proc = globalThis.process || {};
          export default _proc;
        `;
			} else if (moduleName === "@hono/node-server") {
				code = `
          const _honoNodeServer = globalThis._honoNodeServerModule || globalThis.bridge?.honoNodeServer || {};
          export default _honoNodeServer;
          export const serve = _honoNodeServer.serve;
          export const createAdaptorServer = _honoNodeServer.createAdaptorServer;
          export const getRequestListener = _honoNodeServer.getRequestListener;
          export const RequestError = _honoNodeServer.RequestError;
        `;
			} else {
				// Get polyfill code and wrap for ESM
				let polyfillCode = polyfillCodeCache.get(moduleName);
				if (!polyfillCode) {
					polyfillCode = await bundlePolyfill(moduleName);
					polyfillCodeCache.set(moduleName, polyfillCode);
				}
				// Polyfills are IIFE that return the module, wrap for ESM
				code = `
          const _polyfillResult = ${polyfillCode};
          export default _polyfillResult;
          // Re-export all properties for named imports
          const _keys = typeof _polyfillResult === 'object' && _polyfillResult !== null
            ? Object.keys(_polyfillResult) : [];
          export { _keys as __polyfillKeys };
        `;
			}
		} else {
			// Load from filesystem
			if (!this.filesystemEnabled || !this.filesystem) {
				throw new Error("VirtualFileSystem required for loading modules");
			}
			const source = await loadFile(filePath, this.filesystem);
			if (source === null) {
				throw new Error(`Cannot load module: ${filePath}`);
			}

			// Handle JSON files
			if (filePath.endsWith(".json")) {
				code = `export default ${source};`;
			} else if (!isESM(source, filePath)) {
				// CJS module - wrap it for ESM compatibility
				code = wrapCJSForESM(source);
			} else {
				code = source;
			}
		}

		// Compile the module
		const module = await this.isolate.compileModule(code, {
			filename: filePath,
		});

		// Cache it
		this.esmModuleCache.set(filePath, module);

		return module;
	}

	/**
	 * Create the ESM resolver callback for module.instantiate()
	 */
	private createESMResolver(
		context: ivm.Context,
	): (specifier: string, referrer: ivm.Module) => Promise<ivm.Module> {
		return async (specifier: string, referrer: ivm.Module) => {
			// Get the referrer's filename from our cache (reverse lookup)
			let referrerPath = "/";
			for (const [path, mod] of this.esmModuleCache.entries()) {
				if (mod === referrer) {
					referrerPath = path;
					break;
				}
			}

			// Resolve the specifier
			const resolved = await this.resolveESMPath(specifier, referrerPath);
			if (!resolved) {
				throw new Error(
					`Cannot resolve module '${specifier}' from '${referrerPath}'`,
				);
			}

			// Compile and return the module
			const module = await this.compileESMModule(resolved, context);

			return module;
		};
	}

	/**
	 * Run ESM code
	 */
	private async runESM(
		code: string,
		context: ivm.Context,
		filePath: string = "/<entry>.mjs",
	): Promise<unknown> {
		// Compile the entry module
		const entryModule = await this.isolate.compileModule(code, {
			filename: filePath,
		});
		this.esmModuleCache.set(filePath, entryModule);

		// Instantiate with resolver (this resolves all dependencies)
		await entryModule.instantiate(context, this.createESMResolver(context));

		// Evaluate and return
		return entryModule.evaluate({ promise: true });
	}

	// Cache for pre-compiled dynamic import modules (namespace references)
	private dynamicImportCache = new Map<string, ivm.Reference<unknown>>();

	/**
	 * Pre-compile all static dynamic import specifiers found in the code
	 * This must be called BEFORE running the code to avoid deadlocks
	 */
	private async precompileDynamicImports(
		transformedCode: string,
		context: ivm.Context,
		referrerPath: string = "/",
	): Promise<void> {
		const specifiers = extractDynamicImportSpecifiers(transformedCode);

		for (const specifier of specifiers) {
			// Resolve the module path
			const resolved = await this.resolveESMPath(specifier, referrerPath);
			if (!resolved) {
				continue; // Skip unresolvable modules, error will be thrown at runtime
			}

			// Check if already compiled
			if (this.dynamicImportCache.has(resolved)) {
				continue;
			}

			// Compile the module
			const module = await this.compileESMModule(resolved, context);

			// Instantiate
			try {
				await module.instantiate(context, this.createESMResolver(context));
			} catch {
				// Already instantiated
			}

			// Evaluate
			await module.evaluate();

			// Cache the namespace reference
			this.dynamicImportCache.set(resolved, module.namespace);

			// Also cache by original specifier for direct lookup
			if (resolved !== specifier) {
				this.dynamicImportCache.set(specifier, module.namespace);
			}
		}
	}

	/**
	 * Set up dynamic import() function for ESM
	 * Note: precompileDynamicImports must be called BEFORE running user code
	 * Falls back to require() for CommonJS modules when not pre-compiled
	 */
	private async setupDynamicImport(
		context: ivm.Context,
		jail: ivm.Reference<Record<string, unknown>>,
	): Promise<void> {
		// Create a SYNCHRONOUS reference for dynamic imports (returns from cache or null if not found)
		const dynamicImportRef = new ivm.Reference((specifier: string) => {
			// Check the cache - look up both by specifier and resolved path
			const ns = this.dynamicImportCache.get(specifier);
			if (!ns) {
				// Return null to signal fallback to require()
				return null;
			}
			return ns.derefInto();
		});

		await jail.set("_dynamicImport", dynamicImportRef);

		// Create the __dynamicImport function in the isolate
		// First tries ESM cache, then falls back to require()
		await context.eval(`
      globalThis.__dynamicImport = function(specifier) {
        // Try the ESM cache first
        const cached = _dynamicImport.applySync(undefined, [specifier]);
        if (cached !== null) {
          return Promise.resolve(cached);
        }
        // Fall back to require() for CommonJS modules
        try {
          const mod = require(specifier);
          // Wrap in ESM-like namespace object with default export
          return Promise.resolve({ default: mod, ...mod });
        } catch (e) {
          return Promise.reject(new Error(
            'Cannot dynamically import \\'' + specifier + '\\': ' + e.message
          ));
        }
      };
    `);
	}

	/**
	 * Set up the require() system in a context
	 */
	private async setupRequire(
		context: ivm.Context,
		jail: ivm.Reference<Record<string, unknown>>,
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
				if (name === "http" || name === "https" || name === "dns") {
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

				// @hono/node-server is provided by bridge
				if (name === "@hono/node-server") {
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
				if (!this.filesystemEnabled || !this.filesystem) {
					return null;
				}
				return resolveModule(request, fromDir, this.filesystem);
			},
		);

		// Create a reference for loading file content
		// Also transforms dynamic import() calls to __dynamicImport()
		const loadFileRef = new ivm.Reference(
			async (path: string): Promise<string | null> => {
				if (!this.filesystemEnabled || !this.filesystem) {
					return null;
				}
				const source = await loadFile(path, this.filesystem);
				if (source === null) {
					return null;
				}
				// Transform dynamic import() to __dynamicImport() for V8 compatibility
				return transformDynamicImport(source);
			},
		);

		await jail.set("_loadPolyfill", loadPolyfillRef);
		await jail.set("_resolveModule", resolveModuleRef);
		await jail.set("_loadFile", loadFileRef);

		// Set up timer Reference for actual delays (not just microtasks)
		// This allows setTimeout/setInterval to use real host-side timers
		const scheduleTimerRef = new ivm.Reference((delayMs: number) => {
			return new Promise<void>((resolve) => {
				// Use real host setTimeout with actual delay
				globalThis.setTimeout(resolve, delayMs);
			});
		});
		await jail.set("_scheduleTimer", scheduleTimerRef);

		// Set up fs References (stubbed if filesystem is disabled)
		{
			const fs = this.filesystem ?? createFsStub();

			// Create individual References for each fs operation
			const readFileRef = new ivm.Reference(async (path: string) => {
				return fs.readTextFile(path);
			});
			const writeFileRef = new ivm.Reference(
				async (path: string, content: string) => {
					await fs.writeFile(path, content);
				},
			);
			// Binary file operations using base64 encoding
			const readFileBinaryRef = new ivm.Reference(async (path: string) => {
				const data = await fs.readFile(path);
				// Convert to base64 for transfer across isolate boundary
				return Buffer.from(data).toString("base64");
			});
			const writeFileBinaryRef = new ivm.Reference(
				async (path: string, base64Content: string) => {
					// Decode base64 and write as binary
					const data = Buffer.from(base64Content, "base64");
					await fs.writeFile(path, data);
				},
			);
			const readDirRef = new ivm.Reference(async (path: string) => {
				const entries = await readDirWithTypes(fs, path);
				// Return as JSON string for transfer
				return JSON.stringify(entries);
			});
			const mkdirRef = new ivm.Reference(async (path: string) => {
				await mkdir(fs, path);
			});
			const rmdirRef = new ivm.Reference(async (path: string) => {
				await fs.removeDir(path);
			});
			const existsRef = new ivm.Reference(async (path: string) => {
				return exists(fs, path);
			});
			const statRef = new ivm.Reference(async (path: string) => {
				const statInfo = await stat(fs, path);
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
				await fs.removeFile(path);
			});
			const renameRef = new ivm.Reference(
				async (oldPath: string, newPath: string) => {
					await rename(fs, oldPath, newPath);
				},
			);

			// Set up each fs Reference individually in the isolate
			await jail.set("_fsReadFile", readFileRef);
			await jail.set("_fsWriteFile", writeFileRef);
			await jail.set("_fsReadFileBinary", readFileBinaryRef);
			await jail.set("_fsWriteFileBinary", writeFileBinaryRef);
			await jail.set("_fsReadDir", readDirRef);
			await jail.set("_fsMkdir", mkdirRef);
			await jail.set("_fsRmdir", rmdirRef);
			await jail.set("_fsExists", existsRef);
			await jail.set("_fsStat", statRef);
			await jail.set("_fsUnlink", unlinkRef);
			await jail.set("_fsRename", renameRef);

			// Create the _fs object inside the isolate
			await context.eval(`
        globalThis._fs = {
          readFile: _fsReadFile,
          writeFile: _fsWriteFile,
          readFileBinary: _fsReadFileBinary,
          writeFileBinary: _fsWriteFileBinary,
          readDir: _fsReadDir,
          mkdir: _fsMkdir,
          rmdir: _fsRmdir,
          exists: _fsExists,
          stat: _fsStat,
          unlink: _fsUnlink,
          rename: _fsRename,
        };
      `);
		}

		// Set up child_process References (stubbed when disabled)
		{
			const executor = this.commandExecutor ?? createCommandExecutorStub();
			let nextSessionId = 1;
			const sessions = new Map<number, SpawnedProcess>();

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
					dispatchRef = context.global.getSync("_childProcessDispatch", {
						reference: true,
					}) as ivm.Reference<
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
					const args = JSON.parse(argsJson) as string[];
					const options = JSON.parse(optionsJson) as {
						cwd?: string;
						env?: Record<string, string>;
					};
					const sessionId = nextSessionId++;

					const proc = executor.spawn(command, args, {
						cwd: options.cwd,
						env: options.env,
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
					const args = JSON.parse(argsJson) as string[];
					const options = JSON.parse(optionsJson) as {
						cwd?: string;
						env?: Record<string, string>;
					};

					// Collect stdout/stderr
					const stdoutChunks: Uint8Array[] = [];
					const stderrChunks: Uint8Array[] = [];

					const proc = executor.spawn(command, args, {
						cwd: options.cwd,
						env: options.env,
						onStdout: (data) => {
							stdoutChunks.push(data);
						},
						onStderr: (data) => {
							stderrChunks.push(data);
						},
					});

					// Wait for process to exit
					const exitCode = await proc.wait();

					// Combine chunks into strings
					const decoder = new TextDecoder();
					const stdout = stdoutChunks
						.map((c) => decoder.decode(c))
						.join("");
					const stderr = stderrChunks
						.map((c) => decoder.decode(c))
						.join("");

					return JSON.stringify({ stdout, stderr, code: exitCode });
				},
			);

			await jail.set("_childProcessSpawnStart", spawnStartRef);
			await jail.set("_childProcessStdinWrite", stdinWriteRef);
			await jail.set("_childProcessStdinClose", stdinCloseRef);
			await jail.set("_childProcessKill", killRef);
			await jail.set("_childProcessSpawnSync", spawnSyncRef);
		}

		// Set up network References (stubbed when disabled)
		{
			const adapter = this.networkAdapter ?? createNetworkStub();

			// Reference for fetch - returns JSON string for transfer
			const networkFetchRef = new ivm.Reference(
				async (url: string, optionsJson: string): Promise<string> => {
					const options = JSON.parse(optionsJson);
					const result = await adapter.fetch(url, options);
					return JSON.stringify(result);
				},
			);

			// Reference for DNS lookup - returns JSON string for transfer
			const networkDnsLookupRef = new ivm.Reference(
				async (hostname: string): Promise<string> => {
					const result = await adapter.dnsLookup(hostname);
					return JSON.stringify(result);
				},
			);

			// Reference for HTTP request - returns JSON string for transfer
			const networkHttpRequestRef = new ivm.Reference(
				async (url: string, optionsJson: string): Promise<string> => {
					const options = JSON.parse(optionsJson);
					const result = await adapter.httpRequest(url, options);
					return JSON.stringify(result);
				},
			);

			// Lazy dispatcher reference for @hono/node-server fetch callbacks
			let honoDispatchRef: ivm.Reference<
				(
					handlerId: number,
					requestJson: string,
				) => Promise<string>
			> | null = null;

			const getHonoDispatchRef = () => {
				if (!honoDispatchRef) {
					honoDispatchRef = context.global.getSync("_honoNodeServerDispatch", {
						reference: true,
					}) as ivm.Reference<
						(
							handlerId: number,
							requestJson: string,
						) => Promise<string>
					>;
				}
				return honoDispatchRef!;
			};

			// Reference for starting a @hono/node-server server
			const networkHonoServeRef = new ivm.Reference(
				async (optionsJson: string): Promise<string> => {
					if (!adapter.honoServe) {
						throw new Error(
							"@hono/node-server requires NetworkAdapter.honoServe support",
						);
					}

					const options = JSON.parse(optionsJson) as {
						handlerId: number;
						port?: number;
						hostname?: string;
					};

					const result = await adapter.honoServe({
						port: options.port,
						hostname: options.hostname,
						fetch: async (request: Request): Promise<Response> => {
							const headers = Array.from(request.headers.entries());
							const method = request.method || "GET";
							const body =
								method === "GET" || method === "HEAD"
									? undefined
									: await request.text();

							const requestJson = JSON.stringify({
								url: request.url,
								method,
								headers,
								body,
							});

							const responseJson = await getHonoDispatchRef().apply(
								undefined,
								[options.handlerId, requestJson],
								{ result: { promise: true } },
							);

							const response = JSON.parse(responseJson) as {
								status: number;
								headers?: Array<[string, string]>;
								body?: string;
							};

							return new Response(response.body ?? "", {
								status: response.status ?? 200,
								headers: response.headers ?? [],
							});
						},
					});

					return JSON.stringify(result);
				},
			);

			// Reference for closing a @hono/node-server server
			const networkHonoCloseRef = new ivm.Reference(
				async (serverId: number): Promise<void> => {
					if (!adapter.honoClose) {
						throw new Error(
							"@hono/node-server close requires NetworkAdapter.honoClose support",
						);
					}
					await adapter.honoClose(serverId);
				},
			);

			await jail.set("_networkFetchRaw", networkFetchRef);
			await jail.set("_networkDnsLookupRaw", networkDnsLookupRef);
			await jail.set("_networkHttpRequestRaw", networkHttpRequestRef);
			await jail.set("_networkHonoServeRaw", networkHonoServeRef);
			await jail.set("_networkHonoCloseRaw", networkHonoCloseRef);
		}

		// Set up globals needed by the bridge BEFORE loading it
		const initialCwd = this.processConfig.cwd ?? "/";
		await context.eval(`
      globalThis._moduleCache = {};
      globalThis._pendingModules = {};
      globalThis._currentModule = { dirname: ${JSON.stringify(initialCwd)} };
    `);

		// Load the bridge bundle which sets up all polyfill modules
		const bridgeCode = getBridgeWithConfig(this.processConfig, this.osConfig);
		await context.eval(bridgeCode);

		// Store the fs module code for use in require (avoid re-evaluating the bridge)
		await jail.set(
			"_fsModuleCode",
			"(function() { return globalThis.bridge?.fs || globalThis.bridge?.default || {}; })()",
		);

		// Set up the require system with dynamic CommonJS resolution
		await context.eval(getRequireSetupCode());
		// module and process are already initialized by the bridge
	}

	/**
	 * Set up ESM-compatible globals (process, Buffer, etc.)
	 */
	private async setupESMGlobals(
		context: ivm.Context,
		jail: ivm.Reference<Record<string, unknown>>,
	): Promise<void> {
		await this.setupRequire(context, jail);
	}

	/**
	 * Run code and return the value of module.exports (CJS) or default export (ESM)
	 * along with exit code and captured stdout/stderr
	 */
	async run<T = unknown>(
		code: string,
		filePath?: string,
	): Promise<RunResult<T>> {
		// Clear caches for fresh run
		this.esmModuleCache.clear();
		this.dynamicImportCache.clear();

		const context = await this.isolate.createContext();
		const stdout: string[] = [];
		const stderr: string[] = [];

		try {
			const jail = context.global;
			await jail.set("global", jail.derefInto());

			// Set up console capture
			await this.setupConsole(context, jail, stdout, stderr);

			let exports: T;

			// Detect ESM vs CJS
			if (isESM(code, filePath)) {
				// ESM path
				await this.setupESMGlobals(context, jail);

				// Transform dynamic import() to __dynamicImport()
				const transformedCode = transformDynamicImport(code);

				// Pre-compile all dynamic imports
				await this.precompileDynamicImports(transformedCode, context);

				// Set up dynamic import function
				await this.setupDynamicImport(context, jail);

				exports = (await this.runESM(transformedCode, context, filePath)) as T;
			} else {
				// CJS path (existing behavior)
				await this.setupRequire(context, jail);

				// Create module object
				const moduleObj = await this.isolate.compileScript(
					"globalThis.module = { exports: {} };",
				);
				await moduleObj.run(context);

				// Transform dynamic import() to __dynamicImport()
				const transformedCode = transformDynamicImport(code);

				// Pre-compile all dynamic imports
				await this.precompileDynamicImports(transformedCode, context);

				// Set up dynamic import function
				await this.setupDynamicImport(context, jail);

				// Run user code
				const script = await this.isolate.compileScript(transformedCode);
				await script.run(context);

				// Get module.exports
				exports = (await context.eval("module.exports", { copy: true })) as T;
			}

			// Wait for any active handles (child processes, etc.) to complete
			// See: packages/sandboxed-node/docs/ACTIVE_HANDLES.md
			await context.eval(
				'typeof _waitForActiveHandles === "function" ? _waitForActiveHandles() : Promise.resolve()',
				{ promise: true },
			);

			// Get exit code from process.exitCode if set
			const exitCode = (await context.eval("process.exitCode || 0", {
				copy: true,
			})) as number;

			return {
				stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
				stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
				code: exitCode,
				exports,
			};
		} catch (err) {
			// Check if this is a ProcessExitError (controlled exit)
			const errMessage = err instanceof Error ? err.message : String(err);

			// ProcessExitError format: "process.exit(N)"
			const exitMatch = errMessage.match(/process\.exit\((\d+)\)/);
			if (exitMatch) {
				const exitCode = parseInt(exitMatch[1], 10);
				return {
					stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
					stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
					code: exitCode,
					exports: undefined as T,
				};
			}

			stderr.push(errMessage);
			return {
				stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
				stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
				code: 1,
				exports: undefined as T,
			};
		} finally {
			context.release();
		}
	}

	/**
	 * Set up console with output capture
	 */
	private async setupConsole(
		context: ivm.Context,
		jail: ivm.Reference<Record<string, unknown>>,
		stdout: string[],
		stderr: string[],
	): Promise<void> {
		const logRef = new ivm.Reference((msg: string) => {
			stdout.push(String(msg));
		});
		const errorRef = new ivm.Reference((msg: string) => {
			stderr.push(String(msg));
		});

		await jail.set("_log", logRef);
		await jail.set("_error", errorRef);

		await context.eval(`
      globalThis.console = {
        log: (...args) => _log.applySync(undefined, [args.map(a =>
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ')]),
        error: (...args) => _error.applySync(undefined, [args.map(a =>
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ')]),
        warn: (...args) => _error.applySync(undefined, [args.map(a =>
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ')]),
        info: (...args) => _log.applySync(undefined, [args.map(a =>
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ')]),
      };
    `);
	}

	/**
	 * Execute code like a script with console output capture
	 * Supports both CJS and ESM syntax
	 */
	async exec(code: string, options?: ExecOptions): Promise<ExecResult> {
		const { filePath, env, cwd, stdin } = options ?? {};

		// Clear caches for fresh run
		this.esmModuleCache.clear();
		this.dynamicImportCache.clear();

		const context = await this.isolate.createContext();
		const stdout: string[] = [];
		const stderr: string[] = [];

		try {
			const jail = context.global;
			await jail.set("global", jail.derefInto());

			// Set up console capture
			await this.setupConsole(context, jail, stdout, stderr);

			// Detect ESM vs CJS
			if (isESM(code, filePath)) {
				// ESM path
				await this.setupESMGlobals(context, jail);

				// Override process.env and process.cwd if provided
				if (env || cwd) {
					await this.overrideProcessConfig(context, env, cwd);
				}

				// Set stdin data if provided
				if (stdin !== undefined) {
					await this.setStdinData(context, stdin);
				}

				// Transform dynamic import() to __dynamicImport()
				const transformedCode = transformDynamicImport(code);

				// Pre-compile all dynamic imports
				await this.precompileDynamicImports(transformedCode, context);

				// Set up dynamic import function
				await this.setupDynamicImport(context, jail);

				await this.runESM(transformedCode, context, filePath);
			} else {
				// CJS path
				await this.setupRequire(context, jail);
				await context.eval("globalThis.module = { exports: {} };");

				// Override process.env and process.cwd if provided
				if (env || cwd) {
					await this.overrideProcessConfig(context, env, cwd);
				}

				// Set stdin data if provided
				if (stdin !== undefined) {
					await this.setStdinData(context, stdin);
				}

				// Set up __filename and __dirname if a file path is provided
				// This is critical for relative require() calls to work correctly
				if (filePath) {
					const dirname = filePath.includes("/")
						? filePath.substring(0, filePath.lastIndexOf("/")) || "/"
						: "/";
					await context.eval(`
						globalThis.__filename = ${JSON.stringify(filePath)};
						globalThis.__dirname = ${JSON.stringify(dirname)};
						globalThis._currentModule.dirname = ${JSON.stringify(dirname)};
						globalThis._currentModule.filename = ${JSON.stringify(filePath)};
					`);
				}

				// Transform dynamic import() to __dynamicImport()
				const transformedCode = transformDynamicImport(code);

				// Pre-compile all dynamic imports (must happen before setting up the function)
				await this.precompileDynamicImports(transformedCode, context);

				// Now set up the dynamic import function (uses pre-compiled cache)
				await this.setupDynamicImport(context, jail);

				// Wrap code to capture the result in a global and await if it's a promise
				// For async IIFEs, we need to capture the Promise returned by the IIFE
				const wrappedCode = `
          globalThis.__scriptResult__ = eval(${JSON.stringify(transformedCode)});
        `;
				const script = await this.isolate.compileScript(wrappedCode);
				await script.run(context);

				// If the script returned a promise, await it
				// Return the promise directly so isolated-vm can properly await it with { promise: true }
				const hasPromise = await context.eval(
					`globalThis.__scriptResult__ && typeof globalThis.__scriptResult__.then === 'function'`,
					{ copy: true },
				);
				if (hasPromise) {
					await context.eval(`globalThis.__scriptResult__`, { promise: true });
				}
			}

			// Wait for any active handles (child processes, etc.) to complete
			// See: packages/sandboxed-node/docs/ACTIVE_HANDLES.md
			await context.eval(
				'typeof _waitForActiveHandles === "function" ? _waitForActiveHandles() : Promise.resolve()',
				{ promise: true },
			);

			// Get exit code from process.exitCode if set
			const exitCode = await context.eval("process.exitCode || 0", {
				copy: true,
			});

			return {
				stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
				stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
				code: exitCode as number,
			};
		} catch (err) {
			// Check if this is a ProcessExitError (controlled exit)
			const errMessage = err instanceof Error ? err.message : String(err);

			// ProcessExitError format: "process.exit(N)"
			const exitMatch = errMessage.match(/process\.exit\((\d+)\)/);
			if (exitMatch) {
				const exitCode = parseInt(exitMatch[1], 10);
				return {
					stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
					stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
					code: exitCode,
				};
			}

			stderr.push(errMessage);
			return {
				stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
				stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
				code: 1,
			};
		} finally {
			context.release();
		}
	}

	/**
	 * Override process.env and process.cwd for a specific execution context
	 */
	private async overrideProcessConfig(
		context: ivm.Context,
		env?: Record<string, string>,
		cwd?: string,
	): Promise<void> {
		if (env) {
			const filtered = filterEnv(env, this.permissions);
			// Merge provided env with existing env
			await context.eval(`
				Object.assign(process.env, ${JSON.stringify(filtered)});
			`);
		}
		if (cwd) {
			// Override cwd
			await context.eval(`
				process.cwd = () => ${JSON.stringify(cwd)};
			`);
		}
	}

	/**
	 * Set stdin data for a specific execution context.
	 * This injects stdin data that will be emitted when process.stdin listeners are added.
	 */
	private async setStdinData(
		context: ivm.Context,
		stdin: string,
	): Promise<void> {
		// The bridge exposes these variables for stdin management
		// We need to set them before the script runs so readline can access them
		await context.eval(`
			// Reset stdin state for this execution
			if (typeof _stdinData !== 'undefined') {
				_stdinData = ${JSON.stringify(stdin)};
				_stdinPosition = 0;
				_stdinEnded = false;
				_stdinFlowMode = false;
			}
		`);
	}

	dispose(): void {
		this.isolate.dispose();
	}
}
