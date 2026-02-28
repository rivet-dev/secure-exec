import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
	return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

describe("isolate runtime injection policy", () => {
	it("avoids template-literal isolate eval snippets in Node runtime loader", () => {
		const indexSource = readSource("src/index.ts");
		expect(indexSource).not.toMatch(/context\.eval\(\s*`/);
		expect(indexSource).not.toContain("${ISOLATE_GLOBAL_EXPOSURE_HELPER_SOURCE}");
		expect(indexSource).toContain('getIsolateRuntimeSource("globalExposureHelpers")');
		expect(indexSource).toContain('getIsolateRuntimeSource("setupDynamicImport")');
		expect(indexSource).toContain('getIsolateRuntimeSource("setupFsFacade")');
		expect(indexSource).toContain('getIsolateRuntimeSource("initCommonjsModuleGlobals")');
	});

	it("keeps bridge/require setup loaders on static isolate-runtime sources", () => {
		const bridgeLoader = readSource("src/bridge-loader.ts");
		const bridgeSetup = readSource("src/bridge-setup.ts");
		const requireSetup = readSource("src/shared/require-setup.ts");

		expect(bridgeLoader).not.toMatch(/return\s*`/);
		expect(bridgeSetup).not.toMatch(/return\s*`/);
		expect(requireSetup).not.toMatch(/return\s*`/);

		expect(bridgeLoader).toContain("getIsolateRuntimeSource");
		expect(bridgeSetup).toContain("getIsolateRuntimeSource");
		expect(requireSetup).toContain('getIsolateRuntimeSource("requireSetup")');
	});

	it("browser worker no longer injects fs module code via code strings", () => {
		const workerSource = readSource("src/browser/worker.ts");
		expect(workerSource).not.toContain("_fsModuleCode");
		expect(workerSource).toContain('getIsolateRuntimeSource("globalExposureHelpers")');
	});
});
