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
} from "@secure-exec/core";

export interface UpstreamBootstrapEvalRequest {
	code: string;
	cwd?: string;
	env?: Record<string, string>;
	argv?: string[];
	execArgv?: string[];
	vendoredPublicBuiltins?: string[];
	awaitCompletionSignal?: boolean;
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
const REPLACEMENT_PUBLIC_BUILTINS = ["fs", "net"] as const;

function getBootstrapRunnerPath(): string {
	return fileURLToPath(
		new URL("../../scripts/run-upstream-node-bootstrap.mjs", import.meta.url),
	);
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

class ExperimentalUpstreamBootstrapRuntimeDriver implements NodeRuntimeDriver {
	readonly #runtime: RuntimeDriverOptions["runtime"];
	readonly #defaultOnStdio?: StdioHook;
	readonly #vendoredPublicBuiltins: string[];
	readonly #awaitCompletionSignalMode?: "always" | "auto";

	constructor(
		options: RuntimeDriverOptions & ExperimentalUpstreamBootstrapOptions,
	) {
		this.#runtime = options.runtime;
		this.#defaultOnStdio = options.onStdio;
		this.#vendoredPublicBuiltins = normalizeVendoredPublicBuiltins(
			options.vendoredPublicBuiltins,
		);
		this.#awaitCompletionSignalMode =
			options.awaitCompletionSignalMode ??
			(options.awaitCompletionSignal === true ? "always" : undefined);
	}

	async exec(code: string, options: ExecOptions = {}): Promise<ExecResult> {
		const result = await runUpstreamBootstrapEval({
			code,
			cwd: options.cwd,
			env: {
				...(this.#runtime.process.env ?? {}),
				...(options.env ?? {}),
			},
			argv: this.#runtime.process.argv,
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
	}

	async run<T = unknown>(code: string, _filePath?: string): Promise<RunResult<T>> {
		const result = await this.exec(code, { mode: "run" });
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

export function createExperimentalUpstreamFsFirstLightRuntimeDriverFactory(): NodeRuntimeDriverFactory {
	return createExperimentalUpstreamBootstrapRuntimeDriverFactory({
		awaitCompletionSignalMode: "always",
		vendoredPublicBuiltins: [...FS_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

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

class ExperimentalUpstreamBootstrapKernelRuntime implements KernelRuntimeDriver {
	readonly name = "node-upstream-bootstrap";
	readonly commands = ["node"];
	readonly #vendoredPublicBuiltins: string[];
	readonly #awaitCompletionSignalMode?: "always" | "auto";

	constructor(options: ExperimentalUpstreamBootstrapOptions = {}) {
		this.#vendoredPublicBuiltins = normalizeVendoredPublicBuiltins(
			options.vendoredPublicBuiltins,
		);
		this.#awaitCompletionSignalMode =
			options.awaitCompletionSignalMode ??
			(options.awaitCompletionSignal === true ? "always" : undefined);
	}

	async init(_kernel: KernelInterface): Promise<void> {}

	spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
		if (command !== "node") {
			return createImmediateProcessExit(
				1,
				`unsupported command for ${this.name}: ${command}`,
				ctx,
			);
		}

		const code = extractEvalCode(args);
		if (code === null) {
			return createImmediateProcessExit(
				1,
				`${this.name} only supports \`node -e <code>\` during the bootstrap bring-up story`,
				ctx,
			);
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
				const result = await runUpstreamBootstrapEval({
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

	async dispose(): Promise<void> {}
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

export function createReplacementNodeKernelRuntime(): KernelRuntimeDriver {
	return createExperimentalUpstreamBootstrapKernelRuntime({
		awaitCompletionSignalMode: "auto",
		vendoredPublicBuiltins: [...REPLACEMENT_PUBLIC_BUILTINS],
	});
}
