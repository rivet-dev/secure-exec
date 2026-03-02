import {
	NodeRuntime,
	createInMemoryFileSystem,
	createNodeDriver,
	createNodeExecutionFactory,
} from "../src/index.js";
import type {
	CommandExecutor,
	NetworkAdapter,
	Permissions,
	RuntimeExecutionDriverFactory,
	RuntimeDriver,
	VirtualFileSystem,
} from "../src/types.js";
import type {
	StdioHook,
	OSConfig,
	ProcessConfig,
	TimingMitigation,
} from "../src/shared/api-types.js";
import type { ModuleAccessOptions } from "../src/node/driver.js";

export function createTestFileSystem(): VirtualFileSystem {
	return createInMemoryFileSystem();
}

export type LegacyNodeRuntimeOptions = {
	driver?: RuntimeDriver;
	executionFactory?: RuntimeExecutionDriverFactory;
	filesystem?: VirtualFileSystem;
	moduleAccess?: ModuleAccessOptions;
	networkAdapter?: NetworkAdapter;
	commandExecutor?: CommandExecutor;
	permissions?: Permissions;
	processConfig?: ProcessConfig;
	osConfig?: OSConfig;
	memoryLimit?: number;
	cpuTimeLimitMs?: number;
	timingMitigation?: TimingMitigation;
	onStdio?: StdioHook;
	payloadLimits?: {
		base64TransferBytes?: number;
		jsonPayloadBytes?: number;
	};
};

export function createTestNodeRuntime(
	options: LegacyNodeRuntimeOptions = {},
): NodeRuntime {
	const {
		driver,
		executionFactory,
		filesystem,
		moduleAccess,
		networkAdapter,
		commandExecutor,
		permissions,
		processConfig,
		osConfig,
		...nodeProcessOptions
	} = options;

	const resolvedDriver = driver
		? {
				...driver,
				runtime: {
					process: {
						...(driver.runtime.process ?? {}),
						...(processConfig ?? {}),
					},
					os: {
						...(driver.runtime.os ?? {}),
						...(osConfig ?? {}),
					},
				},
			}
		: createNodeDriver({
				filesystem,
				moduleAccess,
				networkAdapter,
				commandExecutor,
				permissions,
				processConfig,
				osConfig,
			});
	const resolvedExecutionFactory =
		executionFactory ?? createNodeExecutionFactory();

	return new NodeRuntime({
		...nodeProcessOptions,
		driver: resolvedDriver,
		executionFactory: resolvedExecutionFactory,
	});
}
