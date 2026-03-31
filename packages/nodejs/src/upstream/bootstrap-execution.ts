import { existsSync } from "node:fs";
import {
	mkdir as mkdirHost,
	mkdtemp,
	rm,
	symlink as symlinkHost,
	writeFile as writeHostFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type {
	DriverProcess,
	ExecOptions,
	ExecResult,
	KernelInterface,
	KernelRuntimeDriver,
	NodeRuntimeDriver,
	NodeRuntimeDriverFactory,
	RunResult,
	RuntimeDriverOptions,
	StdioHook,
	ProcessContext,
	VirtualFileSystem,
} from "@secure-exec/core";

export interface UpstreamBootstrapEvalRequest {
	code?: string;
	filePath?: string;
	cwd?: string;
	env?: Record<string, string>;
	argv?: string[];
	execArgv?: string[];
	vendoredPublicBuiltins?: string[];
	awaitCompletionSignal?: boolean;
	liveStdio?: boolean;
	stdinIsTTY?: boolean;
	stdoutIsTTY?: boolean;
	stderrIsTTY?: boolean;
	terminalColumns?: number;
	terminalRows?: number;
}

export interface UpstreamBootstrapEvalResult {
	status: "blocked" | "pass";
	summary: string;
	entrypoint?: string;
	code: number;
	stdout: string;
	stderr: string;
	errorMessage?: string;
	stack?: string;
	bootstrapPhases?: string[];
	internalBindings?: string[];
	publicBuiltinFallbacks?: string[];
	vendoredPublicBuiltinsLoaded?: string[];
	fsBackendAbiVersion?: number;
	fsBackendArtifacts?: string[];
	fsBackendOperations?: string[];
	appliedBindingShims?: string[];
}

export interface ExperimentalUpstreamBootstrapOptions {
	vendoredPublicBuiltins?: readonly string[];
	awaitCompletionSignal?: boolean;
	awaitCompletionSignalMode?: "always" | "auto";
}

const DEFAULT_RUNNER_TIMEOUT_MS = 20_000;
const textEncoder = new TextEncoder();
const FS_FIRST_LIGHT_PUBLIC_BUILTINS = ["fs"] as const;
const NET_FIRST_LIGHT_PUBLIC_BUILTINS = ["net"] as const;
const READLINE_FIRST_LIGHT_PUBLIC_BUILTINS = [
	"readline",
	"readline/promises",
] as const;
const HTTP_FIRST_LIGHT_PUBLIC_BUILTINS = [
	"net",
	"http",
	"https",
	"_http_agent",
	"_http_client",
	"_http_common",
	"_http_incoming",
	"_http_outgoing",
	"_http_server",
] as const;
const REPLACEMENT_PUBLIC_BUILTINS = [
	"fs",
	...HTTP_FIRST_LIGHT_PUBLIC_BUILTINS,
	...READLINE_FIRST_LIGHT_PUBLIC_BUILTINS,
] as const;

function getBootstrapRunnerPath(): string {
	return fileURLToPath(
		new URL("../../scripts/run-upstream-node-bootstrap.mjs", import.meta.url),
	);
}

function getBootstrapRunnerEnv(
	extraEnv: Record<string, string> = {},
): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		...extraEnv,
	};
	delete env.NODE_CHANNEL_FD;
	delete env.NODE_UNIQUE_ID;
	return env;
}

function emitBufferedStdio(
	stdout: string,
	stderr: string,
	...hooks: Array<StdioHook | undefined>
): void {
	for (const hook of hooks) {
		if (!hook) {
			continue;
		}
		if (stdout.length > 0) {
			hook({ channel: "stdout", message: stdout });
		}
		if (stderr.length > 0) {
			hook({ channel: "stderr", message: stderr });
		}
	}
}

