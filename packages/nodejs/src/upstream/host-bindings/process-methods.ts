import os from "node:os";
import type { UpstreamProcessMethodsBinding } from "../types.js";

type HostProcessWithInternals = NodeJS.Process & {
	_rawDebug?: (message: string) => void;
	_getActiveHandles?: () => unknown[];
	_getActiveRequests?: () => unknown[];
	availableMemory?: () => number;
	constrainedMemory?: () => number;
	getActiveResourcesInfo?: () => string[];
	loadEnvFile?: (filePath?: string) => void;
	threadCpuUsage?: (previousValue?: NodeJS.CpuUsage) => NodeJS.CpuUsage;
};

const hostProcess = process as HostProcessWithInternals;
const RESOURCE_USAGE_FIELDS: ReadonlyArray<keyof NodeJS.ResourceUsage> = Object.freeze([
	"userCPUTime",
	"systemCPUTime",
	"maxRSS",
	"sharedMemorySize",
	"unsharedDataSize",
	"unsharedStackSize",
	"minorPageFault",
	"majorPageFault",
	"swappedOut",
	"fsRead",
	"fsWrite",
	"ipcSent",
	"ipcReceived",
	"signalsCount",
	"voluntaryContextSwitches",
	"involuntaryContextSwitches",
]);

function fillCpuUsage(target: Float64Array, value: NodeJS.CpuUsage): void {
	target[0] = value.user;
	target[1] = value.system;
}

function fillMemoryUsage(target: Float64Array, value: NodeJS.MemoryUsage): void {
	target[0] = value.rss;
	target[1] = value.heapTotal;
	target[2] = value.heapUsed;
	target[3] = value.external;
	target[4] = value.arrayBuffers;
}

function fillResourceUsage(
	target: Float64Array,
	value: NodeJS.ResourceUsage,
): void {
	for (const [index, field] of RESOURCE_USAGE_FIELDS.entries()) {
		target[index] = value[field];
	}
}

function fillHrtimeTupleBuffer(
	target: Uint32Array,
	seconds: number,
	nanoseconds: number,
): void {
	const secondsBigInt = BigInt(seconds);
	target[0] = Number((secondsBigInt >> 32n) & 0xffff_ffffn);
	target[1] = Number(secondsBigInt & 0xffff_ffffn);
	target[2] = nanoseconds;
}

function fillHrtimeBigIntBuffer(target: Uint32Array, value: bigint): void {
	new BigUint64Array(target.buffer, 0, 1)[0] = value;
}

function createUnsupportedProcessMethodError(methodName: string): Error {
	const error = new Error(
		`${methodName} is not supported on the replacement runtime process_methods provider`,
	) as Error & {
		code?: string;
	};
	error.code = "ERR_SECURE_EXEC_UNSUPPORTED_PROCESS_METHOD";
	return error;
}

function throwUnsupportedProcessMethod(methodName: string): never {
	throw createUnsupportedProcessMethodError(methodName);
}

function patchProcessObjectShape(
	target: Record<string, unknown>,
	options: {
		cwd: () => string;
		chdir: (directory: string) => void;
		umask: (mask?: number) => number;
		emitWarningSyncCallback?: (...args: unknown[]) => void;
	},
): void {
	const setIfMissing = (key: string, value: unknown): void => {
		if (target[key] !== undefined) {
			return;
		}
		try {
			target[key] = value;
		} catch {
			// Existing process objects can expose non-writable legacy slots.
		}
	};

	setIfMissing("title", hostProcess.title);
	setIfMissing("execPath", hostProcess.execPath);
	setIfMissing("execArgv", [...hostProcess.execArgv]);
	setIfMissing("pid", hostProcess.pid);
	setIfMissing("ppid", hostProcess.ppid);
	setIfMissing("debugPort", process.debugPort);
	setIfMissing("versions", hostProcess.versions);
	setIfMissing("version", hostProcess.version);
	setIfMissing("release", hostProcess.release);
	setIfMissing("features", hostProcess.features);

	if (typeof target.cwd !== "function") {
		target.cwd = options.cwd;
	}
	if (typeof target.chdir !== "function") {
		target.chdir = options.chdir;
	}
	if (typeof target.umask !== "function") {
		target.umask = options.umask;
	}
	if (options.emitWarningSyncCallback) {
		Object.defineProperty(target, "__secureExecEmitWarningSync", {
			value: options.emitWarningSyncCallback,
			configurable: true,
			enumerable: false,
			writable: false,
		});
	}
}

