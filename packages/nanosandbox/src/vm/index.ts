import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Directory, Wasmer, Runtime } from "@wasmer/sdk/node";
import { NodeProcess } from "sandboxed-node";
import { createCommandExecutor } from "../command-executor.js";

export interface VirtualMachineOptions {
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	memoryLimit?: number;
	/** Input to pass to the command's stdin */
	stdin?: string;
}

export interface SpawnOptions {
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
}

/**
 * A running process with streaming stdin/stdout.
 */
export interface Process {
	/** Write data to stdin */
	writeStdin(data: string): Promise<void>;
	/** Close stdin (signal EOF) */
	closeStdin(): Promise<void>;
	/** Read all available stdout data */
	readStdout(): Promise<string>;
	/** Wait for the process to exit */
	wait(): Promise<{ stdout: string; stderr: string; code: number }>;
	/** Kill the process */
	kill(): void;
}

interface TerminalOptions {
	term: string;
	cols: number;
	rows: number;
}

/**
 * Handle for a spawned child process with streaming I/O.
 * Matches the SpawnedProcess interface from sandboxed-node.
 */
interface SpawnedProcess {
	/** Write to process stdin */
	writeStdin(data: Uint8Array | string): void;
	/** Close stdin (signal EOF) */
	closeStdin(): void;
	/** Kill the process with optional signal (default SIGTERM=15) */
	kill(signal?: number): void;
	/** Wait for process to exit, returns exit code */
	wait(): Promise<number>;
}

interface HostExecContext {
	command: string;
	args: string[];
	env: Record<string, string>;
	cwd: string;
	stdin: ReadableStream<Uint8Array> | null;
	stdout: WritableStream<Uint8Array> | null;
	stderr: WritableStream<Uint8Array> | null;
	// Streaming callbacks for output
	onStdout?: (data: Uint8Array) => void;
	onStderr?: (data: Uint8Array) => void;
	// Stdin write callbacks - set by handler, called by scheduler
	setStdinWriter?: (writer: (data: Uint8Array) => void, closer: () => void) => void;
	// Kill/signal function callback - set by handler, called by scheduler
	setKillFunction?: (killFn: (signal: number) => void) => void;
	// Terminal options (if set, apply TERM/COLUMNS/LINES to env)
	terminal?: TerminalOptions;

	// NEW: Child process spawning via WASM IPC (routes to wasix-runtime)
	// These callbacks are provided by wasmer-js scheduler
	requestSpawn?: (
		childId: number,
		command: string,
		argsJson: string,
		envJson: string,
		cwd: string,
		onStdout: (data: Uint8Array) => void,
		onStderr: (data: Uint8Array) => void,
		onExit: (code: number) => void,
	) => void;
	spawnWriteStdin?: (childId: number, data: Uint8Array) => void;
	spawnCloseStdin?: (childId: number) => void;
	spawnKill?: (childId: number, signal: number) => void;

	// Legacy: Child process spawning (for nested spawns from sandboxed code)
	// This is now implemented using the above callbacks
	spawnChildStreaming?(
		command: string,
		args: string[],
		options: {
			cwd?: string;
			env?: Record<string, string>;
			onStdout?: (data: Uint8Array) => void;
			onStderr?: (data: Uint8Array) => void;
		},
	): SpawnedProcess;
}

const DATA_MOUNT_PATH = "/data";

let runtimePackage: Awaited<ReturnType<typeof Wasmer.fromFile>> | null = null;
let wasmerRuntime: Runtime | null = null;

// Counter for generating unique child IDs
let nextChildId = 1;

/**
 * Create a spawnChildStreaming function that uses the new WASM IPC callbacks.
 * This allows sandboxed Node.js code to spawn child processes that run as
 * WASIX processes inside the same VM (sharing filesystem).
 *
 * If the new callbacks aren't available, returns null to indicate child
 * process spawning is not supported.
 */
