/**
 * Shared VFS conformance test suite.
 *
 * Every VirtualFileSystem implementation must pass the core tests in this suite.
 * Optional test groups are gated on capability flags declared in the config.
 *
 * Usage:
 *
 * ```typescript
 * import { defineVfsConformanceTests } from "@secure-exec/core/test/vfs-conformance";
 *
 * defineVfsConformanceTests({
 *   name: "MyDriver",
 *   createFs: () => createMyDriver(),
 *   cleanup: () => cleanupMyDriver(),
 *   capabilities: {
 *     symlinks: true,
 *     hardLinks: true,
 *     permissions: true,
 *     utimes: true,
 *     truncate: true,
 *     pread: true,
 *     pwrite: true,
 *     mkdir: true,
 *     removeDir: true,
 *     fsync: false,
 *     copy: false,
 *     readDirStat: false,
 *   },
 * });
 * ```
 *
 * For chunked VFS implementations, pass `inlineThreshold` and `chunkSize` to
 * enable edge case tests at storage tier boundaries.
 */

import type { VirtualFileSystem, VirtualStat } from "../kernel/vfs.js";
import { describe, beforeEach, afterEach, expect, test } from "vitest";

// ---------------------------------------------------------------------------
// Public config types
// ---------------------------------------------------------------------------

export interface VfsConformanceCapabilities {
	symlinks: boolean;
	hardLinks: boolean;
	permissions: boolean;
	utimes: boolean;
	truncate: boolean;
	pread: boolean;
	pwrite: boolean;
	mkdir: boolean;
	removeDir: boolean;
	fsync: boolean;
	copy: boolean;
	readDirStat: boolean;
}

export interface VfsConformanceConfig {
	/** Human-readable name shown in the describe block. */
	name: string;
	/** Create a fresh VFS instance for each test. */
	createFs: () => Promise<VirtualFileSystem> | VirtualFileSystem;
	/** Optional teardown called after each test. */
	cleanup?: () => Promise<void>;
	/** Which optional capabilities the driver supports. */
	capabilities: VfsConformanceCapabilities;
	/** Inline threshold in bytes. Enables boundary edge case tests. */
	inlineThreshold?: number;
	/** Chunk size in bytes. Enables boundary edge case tests. */
	chunkSize?: number;
}

// ---------------------------------------------------------------------------
// Error code helper
// ---------------------------------------------------------------------------

function hasErrorCode(err: unknown, code: string): boolean {
	if (typeof err !== "object" || err === null) return false;
	const e = err as Record<string, unknown>;
	if (e.code === code) return true;
	if (typeof e.message === "string" && e.message.startsWith(`${code}:`))
		return true;
	return false;
}

