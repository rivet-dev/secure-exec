/**
 * ChunkedVFS: composes FsMetadataStore + FsBlockStore into a VirtualFileSystem.
 *
 * Tiered storage: files <= inlineThreshold are stored inline in metadata;
 * larger files are split into fixed-size chunks in the block store.
 * Per-inode async mutex prevents interleaved read-modify-write corruption.
 *
 * This module does NOT implement write buffering, versioning, copy, readDirStat,
 * or fsync. Those are separate stories.
 */

import { KernelError } from "../kernel/types.js";
import type { VirtualDirEntry, VirtualFileSystem, VirtualStat } from "../kernel/vfs.js";
import type { FsBlockStore, FsMetadataStore, InodeMeta } from "./types.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ChunkedVfsOptions {
	metadata: FsMetadataStore;
	blocks: FsBlockStore;
	/** Chunk size in bytes. Default: 4 MB. */
	chunkSize?: number;
	/** Max file size for inline storage. Default: 64 KB. */
	inlineThreshold?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB
const DEFAULT_INLINE_THRESHOLD = 64 * 1024; // 64 KB
const SYMLOOP_MAX = 40;

// ---------------------------------------------------------------------------
// Per-inode mutex
// ---------------------------------------------------------------------------

class InodeMutex {
	private locks = new Map<number, Promise<void>>();