function createSpawnChildStreaming(
	ctx: HostExecContext,
	parentCwd: string,
	parentEnv: Record<string, string>,
): HostExecContext["spawnChildStreaming"] | null {
	// Check if the new WASM IPC callbacks are available
	if (!ctx.requestSpawn || !ctx.spawnWriteStdin || !ctx.spawnCloseStdin || !ctx.spawnKill) {
		console.error("[spawnChildStreaming] WASM IPC callbacks not available");
		return null;
	}

	const { requestSpawn, spawnWriteStdin, spawnCloseStdin, spawnKill } = ctx;

	return (command, args, options) => {
		// Generate unique child ID
		const childId = nextChildId++;

		// Track state
		let exited = false;
		let exitCode = 0;
		let exitResolve: ((code: number) => void) | null = null;

		// Merge environment: parent env + child options env
		const mergedEnv = { ...parentEnv, ...options.env };

		// Create callbacks for stdout/stderr/exit
		const onStdout = (data: Uint8Array) => {
			if (options.onStdout) {
				options.onStdout(data);
			}
		};

		const onStderr = (data: Uint8Array) => {
			if (options.onStderr) {
				options.onStderr(data);
			}
		};

		const onExit = (code: number) => {
			exitCode = code;
			exited = true;
			if (exitResolve) {
				exitResolve(code);
			}
		};

		// Request spawn via WASM IPC
		// This queues a SPAWN_REQUEST message that the wasix-runtime will read
		requestSpawn(
			childId,
			command,
			JSON.stringify(args),
			JSON.stringify(mergedEnv),
			options.cwd || parentCwd,
			onStdout,
			onStderr,
			onExit,
		);

		console.error(`[spawnChildStreaming] Spawned child ${childId}: ${command} ${args.join(" ")}`);

		// Return SpawnedProcess handle
		return {
			writeStdin(data: Uint8Array | string): void {
				const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
				spawnWriteStdin(childId, bytes);
			},
			closeStdin(): void {
				spawnCloseStdin(childId);
			},
			kill(signal?: number): void {
				spawnKill(childId, signal ?? 15); // Default to SIGTERM
			},
			wait(): Promise<number> {
				if (exited) {
					return Promise.resolve(exitCode);
				}
				return new Promise((resolve) => {
					exitResolve = resolve;
				});
			},
		};
	};
}

/**
 * Handle host_exec syscalls from WASM.
 *
 * For "node" commands, uses sandboxed-node's NodeProcess (V8 isolate) instead
 * of spawning a real process. This is faster and more secure.
 *
 * Streams stdout/stderr via the onStdout/onStderr callbacks.
 */

// Counter for generating unique PIDs for sandboxed processes
let nextPid = 1000;

/**
 * Parse node command line arguments to extract code/file and options.
 */
function parseNodeArgs(args: string[]): {
	code: string | null;
	file: string | null;
	evalCode: boolean;
	printResult: boolean;
	nodeArgs: string[];
} {
	let code: string | null = null;
	let file: string | null = null;
	let evalCode = false;
	let printResult = false;
	const nodeArgs: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "-e" || arg === "--eval") {
			evalCode = true;
			code = args[++i] || "";
		} else if (arg === "-p" || arg === "--print") {
			evalCode = true;
			printResult = true;
			code = args[++i] || "";
		} else if (arg === "-c" || arg === "--check") {
			// Syntax check only - we'll just parse it
			code = args[++i] || "";
		} else if (arg === "-r" || arg === "--require") {
			// Skip require for now
			i++;
		} else if (arg === "--input-type" || arg === "--experimental-loader") {
			// Skip these flags
			i++;
		} else if (arg.startsWith("-")) {
			// Skip other flags
		} else if (!file && !evalCode) {
			// First non-flag argument is the script file
			file = arg;
			// Remaining args are passed to the script
			nodeArgs.push(...args.slice(i + 1));
			break;
		}
	}

	return { code, file, evalCode, printResult, nodeArgs };
}

