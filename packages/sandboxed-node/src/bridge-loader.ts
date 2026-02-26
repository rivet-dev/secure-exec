import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cache the bridge code
let bridgeCodeCache: string | null = null;

function findBridgeSourcePath(): string | null {
	const candidates = [
		path.join(__dirname, "bridge", "index.ts"),
		path.join(__dirname, "..", "src", "bridge", "index.ts"),
	];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}

function ensureBridgeBundle(bridgePath: string): void {
	if (fs.existsSync(bridgePath)) return;

	const sourcePath = findBridgeSourcePath();
	if (!sourcePath) {
		throw new Error(
			"bridge.js not found and source is unavailable. Run `pnpm -C packages/sandboxed-node build:bridge`.",
		);
	}

	fs.mkdirSync(path.dirname(bridgePath), { recursive: true });
	const result = esbuild.buildSync({
		entryPoints: [sourcePath],
		bundle: true,
		format: "iife",
		globalName: "bridge",
		outfile: bridgePath,
	});
	if (result.errors.length > 0) {
		throw new Error(`Failed to build bridge.js: ${result.errors[0].text}`);
	}
}

/**
 * Get the raw compiled bridge.js code.
 * This is the IIFE that creates the global `bridge` object.
 */
export function getRawBridgeCode(): string {
	if (!bridgeCodeCache) {
		const bridgePath = path.join(__dirname, "..", "dist", "bridge.js");
		ensureBridgeBundle(bridgePath);
		bridgeCodeCache = fs.readFileSync(bridgePath, "utf8");
	}
	return bridgeCodeCache;
}

/**
 * Get the fs module code that can be injected into an isolate.
 * This returns the compiled JavaScript code as a string wrapped in an IIFE.
 */
export function getFsModuleCode(): string {
	const code = getRawBridgeCode();

	// The compiled code creates a global `bridge` variable with the module exports
	// bridge = { default: fs, fs: fs }
	// We need to wrap it to return the default export (which is the fs module)
	return `(function() {
${code}
  globalThis.bridge = bridge;
  return bridge.default;
})()`;
}

/**
 * Get the entire bridge module with all exports.
 * Returns code that evaluates to the bridge object containing:
 * - fs, os, childProcess, process, module, network
 * - setupGlobals, URL, URLSearchParams, Buffer, etc.
 */
export function getBridgeModuleCode(): string {
	const code = getRawBridgeCode();

	return `(function() {
${code}
  globalThis.bridge = bridge;
  return bridge;
})()`;
}

/**
 * Get code that sets up configuration globals and then loads the bridge.
 * The config is passed as a JSON string to avoid eval issues.
 *
 * @param processConfig - Process configuration (platform, arch, cwd, env, etc.)
 * @param osConfig - OS configuration (platform, arch, hostname, etc.)
 */
export function getBridgeWithConfig(
	processConfig?: {
		platform?: string;
		arch?: string;
		version?: string;
		cwd?: string;
		env?: Record<string, string>;
		argv?: string[];
		execPath?: string;
		pid?: number;
		ppid?: number;
		uid?: number;
		gid?: number;
		stdin?: string;
	},
	osConfig?: {
		platform?: string;
		arch?: string;
		type?: string;
		release?: string;
		version?: string;
		homedir?: string;
		tmpdir?: string;
		hostname?: string;
	},
): string {
	const code = getRawBridgeCode();

	// Set up config globals before loading the bridge
	const configSetup = `
    // Set up configuration globals before bridge loads
    globalThis._processConfig = ${JSON.stringify(processConfig || {})};
    globalThis._osConfig = ${JSON.stringify(osConfig || {})};
  `;

	return `(function() {
${configSetup}
${code}
  globalThis.bridge = bridge;
  return bridge;
})()`;
}

/**
 * The fs module code as a constant string.
 * Use this if you need the code at import time.
 */
export const FS_MODULE_CODE = getFsModuleCode();

export default FS_MODULE_CODE;
