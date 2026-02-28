const __runtimeExposeMutableGlobal =
	typeof (globalThis as Record<string, unknown>).__runtimeExposeMutableGlobal ===
	"function"
		? ((globalThis as Record<string, unknown>).__runtimeExposeMutableGlobal as (
				name: string,
				value: unknown,
		  ) => void)
		: (name: string, value: unknown) => {
				Object.defineProperty(globalThis, name, {
					value,
					writable: true,
					configurable: true,
					enumerable: true,
				});
		  };

const __commonJsFileConfig =
	((globalThis as Record<string, unknown>).__runtimeCommonJsFileConfig as {
		filePath?: string;
		dirname?: string;
	}) ?? {};

const __filePath =
	typeof __commonJsFileConfig.filePath === "string"
		? __commonJsFileConfig.filePath
		: "/<entry>.js";
const __dirname =
	typeof __commonJsFileConfig.dirname === "string"
		? __commonJsFileConfig.dirname
		: "/";

__runtimeExposeMutableGlobal("__filename", __filePath);
__runtimeExposeMutableGlobal("__dirname", __dirname);

const __currentModule = (globalThis as Record<string, unknown>)._currentModule as
	| Record<string, unknown>
	| undefined;
if (__currentModule) {
	__currentModule.dirname = __dirname;
	__currentModule.filename = __filePath;
}