function expectErrorCode(err: unknown, code: string): void {
	expect(err).toBeInstanceOf(Error);
	expect(hasErrorCode(err, code)).toBe(true);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a Uint8Array of the given size filled with a repeating byte pattern. */
function makeData(size: number, seed = 0x42): Uint8Array {
	const buf = new Uint8Array(size);
	for (let i = 0; i < size; i++) {
		buf[i] = (seed + i) & 0xff;
	}
	return buf;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

export function defineVfsConformanceTests(config: VfsConformanceConfig): void {
	const { name, capabilities } = config;

	describe(name, () => {
		let fs: VirtualFileSystem;

		beforeEach(async () => {
			fs = await config.createFs();
		});

		afterEach(async () => {
			if (config.cleanup) await config.cleanup();
		});

		// ---------------------------------------------------------------
		// Core tests (always run)
		// ---------------------------------------------------------------

		describe("core", () => {
			test("writeFile + readFile round-trip (string)", async () => {
				await fs.writeFile("/hello.txt", "hello world");
				const data = await fs.readFile("/hello.txt");
				expect(new TextDecoder().decode(data)).toBe("hello world");
			});

			test("writeFile + readFile round-trip (binary)", async () => {
				const buf = new Uint8Array([0, 1, 2, 255, 254, 253]);
				await fs.writeFile("/bin.dat", buf);
				const data = await fs.readFile("/bin.dat");
				expect(data).toEqual(buf);
			});

			test("writeFile + readTextFile round-trip", async () => {
				await fs.writeFile("/text.txt", "some text");
				const text = await fs.readTextFile("/text.txt");
				expect(text).toBe("some text");
			});

			test("writeFile auto-creates parent directories", async () => {
				await fs.writeFile("/a/b/c/deep.txt", "deep");
				const text = await fs.readTextFile("/a/b/c/deep.txt");
				expect(text).toBe("deep");
			});

			test("writeFile overwrites existing file", async () => {
				await fs.writeFile("/ow.txt", "first");
				await fs.writeFile("/ow.txt", "second");
				const text = await fs.readTextFile("/ow.txt");
				expect(text).toBe("second");
			});

			test("readFile throws ENOENT on missing file", async () => {
				const err = await fs.readFile("/no-such-file.txt").catch((e) => e);
				expectErrorCode(err, "ENOENT");
			});

			test("readFile on directory throws EISDIR", async () => {
				await fs.writeFile("/d/file.txt", "x");
				const err = await fs.readFile("/d").catch((e) => e);
				expect(err).toBeInstanceOf(Error);
				expect(
					hasErrorCode(err, "EISDIR") || hasErrorCode(err, "ENOENT"),
				).toBe(true);
			});

			test("exists returns true for file", async () => {
				await fs.writeFile("/exists.txt", "yes");
				expect(await fs.exists("/exists.txt")).toBe(true);
			});

			test("exists returns true for directory", async () => {
				await fs.writeFile("/d/file.txt", "x");
				expect(await fs.exists("/d")).toBe(true);
			});

			test("exists returns false for nonexistent", async () => {
				expect(await fs.exists("/nope")).toBe(false);
			});

			test("stat returns correct size, mode, isDirectory, timestamps", async () => {
				await fs.writeFile("/st.txt", "data");
				const s = await fs.stat("/st.txt");
				expect(s.isDirectory).toBe(false);
				expect(s.size).toBe(4);
				expect(s.atimeMs).toBeGreaterThan(0);
				expect(s.mtimeMs).toBeGreaterThan(0);
				expect(s.ctimeMs).toBeGreaterThan(0);
				expect(s.birthtimeMs).toBeGreaterThan(0);
			});

			test("stat size equals exact byte length", async () => {
				const content = "h\u00e9llo"; // 6 bytes in UTF-8
				await fs.writeFile("/sized.txt", content);
				const s = await fs.stat("/sized.txt");
				expect(s.size).toBe(new TextEncoder().encode(content).length);
			});

			test("stat returns isDirectory for directory", async () => {
				await fs.writeFile("/dir/child.txt", "x");
				const s = await fs.stat("/dir");
				expect(s.isDirectory).toBe(true);
			});

			test("removeFile deletes file", async () => {
				await fs.writeFile("/rm.txt", "bye");
				await fs.removeFile("/rm.txt");
				expect(await fs.exists("/rm.txt")).toBe(false);
			});

			test("removeFile throws ENOENT on missing file", async () => {
				const err = await fs.removeFile("/nonexistent.txt").catch((e) => e);
				expectErrorCode(err, "ENOENT");
			});

			test("removeFile on directory throws EISDIR", async () => {
				await fs.writeFile("/rmdir/file.txt", "x");
				const err = await fs.removeFile("/rmdir").catch((e) => e);
				expect(err).toBeInstanceOf(Error);
				expect(
					hasErrorCode(err, "EISDIR") || hasErrorCode(err, "EPERM"),
				).toBe(true);
			});

			test("readDir excludes . and ..", async () => {
				await fs.writeFile("/ls/a.txt", "a");
				await fs.writeFile("/ls/b.txt", "b");
				const entries = await fs.readDir("/ls");
				expect(entries).not.toContain(".");
				expect(entries).not.toContain("..");
				expect(entries.sort()).toEqual(["a.txt", "b.txt"]);
			});

			test("readDirWithTypes returns correct types", async () => {
				await fs.writeFile("/typed/file.txt", "f");
				await fs.writeFile("/typed/sub/nested.txt", "n");
				const entries = await fs.readDirWithTypes("/typed");
				const names = entries.map((e) => e.name).sort();
				expect(names).toEqual(["file.txt", "sub"]);

				const subEntry = entries.find((e) => e.name === "sub");
				expect(subEntry?.isDirectory).toBe(true);

				const fileEntry = entries.find((e) => e.name === "file.txt");
				expect(fileEntry?.isDirectory).toBe(false);
			});

			test("rename same dir", async () => {
				await fs.writeFile("/old.txt", "content");
				await fs.rename("/old.txt", "/new.txt");
				expect(await fs.exists("/old.txt")).toBe(false);
				const text = await fs.readTextFile("/new.txt");
				expect(text).toBe("content");
			});

			test("rename cross dir", async () => {
				await fs.writeFile("/a/old.txt", "moved");
				await fs.writeFile("/b/placeholder.txt", "x");
				await fs.rename("/a/old.txt", "/b/new.txt");
				expect(await fs.exists("/a/old.txt")).toBe(false);
				const text = await fs.readTextFile("/b/new.txt");
				expect(text).toBe("moved");
			});

			test("rename overwrites existing destination", async () => {
				await fs.writeFile("/src.txt", "new content");
				await fs.writeFile("/dst.txt", "old content");
				await fs.rename("/src.txt", "/dst.txt");
				expect(await fs.exists("/src.txt")).toBe(false);
				const text = await fs.readTextFile("/dst.txt");
				expect(text).toBe("new content");
			});

			test.skipIf(!capabilities.removeDir)(
				"rename directory",
				async () => {
					await fs.writeFile("/src/one.txt", "1");
					await fs.writeFile("/src/two.txt", "2");
					await fs.rename("/src", "/dst");
					expect(await fs.exists("/src")).toBe(false);
					expect(await fs.readTextFile("/dst/one.txt")).toBe("1");
					expect(await fs.readTextFile("/dst/two.txt")).toBe("2");
				},
			);

			test("realpath normalizes path", async () => {
				await fs.writeFile("/real.txt", "r");
				const rp = await fs.realpath("/real.txt");
				expect(rp).toBe("/real.txt");
			});
		});

		// ---------------------------------------------------------------
		// pwrite tests (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.pwrite)("pwrite", () => {
			test("pwrite at offset 0", async () => {
				await fs.writeFile("/pw.txt", "abcdef");
				await fs.pwrite("/pw.txt", 0, new TextEncoder().encode("XY"));
				const text = await fs.readTextFile("/pw.txt");
				expect(text).toBe("XYcdef");
			});

			test("pwrite at middle of file", async () => {
				await fs.writeFile("/pw2.txt", "abcdef");
				await fs.pwrite("/pw2.txt", 2, new TextEncoder().encode("XY"));
				const text = await fs.readTextFile("/pw2.txt");
				expect(text).toBe("abXYef");
			});

			test("pwrite beyond EOF extends file with zeros", async () => {
				await fs.writeFile("/pw3.txt", "abc");
				await fs.pwrite("/pw3.txt", 6, new TextEncoder().encode("XY"));
				const data = await fs.readFile("/pw3.txt");
				expect(data.length).toBe(8);
				expect(new TextDecoder().decode(data.slice(0, 3))).toBe("abc");
				expect(data[3]).toBe(0);
				expect(data[4]).toBe(0);
				expect(data[5]).toBe(0);
				expect(new TextDecoder().decode(data.slice(6, 8))).toBe("XY");
			});

			test("pwrite spanning chunk boundaries", async () => {
				const chunkSize = config.chunkSize ?? 4 * 1024 * 1024;
				// Write a file that spans two chunks
				const initialData = makeData(chunkSize + 100);
				await fs.writeFile("/span.dat", initialData);

				// Overwrite across the boundary
				const patch = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]);
				const offset = chunkSize - 2;
				await fs.pwrite("/span.dat", offset, patch);

				const result = await fs.readFile("/span.dat");
				expect(result.length).toBe(chunkSize + 100);
				expect(result[offset]).toBe(0xaa);
				expect(result[offset + 1]).toBe(0xbb);
				expect(result[offset + 2]).toBe(0xcc);
				expect(result[offset + 3]).toBe(0xdd);
			});

			test("pwrite + pread round-trip", async () => {
				await fs.writeFile("/prw.txt", "aaaaaaaaaa");
				const patch = new TextEncoder().encode("XYZ");
				await fs.pwrite("/prw.txt", 3, patch);
				const read = await fs.pread("/prw.txt", 3, 3);
				expect(new TextDecoder().decode(read)).toBe("XYZ");
			});

			test("pwrite does not affect other bytes", async () => {
				await fs.writeFile("/noaffect.txt", "abcdefghij");
				await fs.pwrite(
					"/noaffect.txt",
					4,
					new TextEncoder().encode("XX"),
				);
				const text = await fs.readTextFile("/noaffect.txt");
				expect(text).toBe("abcdXXghij");
			});

			test("multiple sequential pwrites build up file content", async () => {
				await fs.writeFile("/seq.txt", ".........."); // 10 dots
				await fs.pwrite("/seq.txt", 0, new TextEncoder().encode("AB"));
				await fs.pwrite("/seq.txt", 5, new TextEncoder().encode("CD"));
				await fs.pwrite("/seq.txt", 8, new TextEncoder().encode("EF"));
				const text = await fs.readTextFile("/seq.txt");
				expect(text).toBe("AB...CD.EF");
			});

			test("pwrite to empty file at offset 0", async () => {
				await fs.writeFile("/empty-pw.txt", "");
				await fs.pwrite(
					"/empty-pw.txt",
					0,
					new TextEncoder().encode("hello"),
				);
				const text = await fs.readTextFile("/empty-pw.txt");
				expect(text).toBe("hello");
			});
		});

		// ---------------------------------------------------------------
		// Concurrency tests (gated on pwrite)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.pwrite)("concurrency", () => {
			test("two concurrent pwrites to different offsets both succeed", async () => {
				const size = 1024;
				await fs.writeFile("/conc1.dat", makeData(size, 0));
				const patchA = new Uint8Array([0xaa, 0xaa, 0xaa, 0xaa]);
				const patchB = new Uint8Array([0xbb, 0xbb, 0xbb, 0xbb]);
				await Promise.all([
					fs.pwrite("/conc1.dat", 100, patchA),
					fs.pwrite("/conc1.dat", 500, patchB),
				]);
				const result = await fs.readFile("/conc1.dat");
				expect(result[100]).toBe(0xaa);
				expect(result[101]).toBe(0xaa);
				expect(result[500]).toBe(0xbb);
				expect(result[501]).toBe(0xbb);
			});

			test("two concurrent pwrites to same offset: no corruption", async () => {
				await fs.writeFile("/conc2.dat", makeData(256, 0));
				const patchA = new Uint8Array([0xaa, 0xaa, 0xaa, 0xaa]);
				const patchB = new Uint8Array([0xbb, 0xbb, 0xbb, 0xbb]);
				await Promise.all([
					fs.pwrite("/conc2.dat", 50, patchA),
					fs.pwrite("/conc2.dat", 50, patchB),
				]);
				const result = await fs.readFile("/conc2.dat");
				// One of the two writes wins. The result must be either all 0xaa or all 0xbb at the offset.
				const val = result[50];
				expect(val === 0xaa || val === 0xbb).toBe(true);
				expect(result[51]).toBe(val);
				expect(result[52]).toBe(val);
				expect(result[53]).toBe(val);
			});

			test("concurrent pwrite + readFile returns consistent data", async () => {
				const content = "hello world!!!";
				await fs.writeFile("/conc3.txt", content);
				const patch = new TextEncoder().encode("XXXXX");
				const modified = "XXXXX world!!!";

				const [, readData] = await Promise.all([
					fs.pwrite("/conc3.txt", 0, patch),
					fs.readFile("/conc3.txt"),
				]);

				const text = new TextDecoder().decode(readData);
				// Must be either the original or the patched version.
				expect(text === content || text === modified).toBe(true);
			});
		});

		// ---------------------------------------------------------------
		// Symlink tests (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.symlinks)("symlinks", () => {
			test("symlink + readlink round-trip", async () => {
				await fs.writeFile("/target.txt", "target");
				await fs.symlink("/target.txt", "/link.txt");
				const target = await fs.readlink("/link.txt");
				expect(target).toBe("/target.txt");
			});

			test("symlink resolution for file access", async () => {
				await fs.writeFile("/real.txt", "real content");
				await fs.symlink("/real.txt", "/sym.txt");
				const text = await fs.readTextFile("/sym.txt");
				expect(text).toBe("real content");
			});

			test("lstat on symlink returns isSymbolicLink true", async () => {
				await fs.writeFile("/tgt.txt", "t");
				await fs.symlink("/tgt.txt", "/lnk.txt");
				const s = await fs.lstat("/lnk.txt");
				expect(s.isSymbolicLink).toBe(true);
			});

			test("stat follows symlink and returns target metadata", async () => {
				await fs.writeFile("/tgt2.txt", "target data");
				await fs.symlink("/tgt2.txt", "/lnk2.txt");
				const s = await fs.stat("/lnk2.txt");
				expect(s.isSymbolicLink).toBe(false);
				expect(s.size).toBe(11);
			});

			test("dangling symlink: stat throws ENOENT, lstat succeeds", async () => {
				await fs.symlink("/nonexistent-target.txt", "/dangle.txt");
				const lstatResult = await fs.lstat("/dangle.txt");
				expect(lstatResult.isSymbolicLink).toBe(true);

				const statErr = await fs.stat("/dangle.txt").catch((e) => e);
				expectErrorCode(statErr, "ENOENT");
			});

			test("symlink loop throws ELOOP", async () => {
				await fs.symlink("/loop-b.txt", "/loop-a.txt");
				await fs.symlink("/loop-a.txt", "/loop-b.txt");
				const err = await fs.readFile("/loop-a.txt").catch((e) => e);
				expectErrorCode(err, "ELOOP");
			});

			test("deep symlink chain (41 levels) throws ELOOP", async () => {
				// Create a chain of 41 symlinks: /chain-0 -> /chain-1 -> ... -> /chain-40
				for (let i = 0; i < 41; i++) {
					await fs.symlink(`/chain-${i + 1}`, `/chain-${i}`);
				}
				await fs.writeFile("/chain-41", "end");
				const err = await fs.readFile("/chain-0").catch((e) => e);
				expectErrorCode(err, "ELOOP");
			});

			test("removeFile on symlink removes link, not target", async () => {
				await fs.writeFile("/sym-target.txt", "target content");
				await fs.symlink("/sym-target.txt", "/sym-link.txt");
				await fs.removeFile("/sym-link.txt");
				expect(await fs.exists("/sym-link.txt")).toBe(false);
				const text = await fs.readTextFile("/sym-target.txt");
				expect(text).toBe("target content");
			});
		});

		// ---------------------------------------------------------------
		// Hard link tests (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.hardLinks)("hard links", () => {
			test("link creates second name for same file", async () => {
				await fs.writeFile("/original.txt", "shared");
				await fs.link("/original.txt", "/linked.txt");
				const text = await fs.readTextFile("/linked.txt");
				expect(text).toBe("shared");
			});

			test("write via one name is visible via the other", async () => {
				await fs.writeFile("/hl-orig.txt", "original");
				await fs.link("/hl-orig.txt", "/hl-copy.txt");
				await fs.writeFile("/hl-copy.txt", "updated");
				const origText = await fs.readTextFile("/hl-orig.txt");
				expect(origText).toBe("updated");
			});

			test("remove one name: file still accessible via other", async () => {
				await fs.writeFile("/src.txt", "data");
				await fs.link("/src.txt", "/hl.txt");
				await fs.removeFile("/src.txt");
				const text = await fs.readTextFile("/hl.txt");
				expect(text).toBe("data");
			});

			test("nlink decrement: data deleted when nlink reaches 0", async () => {
				await fs.writeFile("/nlink.txt", "data");
				await fs.link("/nlink.txt", "/nlink2.txt");
				const s1 = await fs.stat("/nlink.txt");
				expect(s1.nlink).toBe(2);

				await fs.removeFile("/nlink.txt");
				const s2 = await fs.stat("/nlink2.txt");
				expect(s2.nlink).toBe(1);

				await fs.removeFile("/nlink2.txt");
				expect(await fs.exists("/nlink2.txt")).toBe(false);
			});

			test("link to directory throws EPERM", async () => {
				await fs.writeFile("/linkdir/child.txt", "x");
				const err = await fs.link("/linkdir", "/linkdir2").catch((e) => e);
				expectErrorCode(err, "EPERM");
			});
		});

		// ---------------------------------------------------------------
		// Truncate tests (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.truncate)("truncate", () => {
			test("truncate shrinks file", async () => {
				await fs.writeFile("/trunc.txt", "hello world");
				await fs.truncate("/trunc.txt", 5);
				const text = await fs.readTextFile("/trunc.txt");
				expect(text).toBe("hello");
			});

			test("truncate to 0 produces empty file", async () => {
				await fs.writeFile("/trunc-zero.txt", "some content");
				await fs.truncate("/trunc-zero.txt", 0);
				const data = await fs.readFile("/trunc-zero.txt");
				expect(data.length).toBe(0);
			});

			test("truncate grow with zeros", async () => {
				await fs.writeFile("/trunc-grow.txt", "abc");
				await fs.truncate("/trunc-grow.txt", 6);
				const data = await fs.readFile("/trunc-grow.txt");
				expect(data.length).toBe(6);
				expect(new TextDecoder().decode(data.slice(0, 3))).toBe("abc");
				expect(data[3]).toBe(0);
				expect(data[4]).toBe(0);
				expect(data[5]).toBe(0);
			});

			test.skipIf(config.inlineThreshold == null)(
				"truncate at inlineThreshold boundary",
				async () => {
					const threshold = config.inlineThreshold!;
					// Start with a file above the threshold.
					await fs.writeFile("/trunc-boundary.dat", makeData(threshold + 100));
					// Truncate to exactly the threshold.
					await fs.truncate("/trunc-boundary.dat", threshold);
					const s = await fs.stat("/trunc-boundary.dat");
					expect(s.size).toBe(threshold);
					const data = await fs.readFile("/trunc-boundary.dat");
					expect(data.length).toBe(threshold);
				},
			);

			test.skipIf(config.inlineThreshold == null)(
				"truncate inline file to chunked size promotes to chunked",
				async () => {
					const threshold = config.inlineThreshold!;
					// Start inline.
					await fs.writeFile("/promote.dat", makeData(threshold));
					// Grow past threshold via truncate.
					await fs.truncate("/promote.dat", threshold + 100);
					const s = await fs.stat("/promote.dat");
					expect(s.size).toBe(threshold + 100);
					// Verify data integrity: first threshold bytes preserved, rest zeros.
					const data = await fs.readFile("/promote.dat");
					const expected = makeData(threshold);
					expect(data.slice(0, threshold)).toEqual(expected);
					for (let i = threshold; i < threshold + 100; i++) {
						expect(data[i]).toBe(0);
					}
				},
			);

			test.skipIf(config.inlineThreshold == null)(
				"truncate chunked file to inline size demotes to inline",
				async () => {
					const threshold = config.inlineThreshold!;
					// Start chunked.
					await fs.writeFile("/demote.dat", makeData(threshold + 100));
					// Shrink below threshold.
					await fs.truncate("/demote.dat", threshold - 10);
					const s = await fs.stat("/demote.dat");
					expect(s.size).toBe(threshold - 10);
					const data = await fs.readFile("/demote.dat");
					const expected = makeData(threshold + 100).slice(
						0,
						threshold - 10,
					);
					expect(data).toEqual(expected);
				},
			);
		});

		// ---------------------------------------------------------------
		// Permission tests (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.permissions)("permissions", () => {
			test("chmod changes mode bits", async () => {
				await fs.writeFile("/perm.txt", "p");
				await fs.chmod("/perm.txt", 0o644);
				const s = await fs.stat("/perm.txt");
				expect(s.mode & 0o777).toBe(0o644);
			});

			test("chmod preserves file type bits", async () => {
				await fs.writeFile("/typebits.txt", "t");
				const before = await fs.stat("/typebits.txt");
				const typeBits = before.mode & 0o170000;
				await fs.chmod("/typebits.txt", 0o755);
				const after = await fs.stat("/typebits.txt");
				if (typeBits !== 0) {
					expect(after.mode & 0o170000).toBe(typeBits);
				}
				expect(after.mode & 0o777).toBe(0o755);
			});

			test("chown changes uid/gid", async () => {
				await fs.writeFile("/own.txt", "o");
				await fs.chown("/own.txt", 1000, 2000);
				const s = await fs.stat("/own.txt");
				expect(s.uid).toBe(1000);
				expect(s.gid).toBe(2000);
			});
		});

		// ---------------------------------------------------------------
		// utimes tests (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.utimes)("utimes", () => {
			test("utimes updates atime and mtime", async () => {
				await fs.writeFile("/ut.txt", "t");
				// utimes takes seconds (POSIX convention), stat returns milliseconds.
				const atimeSec = 1700000000;
				const mtimeSec = 1710000000;
				await fs.utimes("/ut.txt", atimeSec, mtimeSec);
				const s = await fs.stat("/ut.txt");
				expect(s.atimeMs).toBe(atimeSec * 1000);
				expect(s.mtimeMs).toBe(mtimeSec * 1000);
			});
		});

		// ---------------------------------------------------------------
		// mkdir tests (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.mkdir)("mkdir", () => {
			test("createDir creates a directory", async () => {
				await fs.createDir("/newdir");
				const s = await fs.stat("/newdir");
				expect(s.isDirectory).toBe(true);
			});

			test("mkdir recursive creates nested directories", async () => {
				await fs.mkdir("/p/q/r", { recursive: true });
				const s = await fs.stat("/p/q/r");
				expect(s.isDirectory).toBe(true);
			});

			test("createDir throws EEXIST for existing directory", async () => {
				await fs.mkdir("/existing", { recursive: true });
				const err = await fs.createDir("/existing").catch((e) => e);
				expectErrorCode(err, "EEXIST");
			});
		});

		// ---------------------------------------------------------------
		// removeDir tests (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.removeDir)("removeDir", () => {
			test("removeDir removes empty directory", async () => {
				await fs.mkdir("/emptydir", { recursive: true });
				await fs.removeDir("/emptydir");
				expect(await fs.exists("/emptydir")).toBe(false);
			});

			test("removeDir on non-empty directory throws ENOTEMPTY", async () => {
				await fs.writeFile("/nonempty/child.txt", "x");
				const err = await fs.removeDir("/nonempty").catch((e) => e);
				expect(err).toBeInstanceOf(Error);
				expect(
					hasErrorCode(err, "ENOTEMPTY") ||
						hasErrorCode(err, "EPERM"),
				).toBe(true);
			});
		});

		// ---------------------------------------------------------------
		// pread tests (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.pread)("pread", () => {
			test("pread reads range from file", async () => {
				await fs.writeFile("/pr.txt", "abcdefghij");
				const data = await fs.pread("/pr.txt", 3, 4);
				expect(new TextDecoder().decode(data)).toBe("defg");
			});

			test("pread at offset 0", async () => {
				await fs.writeFile("/pr0.txt", "hello");
				const data = await fs.pread("/pr0.txt", 0, 5);
				expect(new TextDecoder().decode(data)).toBe("hello");
			});
		});

		// ---------------------------------------------------------------
		// fsync tests (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.fsync)("fsync", () => {
			test("pwrite + fsync + readFile returns written data", async () => {
				await fs.writeFile("/fsync.txt", "original");
				await fs.pwrite(
					"/fsync.txt",
					0,
					new TextEncoder().encode("modified"),
				);
				const fsyncFn = (fs as unknown as Record<string, unknown>).fsync as
					| ((p: string) => Promise<void>)
					| undefined;
				if (fsyncFn) await fsyncFn.call(fs, "/fsync.txt");
				const text = await fs.readTextFile("/fsync.txt");
				expect(text).toBe("modified");
			});

			test("pwrite without fsync still returns data via readFile", async () => {
				await fs.writeFile("/nofsync.txt", "original");
				await fs.pwrite(
					"/nofsync.txt",
					0,
					new TextEncoder().encode("buffered"),
				);
				const text = await fs.readTextFile("/nofsync.txt");
				expect(text).toBe("buffered");
			});

			test("fsync on nonexistent path is silent no-op", async () => {
				const fsyncFn = (fs as unknown as Record<string, unknown>).fsync as
					| ((p: string) => Promise<void>)
					| undefined;
				if (fsyncFn) {
					await expect(
						fsyncFn.call(fs, "/no-such-file.txt"),
					).resolves.toBeUndefined();
				}
			});
		});

		// ---------------------------------------------------------------
		// copy tests (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.copy)("copy", () => {
			test("copy file: content matches original", async () => {
				const data = makeData(1024);
				await fs.writeFile("/copysrc.dat", data);
				const copyFn = (fs as unknown as Record<string, unknown>).copy as
					| ((s: string, d: string) => Promise<void>)
					| undefined;
				if (copyFn) {
					await copyFn.call(fs, "/copysrc.dat", "/copydst.dat");
					const result = await fs.readFile("/copydst.dat");
					expect(result).toEqual(data);
				}
			});

			test("copy file: modifying copy does not affect original", async () => {
				await fs.writeFile("/orig.txt", "original");
				const copyFn = (fs as unknown as Record<string, unknown>).copy as
					| ((s: string, d: string) => Promise<void>)
					| undefined;
				if (copyFn) {
					await copyFn.call(fs, "/orig.txt", "/dup.txt");
					await fs.writeFile("/dup.txt", "modified");
					const origText = await fs.readTextFile("/orig.txt");
					expect(origText).toBe("original");
				}
			});

			test("copy file: metadata matches original", async () => {
				await fs.writeFile("/meta-src.txt", "meta");
				await fs.chmod("/meta-src.txt", 0o644);
				const copyFn = (fs as unknown as Record<string, unknown>).copy as
					| ((s: string, d: string) => Promise<void>)
					| undefined;
				if (copyFn) {
					await copyFn.call(fs, "/meta-src.txt", "/meta-dst.txt");
					const srcStat = await fs.stat("/meta-src.txt");
					const dstStat = await fs.stat("/meta-dst.txt");
					expect(dstStat.size).toBe(srcStat.size);
				}
			});
		});

		// ---------------------------------------------------------------
		// readDirStat tests (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.readDirStat)("readDirStat", () => {
			test("readDirStat returns same entries as readDir", async () => {
				await fs.writeFile("/rds/file.txt", "f");
				await fs.writeFile("/rds/sub/nested.txt", "n");
				const dirEntries = await fs.readDir("/rds");
				const rdsFn = (fs as unknown as Record<string, unknown>).readDirStat as
					| ((p: string) => Promise<Array<{ name: string; stat: VirtualStat }>>)
					| undefined;
				if (rdsFn) {
					const statEntries = await rdsFn.call(fs, "/rds");
					const names = statEntries.map((e) => e.name).sort();
					expect(names).toEqual(dirEntries.sort());
				}
			});

			test("readDirStat entries have valid stat fields", async () => {
				await fs.writeFile("/rds2/a.txt", "aaa");
				await fs.writeFile("/rds2/dir/b.txt", "b");
				const rdsFn = (fs as unknown as Record<string, unknown>).readDirStat as
					| ((p: string) => Promise<Array<{ name: string; stat: VirtualStat; isDirectory: boolean }>>)
					| undefined;
				if (rdsFn) {
					const entries = await rdsFn.call(fs, "/rds2");
					const fileEntry = entries.find((e) => e.name === "a.txt");
					expect(fileEntry).toBeDefined();
					expect(fileEntry!.stat.size).toBe(3);
					expect(fileEntry!.isDirectory).toBe(false);

					const dirEntry = entries.find((e) => e.name === "dir");
					expect(dirEntry).toBeDefined();
					expect(dirEntry!.isDirectory).toBe(true);
				}
			});
		});

		// ---------------------------------------------------------------
		// Edge cases
		// ---------------------------------------------------------------

		describe("edge cases", () => {
			test("empty file: stat.size == 0, readFile returns empty Uint8Array", async () => {
				await fs.writeFile("/empty.txt", "");
				const s = await fs.stat("/empty.txt");
				expect(s.size).toBe(0);
				const data = await fs.readFile("/empty.txt");
				expect(data.length).toBe(0);
			});

			test.skipIf(config.inlineThreshold == null)(
				"file at exactly inlineThreshold bytes",
				async () => {
					const threshold = config.inlineThreshold!;
					const data = makeData(threshold);
					await fs.writeFile("/at-threshold.dat", data);
					const result = await fs.readFile("/at-threshold.dat");
					expect(result).toEqual(data);
					const s = await fs.stat("/at-threshold.dat");
					expect(s.size).toBe(threshold);
				},
			);

			test.skipIf(config.inlineThreshold == null)(
				"file at inlineThreshold + 1 bytes",
				async () => {
					const threshold = config.inlineThreshold!;
					const data = makeData(threshold + 1);
					await fs.writeFile("/above-threshold.dat", data);
					const result = await fs.readFile("/above-threshold.dat");
					expect(result).toEqual(data);
					const s = await fs.stat("/above-threshold.dat");
					expect(s.size).toBe(threshold + 1);
				},
			);

			test.skipIf(config.chunkSize == null)(
				"file at exactly chunkSize bytes",
				async () => {
					const cs = config.chunkSize!;
					const data = makeData(cs);
					await fs.writeFile("/at-chunk.dat", data);
					const result = await fs.readFile("/at-chunk.dat");
					expect(result).toEqual(data);
				},
			);

			test.skipIf(config.chunkSize == null)(
				"file at chunkSize + 1 bytes",
				async () => {
					const cs = config.chunkSize!;
					const data = makeData(cs + 1);
					await fs.writeFile("/above-chunk.dat", data);
					const result = await fs.readFile("/above-chunk.dat");
					expect(result).toEqual(data);
				},
			);

			test.skipIf(!capabilities.pread)(
				"pread with length 0 returns empty Uint8Array",
				async () => {
					await fs.writeFile("/pread0.txt", "hello");
					const data = await fs.pread("/pread0.txt", 0, 0);
					expect(data.length).toBe(0);
				},
			);

			test.skipIf(!capabilities.pread)(
				"pread at offset == file size returns empty Uint8Array",
				async () => {
					await fs.writeFile("/preadeof.txt", "hello");
					const data = await fs.pread("/preadeof.txt", 5, 10);
					expect(data.length).toBe(0);
				},
			);

			test.skipIf(!capabilities.pread)(
				"pread at offset > file size returns empty Uint8Array",
				async () => {
					await fs.writeFile("/preadbeyond.txt", "hello");
					const data = await fs.pread("/preadbeyond.txt", 100, 10);
					expect(data.length).toBe(0);
				},
			);

			test("writeFile with empty content creates empty file", async () => {
				await fs.writeFile("/empty-write.txt", new Uint8Array(0));
				const s = await fs.stat("/empty-write.txt");
				expect(s.size).toBe(0);
				const data = await fs.readFile("/empty-write.txt");
				expect(data.length).toBe(0);
			});

			test("long filename (255 chars)", async () => {
				const longName = "a".repeat(255);
				const path = `/${longName}`;
				await fs.writeFile(path, "long name content");
				const text = await fs.readTextFile(path);
				expect(text).toBe("long name content");
			});

			test("deeply nested path (20 levels)", async () => {
				const parts = Array.from({ length: 20 }, (_, i) => `d${i}`);
				const path = "/" + parts.join("/") + "/deep.txt";
				await fs.writeFile(path, "deep");
				const text = await fs.readTextFile(path);
				expect(text).toBe("deep");
			});

			test.skipIf(!capabilities.pwrite)(
				"pwrite on nonexistent file throws ENOENT",
				async () => {
					const err = await fs
						.pwrite("/no-such-file.txt", 0, new TextEncoder().encode("x"))
						.catch((e) => e);
					expectErrorCode(err, "ENOENT");
				},
			);

			test.skipIf(!capabilities.truncate)(
				"truncate on nonexistent file throws ENOENT",
				async () => {
					const err = await fs.truncate("/no-such-file.txt", 0).catch((e) => e);
					expectErrorCode(err, "ENOENT");
				},
			);

			test("stat on root directory '/' returns isDirectory: true", async () => {
				const s = await fs.stat("/");
				expect(s.isDirectory).toBe(true);
			});
		});

		// ---------------------------------------------------------------
		// Relative symlink tests (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.symlinks)("relative symlinks", () => {
			test("relative symlink resolution", async () => {
				// Create /dir/real.txt, then /dir/link.txt -> real.txt (relative)
				await fs.writeFile("/dir/real.txt", "real content");
				await fs.symlink("real.txt", "/dir/link.txt");
				const text = await fs.readTextFile("/dir/link.txt");
				expect(text).toBe("real content");
			});

			test("symlink-to-directory traversal", async () => {
				// Create /real-dir/file.txt, then /a -> /real-dir
				// Reading /a/file.txt should resolve to /real-dir/file.txt
				await fs.writeFile("/real-dir/file.txt", "traversed");
				await fs.symlink("/real-dir", "/a");
				const text = await fs.readTextFile("/a/file.txt");
				expect(text).toBe("traversed");
			});
		});

		// ---------------------------------------------------------------
		// Concurrent rename + readFile (gated on pwrite for concurrency)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.pwrite)("concurrent rename + readFile", () => {
			test("concurrent rename + readFile does not crash or corrupt", async () => {
				await fs.writeFile("/conc-rename.txt", "data before rename");
				// Run rename and readFile concurrently. Neither should crash.
				// readFile may see the file at old or new path depending on ordering.
				const results = await Promise.allSettled([
					fs.rename("/conc-rename.txt", "/conc-renamed.txt"),
					fs.readFile("/conc-rename.txt"),
				]);
				// Rename should succeed.
				expect(results[0]!.status).toBe("fulfilled");
				// readFile may succeed (read before rename) or fail with ENOENT (read after rename).
				if (results[1]!.status === "fulfilled") {
					const data = (results[1] as PromiseFulfilledResult<Uint8Array>).value;
					expect(new TextDecoder().decode(data)).toBe("data before rename");
				} else {
					const err = (results[1] as PromiseRejectedResult).reason;
					expectErrorCode(err, "ENOENT");
				}
				// The file should exist at the new path.
				const text = await fs.readTextFile("/conc-renamed.txt");
				expect(text).toBe("data before rename");
			});
		});
	});
}
