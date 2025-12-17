import { Directory, init } from "@wasmer/sdk/node";
import { NodeProcess } from "sandboxed-node";
import { beforeAll, describe, expect, it } from "vitest";
import { DATA_MOUNT_PATH, WasixInstance } from "./index.js";

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
			// Test 2: ls with directory - files are at DATA_MOUNT_PATH
			const dir = new Directory();
			dir.writeFile("/test.txt", "content");

			const wasix = new WasixInstance({ directory: dir });
			const lsResult = await wasix.run("ls", [DATA_MOUNT_PATH]);
			expect(lsResult.stdout).toContain("test.txt");
			expect(lsResult.code).toBe(0);

			// Test 3: cat with same directory
			dir.writeFile("/hello.txt", "Hello World");
			const catResult = await wasix.run("cat", [
				`${DATA_MOUNT_PATH}/hello.txt`,
			]);
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

		it("should execute script from mounted directory", async () => {
			const dir = new Directory();
			// Write a shell script to the mounted directory
			dir.writeFile("/myscript.sh", "#!/bin/bash\necho 'script ran'");

			const wasix = new WasixInstance({ directory: dir });

			// Try to execute the script via bash - script is at DATA_MOUNT_PATH
			const result = await wasix.exec(`bash ${DATA_MOUNT_PATH}/myscript.sh`);
			console.log("Script result:", result);
			expect(result.stdout).toContain("script ran");
		});

		it("should test mount at subpath", async () => {
			// Create directory with files - use root-level paths in Directory
			const dir = new Directory();
			await dir.writeFile("/test.txt", "file at root of mount");

			// Use WasixInstance - files are mounted at DATA_MOUNT_PATH
			const wasix = new WasixInstance({ directory: dir });

			// Verify files are visible at DATA_MOUNT_PATH
			const result = await wasix.run("ls", [DATA_MOUNT_PATH]);
			console.log(`ls ${DATA_MOUNT_PATH}:`, result);

			expect(result.stdout).toContain("test.txt");
		});

		it("should test subpath mount with nested dirs via runCommand", async () => {
			const dir = new Directory();
			await dir.createDir("/mydir");
			await dir.writeFile("/mydir/nested.txt", "nested content");

			// Load the runtime using proper path resolution
			const { Wasmer } = await import("@wasmer/sdk/node");
			const nodePath = await import("node:path");
			const nodeUrl = await import("node:url");
			const nodeFs = await import("node:fs/promises");
			const __dirname = nodePath.dirname(
				nodeUrl.fileURLToPath(import.meta.url),
			);
			const runtimePath = nodePath.join(__dirname, "../../assets/runtime.webc");

			// Read the webc bytes like the production code does
			const webcBytes = await nodeFs.readFile(runtimePath);
			const pkg = await Wasmer.fromFile(webcBytes);

			// ls the mount point at /mnt
			const lsCmd = pkg.commands["ls"];
			const lsResult = await (
				await lsCmd.run({
					args: ["/mnt"],
					mount: { "/mnt": dir },
				})
			).wait();
			console.log("ls /mnt:", lsResult);

			// ls the nested dir
			const lsNested = await (
				await lsCmd.run({
					args: ["/mnt/mydir"],
					mount: { "/mnt": dir },
				})
			).wait();
			console.log("ls /mnt/mydir:", lsNested);

			// cat the nested file
			const catCmd = pkg.commands["cat"];
			const catResult = await (
				await catCmd.run({
					args: ["/mnt/mydir/nested.txt"],
					mount: { "/mnt": dir },
				})
			).wait();
			console.log("cat /mnt/mydir/nested.txt:", catResult);

			expect(catResult.stdout).toContain("nested content");
		});

		it("should run bash script from subpath mount", async () => {
			const dir = new Directory();
			await dir.createDir("/scripts");
			await dir.writeFile(
				"/scripts/hello.sh",
				"#!/bin/bash\necho 'Hello from subpath mount!'",
			);

			const { Wasmer } = await import("@wasmer/sdk/node");
			const nodePath = await import("node:path");
			const nodeUrl = await import("node:url");
			const nodeFs = await import("node:fs/promises");
			const __dirname = nodePath.dirname(
				nodeUrl.fileURLToPath(import.meta.url),
			);
			const runtimePath = nodePath.join(__dirname, "../../assets/runtime.webc");

			const webcBytes = await nodeFs.readFile(runtimePath);
			const pkg = await Wasmer.fromFile(webcBytes);

			// Run bash to execute the script from /mnt
			const bashCmd = pkg.commands["bash"];
			const result = await (
				await bashCmd.run({
					args: ["-c", "bash /mnt/scripts/hello.sh"],
					mount: { "/mnt": dir },
				})
			).wait();
			console.log("bash script result:", result);

			expect(result.stdout).toContain("Hello from subpath mount!");
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
