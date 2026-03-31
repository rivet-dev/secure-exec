import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	HOST_BRIDGE_GLOBAL_KEY_LIST,
	RUNTIME_BRIDGE_GLOBAL_KEY_LIST,
} from "../src/shared/bridge-contract.js";
import { NODE_CUSTOM_GLOBAL_INVENTORY } from "../src/shared/global-exposure.js";

function readSource(relativePath: string): string {
	return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function readCoreSource(relativePath: string): string {
	return readFileSync(
		new URL(`../../core/${relativePath}`, import.meta.url),
		"utf8",
	);
}

function readNodeSource(relativePath: string): string {
	return readFileSync(
		new URL(`../../nodejs/${relativePath}`, import.meta.url),
		"utf8",
	);
}

function readNativeSource(relativePath: string): string {
	return readFileSync(
		new URL(`../../../native/v8-runtime/${relativePath}`, import.meta.url),
		"utf8",
	);
}

describe("bridge registry policy", () => {
	it("keeps canonical bridge key lists represented in custom-global inventory", () => {
		const inventoryNames = new Set(
			NODE_CUSTOM_GLOBAL_INVENTORY.map((entry) => entry.name),
		);
		expect(
			HOST_BRIDGE_GLOBAL_KEY_LIST.filter((key) => !inventoryNames.has(key)),
		).toEqual([]);
		expect(
			RUNTIME_BRIDGE_GLOBAL_KEY_LIST.filter((key) => !inventoryNames.has(key)),
		).toEqual([]);
	});

	it("uses shared host bridge key constants for jail wiring", () => {
		// Jail wiring spans execution-driver.ts facade and extracted modules.
		// Canonical source is in @secure-exec/nodejs.
		const nodeModulePaths = [
			"src/execution-driver.ts",
			"src/bridge-setup.ts",
			"src/bridge-handlers.ts",
		];
		const source = nodeModulePaths.map(readNodeSource).join("\n");
		// Verify HOST_BRIDGE_GLOBAL_KEYS is imported and used (may be aliased as K)
		expect(source).toContain("HOST_BRIDGE_GLOBAL_KEYS");
		expect(source).toMatch(/(?:HOST_BRIDGE_GLOBAL_KEYS|K)\.networkFetchRaw/);
		expect(source).toMatch(/(?:HOST_BRIDGE_GLOBAL_KEYS|K)\.childProcessSpawnStart/);
		expect(source).toMatch(/(?:HOST_BRIDGE_GLOBAL_KEYS|K)\.processConfig/);
		expect(source).toMatch(/(?:HOST_BRIDGE_GLOBAL_KEYS|K)\.log/);

		for (const key of HOST_BRIDGE_GLOBAL_KEY_LIST) {
			expect(source).not.toContain(`jail.set(\"${key}\"`);
		}
	});

	it("keeps bridge modules and isolate runtime declarations coupled to shared contracts", () => {
		const bridgeFiles = [
			"src/bridge/fs.ts",
			"src/bridge/module.ts",
			"src/bridge/process.ts",
			"src/bridge/network.ts",
			"src/bridge/child-process.ts",
		];
		for (const file of bridgeFiles) {
			expect(readNodeSource(file)).toContain("../bridge-contract.js");
		}

		const runtimeGlobals = readCoreSource(
			"isolate-runtime/src/common/runtime-globals.d.ts",
		);
		expect(runtimeGlobals).toContain(
			'from "../../../src/shared/bridge-contract.js"',
		);
	});

	it("keeps native V8 bridge registries aligned for async HTTP server lifecycle hooks", () => {
		const sessionSource = readNativeSource("src/session.rs");

		expect(sessionSource).toContain('"_bridgeDispatch"');
		expect(sessionSource).toContain('"_networkHttpServerRespondRaw"');
		expect(sessionSource).toContain('"_networkHttpServerWaitRaw"');
		expect(sessionSource).toMatch(/SYNC_BRIDGE_FNS:[^]*"_bridgeDispatch"/);
		expect(sessionSource).toMatch(/SYNC_BRIDGE_FNS:[^]*"_networkHttpServerRespondRaw"/);
		expect(sessionSource).toMatch(/ASYNC_BRIDGE_FNS:[^]*"_networkHttpServerWaitRaw"/);
	});
});
