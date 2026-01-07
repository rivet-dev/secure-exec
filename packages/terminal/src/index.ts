import { Runtime, Process } from "nanosandbox";

export interface TerminalOptions {
	/** Path to load files from host filesystem */
	hostPath?: string;
	/** Command to run (default: bash) */
	command?: string;
	/** Arguments to pass to the command */
	args?: string[];
	/** Enable debug output */
	debug?: boolean;
}

/**
 * Run a command non-interactively and print output
 */
export async function runCommand(
	options: TerminalOptions = {},
): Promise<number> {
	const debug = options.debug ?? false;
	const startTime = Date.now();
	const logTiming = (step: string) => {
		if (debug) {
			console.error(`[terminal] ${step} (${Date.now() - startTime}ms)`);
		}
	};

	// Load runtime
	logTiming("Loading runtime...");
	const runtime = await Runtime.load();
	logTiming("Runtime loaded");

	// Get the command to run
	const commandName = options.command ?? "echo";
	const commandArgs = options.args ?? [];
	logTiming(`Running '${commandName} ${commandArgs.join(" ")}'...`);

	// Run command (non-interactive)
	const vm = await runtime.run(commandName, { args: commandArgs });
	logTiming("Command completed");

	// Print output
	if (vm.stdout) {
		process.stdout.write(vm.stdout);
	}
	if (vm.stderr) {
		process.stderr.write(vm.stderr);
	}

	return vm.code;
}

/**
 * Connect terminal streams to spawned process
 */
function connectStreams(proc: Process, debug: boolean = false): void {
	const log = (msg: string) => {
		if (debug) console.error(`[connectStreams] ${msg}`);
	};

	// Set up stdin from process.stdin
	if (process.stdin.isTTY) {
		log("TTY mode enabled");
		// Enable raw mode for character-by-character input
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding("utf8");

		process.stdin.on("data", async (data: string) => {
			log(`stdin data: ${JSON.stringify(data)}`);
			// Handle Ctrl+C
			if (data === "\x03") {
				console.log("\n^C");
				proc.kill();
				process.exit(0);
			}
			// Handle Ctrl+D (EOF)
			if (data === "\x04") {
				log("Ctrl+D received, closing stdin");
				await proc.closeStdin();
				return;
			}
			await proc.writeStdin(data);
		});
	} else {
		log("Non-TTY mode (piped input)");
		// Non-TTY mode (piped input)
		process.stdin.on("data", async (chunk: Buffer) => {
			log(`stdin chunk: ${JSON.stringify(chunk.toString())}`);
			await proc.writeStdin(chunk.toString());
		});
		process.stdin.on("end", async () => {
			log("stdin end received, closing stdin");
			await proc.closeStdin();
		});
	}

	// Poll stdout and stderr in background
	// Stderr contains bash prompt and input echo
	// Stdout contains command output
	const pollStream = async (name: string, readFn: () => Promise<string>) => {
		log(`Starting ${name} poll loop`);
		while (true) {
			try {
				const output = await readFn();
				if (output) {
					log(`${name}: ${JSON.stringify(output)}`);
					// Convert \n to \r\n for proper terminal display
					process.stdout.write(output.replace(/\n/g, "\r\n"));
				}
				await new Promise(r => setTimeout(r, 10));
			} catch (e) {
				log(`${name} error: ${e}`);
				break;
			}
		}
		log(`${name} poll loop ended`);
	};

	// Start both poll loops
	pollStream("stdout", () => proc.readStdout());
	pollStream("stderr", () => proc.readStderr());
}

/**
 * Start an interactive terminal session with streaming stdin/stdout.
 */
export async function startTerminal(
	options: TerminalOptions = {},
): Promise<number> {
	const debug = options.debug ?? false;
	const startTime = Date.now();
	const logTiming = (step: string) => {
		if (debug) {
			console.error(`[terminal] ${step} (${Date.now() - startTime}ms)`);
		}
	};

	// Load runtime
	logTiming("Loading runtime...");
	const runtime = await Runtime.load();
	logTiming("Runtime loaded");

	// Get the command to run
	const commandName = options.command ?? "bash";
	const commandArgs = options.args ?? [];
	logTiming(`Spawning '${commandName} ${commandArgs.join(" ")}'...`);

	// Spawn interactive process
	const proc = await runtime.spawn(commandName, { args: commandArgs });
	logTiming("Process spawned");

	// Connect streams
	logTiming("Connecting streams...");
	connectStreams(proc, debug);
	logTiming("Streams connected - terminal ready");

	// Wait for the command to complete
	const result = await proc.wait();
	logTiming("Command completed");

	// Print any remaining buffered output that wasn't printed by the poll loop
	if (result.stdout) {
		process.stdout.write(result.stdout.replace(/\n/g, "\r\n"));
	}
	if (result.stderr) {
		process.stderr.write(result.stderr.replace(/\n/g, "\r\n"));
	}

	// Restore terminal settings
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(false);
	}

	return result.code;
}

export { Runtime };