export function createScaffoldProcessMethodsBinding(): UpstreamProcessMethodsBinding {
	const hrtimeBuffer = new Uint32Array(3);
	let currentCwd = process.cwd();
	let currentUmask = process.umask();
	let emitWarningSyncCallback: ((...args: unknown[]) => void) | undefined;

	const binding: UpstreamProcessMethodsBinding = {
		_debugEnd() {
			throwUnsupportedProcessMethod("process._debugEnd()");
		},
		_debugProcess() {
			throwUnsupportedProcessMethod("process._debugProcess()");
		},
		_getActiveHandles() {
			return hostProcess._getActiveHandles?.() ?? [];
		},
		_getActiveRequests() {
			return hostProcess._getActiveRequests?.() ?? [];
		},
		_kill(pid, signal) {
			if (pid !== hostProcess.pid) {
				return os.constants.errno.ESRCH ?? 3;
			}
			if (signal === 0) {
				return 0;
			}
			throw createUnsupportedProcessMethodError(
				`process.kill(${pid}, ${signal})`,
			);
		},
		_rawDebug(message: string) {
			if (typeof hostProcess._rawDebug === "function") {
				hostProcess._rawDebug(String(message));
				return;
			}
			console.error(message);
		},
		abort() {
			throwUnsupportedProcessMethod("process.abort()");
		},
		availableMemory() {
			return typeof hostProcess.availableMemory === "function"
				? hostProcess.availableMemory()
				: os.freemem();
		},
		causeSegfault() {
			throwUnsupportedProcessMethod("process.causeSegfault()");
		},
		chdir(directory: string) {
			currentCwd = directory;
		},
		constrainedMemory() {
			return typeof hostProcess.constrainedMemory === "function"
				? hostProcess.constrainedMemory()
				: Number.MAX_SAFE_INTEGER;
		},
		cpuUsage(values: Float64Array) {
			fillCpuUsage(values, hostProcess.cpuUsage());
		},
		cwd() {
			return currentCwd;
		},
		dlopen() {
			throwUnsupportedProcessMethod("process.dlopen()");
		},
		execve() {
			throwUnsupportedProcessMethod("process.execve()");
		},
		getActiveResourcesInfo() {
			return hostProcess.getActiveResourcesInfo?.() ?? [];
		},
		hrtime() {
			const [seconds, nanoseconds] = hostProcess.hrtime();
			fillHrtimeTupleBuffer(hrtimeBuffer, seconds, nanoseconds);
		},
		hrtimeBigInt() {
			fillHrtimeBigIntBuffer(hrtimeBuffer, hostProcess.hrtime.bigint());
		},
		hrtimeBuffer,
		loadEnvFile(filePath?: string) {
			hostProcess.loadEnvFile?.(filePath);
		},
		memoryUsage(values: Float64Array) {
			fillMemoryUsage(values, hostProcess.memoryUsage());
		},
		patchProcessObject(target: Record<string, unknown>) {
			patchProcessObjectShape(target, {
				cwd: binding.cwd,
				chdir: binding.chdir,
				umask: binding.umask,
				emitWarningSyncCallback,
			});
		},
		reallyExit(code = 0): never {
			const error = new Error(`replacement runtime requested exit ${code}`) as Error & {
				code?: number;
			};
			error.code = code;
			throw error;
		},
		resetStdioForTesting() {},
		resourceUsage(values: Float64Array) {
			fillResourceUsage(values, hostProcess.resourceUsage());
		},
		rss() {
			return hostProcess.memoryUsage.rss();
		},
		setEmitWarningSync(callback: (...args: unknown[]) => void) {
			emitWarningSyncCallback = callback;
		},
		threadCpuUsage(values: Float64Array) {
			const usage =
				typeof hostProcess.threadCpuUsage === "function"
					? hostProcess.threadCpuUsage()
					: hostProcess.cpuUsage();
			fillCpuUsage(values, usage);
		},
		umask(mask?: number) {
			const previous = currentUmask;
			if (typeof mask === "number") {
				currentUmask = mask & 0o777;
			}
			return previous;
		},
		uptime() {
			return hostProcess.uptime();
		},
	};

	return binding;
}
