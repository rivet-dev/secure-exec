import { getRuntimeExposeCustomGlobal } from "../common/global-exposure";

const __runtimeExposeCustomGlobal = getRuntimeExposeCustomGlobal();

// Getter-based delegation: each _fs property resolves globalThis._fsXxx at
// call time, not setup time. This allows snapshot-restored contexts to pick
// up replaced bridge function globals after restore.
const __fsFacade: Record<string, unknown> = {};
Object.defineProperties(__fsFacade, {
	readFile: { get() { return globalThis._fsReadFile; }, enumerable: true },
	writeFile: { get() { return globalThis._fsWriteFile; }, enumerable: true },
	readFileBinary: { get() { return globalThis._fsReadFileBinary; }, enumerable: true },
	writeFileBinary: { get() { return globalThis._fsWriteFileBinary; }, enumerable: true },
	readDir: { get() { return globalThis._fsReadDir; }, enumerable: true },
	mkdir: { get() { return globalThis._fsMkdir; }, enumerable: true },
	rmdir: { get() { return globalThis._fsRmdir; }, enumerable: true },
	exists: { get() { return globalThis._fsExists; }, enumerable: true },
	stat: { get() { return globalThis._fsStat; }, enumerable: true },
	unlink: { get() { return globalThis._fsUnlink; }, enumerable: true },
	rename: { get() { return globalThis._fsRename; }, enumerable: true },
	chmod: { get() { return globalThis._fsChmod; }, enumerable: true },
	chown: { get() { return globalThis._fsChown; }, enumerable: true },
	link: { get() { return globalThis._fsLink; }, enumerable: true },
	symlink: { get() { return globalThis._fsSymlink; }, enumerable: true },
	readlink: { get() { return globalThis._fsReadlink; }, enumerable: true },
	lstat: { get() { return globalThis._fsLstat; }, enumerable: true },
	truncate: { get() { return globalThis._fsTruncate; }, enumerable: true },
	utimes: { get() { return globalThis._fsUtimes; }, enumerable: true },
});

__runtimeExposeCustomGlobal("_fs", __fsFacade);
