import type { VirtualFileSystem, VirtualStat } from "../kernel/vfs.js";

const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

function normalizePath(path: string): string {
	if (!path) return "/";
	let normalized = path.startsWith("/") ? path : `/${path}`;
	normalized = normalized.replace(/\/+/g, "/");
	if (normalized.length > 1 && normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
}

function splitPath(path: string): string[] {
	const normalized = normalizePath(path);
	return normalized === "/" ? [] : normalized.slice(1).split("/");
}

function dirname(path: string): string {
	const parts = splitPath(path);
	if (parts.length <= 1) return "/";
	return `/${parts.slice(0, -1).join("/")}`;
}

/**
 * A fully in-memory VirtualFileSystem backed by Maps.
 * Used as the default filesystem for the browser sandbox and for tests.
 * Paths are always POSIX-style (forward slashes, rooted at "/").
 */
export class InMemoryFileSystem implements VirtualFileSystem {
	private files = new Map<string, Uint8Array>();
	private dirs = new Set<string>(["/"]);
	private symlinks = new Map<string, string>();
	private modes = new Map<string, number>();
	private owners = new Map<string, { uid: number; gid: number }>();
	private timestamps = new Map<string, { atimeMs: number; mtimeMs: number }>();
	private hardLinks = new Map<string, string>(); // newPath → originalPath

	private listDirEntries(
		path: string,
	): Array<{ name: string; isDirectory: boolean }> {
		const normalized = normalizePath(path);
		if (!this.dirs.has(normalized)) {
			throw new Error(
				`ENOENT: no such file or directory, scandir '${normalized}'`,
			);
		}
		const prefix = normalized === "/" ? "/" : `${normalized}/`;
		const entries = new Map<string, boolean>();
		for (const filePath of this.files.keys()) {
			if (filePath.startsWith(prefix)) {
				const rest = filePath.slice(prefix.length);
				if (rest && !rest.includes("/")) {
					entries.set(rest, false);
				}
			}
		}
		for (const dirPath of this.dirs.values()) {
			if (dirPath.startsWith(prefix)) {
				const rest = dirPath.slice(prefix.length);
				if (rest && !rest.includes("/")) {
					entries.set(rest, true);
				}
			}
		}
		return Array.from(entries.entries()).map(([name, isDirectory]) => ({
			name,
			isDirectory,
		}));
	}

	async readFile(path: string): Promise<Uint8Array> {
		const normalized = normalizePath(path);
		const data = this.files.get(normalized);
		if (!data) {
			throw new Error(`ENOENT: no such file or directory, open '${normalized}'`);
		}
		return data;
	}

	async readTextFile(path: string): Promise<string> {
		const data = await this.readFile(path);
		return new TextDecoder().decode(data);
	}

	async readDir(path: string): Promise<string[]> {
		return this.listDirEntries(path).map((entry) => entry.name);
	}

	async readDirWithTypes(
		path: string,
	): Promise<Array<{ name: string; isDirectory: boolean }>> {
		return this.listDirEntries(path);
	}

	async writeFile(path: string, content: string | Uint8Array): Promise<void> {
		const normalized = normalizePath(path);
		await this.mkdir(dirname(normalized));
		const data =
			typeof content === "string" ? new TextEncoder().encode(content) : content;
		this.files.set(normalized, data);
	}

	async createDir(path: string): Promise<void> {
		const normalized = normalizePath(path);
		const parent = dirname(normalized);
		if (!this.dirs.has(parent)) {
			throw new Error(`ENOENT: no such file or directory, mkdir '${normalized}'`);
		}
		this.dirs.add(normalized);
	}

	async mkdir(path: string, _options?: { recursive?: boolean }): Promise<void> {
		const parts = splitPath(path);
		let current = "";
		for (const part of parts) {
			current += `/${part}`;
			if (!this.dirs.has(current)) {
				this.dirs.add(current);
			}
		}
	}

	private resolveSymlink(normalized: string, maxDepth = 16): string {
		let current = normalized;
		for (let i = 0; i < maxDepth; i++) {
			const target = this.symlinks.get(current);
			if (!target) return current;
			current = target.startsWith("/") ? normalizePath(target) : normalizePath(`${dirname(current)}/${target}`);
		}
		throw new Error(`ELOOP: too many levels of symbolic links, stat '${normalized}'`);
	}

	private statEntry(normalized: string): VirtualStat {
		const now = Date.now();
		const ts = this.timestamps.get(normalized);
		const owner = this.owners.get(normalized);
		const customMode = this.modes.get(normalized);
		const atimeMs = ts?.atimeMs ?? now;
		const mtimeMs = ts?.mtimeMs ?? now;

		const file = this.files.get(normalized);
		if (file) {
			return {
				mode: customMode ?? (S_IFREG | 0o644),
				size: file.byteLength,
				isDirectory: false,
				isSymbolicLink: false,
				atimeMs,
				mtimeMs,
				ctimeMs: now,
				birthtimeMs: now,
				ino: 0,
				nlink: 1,
				uid: owner?.uid ?? 0,
				gid: owner?.gid ?? 0,
			};
		}
		if (this.dirs.has(normalized)) {
			return {
				mode: customMode ?? (S_IFDIR | 0o755),
				size: 4096,
				isDirectory: true,
				isSymbolicLink: false,
				atimeMs,
				mtimeMs,
				ctimeMs: now,
				birthtimeMs: now,
				ino: 0,
				nlink: 2,
				uid: owner?.uid ?? 0,
				gid: owner?.gid ?? 0,
			};
		}
		throw new Error(`ENOENT: no such file or directory, stat '${normalized}'`);
	}

	async exists(path: string): Promise<boolean> {
		const normalized = normalizePath(path);
		if (this.symlinks.has(normalized)) {
			try {
				this.resolveSymlink(normalized);
				return true;
			} catch {
				return false;
			}
		}
		return this.files.has(normalized) || this.dirs.has(normalized);
	}

	async stat(path: string): Promise<VirtualStat> {
		const normalized = normalizePath(path);
		const resolved = this.resolveSymlink(normalized);
		return this.statEntry(resolved);
	}

	async removeFile(path: string): Promise<void> {
		const normalized = normalizePath(path);
		if (!this.files.delete(normalized)) {
			throw new Error(`ENOENT: no such file or directory, unlink '${normalized}'`);
		}
	}

	async removeDir(path: string): Promise<void> {
		const normalized = normalizePath(path);
		if (normalized === "/") {
			throw new Error("EPERM: operation not permitted, rmdir '/'");
		}
		if (!this.dirs.has(normalized)) {
			throw new Error(`ENOENT: no such file or directory, rmdir '${normalized}'`);
		}
		const prefix = normalized.endsWith("/") ? normalized : `${normalized}/`;
		for (const filePath of this.files.keys()) {
			if (filePath.startsWith(prefix)) {
				throw new Error(`ENOTEMPTY: directory not empty, rmdir '${normalized}'`);
			}
		}
		for (const dirPath of this.dirs.values()) {
			if (dirPath !== normalized && dirPath.startsWith(prefix)) {
				throw new Error(`ENOTEMPTY: directory not empty, rmdir '${normalized}'`);
			}
		}
		this.dirs.delete(normalized);
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const oldNormalized = normalizePath(oldPath);
		const newNormalized = normalizePath(newPath);
		if (oldNormalized === newNormalized) {
			return;
		}

		if (!this.dirs.has(dirname(newNormalized))) {
			throw new Error(
				`ENOENT: no such file or directory, rename '${oldNormalized}' -> '${newNormalized}'`,
			);
		}

		if (this.files.has(oldNormalized)) {
			if (this.dirs.has(newNormalized)) {
				throw new Error(
					`EISDIR: illegal operation on a directory, rename '${oldNormalized}' -> '${newNormalized}'`,
				);
			}
			const content = this.files.get(oldNormalized)!;
			this.files.set(newNormalized, content);
			this.files.delete(oldNormalized);
			return;
		}

		if (!this.dirs.has(oldNormalized)) {
			throw new Error(
				`ENOENT: no such file or directory, rename '${oldNormalized}' -> '${newNormalized}'`,
			);
		}
		if (oldNormalized === "/") {
			throw new Error(`EPERM: operation not permitted, rename '${oldNormalized}'`);
		}
		if (newNormalized.startsWith(`${oldNormalized}/`)) {
			throw new Error(
				`EINVAL: invalid argument, rename '${oldNormalized}' -> '${newNormalized}'`,
			);
		}
		if (this.dirs.has(newNormalized) || this.files.has(newNormalized)) {
			throw new Error(
				`EEXIST: file already exists, rename '${oldNormalized}' -> '${newNormalized}'`,
			);
		}

		const sourcePrefix = `${oldNormalized}/`;
		const targetPrefix = `${newNormalized}/`;
		const dirPaths = Array.from(this.dirs.values())
			.filter((path) => path === oldNormalized || path.startsWith(sourcePrefix))
			.sort((a, b) => a.length - b.length);
		const filePaths = Array.from(this.files.keys()).filter((path) =>
			path.startsWith(sourcePrefix),
		);

		for (const path of dirPaths) {
			this.dirs.delete(path);
		}
		for (const path of filePaths) {
			const content = this.files.get(path)!;
			this.files.delete(path);
			this.files.set(`${targetPrefix}${path.slice(sourcePrefix.length)}`, content);
		}

		this.dirs.add(newNormalized);
		for (const path of dirPaths) {
			if (path === oldNormalized) {
				continue;
			}
			this.dirs.add(`${targetPrefix}${path.slice(sourcePrefix.length)}`);
		}
	}

	async symlink(target: string, linkPath: string): Promise<void> {
		const normalized = normalizePath(linkPath);
		if (this.files.has(normalized) || this.dirs.has(normalized) || this.symlinks.has(normalized)) {
			throw new Error(`EEXIST: file already exists, symlink '${target}' -> '${normalized}'`);
		}
		await this.mkdir(dirname(normalized));
		this.symlinks.set(normalized, target);
	}

	async readlink(path: string): Promise<string> {
		const normalized = normalizePath(path);
		const target = this.symlinks.get(normalized);
		if (target === undefined) {
			throw new Error(`EINVAL: invalid argument, readlink '${normalized}'`);
		}
		return target;
	}

	async lstat(path: string): Promise<VirtualStat> {
		const normalized = normalizePath(path);
		const target = this.symlinks.get(normalized);
		if (target !== undefined) {
			const now = Date.now();
			return {
				mode: S_IFLNK | 0o777,
				size: new TextEncoder().encode(target).byteLength,
				isDirectory: false,
				isSymbolicLink: true,
				atimeMs: now,
				mtimeMs: now,
				ctimeMs: now,
				birthtimeMs: now,
				ino: 0,
				nlink: 1,
				uid: 0,
				gid: 0,
			};
		}
		return this.statEntry(normalized);
	}

	async link(oldPath: string, newPath: string): Promise<void> {
		const oldNormalized = normalizePath(oldPath);
		const newNormalized = normalizePath(newPath);
		const file = this.files.get(oldNormalized);
		if (!file) {
			throw new Error(`ENOENT: no such file or directory, link '${oldNormalized}' -> '${newNormalized}'`);
		}
		if (this.files.has(newNormalized) || this.dirs.has(newNormalized)) {
			throw new Error(`EEXIST: file already exists, link '${oldNormalized}' -> '${newNormalized}'`);
		}
		await this.mkdir(dirname(newNormalized));
		this.files.set(newNormalized, file);
		this.hardLinks.set(newNormalized, oldNormalized);
	}

	async chmod(path: string, mode: number): Promise<void> {
		const normalized = normalizePath(path);
		const resolved = this.resolveSymlink(normalized);
		if (!this.files.has(resolved) && !this.dirs.has(resolved)) {
			throw new Error(`ENOENT: no such file or directory, chmod '${normalized}'`);
		}
		const existing = this.modes.get(resolved);
		const typeBits = existing ? (existing & 0o170000) : (this.files.has(resolved) ? S_IFREG : S_IFDIR);
		this.modes.set(resolved, typeBits | (mode & 0o7777));
	}

	async chown(path: string, uid: number, gid: number): Promise<void> {
		const normalized = normalizePath(path);
		const resolved = this.resolveSymlink(normalized);
		if (!this.files.has(resolved) && !this.dirs.has(resolved)) {
			throw new Error(`ENOENT: no such file or directory, chown '${normalized}'`);
		}
		this.owners.set(resolved, { uid, gid });
	}

	async utimes(path: string, atime: number, mtime: number): Promise<void> {
		const normalized = normalizePath(path);
		const resolved = this.resolveSymlink(normalized);
		if (!this.files.has(resolved) && !this.dirs.has(resolved)) {
			throw new Error(`ENOENT: no such file or directory, utimes '${normalized}'`);
		}
		this.timestamps.set(resolved, { atimeMs: atime * 1000, mtimeMs: mtime * 1000 });
	}

	async realpath(path: string): Promise<string> {
		const normalized = normalizePath(path);
		const resolved = this.resolveSymlink(normalized);
		if (!this.files.has(resolved) && !this.dirs.has(resolved)) {
			throw new Error(`ENOENT: no such file or directory, realpath '${normalized}'`);
		}
		return resolved;
	}

	async pread(path: string, offset: number, length: number): Promise<Uint8Array> {
		const data = await this.readFile(path);
		return data.slice(offset, offset + length);
	}

	async truncate(path: string, length: number): Promise<void> {
		const normalized = normalizePath(path);
		const resolved = this.resolveSymlink(normalized);
		const file = this.files.get(resolved);
		if (!file) {
			throw new Error(`ENOENT: no such file or directory, truncate '${normalized}'`);
		}
		if (length >= file.byteLength) {
			const padded = new Uint8Array(length);
			padded.set(file);
			this.files.set(resolved, padded);
		} else {
			this.files.set(resolved, file.slice(0, length));
		}
	}
}

export function createInMemoryFileSystem(): InMemoryFileSystem {
	return new InMemoryFileSystem();
}
