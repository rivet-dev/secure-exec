import { afterEach, describe, expect, it } from "vitest";
import {
	createCommandExecutorStub,
	createInMemoryFileSystem,
	type StdioEvent,
} from "@secure-exec/core";
import { NodeRuntime } from "../../secure-exec/src/runtime.ts";
import { createNodeDriver } from "../src/index.ts";
import { createReplacementNodeRuntimeDriverFactory } from "../src/upstream/bootstrap-execution.ts";

function readStdout(events: readonly StdioEvent[]): string {
	return events
		.filter((event) => event.channel === "stdout")
		.map((event) => event.message)
		.join("");
}

describe("replacement runtime filePath behavior", () => {
	let runtime: NodeRuntime | undefined;

	afterEach(() => {
		runtime?.dispose();
		runtime = undefined;
	});

	it("uses the provided filePath for CommonJS exec() filename semantics and relative require()", async () => {
		const filesystem = createInMemoryFileSystem();
		await filesystem.mkdir("/app", { recursive: true });
		await filesystem.writeFile(
			"/app/dep.js",
			"module.exports = { value: 42 };",
		);
		const stdio: StdioEvent[] = [];

		runtime = new NodeRuntime({
			systemDriver: createNodeDriver({
				filesystem,
				commandExecutor: createCommandExecutorStub(),
			}),
			runtimeDriverFactory: createReplacementNodeRuntimeDriverFactory(),
			onStdio: (event) => stdio.push(event),
		});

		const result = await runtime.exec(
			`
			process.stdout.write(JSON.stringify({
				filename: __filename,
				dirname: __dirname,
				value: require("./dep.js").value,
			}));
			`,
			{
				filePath: "/app/entry.js",
				cwd: "/app",
			},
		);

		expect(result.code).toBe(0);
		expect(JSON.parse(readStdout(stdio))).toEqual({
			filename: "/app/entry.js",
			dirname: "/app",
			value: 42,
		});
	});

	it("uses filePath-driven module classification for ESM exec()", async () => {
		const filesystem = createInMemoryFileSystem();
		await filesystem.mkdir("/app", { recursive: true });
		await filesystem.writeFile(
			"/app/package.json",
			JSON.stringify({ type: "module" }, null, 2),
		);
		await filesystem.writeFile("/app/dep.js", "export const value = 9;\n");
		const stdio: StdioEvent[] = [];

		runtime = new NodeRuntime({
			systemDriver: createNodeDriver({
				filesystem,
				commandExecutor: createCommandExecutorStub(),
			}),
			runtimeDriverFactory: createReplacementNodeRuntimeDriverFactory(),
			onStdio: (event) => stdio.push(event),
		});

		const result = await runtime.exec(
			`
			import { value } from "./dep.js";
			process.stdout.write(String(value));
			`,
			{
				filePath: "/app/entry.js",
				cwd: "/app",
			},
		);

		expect(result.code).toBe(0);
		expect(readStdout(stdio)).toBe("9");
	});

	it("returns CommonJS exports from run() using the provided filePath", async () => {
		const filesystem = createInMemoryFileSystem();
		await filesystem.mkdir("/app", { recursive: true });
		await filesystem.writeFile("/app/dep.js", "module.exports = 7;\n");

		runtime = new NodeRuntime({
			systemDriver: createNodeDriver({
				filesystem,
				commandExecutor: createCommandExecutorStub(),
			}),
			runtimeDriverFactory: createReplacementNodeRuntimeDriverFactory(),
		});

		const result = await runtime.run<{
			filename: string;
			dirname: string;
			value: number;
		}>(
			`
			module.exports = {
				filename: __filename,
				dirname: __dirname,
				value: require("./dep.js"),
			};
			`,
			"/app/entry.js",
		);

		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			filename: "/app/entry.js",
			dirname: "/app",
			value: 7,
		});
	});

	it("returns ESM namespace exports from run() with relative imports resolved from filePath", async () => {
		const filesystem = createInMemoryFileSystem();
		await filesystem.mkdir("/app", { recursive: true });
		await filesystem.writeFile("/app/dep.mjs", "export const value = 41;\n");

		runtime = new NodeRuntime({
			systemDriver: createNodeDriver({
				filesystem,
				commandExecutor: createCommandExecutorStub(),
			}),
			runtimeDriverFactory: createReplacementNodeRuntimeDriverFactory(),
		});

		const result = await runtime.run<{ default: number; source: number }>(
			`
			import { value } from "./dep.mjs";
			export const source = value;
			export default value + 1;
			`,
			"/app/entry.mjs",
		);

		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			default: 42,
			source: 41,
		});
	});
});
