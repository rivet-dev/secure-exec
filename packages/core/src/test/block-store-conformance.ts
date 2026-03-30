/**
 * Shared FsBlockStore conformance test suite.
 *
 * Every FsBlockStore implementation must pass the tests in this suite.
 * Optional test groups are gated on capability flags declared in the config.
 *
 * Usage:
 *
 * ```typescript
 * import { defineBlockStoreTests } from "@secure-exec/core/test/block-store-conformance";
 *
 * defineBlockStoreTests({
 *   name: "InMemoryBlockStore",
 *   createStore: () => new InMemoryBlockStore(),
 *   capabilities: { copy: true },
 * });
 * ```
 */

import type { FsBlockStore } from "../vfs/types.js";
import { describe, beforeEach, afterEach, expect, test } from "vitest";

// ---------------------------------------------------------------------------
// Public config types
// ---------------------------------------------------------------------------

export interface BlockStoreConformanceCapabilities {
	/** Whether the store implements the optional copy() method. */
	copy: boolean;
}

export interface BlockStoreConformanceConfig {
	/** Human-readable name shown in the describe block. */
	name: string;
	/** Create a fresh block store instance for each test. */
	createStore: () => Promise<FsBlockStore> | FsBlockStore;
	/** Optional teardown called after each test. */
	cleanup?: () => Promise<void>;
	/** Which optional capabilities the store supports. */
	capabilities: BlockStoreConformanceCapabilities;
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

export function defineBlockStoreTests(
	config: BlockStoreConformanceConfig,
): void {
	const { name, capabilities } = config;

	describe(name, () => {
		let store: FsBlockStore;

		beforeEach(async () => {
			store = await config.createStore();
		});

		afterEach(async () => {
			if (config.cleanup) await config.cleanup();
		});

		// ---------------------------------------------------------------
		// write + read round-trip
		// ---------------------------------------------------------------

		describe("write + read", () => {
			test("round-trip small data", async () => {
				const data = makeData(64);
				await store.write("key1", data);
				const result = await store.read("key1");
				expect(result).toEqual(data);
			});

			test("round-trip large data (>4MB)", async () => {
				const data = makeData(4 * 1024 * 1024 + 1, 0xab);
				await store.write("large", data);
				const result = await store.read("large");
				expect(result).toEqual(data);
			});

			test("write overwrites existing key", async () => {
				const data1 = makeData(32, 0x11);
				const data2 = makeData(64, 0x22);
				await store.write("key", data1);
				await store.write("key", data2);
				const result = await store.read("key");
				expect(result).toEqual(data2);
			});
		});

		// ---------------------------------------------------------------
		// readRange
		// ---------------------------------------------------------------

		describe("readRange", () => {
			test("partial read from start", async () => {
				const data = makeData(100);
				await store.write("key", data);
				const result = await store.readRange("key", 0, 10);
				expect(result).toEqual(data.slice(0, 10));
			});

			test("partial read from middle", async () => {
				const data = makeData(100);
				await store.write("key", data);
				const result = await store.readRange("key", 20, 30);
				expect(result).toEqual(data.slice(20, 50));
			});

			test("partial read at end", async () => {
				const data = makeData(100);
				await store.write("key", data);
				const result = await store.readRange("key", 90, 10);
				expect(result).toEqual(data.slice(90, 100));
			});

			test("readRange beyond block size returns short read", async () => {
				const data = makeData(50);
				await store.write("key", data);
				const result = await store.readRange("key", 40, 100);
				expect(result).toEqual(data.slice(40, 50));
				expect(result.length).toBe(10);
			});

			test("readRange nonexistent key throws ENOENT", async () => {
				try {
					await store.readRange("missing", 0, 10);
					expect.fail("should have thrown");
				} catch (err) {
					expectErrorCode(err, "ENOENT");
				}
			});

			test("readRange with offset exactly at block size returns empty Uint8Array", async () => {
				const data = makeData(50);
				await store.write("key", data);
				const result = await store.readRange("key", 50, 10);
				expect(result.length).toBe(0);
			});

			test("readRange with offset=0, length=0 returns empty Uint8Array", async () => {
				const data = makeData(50);
				await store.write("key", data);
				const result = await store.readRange("key", 0, 0);
				expect(result.length).toBe(0);
			});
		});

		// ---------------------------------------------------------------
		// read errors
		// ---------------------------------------------------------------

		describe("read errors", () => {
			test("read nonexistent key throws ENOENT", async () => {
				try {
					await store.read("nonexistent");
					expect.fail("should have thrown");
				} catch (err) {
					expectErrorCode(err, "ENOENT");
				}
			});
		});

		// ---------------------------------------------------------------
		// delete
		// ---------------------------------------------------------------

		describe("delete", () => {
			test("delete then read throws ENOENT", async () => {
				const data = makeData(16);
				await store.write("key", data);
				await store.delete("key");
				try {
					await store.read("key");
					expect.fail("should have thrown");
				} catch (err) {
					expectErrorCode(err, "ENOENT");
				}
			});

			test("delete nonexistent key is no-op", async () => {
				// Should not throw.
				await store.delete("nonexistent");
			});
		});

		// ---------------------------------------------------------------
		// deleteMany
		// ---------------------------------------------------------------

		describe("deleteMany", () => {
			test("deleteMany removes multiple keys", async () => {
				await store.write("a", makeData(8, 0x01));
				await store.write("b", makeData(8, 0x02));
				await store.write("c", makeData(8, 0x03));
				await store.deleteMany(["a", "b"]);

				// a and b should be gone.
				try {
					await store.read("a");
					expect.fail("should have thrown");
				} catch (err) {
					expectErrorCode(err, "ENOENT");
				}
				try {
					await store.read("b");
					expect.fail("should have thrown");
				} catch (err) {
					expectErrorCode(err, "ENOENT");
				}

				// c should still exist.
				const result = await store.read("c");
				expect(result).toEqual(makeData(8, 0x03));
			});

			test("deleteMany with nonexistent keys is no-op", async () => {
				await store.write("x", makeData(4));
				// Should not throw even if some keys don't exist.
				await store.deleteMany(["x", "nonexistent1", "nonexistent2"]);
				try {
					await store.read("x");
					expect.fail("should have thrown");
				} catch (err) {
					expectErrorCode(err, "ENOENT");
				}
			});

			test("deleteMany empty array is no-op", async () => {
				// Should not throw.
				await store.deleteMany([]);
			});
		});

		// ---------------------------------------------------------------
		// copy (gated)
		// ---------------------------------------------------------------

		describe.skipIf(!capabilities.copy)("copy", () => {
			test("copy round-trip", async () => {
				const data = makeData(128, 0xcc);
				await store.write("src", data);
				await store.copy!("src", "dst");
				const result = await store.read("dst");
				expect(result).toEqual(data);
			});

			test("copy creates independent data", async () => {
				const data = makeData(64, 0xdd);
				await store.write("src", data);
				await store.copy!("src", "dst");

				// Overwrite source.
				const newData = makeData(32, 0xee);
				await store.write("src", newData);

				// Destination should still have original data.
				const result = await store.read("dst");
				expect(result).toEqual(data);
			});

			test("copy nonexistent source throws ENOENT", async () => {
				try {
					await store.copy!("missing", "dst");
					expect.fail("should have thrown");
				} catch (err) {
					expectErrorCode(err, "ENOENT");
				}
			});
		});
	});
}
