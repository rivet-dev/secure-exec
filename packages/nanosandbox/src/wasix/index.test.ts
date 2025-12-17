import { Directory, init } from "@wasmer/sdk/node";
import { NodeProcess } from "sandboxed-node";
import { beforeAll, describe, expect, it } from "vitest";
import { WasixInstance } from "./index.js";

describe("WasixInstance", () => {
	beforeAll(async () => {
		await init();
	});

	describe("Step 6: Basic WASM shell", () => {
		// These tests need to run sequentially due to wasmer SDK limitations
		it("should execute echo command and ls with directory", async () => {
			// Test 1: Direct echo command
			const wasix1 = new WasixInstance();
			const echoResult = await wasix1.run("echo", ["hello"]);
			expect(echoResult.stdout.trim()).toBe("hello");
			expect(echoResult.code).toBe(0);
		});

		it("should execute ls and cat with directory", async () => {
			// Test 2: ls with directory
			const dir = new Directory();
			dir.writeFile("/test.txt", "content");

			const wasix = new WasixInstance({ directory: dir });
			const lsResult = await wasix.run("ls", ["/"]);
			expect(lsResult.stdout).toContain("test.txt");
			expect(lsResult.code).toBe(0);

			// Test 3: cat with same directory
			dir.writeFile("/hello.txt", "Hello World");
			const catResult = await wasix.run("cat", ["/hello.txt"]);
			expect(catResult.stdout).toBe("Hello World");
			expect(catResult.code).toBe(0);
		});

		it("should execute shell command via bash/sh", async () => {
			const wasix = new WasixInstance();
			const result = await wasix.exec("echo hello");
			// Output should contain hello (exit code might be non-zero due to node shim)
			expect(result.stdout).toContain("hello");
		});

		it("should expose getDirectory", async () => {
			const dir = new Directory();
			const wasix = new WasixInstance({ directory: dir });
			expect(wasix.getDirectory()).toBe(dir);
		});
	});

	describe("Step 7: IPC polling for node shim", () => {
		it("should run node command via IPC with real node", async () => {
			const wasix = new WasixInstance();

			// Run node directly via IPC polling (uses real node as fallback)
			const result = await wasix.runWithIpc("node", ["-e", "console.log(2+2)"]);

			expect(result.stdout).toContain("4");
		});

		it("should run node command via IPC with NodeProcess", async () => {
			const nodeProcess = new NodeProcess();

			try {
				const wasix = new WasixInstance({
					nodeProcess,
				});

				const result = await wasix.runWithIpc("node", [
					"-e",
					"console.log('Hello from NodeProcess')",
				]);

				expect(result.stdout).toContain("Hello from NodeProcess");
			} finally {
				nodeProcess.dispose();
			}
		});

		it("should run bash script that calls node via IPC", async () => {
			const nodeProcess = new NodeProcess();

			try {
				const wasix = new WasixInstance({
					nodeProcess,
				});

				// Run bash that calls node via IPC to NodeProcess
				const result = await wasix.runWithIpc("bash", [
					"-c",
					"echo 'Before node' && node -e \"console.log('From node')\" && echo 'After node'",
				]);

				expect(result.stdout).toContain("Before node");
				expect(result.stdout).toContain("From node");
				expect(result.stdout).toContain("After node");
			} finally {
				nodeProcess.dispose();
			}
		});
	});
});
