/**
 * ChunkedVFS integration tests.
 *
 * These verify internal behavior not visible through the VFS conformance suite:
 * - Tiered storage: inline vs chunked transitions, threshold behavior
 * - Chunk math: correct block splitting, spanning, sparse files
 * - Concurrency: per-inode mutex serialization
 * - Write buffering: dirty chunk management, fsync flushing, coalescing
 *
 * All tests use InMemoryMetadataStore + InMemoryBlockStore with spies
 * to observe internal block store calls.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createChunkedVfs } from "../../src/vfs/chunked-vfs.js";
import type { ChunkedVfsVersioning } from "../../src/vfs/chunked-vfs.js";
import { InMemoryMetadataStore } from "../../src/vfs/memory-metadata.js";
import { InMemoryBlockStore } from "../../src/vfs/memory-block-store.js";
import { SqliteMetadataStore } from "../../src/vfs/sqlite-metadata.js";
import type { FsBlockStore } from "../../src/vfs/types.js";
import type { VirtualFileSystem } from "../../src/kernel/vfs.js";

// Small thresholds for fast edge case testing.
const INLINE_THRESHOLD = 256;
const CHUNK_SIZE = 1024;

function makeData(size: number, seed = 0): Uint8Array {
	const data = new Uint8Array(size);
	for (let i = 0; i < size; i++) {
		data[i] = (i + seed) & 0xff;
	}
	return data;
}

/**
 * Create a spied block store wrapping InMemoryBlockStore.
 * Returns both the store and per-method spies.
 */
function createSpiedBlockStore() {
	const real = new InMemoryBlockStore();
	const writeSpy = vi.fn(real.write.bind(real));
	const readSpy = vi.fn(real.read.bind(real));
	const readRangeSpy = vi.fn(real.readRange.bind(real));
	const deleteSpy = vi.fn(real.delete.bind(real));
	const deleteManySpy = vi.fn(real.deleteMany.bind(real));
	const copySpy = vi.fn(real.copy.bind(real));

	const store: FsBlockStore & { copy: FsBlockStore["copy"] } = {
		write: writeSpy,
		read: readSpy,
		readRange: readRangeSpy,
		delete: deleteSpy,
		deleteMany: deleteManySpy,
		copy: copySpy,
	};

	return {
		store,
		spies: {
			write: writeSpy,
			read: readSpy,
			readRange: readRangeSpy,
			delete: deleteSpy,
			deleteMany: deleteManySpy,
			copy: copySpy,
		},
	};
}

// ============================================================================
// Tiered Storage Tests
// ============================================================================

