import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Directory } from "@wasmer/sdk";
import type { SystemBridge } from "../system-bridge/index.js";

/**
 * Recursively load files from host filesystem into virtual filesystem
 */
export async function loadHostDirectory(
	hostPath: string,
	virtualBasePath: string,
	bridge: SystemBridge,
): Promise<void> {
	const stats = await fs.stat(hostPath);

	if (!stats.isDirectory()) {
		throw new Error(`hostPath must be a directory: ${hostPath}`);
	}

	const dir = bridge.getDirectory();

	// Create base directory if not root
	if (virtualBasePath !== "/" && virtualBasePath !== "") {
		await mkdirp(dir, virtualBasePath);
	}

	await copyDirectory(hostPath, virtualBasePath, dir);
}

/**
 * Create directory and all parent directories
 */
async function mkdirp(dir: Directory, dirPath: string): Promise<void> {
	const parts = dirPath.split("/").filter(Boolean);
	let currentPath = "";
	for (const part of parts) {
		currentPath += `/${part}`;
		try {
			await dir.createDir(currentPath);
		} catch {
			// Directory may already exist
		}
	}
}

async function copyDirectory(
	hostDir: string,
	virtualDir: string,
	dir: Directory,
	onFile?: (count: number) => void,
): Promise<void> {
	const entries = await fs.readdir(hostDir, { withFileTypes: true });

	for (const entry of entries) {
		const hostEntryPath = path.join(hostDir, entry.name);
		const virtualEntryPath = path.posix.join(virtualDir, entry.name);

		// Handle symlinks by following them
		if (entry.isSymbolicLink()) {
			try {
				const realPath = await fs.realpath(hostEntryPath);
				const realStats = await fs.stat(realPath);

				if (realStats.isDirectory()) {
					try {
						await dir.createDir(virtualEntryPath);
					} catch {
						/* may exist */
					}
					await copyDirectory(realPath, virtualEntryPath, dir, onFile);
				} else if (realStats.isFile()) {
					const content = await fs.readFile(realPath);
					await dir.writeFile(virtualEntryPath, content);
					onFile?.(1);
				}
			} catch {
				// Skip broken symlinks
			}
		} else if (entry.isDirectory()) {
			// Create directory in virtual fs
			try {
				await dir.createDir(virtualEntryPath);
			} catch {
				/* may exist */
			}
			// Recursively copy contents
			await copyDirectory(hostEntryPath, virtualEntryPath, dir, onFile);
		} else if (entry.isFile()) {
			// Copy file contents
			const content = await fs.readFile(hostEntryPath);
			await dir.writeFile(virtualEntryPath, content);
			onFile?.(1);
		}
		// Skip sockets, etc.
	}
}

/**
 * Load only specific directories (e.g., just node_modules)
 */
export async function loadHostPaths(
	hostBasePath: string,
	paths: string[],
	virtualBasePath: string,
	bridge: SystemBridge,
): Promise<void> {
	const dir = bridge.getDirectory();

	for (const relativePath of paths) {
		const hostPath = path.join(hostBasePath, relativePath);
		const virtualPath = path.posix.join(virtualBasePath, relativePath);

		try {
			const stats = await fs.stat(hostPath);
			if (stats.isDirectory()) {
				await mkdirp(dir, virtualPath);
				await copyDirectory(hostPath, virtualPath, dir);
			} else if (stats.isFile()) {
				const content = await fs.readFile(hostPath);
				await dir.writeFile(virtualPath, content);
			}
		} catch {
			// Skip if path doesn't exist
		}
	}
}