export async function runUpstreamBootstrapEval(
	request: UpstreamBootstrapEvalRequest,
): Promise<UpstreamBootstrapEvalResult> {
	return new Promise<UpstreamBootstrapEvalResult>((resolve, reject) => {
		const child = spawn(
			process.execPath,
			["--expose-internals", "--no-warnings", getBootstrapRunnerPath()],
			{
				stdio: ["pipe", "pipe", "pipe"],
				env: getBootstrapRunnerEnv(),
			},
		);

		let stdout = "";
		let stderr = "";
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, DEFAULT_RUNNER_TIMEOUT_MS);

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.on("close", (code, signal) => {
			clearTimeout(timeout);
			if (timedOut) {
				reject(
					new Error(
						`upstream bootstrap runner timed out after ${DEFAULT_RUNNER_TIMEOUT_MS}ms`,
					),
				);
				return;
			}

			const trimmed = stdout.trim();
			if (!trimmed) {
				reject(
					new Error(
						`upstream bootstrap runner produced no JSON output (code ${code ?? "unknown"}${signal ? `, signal ${signal}` : ""})${stderr ? `: ${stderr.trim()}` : ""}`,
					),
				);
				return;
			}

			try {
				resolve(JSON.parse(trimmed) as UpstreamBootstrapEvalResult);
			} catch (error) {
				reject(
					new Error(
						`failed to parse upstream bootstrap runner JSON: ${error instanceof Error ? error.message : String(error)}\n${trimmed}`,
					),
				);
			}
		});

		child.stdin.end(JSON.stringify(request));
	});
}

function normalizeVendoredPublicBuiltins(
	values: readonly string[] | undefined,
): string[] {
	if (!values || values.length === 0) {
		return [];
	}
	return [...new Set(values)];
}

function shouldAwaitCompletionSignal(
	mode: "always" | "auto" | undefined,
	code: string,
): boolean {
	if (mode === "always") {
		return true;
	}
	if (mode === "auto") {
		return code.includes("__secureExecDone");
	}
	return false;
}

