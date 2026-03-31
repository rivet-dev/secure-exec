import os from "node:os";

const RESOURCE_USAGE_FIELDS = Object.freeze([
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
const SIGNAL_NAMES_BY_NUMBER = new Map(
	Object.entries(os.constants.signals).map(([name, value]) => [value, name]),
);

function createUnsupportedProcessMethodError(methodName) {
	const error = new Error(
		`${methodName} is not supported on the replacement runtime process_methods provider`,
	);
	error.code = "ERR_SECURE_EXEC_UNSUPPORTED_PROCESS_METHOD";
	return error;
}

function throwUnsupportedProcessMethod(methodName) {
	throw createUnsupportedProcessMethodError(methodName);
}

function fillCpuUsage(target, value) {
	target[0] = value.user;
	target[1] = value.system;
}

function fillMemoryUsage(target, value) {
	target[0] = value.rss;
	target[1] = value.heapTotal;
	target[2] = value.heapUsed;
	target[3] = value.external;
	target[4] = value.arrayBuffers;
}

function fillResourceUsage(target, value) {
	for (const [index, field] of RESOURCE_USAGE_FIELDS.entries()) {
		target[index] = value[field];
	}
}

function fillHrtimeTupleBuffer(target, seconds, nanoseconds) {
	const secondsBigInt = BigInt(seconds);
	target[0] = Number((secondsBigInt >> 32n) & 0xffff_ffffn);
	target[1] = Number(secondsBigInt & 0xffff_ffffn);
	target[2] = nanoseconds;
}

function fillHrtimeBigIntBuffer(target, value) {
	new BigUint64Array(target.buffer, 0, 1)[0] = value;
}

function patchProcessObjectShape(target, options) {
	const setIfMissing = (key, value) => {
		if (target[key] !== undefined) {
			return;
		}
		try {
			target[key] = value;
		} catch {
			// Existing process objects can expose non-writable legacy slots.
		}
	};

	setIfMissing("title", options.processShim.title);
	setIfMissing("execPath", options.processShim.execPath);
	setIfMissing("execArgv", [...options.processShim.execArgv]);
	setIfMissing("pid", options.processShim.pid);
	setIfMissing("ppid", options.processShim.ppid);
	setIfMissing("debugPort", options.processShim.debugPort);
	setIfMissing("versions", options.processShim.versions);
	setIfMissing("version", options.processShim.version);
	setIfMissing("release", options.processShim.release);
	setIfMissing("features", options.processShim.features);

	if (typeof target.cwd !== "function") {
		target.cwd = options.processShim.cwd;
	}
	if (typeof target.chdir !== "function") {
		target.chdir = options.processShim.chdir;
	}
	if (typeof target.umask !== "function") {
		target.umask = options.processShim.umask;
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

export function createProcessMethodsBinding({
	processShim,
	resetStdioForTesting,
	raiseProcessExit,
	stderrChunks,
	useLiveStdio,
}) {
	const hrtimeBuffer = new Uint32Array(3);
	let emitWarningSyncCallback;

	return {
		_debugEnd() {
			throwUnsupportedProcessMethod("process._debugEnd()");
		},
		_debugProcess() {
			throwUnsupportedProcessMethod("process._debugProcess()");
		},
		_getActiveHandles() {
			return typeof process._getActiveHandles === "function"
				? process._getActiveHandles()
				: [];
		},
		_getActiveRequests() {
			return typeof process._getActiveRequests === "function"
				? process._getActiveRequests()
				: [];
		},
		_kill(pid, signal) {
			if (pid !== processShim.pid) {
				return os.constants.errno.ESRCH ?? 3;
			}
			if (signal === 0) {
				return 0;
			}

			const signalName = SIGNAL_NAMES_BY_NUMBER.get(signal);
			if (!signalName) {
				return os.constants.errno.EINVAL ?? 22;
			}

			if (
				signalName !== "SIGKILL" &&
				signalName !== "SIGSTOP" &&
				processShim.listenerCount(signalName) > 0
			) {
				processShim.emit(signalName, signalName);
				return 0;
			}

			raiseProcessExit(128 + signal);
		},
		_rawDebug(message) {
			const formatted = `${String(message)}${os.EOL}`;
			if (useLiveStdio && typeof process._rawDebug === "function") {
				process._rawDebug(String(message));
				return;
			}
			stderrChunks.push(formatted);
		},
		abort() {
			throwUnsupportedProcessMethod("process.abort()");
		},
		availableMemory() {
			return typeof process.availableMemory === "function"
				? process.availableMemory()
				: os.freemem();
		},
		causeSegfault() {
			throwUnsupportedProcessMethod("process.causeSegfault()");
		},
		chdir(directory) {
			processShim.chdir(directory);
		},
		constrainedMemory() {
			return typeof process.constrainedMemory === "function"
				? process.constrainedMemory()
				: Number.MAX_SAFE_INTEGER;
		},
		cpuUsage(values) {
			fillCpuUsage(values, process.cpuUsage());
		},
		cwd() {
			return processShim.cwd();
		},
		dlopen() {
			throwUnsupportedProcessMethod("process.dlopen()");
		},
		execve() {
			throwUnsupportedProcessMethod("process.execve()");
		},
		getActiveResourcesInfo() {
			return typeof process.getActiveResourcesInfo === "function"
				? process.getActiveResourcesInfo()
				: [];
		},
		hrtime() {
			const [seconds, nanoseconds] = process.hrtime();
			fillHrtimeTupleBuffer(hrtimeBuffer, seconds, nanoseconds);
		},
		hrtimeBigInt() {
			fillHrtimeBigIntBuffer(hrtimeBuffer, process.hrtime.bigint());
		},
		hrtimeBuffer,
		loadEnvFile(filePath) {
			process.loadEnvFile?.(filePath);
		},
		memoryUsage(values) {
			fillMemoryUsage(values, process.memoryUsage());
		},
		patchProcessObject(target) {
			patchProcessObjectShape(target, {
				processShim,
				emitWarningSyncCallback,
			});
		},
		reallyExit(code = 0) {
			raiseProcessExit(code);
		},
		resetStdioForTesting() {
			resetStdioForTesting();
		},
		resourceUsage(values) {
			fillResourceUsage(values, process.resourceUsage());
		},
		rss() {
			return process.memoryUsage.rss();
		},
		setEmitWarningSync(callback) {
			emitWarningSyncCallback = callback;
		},
		threadCpuUsage(values) {
			const usage =
				typeof process.threadCpuUsage === "function"
					? process.threadCpuUsage()
					: process.cpuUsage();
			fillCpuUsage(values, usage);
		},
		umask(mask) {
			return processShim.umask(mask);
		},
		uptime() {
			return process.uptime();
		},
	};
}