	async acquire(ino: number): Promise<() => void> {
		while (this.locks.has(ino)) {
			await this.locks.get(ino);
		}
		let release!: () => void;
		this.locks.set(
			ino,
			new Promise((r) => {
				release = r;
			}),
		);
		return () => {
			this.locks.delete(ino);
			release();
		};
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitPath(path: string): string[] {
	if (!path || path === "/") return [];
	const normalized = path.startsWith("/") ? path.slice(1) : path;
	return normalized.split("/").filter((c) => c.length > 0);
}

function normalizePath(path: string): string {
	if (!path) return "/";
	let p = path.startsWith("/") ? path : `/${path}`;
	p = p.replace(/\/+/g, "/");
	if (p.length > 1 && p.endsWith("/")) {
		p = p.slice(0, -1);
	}
	return p;
}

function inodeMetaToStat(meta: InodeMeta): VirtualStat {
	return {
		mode: meta.mode,
		size: meta.type === "directory" ? 4096 : meta.size,
		isDirectory: meta.type === "directory",
		isSymbolicLink: meta.type === "symlink",
		atimeMs: meta.atimeMs,
		mtimeMs: meta.mtimeMs,
		ctimeMs: meta.ctimeMs,
		birthtimeMs: meta.birthtimeMs,
		ino: meta.ino,
		nlink: meta.nlink,
		uid: meta.uid,
		gid: meta.gid,
	};
}

function blockKey(ino: number, chunkIndex: number): string {
	return `${ino}/${chunkIndex}`;
}

// ---------------------------------------------------------------------------
// createChunkedVfs
// ---------------------------------------------------------------------------

export function createChunkedVfs(options: ChunkedVfsOptions): VirtualFileSystem {
	const metadata = options.metadata;
	const blocks = options.blocks;
	const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
	const inlineThreshold = options.inlineThreshold ?? DEFAULT_INLINE_THRESHOLD;
	const mutex = new InodeMutex();

	// -------------------------------------------------------------------
	// Internal: resolve inode, throwing typed errors
	// -------------------------------------------------------------------

	async function resolveIno(path: string): Promise<number> {
		return metadata.resolvePath(normalizePath(path));
	}

	async function requireInode(ino: number): Promise<InodeMeta> {
		const meta = await metadata.getInode(ino);
		if (!meta) {
			throw new KernelError("ENOENT", `inode ${ino} not found`);
		}
		return meta;
	}

	async function requireFileIno(path: string): Promise<{ ino: number; meta: InodeMeta }> {
		const ino = await resolveIno(path);
		const meta = await requireInode(ino);
		if (meta.type === "directory") {
			throw new KernelError("EISDIR", `illegal operation on a directory: '${path}'`);
		}
		return { ino, meta };
	}

	// -------------------------------------------------------------------
	// Internal: ensure parent directories exist (mkdir -p)
	// -------------------------------------------------------------------

	async function ensureParents(path: string): Promise<{ parentIno: number; name: string }> {
		const parts = splitPath(normalizePath(path));
		if (parts.length === 0) {
			throw new KernelError("ENOENT", "cannot resolve parent of root");
		}
		const name = parts[parts.length - 1]!;
		let currentIno = 1; // root

		for (let i = 0; i < parts.length - 1; i++) {
			const component = parts[i]!;
			let childIno = await metadata.lookup(currentIno, component);
			if (childIno === null) {
				// Auto-create intermediate directory.
				const dirIno = await metadata.createInode({
					type: "directory",
					mode: 0o755,
					uid: 0,
					gid: 0,
				});
				await metadata.createDentry(currentIno, component, dirIno, "directory");
				await metadata.updateInode(dirIno, { nlink: 2, size: 4096 });
				// Increment parent nlink for the new child's ".." reference.
				const parentMeta = await metadata.getInode(currentIno);
				if (parentMeta) {
					await metadata.updateInode(currentIno, { nlink: parentMeta.nlink + 1 });
				}
				childIno = dirIno;
			}
			currentIno = childIno;
		}

		return { parentIno: currentIno, name };
	}

	// -------------------------------------------------------------------
	// Internal: read file content from inline or chunked storage
	// -------------------------------------------------------------------

	async function readInodeContent(ino: number, meta: InodeMeta): Promise<Uint8Array> {
		if (meta.size === 0) return new Uint8Array(0);

		if (meta.storageMode === "inline") {
			return meta.inlineContent
				? new Uint8Array(meta.inlineContent)
				: new Uint8Array(0);
		}

		// Chunked: read all chunks and concatenate.
		const chunkEntries = await metadata.getAllChunkKeys(ino);
		const result = new Uint8Array(meta.size);

		for (const entry of chunkEntries) {
			const data = await blocks.read(entry.key);
			const offset = entry.chunkIndex * chunkSize;
			result.set(data, offset);
		}

		return result;
	}

	// -------------------------------------------------------------------
	// Internal: write file content with tiered storage
	// -------------------------------------------------------------------

	async function writeInodeContent(
		ino: number,
		content: Uint8Array,
		meta: InodeMeta,
	): Promise<void> {
		const now = Date.now();

		// Clean up old chunked data if present.
		if (meta.storageMode === "chunked") {
			const oldKeys = await metadata.deleteAllChunks(ino);
			if (oldKeys.length > 0) {
				await blocks.deleteMany(oldKeys);
			}
		}

		if (content.length <= inlineThreshold) {
			await metadata.updateInode(ino, {
				storageMode: "inline",
				inlineContent: new Uint8Array(content),
				size: content.length,
				mtimeMs: now,
				ctimeMs: now,
			});
		} else {
			// Split into chunks.
			const numChunks = Math.ceil(content.length / chunkSize);
			for (let i = 0; i < numChunks; i++) {
				const start = i * chunkSize;
				const end = Math.min(start + chunkSize, content.length);
				const chunk = content.slice(start, end);
				const key = blockKey(ino, i);
				await blocks.write(key, chunk);
				await metadata.setChunkKey(ino, i, key);
			}
			await metadata.updateInode(ino, {
				storageMode: "chunked",
				inlineContent: null,
				size: content.length,
				mtimeMs: now,
				ctimeMs: now,
			});
		}
	}

	// -------------------------------------------------------------------
	// Internal: promote inline to chunked
	// -------------------------------------------------------------------

	async function promoteToChunked(ino: number, meta: InodeMeta): Promise<void> {
		const data = meta.inlineContent ?? new Uint8Array(0);
		if (data.length > 0) {
			const numChunks = Math.ceil(data.length / chunkSize);
			for (let i = 0; i < numChunks; i++) {
				const start = i * chunkSize;
				const end = Math.min(start + chunkSize, data.length);
				const key = blockKey(ino, i);
				await blocks.write(key, data.slice(start, end));
				await metadata.setChunkKey(ino, i, key);
			}
		}
		await metadata.updateInode(ino, {
			storageMode: "chunked",
			inlineContent: null,
		});
	}

	// -------------------------------------------------------------------
	// Internal: demote chunked to inline
	// -------------------------------------------------------------------

	async function demoteToInline(ino: number, content: Uint8Array): Promise<void> {
		const oldKeys = await metadata.deleteAllChunks(ino);
		if (oldKeys.length > 0) {
			await blocks.deleteMany(oldKeys);
		}
		await metadata.updateInode(ino, {
			storageMode: "inline",
			inlineContent: new Uint8Array(content),
		});
	}

	// -------------------------------------------------------------------
	// Internal: realpath walk (resolves symlinks, builds canonical path)
	// -------------------------------------------------------------------

	async function realpathWalk(path: string): Promise<string> {
		const parts = splitPath(normalizePath(path));
		const resolved: string[] = [];
		const inoStack: number[] = [1]; // root
		let symlinkCount = 0;

		let i = 0;
		while (i < parts.length) {
			const name = parts[i]!;

			if (name === "." || name === "") {
				i++;
				continue;
			}
			if (name === "..") {
				if (resolved.length > 0) {
					resolved.pop();
					inoStack.pop();
				}
				i++;
				continue;
			}

			const parentIno = inoStack[inoStack.length - 1]!;
			const childIno = await metadata.lookup(parentIno, name);
			if (childIno === null) {
				throw new KernelError(
					"ENOENT",
					`no such file or directory, realpath '${path}'`,
				);
			}

			const childMeta = await metadata.getInode(childIno);
			if (!childMeta) {
				throw new KernelError(
					"ENOENT",
					`no such file or directory, realpath '${path}'`,
				);
			}

			if (childMeta.type === "symlink") {
				symlinkCount++;
				if (symlinkCount > SYMLOOP_MAX) {
					throw new KernelError("ELOOP", "too many levels of symbolic links");
				}
				const target = await metadata.readSymlink(childIno);
				const targetParts = splitPath(target);
				if (target.startsWith("/")) {
					// Absolute symlink: reset to root.
					resolved.length = 0;
					inoStack.length = 1;
				}
				// Splice target into remaining path.
				const remaining = parts.slice(i + 1);
				parts.length = i;
				parts.push(...targetParts, ...remaining);
				// Don't increment i; re-process from current position.
			} else {
				resolved.push(name);
				inoStack.push(childIno);
				i++;
			}
		}

		return resolved.length === 0 ? "/" : "/" + resolved.join("/");
	}

	// -------------------------------------------------------------------
	// VirtualFileSystem implementation
	// -------------------------------------------------------------------

	const vfs: VirtualFileSystem = {
		// -- Core I/O --

		async readFile(path: string): Promise<Uint8Array> {
			const { ino, meta } = await requireFileIno(path);
			const now = Date.now();
			await metadata.updateInode(ino, { atimeMs: now });
			return readInodeContent(ino, meta);
		},

		async readTextFile(path: string): Promise<string> {
			const data = await vfs.readFile(path);
			return new TextDecoder().decode(data);
		},

		async writeFile(path: string, content: string | Uint8Array): Promise<void> {
			const data =
				typeof content === "string" ? new TextEncoder().encode(content) : content;

			const { parentIno, name } = await ensureParents(path);
			const existingIno = await metadata.lookup(parentIno, name);

			if (existingIno !== null) {
				const release = await mutex.acquire(existingIno);
				try {
					const meta = await requireInode(existingIno);
					await writeInodeContent(existingIno, data, meta);
					await metadata.updateInode(existingIno, { nlink: Math.max(meta.nlink, 1) });
				} finally {
					release();
				}
			} else {
				await metadata.transaction(async () => {
					const newIno = await metadata.createInode({
						type: "file",
						mode: 0o644,
						uid: 0,
						gid: 0,
					});
					await metadata.createDentry(parentIno, name, newIno, "file");
					await metadata.updateInode(newIno, { nlink: 1 });
					const newMeta = await requireInode(newIno);
					await writeInodeContent(newIno, data, newMeta);
				});
			}
		},

		async exists(path: string): Promise<boolean> {
			try {
				await resolveIno(path);
				return true;
			} catch (e) {
				if (e instanceof KernelError && e.code === "ENOENT") return false;
				// ELOOP on dangling/circular symlinks: treat as not existing.
				if (e instanceof KernelError && e.code === "ELOOP") return false;
				throw e;
			}
		},

		async stat(path: string): Promise<VirtualStat> {
			const ino = await resolveIno(path);
			const meta = await requireInode(ino);
			return inodeMetaToStat(meta);
		},

		// -- Positional I/O --

		async pread(path: string, offset: number, length: number): Promise<Uint8Array> {
			const { ino, meta } = await requireFileIno(path);

			// Clamp.
			if (offset >= meta.size || length === 0) return new Uint8Array(0);
			const clampedLen = Math.min(length, meta.size - offset);

			if (meta.storageMode === "inline") {
				const content = meta.inlineContent ?? new Uint8Array(0);
				return content.slice(offset, offset + clampedLen);
			}

			// Chunked read.
			const startChunk = Math.floor(offset / chunkSize);
			const endChunk = Math.floor((offset + clampedLen - 1) / chunkSize);
			const result = new Uint8Array(clampedLen);
			let written = 0;

			for (let ci = startChunk; ci <= endChunk; ci++) {
				const chunkStart = ci * chunkSize;
				const readStart = Math.max(offset, chunkStart) - chunkStart;
				const readEnd = Math.min(offset + clampedLen, chunkStart + chunkSize) - chunkStart;
				const readLen = readEnd - readStart;

				const key = await metadata.getChunkKey(ino, ci);
				if (key === null) {
					// Sparse hole: zeros.
					written += readLen;
					continue;
				}

				const data = await blocks.readRange(key, readStart, readLen);
				result.set(data, written);
				written += readLen;
			}

			return result;
		},

		async pwrite(path: string, offset: number, data: Uint8Array): Promise<void> {
			if (data.length === 0) return;

			const ino = await resolveIno(path);
			const release = await mutex.acquire(ino);
			try {
				const meta = await requireInode(ino);
				if (meta.type === "directory") {
					throw new KernelError("EISDIR", `illegal operation on a directory: '${path}'`);
				}

				const newSize = Math.max(meta.size, offset + data.length);
				const now = Date.now();

				if (meta.storageMode === "inline") {
					if (newSize <= inlineThreshold) {
						// Stay inline.
						const existing = meta.inlineContent ?? new Uint8Array(0);
						const content = new Uint8Array(newSize);
						content.set(existing);
						content.set(data, offset);
						await metadata.updateInode(ino, {
							inlineContent: content,
							size: newSize,
							mtimeMs: now,
							ctimeMs: now,
						});
						return;
					}
					// Promote to chunked.
					await promoteToChunked(ino, meta);
					// Fall through to chunked pwrite.
				}

				// Chunked pwrite.
				const startChunk = Math.floor(offset / chunkSize);
				const endChunk = Math.floor((offset + data.length - 1) / chunkSize);

				for (let ci = startChunk; ci <= endChunk; ci++) {
					const chunkStart = ci * chunkSize;
					const writeStart = Math.max(offset, chunkStart) - chunkStart;
					const dataStart = Math.max(chunkStart - offset, 0);
					const writeEnd = Math.min(offset + data.length, chunkStart + chunkSize) - chunkStart;

					const key = blockKey(ino, ci);
					let chunk: Uint8Array;

					const existingKey = await metadata.getChunkKey(ino, ci);
					if (existingKey !== null) {
						chunk = await blocks.read(existingKey);
						// Ensure chunk is large enough.
						if (chunk.length < writeEnd) {
							const expanded = new Uint8Array(writeEnd);
							expanded.set(chunk);
							chunk = expanded;
						}
					} else {
						chunk = new Uint8Array(writeEnd);
					}

					chunk.set(data.subarray(dataStart, dataStart + (writeEnd - writeStart)), writeStart);
					await blocks.write(key, chunk);
					await metadata.setChunkKey(ino, ci, key);
				}

				await metadata.updateInode(ino, {
					size: newSize,
					mtimeMs: now,
					ctimeMs: now,
				});
			} finally {
				release();
			}
		},

		async truncate(path: string, length: number): Promise<void> {
			const ino = await resolveIno(path);
			const release = await mutex.acquire(ino);
			try {
				const meta = await requireInode(ino);
				if (meta.type === "directory") {
					throw new KernelError("EISDIR", `illegal operation on a directory: '${path}'`);
				}
				if (length === meta.size) return;

				const now = Date.now();

				if (length < meta.size) {
					// Shrinking.
					if (meta.storageMode === "inline") {
						const content = meta.inlineContent ?? new Uint8Array(0);
						await metadata.updateInode(ino, {
							inlineContent: length === 0 ? new Uint8Array(0) : content.slice(0, length),
							size: length,
							mtimeMs: now,
							ctimeMs: now,
						});
						return;
					}

					// Chunked shrink.
					if (length === 0) {
						const keys = await metadata.deleteAllChunks(ino);
						if (keys.length > 0) await blocks.deleteMany(keys);
						await metadata.updateInode(ino, {
							storageMode: "inline",
							inlineContent: new Uint8Array(0),
							size: 0,
							mtimeMs: now,
							ctimeMs: now,
						});
						return;
					}

					const lastChunkIndex = Math.floor((length - 1) / chunkSize);
					// Delete chunks beyond last.
					const deletedKeys = await metadata.deleteChunksFrom(ino, lastChunkIndex + 1);
					if (deletedKeys.length > 0) await blocks.deleteMany(deletedKeys);

					// Truncate last chunk if partial.
					const lastChunkOffset = length % chunkSize;
					if (lastChunkOffset > 0) {
						const key = await metadata.getChunkKey(ino, lastChunkIndex);
						if (key !== null) {
							const existing = await blocks.read(key);
							if (existing.length > lastChunkOffset) {
								const truncated = existing.slice(0, lastChunkOffset);
								await blocks.write(key, truncated);
							}
						}
					}

					// Demote to inline if small enough.
					if (length <= inlineThreshold) {
						const content = new Uint8Array(length);
						const chunkEntries = await metadata.getAllChunkKeys(ino);
						for (const entry of chunkEntries) {
							const chunkData = await blocks.read(entry.key);
							const chunkOffset = entry.chunkIndex * chunkSize;
							content.set(chunkData, chunkOffset);
						}
						await demoteToInline(ino, content);
					}

					await metadata.updateInode(ino, {
						size: length,
						mtimeMs: now,
						ctimeMs: now,
					});
				} else {
					// Growing.
					if (meta.storageMode === "inline") {
						if (length <= inlineThreshold) {
							const content = new Uint8Array(length);
							if (meta.inlineContent) content.set(meta.inlineContent);
							await metadata.updateInode(ino, {
								inlineContent: content,
								size: length,
								mtimeMs: now,
								ctimeMs: now,
							});
							return;
						}
						// Promote to chunked.
						await promoteToChunked(ino, meta);
					}
					// Chunked grow: just update size. Unwritten regions read as zeros (sparse).
					await metadata.updateInode(ino, {
						size: length,
						mtimeMs: now,
						ctimeMs: now,
					});
				}
			} finally {
				release();
			}
		},

		// -- Directory operations --

		async readDir(path: string): Promise<string[]> {
			const ino = await resolveIno(path);
			const meta = await requireInode(ino);
			if (meta.type !== "directory") {
				throw new KernelError("ENOTDIR", `not a directory: '${path}'`);
			}
			const entries = await metadata.listDir(ino);
			return entries.map((e) => e.name);
		},

		async readDirWithTypes(path: string): Promise<VirtualDirEntry[]> {
			const ino = await resolveIno(path);
			const meta = await requireInode(ino);
			if (meta.type !== "directory") {
				throw new KernelError("ENOTDIR", `not a directory: '${path}'`);
			}
			const entries = await metadata.listDir(ino);
			return entries.map((e) => ({
				name: e.name,
				isDirectory: e.type === "directory",
				isSymbolicLink: e.type === "symlink",
				ino: e.ino,
			}));
		},

		async createDir(path: string): Promise<void> {
			const normalized = normalizePath(path);
			const { parentIno, name } = await metadata.resolveParentPath(normalized);
			const existing = await metadata.lookup(parentIno, name);
			if (existing !== null) {
				throw new KernelError("EEXIST", `directory already exists: '${path}'`);
			}
			const dirIno = await metadata.createInode({
				type: "directory",
				mode: 0o755,
				uid: 0,
				gid: 0,
			});
			await metadata.createDentry(parentIno, name, dirIno, "directory");
			await metadata.updateInode(dirIno, { nlink: 2, size: 4096 });
			const parentMeta = await metadata.getInode(parentIno);
			if (parentMeta) {
				await metadata.updateInode(parentIno, { nlink: parentMeta.nlink + 1 });
			}
		},

		async mkdir(path: string, _options?: { recursive?: boolean }): Promise<void> {
			const parts = splitPath(normalizePath(path));
			let currentIno = 1; // root

			for (const part of parts) {
				const childIno = await metadata.lookup(currentIno, part);
				if (childIno !== null) {
					currentIno = childIno;
					continue;
				}
				const dirIno = await metadata.createInode({
					type: "directory",
					mode: 0o755,
					uid: 0,
					gid: 0,
				});
				await metadata.createDentry(currentIno, part, dirIno, "directory");
				await metadata.updateInode(dirIno, { nlink: 2, size: 4096 });
				const parentMeta = await metadata.getInode(currentIno);
				if (parentMeta) {
					await metadata.updateInode(currentIno, { nlink: parentMeta.nlink + 1 });
				}
				currentIno = dirIno;
			}
		},

		async removeDir(path: string): Promise<void> {
			const normalized = normalizePath(path);
			if (normalized === "/") {
				throw new KernelError("EPERM", "operation not permitted, rmdir '/'");
			}
			const { parentIno, name } = await metadata.resolveParentPath(normalized);
			const childIno = await metadata.lookup(parentIno, name);
			if (childIno === null) {
				throw new KernelError("ENOENT", `no such directory: '${path}'`);
			}
			const childMeta = await requireInode(childIno);
			if (childMeta.type !== "directory") {
				throw new KernelError("ENOTDIR", `not a directory: '${path}'`);
			}
			const entries = await metadata.listDir(childIno);
			if (entries.length > 0) {
				throw new KernelError("ENOTEMPTY", `directory not empty: '${path}'`);
			}
			await metadata.transaction(async () => {
				await metadata.removeDentry(parentIno, name);
				await metadata.deleteInode(childIno);
				const parentMeta = await metadata.getInode(parentIno);
				if (parentMeta) {
					await metadata.updateInode(parentIno, { nlink: parentMeta.nlink - 1 });
				}
			});
		},

		// -- Path operations --

		async rename(oldPath: string, newPath: string): Promise<void> {
			const oldNorm = normalizePath(oldPath);
			const newNorm = normalizePath(newPath);
			if (oldNorm === newNorm) return;

			const release: Array<() => void> = [];
			try {
				const srcResolved = await metadata.resolveParentPath(oldNorm);
				const dstResolved = await metadata.resolveParentPath(newNorm);
				const srcIno = await metadata.lookup(srcResolved.parentIno, srcResolved.name);
				if (srcIno === null) {
					throw new KernelError("ENOENT", `no such file or directory: '${oldPath}'`);
				}

				const srcMeta = await requireInode(srcIno);
				release.push(await mutex.acquire(srcIno));

				const existingDstIno = await metadata.lookup(dstResolved.parentIno, dstResolved.name);

				await metadata.transaction(async () => {
					if (existingDstIno !== null) {
						const dstMeta = await requireInode(existingDstIno);
						if (dstMeta.type === "directory") {
							const dstEntries = await metadata.listDir(existingDstIno);
							if (dstEntries.length > 0) {
								throw new KernelError("ENOTEMPTY", `directory not empty: '${newPath}'`);
							}
							await metadata.removeDentry(dstResolved.parentIno, dstResolved.name);
							await metadata.deleteInode(existingDstIno);
							const dstParentMeta = await metadata.getInode(dstResolved.parentIno);
							if (dstParentMeta) {
								await metadata.updateInode(dstResolved.parentIno, {
									nlink: dstParentMeta.nlink - 1,
								});
							}
						} else {
							// File or symlink: decrement nlink, delete if 0.
							await metadata.removeDentry(dstResolved.parentIno, dstResolved.name);
							const newNlink = dstMeta.nlink - 1;
							if (newNlink <= 0) {
								if (dstMeta.storageMode === "chunked") {
									const keys = await metadata.deleteAllChunks(existingDstIno);
									if (keys.length > 0) await blocks.deleteMany(keys);
								}
								await metadata.deleteInode(existingDstIno);
							} else {
								await metadata.updateInode(existingDstIno, {
									nlink: newNlink,
									ctimeMs: Date.now(),
								});
							}
						}
					}

					await metadata.renameDentry(
						srcResolved.parentIno,
						srcResolved.name,
						dstResolved.parentIno,
						dstResolved.name,
					);

					// Update parent directory nlinks for directory moves.
					if (
						srcMeta.type === "directory" &&
						srcResolved.parentIno !== dstResolved.parentIno
					) {
						const srcParent = await metadata.getInode(srcResolved.parentIno);
						if (srcParent) {
							await metadata.updateInode(srcResolved.parentIno, {
								nlink: srcParent.nlink - 1,
							});
						}
						const dstParent = await metadata.getInode(dstResolved.parentIno);
						if (dstParent) {
							await metadata.updateInode(dstResolved.parentIno, {
								nlink: dstParent.nlink + 1,
							});
						}
					}
				});
			} finally {
				for (const r of release) r();
			}
		},

		async removeFile(path: string): Promise<void> {
			const normalized = normalizePath(path);
			const { parentIno, name } = await metadata.resolveParentPath(normalized);
			const childIno = await metadata.lookup(parentIno, name);
			if (childIno === null) {
				throw new KernelError("ENOENT", `no such file or directory: '${path}'`);
			}
			const childMeta = await requireInode(childIno);
			if (childMeta.type === "directory") {
				throw new KernelError("EISDIR", `illegal operation on a directory: '${path}'`);
			}

			const release = await mutex.acquire(childIno);
			try {
				await metadata.transaction(async () => {
					await metadata.removeDentry(parentIno, name);
					const newNlink = childMeta.nlink - 1;
					if (newNlink <= 0) {
						if (childMeta.storageMode === "chunked") {
							const keys = await metadata.deleteAllChunks(childIno);
							if (keys.length > 0) await blocks.deleteMany(keys);
						}
						await metadata.deleteInode(childIno);
					} else {
						await metadata.updateInode(childIno, {
							nlink: newNlink,
							ctimeMs: Date.now(),
						});
					}
				});
			} finally {
				release();
			}
		},

		async realpath(path: string): Promise<string> {
			return realpathWalk(path);
		},

		// -- Symlinks & links --

		async symlink(target: string, linkPath: string): Promise<void> {
			const normalized = normalizePath(linkPath);
			const { parentIno, name } = await metadata.resolveParentPath(normalized);
			const existing = await metadata.lookup(parentIno, name);
			if (existing !== null) {
				throw new KernelError("EEXIST", `file already exists: '${linkPath}'`);
			}
			const symlinkIno = await metadata.createInode({
				type: "symlink",
				mode: 0o777,
				uid: 0,
				gid: 0,
				symlinkTarget: target,
			});
			await metadata.createDentry(parentIno, name, symlinkIno, "symlink");
			await metadata.updateInode(symlinkIno, {
				nlink: 1,
				size: new TextEncoder().encode(target).byteLength,
			});
		},

		async readlink(path: string): Promise<string> {
			const normalized = normalizePath(path);
			const { parentIno, name } = await metadata.resolveParentPath(normalized);
			const childIno = await metadata.lookup(parentIno, name);
			if (childIno === null) {
				throw new KernelError("ENOENT", `no such file or directory: '${path}'`);
			}
			const childMeta = await requireInode(childIno);
			if (childMeta.type !== "symlink") {
				throw new KernelError("EINVAL", `not a symlink: '${path}'`);
			}
			return metadata.readSymlink(childIno);
		},

		async lstat(path: string): Promise<VirtualStat> {
			const normalized = normalizePath(path);
			const { parentIno, name } = await metadata.resolveParentPath(normalized);
			const childIno = await metadata.lookup(parentIno, name);
			if (childIno === null) {
				throw new KernelError("ENOENT", `no such file or directory: '${path}'`);
			}
			const childMeta = await requireInode(childIno);
			return inodeMetaToStat(childMeta);
		},

		async link(oldPath: string, newPath: string): Promise<void> {
			const srcIno = await resolveIno(oldPath);
			const srcMeta = await requireInode(srcIno);
			if (srcMeta.type === "directory") {
				throw new KernelError("EPERM", `operation not permitted, link directory: '${oldPath}'`);
			}

			const normalized = normalizePath(newPath);
			const { parentIno, name } = await metadata.resolveParentPath(normalized);
			const existing = await metadata.lookup(parentIno, name);
			if (existing !== null) {
				throw new KernelError("EEXIST", `file already exists: '${newPath}'`);
			}

			await metadata.createDentry(parentIno, name, srcIno, srcMeta.type);
			await metadata.updateInode(srcIno, { nlink: srcMeta.nlink + 1 });
		},

		// -- Permissions & Metadata --

		async chmod(path: string, mode: number): Promise<void> {
			const ino = await resolveIno(path);
			const meta = await requireInode(ino);
			const callerTypeBits = mode & 0o170000;
			let newMode: number;
			if (callerTypeBits !== 0) {
				newMode = mode;
			} else {
				const existingTypeBits = meta.mode & 0o170000;
				newMode = existingTypeBits | (mode & 0o7777);
			}
			await metadata.updateInode(ino, { mode: newMode, ctimeMs: Date.now() });
		},

		async chown(path: string, uid: number, gid: number): Promise<void> {
			const ino = await resolveIno(path);
			await metadata.updateInode(ino, { uid, gid, ctimeMs: Date.now() });
		},

		async utimes(path: string, atime: number, mtime: number): Promise<void> {
			const ino = await resolveIno(path);
			await metadata.updateInode(ino, {
				atimeMs: atime * 1000,
				mtimeMs: mtime * 1000,
				ctimeMs: Date.now(),
			});
		},
	};

	return vfs;
}
