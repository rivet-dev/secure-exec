/**
 * Unit tests for normalizeFsPath and permission wrapper path traversal defense.
 *
 * Verifies that the permission layer normalizes paths before calling the
 * permission callback, preventing traversal attacks where a path like
 * /home/user/project/../../../etc/passwd bypasses a startsWith check.
 */

import { describe, expect, it } from "vitest";
import { normalizeFsPath, wrapFileSystem } from "../../src/kernel/permissions.js";
import type { Permissions } from "../../src/kernel/types.js";

describe("normalizeFsPath", () => {
	it("passes through simple absolute paths", () => {
		expect(normalizeFsPath("/home/user/file.txt")).toBe("/home/user/file.txt");
	});

	it("resolves single .. component", () => {
		expect(normalizeFsPath("/home/user/../file.txt")).toBe("/home/file.txt");
	});

	it("resolves multiple .. components", () => {
		expect(normalizeFsPath("/home/user/project/../../../etc/passwd")).toBe("/etc/passwd");
	});

	it("clamps .. at root (cannot traverse above /)", () => {
		expect(normalizeFsPath("/../../../etc/passwd")).toBe("/etc/passwd");
	});

	it("resolves . components", () => {
		expect(normalizeFsPath("/home/./user/./file.txt")).toBe("/home/user/file.txt");
	});

	it("collapses repeated slashes", () => {
		expect(normalizeFsPath("/home///user//file.txt")).toBe("/home/user/file.txt");
	});

	it("strips trailing slash (except root)", () => {
		expect(normalizeFsPath("/home/user/")).toBe("/home/user");
	});

	it("preserves root /", () => {
		expect(normalizeFsPath("/")).toBe("/");
	});

	it("normalizes relative paths", () => {
		expect(normalizeFsPath("../escape.txt")).toBe("escape.txt");
	});

	it("normalizes deep relative traversal", () => {
		expect(normalizeFsPath("../../../etc/passwd")).toBe("etc/passwd");
	});

	it("returns . for empty relative result", () => {
		expect(normalizeFsPath("..")).toBe(".");
	});
});

describe("wrapFileSystem traversal defense", () => {
	/**
	 * Build a spy VFS and permission wrapper to check which paths the
	 * permission callback sees.
	 */
	function createSpySetup(workDir: string) {
		const checkedPaths: Array<{ op: string; path: string }> = [];
		const permissions: Permissions = {
			fs: (req) => {
				checkedPaths.push({ op: req.op, path: req.path });
				const isWithin =
					req.path === workDir || req.path.startsWith(workDir + "/");
				return { allow: isWithin };
			},
		};

		const writes: Array<{ path: string; content: string }> = [];
		const baseFs = {
			readFile: async () => new Uint8Array(0),
			readTextFile: async () => "",
			readDir: async () => [],
			readDirWithTypes: async () => [],
			writeFile: async (path: string, content: string | Uint8Array) => {
				writes.push({ path, content: typeof content === "string" ? content : "[binary]" });
			},
			createDir: async () => {},
			mkdir: async () => {},
			exists: async () => true,
			stat: async () => ({
				mode: 0o644, size: 0, isDirectory: false, isSymbolicLink: false,
				atimeMs: 0, mtimeMs: 0, ctimeMs: 0, birthtimeMs: 0,
				ino: 1, nlink: 1, uid: 0, gid: 0,
			}),
			removeFile: async () => {},
			removeDir: async () => {},
			rename: async () => {},
			symlink: async () => {},
			readlink: async () => "",
			lstat: async () => ({
				mode: 0o644, size: 0, isDirectory: false, isSymbolicLink: false,
				atimeMs: 0, mtimeMs: 0, ctimeMs: 0, birthtimeMs: 0,
				ino: 1, nlink: 1, uid: 0, gid: 0,
			}),
			link: async () => {},
			chmod: async () => {},
			chown: async () => {},
			utimes: async () => {},
			truncate: async () => {},
			realpath: async (p: string) => p,
			pread: async () => new Uint8Array(0),
		};

		const wrapped = wrapFileSystem(baseFs, permissions);
		return { wrapped, checkedPaths, writes };
	}

	it("allows write to path within workDir", async () => {
		const workDir = "/home/user/project";
		const { wrapped, writes } = createSpySetup(workDir);

		await wrapped.writeFile("/home/user/project/file.txt", "data");
		expect(writes).toHaveLength(1);
		expect(writes[0].path).toBe("/home/user/project/file.txt");
	});

	it("denies write with embedded ../ that escapes workDir", async () => {
		const workDir = "/home/user/project";
		const { wrapped, checkedPaths, writes } = createSpySetup(workDir);

		await expect(
			wrapped.writeFile("/home/user/project/../../../etc/passwd", "evil"),
		).rejects.toThrow(/permission denied/);

		// The permission callback must have seen the normalized path
		expect(checkedPaths).toHaveLength(1);
		expect(checkedPaths[0].path).toBe("/etc/passwd");
		expect(writes).toHaveLength(0);
	});

	it("denies write with absolute path outside workDir", async () => {
		const workDir = "/home/user/project";
		const { wrapped, writes } = createSpySetup(workDir);

		await expect(
			wrapped.writeFile("/etc/passwd", "evil"),
		).rejects.toThrow(/permission denied/);

		expect(writes).toHaveLength(0);
	});

	it("denies write with single ../ escape", async () => {
		const workDir = "/home/user/project";
		const { wrapped, checkedPaths, writes } = createSpySetup(workDir);

		await expect(
			wrapped.writeFile("/home/user/project/../escape.txt", "evil"),
		).rejects.toThrow(/permission denied/);

		expect(checkedPaths[0].path).toBe("/home/user/escape.txt");
		expect(writes).toHaveLength(0);
	});

	it("does not confuse prefix match (/home/user/project-other)", async () => {
		const workDir = "/home/user/project";
		const { wrapped, writes } = createSpySetup(workDir);

		await expect(
			wrapped.writeFile("/home/user/project-other/file.txt", "evil"),
		).rejects.toThrow(/permission denied/);

		expect(writes).toHaveLength(0);
	});
});
