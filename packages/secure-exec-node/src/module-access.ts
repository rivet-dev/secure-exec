import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import path from "node:path";
import { createEaccesError } from "@secure-exec/core/internal/shared/errors";
import type { VirtualDirEntry, VirtualFileSystem, VirtualStat } from "@secure-exec/core";

/**
 * Options controlling which host node_modules are projected into the sandbox.
 * The overlay exposes `<cwd>/node_modules` read-only by default.
 */
export interface ModuleAccessOptions {
	cwd?: string;
	/**
	 * Deprecated: retained for API compatibility only.
	 * The overlay now exposes scoped <cwd>/node_modules read-only by default.
	 */
	allowPackages?: string[];
}

const MODULE_ACCESS_INVALID_CONFIG = "ERR_MODULE_ACCESS_INVALID_CONFIG";
const MODULE_ACCESS_OUT_OF_SCOPE = "ERR_MODULE_ACCESS_OUT_OF_SCOPE";
const MODULE_ACCESS_NATIVE_ADDON = "ERR_MODULE_ACCESS_NATIVE_ADDON";

const SANDBOX_APP_ROOT = "/root";
const SANDBOX_NODE_MODULES_ROOT = `${SANDBOX_APP_ROOT}/node_modules`;

const VIRTUAL_DIR_MODE = 0o040755;

function toVirtualPath(value: string): string {
	if (!value || value === ".") return "/";
	const normalized = path.posix.normalize(value.startsWith("/") ? value : `/${value}`);
	if (normalized.length > 1 && normalized.endsWith("/")) {
		return normalized.slice(0, -1);
	}
	return normalized;
}

