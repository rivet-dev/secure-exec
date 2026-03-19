#!/usr/bin/env -S npx tsx
/**
 * Interactive shell inside the kernel.
 *
 * Usage:
 *   npx tsx scripts/shell.ts [--commands-dir <path>] [--no-node] [--no-python]
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createKernel } from "../packages/kernel/src/index.ts";
import { InMemoryFileSystem } from "../packages/os/browser/src/index.ts";
import { createWasmVmRuntime } from "../packages/runtime/wasmvm/src/index.ts";
import { createNodeRuntime } from "../packages/runtime/node/src/index.ts";
import { createPythonRuntime } from "../packages/runtime/python/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse CLI flags
const args = process.argv.slice(2);
let commandsDir = resolve(__dirname, "../wasmvm/target/wasm32-wasip1/release/commands");
let mountNode = true;
let mountPython = true;

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--commands-dir" && args[i + 1]) {
		commandsDir = resolve(args[++i]);
	} else if (args[i] === "--no-node") {
		mountNode = false;
	} else if (args[i] === "--no-python") {
		mountPython = false;
	}
}

// Set up kernel with VFS and drivers
const vfs = new InMemoryFileSystem();
const kernel = createKernel({ filesystem: vfs });

await kernel.mount(createWasmVmRuntime({ commandDirs: [commandsDir] }));
if (mountNode) await kernel.mount(createNodeRuntime());
if (mountPython) await kernel.mount(createPythonRuntime());

// Drop into the interactive shell
const exitCode = await kernel.connectTerminal();
await kernel.dispose();
process.exit(exitCode);
