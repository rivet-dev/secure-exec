import type {
	VirtualDirEntry,
	VirtualFileSystem,
	VirtualStat,
} from "./kernel/vfs.js";

export type DirEntry = VirtualDirEntry;
export type StatInfo = VirtualStat;

/**
 * Check if a path exists in the filesystem
 */
export async function exists(
	fs: VirtualFileSystem,
	path: string,
): Promise<boolean> {
	return fs.exists(path);
}

/**
 * Get file/directory stats
 */
export async function stat(
	fs: VirtualFileSystem,
	path: string,
): Promise<StatInfo> {
	return fs.stat(path);
}

/**
 * Rename/move a file
 */
export async function rename(
	fs: VirtualFileSystem,
	oldPath: string,
	newPath: string,
): Promise<void> {
	await fs.rename(oldPath, newPath);
}

/**
 * Read directory with type info
 */
export async function readDirWithTypes(
	fs: VirtualFileSystem,
	path: string,
): Promise<DirEntry[]> {
	return fs.readDirWithTypes(path);
}

/**
 * Create a directory (recursively creates parent directories)
 */
export async function mkdir(fs: VirtualFileSystem, path: string): Promise<void> {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const parts = normalizedPath.split("/").filter(Boolean);

	let currentPath = "";
	for (const part of parts) {
		currentPath += `/${part}`;
		try {
			await fs.createDir(currentPath);
		} catch {
			// Directory might already exist, ignore error
		}
	}
}
