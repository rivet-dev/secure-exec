import * as fs from "fs/promises";
import * as path from "path";
import { SystemBridge } from "../system-bridge/index.js";

/**
 * Recursively load files from host filesystem into virtual filesystem
 */
export async function loadHostDirectory(
  hostPath: string,
  virtualBasePath: string,
  bridge: SystemBridge
): Promise<void> {
  const stats = await fs.stat(hostPath);

  if (!stats.isDirectory()) {
    throw new Error(`hostPath must be a directory: ${hostPath}`);
  }

  // Create base directory if not root
  if (virtualBasePath !== "/" && virtualBasePath !== "") {
    // Create directory path by writing a placeholder file
    // This is a workaround since wasmer Directory needs parent dirs to exist
    try {
      bridge.mkdir(virtualBasePath);
    } catch {
      // Ignore if it already exists or can't be created
    }
  }

  await copyDirectory(hostPath, virtualBasePath, bridge);
}

async function copyDirectory(
  hostDir: string,
  virtualDir: string,
  bridge: SystemBridge
): Promise<void> {
  const entries = await fs.readdir(hostDir, { withFileTypes: true });

  for (const entry of entries) {
    const hostEntryPath = path.join(hostDir, entry.name);
    const virtualEntryPath = path.posix.join(virtualDir, entry.name);

    if (entry.isDirectory()) {
      // Create directory in virtual fs
      bridge.mkdir(virtualEntryPath);
      // Recursively copy contents
      await copyDirectory(hostEntryPath, virtualEntryPath, bridge);
    } else if (entry.isFile()) {
      // Copy file contents
      const content = await fs.readFile(hostEntryPath);
      bridge.writeFile(virtualEntryPath, content);
    }
    // Skip symlinks, sockets, etc. for simplicity
  }
}

/**
 * Load only specific directories (e.g., just node_modules)
 */
export async function loadHostPaths(
  hostBasePath: string,
  paths: string[],
  virtualBasePath: string,
  bridge: SystemBridge
): Promise<void> {
  for (const relativePath of paths) {
    const hostPath = path.join(hostBasePath, relativePath);
    const virtualPath = path.posix.join(virtualBasePath, relativePath);

    try {
      const stats = await fs.stat(hostPath);
      if (stats.isDirectory()) {
        bridge.mkdir(virtualPath);
        await copyDirectory(hostPath, virtualPath, bridge);
      } else if (stats.isFile()) {
        const content = await fs.readFile(hostPath);
        bridge.writeFile(virtualPath, content);
      }
    } catch {
      // Skip if path doesn't exist
    }
  }
}