async function hostExecHandler(ctx: HostExecContext): Promise<number> {
	console.error(`[host_exec] command=${ctx.command} args=${JSON.stringify(ctx.args)}`);

	// Check if this is a node command - use sandboxed-node for V8 acceleration
	const isNodeCommand = ctx.command === "node" || ctx.command.endsWith("/node");

	if (isNodeCommand) {
		return handleNodeCommand(ctx);
	}

	// For non-node commands, return error (not supported in sandbox)
	console.error(`[host_exec] unsupported command: ${ctx.command}`);
	const errorMsg = `Error: Command '${ctx.command}' is not supported in sandbox. Only 'node' is available.\n`;
	if (ctx.onStderr) {
		ctx.onStderr(new TextEncoder().encode(errorMsg));
	}
	return 1;
}

/**
 * Handle node commands using sandboxed-node's NodeProcess (V8 isolate).
 *
 * Stdin is buffered until EOF (closer called), then NodeProcess.exec() is called
 * with the complete stdin data.
 */
async function handleNodeCommand(ctx: HostExecContext): Promise<number> {
	const { code, file, evalCode, printResult, nodeArgs } = parseNodeArgs(ctx.args);

	// Generate a unique PID for this sandboxed process
	const pid = nextPid++;

	// Build argv for the sandboxed process
	const argv = ["node"];
	if (file) {
		argv.push(file, ...nodeArgs);
	} else if (evalCode) {
		argv.push("-e", code || "");
	}

	// Buffer stdin data until EOF
	const stdinChunks: Uint8Array[] = [];
	let stdinClosed = false;
	let resolveStdin: () => void = () => {};
	const stdinPromise = new Promise<void>((resolve) => {
		resolveStdin = resolve;
	});

	// Register stdin writer to buffer data
	if (ctx.setStdinWriter) {
		ctx.setStdinWriter(
			(data: Uint8Array) => {
				stdinChunks.push(data);
			},
			() => {
				stdinClosed = true;
				resolveStdin();
			}
		);
	} else {
		// No stdin - resolve immediately
		stdinClosed = true;
		resolveStdin();
	}

	// Wait for stdin to be closed (EOF)
	// Use a timeout to prevent hanging if stdin is never closed
	const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 100));
	await Promise.race([stdinPromise, timeoutPromise]);

	// Combine stdin chunks into a single string
	const stdinData = stdinChunks.length > 0
		? new TextDecoder().decode(Buffer.concat(stdinChunks.map(c => Buffer.from(c))))
		: undefined;

	// Add spawnChildStreaming to the context for child process support
	// This allows sandboxed Node.js to spawn child processes via WASM IPC
	const spawnChildFn = createSpawnChildStreaming(ctx, ctx.cwd || "/", ctx.env || {});
	const ctxWithChildSpawn: HostExecContext = {
		...ctx,
		spawnChildStreaming: spawnChildFn ?? undefined,
	};

	// Create CommandExecutor for child process support
	const commandExecutor = createCommandExecutor(ctxWithChildSpawn);

	// Create NodeProcess with context from host_exec
	const nodeProcess = new NodeProcess({
		memoryLimit: 128,
		processConfig: {
			pid,
			ppid: 1, // WASM shell is parent
			cwd: ctx.cwd || "/",
			env: ctx.env || {},
			argv,
			platform: "linux",
			arch: "x64",
		},
		// Pass CommandExecutor for child_process support (routes through wasmer-js)
		commandExecutor: commandExecutor ?? undefined,
		// TODO: Add filesystem when VFS is passed through HostExecContext
	});

	// Register kill function - disposes the isolate
	if (ctx.setKillFunction) {
		ctx.setKillFunction((_signal: number) => {
			console.error(`[host_exec] killing NodeProcess pid=${pid}`);
			nodeProcess.dispose();
		});
	}

	try {
		let result: { stdout: string; stderr: string; code: number };

		if (evalCode && code) {
			// Execute inline code with -e flag
			let codeToRun = code;
			if (printResult) {
				// -p flag: wrap code to print the result
				codeToRun = `console.log(${code})`;
			}
			result = await nodeProcess.exec(codeToRun, { stdin: stdinData });
		} else if (file) {
			// TODO: Execute script file - needs VFS access
			// For now, return error
			const errorMsg = `Error: File execution not yet supported. Use 'node -e "code"' instead.\n`;
			if (ctx.onStderr) {
				ctx.onStderr(new TextEncoder().encode(errorMsg));
			}
			nodeProcess.dispose();
			return 1;
		} else {
			// No code or file specified
			const errorMsg = "Error: No script or code provided to node\n";
			if (ctx.onStderr) {
				ctx.onStderr(new TextEncoder().encode(errorMsg));
			}
			nodeProcess.dispose();
			return 1;
		}

		// Stream stdout/stderr back to WASM
		if (result.stdout && ctx.onStdout) {
			ctx.onStdout(new TextEncoder().encode(result.stdout));
		}
		if (result.stderr && ctx.onStderr) {
			ctx.onStderr(new TextEncoder().encode(result.stderr));
		}

		console.error(`[host_exec] NodeProcess pid=${pid} exited with code=${result.code}`);

		nodeProcess.dispose();
		return result.code;
	} catch (err) {
		const errorMsg = `Error: ${err instanceof Error ? err.message : String(err)}\n`;
		if (ctx.onStderr) {
			ctx.onStderr(new TextEncoder().encode(errorMsg));
		}
		nodeProcess.dispose();
		return 1;
	}
}

