import { init } from "@wasmer/sdk/node";
import { VirtualMachine, VirtualMachineOptions, Process, SpawnOptions, spawn as vmSpawn } from "../vm/index.js";

export { VirtualMachine, VirtualMachineOptions, Process, SpawnOptions };

let wasmerInitialized = false;

/**
 * Runtime is the entry point for running commands in nanosandbox.
 * Use Runtime.load() to initialize, then run() to execute commands.
 *
 * @example
 * ```typescript
 * import { Runtime } from "nanosandbox";
 * const runtime = await Runtime.load();
 * const vm = await runtime.run("echo", { args: ["hello world"] });
 * console.log(vm.stdout); // "hello world\n"
 * ```
 */
export class Runtime {
	private constructor() {}

	/**
	 * Load and initialize the runtime.
	 */
	static async load(): Promise<Runtime> {
		if (!wasmerInitialized) {
			await init({ log: "warn" });
			wasmerInitialized = true;
		}
		return new Runtime();
	}

	/**
	 * Run a command in a fresh isolated virtual machine.
	 *
	 * @param command - The command to run (e.g., "echo", "bash", "node")
	 * @param options - Options including args, env, cwd, memoryLimit
	 * @returns A VirtualMachine containing stdout, stderr, and exit code
	 */
	async run(
		command: string,
		options: VirtualMachineOptions = {},
	): Promise<VirtualMachine> {
		const vm = new VirtualMachine(command, options);
		await vm.setup();
		return vm;
	}

	/**
	 * Spawn a command with streaming stdin/stdout.
	 *
	 * @param command - The command to spawn (e.g., "bash", "node")
	 * @param options - Options including args, env, cwd
	 * @returns A Process handle for streaming I/O
	 *
	 * @example
	 * ```typescript
	 * const proc = await runtime.spawn("node", { args: ["-e", "..."] });
	 * await proc.writeStdin("hello\n");
	 * const output = await proc.readStdout();
	 * await proc.closeStdin();
	 * const result = await proc.wait();
	 * ```
	 */
	async spawn(
		command: string,
		options: SpawnOptions = {},
	): Promise<Process> {
		return vmSpawn(command, options);
	}
}
