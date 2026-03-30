import { defineVfsConformanceTests } from "../../src/test/vfs-conformance.js";
import { createChunkedVfs } from "../../src/vfs/chunked-vfs.js";
import { SqliteMetadataStore } from "../../src/vfs/sqlite-metadata.js";
import { InMemoryBlockStore } from "../../src/vfs/memory-block-store.js";

// Use small thresholds so edge case tests run quickly.
const INLINE_THRESHOLD = 256;
const CHUNK_SIZE = 1024;

defineVfsConformanceTests({
	name: "ChunkedVFS (SqliteMetadata + InMemoryBlock)",
	createFs: () =>
		createChunkedVfs({
			metadata: new SqliteMetadataStore({ dbPath: ":memory:" }),
			blocks: new InMemoryBlockStore(),
			inlineThreshold: INLINE_THRESHOLD,
			chunkSize: CHUNK_SIZE,
		}),
	capabilities: {
		symlinks: true,
		hardLinks: true,
		permissions: true,
		utimes: true,
		truncate: true,
		pread: true,
		pwrite: true,
		mkdir: true,
		removeDir: true,
		fsync: true,
		copy: true,
		readDirStat: true,
	},
	inlineThreshold: INLINE_THRESHOLD,
	chunkSize: CHUNK_SIZE,
});
