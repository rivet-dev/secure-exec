import { describe } from "vitest";
import {
	NodeRuntime,
	allowAllNetwork,
	createBrowserDriver,
	createBrowserRuntimeDriverFactory,
} from "../../src/browser-runtime.js";
import type { NodeRuntimeOptions } from "../../src/browser-runtime.js";
import { runNodeNetworkSuite } from "./node/network.js";
import {
	runNodeSuite,
	type NodeRuntimeTarget,
	type NodeSuiteContext,
} from "./node/runtime.js";

type RuntimeOptions = Omit<NodeRuntimeOptions, "systemDriver" | "runtimeDriverFactory">;
type NodeSharedSuite = (context: NodeSuiteContext) => void;

type DisposableRuntime = {
	dispose(): void;
	terminate(): Promise<void>;
};

const RUNTIME_TARGETS: NodeRuntimeTarget[] = ["node", "browser"];
const NODE_SUITES: NodeSharedSuite[] = [runNodeSuite, runNodeNetworkSuite];
function isNodeTargetAvailable(): boolean {
	return typeof process !== "undefined" && Boolean(process.versions?.node);
}

function isBrowserTargetAvailable(): boolean {
	return typeof window !== "undefined" && typeof Worker !== "undefined";
}

function isTargetAvailable(target: NodeRuntimeTarget): boolean {
	if (target === "node") {
		return isNodeTargetAvailable();
	}
	return isBrowserTargetAvailable();
}

async function importNodeEntrypoint() {
	const entrypointUrl = new URL("../../src/index.js", import.meta.url).href;
	return import(/* @vite-ignore */ entrypointUrl);
}

function createSuiteContext(target: NodeRuntimeTarget): NodeSuiteContext {
	const runtimes = new Set<DisposableRuntime>();

	return {
		target,
		async createRuntime(options: RuntimeOptions = {}) {
			if (target === "node") {
				const {
					NodeRuntime: NodeRuntimeClass,
					createNodeDriver,
					createNodeRuntimeDriverFactory,
				} = await importNodeEntrypoint();
				const runtime = new NodeRuntimeClass({
					...options,
					systemDriver: createNodeDriver({
						useDefaultNetwork: true,
						permissions: allowAllNetwork,
					}),
					runtimeDriverFactory: createNodeRuntimeDriverFactory(),
				});
				runtimes.add(runtime);
				return runtime;
			}

			const systemDriver = await createBrowserDriver({
				filesystem: "memory",
				useDefaultNetwork: true,
				permissions: allowAllNetwork,
			});
			const runtime = new NodeRuntime({
				...options,
				systemDriver,
				runtimeDriverFactory: createBrowserRuntimeDriverFactory({
					workerUrl: new URL("../../src/browser/worker.ts", import.meta.url),
				}),
			});
			runtimes.add(runtime);
			return runtime;
		},
		async teardown(): Promise<void> {
			const runtimeList = Array.from(runtimes);
			runtimes.clear();

			for (const runtime of runtimeList) {
				try {
					await runtime.terminate();
				} catch {
					runtime.dispose();
				}
			}
		},
	};
}

describe("node runtime integration suite", () => {
	for (const target of RUNTIME_TARGETS) {
		const label = `runtime-target:${target}`;
		if (!isTargetAvailable(target)) {
			describe.skip(label, () => {});
			continue;
		}

		const context = createSuiteContext(target);
		describe(label, () => {
			for (const runSuite of NODE_SUITES) {
				runSuite(context);
			}
		});
	}
});
