const __runtimeExposeCustomGlobal =
	typeof (globalThis as Record<string, unknown>).__runtimeExposeCustomGlobal ===
	"function"
		? ((globalThis as Record<string, unknown>).__runtimeExposeCustomGlobal as (
				name: string,
				value: unknown,
		  ) => void)
		: (name: string, value: unknown) => {
				Object.defineProperty(globalThis, name, {
					value,
					writable: false,
					configurable: false,
					enumerable: true,
				});
		  };

const __fsFacade = {
	readFile: (globalThis as Record<string, unknown>)._fsReadFile,
	writeFile: (globalThis as Record<string, unknown>)._fsWriteFile,
	readFileBinary: (globalThis as Record<string, unknown>)._fsReadFileBinary,
	writeFileBinary: (globalThis as Record<string, unknown>)._fsWriteFileBinary,
	readDir: (globalThis as Record<string, unknown>)._fsReadDir,
	mkdir: (globalThis as Record<string, unknown>)._fsMkdir,
	rmdir: (globalThis as Record<string, unknown>)._fsRmdir,
	exists: (globalThis as Record<string, unknown>)._fsExists,
	stat: (globalThis as Record<string, unknown>)._fsStat,
	unlink: (globalThis as Record<string, unknown>)._fsUnlink,
	rename: (globalThis as Record<string, unknown>)._fsRename,
};

__runtimeExposeCustomGlobal("_fs", __fsFacade);