describe("ChunkedVFS internals: tiered storage", () => {
	let metadata: InMemoryMetadataStore;
	let blockStore: ReturnType<typeof createSpiedBlockStore>;
	let fs: VirtualFileSystem;

	beforeEach(() => {
		metadata = new InMemoryMetadataStore();
		blockStore = createSpiedBlockStore();
		fs = createChunkedVfs({
			metadata,
			blocks: blockStore.store,
			inlineThreshold: INLINE_THRESHOLD,
			chunkSize: CHUNK_SIZE,
		});
	});

	test("small file stays inline (no block store writes)", async () => {
		const data = makeData(100); // well below 256-byte threshold
		await fs.writeFile("/small.txt", data);

		expect(blockStore.spies.write).not.toHaveBeenCalled();

		const result = await fs.readFile("/small.txt");
		expect(result).toEqual(data);
	});

	test("file at exact inlineThreshold stays inline", async () => {
		const data = makeData(INLINE_THRESHOLD);
		await fs.writeFile("/exact.txt", data);

		expect(blockStore.spies.write).not.toHaveBeenCalled();

		const result = await fs.readFile("/exact.txt");
		expect(result).toEqual(data);
	});

	test("file at inlineThreshold+1 stored as chunks", async () => {
		const data = makeData(INLINE_THRESHOLD + 1);
		await fs.writeFile("/over.txt", data);

		expect(blockStore.spies.write).toHaveBeenCalled();

		const result = await fs.readFile("/over.txt");
		expect(result).toEqual(data);
	});

	test("file crossing inlineThreshold via writeFile promotes to chunked", async () => {
		// Start with inline file.
		const smallData = makeData(100);
		await fs.writeFile("/grow.txt", smallData);
		expect(blockStore.spies.write).not.toHaveBeenCalled();

		// Overwrite with larger data that crosses the threshold.
		const largeData = makeData(INLINE_THRESHOLD + 100);
		await fs.writeFile("/grow.txt", largeData);
		expect(blockStore.spies.write).toHaveBeenCalled();

		const result = await fs.readFile("/grow.txt");
		expect(result).toEqual(largeData);
	});

	test("pwrite pushing inline past threshold promotes to chunked", async () => {
		const smallData = makeData(100);
		await fs.writeFile("/promote.txt", smallData);
		expect(blockStore.spies.write).not.toHaveBeenCalled();

		// pwrite that pushes total size past the inline threshold.
		const extra = makeData(200, 42);
		await fs.pwrite("/promote.txt", 200, extra);
		// Now size = 400 > 256 threshold, so should have promoted.
		expect(blockStore.spies.write).toHaveBeenCalled();

		const stat = await fs.stat("/promote.txt");
		expect(stat.size).toBe(400);
	});

	test("truncate below threshold demotes chunked to inline", async () => {
		// Create a chunked file.
		const data = makeData(INLINE_THRESHOLD + 100);
		await fs.writeFile("/demote.txt", data);
		expect(blockStore.spies.write).toHaveBeenCalled();
		blockStore.spies.write.mockClear();

		// Truncate below threshold.
		await fs.truncate("/demote.txt", 100);

		const stat = await fs.stat("/demote.txt");
		expect(stat.size).toBe(100);

		// Read should work from inline storage now. If it were still
		// chunked, the block store would have been read.
		blockStore.spies.read.mockClear();
		blockStore.spies.readRange.mockClear();
		const result = await fs.readFile("/demote.txt");
		expect(result.length).toBe(100);
		// The data was demoted to inline, so no block reads.
		expect(blockStore.spies.read).not.toHaveBeenCalled();
		expect(blockStore.spies.readRange).not.toHaveBeenCalled();
	});

	test("truncate above threshold promotes inline to chunked", async () => {
		const data = makeData(100);
		await fs.writeFile("/grow-trunc.txt", data);
		expect(blockStore.spies.write).not.toHaveBeenCalled();

		// Grow via truncate past threshold.
		await fs.truncate("/grow-trunc.txt", INLINE_THRESHOLD + 100);

		const stat = await fs.stat("/grow-trunc.txt");
		expect(stat.size).toBe(INLINE_THRESHOLD + 100);
		// Promotion writes the existing inline content to the block store.
		expect(blockStore.spies.write).toHaveBeenCalled();
	});
});

// ============================================================================
// Chunk Math Tests
// ============================================================================

