import { afterEach, describe, expect, it } from "vitest";
import { VirtualMachine } from "./index.js";
import { DATA_MOUNT_PATH } from "../wasix/index.js";

describe("VirtualFileSystem", () => {
	let vm: VirtualMachine;

	afterEach(() => {
		vm?.dispose();
	});

	describe("operations with /data prefix", () => {
		it("should readTextFile with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.writeFile("/test.txt", "hello from data");
			const vfs = vm.createVirtualFileSystem();

			const content = await vfs.readTextFile(`${DATA_MOUNT_PATH}/test.txt`);
			expect(content).toBe("hello from data");
		});

		it("should readFile (binary) with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
			vm.writeFile("/image.png", binaryData);

			const vfs = vm.createVirtualFileSystem();
			const result = await vfs.readFile(`${DATA_MOUNT_PATH}/image.png`);

			expect(result).toEqual(binaryData);
		});

		it("should writeFile with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();
			vfs.writeFile(`${DATA_MOUNT_PATH}/written.txt`, "data write");

			const content = await vm.readFile("/written.txt");
			expect(content).toBe("data write");
		});

		it("should writeFile binary with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();
			const binaryData = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
			vfs.writeFile(`${DATA_MOUNT_PATH}/binary.bin`, binaryData);

			const result = await vm.readFileBinary("/binary.bin");
			expect(result).toEqual(binaryData);
		});

		it("should readDir with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.mkdir("/mydir");
			vm.writeFile("/mydir/a.txt", "a");
			vm.writeFile("/mydir/b.txt", "b");

			const vfs = vm.createVirtualFileSystem();
			const entries = await vfs.readDir(`${DATA_MOUNT_PATH}/mydir`);

			expect(entries).toContain("a.txt");
			expect(entries).toContain("b.txt");
		});

		it("should createDir with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();
			vfs.createDir(`${DATA_MOUNT_PATH}/newdir`);
			vfs.writeFile(`${DATA_MOUNT_PATH}/newdir/file.txt`, "test");

			const entries = await vm.readDir("/newdir");
			expect(entries).toContain("file.txt");
		});

		it("should removeFile with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.writeFile("/to-remove.txt", "delete me");
			expect(await vm.exists("/to-remove.txt")).toBe(true);

			const vfs = vm.createVirtualFileSystem();
			await vfs.removeFile(`${DATA_MOUNT_PATH}/to-remove.txt`);

			expect(await vm.exists("/to-remove.txt")).toBe(false);
		});

		it("should removeDir with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.mkdir("/empty-dir");
			expect(await vm.exists("/empty-dir")).toBe(true);

			const vfs = vm.createVirtualFileSystem();
			await vfs.removeDir(`${DATA_MOUNT_PATH}/empty-dir`);

			expect(await vm.exists("/empty-dir")).toBe(false);
		});

		it("should normalize /data alone to root", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.writeFile("/root-file.txt", "at root");

			const vfs = vm.createVirtualFileSystem();
			const entries = await vfs.readDir(DATA_MOUNT_PATH);

			expect(entries).toContain("root-file.txt");
		});

		it("should throw for nonexistent file with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();

			await expect(
				vfs.readTextFile(`${DATA_MOUNT_PATH}/nonexistent.txt`),
			).rejects.toThrow();
		});

		it("should throw for nonexistent directory with /data prefix", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();

			await expect(
				vfs.readDir(`${DATA_MOUNT_PATH}/nonexistent-dir`),
			).rejects.toThrow();
		});
	});

	describe("operations with direct path (no /data prefix)", () => {
		it("should readTextFile with direct path", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.writeFile("/test.txt", "hello world");
			const vfs = vm.createVirtualFileSystem();

			const content = await vfs.readTextFile("/test.txt");
			expect(content).toBe("hello world");
		});

		it("should readFile (binary) with direct path", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
			vm.writeFile("/image.png", binaryData);

			const vfs = vm.createVirtualFileSystem();
			const result = await vfs.readFile("/image.png");

			expect(result).toEqual(binaryData);
		});

		it("should writeFile with direct path", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();
			vfs.writeFile("/written.txt", "direct write");

			const content = await vm.readFile("/written.txt");
			expect(content).toBe("direct write");
		});

		it("should writeFile binary with direct path", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();
			const binaryData = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
			vfs.writeFile("/binary.bin", binaryData);

			const result = await vm.readFileBinary("/binary.bin");
			expect(result).toEqual(binaryData);
		});

		it("should readDir with direct path", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.mkdir("/mydir");
			vm.writeFile("/mydir/file1.txt", "a");
			vm.writeFile("/mydir/file2.txt", "b");

			const vfs = vm.createVirtualFileSystem();
			const entries = await vfs.readDir("/mydir");

			expect(entries).toContain("file1.txt");
			expect(entries).toContain("file2.txt");
		});

		it("should createDir with direct path", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();
			vfs.createDir("/newdir");
			vfs.writeFile("/newdir/file.txt", "test");

			const entries = await vm.readDir("/newdir");
			expect(entries).toContain("file.txt");
		});

		it("should removeFile with direct path", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.writeFile("/to-remove.txt", "delete me");
			expect(await vm.exists("/to-remove.txt")).toBe(true);

			const vfs = vm.createVirtualFileSystem();
			await vfs.removeFile("/to-remove.txt");

			expect(await vm.exists("/to-remove.txt")).toBe(false);
		});

		it("should removeDir with direct path", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.mkdir("/empty-dir");
			expect(await vm.exists("/empty-dir")).toBe(true);

			const vfs = vm.createVirtualFileSystem();
			await vfs.removeDir("/empty-dir");

			expect(await vm.exists("/empty-dir")).toBe(false);
		});

		it("should throw for nonexistent file with direct path", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();

			// Direct paths that don't exist in Directory will try shell fallback
			// Since the file doesn't exist anywhere, it should throw
			await expect(vfs.readTextFile("/nonexistent.txt")).rejects.toThrow();
		});

		it("should handle paths in /etc", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.mkdir("/etc");
			vm.writeFile("/etc/config.json", '{"key": "value"}');

			const vfs = vm.createVirtualFileSystem();
			const content = await vfs.readTextFile("/etc/config.json");
			expect(content).toBe('{"key": "value"}');
		});

		it("should handle paths in /node_modules", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.mkdir("/node_modules");
			vm.mkdir("/node_modules/my-pkg");
			vm.writeFile(
				"/node_modules/my-pkg/package.json",
				'{"name": "my-pkg", "version": "1.0.0"}',
			);

			const vfs = vm.createVirtualFileSystem();

			// Direct path access
			const content = await vfs.readTextFile(
				"/node_modules/my-pkg/package.json",
			);
			expect(JSON.parse(content)).toEqual({
				name: "my-pkg",
				version: "1.0.0",
			});

			// Same path via /data prefix should also work
			const content2 = await vfs.readTextFile(
				`${DATA_MOUNT_PATH}/node_modules/my-pkg/package.json`,
			);
			expect(JSON.parse(content2)).toEqual({
				name: "my-pkg",
				version: "1.0.0",
			});
		});
	});

	describe("nested paths and edge cases", () => {
		it("should list root directory", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.writeFile("/root-file.txt", "at root");
			vm.mkdir("/subdir");

			const vfs = vm.createVirtualFileSystem();
			const entries = await vfs.readDir("/");

			expect(entries).toContain("root-file.txt");
			expect(entries).toContain("subdir");
		});

		it("should handle deeply nested paths", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.mkdir("/a");
			vm.mkdir("/a/b");
			vm.mkdir("/a/b/c");
			vm.mkdir("/a/b/c/d");
			vm.writeFile("/a/b/c/d/deep.txt", "deep content");

			const vfs = vm.createVirtualFileSystem();

			// Read via direct path
			const content1 = await vfs.readTextFile("/a/b/c/d/deep.txt");
			expect(content1).toBe("deep content");

			// Read via /data prefix
			const content2 = await vfs.readTextFile(
				`${DATA_MOUNT_PATH}/a/b/c/d/deep.txt`,
			);
			expect(content2).toBe("deep content");

			// List each level
			expect(await vfs.readDir("/a")).toContain("b");
			expect(await vfs.readDir("/a/b")).toContain("c");
			expect(await vfs.readDir("/a/b/c")).toContain("d");
			expect(await vfs.readDir("/a/b/c/d")).toContain("deep.txt");
		});

		it("should handle files with same name at different levels", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.writeFile("/config.json", '{"level": "root"}');
			vm.mkdir("/app");
			vm.writeFile("/app/config.json", '{"level": "app"}');
			vm.mkdir("/app/sub");
			vm.writeFile("/app/sub/config.json", '{"level": "sub"}');

			const vfs = vm.createVirtualFileSystem();

			expect(await vfs.readTextFile("/config.json")).toBe('{"level": "root"}');
			expect(await vfs.readTextFile("/app/config.json")).toBe(
				'{"level": "app"}',
			);
			expect(await vfs.readTextFile("/app/sub/config.json")).toBe(
				'{"level": "sub"}',
			);
		});

		it("should handle empty directories", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			vm.mkdir("/empty");

			const vfs = vm.createVirtualFileSystem();
			const entries = await vfs.readDir("/empty");

			expect(entries).toEqual([]);
		});

		it("should overwrite existing files", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();

			vfs.writeFile("/overwrite.txt", "original");
			expect(await vfs.readTextFile("/overwrite.txt")).toBe("original");

			vfs.writeFile("/overwrite.txt", "updated!");
			expect(await vfs.readTextFile("/overwrite.txt")).toBe("updated!");
		});

		// Tests workaround for wasmer-js bug: Directory.writeFile missing truncate(true)
		it("should overwrite with shorter content", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();

			vfs.writeFile("/file.txt", "this is long content");
			expect(await vfs.readTextFile("/file.txt")).toBe("this is long content");

			vfs.writeFile("/file.txt", "short");
			expect(await vfs.readTextFile("/file.txt")).toBe("short");
		});

		it("should handle mixed /data and direct path access to same file", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();

			// Write via /data prefix
			vfs.writeFile(`${DATA_MOUNT_PATH}/mixed.txt`, "written via data");

			// Read via direct path
			expect(await vfs.readTextFile("/mixed.txt")).toBe("written via data");

			// Overwrite via direct path
			vfs.writeFile("/mixed.txt", "written directly");

			// Read via /data prefix
			expect(await vfs.readTextFile(`${DATA_MOUNT_PATH}/mixed.txt`)).toBe(
				"written directly",
			);
		});

		it("should handle special characters in filenames", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();

			// Spaces and dashes
			vfs.writeFile("/my-file name.txt", "content");
			expect(await vfs.readTextFile("/my-file name.txt")).toBe("content");

			// Dots
			vfs.writeFile("/file.test.backup.txt", "backup");
			expect(await vfs.readTextFile("/file.test.backup.txt")).toBe("backup");
		});

		it("should handle unicode content", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();

			const unicodeContent = "Hello 世界 🌍 émojis";
			vfs.writeFile("/unicode.txt", unicodeContent);

			expect(await vfs.readTextFile("/unicode.txt")).toBe(unicodeContent);
		});

		it("should handle empty file content", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();

			vfs.writeFile("/empty.txt", "");
			expect(await vfs.readTextFile("/empty.txt")).toBe("");
		});

		it("should handle large file content", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();

			// Create a ~100KB string
			const largeContent = "x".repeat(100 * 1024);
			vfs.writeFile("/large.txt", largeContent);

			expect(await vfs.readTextFile("/large.txt")).toBe(largeContent);
		});
	});

	describe("shell fallback for WASM-only paths", () => {
		it("should readDir /bin via shell fallback", async () => {
			// /bin exists in WASM (from webc - coreutils) but NOT in Directory
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			// Verify direct spawn works first
			const spawnResult = await vm.spawn("ls", ["-1", "/bin"]);
			expect(spawnResult.code).toBe(0);
			expect(spawnResult.stdout.length).toBeGreaterThan(0);

			const vfs = vm.createVirtualFileSystem();

			// This should fall back to 'ls' via shell
			const entries = await vfs.readDir("/bin");

			expect(entries.length).toBeGreaterThan(0);
			expect(entries.some((e) => e.length > 0)).toBe(true);
		});

		it("should readTextFile via shell fallback (cat)", async () => {
			// Test reading a file that exists in WASM but not in Directory
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			// First verify the file exists via shell
			const catResult = await vm.spawn("cat", ["/etc/passwd"]);
			// /etc/passwd may or may not exist depending on the webc
			// Let's try a file we know exists - check if there's anything in /bin
			const lsResult = await vm.spawn("ls", ["/bin"]);
			expect(lsResult.code).toBe(0);

			// If /etc/passwd exists, test reading it
			if (catResult.code === 0) {
				const vfs = vm.createVirtualFileSystem();
				const content = await vfs.readTextFile("/etc/passwd");
				expect(content.length).toBeGreaterThan(0);
			}
		});

		it("should NOT use shell fallback for /data paths that don't exist", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			const vfs = vm.createVirtualFileSystem();

			// /data paths should NOT fall back to shell - they should throw
			await expect(
				vfs.readTextFile(`${DATA_MOUNT_PATH}/nonexistent.txt`),
			).rejects.toThrow();
		});

		it("should try Directory first, then shell fallback", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			// Write file to Directory
			vm.writeFile("/myfile.txt", "from directory");

			const vfs = vm.createVirtualFileSystem();

			// File exists in Directory, should read from there (not shell)
			const content = await vfs.readTextFile("/myfile.txt");
			expect(content).toBe("from directory");
		});

		it("should prefer Directory over shell for overlapping paths", async () => {
			vm = new VirtualMachine({ loadNpm: false });
			await vm.init();

			// Create /bin in Directory (shadows WASM /bin)
			vm.mkdir("/bin");
			vm.writeFile("/bin/mytest", "from directory");

			const vfs = vm.createVirtualFileSystem();

			// Should read from Directory, not WASM
			const entries = await vfs.readDir("/bin");
			expect(entries).toContain("mytest");

			const content = await vfs.readTextFile("/bin/mytest");
			expect(content).toBe("from directory");
		});
	});
});
