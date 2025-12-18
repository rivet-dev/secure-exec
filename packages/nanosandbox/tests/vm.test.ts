import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import { DATA_MOUNT_PATH } from "../src/wasix/index.js";
import { VirtualMachine } from "../src/vm/index.js";

describe("VirtualMachine", () => {
	describe("Step 4: Basic filesystem", () => {
		it("should write and read files", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			await vm.writeFile("/data/foo.txt", "bar");
			assert.strictEqual(await vm.readFile("/data/foo.txt"), "bar");
		});

		it("should write and read binary files", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
			await vm.writeFile("/data/binary.bin", data);

			const result = await vm.readFileBinary("/data/binary.bin");
			assert.deepStrictEqual(result, data);
		});

		it("should check if files exist", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			await vm.writeFile("/data/exists.txt", "yes");

			assert.strictEqual(await vm.exists("/data/exists.txt"), true);
			assert.strictEqual(await vm.exists("/data/notexists.txt"), false);
		});

		it("should list directory contents", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			await vm.mkdir("/data/mydir");
			await vm.writeFile("/data/mydir/a.txt", "a");
			await vm.writeFile("/data/mydir/b.txt", "b");

			const entries = await vm.readDir("/data/mydir");
			assert.ok(entries.includes("a.txt"));
			assert.ok(entries.includes("b.txt"));
		});

		it("should remove files", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			await vm.writeFile("/data/remove.txt", "delete me");
			assert.strictEqual(await vm.exists("/data/remove.txt"), true);

			await vm.remove("/data/remove.txt");
			assert.strictEqual(await vm.exists("/data/remove.txt"), false);
		});

		it("should expose underlying Directory", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			assert.ok(vm.getDirectory() !== undefined);
		});

		it("should expose VirtualFileSystem", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			assert.ok(vm.getVirtualFileSystem() !== undefined);
		});

		it("should initialize only once", async () => {
			const vm = new VirtualMachine();
			await vm.init();
			await vm.init(); // Should not throw

			await vm.writeFile("/data/test.txt", "ok");
			assert.strictEqual(await vm.readFile("/data/test.txt"), "ok");
		});

		it("should reject writes to non-/data paths", async () => {
			const vm = new VirtualMachine();
			await vm.init();

			await assert.rejects(
				vm.writeFile("/foo.txt", "bar"),
				/Cannot write to path outside \/data/,
			);
		});
	});

	describe("Step 5: Host filesystem loading", () => {
		let tempDir: string;

		before(async () => {
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

		after(async () => {
			// Cleanup temp directory
			await fs.rm(tempDir, { recursive: true, force: true });
		});

		it("should load files from host directory", async () => {
			const vm = new VirtualMachine();
			await vm.init();
			// loadFromHost takes path in Directory (without /data), files accessible at /data/*
			await vm.loadFromHost(tempDir);

			assert.strictEqual(await vm.readFile("/data/hello.txt"), "Hello World");
		});

		it("should load nested directories", async () => {
			const vm = new VirtualMachine();
			await vm.init();
			await vm.loadFromHost(tempDir);

			assert.strictEqual(
				await vm.readFile("/data/subdir/nested.txt"),
				"Nested content",
			);
		});

		it("should load node_modules directory", async () => {
			const vm = new VirtualMachine();
			await vm.init();
			await vm.loadFromHost(tempDir);

			const pkgJson = await vm.readFile("/data/node_modules/package.json");
			assert.ok(pkgJson.includes("test-pkg"));
		});

		it("should list loaded directories", async () => {
			const vm = new VirtualMachine();
			await vm.init();
			await vm.loadFromHost(tempDir);

			const entries = await vm.readDir("/data");
			assert.ok(entries.includes("hello.txt"));
			assert.ok(entries.includes("subdir"));
			assert.ok(entries.includes("node_modules"));
		});

		it("should load to custom virtual base path", async () => {
			const vm = new VirtualMachine();
			await vm.init();
			// loadFromHost to /project in Directory, accessible at /data/project
			await vm.loadFromHost(tempDir, "/project");

			assert.strictEqual(
				await vm.readFile("/data/project/hello.txt"),
				"Hello World",
			);
		});
	});

	describe("Step 9: Hybrid routing in spawn()", () => {
		it("should route node -e commands to NodeProcess", async () => {
			const vm = new VirtualMachine();
			try {
				const result = await vm.spawn("node", {
					args: ["-e", 'console.log("hello from node")'],
				});
				assert.ok(result.stdout.includes("hello from node"));
				assert.strictEqual(result.code, 0);
			} finally {
				vm.dispose();
			}
		});

		it("should route node script file to NodeProcess", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();
				await vm.writeFile("/data/script.js", 'console.log("script output")');

				const result = await vm.spawn("node", { args: ["/data/script.js"] });
				assert.ok(result.stdout.includes("script output"));
				assert.strictEqual(result.code, 0);
			} finally {
				vm.dispose();
			}
		});

		it("should route linux commands to WasixInstance", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();
				await vm.writeFile("/data/test.txt", "content");

				// Files are mounted at DATA_MOUNT_PATH
				const result = await vm.spawn("ls", { args: [DATA_MOUNT_PATH] });
				assert.ok(result.stdout.includes("test.txt"));
			} finally {
				vm.dispose();
			}
		});

		it("should execute echo command via WasixInstance", async () => {
			const vm = new VirtualMachine();
			try {
				const result = await vm.spawn("echo", { args: ["hello world"] });
				assert.strictEqual(result.stdout.trim(), "hello world");
				assert.strictEqual(result.code, 0);
			} finally {
				vm.dispose();
			}
		});

		it("should run shell scripts that call node via IPC", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();
				await vm.writeFile("/data/script.js", 'console.log("from node")');

				// bash runs in WASM, node call bridges via IPC to NodeProcess
				// Script is at DATA_MOUNT_PATH
				const result = await vm.spawn("bash", {
					args: ["-c", `echo before && node ${DATA_MOUNT_PATH}/script.js && echo after`],
				});
				assert.ok(result.stdout.includes("before"));
				assert.ok(result.stdout.includes("from node"));
				assert.ok(result.stdout.includes("after"));
			} finally {
				vm.dispose();
			}
		});

		it("should handle node errors properly", async () => {
			const vm = new VirtualMachine();
			try {
				const result = await vm.spawn("node", {
					args: ["-e", "throw new Error('oops')"],
				});
				assert.strictEqual(result.code, 1);
				assert.ok(result.stderr.includes("oops"));
			} finally {
				vm.dispose();
			}
		});

		it("should handle missing script file", async () => {
			const vm = new VirtualMachine();
			try {
				const result = await vm.spawn("node", { args: ["/data/nonexistent.js"] });
				assert.strictEqual(result.code, 1);
				assert.ok(result.stderr.includes("Cannot find module"));
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
				// Note: require() uses VFS which routes /data/* to Directory.
				// So we need to use /data prefix for the module path.
				await vm.writeFile(
					"/data/test-ms.js",
					`
          const ms = require('/data/node_modules/ms');
          console.log(ms('1h'));
          console.log(ms('2d'));
          console.log(ms(3600000));
        `,
				);

				const result = await vm.spawn("node", { args: ["/data/test-ms.js"] });
				assert.strictEqual(result.code, 0);
				assert.ok(result.stdout.includes("3600000")); // 1h in ms
				assert.ok(result.stdout.includes("172800000")); // 2d in ms
				assert.ok(result.stdout.includes("1h")); // reverse conversion
			} finally {
				vm.dispose();
			}
		});

		it("should handle fs operations from script", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();

				// Write a script that uses fs
				// Note: fs operations use VFS which routes /data/* to Directory.
				// So we need to use /data prefix for file paths.
				await vm.writeFile(
					"/data/test-fs.js",
					`
          const fs = require('fs');
          fs.writeFileSync('/data/output.json', JSON.stringify({ hello: 'world' }));
          const content = fs.readFileSync('/data/output.json', 'utf8');
          console.log(content);
        `,
				);

				const result = await vm.spawn("node", { args: ["/data/test-fs.js"] });
				assert.strictEqual(result.code, 0);
				assert.ok(result.stdout.includes('{"hello":"world"}'));

				// Verify the file was actually written
				const content = await vm.readFile("/data/output.json");
				assert.deepStrictEqual(JSON.parse(content), { hello: "world" });
			} finally {
				vm.dispose();
			}
		});

		it("should handle path operations from script", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();

				await vm.writeFile(
					"/data/test-path.js",
					`
          const path = require('path');
          console.log(path.join('/foo', 'bar', 'baz.txt'));
          console.log(path.dirname('/foo/bar/baz.txt'));
          console.log(path.basename('/foo/bar/baz.txt'));
          console.log(path.extname('/foo/bar/baz.txt'));
        `,
				);

				const result = await vm.spawn("node", { args: ["/data/test-path.js"] });
				assert.strictEqual(result.code, 0);
				assert.ok(result.stdout.includes("/foo/bar/baz.txt"));
				assert.ok(result.stdout.includes("/foo/bar"));
				assert.ok(result.stdout.includes("baz.txt"));
				assert.ok(result.stdout.includes(".txt"));
			} finally {
				vm.dispose();
			}
		});
	});

	describe("npm accessibility", () => {
		it("should have npm accessible via bash ls", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();

				// Check npm path is accessible via bash
				const npmPath = vm.getNpmPath();
				assert.strictEqual(npmPath, `${DATA_MOUNT_PATH}/opt/npm`);

				// Verify we can ls the npm directory
				if (!npmPath) throw new Error("npm path should not be null");
				const result = await vm.spawn("ls", { args: [npmPath] });
				assert.strictEqual(result.code, 0);
				// npm should have bin, lib directories
				assert.ok(result.stdout.includes("bin"));
				assert.ok(result.stdout.includes("lib"));
			} finally {
				vm.dispose();
			}
		});

		it("should be able to cat npm-cli.js via bash", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();

				const npmPath = vm.getNpmPath();
				if (!npmPath) throw new Error("npm path should not be null");
				// Verify we can read the npm-cli.js file
				const result = await vm.spawn("cat", { args: [`${npmPath}/bin/npm-cli.js`] });
				assert.strictEqual(result.code, 0);
				assert.ok(result.stdout.includes("lib/cli.js"));
			} finally {
				vm.dispose();
			}
		});

		it("should have npm wrapper script at /data/bin/npm", async () => {
			const vm = new VirtualMachine();
			try {
				await vm.init();

				// Check that the wrapper exists
				const result = await vm.spawn("cat", { args: [`${DATA_MOUNT_PATH}/bin/npm`] });
				assert.strictEqual(result.code, 0);
				assert.ok(result.stdout.includes("npm-cli.js"));
			} finally {
				vm.dispose();
			}
		});

		// Note: Running npm via the wrapper doesn't work yet because npm uses
		// relative requires (../lib/cli.js) that depend on __dirname being set
		// correctly, which the sandboxed-node fs bridge doesn't fully support.
		// The npm files ARE accessible in the filesystem though.
	});
});
