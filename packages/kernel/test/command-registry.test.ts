import { describe, it, expect } from "vitest";
import { CommandRegistry } from "../src/command-registry.js";
import type { RuntimeDriver, KernelInterface, ProcessContext, DriverProcess } from "../src/types.js";

function createMockDriver(name: string, commands: string[]): RuntimeDriver {
	return {
		name,
		commands,
		async init(_kernel: KernelInterface) {},
		spawn(_command: string, _args: string[], _ctx: ProcessContext): DriverProcess {
			throw new Error("not implemented");
		},
		async dispose() {},
	};
}

describe("CommandRegistry", () => {
	it("registers and resolves commands", () => {
		const registry = new CommandRegistry();
		const driver = createMockDriver("wasmvm", ["grep", "sed", "cat"]);
		registry.register(driver);

		expect(registry.resolve("grep")).toBe(driver);
		expect(registry.resolve("sed")).toBe(driver);
		expect(registry.resolve("cat")).toBe(driver);
	});

	it("returns null for unknown commands", () => {
		const registry = new CommandRegistry();
		expect(registry.resolve("nonexistent")).toBeNull();
	});

	it("last-mounted driver wins on conflict", () => {
		const registry = new CommandRegistry();
		const driver1 = createMockDriver("wasmvm", ["node"]);
		const driver2 = createMockDriver("node", ["node"]);

		registry.register(driver1);
		registry.register(driver2);

		expect(registry.resolve("node")!.name).toBe("node");
	});

	it("list returns command → driver name mapping", () => {
		const registry = new CommandRegistry();
		registry.register(createMockDriver("wasmvm", ["grep", "cat"]));
		registry.register(createMockDriver("node", ["node", "npm"]));

		const list = registry.list();
		expect(list.get("grep")).toBe("wasmvm");
		expect(list.get("node")).toBe("node");
		expect(list.size).toBe(4);
	});

	it("logs warning when overriding existing command", () => {
		const registry = new CommandRegistry();
		const driver1 = createMockDriver("wasmvm", ["sh", "grep"]);
		const driver2 = createMockDriver("node", ["sh"]);

		registry.register(driver1);
		registry.register(driver2);

		const warnings = registry.getWarnings();
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain("sh");
		expect(warnings[0]).toContain("wasmvm");
		expect(warnings[0]).toContain("node");
	});

	describe("path-based resolution", () => {
		it("resolves /bin/ls to driver registered for 'ls'", () => {
			const registry = new CommandRegistry();
			const driver = createMockDriver("wasmvm", ["ls", "grep"]);
			registry.register(driver);

			expect(registry.resolve("/bin/ls")).toBe(driver);
		});

		it("resolves /usr/bin/grep to driver registered for 'grep'", () => {
			const registry = new CommandRegistry();
			const driver = createMockDriver("wasmvm", ["grep"]);
			registry.register(driver);

			expect(registry.resolve("/usr/bin/grep")).toBe(driver);
		});

		it("resolves deeply nested paths via basename", () => {
			const registry = new CommandRegistry();
			const driver = createMockDriver("wasmvm", ["cat"]);
			registry.register(driver);

			expect(registry.resolve("/usr/local/bin/cat")).toBe(driver);
		});

		it("direct name lookup still works", () => {
			const registry = new CommandRegistry();
			const driver = createMockDriver("wasmvm", ["ls"]);
			registry.register(driver);

			expect(registry.resolve("ls")).toBe(driver);
		});

		it("returns null for path with unknown basename", () => {
			const registry = new CommandRegistry();
			registry.register(createMockDriver("wasmvm", ["ls"]));

			expect(registry.resolve("/bin/nonexistent")).toBeNull();
		});

		it("returns null for trailing slash (empty basename)", () => {
			const registry = new CommandRegistry();
			registry.register(createMockDriver("wasmvm", ["ls"]));

			expect(registry.resolve("/bin/")).toBeNull();
		});
	});

	describe("registerCommand", () => {
		it("registers a single command to a driver", () => {
			const registry = new CommandRegistry();
			const driver = createMockDriver("wasmvm", []);
			registry.registerCommand("find", driver);

			expect(registry.resolve("find")).toBe(driver);
		});

		it("overrides existing command with warning", () => {
			const registry = new CommandRegistry();
			const driver1 = createMockDriver("wasmvm", ["cat"]);
			const driver2 = createMockDriver("node", []);
			registry.register(driver1);
			registry.registerCommand("cat", driver2);

			expect(registry.resolve("cat")).toBe(driver2);
			expect(registry.getWarnings().length).toBe(1);
			expect(registry.getWarnings()[0]).toContain("cat");
		});

		it("appears in list()", () => {
			const registry = new CommandRegistry();
			const driver = createMockDriver("wasmvm", []);
			registry.registerCommand("tree", driver);

			expect(registry.list().get("tree")).toBe("wasmvm");
		});
	});

	describe("populateBinEntry", () => {
		it("creates a single /bin stub entry", async () => {
			const { TestFileSystem } = await import("./helpers.js");
			const vfs = new TestFileSystem();
			const registry = new CommandRegistry();

			await registry.populateBinEntry(vfs, "find");

			expect(await vfs.exists("/bin/find")).toBe(true);
		});

		it("creates /bin directory if it does not exist", async () => {
			const { TestFileSystem } = await import("./helpers.js");
			const vfs = new TestFileSystem();
			const registry = new CommandRegistry();

			await registry.populateBinEntry(vfs, "grep");

			expect(await vfs.exists("/bin")).toBe(true);
			expect(await vfs.exists("/bin/grep")).toBe(true);
		});

		it("does not overwrite existing /bin entry", async () => {
			const { TestFileSystem } = await import("./helpers.js");
			const vfs = new TestFileSystem();
			const registry = new CommandRegistry();

			// Pre-populate with custom content
			await vfs.mkdir("/bin", { recursive: true });
			await vfs.writeFile("/bin/cat", "custom");

			await registry.populateBinEntry(vfs, "cat");

			const content = await vfs.readTextFile("/bin/cat");
			expect(content).toBe("custom");
		});
	});

	it("populateBin creates /bin entries", async () => {
		const { TestFileSystem } = await import("./helpers.js");
		const vfs = new TestFileSystem();
		const registry = new CommandRegistry();
		registry.register(createMockDriver("wasmvm", ["grep", "cat"]));

		await registry.populateBin(vfs);

		expect(await vfs.exists("/bin/grep")).toBe(true);
		expect(await vfs.exists("/bin/cat")).toBe(true);
	});
});
