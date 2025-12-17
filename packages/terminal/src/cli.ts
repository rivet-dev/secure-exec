#!/usr/bin/env node

import { startTerminal } from "./index.js";

async function main() {
	const args = process.argv.slice(2);

	let hostPath: string | undefined;
	let command: string | undefined;
	let debug = false;

	// Parse arguments
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--path" || arg === "-p") {
			hostPath = args[++i];
		} else if (arg === "--command" || arg === "-c") {
			command = args[++i];
		} else if (arg === "--debug" || arg === "-d") {
			debug = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(`
nanosandbox - Interactive terminal for nanosandbox VM

Usage: nanosandbox [options]

Options:
  -p, --path <dir>     Load files from host directory into VM
  -c, --command <cmd>  Command to run (default: bash)
  -d, --debug          Enable debug output
  -h, --help           Show this help message

Examples:
  nanosandbox                    # Start bash shell
  nanosandbox -p ./project       # Start with project files loaded
  nanosandbox -c sh              # Start sh instead of bash
`);
			process.exit(0);
		}
	}

	try {
		console.log("Starting nanosandbox terminal...");
		console.log("Press Ctrl+C to exit, Ctrl+D to send EOF\n");

		const exitCode = await startTerminal({
			hostPath,
			command,
			debug,
		});

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