describe("ChunkedVFS internals: chunk math", () => {
	let metadata: InMemoryMetadataStore;
	let blockStore: ReturnType<typeof createSpiedBlockStore>;
	let fs: VirtualFileSystem;

	beforeEach(() => {
		metadata = new InMemoryMetadataStore();
		blockStore = createSpiedBlockStore();
		fs = createChunkedVfs({
			metadata,
			blocks: blockStore.store,
			inlineThreshold: INLINE_THRESHOLD,
			chunkSize: CHUNK_SIZE,
		});
	});

	test("pwrite to middle of a chunk touches one chunk", async () => {
		// Create a file larger than threshold so it's chunked.
		const data = makeData(CHUNK_SIZE);
		await fs.writeFile("/one-chunk.txt", data);
		blockStore.spies.write.mockClear();

		// pwrite 10 bytes in the middle of chunk 0.
		const patch = makeData(10, 99);
		await fs.pwrite("/one-chunk.txt", 100, patch);

		// Should only write chunk 0 (the one we modified).
		expect(blockStore.spies.write).toHaveBeenCalledTimes(1);
		const writtenKey = blockStore.spies.write.mock.calls[0]![0] as string;
		// Key format: ino/chunkIndex. Chunk index should be 0.
		expect(writtenKey).toMatch(/\/0$/);
	});

	test("pwrite spanning two chunks modifies both", async () => {
		// Create a file with 2 full chunks.
		const data = makeData(CHUNK_SIZE * 2);
		await fs.writeFile("/two-chunks.txt", data);
		blockStore.spies.write.mockClear();

		// pwrite spanning the chunk boundary (last 10 bytes of chunk 0, first 10 bytes of chunk 1).
		const patch = makeData(20, 77);
		await fs.pwrite("/two-chunks.txt", CHUNK_SIZE - 10, patch);

		// Should write both chunk 0 and chunk 1.
		expect(blockStore.spies.write).toHaveBeenCalledTimes(2);
		const keys = blockStore.spies.write.mock.calls.map((c) => c[0] as string);
		expect(keys.some((k) => k.endsWith("/0"))).toBe(true);
		expect(keys.some((k) => k.endsWith("/1"))).toBe(true);
	});

	test("pwrite spanning three chunks", async () => {
		// Create a file with 3 full chunks.
		const data = makeData(CHUNK_SIZE * 3);
		await fs.writeFile("/three-chunks.txt", data);
		blockStore.spies.write.mockClear();

		// pwrite that spans from chunk 0 through chunk 2.
		const patch = makeData(CHUNK_SIZE + 20, 55);
		await fs.pwrite("/three-chunks.txt", CHUNK_SIZE - 10, patch);

		// Should write chunks 0, 1, and 2.
		expect(blockStore.spies.write).toHaveBeenCalledTimes(3);
		const keys = blockStore.spies.write.mock.calls.map((c) => c[0] as string);
		expect(keys.some((k) => k.endsWith("/0"))).toBe(true);
		expect(keys.some((k) => k.endsWith("/1"))).toBe(true);
		expect(keys.some((k) => k.endsWith("/2"))).toBe(true);
	});

	test("writeFile large file creates correct chunk count", async () => {
		const data = makeData(CHUNK_SIZE * 3 + 500);
		await fs.writeFile("/multi.txt", data);

		// 3 full chunks + 1 partial chunk = 4 total block writes.
		expect(blockStore.spies.write).toHaveBeenCalledTimes(4);
	});

	test("readFile concatenates all chunks correctly", async () => {
		const data = makeData(CHUNK_SIZE * 2 + 100);
		await fs.writeFile("/concat.txt", data);

		const result = await fs.readFile("/concat.txt");
		expect(result).toEqual(data);
	});

	test("sparse file: pwrite at high offset, zeros in between", async () => {
		// Create a file just above threshold so it's chunked.
		const initial = makeData(INLINE_THRESHOLD + 1);
		await fs.writeFile("/sparse.txt", initial);

		// pwrite way past the end.
		const patch = makeData(10, 42);
		const highOffset = CHUNK_SIZE * 5;
		await fs.pwrite("/sparse.txt", highOffset, patch);

		const stat = await fs.stat("/sparse.txt");
		expect(stat.size).toBe(highOffset + 10);

		// Read the sparse region (should be zeros).
		const hole = await fs.pread("/sparse.txt", CHUNK_SIZE * 2, 100);
		expect(hole).toEqual(new Uint8Array(100));

		// Read the written data.
		const written = await fs.pread("/sparse.txt", highOffset, 10);
		expect(written).toEqual(patch);
	});

	test("last chunk may be smaller than chunkSize", async () => {
		const data = makeData(CHUNK_SIZE + 100);
		await fs.writeFile("/partial-last.txt", data);

		// Verify the data round-trips correctly (the last chunk is 100 bytes, not 1024).
		const result = await fs.readFile("/partial-last.txt");
		expect(result).toEqual(data);
		expect(result.length).toBe(CHUNK_SIZE + 100);
	});
});

// ============================================================================
// Concurrency Tests
// ============================================================================

