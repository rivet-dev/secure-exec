import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VirtualMachine } from "./index";

describe("VirtualMachine", () => {
	describe("Step 4: Basic filesystem", () => {
		it("should write and read files", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			vm.writeFile("/foo.txt", "bar");
			expect(await vm.readFile("/foo.txt")).toBe("bar");
		});

		it("should write and read binary files", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
			vm.writeFile("/binary.bin", data);

			const result = await vm.readFileBinary("/binary.bin");
			expect(result).toEqual(data);
		});

		it("should check if files exist", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			vm.writeFile("/exists.txt", "yes");

			expect(await vm.exists("/exists.txt")).toBe(true);
			expect(await vm.exists("/notexists.txt")).toBe(false);
		});

		it("should list directory contents", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			vm.mkdir("/mydir");
			vm.writeFile("/mydir/a.txt", "a");
			vm.writeFile("/mydir/b.txt", "b");

			const entries = await vm.readDir("/mydir");
			expect(entries).toContain("a.txt");
			expect(entries).toContain("b.txt");
		});

		it("should remove files", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			vm.writeFile("/remove.txt", "delete me");
			expect(await vm.exists("/remove.txt")).toBe(true);

			await vm.remove("/remove.txt");
			expect(await vm.exists("/remove.txt")).toBe(false);
		});

		it("should expose underlying SystemBridge and Directory", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			expect(vm.getSystemBridge()).toBeDefined();
			expect(vm.getDirectory()).toBeDefined();
		});

		it("should initialize only once", async () => {
			const vm = new VirtualMachine();
			await vm.init();
			await vm.init(); // Should not throw

			vm.writeFile("/test.txt", "ok");
			expect(await vm.readFile("/test.txt")).toBe("ok");
		});
	});

	describe("Step 5: Host filesystem loading", () => {
		let tempDir: string;

		beforeAll(async () => {
			// Create a temp directory with some test files
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vm-test-"));
			await fs.writeFile(path.join(tempDir, "hello.txt"), "Hello World");
			await fs.mkdir(path.join(tempDir, "subdir"));
			await fs.writeFile(
				path.join(tempDir, "subdir", "nested.txt"),
				"Nested content",
			);
			await fs.mkdir(path.join(tempDir, "node_modules"));
			await fs.writeFile(
				path.join(tempDir, "node_modules", "package.json"),
				'{"name": "test-pkg"}',
			);
		});

		afterAll(async () => {
			// Cleanup temp directory
			await fs.rm(tempDir, { recursive: true, force: true });
		});

		it("should load files from host directory", async () => {
			const vm = new VirtualMachine();
			await vm.init();
			await vm.loadFromHost(tempDir);

			expect(await vm.readFile("/hello.txt")).toBe("Hello World");
		});

		it("should load nested directories", async () => {
			const vm = new VirtualMachine();
			await vm.init();
			await vm.loadFromHost(tempDir);

			expect(await vm.readFile("/subdir/nested.txt")).toBe("Nested content");
		});

		it("should load node_modules directory", async () => {
			const vm = new VirtualMachine();
			await vm.init();
			await vm.loadFromHost(tempDir);

			const pkgJson = await vm.readFile("/node_modules/package.json");
			expect(pkgJson).toContain("test-pkg");
		});

		it("should list loaded directories", async () => {
			const vm = new VirtualMachine();
			await vm.init();
			await vm.loadFromHost(tempDir);

			const entries = await vm.readDir("/");
			expect(entries).toContain("hello.txt");
			expect(entries).toContain("subdir");
			expect(entries).toContain("node_modules");
		});

		it("should load to custom virtual base path", async () => {
			const vm = new VirtualMachine();
			await vm.init();
			await vm.loadFromHost(tempDir, "/project");

			expect(await vm.readFile("/project/hello.txt")).toBe("Hello World");
		});
	});

	describe("Step 9: Hybrid routing in spawn()", () => {
		it("should route node -e commands to NodeProcess", async () => {
			const vm = new VirtualMachine();
			try {
				const result = await vm.spawn("node", [
					"-e",
					'console.log("hello from node")',
				]);
				expect(result.stdout).toContain("hello from node");
				expect(result.code).toBe(0);
			} finally {
				vm.dispose();
			}
		});

		it("should route node script file to NodeProcess", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();
				vm.writeFile("/script.js", 'console.log("script output")');

				const result = await vm.spawn("node", ["/script.js"]);
				expect(result.stdout).toContain("script output");
				expect(result.code).toBe(0);
			} finally {
				vm.dispose();
			}
		});

		it("should route linux commands to WasixInstance", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();
				vm.writeFile("/test.txt", "content");

				const result = await vm.spawn("ls", ["/"]);
				expect(result.stdout).toContain("test.txt");
			} finally {
				vm.dispose();
			}
		});

		it("should execute echo command via WasixInstance", async () => {
			const vm = new VirtualMachine();
			try {
				const result = await vm.spawn("echo", ["hello world"]);
				expect(result.stdout.trim()).toBe("hello world");
				expect(result.code).toBe(0);
			} finally {
				vm.dispose();
			}
		});

		it("should run shell scripts that call node via IPC", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();
				vm.writeFile("/script.js", 'console.log("from node")');

				// bash runs in WASM, node call bridges via IPC to NodeProcess
				const result = await vm.spawn("bash", [
					"-c",
					"echo before && node /script.js && echo after",
				]);
				expect(result.stdout).toContain("before");
				expect(result.stdout).toContain("from node");
				expect(result.stdout).toContain("after");
			} finally {
				vm.dispose();
			}
		});

		it("should handle node errors properly", async () => {
			const vm = new VirtualMachine();
			try {
				const result = await vm.spawn("node", [
					"-e",
					"throw new Error('oops')",
				]);
				expect(result.code).toBe(1);
				expect(result.stderr).toContain("oops");
			} finally {
				vm.dispose();
			}
		});

		it("should handle missing script file", async () => {
			const vm = new VirtualMachine();
			try {
				const result = await vm.spawn("node", ["/nonexistent.js"]);
				expect(result.code).toBe(1);
				expect(result.stderr).toContain("Cannot find module");
			} finally {
				vm.dispose();
			}
		});
	});

	describe("Integration tests with real packages", () => {
		it("should run ms package from host node_modules", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();
				// Load only the ms package (not the entire project - that's too slow)
				const msPath = path.join(process.cwd(), "node_modules/ms");
				await vm.loadFromHost(msPath, "/node_modules/ms");

				// Write a script that uses ms
				vm.writeFile(
					"/test-ms.js",
					`
          const ms = require('ms');
          console.log(ms('1h'));
          console.log(ms('2d'));
          console.log(ms(3600000));
        `,
				);

				const result = await vm.spawn("node", ["/test-ms.js"]);
				expect(result.code).toBe(0);
				expect(result.stdout).toContain("3600000"); // 1h in ms
				expect(result.stdout).toContain("172800000"); // 2d in ms
				expect(result.stdout).toContain("1h"); // reverse conversion
			} finally {
				vm.dispose();
			}
		});

		it("should handle fs operations from script", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();

				// Write a script that uses fs
				vm.writeFile(
					"/test-fs.js",
					`
          const fs = require('fs');
          fs.writeFileSync('/output.json', JSON.stringify({ hello: 'world' }));
          const content = fs.readFileSync('/output.json', 'utf8');
          console.log(content);
        `,
				);

				const result = await vm.spawn("node", ["/test-fs.js"]);
				expect(result.code).toBe(0);
				expect(result.stdout).toContain('{"hello":"world"}');

				// Verify the file was actually written
				const content = await vm.readFile("/output.json");
				expect(JSON.parse(content)).toEqual({ hello: "world" });
			} finally {
				vm.dispose();
			}
		});

		it("should handle path operations from script", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();

				vm.writeFile(
					"/test-path.js",
					`
          const path = require('path');
          console.log(path.join('/foo', 'bar', 'baz.txt'));
          console.log(path.dirname('/foo/bar/baz.txt'));
          console.log(path.basename('/foo/bar/baz.txt'));
          console.log(path.extname('/foo/bar/baz.txt'));
        `,
				);

				const result = await vm.spawn("node", ["/test-path.js"]);
				expect(result.code).toBe(0);
				expect(result.stdout).toContain("/foo/bar/baz.txt");
				expect(result.stdout).toContain("/foo/bar");
				expect(result.stdout).toContain("baz.txt");
				expect(result.stdout).toContain(".txt");
			} finally {
				vm.dispose();
			}
		});
	});
});
