#!/usr/bin/env node

import { startTerminal, runCommand } from "./index.js";

async function main() {
	const argv = process.argv.slice(2);

	let hostPath: string | undefined;
	let debug = false;
	let interactive = false;
	const positionalArgs: string[] = [];

	// Parse arguments
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--path" || arg === "-p") {
			hostPath = argv[++i];
		} else if (arg === "--debug" || arg === "-d") {
			debug = true;
		} else if (arg === "--interactive" || arg === "-i") {
			interactive = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(`
nanosandbox - Run commands in nanosandbox VM

Usage: nanosandbox [options] <command> [...args]

Options:
  -p, --path <dir>     Load files from host directory into VM
  -i, --interactive    Run in interactive mode (for shells)
  -d, --debug          Enable debug output
  -h, --help           Show this help message

Examples:
  nanosandbox echo hello                   # Run echo
  nanosandbox ls /                         # List root directory
  nanosandbox node -e "console.log('hi')"  # Run node
  nanosandbox bash -c "echo hello"         # Run bash command
  nanosandbox -i bash                      # Interactive bash shell
`);
			process.exit(0);
		} else if (arg === "--") {
			// Everything after -- is positional
			positionalArgs.push(...argv.slice(i + 1));
			break;
		} else if (arg.startsWith("-")) {
			console.error(`Unknown option: ${arg}`);
			process.exit(1);
		} else {
			// First positional arg and everything after
			positionalArgs.push(...argv.slice(i));
			break;
		}
	}

	const command = positionalArgs[0];
	const args = positionalArgs.slice(1);

	if (!command) {
		console.error("Error: No command specified");
		console.error("Usage: nanosandbox <command> [...args]");
		console.error("Run 'nanosandbox --help' for more information");
		process.exit(1);
	}

	try {
		let exitCode: number;

		if (interactive) {
			// Interactive mode - use spawn() with streaming stdin/stdout
			exitCode = await startTerminal({
				hostPath,
				command,
				args,
				debug,
			});
		} else {
			// Non-interactive mode - run command and capture output
			exitCode = await runCommand({
				hostPath,
				command,
				args,
				debug,
			});
		}

		process.exit(exitCode);
	} catch (error) {
		console.error("Error:", error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