describe("ChunkedVFS internals: concurrency", () => {
	let metadata: InMemoryMetadataStore;
	let blockStore: ReturnType<typeof createSpiedBlockStore>;
	let fs: VirtualFileSystem;

	beforeEach(() => {
		metadata = new InMemoryMetadataStore();
		blockStore = createSpiedBlockStore();
		fs = createChunkedVfs({
			metadata,
			blocks: blockStore.store,
			inlineThreshold: INLINE_THRESHOLD,
			chunkSize: CHUNK_SIZE,
		});
	});

	test("two concurrent pwrites to same inode are serialized (per-inode mutex)", async () => {
		// Create a chunked file.
		const data = makeData(CHUNK_SIZE);
		await fs.writeFile("/concurrent.txt", data);

		const order: string[] = [];
		const originalWrite = blockStore.store.write;
		blockStore.store.write = async (key: string, d: Uint8Array) => {
			order.push(`start:${key}`);
			await originalWrite(key, d);
			order.push(`end:${key}`);
		};

		// Launch two concurrent pwrites to the same inode.
		const p1 = fs.pwrite("/concurrent.txt", 0, makeData(10, 1));
		const p2 = fs.pwrite("/concurrent.txt", 50, makeData(10, 2));

		await Promise.all([p1, p2]);

		// Due to the mutex, one should fully complete before the other starts.
		// Check that we don't have interleaved start/end pairs.
		const startIndices = order
			.map((e, i) => (e.startsWith("start:") ? i : -1))
			.filter((i) => i >= 0);
		const endIndices = order
			.map((e, i) => (e.startsWith("end:") ? i : -1))
			.filter((i) => i >= 0);

		// The first pwrite's end should come before the second pwrite's start.
		if (startIndices.length >= 2 && endIndices.length >= 1) {
			expect(endIndices[0]!).toBeLessThan(startIndices[1]!);
		}
	});

	test("pwrite during ongoing pwrite waits", async () => {
		const data = makeData(CHUNK_SIZE);
		await fs.writeFile("/wait.txt", data);

		let firstWriteResolved = false;

		const originalWrite = blockStore.store.write;
		let resolveDelay: (() => void) | undefined;
		let callCount = 0;

		blockStore.store.write = async (key: string, d: Uint8Array) => {
			callCount++;
			if (callCount === 1) {
				// First pwrite's block write: delay it.
				await new Promise<void>((resolve) => {
					resolveDelay = resolve;
				});
			}
			await originalWrite(key, d);
			if (callCount === 1) {
				firstWriteResolved = true;
			}
		};

		const p1 = fs.pwrite("/wait.txt", 0, makeData(10, 1));
		// Give p1 time to acquire mutex and start writing.
		await new Promise((r) => setTimeout(r, 10));

		let secondStarted = false;
		const p2 = fs.pwrite("/wait.txt", 100, makeData(10, 2)).then(() => {
			secondStarted = true;
		});

		// p2 should be waiting because p1 holds the mutex.
		await new Promise((r) => setTimeout(r, 10));
		expect(secondStarted).toBe(false);

		// Release the first write.
		resolveDelay!();
		await Promise.all([p1, p2]);
		expect(firstWriteResolved).toBe(true);
		expect(secondStarted).toBe(true);
	});

	test("inline-to-chunked promotion under concurrent writes: no double promotion", async () => {
		// Create a small inline file.
		const data = makeData(100);
		await fs.writeFile("/promote-race.txt", data);

		// Two concurrent pwrites, both of which push past the threshold.
		const p1 = fs.pwrite("/promote-race.txt", 200, makeData(100, 1)); // total 300 > 256
		const p2 = fs.pwrite("/promote-race.txt", 300, makeData(100, 2)); // total 400 > 256

		await Promise.all([p1, p2]);

		// File should be consistent and readable.
		const stat = await fs.stat("/promote-race.txt");
		expect(stat.size).toBe(400);

		const result = await fs.readFile("/promote-race.txt");
		expect(result.length).toBe(400);
	});
});

// ============================================================================
// Write Buffering Tests
// ============================================================================

