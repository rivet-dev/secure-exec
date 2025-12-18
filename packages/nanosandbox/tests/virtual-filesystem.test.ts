import { afterEach, describe, it } from "node:test";
import assert from "node:assert";
import { VirtualMachine } from "../src/vm/index.js";
import { DATA_MOUNT_PATH } from "../src/wasix/index.js";

describe("VirtualFileSystem", () => {
	let vm: VirtualMachine;

	afterEach(() => {
		vm?.dispose();
	});

	describe("operations with /data prefix", () => {
		it("should readTextFile with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			await vm.writeFile("/data/test.txt", "hello from data");
			const vfs = vm.getVirtualFileSystem();

			const content = await vfs.readTextFile(`${DATA_MOUNT_PATH}/test.txt`);
			assert.strictEqual(content, "hello from data");
		});

		it("should readFile (binary) with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
			await vm.writeFile("/data/image.png", binaryData);

			const vfs = vm.getVirtualFileSystem();
			const result = await vfs.readFile(`${DATA_MOUNT_PATH}/image.png`);

			assert.deepStrictEqual(result, binaryData);
		});

		it("should writeFile with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();
			await vfs.writeFile(`${DATA_MOUNT_PATH}/written.txt`, "data write");

			const content = await vm.readFile("/data/written.txt");
			assert.strictEqual(content, "data write");
		});

		it("should writeFile binary with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();
			const binaryData = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
			await vfs.writeFile(`${DATA_MOUNT_PATH}/binary.bin`, binaryData);

			const result = await vm.readFileBinary("/data/binary.bin");
			assert.deepStrictEqual(result, binaryData);
		});

		it("should readDir with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			await vm.mkdir("/data/mydir");
			await vm.writeFile("/data/mydir/a.txt", "a");
			await vm.writeFile("/data/mydir/b.txt", "b");

			const vfs = vm.getVirtualFileSystem();
			const entries = await vfs.readDir(`${DATA_MOUNT_PATH}/mydir`);

			assert.ok(entries.includes("a.txt"));
			assert.ok(entries.includes("b.txt"));
		});

		it("should createDir with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();
			await vfs.createDir(`${DATA_MOUNT_PATH}/newdir`);
			await vfs.writeFile(`${DATA_MOUNT_PATH}/newdir/file.txt`, "test");

			const entries = await vm.readDir("/data/newdir");
			assert.ok(entries.includes("file.txt"));
		});

		it("should mkdir recursively with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();
			await vfs.mkdir(`${DATA_MOUNT_PATH}/a/b/c`);
			await vfs.writeFile(`${DATA_MOUNT_PATH}/a/b/c/file.txt`, "deep");

			const content = await vm.readFile("/data/a/b/c/file.txt");
			assert.strictEqual(content, "deep");
		});

		it("should removeFile with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			await vm.writeFile("/data/to-remove.txt", "delete me");
			assert.strictEqual(await vm.exists("/data/to-remove.txt"), true);

			const vfs = vm.getVirtualFileSystem();
			await vfs.removeFile(`${DATA_MOUNT_PATH}/to-remove.txt`);

			assert.strictEqual(await vm.exists("/data/to-remove.txt"), false);
		});

		it("should removeDir with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			await vm.mkdir("/data/empty-dir");
			assert.strictEqual(await vm.exists("/data/empty-dir"), true);

			const vfs = vm.getVirtualFileSystem();
			await vfs.removeDir(`${DATA_MOUNT_PATH}/empty-dir`);

			assert.strictEqual(await vm.exists("/data/empty-dir"), false);
		});

		it("should normalize /data alone to root", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			await vm.writeFile("/data/root-file.txt", "at root");

			const vfs = vm.getVirtualFileSystem();
			const entries = await vfs.readDir(DATA_MOUNT_PATH);

			assert.ok(entries.includes("root-file.txt"));
		});

		it("should throw for nonexistent file with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			await assert.rejects(
				vfs.readTextFile(`${DATA_MOUNT_PATH}/nonexistent.txt`),
			);
		});

		it("should throw for nonexistent directory with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			await assert.rejects(
				vfs.readDir(`${DATA_MOUNT_PATH}/nonexistent-dir`),
			);
		});

		it("should check exists with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			await vm.writeFile("/data/exists.txt", "yes");

			const vfs = vm.getVirtualFileSystem();
			assert.strictEqual(await vfs.exists(`${DATA_MOUNT_PATH}/exists.txt`), true);
			assert.strictEqual(await vfs.exists(`${DATA_MOUNT_PATH}/not-exists.txt`), false);
		});
	});

	describe("write operations require /data prefix", () => {
		it("should reject writeFile without /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			await assert.rejects(
				vfs.writeFile("/no-data-prefix.txt", "content"),
				/Cannot write to path outside \/data/,
			);
		});

		it("should reject createDir without /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			await assert.rejects(
				vfs.createDir("/newdir"),
				/Cannot write to path outside \/data/,
			);
		});

		it("should reject mkdir without /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			await assert.rejects(
				vfs.mkdir("/a/b/c"),
				/Cannot write to path outside \/data/,
			);
		});

		it("should reject removeFile without /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			await assert.rejects(
				vfs.removeFile("/some-file.txt"),
				/Cannot write to path outside \/data/,
			);
		});

		it("should reject removeDir without /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			await assert.rejects(
				vfs.removeDir("/some-dir"),
				/Cannot write to path outside \/data/,
			);
		});
	});

	describe("nested paths and edge cases", () => {
		it("should list root directory via /data", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			await vm.writeFile("/data/root-file.txt", "at root");
			await vm.mkdir("/data/subdir");

			const vfs = vm.getVirtualFileSystem();
			// Use /data prefix to read Directory root
			const entries = await vfs.readDir(DATA_MOUNT_PATH);

			assert.ok(entries.includes("root-file.txt"));
			assert.ok(entries.includes("subdir"));
		});

		it("should list WASM root directory via shell fallback", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();
			// "/" without /data prefix reads WASM root via shell
			const entries = await vfs.readDir("/");

			// WASM root should contain system directories
			assert.ok(entries.includes("bin"));
			assert.ok(entries.includes("data"));
		});

		it("should handle deeply nested paths with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			await vm.mkdir("/data/a");
			await vm.mkdir("/data/a/b");
			await vm.mkdir("/data/a/b/c");
			await vm.mkdir("/data/a/b/c/d");
			await vm.writeFile("/data/a/b/c/d/deep.txt", "deep content");

			const vfs = vm.getVirtualFileSystem();

			// Read via /data prefix
			const content = await vfs.readTextFile(
				`${DATA_MOUNT_PATH}/a/b/c/d/deep.txt`,
			);
			assert.strictEqual(content, "deep content");

			// List each level via /data prefix
			assert.ok((await vfs.readDir(`${DATA_MOUNT_PATH}/a`)).includes("b"));
			assert.ok((await vfs.readDir(`${DATA_MOUNT_PATH}/a/b`)).includes("c"));
			assert.ok((await vfs.readDir(`${DATA_MOUNT_PATH}/a/b/c`)).includes("d"));
			assert.ok((await vfs.readDir(`${DATA_MOUNT_PATH}/a/b/c/d`)).includes("deep.txt"));
		});

		it("should handle files with same name at different levels", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			await vm.writeFile("/data/config.json", '{"level": "root"}');
			await vm.mkdir("/data/app");
			await vm.writeFile("/data/app/config.json", '{"level": "app"}');
			await vm.mkdir("/data/app/sub");
			await vm.writeFile("/data/app/sub/config.json", '{"level": "sub"}');

			const vfs = vm.getVirtualFileSystem();

			// Read via /data prefix
			assert.strictEqual(
				await vfs.readTextFile(`${DATA_MOUNT_PATH}/config.json`),
				'{"level": "root"}',
			);
			assert.strictEqual(
				await vfs.readTextFile(`${DATA_MOUNT_PATH}/app/config.json`),
				'{"level": "app"}',
			);
			assert.strictEqual(
				await vfs.readTextFile(`${DATA_MOUNT_PATH}/app/sub/config.json`),
				'{"level": "sub"}',
			);
		});

		it("should handle empty directories", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			await vm.mkdir("/data/empty");

			const vfs = vm.getVirtualFileSystem();
			// Read via /data prefix
			const entries = await vfs.readDir(`${DATA_MOUNT_PATH}/empty`);

			assert.deepStrictEqual(entries, []);
		});

		it("should overwrite existing files", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			await vfs.writeFile(`${DATA_MOUNT_PATH}/overwrite.txt`, "original");
			assert.strictEqual(
				await vfs.readTextFile(`${DATA_MOUNT_PATH}/overwrite.txt`),
				"original",
			);

			await vfs.writeFile(`${DATA_MOUNT_PATH}/overwrite.txt`, "updated!");
			assert.strictEqual(
				await vfs.readTextFile(`${DATA_MOUNT_PATH}/overwrite.txt`),
				"updated!",
			);
		});

		// Tests workaround for wasmer-js bug: Directory.writeFile missing truncate(true)
		it("should overwrite with shorter content", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			await vfs.writeFile(
				`${DATA_MOUNT_PATH}/file.txt`,
				"this is long content",
			);
			assert.strictEqual(
				await vfs.readTextFile(`${DATA_MOUNT_PATH}/file.txt`),
				"this is long content",
			);

			await vfs.writeFile(`${DATA_MOUNT_PATH}/file.txt`, "short");
			assert.strictEqual(
				await vfs.readTextFile(`${DATA_MOUNT_PATH}/file.txt`),
				"short",
			);
		});

		it("should handle special characters in filenames", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			// Spaces and dashes
			await vfs.writeFile(`${DATA_MOUNT_PATH}/my-file name.txt`, "content");
			assert.strictEqual(
				await vfs.readTextFile(`${DATA_MOUNT_PATH}/my-file name.txt`),
				"content",
			);

			// Dots
			await vfs.writeFile(`${DATA_MOUNT_PATH}/file.test.backup.txt`, "backup");
			assert.strictEqual(
				await vfs.readTextFile(`${DATA_MOUNT_PATH}/file.test.backup.txt`),
				"backup",
			);
		});

		it("should handle unicode content", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			const unicodeContent = "Hello 世界 🌍 émojis";
			await vfs.writeFile(`${DATA_MOUNT_PATH}/unicode.txt`, unicodeContent);

			assert.strictEqual(
				await vfs.readTextFile(`${DATA_MOUNT_PATH}/unicode.txt`),
				unicodeContent,
			);
		});

		it("should handle empty file content", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			await vfs.writeFile(`${DATA_MOUNT_PATH}/empty.txt`, "");
			assert.strictEqual(await vfs.readTextFile(`${DATA_MOUNT_PATH}/empty.txt`), "");
		});

		it("should handle large file content", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			// Create a ~100KB string
			const largeContent = "x".repeat(100 * 1024);
			await vfs.writeFile(`${DATA_MOUNT_PATH}/large.txt`, largeContent);

			assert.strictEqual(
				await vfs.readTextFile(`${DATA_MOUNT_PATH}/large.txt`),
				largeContent,
			);
		});
	});

	describe("shell fallback for WASM-only paths", () => {
		it("should readDir /bin via shell fallback", async () => {
			// /bin exists in WASM (from webc - coreutils) but NOT in Directory
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			// Verify direct spawn works first
			const spawnResult = await vm.spawn("ls", { args: ["-1", "/bin"] });
			assert.strictEqual(spawnResult.code, 0);
			assert.ok(spawnResult.stdout.length > 0);

			const vfs = vm.getVirtualFileSystem();

			// This should fall back to 'ls' via shell
			const entries = await vfs.readDir("/bin");

			assert.ok(entries.length > 0);
			assert.ok(entries.some((e) => e.length > 0));
		});

		it("should readTextFile via shell fallback (cat)", async () => {
			// Test reading a file that exists in WASM but not in Directory
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			// First verify the file exists via shell
			const catResult = await vm.spawn("cat", { args: ["/etc/passwd"] });
			// /etc/passwd may or may not exist depending on the webc
			// Let's try a file we know exists - check if there's anything in /bin
			const lsResult = await vm.spawn("ls", { args: ["/bin"] });
			assert.strictEqual(lsResult.code, 0);

			// If /etc/passwd exists, test reading it
			if (catResult.code === 0) {
				const vfs = vm.getVirtualFileSystem();
				const content = await vfs.readTextFile("/etc/passwd");
				assert.ok(content.length > 0);
			}
		});

		it("should NOT use shell fallback for /data paths that don't exist", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			// /data paths should NOT fall back to shell - they should throw
			await assert.rejects(
				vfs.readTextFile(`${DATA_MOUNT_PATH}/nonexistent.txt`),
			);
		});

		it("should read /data paths from Directory", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			// Write file to Directory
			await vm.writeFile("/data/myfile.txt", "from directory");

			const vfs = vm.getVirtualFileSystem();

			// File exists in Directory, read via /data path
			const content = await vfs.readTextFile(`${DATA_MOUNT_PATH}/myfile.txt`);
			assert.strictEqual(content, "from directory");
		});

		it("should read non-/data paths via shell", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			// /bin exists in WASM, read via shell
			const entries = await vfs.readDir("/bin");
			assert.ok(entries.length > 0);
			// Should contain coreutils commands from webc
			assert.ok(entries.includes("ls"));
		});

		it("should check exists for WASM system paths via shell", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.getVirtualFileSystem();

			// /bin should exist in WASM
			assert.strictEqual(await vfs.exists("/bin"), true);
			// Nonexistent path
			assert.strictEqual(await vfs.exists("/nonexistent-wasm-path"), false);
		});
	});
});