async function loadRuntimePackage(): Promise<Awaited<ReturnType<typeof Wasmer.fromFile>>> {
	if (!runtimePackage) {
		// Create runtime and set host_exec handler
		wasmerRuntime = new Runtime();
		wasmerRuntime.setHostExecHandler(hostExecHandler);

		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const webcPath = path.resolve(currentDir, "../../assets/runtime.webc");
		const webcBytes = await fs.readFile(webcPath);
		runtimePackage = await Wasmer.fromFile(webcBytes, wasmerRuntime);
	}
	return runtimePackage;
}

/**
 * VirtualMachine represents the result of running a command.
 */
export class VirtualMachine {
	public stdout = "";
	public stderr = "";
	public code = 0;

	private command: string;
	private options: VirtualMachineOptions;

	constructor(command: string, options: VirtualMachineOptions = {}) {
		this.command = command;
		this.options = options;
	}

	/**
	 * Execute the command. Called by Runtime.run().
	 */
	async setup(): Promise<void> {
		const pkg = await loadRuntimePackage();

		const cmd = pkg.commands[this.command];
		if (!cmd) {
			throw new Error(`Command not found: ${this.command}`);
		}

		const { args = [], env, cwd, stdin } = this.options;

		const directory = new Directory();

		const instance = await cmd.run({
			args,
			env,
			cwd,
			stdin,
			mount: {
				[DATA_MOUNT_PATH]: directory,
			},
		});

		const result = await instance.wait();

		this.stdout = result.stdout;
		this.stderr = result.stderr;
		this.code = result.code ?? 0;
	}
}

/**
 * ProcessImpl wraps a wasmer-js Instance and provides streaming stdin/stdout.
 *
 * Note: Due to wasmer-js TTY mode, stdin is echoed to stdout when using
 * interactive mode. The actual program output comes through in the wait() result.
 */
class ProcessImpl implements Process {
	private instance: Awaited<ReturnType<Awaited<ReturnType<typeof Wasmer.fromFile>>["commands"][string]["run"]>>;
	private stdinWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
	private stdoutReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private stdoutBuffer: string[] = [];
	private readingStarted = false;
	private waitPromise: Promise<{ stdout: string; stderr: string; code: number }> | null = null;

