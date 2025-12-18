/**
 * VirtualFileSystem implementation for nanosandbox.
 *
 * This module wraps a Directory for /data/* paths and uses shell fallback for other paths.
 * The mount structure (/data & /ipc) is configured elsewhere.
 *
 * For /data/* paths: delegates to the Directory directly (async)
 * For other paths: uses shell commands (ls, cat) via the shell callback
 */
import type { Directory } from "@wasmer/sdk/node";
import type { VirtualFileSystem } from "sandboxed-node";
import { DATA_MOUNT_PATH } from "../wasix/index.js";

/**
 * Type for shell command callback.
 * Returns { stdout, stderr, code } from running a shell command.
 */
export type ShellCallback = (
	command: string,
	args: string[],
) => Promise<{ stdout: string; stderr: string; code: number }>;

/**
 * Check if a path is under the data mount path.
 */
function isDataPath(path: string): boolean {
	return path.startsWith(DATA_MOUNT_PATH + "/") || path === DATA_MOUNT_PATH;
}

/**
 * Convert a VFS path to a Directory path.
 * E.g., /data/foo.txt → /foo.txt
 */
function toDirectoryPath(path: string): string {
	if (path.startsWith(DATA_MOUNT_PATH + "/")) {
		return path.slice(DATA_MOUNT_PATH.length);
	}
	if (path === DATA_MOUNT_PATH) {
		return "/";
	}
	return path;
}

/**
 * Create a VirtualFileSystem that delegates to a Directory implementation.
 * For /data/* paths, uses the Directory directly (with path transformation).
 * For other paths, uses shell commands via the callback.
 *
 * @param directory - The Directory to delegate to for /data/* paths
 * @param shellCallback - Optional callback for running shell commands (for non-/data paths)
 * @returns A VirtualFileSystem implementation
 */
export function createVirtualFileSystem(
	directory: Directory,
	shellCallback?: ShellCallback,
): VirtualFileSystem {
	return {
		readFile: async (path: string): Promise<Uint8Array> => {
			if (isDataPath(path)) {
				return directory.readFile(toDirectoryPath(path));
			}
			// Shell fallback for non-/data paths
			if (shellCallback) {
				const result = await shellCallback("cat", [path]);
				if (result.code !== 0) {
					throw new Error(`Failed to read file: ${path}`);
				}
				return new TextEncoder().encode(result.stdout);
			}
			throw new Error(
				`Path not accessible: ${path}. Only ${DATA_MOUNT_PATH}/* paths are available.`,
			);
		},

		readTextFile: async (path: string): Promise<string> => {
			if (isDataPath(path)) {
				return directory.readTextFile(toDirectoryPath(path));
			}
			// Shell fallback for non-/data paths
			if (shellCallback) {
				const result = await shellCallback("cat", [path]);
				if (result.code !== 0) {
					throw new Error(`Failed to read file: ${path}`);
				}
				return result.stdout;
			}
			throw new Error(
				`Path not accessible: ${path}. Only ${DATA_MOUNT_PATH}/* paths are available.`,
			);
		},

		readDir: async (path: string): Promise<string[]> => {
			if (isDataPath(path)) {
				const entries = await directory.readDir(toDirectoryPath(path));
				return entries.map((entry) =>
					typeof entry === "string" ? entry : (entry as { name: string }).name,
				);
			}
			// Shell fallback for non-/data paths
			if (shellCallback) {
				const result = await shellCallback("ls", ["-1", path]);
				if (result.code !== 0) {
					throw new Error(`Failed to read directory: ${path}`);
				}
				return result.stdout
					.trim()
					.split("\n")
					.filter((name) => name.length > 0);
			}
			throw new Error(
				`Path not accessible: ${path}. Only ${DATA_MOUNT_PATH}/* paths are available.`,
			);
		},

		writeFile: async (
			path: string,
			content: string | Uint8Array,
		): Promise<void> => {
			if (!isDataPath(path)) {
				throw new Error(
					`Cannot write to path outside /data: ${path}. Only ${DATA_MOUNT_PATH}/* paths are writable.`,
				);
			}
			const dirPath = toDirectoryPath(path);
			// HACK: Workaround for wasmer-js Directory.writeFile missing truncate(true)
			try {
				await directory.removeFile(dirPath);
			} catch {
				// Ignore errors - file may not exist
			}
			await directory.writeFile(dirPath, content);
		},

		createDir: async (path: string): Promise<void> => {
			if (!isDataPath(path)) {
				throw new Error(
					`Cannot write to path outside /data: ${path}. Only ${DATA_MOUNT_PATH}/* paths are writable.`,
				);
			}
			await directory.createDir(toDirectoryPath(path));
		},

		removeFile: async (path: string): Promise<void> => {
			if (!isDataPath(path)) {
				throw new Error(
					`Cannot write to path outside /data: ${path}. Only ${DATA_MOUNT_PATH}/* paths are writable.`,
				);
			}
			await directory.removeFile(toDirectoryPath(path));
		},

		removeDir: async (path: string): Promise<void> => {
			if (!isDataPath(path)) {
				throw new Error(
					`Cannot write to path outside /data: ${path}. Only ${DATA_MOUNT_PATH}/* paths are writable.`,
				);
			}
			await directory.removeDir(toDirectoryPath(path));
		},

		exists: async (path: string): Promise<boolean> => {
			if (isDataPath(path)) {
				try {
					// Try to read the file/dir to check existence
					// Directory doesn't have an exists method, so we try readDir for dirs
					// and readFile for files
					const dirPath = toDirectoryPath(path);
					try {
						await directory.readDir(dirPath);
						return true;
					} catch {
						// Not a directory, try as file
						try {
							await directory.readFile(dirPath);
							return true;
						} catch {
							return false;
						}
					}
				} catch {
					return false;
				}
			}
			// Shell fallback for non-/data paths
			// Use ls instead of test -e since test may not be available in WASM
			if (shellCallback) {
				const result = await shellCallback("ls", ["-d", path]);
				return result.code === 0;
			}
			return false;
		},

		mkdir: async (path: string): Promise<void> => {
			if (!isDataPath(path)) {
				throw new Error(
					`Cannot write to path outside /data: ${path}. Only ${DATA_MOUNT_PATH}/* paths are writable.`,
				);
			}
			// Recursively create directories
			const parts = toDirectoryPath(path).split("/").filter(Boolean);
			let currentPath = "";
			for (const part of parts) {
				currentPath += `/${part}`;
				try {
					await directory.createDir(currentPath);
				} catch {
					// Directory may already exist
				}
			}
		},
	};
}
