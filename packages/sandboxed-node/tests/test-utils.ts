/**
 * Test utilities for sandboxed-node
 */
import type { Directory } from "@wasmer/sdk/node";
import type { VirtualFileSystem } from "../src/types.js";

/**
 * Wrap a wasmer Directory as VirtualFileSystem for testing
 */
export function wrapDirectory(directory: Directory): VirtualFileSystem {
	return {
		readFile: (path: string) => directory.readFile(path),
		readTextFile: (path: string) => directory.readTextFile(path),
		readDir: async (path: string) => {
			const entries = await directory.readDir(path);
			// Convert DirEntry[] to string[]
			return entries.map((e) =>
				typeof e === "string" ? e : (e as { name: string }).name,
			);
		},
		writeFile: (path: string, content: string | Uint8Array) =>
			directory.writeFile(path, content),
		createDir: (path: string) => directory.createDir(path),
		mkdir: async (path: string) => {
			// Recursive mkdir
			const parts = path.split("/").filter(Boolean);
			let currentPath = "";
			for (const part of parts) {
				currentPath += `/${part}`;
				try {
					await directory.createDir(currentPath);
				} catch {
					// May already exist
				}
			}
		},
		exists: async (path: string) => {
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
		},
		removeFile: (path: string) => directory.removeFile(path),
		removeDir: (path: string) => directory.removeDir(path),
	};
}