function isWithinPath(candidate: string, parent: string): boolean {
	const relative = path.relative(parent, candidate);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

function startsWithPath(value: string, prefix: string): boolean {
	return value === prefix || value.startsWith(`${prefix}/`);
}

function createEnoentError(syscall: string, targetPath: string): Error {
	const error = new Error(
		`ENOENT: no such file or directory, ${syscall} '${targetPath}'`,
	) as NodeJS.ErrnoException;
	error.code = "ENOENT";
	error.path = targetPath;
	error.syscall = syscall;
	return error;
}

function createModuleAccessError(code: string, message: string): Error {
	const error = new Error(`${code}: ${message}`) as NodeJS.ErrnoException;
	error.code = code;
	return error;
}

function createVirtualDirStat(): VirtualStat {
	const now = Date.now();
	return {
		mode: VIRTUAL_DIR_MODE,
		size: 4096,
		isDirectory: true,
		atimeMs: now,
		mtimeMs: now,
		ctimeMs: now,
		birthtimeMs: now,
	};
}

function normalizeOverlayPath(pathValue: string): string {
	return toVirtualPath(pathValue);
}

function isNativeAddonPath(pathValue: string): boolean {
	return pathValue.endsWith(".node");
}

/**
 * Walk the host node_modules directory and its pnpm virtual-store, resolving
 * symlink targets to build the full set of allowed host paths. This prevents
 * symlink-based escapes from the overlay projection.
 */
function collectOverlayAllowedRoots(hostNodeModulesRoot: string): string[] {
	const roots = new Set<string>([hostNodeModulesRoot]);
	const symlinkScanRoots = [hostNodeModulesRoot, path.join(hostNodeModulesRoot, ".pnpm", "node_modules")];

	const addSymlinkTarget = (entryPath: string): void => {
		try {
			const target = fsSync.realpathSync(entryPath);
			roots.add(target);
		} catch {
			// Ignore broken symlinks.
		}
	};

	const scanDirForSymlinks = (scanRoot: string): void => {
		let entries: fsSync.Dirent[] = [];
		try {
			entries = fsSync.readdirSync(scanRoot, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const entryPath = path.join(scanRoot, entry.name);
			if (entry.isSymbolicLink()) {
				addSymlinkTarget(entryPath);
				continue;
			}
			if (entry.isDirectory() && entry.name.startsWith("@")) {
				let scopedEntries: fsSync.Dirent[] = [];
				try {
					scopedEntries = fsSync.readdirSync(entryPath, { withFileTypes: true });
				} catch {
					continue;
				}
				for (const scopedEntry of scopedEntries) {
					if (!scopedEntry.isSymbolicLink()) continue;
					addSymlinkTarget(path.join(entryPath, scopedEntry.name));
				}
			}
		}
	};

	for (const scanRoot of symlinkScanRoots) {
		scanDirForSymlinks(scanRoot);
	}

	return [...roots];
}

/**
 * Union filesystem that overlays host `node_modules` (read-only) onto a base
 * VFS. Sandbox code sees `/root/node_modules/...` which maps to the host's
 * real `<cwd>/node_modules/...`. Write operations to the overlay throw EACCES.
 * Symlinks are resolved and validated against the allowed-roots allowlist to
 * prevent path-traversal escapes. Native `.node` addons are rejected.
 */
export class ModuleAccessFileSystem implements VirtualFileSystem {
	private readonly baseFileSystem?: VirtualFileSystem;
	private readonly hostNodeModulesRoot: string | null;
	private readonly overlayAllowedRoots: string[];

	constructor(baseFileSystem: VirtualFileSystem | undefined, options: ModuleAccessOptions) {
		this.baseFileSystem = baseFileSystem;

		const cwdInput = options.cwd ?? process.cwd();
		if (options.cwd !== undefined && !path.isAbsolute(options.cwd)) {
			throw createModuleAccessError(
				MODULE_ACCESS_INVALID_CONFIG,
				`moduleAccess.cwd must be an absolute path, got '${options.cwd}'`,
			);
		}

		const cwd = path.resolve(cwdInput);
		const nodeModulesPath = path.join(cwd, "node_modules");
		try {
			this.hostNodeModulesRoot = fsSync.realpathSync(nodeModulesPath);
			this.overlayAllowedRoots = collectOverlayAllowedRoots(this.hostNodeModulesRoot);
		} catch {
			this.hostNodeModulesRoot = null;
			this.overlayAllowedRoots = [];
		}
	}

	private isWithinAllowedOverlayRoots(canonicalPath: string): boolean {
		return this.overlayAllowedRoots.some((root) => isWithinPath(canonicalPath, root));
	}

	private isSyntheticPath(virtualPath: string): boolean {
		if (virtualPath === "/" || virtualPath === SANDBOX_APP_ROOT) {
			return true;
		}
		if (virtualPath === SANDBOX_NODE_MODULES_ROOT) {
			return this.hostNodeModulesRoot !== null;
		}
		return false;
	}

	private syntheticChildren(pathValue: string): Map<string, boolean> {
		const entries = new Map<string, boolean>();
		if (pathValue === "/") {
			entries.set("app", true);
		}
		if (pathValue === SANDBOX_APP_ROOT && this.hostNodeModulesRoot !== null) {
			entries.set("node_modules", true);
		}
		return entries;
	}

	private isReadOnlyProjectionPath(virtualPath: string): boolean {
		return startsWithPath(virtualPath, SANDBOX_NODE_MODULES_ROOT);
	}

	private shouldMergeBase(pathValue: string): boolean {
		return (
			pathValue === "/" ||
			pathValue === SANDBOX_APP_ROOT ||
			!startsWithPath(pathValue, SANDBOX_NODE_MODULES_ROOT)
		);
	}

	/**
	 * Translate a sandbox path to the host filesystem path.
	 * Returns null if the path is not within the overlay.
	 */
	toHostPath(virtualPath: string): string | null {
		return this.overlayHostPathFor(virtualPath);
	}

	private overlayHostPathFor(virtualPath: string): string | null {
		if (!startsWithPath(virtualPath, SANDBOX_NODE_MODULES_ROOT)) {
			return null;
		}
		if (!this.hostNodeModulesRoot) {
			return null;
		}
		if (virtualPath === SANDBOX_NODE_MODULES_ROOT) {
			return this.hostNodeModulesRoot;
		}
		const relative = path.posix
			.relative(SANDBOX_NODE_MODULES_ROOT, virtualPath)
			.replace(/^\/+/, "");
		if (!relative) {
			return this.hostNodeModulesRoot;
		}
		return path.join(this.hostNodeModulesRoot, ...relative.split("/"));
	}

	private async resolveOverlayHostPath(
		virtualPath: string,
		syscall: string,
	): Promise<string | null> {
		if (isNativeAddonPath(virtualPath)) {
			throw createModuleAccessError(
				MODULE_ACCESS_NATIVE_ADDON,
				`native addon '${virtualPath}' is not supported for module overlay`,
			);
		}

		const hostPath = this.overlayHostPathFor(virtualPath);
		if (!hostPath) {
			return null;
		}

		try {
			const canonical = await fs.realpath(hostPath);
			if (
				!this.hostNodeModulesRoot ||
				!this.isWithinAllowedOverlayRoots(canonical)
			) {
				throw createModuleAccessError(
					MODULE_ACCESS_OUT_OF_SCOPE,
					`resolved path for '${virtualPath}' escapes allowed overlay roots`,
				);
			}
			if (isNativeAddonPath(canonical)) {
				throw createModuleAccessError(
					MODULE_ACCESS_NATIVE_ADDON,
					`native addon '${virtualPath}' is not supported for module overlay`,
				);
			}
			return canonical;
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err?.code === "ENOENT") {
				return null;
			}
			if (err?.code === MODULE_ACCESS_OUT_OF_SCOPE) {
				throw err;
			}
			if (err?.code === MODULE_ACCESS_NATIVE_ADDON) {
				throw err;
			}
			if (err?.code === "EACCES") {
				throw createEaccesError(syscall, virtualPath);
			}
			throw err;
		}
	}

	private async readMergedDir(pathValue: string): Promise<Map<string, boolean>> {
		const entries = this.syntheticChildren(pathValue);

		const overlayHostPath = await this.resolveOverlayHostPath(pathValue, "scandir");
		if (overlayHostPath) {
			const hostEntries = await fs.readdir(overlayHostPath, { withFileTypes: true });
			for (const entry of hostEntries) {
				entries.set(entry.name, entry.isDirectory());
			}
		}

		if (this.baseFileSystem && this.shouldMergeBase(pathValue)) {
			try {
				const baseEntries = await this.baseFileSystem.readDirWithTypes(pathValue);
				for (const entry of baseEntries) {
					if (!entries.has(entry.name)) {
						entries.set(entry.name, entry.isDirectory);
					}
				}
			} catch {
				// Ignore base fs misses for synthetic and overlay-facing reads.
			}
		}

		if (entries.size === 0 && !this.isSyntheticPath(pathValue)) {
			throw createEnoentError("scandir", pathValue);
		}

		return entries;
	}

	private async fallbackReadFile(pathValue: string): Promise<Uint8Array> {
		if (!this.baseFileSystem) {
			throw createEnoentError("open", pathValue);
		}
		return this.baseFileSystem.readFile(pathValue);
	}

	private async fallbackReadTextFile(pathValue: string): Promise<string> {
		if (!this.baseFileSystem) {
			throw createEnoentError("open", pathValue);
		}
		return this.baseFileSystem.readTextFile(pathValue);
	}

	private async fallbackReadDir(pathValue: string): Promise<string[]> {
		if (!this.baseFileSystem) {
			throw createEnoentError("scandir", pathValue);
		}
		return this.baseFileSystem.readDir(pathValue);
	}

	private async fallbackReadDirWithTypes(pathValue: string): Promise<VirtualDirEntry[]> {
		if (!this.baseFileSystem) {
			throw createEnoentError("scandir", pathValue);
		}
		return this.baseFileSystem.readDirWithTypes(pathValue);
	}

	private async fallbackWriteFile(
		pathValue: string,
		content: string | Uint8Array,
	): Promise<void> {
		if (!this.baseFileSystem) {
			throw createEnoentError("write", pathValue);
		}
		return this.baseFileSystem.writeFile(pathValue, content);
	}

	private async fallbackCreateDir(pathValue: string): Promise<void> {
		if (!this.baseFileSystem) {
			throw createEnoentError("mkdir", pathValue);
		}
		return this.baseFileSystem.createDir(pathValue);
	}

	private async fallbackMkdir(pathValue: string): Promise<void> {
		if (!this.baseFileSystem) {
			throw createEnoentError("mkdir", pathValue);
		}
		return this.baseFileSystem.mkdir(pathValue);
	}

	private async fallbackExists(pathValue: string): Promise<boolean> {
		if (!this.baseFileSystem) {
			return false;
		}
		return this.baseFileSystem.exists(pathValue);
	}

	private async fallbackStat(pathValue: string): Promise<VirtualStat> {
		if (!this.baseFileSystem) {
			throw createEnoentError("stat", pathValue);
		}
		return this.baseFileSystem.stat(pathValue);
	}

	private async fallbackRemoveFile(pathValue: string): Promise<void> {
		if (!this.baseFileSystem) {
			throw createEnoentError("unlink", pathValue);
		}
		return this.baseFileSystem.removeFile(pathValue);
	}

	private async fallbackRemoveDir(pathValue: string): Promise<void> {
		if (!this.baseFileSystem) {
			throw createEnoentError("rmdir", pathValue);
		}
		return this.baseFileSystem.removeDir(pathValue);
	}

	private async fallbackRename(oldPath: string, newPath: string): Promise<void> {
		if (!this.baseFileSystem) {
			throw createEnoentError("rename", `${oldPath} -> ${newPath}`);
		}
		return this.baseFileSystem.rename(oldPath, newPath);
	}

	async readFile(pathValue: string): Promise<Uint8Array> {
		const virtualPath = normalizeOverlayPath(pathValue);
		const hostPath = await this.resolveOverlayHostPath(virtualPath, "open");
		if (hostPath) {
			return fs.readFile(hostPath);
		}
		if (startsWithPath(virtualPath, SANDBOX_NODE_MODULES_ROOT)) {
			throw createEnoentError("open", virtualPath);
		}
		return this.fallbackReadFile(virtualPath);
	}

	async readTextFile(pathValue: string): Promise<string> {
		const virtualPath = normalizeOverlayPath(pathValue);
		const hostPath = await this.resolveOverlayHostPath(virtualPath, "open");
		if (hostPath) {
			return fs.readFile(hostPath, "utf8");
		}
		if (startsWithPath(virtualPath, SANDBOX_NODE_MODULES_ROOT)) {
			throw createEnoentError("open", virtualPath);
		}
		return this.fallbackReadTextFile(virtualPath);
	}

	async readDir(pathValue: string): Promise<string[]> {
		const virtualPath = normalizeOverlayPath(pathValue);
		if (
			this.isSyntheticPath(virtualPath) ||
			startsWithPath(virtualPath, SANDBOX_NODE_MODULES_ROOT)
		) {
			const entries = await this.readMergedDir(virtualPath);
			return Array.from(entries.keys()).sort((left, right) =>
				left.localeCompare(right),
			);
		}
		return this.fallbackReadDir(virtualPath);
	}

	async readDirWithTypes(pathValue: string): Promise<VirtualDirEntry[]> {
		const virtualPath = normalizeOverlayPath(pathValue);
		if (
			this.isSyntheticPath(virtualPath) ||
			startsWithPath(virtualPath, SANDBOX_NODE_MODULES_ROOT)
		) {
			const entries = await this.readMergedDir(virtualPath);
			return Array.from(entries.entries())
				.map(([name, isDirectory]) => ({ name, isDirectory }))
				.sort((left, right) => left.name.localeCompare(right.name));
		}
		return this.fallbackReadDirWithTypes(virtualPath);
	}

	async writeFile(pathValue: string, content: string | Uint8Array): Promise<void> {
		const virtualPath = normalizeOverlayPath(pathValue);
		if (this.isReadOnlyProjectionPath(virtualPath)) {
			throw createEaccesError("write", virtualPath);
		}
		return this.fallbackWriteFile(virtualPath, content);
	}

	async createDir(pathValue: string): Promise<void> {
		const virtualPath = normalizeOverlayPath(pathValue);
		if (this.isReadOnlyProjectionPath(virtualPath)) {
			throw createEaccesError("mkdir", virtualPath);
		}
		return this.fallbackCreateDir(virtualPath);
	}

	async mkdir(pathValue: string): Promise<void> {
		const virtualPath = normalizeOverlayPath(pathValue);
		if (this.isReadOnlyProjectionPath(virtualPath)) {
			throw createEaccesError("mkdir", virtualPath);
		}
		return this.fallbackMkdir(virtualPath);
	}

	async exists(pathValue: string): Promise<boolean> {
		const virtualPath = normalizeOverlayPath(pathValue);
		if (this.isSyntheticPath(virtualPath)) {
			return true;
		}

		const hostPath = await this.resolveOverlayHostPath(virtualPath, "access");
		if (hostPath) {
			return true;
		}
		if (startsWithPath(virtualPath, SANDBOX_NODE_MODULES_ROOT)) {
			return false;
		}
		return this.fallbackExists(virtualPath);
	}

	async stat(pathValue: string): Promise<VirtualStat> {
		const virtualPath = normalizeOverlayPath(pathValue);
		if (this.isSyntheticPath(virtualPath)) {
			const hostPath = await this.resolveOverlayHostPath(virtualPath, "stat");
			if (!hostPath) {
				return createVirtualDirStat();
			}
		}

		const hostPath = await this.resolveOverlayHostPath(virtualPath, "stat");
		if (hostPath) {
			const info = await fs.stat(hostPath);
			return {
				mode: info.mode,
				size: info.size,
				isDirectory: info.isDirectory(),
				atimeMs: info.atimeMs,
				mtimeMs: info.mtimeMs,
				ctimeMs: info.ctimeMs,
				birthtimeMs: info.birthtimeMs,
			};
		}
		if (startsWithPath(virtualPath, SANDBOX_NODE_MODULES_ROOT)) {
			throw createEnoentError("stat", virtualPath);
		}
		return this.fallbackStat(virtualPath);
	}

	async removeFile(pathValue: string): Promise<void> {
		const virtualPath = normalizeOverlayPath(pathValue);
		if (this.isReadOnlyProjectionPath(virtualPath)) {
			throw createEaccesError("unlink", virtualPath);
		}
		return this.fallbackRemoveFile(virtualPath);
	}

	async removeDir(pathValue: string): Promise<void> {
		const virtualPath = normalizeOverlayPath(pathValue);
		if (this.isReadOnlyProjectionPath(virtualPath)) {
			throw createEaccesError("rmdir", virtualPath);
		}
		return this.fallbackRemoveDir(virtualPath);
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const oldVirtualPath = normalizeOverlayPath(oldPath);
		const newVirtualPath = normalizeOverlayPath(newPath);
		if (
			this.isReadOnlyProjectionPath(oldVirtualPath) ||
			this.isReadOnlyProjectionPath(newVirtualPath)
		) {
			throw createEaccesError("rename", `${oldVirtualPath} -> ${newVirtualPath}`);
		}
		return this.fallbackRename(oldVirtualPath, newVirtualPath);
	}

	async symlink(target: string, linkPath: string): Promise<void> {
		const virtualPath = normalizeOverlayPath(linkPath);
		if (this.isReadOnlyProjectionPath(virtualPath)) {
			throw createEaccesError("symlink", virtualPath);
		}
		if (!this.baseFileSystem) throw createEnoentError("symlink", virtualPath);
		return this.baseFileSystem.symlink(target, virtualPath);
	}

	async readlink(path: string): Promise<string> {
		const virtualPath = normalizeOverlayPath(path);
		if (!this.baseFileSystem) throw createEnoentError("readlink", virtualPath);
		return this.baseFileSystem.readlink(virtualPath);
	}

	async lstat(path: string): Promise<VirtualStat> {
		const virtualPath = normalizeOverlayPath(path);
		if (this.isSyntheticPath(virtualPath)) {
			return createVirtualDirStat();
		}
		const hostPath = await this.resolveOverlayHostPath(virtualPath, "lstat");
		if (hostPath) {
			const info = await fs.lstat(hostPath);
			return {
				mode: info.mode,
				size: info.size,
				isDirectory: info.isDirectory(),
				isSymbolicLink: info.isSymbolicLink(),
				atimeMs: info.atimeMs,
				mtimeMs: info.mtimeMs,
				ctimeMs: info.ctimeMs,
				birthtimeMs: info.birthtimeMs,
			};
		}
		if (startsWithPath(virtualPath, SANDBOX_NODE_MODULES_ROOT)) {
			throw createEnoentError("lstat", virtualPath);
		}
		if (!this.baseFileSystem) throw createEnoentError("lstat", virtualPath);
		return this.baseFileSystem.lstat(virtualPath);
	}

	async link(oldPath: string, newPath: string): Promise<void> {
		const oldVirtualPath = normalizeOverlayPath(oldPath);
		const newVirtualPath = normalizeOverlayPath(newPath);
		if (this.isReadOnlyProjectionPath(newVirtualPath)) {
			throw createEaccesError("link", newVirtualPath);
		}
		if (!this.baseFileSystem) throw createEnoentError("link", oldVirtualPath);
		return this.baseFileSystem.link(oldVirtualPath, newVirtualPath);
	}

	async chmod(path: string, mode: number): Promise<void> {
		const virtualPath = normalizeOverlayPath(path);
		if (this.isReadOnlyProjectionPath(virtualPath)) {
			throw createEaccesError("chmod", virtualPath);
		}
		if (!this.baseFileSystem) throw createEnoentError("chmod", virtualPath);
		return this.baseFileSystem.chmod(virtualPath, mode);
	}

	async chown(path: string, uid: number, gid: number): Promise<void> {
		const virtualPath = normalizeOverlayPath(path);
		if (this.isReadOnlyProjectionPath(virtualPath)) {
			throw createEaccesError("chown", virtualPath);
		}
		if (!this.baseFileSystem) throw createEnoentError("chown", virtualPath);
		return this.baseFileSystem.chown(virtualPath, uid, gid);
	}

	async utimes(path: string, atime: number, mtime: number): Promise<void> {
		const virtualPath = normalizeOverlayPath(path);
		if (this.isReadOnlyProjectionPath(virtualPath)) {
			throw createEaccesError("utimes", virtualPath);
		}
		if (!this.baseFileSystem) throw createEnoentError("utimes", virtualPath);
		return this.baseFileSystem.utimes(virtualPath, atime, mtime);
	}

	async truncate(path: string, length: number): Promise<void> {
		const virtualPath = normalizeOverlayPath(path);
		if (this.isReadOnlyProjectionPath(virtualPath)) {
			throw createEaccesError("truncate", virtualPath);
		}
		if (!this.baseFileSystem) throw createEnoentError("truncate", virtualPath);
		return this.baseFileSystem.truncate(virtualPath, length);
	}
}
