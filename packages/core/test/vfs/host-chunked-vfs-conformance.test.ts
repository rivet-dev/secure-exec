import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { defineVfsConformanceTests } from "../../src/test/vfs-conformance.js";
import { createChunkedVfs } from "../../src/vfs/chunked-vfs.js";
import { SqliteMetadataStore } from "../../src/vfs/sqlite-metadata.js";
import { HostBlockStore } from "../../src/vfs/host-block-store.js";

// Use small thresholds so edge case tests run quickly.
const INLINE_THRESHOLD = 256;
const CHUNK_SIZE = 1024;

let tmpDir: string;

defineVfsConformanceTests({
	name: "ChunkedVFS (SqliteMetadata + HostBlockStore)",
	createFs: async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "host-chunked-vfs-"));
		return createChunkedVfs({
			metadata: new SqliteMetadataStore({ dbPath: ":memory:" }),
			blocks: new HostBlockStore(tmpDir),
			inlineThreshold: INLINE_THRESHOLD,
			chunkSize: CHUNK_SIZE,
		});
	},
	cleanup: async () => {
		if (tmpDir) {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	},
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