	constructor(instance: ProcessImpl["instance"]) {
		this.instance = instance;

		// Get stdin writer if available
		if (instance.stdin) {
			this.stdinWriter = instance.stdin.getWriter();
		}
	}

	private ensureStdoutReader(): void {
		if (!this.readingStarted) {
			this.readingStarted = true;
			this.stdoutReader = this.instance.stdout.getReader();
			// Start background reading
			this.readStdoutLoop();
		}
	}

	private async readStdoutLoop(): Promise<void> {
		if (!this.stdoutReader) return;
		try {
			const decoder = new TextDecoder();
			while (true) {
				const { done, value } = await this.stdoutReader.read();
				if (done) break;
				if (value) {
					this.stdoutBuffer.push(decoder.decode(value, { stream: true }));
				}
			}
		} catch (err) {
			// Reader was cancelled or stream closed
		}
	}

	async writeStdin(data: string): Promise<void> {
		if (!this.stdinWriter) {
			throw new Error("stdin is not available");
		}
		const encoder = new TextEncoder();
		await this.stdinWriter.write(encoder.encode(data));
	}

	async closeStdin(): Promise<void> {
		if (this.stdinWriter) {
			await this.stdinWriter.close();
			this.stdinWriter = null;
		}
	}

	async readStdout(): Promise<string> {
		// Start reading if not already
		this.ensureStdoutReader();

		// Small delay to let any pending data arrive
		await new Promise(r => setTimeout(r, 10));

		// Return and clear buffered stdout
		const output = this.stdoutBuffer.join("");
		this.stdoutBuffer = [];
		return output;
	}

	async wait(): Promise<{ stdout: string; stderr: string; code: number }> {
		// If we started reading stdout ourselves, we need to return our buffered data
		// since the stream is already consumed
		if (this.readingStarted) {
			// Wait for the reader to finish (process exit)
			if (this.stdoutReader) {
				// Read until done
				const decoder = new TextDecoder();
				try {
					while (true) {
						const { done, value } = await this.stdoutReader.read();
						if (done) break;
						if (value) {
							this.stdoutBuffer.push(decoder.decode(value, { stream: true }));
						}
					}
				} catch (err) {
					// Stream already closed
				}
			}

			// Get stderr from instance (we didn't consume that)
			// Note: This is a simplified approach - ideally we'd also buffer stderr
			const allStdout = this.stdoutBuffer.join("");
			this.stdoutBuffer = [];

			// We can't get the actual exit code easily since wait() would hang
			// Return what we have
			return {
				stdout: allStdout,
				stderr: "",
				code: 0,
			};
		}

		// Normal path - let wait() consume the streams
		if (!this.waitPromise) {
			this.waitPromise = this.instance.wait().then(result => ({
				stdout: result.stdout,
				stderr: result.stderr,
				code: result.code ?? 0,
			}));
		}
		return this.waitPromise;
	}

	kill(): void {
		// Cancel stdin/stdout
		if (this.stdinWriter) {
			this.stdinWriter.abort().catch(() => {});
		}
		if (this.stdoutReader) {
			this.stdoutReader.cancel().catch(() => {});
		}
	}
}

/**
 * Spawn a command and return a Process handle for streaming I/O.
 */
export async function spawn(command: string, options: SpawnOptions = {}): Promise<Process> {
	const pkg = await loadRuntimePackage();

	const cmd = pkg.commands[command];
	if (!cmd) {
		throw new Error(`Command not found: ${command}`);
	}

	const { args = [], env, cwd } = options;
	const directory = new Directory();

	const instance = await cmd.run({
		args,
		env,
		cwd,
		mount: {
			[DATA_MOUNT_PATH]: directory,
		},
	});

	return new ProcessImpl(instance);
}
