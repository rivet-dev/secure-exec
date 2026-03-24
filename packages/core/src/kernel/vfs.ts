/**
 * Virtual Filesystem interface.
 *
 * POSIX-complete interface that all filesystem backends must implement.
 * Extends the original secure-exec VirtualFileSystem with symlinks,
 * links, permissions, and metadata operations needed by WasmVM's WASI polyfill.
 */

export interface VirtualDirEntry {
	name: string;
	isDirectory: boolean;
	isSymbolicLink?: boolean;
}

export interface VirtualStat {
	mode: number;
	size: number;
	isDirectory: boolean;
	isSymbolicLink: boolean;
	atimeMs: number;
	mtimeMs: number;
	ctimeMs: number;
	birthtimeMs: number;
	ino: number;
	nlink: number;
	uid: number;
	gid: number;
}

export interface VirtualFileSystem {
	// --- Core operations (existing) ---

	readFile(path: string): Promise<Uint8Array>;
	readTextFile(path: string): Promise<string>;
	readDir(path: string): Promise<string[]>;
	readDirWithTypes(path: string): Promise<VirtualDirEntry[]>;
	writeFile(path: string, content: string | Uint8Array): Promise<void>;
	createDir(path: string): Promise<void>;
	mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
	exists(path: string): Promise<boolean>;
	stat(path: string): Promise<VirtualStat>;
	removeFile(path: string): Promise<void>;
	removeDir(path: string): Promise<void>;
	rename(oldPath: string, newPath: string): Promise<void>;
	realpath(path: string): Promise<string>;

	// --- Symlinks ---

	symlink(target: string, linkPath: string): Promise<void>;
	readlink(path: string): Promise<string>;
	lstat(path: string): Promise<VirtualStat>;

	// --- Links ---

	link(oldPath: string, newPath: string): Promise<void>;

	// --- Permissions & Metadata ---

	chmod(path: string, mode: number): Promise<void>;
	chown(path: string, uid: number, gid: number): Promise<void>;
	utimes(path: string, atime: number, mtime: number): Promise<void>;
	truncate(path: string, length: number): Promise<void>;

	// --- Positional read ---

	/** Read a range from a file without loading the entire file into memory. */
	pread(path: string, offset: number, length: number): Promise<Uint8Array>;
}
