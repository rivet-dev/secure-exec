import { Directory, init } from "@wasmer/sdk/node";
import { beforeAll, describe, expect, it } from "vitest";
import { SystemBridge } from "./index";

describe("SystemBridge", () => {
	beforeAll(async () => {
		await init();
	});

	describe("Step 3: Basic filesystem operations", () => {
		it("should write and read a file", async () => {
			const dir = new Directory();
			const bridge = new SystemBridge(dir);

			bridge.writeFile("/direct.txt", "hello");
			expect(await bridge.readFile("/direct.txt")).toBe("hello");
		});

		it("should write and read binary files", async () => {
			const dir = new Directory();
			const bridge = new SystemBridge(dir);

			const data = new Uint8Array([1, 2, 3, 4, 5]);
			bridge.writeFile("/binary.bin", data);

			const result = await bridge.readFileBinary("/binary.bin");
			expect(result).toEqual(data);
		});

		it("should create a directory and list contents", async () => {
			const dir = new Directory();
			const bridge = new SystemBridge(dir);

			bridge.mkdir("/subdir");
			bridge.writeFile("/subdir/file.txt", "content");

			const entries = await bridge.readDir("/subdir");
			expect(entries).toContain("file.txt");
		});

		it("should check if files exist", async () => {
			const dir = new Directory();
			const bridge = new SystemBridge(dir);

			bridge.writeFile("/exists.txt", "yes");

			expect(await bridge.exists("/exists.txt")).toBe(true);
			expect(await bridge.exists("/notexists.txt")).toBe(false);
		});

		it("should remove files", async () => {
			const dir = new Directory();
			const bridge = new SystemBridge(dir);

			bridge.writeFile("/toremove.txt", "delete me");
			expect(await bridge.exists("/toremove.txt")).toBe(true);

			await bridge.remove("/toremove.txt");
			expect(await bridge.exists("/toremove.txt")).toBe(false);
		});

		it("should create single directory level with mkdir", async () => {
			const dir = new Directory();
			const bridge = new SystemBridge(dir);

			// Note: wasmer Directory doesn't support nested mkdir
			// So we create single level directories
			bridge.mkdir("/mydir");
			bridge.writeFile("/mydir/file.txt", "content");

			expect(await bridge.readFile("/mydir/file.txt")).toBe("content");
		});

		it("should create Directory internally if not provided", async () => {
			const bridge = new SystemBridge();

			bridge.writeFile("/test.txt", "works");
			expect(await bridge.readFile("/test.txt")).toBe("works");
		});

		it("should expose the underlying Directory", () => {
			const dir = new Directory();
			const bridge = new SystemBridge(dir);

			expect(bridge.getDirectory()).toBe(dir);
		});
	});
});
