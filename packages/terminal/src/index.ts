import { type InteractiveSession, VirtualMachine } from "nanosandbox";

export interface TerminalOptions {
	/** Path to load files from host filesystem */
	hostPath?: string;
	/** Command to run (default: bash) */
	command?: string;
	/** Memory limit in MB for Node.js isolate */
	memoryLimit?: number;
	/** Enable debug output */
	debug?: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Connect terminal streams to WASM instance
 */
function connectStreams(session: InteractiveSession): void {
	const stdin = session.instance.stdin?.getWriter();

	// Set up stdin from process.stdin
	if (stdin && process.stdin.isTTY) {
		// Enable raw mode for character-by-character input
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding("utf8");

		process.stdin.on("data", (data: string) => {
			// Handle Ctrl+C
			if (data === "\x03") {
				console.log("\n^C");
				process.exit(0);
			}
			// Handle Ctrl+D (EOF)
			if (data === "\x04") {
				stdin.close();
				return;
			}
			stdin.write(encoder.encode(data));
		});
	} else if (stdin) {
		// Non-TTY mode (piped input)
		process.stdin.on("data", (chunk: Buffer) => {
			stdin.write(new Uint8Array(chunk));
		});
		process.stdin.on("end", () => {
			stdin.close();
		});
	}

	// Connect stdout
	session.instance.stdout.pipeTo(
		new WritableStream({
			write(chunk: Uint8Array) {
				const text = decoder.decode(chunk);
				// Convert \n to \r\n for proper terminal display
				process.stdout.write(text.replace(/\n/g, "\r\n"));
			},
		}),
	);

	// Connect stderr
	session.instance.stderr.pipeTo(
		new WritableStream({
			write(chunk: Uint8Array) {
				const text = decoder.decode(chunk);
				process.stderr.write(text.replace(/\n/g, "\r\n"));
			},
		}),
	);
}

/**
 * Start an interactive terminal session
 */
export async function startTerminal(
	options: TerminalOptions = {},
): Promise<number> {
	const debug = options.debug ?? false;
	const _log = debug ? console.error.bind(console, "[terminal]") : () => {};
	const startTime = Date.now();
	const logTiming = (step: string) => {
		if (debug) {
			console.error(`[terminal] ${step} (${Date.now() - startTime}ms)`);
		}
	};

	// Create VM
	logTiming("Creating VirtualMachine...");
	const vm = new VirtualMachine({
		memoryLimit: options.memoryLimit,
	});

	// Initialize
	logTiming("Initializing VM...");
	await vm.init();
	logTiming("VM initialized");

	// Load files from host if path provided
	if (options.hostPath) {
		logTiming(`Loading files from ${options.hostPath}...`);
		await vm.loadFromHost(options.hostPath);
		logTiming("Host files loaded");
	}

	// Get the command to run
	const commandName = options.command ?? "bash";
	logTiming(`Starting interactive session with '${commandName}'...`);

	// Run interactive session
	const session = await vm.runInteractive(commandName);
	logTiming("Interactive session started");

	// Connect streams
	logTiming("Connecting streams...");
	connectStreams(session);
	logTiming("Streams connected - terminal ready");

	// Wait for the command to complete
	const exitCode = await session.wait();
	logTiming("Command completed");

	// Restore terminal settings
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(false);
	}

	// Clean up
	vm.dispose();

	return exitCode;
}

export { VirtualMachine };
