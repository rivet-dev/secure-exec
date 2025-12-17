import type { Directory } from "@wasmer/sdk/node";

export interface DirEntry {
	name: string;
	isDirectory: boolean;
}

export interface StatInfo {
	mode: number;
	size: number;
	isDirectory: boolean;
	atimeMs: number;
	mtimeMs: number;
	ctimeMs: number;
	birthtimeMs: number;
}

// Mode constants
const S_IFREG = 32768; // Regular file
const S_IFDIR = 16384; // Directory

/**
 * Check if a path exists in the directory
 */
export async function exists(
	directory: Directory,
	path: string,
): Promise<boolean> {
	try {
		await directory.readFile(path);
		return true;
	} catch {
		try {
			await directory.readDir(path);
			return true;
		} catch {
			return false;
		}
	}
}

/**
 * Get file/directory stats
 */
export async function stat(
	directory: Directory,
	path: string,
): Promise<StatInfo> {
	const now = Date.now();

	// Try to read as file first
	try {
		const content = await directory.readFile(path);
		return {
			mode: S_IFREG | 0o644,
			size: content.length,
			isDirectory: false,
			atimeMs: now,
			mtimeMs: now,
			ctimeMs: now,
			birthtimeMs: now,
		};
	} catch {
		// Not a file, try as directory
		try {
			await directory.readDir(path);
			return {
				mode: S_IFDIR | 0o755,
				size: 4096,
				isDirectory: true,
				atimeMs: now,
				mtimeMs: now,
				ctimeMs: now,
				birthtimeMs: now,
			};
		} catch {
			throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
		}
	}
}

/**
 * Rename/move a file
 */
export async function rename(
	directory: Directory,
	oldPath: string,
	newPath: string,
): Promise<void> {
	const content = await directory.readFile(oldPath);
	await directory.writeFile(newPath, content);
	await directory.removeFile(oldPath);
}

/**
 * Read directory with type info
 */
export async function readDirWithTypes(
	directory: Directory,
	path: string,
): Promise<DirEntry[]> {
	const entries = await directory.readDir(path);
	const results: DirEntry[] = [];

	for (const entry of entries) {
		const name =
			typeof entry === "string" ? entry : (entry as { name: string }).name;
		const entryPath = path.endsWith("/") ? `${path}${name}` : `${path}/${name}`;

		let isDir = false;
		try {
			await directory.readDir(entryPath);
			isDir = true;
		} catch {
			// It's a file
		}

		results.push({ name, isDirectory: isDir });
	}

	return results;
}

/**
 * Create a directory (recursively creates parent directories)
 */
export function mkdir(directory: Directory, path: string): void {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const parts = normalizedPath.split("/").filter(Boolean);

	let currentPath = "";
	for (const part of parts) {
		currentPath += `/${part}`;
		try {
			const result = directory.createDir(currentPath);
			if (result && typeof (result as Promise<void>).catch === "function") {
				(result as Promise<void>).catch(() => {
					// Directory might already exist, ignore error
				});
			}
		} catch {
			// Directory might already exist, ignore error
		}
	}
}
