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
	SpawnedProcess,
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
export {
	allowAll,
	allowAllChildProcess,
	allowAllEnv,
	allowAllFs,
	allowAllNetwork,
} from "./shared/permissions.js";

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
	private activeHttpServerIds: Set<number> = new Set();
	private disposed: boolean = false;
	// Cache for compiled ESM modules (per isolate)
	private esmModuleCache: Map<string, ivm.Module> = new Map();

	constructor(options: NodeProcessOptions = {}) {
		this.memoryLimit = options.memoryLimit ?? 128;
		this.isolate = new ivm.Isolate({ memoryLimit: this.memoryLimit });
		const driver =
			options.driver ??
			// Set up explicit permissions so direct adapters stay deny-by-default.
			createNodeDriver({
				filesystem: options.filesystem,
				networkAdapter: options.networkAdapter,
				commandExecutor: options.commandExecutor,
				permissions: options.permissions ?? {},
			});
		const permissions = options.permissions ?? driver.permissions;
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
	 * Host-side network access routed through the sandbox network adapter.
	 */
	get network(): Pick<NetworkAdapter, "fetch" | "dnsLookup" | "httpRequest"> {
		const adapter = this.networkAdapter ?? createNetworkStub();
		return {
			fetch: (url, options) => adapter.fetch(url, options),
			dnsLookup: (hostname) => adapter.dnsLookup(hostname),
			httpRequest: (url, options) => adapter.httpRequest(url, options),
		};
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
			"http2",
			"dns",
			"child_process",
			"process",
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
			"http2",
			"dns",
			"child_process",
			"process",
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
			} else if (moduleName === "http2") {
				code = `
          const _http2 = globalThis._http2Module || {};
          export default _http2;
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

		// Evaluate before reading exports so namespace bindings are initialized.
		await entryModule.evaluate({ promise: true });

		// Set namespace on the isolate global so we can serialize a plain object.
		const jail = context.global;
		const namespaceGlobalKey = "__entryNamespace__";
		await jail.set(namespaceGlobalKey, entryModule.namespace.derefInto());

		try {
			// Get namespace exports for run() to mirror module.exports semantics.
			return context.eval(
				`Object.fromEntries(Object.entries(globalThis.${namespaceGlobalKey}))`,
				{ copy: true },
			);
		} finally {
			// Clean up temporary namespace binding after copying exports.
			await jail.delete(namespaceGlobalKey);
		}
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

			// Lazy dispatcher reference for in-sandbox HTTP server callbacks
			let httpServerDispatchRef: ivm.Reference<
				(
					serverId: number,
					requestJson: string,
				) => Promise<string>
			> | null = null;

			const getHttpServerDispatchRef = () => {
				if (!httpServerDispatchRef) {
					httpServerDispatchRef = context.global.getSync("_httpServerDispatch", {
						reference: true,
					}) as ivm.Reference<
						(
							serverId: number,
							requestJson: string,
						) => Promise<string>
					>;
				}
				return httpServerDispatchRef!;
			};

			// Reference for starting an in-sandbox HTTP server
			const networkHttpServerListenRef = new ivm.Reference(
				async (optionsJson: string): Promise<string> => {
					if (!adapter.httpServerListen) {
						throw new Error(
							"http.createServer requires NetworkAdapter.httpServerListen support",
						);
					}

					const options = JSON.parse(optionsJson) as {
						serverId: number;
						port?: number;
						hostname?: string;
					};

					const result = await adapter.httpServerListen({
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
							return JSON.parse(String(responseJson)) as {
								status: number;
								headers?: Array<[string, string]>;
								body?: string;
								bodyEncoding?: "utf8" | "base64";
							};
						},
					});
					this.activeHttpServerIds.add(options.serverId);

					return JSON.stringify(result);
				},
			);

			// Reference for closing an in-sandbox HTTP server
			const networkHttpServerCloseRef = new ivm.Reference(
				async (serverId: number): Promise<void> => {
					if (!adapter.httpServerClose) {
						throw new Error(
							"http.createServer close requires NetworkAdapter.httpServerClose support",
						);
					}
					await adapter.httpServerClose(serverId);
					this.activeHttpServerIds.delete(serverId);
				},
			);

			await jail.set("_networkFetchRaw", networkFetchRef);
			await jail.set("_networkDnsLookupRaw", networkDnsLookupRef);
			await jail.set("_networkHttpRequestRaw", networkHttpRequestRef);
			await jail.set("_networkHttpServerListenRaw", networkHttpServerListenRef);
			await jail.set("_networkHttpServerCloseRaw", networkHttpServerCloseRef);
		}

		// Set up globals needed by the bridge BEFORE loading it
		const initialCwd = this.processConfig.cwd ?? "/";
		await context.eval(`
      globalThis._moduleCache = {};
      // Set up built-ins that have no bridge/polyfill implementation.
      globalThis._moduleCache['v8'] = {
        getHeapStatistics: function() {
          return {
            total_heap_size: 67108864,
            total_heap_size_executable: 1048576,
            total_physical_size: 67108864,
            total_available_size: 67108864,
            used_heap_size: 52428800,
            heap_size_limit: 134217728,
            malloced_memory: 8192,
            peak_malloced_memory: 16384,
            does_zap_garbage: 0,
            number_of_native_contexts: 1,
            number_of_detached_contexts: 0,
            external_memory: 0
          };
        },
        getHeapSpaceStatistics: function() { return []; },
        getHeapCodeStatistics: function() { return {}; },
        setFlagsFromString: function() {},
        serialize: function(value) { return Buffer.from(JSON.stringify(value)); },
        deserialize: function(buffer) { return JSON.parse(buffer.toString()); },
        cachedDataVersionTag: function() { return 0; }
      };
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
	 * Run code and return the value of module.exports (CJS) or the ESM namespace
	 * object (including default and named exports), along with exit code and
	 * captured stdout/stderr.
	 */
	async run<T = unknown>(
		code: string,
		filePath?: string,
	): Promise<RunResult<T>> {
		return this.executeInternal<T>({
			mode: "run",
			code,
			filePath,
		});
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
		const result = await this.executeInternal({
			mode: "exec",
			code,
			filePath: options?.filePath,
			env: options?.env,
			cwd: options?.cwd,
			stdin: options?.stdin,
		});

		return {
			stdout: result.stdout,
			stderr: result.stderr,
			code: result.code,
		};
	}

	/**
	 * Shared execution pipeline for module-oriented and script-oriented execution.
	 */
	private async executeInternal<T = unknown>(options: {
		mode: "run" | "exec";
		code: string;
		filePath?: string;
		env?: Record<string, string>;
		cwd?: string;
		stdin?: string;
	}): Promise<RunResult<T>> {
		// Clear caches for fresh run
		this.esmModuleCache.clear();
		this.dynamicImportCache.clear();
		this.activeHttpServerIds.clear();

		const context = await this.isolate.createContext();
		const stdout: string[] = [];
		const stderr: string[] = [];

		try {
			const jail = context.global;
			await jail.set("global", jail.derefInto());

			// Set up console capture
			await this.setupConsole(context, jail, stdout, stderr);

			let exports: T | undefined;
			const transformedCode = transformDynamicImport(options.code);

			// Detect ESM vs CJS and run the mode-specific path.
			if (isESM(options.code, options.filePath)) {
				await this.setupESMGlobals(context, jail);

				if (options.mode === "exec") {
					await this.applyExecutionOverrides(
						context,
						options.env,
						options.cwd,
						options.stdin,
					);
				}

				await this.precompileDynamicImports(transformedCode, context);
				await this.setupDynamicImport(context, jail);

				const esmResult = await this.runESM(
					transformedCode,
					context,
					options.filePath,
				);
				if (options.mode === "run") {
					exports = esmResult as T;
				}
			} else {
				await this.setupRequire(context, jail);
				await context.eval("globalThis.module = { exports: {} };");

				if (options.mode === "exec") {
					await this.applyExecutionOverrides(
						context,
						options.env,
						options.cwd,
						options.stdin,
					);

					if (options.filePath) {
						await this.setCommonJsFileGlobals(context, options.filePath);
					}
				}

				await this.precompileDynamicImports(transformedCode, context);
				await this.setupDynamicImport(context, jail);

				if (options.mode === "exec") {
					// Capture eval() result and await it if script returns a Promise.
					const wrappedCode = `
            globalThis.__scriptResult__ = eval(${JSON.stringify(transformedCode)});
          `;
					const script = await this.isolate.compileScript(wrappedCode);
					await script.run(context);
					await this.awaitScriptResult(context);
				} else {
					const script = await this.isolate.compileScript(transformedCode);
					await script.run(context);
					exports = (await context.eval("module.exports", { copy: true })) as T;
				}
			}

			// Wait for any active handles (child processes, etc.) to complete.
			await context.eval(
				'typeof _waitForActiveHandles === "function" ? _waitForActiveHandles() : Promise.resolve()',
				{ promise: true },
			);

			// Get exit code from process.exitCode if set.
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
			// Handle controlled process exits from process.exit(N).
			const errMessage = err instanceof Error ? err.message : String(err);
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
	 * Apply runtime overrides used by script-style execution.
	 */
	private async applyExecutionOverrides(
		context: ivm.Context,
		env?: Record<string, string>,
		cwd?: string,
		stdin?: string,
	): Promise<void> {
		if (env || cwd) {
			await this.overrideProcessConfig(context, env, cwd);
		}
		if (stdin !== undefined) {
			await this.setStdinData(context, stdin);
		}
	}

	/**
	 * Set CommonJS file globals for accurate relative require() behavior.
	 */
	private async setCommonJsFileGlobals(
		context: ivm.Context,
		filePath: string,
	): Promise<void> {
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

	/**
	 * Await script result when eval() returns a Promise.
	 */
	private async awaitScriptResult(context: ivm.Context): Promise<void> {
		const hasPromise = await context.eval(
			`globalThis.__scriptResult__ && typeof globalThis.__scriptResult__.then === 'function'`,
			{ copy: true },
		);
		if (hasPromise) {
			await context.eval(`globalThis.__scriptResult__`, { promise: true });
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
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.isolate.dispose();
	}

	/**
	 * Terminate sandbox execution from the host.
	 * Closes bridged HTTP servers before disposing the isolate.
	 */
	async terminate(): Promise<void> {
		if (this.disposed) {
			return;
		}
		const adapter = this.networkAdapter;
		if (adapter?.httpServerClose) {
			const ids = Array.from(this.activeHttpServerIds);
			await Promise.allSettled(ids.map((id) => adapter.httpServerClose!(id)));
		}
		this.activeHttpServerIds.clear();
		this.disposed = true;
		this.isolate.dispose();
	}
}