function parseTerminalDimension(value: string | undefined): number | undefined {
	if (typeof value !== "string" || value.length === 0) {
		return undefined;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

interface StagedUpstreamEntry {
	entryFilePath: string;
	cwd?: string;
	cleanup(): Promise<void>;
}

function normalizeVirtualPath(filePath: string, cwd?: string): string {
	if (filePath.startsWith("/")) {
		return path.posix.normalize(filePath);
	}
	return path.posix.normalize(path.posix.join(cwd ?? "/", filePath));
}

function getHostPathForVirtualPath(stageRoot: string, virtualPath: string): string {
	const normalized = path.posix.normalize(virtualPath);
	const relativePath = normalized === "/" ? "" : normalized.slice(1);
	return path.join(stageRoot, relativePath);
}

async function findNearestVirtualPackageRoot(
	filesystem: VirtualFileSystem,
	filePath: string,
): Promise<string | null> {
	let currentDir = path.posix.dirname(path.posix.normalize(filePath));
	while (true) {
		const packageJsonPath =
			currentDir === "/"
				? "/package.json"
				: path.posix.join(currentDir, "package.json");
		if (await filesystem.exists(packageJsonPath)) {
			return currentDir;
		}
		if (currentDir === "/") {
			return null;
		}
		currentDir = path.posix.dirname(currentDir);
	}
}

async function copyVirtualPathToHost(
	filesystem: VirtualFileSystem,
	virtualPath: string,
	stageRoot: string,
): Promise<void> {
	const stat = await filesystem.lstat(virtualPath);
	const hostPath = getHostPathForVirtualPath(stageRoot, virtualPath);

	if (stat.isSymbolicLink) {
		await mkdirHost(path.dirname(hostPath), { recursive: true });
		await symlinkHost(await filesystem.readlink(virtualPath), hostPath);
		return;
	}

	if (stat.isDirectory) {
		await mkdirHost(hostPath, { recursive: true });
		return;
	}

	await mkdirHost(path.dirname(hostPath), { recursive: true });
	await writeHostFile(hostPath, await filesystem.readFile(virtualPath));
}

function extractRelativeSpecifiers(source: string): string[] {
	const matches = source.matchAll(
		/(?:\brequire\s*\(\s*|(?:\bimport|\bexport)\s+(?:[^"'`]*?\s+from\s+)?|\bimport\s*\(\s*)["'](\.\.?\/[^"'`]+)["']/g,
	);
	return [...new Set([...matches].map((match) => match[1]).filter(Boolean))];
}

async function stageNearestVirtualPackageJson(
	filesystem: VirtualFileSystem,
	filePath: string,
	stageRoot: string,
	stagedPaths: Set<string>,
): Promise<void> {
	const packageRoot = await findNearestVirtualPackageRoot(filesystem, filePath);
	if (!packageRoot) {
		return;
	}
	const packageJsonPath =
		packageRoot === "/"
			? "/package.json"
			: path.posix.join(packageRoot, "package.json");
	if (stagedPaths.has(packageJsonPath)) {
		return;
	}
	await copyVirtualPathToHost(filesystem, packageJsonPath, stageRoot);
	stagedPaths.add(packageJsonPath);
}

async function resolveVirtualModuleDependency(
	filesystem: VirtualFileSystem,
	referrerFilePath: string,
	specifier: string,
): Promise<string | null> {
	const basePath = path.posix.resolve(path.posix.dirname(referrerFilePath), specifier);
	const fileCandidates = [
		basePath,
		`${basePath}.js`,
		`${basePath}.mjs`,
		`${basePath}.cjs`,
		`${basePath}.json`,
	];

	for (const candidate of fileCandidates) {
		if (!await filesystem.exists(candidate)) {
			continue;
		}
		const stat = await filesystem.lstat(candidate);
		if (!stat.isDirectory) {
			return candidate;
		}
	}

	if (await filesystem.exists(basePath)) {
		const stat = await filesystem.lstat(basePath);
		if (stat.isDirectory) {
			const packageJsonPath = path.posix.join(basePath, "package.json");
			if (await filesystem.exists(packageJsonPath)) {
				try {
					const packageJson = JSON.parse(
						await filesystem.readTextFile(packageJsonPath),
					) as { main?: string };
					if (typeof packageJson.main === "string") {
						const mainPath = await resolveVirtualModuleDependency(
							filesystem,
							packageJsonPath,
							packageJson.main,
						);
						if (mainPath) {
							return mainPath;
						}
					}
				} catch {
					// Ignore malformed package metadata while staging test-only closures.
				}
			}

			for (const extension of [".js", ".mjs", ".cjs", ".json"]) {
				const indexPath = path.posix.join(basePath, `index${extension}`);
				if (await filesystem.exists(indexPath)) {
					return indexPath;
				}
			}
		}
	}

	return null;
}

async function stageVirtualModuleClosure(
	filesystem: VirtualFileSystem,
	filePath: string,
	stageRoot: string,
	stagedPaths: Set<string>,
	visitedFiles: Set<string>,
): Promise<void> {
	if (visitedFiles.has(filePath)) {
		return;
	}
	visitedFiles.add(filePath);

	if (!stagedPaths.has(filePath)) {
		await copyVirtualPathToHost(filesystem, filePath, stageRoot);
		stagedPaths.add(filePath);
	}

	await stageNearestVirtualPackageJson(filesystem, filePath, stageRoot, stagedPaths);

	const lowerPath = filePath.toLowerCase();
	if (
		!lowerPath.endsWith(".js") &&
		!lowerPath.endsWith(".mjs") &&
		!lowerPath.endsWith(".cjs") &&
		!lowerPath.endsWith(".ts") &&
		!lowerPath.endsWith(".mts") &&
		!lowerPath.endsWith(".cts")
	) {
		return;
	}

	const source = await filesystem.readTextFile(filePath);
	for (const specifier of extractRelativeSpecifiers(source)) {
		const dependencyPath = await resolveVirtualModuleDependency(
			filesystem,
			filePath,
			specifier,
		);
		if (!dependencyPath) {
			continue;
		}
		await stageVirtualModuleClosure(
			filesystem,
			dependencyPath,
			stageRoot,
			stagedPaths,
			visitedFiles,
		);
	}
}

async function stageUpstreamEntryFromFilesystem(
	filesystem: VirtualFileSystem | undefined,
	filePath: string | undefined,
	code: string | undefined,
	cwd: string | undefined,
): Promise<StagedUpstreamEntry | null> {
	if (typeof filePath !== "string" || filePath.length === 0) {
		return null;
	}

	const logicalFilePath = normalizeVirtualPath(filePath, cwd);
	const logicalCwd =
		typeof cwd === "string" && cwd.length > 0
			? normalizeVirtualPath(cwd)
			: undefined;

	if (existsSync(logicalFilePath)) {
		return {
			entryFilePath: logicalFilePath,
			cwd: logicalCwd && existsSync(logicalCwd) ? logicalCwd : undefined,
			cleanup: async () => {},
		};
	}

	const stageRoot = await mkdtemp(
		path.join(os.tmpdir(), "secure-exec-upstream-entry-"),
	);

	try {
		if (filesystem && await filesystem.exists(logicalFilePath)) {
			await stageVirtualModuleClosure(
				filesystem,
				logicalFilePath,
				stageRoot,
				new Set<string>(),
				new Set<string>(),
			);
		}

		const stagedEntryFilePath = getHostPathForVirtualPath(stageRoot, logicalFilePath);
		if (typeof code === "string") {
			await mkdirHost(path.dirname(stagedEntryFilePath), { recursive: true });
			await writeHostFile(stagedEntryFilePath, code, "utf8");
		}

		const stagedCwd =
			typeof logicalCwd === "string"
				? getHostPathForVirtualPath(stageRoot, logicalCwd)
				: undefined;

		return {
			entryFilePath: stagedEntryFilePath,
			cwd: stagedCwd,
			cleanup: async () => {
				await rm(stageRoot, { recursive: true, force: true });
			},
		};
	} catch (error) {
		await rm(stageRoot, { recursive: true, force: true });
		throw error;
	}
}

class ExperimentalUpstreamBootstrapRuntimeDriver implements NodeRuntimeDriver {
	readonly #runtime: RuntimeDriverOptions["runtime"];
	readonly #filesystem?: VirtualFileSystem;
	readonly #defaultOnStdio?: StdioHook;
	readonly #vendoredPublicBuiltins: string[];
	readonly #awaitCompletionSignalMode?: "always" | "auto";

	constructor(
		options: RuntimeDriverOptions & ExperimentalUpstreamBootstrapOptions,
	) {
		this.#runtime = options.runtime;
		this.#filesystem = options.system.filesystem;
		this.#defaultOnStdio = options.onStdio;
		this.#vendoredPublicBuiltins = normalizeVendoredPublicBuiltins(
			options.vendoredPublicBuiltins,
		);
		this.#awaitCompletionSignalMode =
			options.awaitCompletionSignalMode ??
			(options.awaitCompletionSignal === true ? "always" : undefined);
	}

	async exec(code: string, options: ExecOptions = {}): Promise<ExecResult> {
		const stagedEntry = await stageUpstreamEntryFromFilesystem(
			this.#filesystem,
			options.filePath,
			code,
			options.cwd ?? this.#runtime.process.cwd,
		);

		try {
			const effectiveFilePath = stagedEntry?.entryFilePath ?? options.filePath;
			const effectiveCwd = stagedEntry?.cwd ?? options.cwd;
			const result = await runUpstreamBootstrapEval({
				code,
				filePath: effectiveFilePath,
				cwd: effectiveCwd,
				env: {
					...(this.#runtime.process.env ?? {}),
					...(options.env ?? {}),
				},
				argv:
					effectiveFilePath !== undefined
						? [process.execPath, effectiveFilePath]
						: this.#runtime.process.argv,
				vendoredPublicBuiltins:
					this.#vendoredPublicBuiltins.length > 0
						? [...this.#vendoredPublicBuiltins]
						: undefined,
				awaitCompletionSignal: shouldAwaitCompletionSignal(
					this.#awaitCompletionSignalMode,
					code,
				),
			});

			emitBufferedStdio(
				result.stdout,
				result.stderr,
				this.#defaultOnStdio,
				options.onStdio,
			);

			if (result.status === "blocked") {
				return {
					code: 1,
					errorMessage: result.errorMessage ?? result.summary,
				};
			}

			return {
				code: result.code,
				errorMessage:
					result.code === 0 ? undefined : result.stderr || result.summary,
			};
		} finally {
			await stagedEntry?.cleanup();
		}
	}

	async run<T = unknown>(code: string, filePath?: string): Promise<RunResult<T>> {
		const result = await this.exec(code, { mode: "run", filePath });
		return {
			code: result.code,
			errorMessage: result.errorMessage,
		};
	}

	dispose(): void {}
}

export function createExperimentalUpstreamBootstrapRuntimeDriverFactory(
	options: ExperimentalUpstreamBootstrapOptions = {},
): NodeRuntimeDriverFactory {
	const vendoredPublicBuiltins = normalizeVendoredPublicBuiltins(
		options.vendoredPublicBuiltins,
	);
	const awaitCompletionSignalMode =
		options.awaitCompletionSignalMode ??
		(options.awaitCompletionSignal === true ? "always" : undefined);
	return {
		createRuntimeDriver: (options) =>
			new ExperimentalUpstreamBootstrapRuntimeDriver({
				...options,
				awaitCompletionSignalMode,
				vendoredPublicBuiltins,
			}),
	};
}

export async function runUpstreamFsFirstLightEval(
	request: Omit<UpstreamBootstrapEvalRequest, "vendoredPublicBuiltins">,
): Promise<UpstreamBootstrapEvalResult> {
	return runUpstreamBootstrapEval({
		...request,
		awaitCompletionSignal: true,
		vendoredPublicBuiltins: [...FS_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

export async function runUpstreamNetFirstLightEval(
	request: Omit<UpstreamBootstrapEvalRequest, "vendoredPublicBuiltins">,
): Promise<UpstreamBootstrapEvalResult> {
	return runUpstreamBootstrapEval({
		...request,
		awaitCompletionSignal: true,
		vendoredPublicBuiltins: [...NET_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

export async function runUpstreamHttpFirstLightEval(
	request: Omit<UpstreamBootstrapEvalRequest, "vendoredPublicBuiltins">,
): Promise<UpstreamBootstrapEvalResult> {
	return runUpstreamBootstrapEval({
		...request,
		awaitCompletionSignal: true,
		vendoredPublicBuiltins: [...HTTP_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

export async function runUpstreamReadlineFirstLightEval(
	request: Omit<UpstreamBootstrapEvalRequest, "vendoredPublicBuiltins">,
): Promise<UpstreamBootstrapEvalResult> {
	return runUpstreamBootstrapEval({
		...request,
		awaitCompletionSignal: true,
		vendoredPublicBuiltins: [...READLINE_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

export function createExperimentalUpstreamFsFirstLightRuntimeDriverFactory(): NodeRuntimeDriverFactory {
	return createExperimentalUpstreamBootstrapRuntimeDriverFactory({
		awaitCompletionSignalMode: "always",
		vendoredPublicBuiltins: [...FS_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

/**
 * Internal-only helper-child runtime factory for upstream bring-up coverage.
 * Public product surfaces must stay on NodeExecutionDriver/secure-exec-v8 until
 * this loader can execute inside the real V8 session.
 */
export function createReplacementNodeRuntimeDriverFactory(): NodeRuntimeDriverFactory {
	return createExperimentalUpstreamBootstrapRuntimeDriverFactory({
		awaitCompletionSignalMode: "auto",
		vendoredPublicBuiltins: [...REPLACEMENT_PUBLIC_BUILTINS],
	});
}

function createImmediateProcessExit(
	exitCode: number,
	stderr: string,
	ctx: ProcessContext,
): DriverProcess {
	let resolved = false;
	let resolveExit!: (code: number) => void;
	const exitPromise = new Promise<number>((resolve) => {
		resolveExit = resolve;
	});

	const proc: DriverProcess = {
		onStdout: null,
		onStderr: null,
		onExit: null,
		writeStdin() {},
		closeStdin() {},
		kill() {
			if (resolved) {
				return;
			}
			resolved = true;
			resolveExit(exitCode);
			proc.onExit?.(exitCode);
		},
		wait: () => exitPromise,
	};

	queueMicrotask(() => {
		if (stderr.length > 0) {
			const data = textEncoder.encode(stderr);
			ctx.onStderr?.(data);
			proc.onStderr?.(data);
		}
		if (!resolved) {
			resolved = true;
			resolveExit(exitCode);
			proc.onExit?.(exitCode);
		}
	});

	return proc;
}

function extractEvalCode(args: string[]): string | null {
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if ((arg === "-e" || arg === "--eval") && typeof args[index + 1] === "string") {
			return args[index + 1];
		}
	}
	return null;
}

interface ExtractedFileEntry {
	filePath: string;
	scriptArgs: string[];
}

function extractFileEntry(args: string[]): ExtractedFileEntry | null {
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "-e" || arg === "--eval" || arg === "-p" || arg === "--print") {
			return null;
		}
		if (arg.startsWith("-")) {
			continue;
		}
		return {
			filePath: arg,
			scriptArgs: args.slice(index + 1),
		};
	}
	return null;
}

class ExperimentalUpstreamBootstrapKernelRuntime implements KernelRuntimeDriver {
	readonly name = "node-upstream-bootstrap";
	readonly commands = ["node"];
	readonly #vendoredPublicBuiltins: string[];
	readonly #awaitCompletionSignalMode?: "always" | "auto";
	#kernel: KernelInterface | null = null;

	constructor(options: ExperimentalUpstreamBootstrapOptions = {}) {
		this.#vendoredPublicBuiltins = normalizeVendoredPublicBuiltins(
			options.vendoredPublicBuiltins,
		);
		this.#awaitCompletionSignalMode =
			options.awaitCompletionSignalMode ??
			(options.awaitCompletionSignal === true ? "always" : undefined);
	}

	async init(kernel: KernelInterface): Promise<void> {
		this.#kernel = kernel;
	}

	#createLiveProcess(
		code: string,
		ctx: ProcessContext,
	): DriverProcess {
		if (!this.#kernel) {
			return createImmediateProcessExit(
				1,
				`${this.name} was spawned before init() stored the kernel interface`,
				ctx,
			);
		}

		const kernel = this.#kernel;
		const child = spawn(
			process.execPath,
			["--expose-internals", "--no-warnings", getBootstrapRunnerPath()],
			{
				stdio: ["pipe", "pipe", "pipe", "ipc"],
				env: getBootstrapRunnerEnv({
					SECURE_EXEC_UPSTREAM_LIVE_STDIO: "1",
				}),
			},
		);
		const childStdin = child.stdin;
		const childStdout = child.stdout;
		const childStderr = child.stderr;
		if (!childStdin || !childStdout || !childStderr) {
			return createImmediateProcessExit(
				1,
				`${this.name} failed to allocate child stdio pipes for live PTY mode`,
				ctx,
			);
		}

		let resolved = false;
		let stdinClosed = false;
		let resolveExit!: (code: number) => void;
		const exitPromise = new Promise<number>((resolve) => {
			resolveExit = resolve;
		});

		const finish = (code: number) => {
			if (resolved) {
				return;
			}
			resolved = true;
			resolveExit(code);
			proc.onExit?.(code);
		};

		const emitOutput = (
			channel: "stdout" | "stderr",
			chunk: Uint8Array,
		) => {
			if (channel === "stdout") {
				ctx.onStdout?.(chunk);
				proc.onStdout?.(chunk);
				return;
			}
			ctx.onStderr?.(chunk);
			proc.onStderr?.(chunk);
		};

		const closeChildStdin = () => {
			if (stdinClosed) {
				return;
			}
			stdinClosed = true;
			childStdin.end();
		};

		const proc: DriverProcess = {
			onStdout: null,
			onStderr: null,
			onExit: null,
			writeStdin(data) {
				if (ctx.stdinIsTTY || stdinClosed || childStdin.destroyed) {
					return;
				}
				childStdin.write(data);
			},
			closeStdin() {
				closeChildStdin();
			},
			kill(signal) {
				if (resolved) {
					return;
				}
				if (signal === 28) {
					if (child.connected) {
						child.send({ type: "signal", signal: "SIGWINCH" });
					}
					return;
				}
				child.kill(signal as number);
			},
			wait: () => exitPromise,
		};

		childStdout.on("data", (chunk: Buffer) => {
			emitOutput("stdout", new Uint8Array(chunk));
		});
		childStderr.on("data", (chunk: Buffer) => {
			emitOutput("stderr", new Uint8Array(chunk));
		});
		child.on("message", (message) => {
			if (
				!message ||
				typeof message !== "object" ||
				(message as { type?: unknown }).type !== "pty-set-raw-mode" ||
				ctx.stdinIsTTY !== true
			) {
				return;
			}
			const mode = (message as { mode?: unknown }).mode === true;
			kernel.tcsetattr(ctx.pid, ctx.fds.stdin, {
				icanon: !mode,
				echo: !mode,
				isig: !mode,
				icrnl: !mode,
			});
		});
		child.on("error", (error) => {
			emitOutput(
				"stderr",
				textEncoder.encode(
					error instanceof Error ? error.message : String(error),
				),
			);
			finish(1);
		});
		child.on("close", (code) => {
			closeChildStdin();
			finish(typeof code === "number" ? code : 1);
		});

		child.send({
			code,
			cwd: ctx.cwd,
			env: ctx.env,
			argv: ["node", "-e", code],
			execArgv: [],
			vendoredPublicBuiltins:
				this.#vendoredPublicBuiltins.length > 0
					? [...this.#vendoredPublicBuiltins]
					: undefined,
			awaitCompletionSignal: shouldAwaitCompletionSignal(
				this.#awaitCompletionSignalMode,
				code,
			),
			liveStdio: true,
			stdinIsTTY: ctx.stdinIsTTY,
			stdoutIsTTY: ctx.stdoutIsTTY,
			stderrIsTTY: ctx.stderrIsTTY,
			terminalColumns: parseTerminalDimension(ctx.env.COLUMNS),
			terminalRows: parseTerminalDimension(ctx.env.LINES),
		} satisfies UpstreamBootstrapEvalRequest);

		if (ctx.stdinIsTTY) {
			queueMicrotask(async () => {
				try {
					while (!resolved) {
						const chunk = await kernel.fdRead(ctx.pid, ctx.fds.stdin, 4096);
						if (resolved) {
							break;
						}
						if (chunk.length === 0) {
							closeChildStdin();
							break;
						}
						if (!childStdin.write(chunk)) {
							await new Promise<void>((resolve) => {
								childStdin.once("drain", resolve);
							});
						}
					}
				} catch {
					closeChildStdin();
				}
			});
		}

		return proc;
	}

	spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
		if (command !== "node") {
			return createImmediateProcessExit(
				1,
				`unsupported command for ${this.name}: ${command}`,
				ctx,
			);
		}

		const code = extractEvalCode(args);
		const fileEntry = code === null ? extractFileEntry(args) : null;
		if (code === null && fileEntry === null) {
			return createImmediateProcessExit(
				1,
				`${this.name} only supports \`node -e <code>\` or \`node <file>\` during the bootstrap bring-up story`,
				ctx,
			);
		}

		if (
			ctx.streamStdin === true ||
			ctx.stdinIsTTY === true ||
			ctx.stdoutIsTTY === true ||
			ctx.stderrIsTTY === true
		) {
			if (fileEntry !== null) {
				return createImmediateProcessExit(
					1,
					`${this.name} does not yet support PTY/live-stdio file entrypoints`,
					ctx,
				);
			}
			return this.#createLiveProcess(code ?? "", ctx);
		}

		let resolved = false;
		let resolveExit!: (code: number) => void;
		const exitPromise = new Promise<number>((resolve) => {
			resolveExit = resolve;
		});

		const proc: DriverProcess = {
			onStdout: null,
			onStderr: null,
			onExit: null,
			writeStdin() {},
			closeStdin() {},
			kill() {
				if (resolved) {
					return;
				}
				resolved = true;
				resolveExit(1);
				proc.onExit?.(1);
			},
			wait: () => exitPromise,
		};

		queueMicrotask(async () => {
			try {
				const stagedEntry =
					fileEntry === null
						? null
						: await stageUpstreamEntryFromFilesystem(
								this.#kernel?.vfs,
								fileEntry.filePath,
								undefined,
								ctx.cwd,
							);

				try {
					const effectiveFilePath =
						stagedEntry?.entryFilePath ?? fileEntry?.filePath;
					const effectiveCwd = stagedEntry?.cwd ?? ctx.cwd;
					const result = await runUpstreamBootstrapEval({
						code: code ?? undefined,
						filePath: effectiveFilePath,
						cwd: effectiveCwd,
						env: ctx.env,
						argv:
							fileEntry === null
								? ["node", "-e", code ?? ""]
								: [
										"node",
										effectiveFilePath ?? fileEntry.filePath,
										...fileEntry.scriptArgs,
									],
						execArgv: [],
						vendoredPublicBuiltins:
							this.#vendoredPublicBuiltins.length > 0
								? [...this.#vendoredPublicBuiltins]
								: undefined,
						awaitCompletionSignal:
							code === null
								? false
								: shouldAwaitCompletionSignal(
										this.#awaitCompletionSignalMode,
										code,
									),
					});
				const stdout = result.stdout;
				const stderr =
					result.status === "pass"
						? result.stderr
						: result.stderr || result.errorMessage || result.summary;
				if (stdout.length > 0) {
					const data = textEncoder.encode(stdout);
					ctx.onStdout?.(data);
					proc.onStdout?.(data);
				}
				if (stderr.length > 0) {
					const data = textEncoder.encode(stderr);
					ctx.onStderr?.(data);
					proc.onStderr?.(data);
				}
				const exitCode = result.status === "pass" ? result.code : 1;
				if (!resolved) {
					resolved = true;
					resolveExit(exitCode);
					proc.onExit?.(exitCode);
				}
				} finally {
					await stagedEntry?.cleanup();
				}
			} catch (error) {
				const data = textEncoder.encode(
					error instanceof Error ? error.message : String(error),
				);
				ctx.onStderr?.(data);
				proc.onStderr?.(data);
				if (!resolved) {
					resolved = true;
					resolveExit(1);
					proc.onExit?.(1);
				}
			}
		});

		return proc;
	}

	tryResolve(command: string): boolean {
		return command === "node";
	}

	async dispose(): Promise<void> {
		this.#kernel = null;
	}
}

export function createExperimentalUpstreamBootstrapKernelRuntime(
	options: ExperimentalUpstreamBootstrapOptions = {},
): KernelRuntimeDriver {
	return new ExperimentalUpstreamBootstrapKernelRuntime(options);
}

export function createExperimentalUpstreamFsFirstLightKernelRuntime(): KernelRuntimeDriver {
	return createExperimentalUpstreamBootstrapKernelRuntime({
		awaitCompletionSignalMode: "always",
		vendoredPublicBuiltins: [...FS_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

/**
 * Internal-only helper-child kernel runtime for upstream bring-up coverage.
 * Public `createNodeRuntime()` must stay on the V8-backed kernel runtime until
 * the upstream loader no longer depends on `node --expose-internals`.
 */
export function createReplacementNodeKernelRuntime(): KernelRuntimeDriver {
	return createExperimentalUpstreamBootstrapKernelRuntime({
		awaitCompletionSignalMode: "auto",
		vendoredPublicBuiltins: [...REPLACEMENT_PUBLIC_BUILTINS],
	});
}