describe("ChunkedVFS internals: write buffering", () => {
	let metadata: InMemoryMetadataStore;
	let blockStore: ReturnType<typeof createSpiedBlockStore>;
	let fs: VirtualFileSystem;

	beforeEach(() => {
		metadata = new InMemoryMetadataStore();
		blockStore = createSpiedBlockStore();
		fs = createChunkedVfs({
			metadata,
			blocks: blockStore.store,
			inlineThreshold: INLINE_THRESHOLD,
			chunkSize: CHUNK_SIZE,
			writeBuffering: true,
			autoFlushIntervalMs: 60_000, // Long interval to prevent auto-flush from interfering.
		});
	});

	test("pwrite buffers dirty chunks (no immediate block store write)", async () => {
		// Create a chunked file to get past inline threshold.
		const data = makeData(INLINE_THRESHOLD + 100);
		await fs.writeFile("/buffered.txt", data);
		blockStore.spies.write.mockClear();

		// pwrite should buffer, not write to block store.
		await fs.pwrite("/buffered.txt", 0, makeData(10, 42));
		expect(blockStore.spies.write).not.toHaveBeenCalled();
	});

	test("pread sees buffered data", async () => {
		const data = makeData(INLINE_THRESHOLD + 100);
		await fs.writeFile("/buf-read.txt", data);

		const patch = makeData(10, 99);
		await fs.pwrite("/buf-read.txt", 50, patch);

		const result = await fs.pread("/buf-read.txt", 50, 10);
		expect(result).toEqual(patch);
	});

	test("readFile sees buffered data", async () => {
		const data = makeData(INLINE_THRESHOLD + 100);
		await fs.writeFile("/buf-readfile.txt", data);

		const patch = makeData(10, 88);
		await fs.pwrite("/buf-readfile.txt", 50, patch);

		const result = await fs.readFile("/buf-readfile.txt");
		// The patched region should have the new data.
		expect(result.slice(50, 60)).toEqual(patch);
	});

	test("stat.size reflects buffered writes", async () => {
		const data = makeData(INLINE_THRESHOLD + 100);
		await fs.writeFile("/buf-stat.txt", data);
		const originalSize = INLINE_THRESHOLD + 100;

		// Extend the file via pwrite beyond original size.
		const patch = makeData(50, 77);
		await fs.pwrite("/buf-stat.txt", originalSize + 200, patch);

		const stat = await fs.stat("/buf-stat.txt");
		expect(stat.size).toBe(originalSize + 200 + 50);
	});

	test("fsync flushes dirty chunks to block store", async () => {
		const data = makeData(INLINE_THRESHOLD + 100);
		await fs.writeFile("/buf-fsync.txt", data);
		blockStore.spies.write.mockClear();

		// pwrite (buffered).
		await fs.pwrite("/buf-fsync.txt", 0, makeData(10, 42));
		expect(blockStore.spies.write).not.toHaveBeenCalled();

		// fsync should flush.
		await fs.fsync!("/buf-fsync.txt");
		expect(blockStore.spies.write).toHaveBeenCalled();
	});

	test("after fsync, block store has the correct data", async () => {
		const data = makeData(INLINE_THRESHOLD + 100);
		await fs.writeFile("/buf-verify.txt", data);

		const patch = makeData(10, 42);
		await fs.pwrite("/buf-verify.txt", 0, patch);
		await fs.fsync!("/buf-verify.txt");

		// Create a new non-buffered VFS with the same stores to verify block store state.
		const verifyFs = createChunkedVfs({
			metadata,
			blocks: blockStore.store,
			inlineThreshold: INLINE_THRESHOLD,
			chunkSize: CHUNK_SIZE,
			writeBuffering: false,
		});
		const result = await verifyFs.readFile("/buf-verify.txt");
		expect(result.slice(0, 10)).toEqual(patch);
	});

	test("multiple pwrites to same chunk coalesce in buffer", async () => {
		const data = makeData(INLINE_THRESHOLD + 100);
		await fs.writeFile("/coalesce.txt", data);
		blockStore.spies.write.mockClear();

		// Two pwrites to the same chunk.
		await fs.pwrite("/coalesce.txt", 0, makeData(5, 1));
		await fs.pwrite("/coalesce.txt", 10, makeData(5, 2));

		// No block store writes yet.
		expect(blockStore.spies.write).not.toHaveBeenCalled();

		// fsync: should produce only one write for the single dirty chunk.
		await fs.fsync!("/coalesce.txt");

		// Only 1 block write (chunk 0 was dirty, flushed once).
		expect(blockStore.spies.write).toHaveBeenCalledTimes(1);

		// Verify both writes are present.
		const result = await fs.readFile("/coalesce.txt");
		expect(result.slice(0, 5)).toEqual(makeData(5, 1));
		expect(result.slice(10, 15)).toEqual(makeData(5, 2));
	});

	test("auto-flush fires after interval", async () => {
		// Create a VFS with a very short auto-flush interval.
		const shortFlushFs = createChunkedVfs({
			metadata: new InMemoryMetadataStore(),
			blocks: blockStore.store,
			inlineThreshold: INLINE_THRESHOLD,
			chunkSize: CHUNK_SIZE,
			writeBuffering: true,
			autoFlushIntervalMs: 50,
		});

		const data = makeData(INLINE_THRESHOLD + 100);
		await shortFlushFs.writeFile("/autoflush.txt", data);
		blockStore.spies.write.mockClear();

		await shortFlushFs.pwrite("/autoflush.txt", 0, makeData(10, 42));
		expect(blockStore.spies.write).not.toHaveBeenCalled();

		// Wait for auto-flush.
		await new Promise((r) => setTimeout(r, 200));

		expect(blockStore.spies.write).toHaveBeenCalled();
	});

	test("fsync on stale/nonexistent path: silent no-op", async () => {
		// fsync on a path that doesn't exist should not throw.
		await expect(fs.fsync!("/does-not-exist.txt")).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Versioning tests
// ---------------------------------------------------------------------------

describe("ChunkedVFS versioning", () => {
	let metadataStore: SqliteMetadataStore;
	let blockStore: ReturnType<typeof createSpiedBlockStore>;
	let fs: VirtualFileSystem & { versioning: ChunkedVfsVersioning };

	beforeEach(() => {
		metadataStore = new SqliteMetadataStore({ dbPath: ":memory:", versioning: true });
		blockStore = createSpiedBlockStore();
		fs = createChunkedVfs({
			metadata: metadataStore,
			blocks: blockStore.store,
			chunkSize: CHUNK_SIZE,
			inlineThreshold: INLINE_THRESHOLD,
			versioning: true,
		}) as VirtualFileSystem & { versioning: ChunkedVfsVersioning };
	});

	test("each pwrite creates a new block key (old key preserved)", async () => {
		// Write a chunked file.
		const data = makeData(CHUNK_SIZE);
		await fs.writeFile("/big.bin", data);

		// Track the initial block key.
		const initialWriteArgs = blockStore.spies.write.mock.calls.map((c) => c[0] as string);
		expect(initialWriteArgs.length).toBeGreaterThan(0);
		const initialKey = initialWriteArgs[initialWriteArgs.length - 1]!;

		blockStore.spies.write.mockClear();

		// Pwrite to the same chunk.
		await fs.pwrite("/big.bin", 0, new Uint8Array([99, 98, 97]));

		// New pwrite should create a different key (versioned key includes randomId).
		const newWriteArgs = blockStore.spies.write.mock.calls.map((c) => c[0] as string);
		expect(newWriteArgs.length).toBeGreaterThan(0);
		const newKey = newWriteArgs[newWriteArgs.length - 1]!;
		expect(newKey).not.toBe(initialKey);

		// Old block should NOT be deleted (versioning preserves it).
		expect(blockStore.spies.deleteMany).not.toHaveBeenCalled();
		expect(blockStore.spies.delete).not.toHaveBeenCalled();
	});

	test("createVersion snapshots current chunk map", async () => {
		const data = makeData(CHUNK_SIZE + 100);
		await fs.writeFile("/file.bin", data);

		const v1 = await fs.versioning.createVersion("/file.bin");
		expect(v1).toBe(1);

		const versions = await fs.versioning.listVersions("/file.bin");
		expect(versions.length).toBe(1);
		expect(versions[0]!.version).toBe(1);
		expect(versions[0]!.size).toBe(CHUNK_SIZE + 100);
	});

	test("after write, old version block keys still exist", async () => {
		const data = makeData(CHUNK_SIZE);
		await fs.writeFile("/file.bin", data);
		await fs.versioning.createVersion("/file.bin");

		// Write new data to overwrite.
		const newData = makeData(CHUNK_SIZE, 42);
		await fs.writeFile("/file.bin", newData);

		// Old blocks should still be readable (not deleted).
		// Verify by checking that deleteMany was not called.
		const deleteManyCalls = blockStore.spies.deleteMany.mock.calls;
		// With versioning, deleteMany should NOT have been called for the old blocks.
		for (const call of deleteManyCalls) {
			const keys = call[0] as string[];
			expect(keys.length).toBe(0);
		}
	});

	test("restoreVersion: pread returns old data", async () => {
		const v1Data = makeData(INLINE_THRESHOLD + 100);
		await fs.writeFile("/file.bin", v1Data);
		await fs.versioning.createVersion("/file.bin");

		// Write new data.
		const v2Data = makeData(INLINE_THRESHOLD + 100, 42);
		await fs.writeFile("/file.bin", v2Data);

		// Read back to verify it's v2.
		const currentData = await fs.readFile("/file.bin");
		expect(currentData).toEqual(v2Data);

		// Restore to v1.
		await fs.versioning.restoreVersion("/file.bin", 1);

		// Pread should return v1 data.
		const restored = await fs.readFile("/file.bin");
		expect(restored).toEqual(v1Data);
	});

	test("pruneVersions with count policy: keeps N newest", async () => {
		await fs.writeFile("/file.txt", "v1");
		await fs.versioning.createVersion("/file.txt");
		await fs.writeFile("/file.txt", "v2");
		await fs.versioning.createVersion("/file.txt");
		await fs.writeFile("/file.txt", "v3");
		await fs.versioning.createVersion("/file.txt");
		await fs.writeFile("/file.txt", "v4");
		await fs.versioning.createVersion("/file.txt");

		// Keep only 2 newest.
		const pruned = await fs.versioning.pruneVersions("/file.txt", { type: "count", keep: 2 });
		expect(pruned).toBe(2);

		const remaining = await fs.versioning.listVersions("/file.txt");
		expect(remaining.length).toBe(2);
		expect(remaining[0]!.version).toBe(4);
		expect(remaining[1]!.version).toBe(3);
	});

	test("pruneVersions with age policy: keeps recent, deletes old", async () => {
		await fs.writeFile("/file.txt", "v1");
		await fs.versioning.createVersion("/file.txt");

		// Keep versions newer than 1 hour (our version was just created, so it's kept).
		const prunedNone = await fs.versioning.pruneVersions("/file.txt", { type: "age", maxAgeMs: 3600000 });
		expect(prunedNone).toBe(0);

		// Wait a small amount so the version timestamp is in the past.
		await new Promise((r) => setTimeout(r, 10));

		// Keep versions newer than 1ms (our version is now older than 1ms).
		const prunedAll = await fs.versioning.pruneVersions("/file.txt", { type: "age", maxAgeMs: 1 });
		expect(prunedAll).toBe(1);

		const remaining = await fs.versioning.listVersions("/file.txt");
		expect(remaining.length).toBe(0);
	});

	test("pruneVersions with deferred policy: deletes metadata only, not blocks", async () => {
		const data = makeData(CHUNK_SIZE);
		await fs.writeFile("/file.bin", data);
		await fs.versioning.createVersion("/file.bin");

		// Clear spy history before prune.
		blockStore.spies.deleteMany.mockClear();
		blockStore.spies.delete.mockClear();

		const pruned = await fs.versioning.pruneVersions("/file.bin", { type: "deferred" });
		expect(pruned).toBe(1);

		// No block deletions should have occurred.
		expect(blockStore.spies.deleteMany).not.toHaveBeenCalled();
		expect(blockStore.spies.delete).not.toHaveBeenCalled();

		// Version metadata should be gone.
		const remaining = await fs.versioning.listVersions("/file.bin");
		expect(remaining.length).toBe(0);
	});

	test("collectGarbage returns 0 (placeholder)", async () => {
		const count = await fs.versioning.collectGarbage();
		expect(count).toBe(0);
	});
});
