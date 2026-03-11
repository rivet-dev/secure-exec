import ivm from "isolated-vm";
import { randomFillSync, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { getInitialBridgeGlobalsSetupCode } from "../bridge-setup.js";
import { getBridgeAttachCode, getRawBridgeCode } from "../bridge-loader.js";
import {
	createBuiltinESMWrapper,
	getStaticBuiltinWrapperSource,
} from "../esm-compiler.js";
import { executeWithRuntime } from "../execution.js";
import { mkdir } from "../fs-helpers.js";
import { getIsolateRuntimeSource } from "../generated/isolate-runtime.js";
import {
	DEFAULT_TIMING_MITIGATION,
	TIMEOUT_ERROR_MESSAGE,
	TIMEOUT_EXIT_CODE,
	createIsolate as createDefaultIsolate,
	getExecutionDeadlineMs,
	getExecutionRunOptions,
	isExecutionTimeoutError,
	runWithExecutionDeadline,
} from "../isolate.js";
import {
	BUILTIN_NAMED_EXPORTS,
	getPathDir,
	normalizeBuiltinSpecifier,
} from "../module-resolver.js";
import { loadFile, resolveModule } from "../package-bundler.js";
import { bundlePolyfill, hasPolyfill } from "../polyfills.js";
import {
	createCommandExecutorStub,
	createFsStub,
	createNetworkStub,
	filterEnv,
	wrapCommandExecutor,
	wrapFileSystem,
	wrapNetworkAdapter,
} from "../shared/permissions.js";
import {
	extractCjsNamedExports,
	extractDynamicImportSpecifiers,
	isESM,
	transformDynamicImport,
	wrapCJSForESMWithModulePath,
} from "../shared/esm-utils.js";
import { getConsoleSetupCode } from "../shared/console-formatter.js";
import {
	HARDENED_NODE_CUSTOM_GLOBALS,
	MUTABLE_NODE_CUSTOM_GLOBALS,
} from "../shared/global-exposure.js";
import {
	HOST_BRIDGE_GLOBAL_KEYS,
	RUNTIME_BRIDGE_GLOBAL_KEYS,
} from "../shared/bridge-contract.js";
import { getRequireSetupCode } from "../shared/require-setup.js";
import type {
	CommandExecutor,
	NetworkAdapter,
	Permissions,
	RuntimeDriver,
	RuntimeDriverOptions,
	SpawnedProcess,
	VirtualFileSystem,
} from "../types.js";
import type {
	StdioEvent,
	StdioHook,
	ExecOptions,
	ExecResult,
	OSConfig,
	ProcessConfig,
	RunResult,
	TimingMitigation,
} from "../shared/api-types.js";

export interface NodeExecutionDriverOptions extends RuntimeDriverOptions {
	createIsolate?(memoryLimit: number): unknown;
}

// Cache of bundled polyfills
const polyfillCodeCache: Map<string, string> = new Map();
const polyfillNamedExportsCache: Map<string, string[]> = new Map();
const hostBuiltinNamedExportsCache: Map<string, string[]> = new Map();
const hostRequire = createRequire(import.meta.url);

function isValidExportName(name: string): boolean {
	return /^[A-Za-z_$][\w$]*$/.test(name);
}

function getHostBuiltinNamedExports(moduleName: string): string[] {
	const cached = hostBuiltinNamedExportsCache.get(moduleName);
	if (cached) {
		return cached;
	}

	try {
		const loaded = hostRequire(`node:${moduleName}`) as
			| Record<string, unknown>
			| null
			| undefined;
		const names = Array.from(
			new Set([
				...Object.keys(loaded ?? {}),
				...Object.getOwnPropertyNames(loaded ?? {}),
			]),
		)
			.filter((name) => name !== "default")
			.filter(isValidExportName)
			.sort();
		hostBuiltinNamedExportsCache.set(moduleName, names);
		return names;
	} catch {
		hostBuiltinNamedExportsCache.set(moduleName, []);
		return [];
	}
}
const DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES = 16 * 1024 * 1024;
const DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MIN_CONFIGURED_PAYLOAD_BYTES = 1024;
const MAX_CONFIGURED_PAYLOAD_BYTES = 64 * 1024 * 1024;
const PAYLOAD_LIMIT_ERROR_CODE = "ERR_SANDBOX_PAYLOAD_TOO_LARGE";
const DEFAULT_SANDBOX_CWD = "/root";
const DEFAULT_SANDBOX_HOME = "/root";
const DEFAULT_SANDBOX_TMPDIR = "/tmp";

class PayloadLimitError extends Error {
	constructor(payloadLabel: string, maxBytes: number, actualBytes: number) {
		super(
			`${PAYLOAD_LIMIT_ERROR_CODE}: ${payloadLabel} exceeds ${maxBytes} bytes (got ${actualBytes})`,
		);
		this.name = "PayloadLimitError";
	}
}

export class NodeExecutionDriver implements RuntimeDriver {
	private isolate: ivm.Isolate;
	private memoryLimit: number;
	private filesystem: VirtualFileSystem;
	private processConfig: ProcessConfig;
	private commandExecutor?: CommandExecutor;
	private networkAdapter?: NetworkAdapter;
	private osConfig: OSConfig;
	private permissions?: Permissions;
	private cpuTimeLimitMs?: number;
	private timingMitigation: TimingMitigation;
	private bridgeBase64TransferLimitBytes: number;
	private isolateJsonPayloadLimitBytes: number;
	private onStdio?: StdioHook;
	private runtimeCreateIsolate: (memoryLimit: number) => ivm.Isolate;
	private activeHttpServerIds: Set<number> = new Set();
	private disposed: boolean = false;
	// Cache for compiled ESM modules (per isolate)
	private esmModuleCache: Map<string, ivm.Module> = new Map();
	private moduleFormatCache: Map<string, "esm" | "cjs" | "json"> = new Map();
	private packageTypeCache: Map<string, "module" | "commonjs" | null> =
		new Map();

	constructor(options: NodeExecutionDriverOptions) {
		this.memoryLimit = options.memoryLimit ?? 128;
		const system = options.system;
		this.runtimeCreateIsolate =
			(options.createIsolate as
				| ((memoryLimit: number) => ivm.Isolate)
				| undefined) ??
			((memoryLimit) => createDefaultIsolate(memoryLimit));
		this.isolate = this.createIsolate();
		const permissions = system.permissions;
		this.permissions = permissions;
		this.filesystem = system.filesystem
			? wrapFileSystem(system.filesystem, permissions)
			: createFsStub();
		this.commandExecutor = system.commandExecutor
			? wrapCommandExecutor(system.commandExecutor, permissions)
			: createCommandExecutorStub();
		this.networkAdapter = system.network
			? wrapNetworkAdapter(system.network, permissions)
			: createNetworkStub();
		const processConfig = {
			...(options.runtime.process ?? {}),
		};
		processConfig.cwd ??= DEFAULT_SANDBOX_CWD;
		processConfig.env = filterEnv(processConfig.env, permissions);
		this.processConfig = processConfig;
		const osConfig = {
			...(options.runtime.os ?? {}),
		};
		osConfig.homedir ??= DEFAULT_SANDBOX_HOME;
		osConfig.tmpdir ??= DEFAULT_SANDBOX_TMPDIR;
		this.osConfig = osConfig;
		this.cpuTimeLimitMs = options.cpuTimeLimitMs;
		this.timingMitigation =
			options.timingMitigation ?? DEFAULT_TIMING_MITIGATION;
		this.onStdio = options.onStdio;
		this.bridgeBase64TransferLimitBytes = this.normalizePayloadLimit(
			options.payloadLimits?.base64TransferBytes,
			DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES,
			"payloadLimits.base64TransferBytes",
		);
		this.isolateJsonPayloadLimitBytes = this.normalizePayloadLimit(
			options.payloadLimits?.jsonPayloadBytes,
			DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES,
			"payloadLimits.jsonPayloadBytes",
		);
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
	 * Unsafe isolate escape hatch for direct low-level isolated-vm usage.
	 */
	get unsafeIsolate(): unknown {
		return this.__unsafeIsoalte;
	}

	get __unsafeIsoalte(): ivm.Isolate {
		if (this.disposed) {
			throw new Error("NodeRuntime has been disposed");
		}
		return this.isolate;
	}

	/**
	 * Unsafe context bootstrap for direct host-to-isolate function references.
	 * Caller owns lifecycle and MUST call context.release() when done.
	 */
	async createUnsafeContext(options: {
		env?: Record<string, string>;
		cwd?: string;
		filePath?: string;
	} = {}): Promise<unknown> {
		return this.__unsafeCreateContext(options);
	}

	async __unsafeCreateContext(options: {
		env?: Record<string, string>;
		cwd?: string;
		filePath?: string;
	} = {}): Promise<ivm.Context> {
		if (this.disposed) {
			throw new Error("NodeRuntime has been disposed");
		}

		const context = await this.isolate.createContext();
		const jail = context.global;
		await jail.set("global", jail.derefInto());

		const timingMitigation = this.getTimingMitigation(undefined);
		const frozenTimeMs = Date.now();

		await this.setupConsole(context, jail, this.onStdio);
		await this.setupRequire(context, jail, timingMitigation, frozenTimeMs);
		await this.setupDynamicImport(
			context,
			jail,
			options.filePath
				? getPathDir(options.filePath)
				: (options.cwd ?? this.processConfig.cwd ?? "/"),
			undefined,
		);
		await this.initCommonJsModuleGlobals(context);
		await this.applyExecutionOverrides(context, options.env, options.cwd, undefined);
		if (options.filePath) {
			await this.setCommonJsFileGlobals(context, options.filePath);
		}
		await this.applyCustomGlobalExposurePolicy(context);

		return context;
	}

	private normalizePayloadLimit(
		configuredValue: number | undefined,
		defaultValue: number,
		optionName: string,
	): number {
		if (configuredValue === undefined) {
			return defaultValue;
		}
		if (!Number.isFinite(configuredValue) || configuredValue <= 0) {
			throw new RangeError(`${optionName} must be a positive finite number`);
		}
		const normalizedValue = Math.floor(configuredValue);
		if (normalizedValue < MIN_CONFIGURED_PAYLOAD_BYTES) {
			throw new RangeError(
				`${optionName} must be at least ${MIN_CONFIGURED_PAYLOAD_BYTES} bytes`,
			);
		}
		if (normalizedValue > MAX_CONFIGURED_PAYLOAD_BYTES) {
			throw new RangeError(
				`${optionName} must be at most ${MAX_CONFIGURED_PAYLOAD_BYTES} bytes`,
			);
		}
		return normalizedValue;
	}

	private getUtf8ByteLength(text: string): number {
		return Buffer.byteLength(text, "utf8");
	}

	private getBase64EncodedByteLength(rawByteLength: number): number {
		return Math.ceil(rawByteLength / 3) * 4;
	}

	private assertPayloadByteLength(
		payloadLabel: string,
		actualBytes: number,
		maxBytes: number,
	): void {
		if (actualBytes <= maxBytes) {
			return;
		}
		throw new PayloadLimitError(payloadLabel, maxBytes, actualBytes);
	}

	private assertTextPayloadSize(
		payloadLabel: string,
		text: string,
		maxBytes: number,
	): void {
		this.assertPayloadByteLength(
			payloadLabel,
			this.getUtf8ByteLength(text),
			maxBytes,
		);
	}

	private parseJsonWithLimit<T>(payloadLabel: string, jsonText: string): T {
		this.assertTextPayloadSize(
			payloadLabel,
			jsonText,
			this.isolateJsonPayloadLimitBytes,
		);
		return JSON.parse(jsonText) as T;
	}

	private getExecutionTimeoutMs(override?: number): number | undefined {
		const timeoutMs = override ?? this.cpuTimeLimitMs;
		if (timeoutMs === undefined) {
			return undefined;
		}
		if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
			throw new RangeError("cpuTimeLimitMs must be a positive finite number");
		}
		return Math.floor(timeoutMs);
	}

	private getTimingMitigation(mode?: TimingMitigation): TimingMitigation {
		return mode ?? this.timingMitigation;
	}

	private getExecutionDeadlineMs(timeoutMs?: number): number | undefined {
		return getExecutionDeadlineMs(timeoutMs);
	}

	private getExecutionRunOptions(
		executionDeadlineMs?: number,
	): Pick<ivm.ScriptRunOptions, "timeout"> {
		return getExecutionRunOptions(executionDeadlineMs);
	}

	private async runWithExecutionDeadline<T>(
		operation: Promise<T>,
		executionDeadlineMs?: number,
	): Promise<T> {
		return runWithExecutionDeadline(operation, executionDeadlineMs);
	}

	private isExecutionTimeoutError(error: unknown): boolean {
		return isExecutionTimeoutError(error);
	}

	private createProcessConfigForExecution(
		timingMitigation: TimingMitigation,
		frozenTimeMs: number,
	): ProcessConfig {
		return {
			...this.processConfig,
			timingMitigation,
			frozenTimeMs: timingMitigation === "freeze" ? frozenTimeMs : undefined,
		};
	}

	private async applyTimingMitigation(
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

	/**
	 * Resolve a module specifier to an absolute path
	 */
	private normalizeBuiltinSpecifier(request: string): string | null {
		return normalizeBuiltinSpecifier(request);
	}

	private getPathDir(path: string): string {
		return getPathDir(path);
	}

	private async getNearestPackageType(
		filePath: string,
	): Promise<"module" | "commonjs" | null> {
		let currentDir = this.getPathDir(filePath);
		const visitedDirs: string[] = [];
		while (true) {
			if (this.packageTypeCache.has(currentDir)) {
				return this.packageTypeCache.get(currentDir) ?? null;
			}
			visitedDirs.push(currentDir);

			const packageJsonPath =
				currentDir === "/" ? "/package.json" : `${currentDir}/package.json`;

			let hasPackageJson = false;
			try {
				hasPackageJson = await this.filesystem.exists(packageJsonPath);
			} catch (error) {
				const err = error as NodeJS.ErrnoException;
				if (err?.code !== "EACCES" && err?.code !== "EPERM") {
					throw err;
				}
			}

			if (hasPackageJson) {
				try {
					const packageJsonText =
						await this.filesystem.readTextFile(packageJsonPath);
					const pkgJson = this.parseJsonWithLimit<{ type?: unknown }>(
						`package.json ${packageJsonPath}`,
						packageJsonText,
					);
					const packageType =
						pkgJson.type === "module" || pkgJson.type === "commonjs"
							? pkgJson.type
							: null;
					for (const dir of visitedDirs) {
						this.packageTypeCache.set(dir, packageType);
					}
					return packageType;
				} catch {
					for (const dir of visitedDirs) {
						this.packageTypeCache.set(dir, null);
					}
					return null;
				}
			}

			if (currentDir === "/") {
				for (const dir of visitedDirs) {
					this.packageTypeCache.set(dir, null);
				}
				return null;
			}
			currentDir = this.getPathDir(currentDir);
		}
	}

	private async getModuleFormat(
		filePath: string,
		sourceCode?: string,
	): Promise<"esm" | "cjs" | "json"> {
		const cached = this.moduleFormatCache.get(filePath);
		if (cached) {
			return cached;
		}

		let format: "esm" | "cjs" | "json";
		if (filePath.endsWith(".mjs")) {
			format = "esm";
		} else if (filePath.endsWith(".cjs")) {
			format = "cjs";
		} else if (filePath.endsWith(".json")) {
			format = "json";
		} else if (filePath.endsWith(".js")) {
			const packageType = await this.getNearestPackageType(filePath);
			if (packageType === "module") {
				format = "esm";
			} else if (packageType === "commonjs") {
				format = "cjs";
			} else if (sourceCode && isESM(sourceCode, filePath)) {
				// Some package managers/projected filesystems omit package.json.
				// Fall back to syntax-based detection for plain .js modules.
				format = "esm";
			} else {
				format = "cjs";
			}
		} else {
			format = "cjs";
		}

		this.moduleFormatCache.set(filePath, format);
		return format;
	}

	private async shouldRunAsESM(
		code: string,
		filePath?: string,
	): Promise<boolean> {
		// Keep heuristic mode for string-only snippets without file metadata.
		if (!filePath) {
			return isESM(code);
		}
		return (await this.getModuleFormat(filePath)) === "esm";
	}

	private async resolveESMPath(
		specifier: string,
		referrerPath: string,
	): Promise<string | null> {
		// Handle built-ins and bridged modules first.
		const builtinSpecifier = this.normalizeBuiltinSpecifier(specifier);
		if (builtinSpecifier) {
			return builtinSpecifier;
		}

		const referrerDir = await this.resolveReferrerDirectory(referrerPath);

		// Preserve direct path imports before falling back to node_modules
		// resolution so missing relative modules report the resolved sandbox path.
		if (specifier.startsWith("/")) {
			return specifier;
		}
		if (specifier.startsWith("./") || specifier.startsWith("../")) {
			const parts = referrerDir.split("/").filter(Boolean);
			for (const part of specifier.split("/")) {
				if (part === "..") {
					parts.pop();
					continue;
				}
				if (part !== ".") {
					parts.push(part);
				}
			}
			return `/${parts.join("/")}`;
		}

		return resolveModule(specifier, referrerDir, this.filesystem, "import");
	}

	private async resolveReferrerDirectory(referrerPath: string): Promise<string> {
		if (referrerPath === "" || referrerPath === "/") {
			return "/";
		}

		// Dynamic import hooks may pass either a module file path or a module
		// directory path. Prefer filesystem metadata so we do not strip one level
		// when the referrer is already a directory.
		if (this.filesystem) {
			try {
				const statInfo = await this.filesystem.stat(referrerPath);
				if (statInfo.isDirectory) {
					return referrerPath;
				}
			} catch {
				// Fall back to string-based path handling below.
			}
		}

		if (referrerPath.endsWith("/")) {
			return referrerPath.slice(0, -1) || "/";
		}

		const lastSlash = referrerPath.lastIndexOf("/");
		if (lastSlash <= 0) {
			return "/";
		}
		return referrerPath.slice(0, lastSlash);
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
		const builtinSpecifier = this.normalizeBuiltinSpecifier(filePath);
		const moduleName = (builtinSpecifier ?? filePath).replace(/^node:/, "");

		if (builtinSpecifier) {
			const hostBuiltinNamedExports = getHostBuiltinNamedExports(moduleName);
			const declaredBuiltinNamedExports = BUILTIN_NAMED_EXPORTS[moduleName] ?? [];
			const mergedBuiltinNamedExports = Array.from(
				new Set([...hostBuiltinNamedExports, ...declaredBuiltinNamedExports]),
			);
			const runtimeBuiltinBinding = `globalThis._requireFrom(${JSON.stringify(moduleName)}, "/")`;
			const staticWrapperCode = getStaticBuiltinWrapperSource(moduleName);
			if (staticWrapperCode !== null) {
				code = staticWrapperCode;
			} else if (hostBuiltinNamedExports.length > 0) {
				// Prefer the runtime builtin bridge when host exports are known.
				code = createBuiltinESMWrapper(
					runtimeBuiltinBinding,
					mergedBuiltinNamedExports,
				);
			} else if (hasPolyfill(moduleName)) {
				// Get polyfill code and wrap for ESM.
				let polyfillCode = polyfillCodeCache.get(moduleName);
				if (!polyfillCode) {
					polyfillCode = await bundlePolyfill(moduleName);
					polyfillCodeCache.set(moduleName, polyfillCode);
				}

				let inferredNamedExports = polyfillNamedExportsCache.get(moduleName);
				if (!inferredNamedExports) {
					inferredNamedExports = extractCjsNamedExports(polyfillCode);
					polyfillNamedExportsCache.set(moduleName, inferredNamedExports);
				}

				code = createBuiltinESMWrapper(
					String(polyfillCode),
					Array.from(
						new Set([
							...inferredNamedExports,
							...mergedBuiltinNamedExports,
						]),
					),
				);
			} else {
				// Fall back to the runtime require bridge for built-ins without
				// dedicated polyfills so ESM named imports can still bind.
				code = createBuiltinESMWrapper(
					runtimeBuiltinBinding,
					mergedBuiltinNamedExports,
				);
			}
		} else {
			// Load from filesystem
			const source = await loadFile(filePath, this.filesystem);
			if (source === null) {
				throw new Error(`Cannot load module: ${filePath}`);
			}

			// Classify source module format using extension + package metadata.
			const moduleFormat = await this.getModuleFormat(filePath, source);
			if (moduleFormat === "json") {
				code = "export default " + source + ";";
			} else if (moduleFormat === "cjs") {
				// Transform CommonJS modules into ESM default exports.
				code = wrapCJSForESMWithModulePath(source, filePath);
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
		executionDeadlineMs?: number,
	): Promise<unknown> {
		// Compile the entry module
		const entryModule = await this.isolate.compileModule(code, {
			filename: filePath,
		});
		this.esmModuleCache.set(filePath, entryModule);

		// Instantiate with resolver (this resolves all dependencies)
		await entryModule.instantiate(context, this.createESMResolver(context));

		// Evaluate before reading exports so namespace bindings are initialized.
		await this.runWithExecutionDeadline(
			entryModule.evaluate({
				promise: true,
				...this.getExecutionRunOptions(executionDeadlineMs),
			}),
			executionDeadlineMs,
		);

		// Set namespace on the isolate global so we can serialize a plain object.
		const jail = context.global;
		const namespaceGlobalKey = "__entryNamespace__";
		await jail.set(namespaceGlobalKey, entryModule.namespace.derefInto());

		try {
			// Get namespace exports for run() to mirror module.exports semantics.
			return context.eval("Object.fromEntries(Object.entries(globalThis.__entryNamespace__))", {
				copy: true,
				...this.getExecutionRunOptions(executionDeadlineMs),
			});
		} finally {
			// Clean up temporary namespace binding after copying exports.
			await jail.delete(namespaceGlobalKey);
		}
	}

	// Cache for evaluated dynamic import module namespaces
	private dynamicImportCache = new Map<string, ivm.Reference<unknown>>();
	// Track in-flight dynamic import evaluations per resolved module path
	private dynamicImportPending = new Map<
		string,
		Promise<ivm.Reference<unknown>>
	>();

	/**
	 * Get a cached namespace or evaluate the module on first dynamic import.
	 */
	private async resolveDynamicImportNamespace(
		specifier: string,
		context: ivm.Context,
		referrerPath: string,
		executionDeadlineMs?: number,
	): Promise<ivm.Reference<unknown> | null> {
		// Get directly cached namespaces first.
		const cached = this.dynamicImportCache.get(specifier);
		if (cached) {
			return cached;
		}

		// Resolve before compile/evaluate.
		const resolved = await this.resolveESMPath(specifier, referrerPath);
		if (!resolved) {
			return null;
		}

		// Get resolved-path cache entry.
		const resolvedCached = this.dynamicImportCache.get(resolved);
		if (resolvedCached) {
			this.dynamicImportCache.set(specifier, resolvedCached);
			return resolvedCached;
		}

		// Wait for an existing evaluation in progress.
		const pending = this.dynamicImportPending.get(resolved);
		if (pending) {
			const namespace = await pending;
			this.dynamicImportCache.set(specifier, namespace);
			return namespace;
		}

		// Evaluate once, then cache by both resolved path and original specifier.
			const evaluateModule = (async (): Promise<ivm.Reference<unknown>> => {
				const module = await this.compileESMModule(resolved, context);
				try {
					await module.instantiate(context, this.createESMResolver(context));
				} catch (error) {
					if (!this.isAlreadyInstantiatedModuleError(error)) {
						throw error;
					}
				}
				await this.runWithExecutionDeadline(
					module.evaluate({
						promise: true,
						...this.getExecutionRunOptions(executionDeadlineMs),
				}),
				executionDeadlineMs,
			);
			return module.namespace;
		})();

		this.dynamicImportPending.set(resolved, evaluateModule);

		try {
			const namespace = await evaluateModule;
			this.dynamicImportCache.set(resolved, namespace);
			this.dynamicImportCache.set(specifier, namespace);
			return namespace;
		} finally {
			this.dynamicImportPending.delete(resolved);
		}
	}

	private isAlreadyInstantiatedModuleError(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}

		const message = error.message.toLowerCase();
		return (
			message.includes("already instantiated") ||
			message.includes("already linked")
		);
	}

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

			// Compile only to warm module cache without triggering side effects.
			try {
				await this.compileESMModule(resolved, context);
			} catch {
				// Skip unresolved/invalid modules so runtime import() rejects on demand.
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
		referrerPath: string = "/",
		executionDeadlineMs?: number,
	): Promise<void> {
		// Set up async module resolution/evaluation for first dynamic import.
		const dynamicImportRef = new ivm.Reference(
			async (specifier: string, fromPath?: string) => {
				const effectiveReferrer =
					typeof fromPath === "string" && fromPath.length > 0
						? fromPath
						: referrerPath;
				const namespace = await this.resolveDynamicImportNamespace(
					specifier,
					context,
					effectiveReferrer,
					executionDeadlineMs,
				);
				if (!namespace) {
					return null;
				}
				return namespace.derefInto();
			},
		);

		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.dynamicImport, dynamicImportRef);
		await jail.set(
			"__runtimeDynamicImportConfig",
			{ referrerPath },
			{ copy: true },
		);
		// Resolve in ESM mode first and only use require() fallback for explicit CJS/JSON.
		await context.eval(getIsolateRuntimeSource("setupDynamicImport"));
	}

	/**
	 * Set up the require() system in a context
	 */
	private async setupRequire(
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
				const builtinSpecifier = this.normalizeBuiltinSpecifier(request);
				if (builtinSpecifier) {
					return builtinSpecifier;
				}
				return resolveModule(request, fromDir, this.filesystem);
			},
		);

		// Create a reference for loading file content
		// Also transforms dynamic import() calls to __dynamicImport()
		const loadFileRef = new ivm.Reference(
			async (path: string): Promise<string | null> => {
				const source = await loadFile(path, this.filesystem);
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
		// This allows setTimeout/setInterval to use real host-side timers
		const scheduleTimerRef = new ivm.Reference((delayMs: number) => {
			return new Promise<void>((resolve) => {
				// Use real host setTimeout with actual delay
				globalThis.setTimeout(resolve, delayMs);
			});
		});
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.scheduleTimer, scheduleTimerRef);

		// Set up host crypto references for secure randomness.
		const cryptoRandomFillRef = new ivm.Reference((byteLength: number) => {
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
			const fs = this.filesystem;

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
					this.assertPayloadByteLength(
						`fs.readFileBinary ${path}`,
						this.getBase64EncodedByteLength(data.byteLength),
						this.bridgeBase64TransferLimitBytes,
					);
				// Convert to base64 for transfer across isolate boundary
				return Buffer.from(data).toString("base64");
			});
			const writeFileBinaryRef = new ivm.Reference(
				async (path: string, base64Content: string) => {
						this.assertTextPayloadSize(
							`fs.writeFileBinary ${path}`,
							base64Content,
							this.bridgeBase64TransferLimitBytes,
						);
					// Decode base64 and write as binary
					const data = Buffer.from(base64Content, "base64");
					await fs.writeFile(path, data);
				},
			);
			const readDirRef = new ivm.Reference(async (path: string) => {
				const entries = await fs.readDirWithTypes(path);
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
				return fs.exists(path);
			});
			const statRef = new ivm.Reference(async (path: string) => {
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
				await fs.removeFile(path);
			});
			const renameRef = new ivm.Reference(
				async (oldPath: string, newPath: string) => {
					await fs.rename(oldPath, newPath);
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

			// Create the _fs object inside the isolate.
			await context.eval(getIsolateRuntimeSource("setupFsFacade"));
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
					const args = this.parseJsonWithLimit<string[]>(
						"child_process.spawn args",
						argsJson,
					);
					const options = this.parseJsonWithLimit<{
						cwd?: string;
						env?: Record<string, string>;
					}>("child_process.spawn options", optionsJson);
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
					const args = this.parseJsonWithLimit<string[]>(
						"child_process.spawnSync args",
						argsJson,
					);
					const options = this.parseJsonWithLimit<{
						cwd?: string;
						env?: Record<string, string>;
					}>("child_process.spawnSync options", optionsJson);

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
					const stdout = stdoutChunks.map((c) => decoder.decode(c)).join("");
					const stderr = stderrChunks.map((c) => decoder.decode(c)).join("");

					return JSON.stringify({ stdout, stderr, code: exitCode });
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
			const adapter = this.networkAdapter ?? createNetworkStub();

			// Reference for fetch - returns JSON string for transfer
			const networkFetchRef = new ivm.Reference(
				(url: string, optionsJson: string): Promise<string> => {
					const options = this.parseJsonWithLimit<{
						method?: string;
						headers?: Record<string, string>;
						body?: string | null;
					}>("network.fetch options", optionsJson);
					return adapter
						.fetch(url, options)
						.then((result) => JSON.stringify(result));
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
				(url: string, optionsJson: string): Promise<string> => {
					const options = this.parseJsonWithLimit<{
						method?: string;
						headers?: Record<string, string>;
						body?: string | null;
					}>("network.httpRequest options", optionsJson);
					return adapter
						.httpRequest(url, options)
						.then((result) => JSON.stringify(result));
				},
			);

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

					const options = this.parseJsonWithLimit<{
						serverId: number;
						port?: number;
						hostname?: string;
					}>("network.httpServer.listen options", optionsJson);

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
								return this.parseJsonWithLimit<{
									status: number;
									headers?: Array<[string, string]>;
									body?: string;
									bodyEncoding?: "utf8" | "base64";
								}>("network.httpServer response", String(responseJson));
							},
						});
						this.activeHttpServerIds.add(options.serverId);
						return JSON.stringify(result);
					})();
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
		const initialCwd = this.processConfig.cwd ?? "/";
		await jail.set(
			"__runtimeBridgeSetupConfig",
			{
				initialCwd,
				jsonPayloadLimitBytes: this.isolateJsonPayloadLimitBytes,
				payloadLimitErrorCode: PAYLOAD_LIMIT_ERROR_CODE,
			},
			{ copy: true },
		);
		await context.eval(getInitialBridgeGlobalsSetupCode());

		// Load the bridge bundle which sets up all polyfill modules.
		await jail.set(
			HOST_BRIDGE_GLOBAL_KEYS.processConfig,
			this.createProcessConfigForExecution(timingMitigation, frozenTimeMs),
			{ copy: true },
		);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.osConfig, this.osConfig, {
			copy: true,
		});
		await context.eval(getRawBridgeCode());
		await context.eval(getBridgeAttachCode());
		await this.applyTimingMitigation(context, timingMitigation, frozenTimeMs);

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
		timingMitigation: TimingMitigation,
		frozenTimeMs: number,
	): Promise<void> {
		await this.setupRequire(context, jail, timingMitigation, frozenTimeMs);
	}

	/**
	 * Run code and return the value of module.exports (CJS) or the ESM namespace
	 * object (including default and named exports), along with exit code.
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

	private emitConsoleEvent(
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
	private async setupConsole(
		context: ivm.Context,
		jail: ivm.Reference<Record<string, unknown>>,
		onStdio?: StdioHook,
	): Promise<void> {
		const logRef = new ivm.Reference((msg: string) => {
			this.emitConsoleEvent(onStdio, {
				channel: "stdout",
				message: String(msg),
			});
		});
		const errorRef = new ivm.Reference((msg: string) => {
			this.emitConsoleEvent(onStdio, {
				channel: "stderr",
				message: String(msg),
			});
		});

		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.log, logRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.error, errorRef);

		await context.eval(getConsoleSetupCode());
	}

	/**
	 * Execute code like a script.
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
			cpuTimeLimitMs: options?.cpuTimeLimitMs,
			timingMitigation: options?.timingMitigation,
			onStdio: options?.onStdio,
		});

		return {
			code: result.code,
			errorMessage: result.errorMessage,
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
		cpuTimeLimitMs?: number;
		timingMitigation?: TimingMitigation;
		onStdio?: StdioHook;
	}): Promise<RunResult<T>> {
		return executeWithRuntime<T>(
			{
				isolate: this.isolate,
				esmModuleCache: this.esmModuleCache,
				dynamicImportCache: this.dynamicImportCache,
				dynamicImportPending: this.dynamicImportPending,
				moduleFormatCache: this.moduleFormatCache,
				packageTypeCache: this.packageTypeCache,
				activeHttpServerIds: this.activeHttpServerIds,
				getTimingMitigation: (mode) => this.getTimingMitigation(mode),
				getExecutionTimeoutMs: (override) =>
					this.getExecutionTimeoutMs(override),
				getExecutionDeadlineMs: (timeoutMs) =>
					this.getExecutionDeadlineMs(timeoutMs),
				setupConsole: (context, jail, onStdio) =>
					this.setupConsole(
						context,
						jail,
						onStdio ?? this.onStdio,
					),
				shouldRunAsESM: (code, filePath) =>
					this.shouldRunAsESM(code, filePath),
				setupESMGlobals: (context, jail, timingMitigation, frozenTimeMs) =>
					this.setupESMGlobals(
						context,
						jail,
						timingMitigation,
						frozenTimeMs,
					),
				applyExecutionOverrides: (context, env, cwd, stdin) =>
					this.applyExecutionOverrides(context, env, cwd, stdin),
				precompileDynamicImports: (transformedCode, context, referrerPath) =>
					this.precompileDynamicImports(transformedCode, context, referrerPath),
				setupDynamicImport: (context, jail, referrerPath, executionDeadlineMs) =>
					this.setupDynamicImport(
						context,
						jail,
						referrerPath,
						executionDeadlineMs,
					),
				runESM: (code, context, filePath, executionDeadlineMs) =>
					this.runESM(code, context, filePath, executionDeadlineMs),
				setupRequire: (context, jail, timingMitigation, frozenTimeMs) =>
					this.setupRequire(context, jail, timingMitigation, frozenTimeMs),
				initCommonJsModuleGlobals: (context) =>
					this.initCommonJsModuleGlobals(context),
				applyCustomGlobalExposurePolicy: (context) =>
					this.applyCustomGlobalExposurePolicy(context),
				setCommonJsFileGlobals: (context, filePath) =>
					this.setCommonJsFileGlobals(context, filePath),
				awaitScriptResult: (context, executionDeadlineMs) =>
					this.awaitScriptResult(context, executionDeadlineMs),
				getExecutionRunOptions: (executionDeadlineMs) =>
					this.getExecutionRunOptions(executionDeadlineMs),
				runWithExecutionDeadline: (operation, executionDeadlineMs) =>
					this.runWithExecutionDeadline(operation, executionDeadlineMs),
				isExecutionTimeoutError: (error) => this.isExecutionTimeoutError(error),
				recycleIsolate: () => this.recycleIsolate(),
				timeoutErrorMessage: TIMEOUT_ERROR_MESSAGE,
				timeoutExitCode: TIMEOUT_EXIT_CODE,
			},
			options,
		);
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
	 * Initialize mutable CommonJS globals before script execution.
	 */
	private async initCommonJsModuleGlobals(context: ivm.Context): Promise<void> {
		await context.eval(getIsolateRuntimeSource("initCommonjsModuleGlobals"));
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
		await context.global.set(
			"__runtimeCommonJsFileConfig",
			{ filePath, dirname },
			{ copy: true },
		);
		await context.eval(getIsolateRuntimeSource("setCommonjsFileGlobals"));
	}

	/**
	 * Apply descriptor policy to custom globals before user code executes.
	 */
	private async applyCustomGlobalExposurePolicy(context: ivm.Context): Promise<void> {
		await context.global.set(
			"__runtimeCustomGlobalPolicy",
			{
				hardenedGlobals: HARDENED_NODE_CUSTOM_GLOBALS,
				mutableGlobals: MUTABLE_NODE_CUSTOM_GLOBALS,
			},
			{ copy: true },
		);
		await context.eval(getIsolateRuntimeSource("applyCustomGlobalPolicy"));
	}

	/**
	 * Await script result when eval() returns a Promise.
	 */
	private async awaitScriptResult(
		context: ivm.Context,
		executionDeadlineMs?: number,
	): Promise<void> {
		const hasPromise = await context.eval(
			"globalThis.__scriptResult__ && typeof globalThis.__scriptResult__.then === 'function'",
			{
				copy: true,
				...this.getExecutionRunOptions(executionDeadlineMs),
			},
		);
		if (hasPromise) {
			await this.runWithExecutionDeadline(
				context.eval("globalThis.__scriptResult__", {
					promise: true,
					...this.getExecutionRunOptions(executionDeadlineMs),
				}),
				executionDeadlineMs,
			);
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
			// Merge provided env with existing env.
			await context.global.set("__runtimeProcessEnvOverride", filtered, {
				copy: true,
			});
			await context.eval(getIsolateRuntimeSource("overrideProcessEnv"));
		}
		if (cwd) {
			// Override cwd.
			await context.global.set("__runtimeProcessCwdOverride", cwd, {
				copy: true,
			});
			await context.eval(getIsolateRuntimeSource("overrideProcessCwd"));
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
		// The bridge exposes these variables for stdin management.
		// We need to set them before the script runs so readline can access them.
		await context.global.set("__runtimeStdinData", stdin, { copy: true });
		await context.eval(getIsolateRuntimeSource("setStdinData"));
	}

	private createIsolate(): ivm.Isolate {
		return this.runtimeCreateIsolate(this.memoryLimit);
	}

	private recycleIsolate(): void {
		if (this.disposed) {
			return;
		}
		this.isolate.dispose();
		this.isolate = this.createIsolate();
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
