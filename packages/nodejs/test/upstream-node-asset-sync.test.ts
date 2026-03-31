import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");
const syncScriptPath = resolve(ROOT, "scripts/sync-node-upstream-assets.ts");
const committedAssetRoot = resolve(
	ROOT,
	"packages/nodejs/assets/upstream-node",
);

type SyncSummary = {
	builtinCount: number;
	gitCommit: string;
	internalBuiltinCount: number;
	mode: "check" | "write";
	nodeVersion: string;
	outputDir: string;
	publicBuiltinCount: number;
	sourceRef: string;
};

type ManifestEntry = {
	assetPath: string;
	classification: "internal" | "public";
	id: string;
	sourcePath: string;
};

type BuiltinManifest = {
	builtins: ManifestEntry[];
	gitCommit: string;
	internalBuiltinCount: number;
	nodeVersion: string;
	publicBuiltinCount: number;
};

type VersionMetadata = {
	builtinCount: number;
	gitCommit: string;
	internalBuiltinCount: number;
	ltsCodename: string;
	nodeVersion: string;
	publicBuiltinCount: number;
	releaseDate: string;
	sourceRef: string;
	upstreamForkRepository: string;
	upstreamRepository: string;
};

const tempPaths: string[] = [];

afterEach(() => {
	for (const tempPath of tempPaths.splice(0, tempPaths.length)) {
		rmSync(tempPath, { recursive: true, force: true });
	}
});

function createTempDir(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	tempPaths.push(dir);
	return dir;
}

function runSyncScript(args: string[], cwd = ROOT): SyncSummary {
	const stdout = execFileSync(
		process.execPath,
		["--import", "tsx", syncScriptPath, ...args],
		{
			cwd,
			encoding: "utf8",
		},
	);

	return JSON.parse(stdout) as SyncSummary;
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
	}).trim();
}

function writeFile(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

function createFixtureNodeCheckout(): { commit: string; root: string } {
	const root = createTempDir("secure-exec-node-fixture-");

	git(root, "init");
	git(root, "config", "user.name", "Codex");
	git(root, "config", "user.email", "codex@example.com");

	writeFile(join(root, "lib/fs.js"), "module.exports = { openSync() {} };\n");
	writeFile(
		join(root, "lib/module.js"),
		"module.exports = { builtinModules: ['fs'] };\n",
	);
	writeFile(
		join(root, "lib/internal/bootstrap/realm.js"),
		"module.exports = { BuiltinModule: class BuiltinModule {} };\n",
	);
	writeFile(
		join(root, "lib/internal/bootstrap/node.js"),
		"module.exports = { bootstrap() {} };\n",
	);
	writeFile(
		join(root, "lib/internal/main/eval_string.js"),
		"module.exports = function evalString() {};\n",
	);
	writeFile(
		join(root, "lib/internal/per_context/primordials.js"),
		"module.exports = { primordials: true };\n",
	);
	writeFile(
		join(root, "lib/internal/per_context/domexception.js"),
		"module.exports = { DOMException: class DOMException {} };\n",
	);
	writeFile(
		join(root, "lib/internal/per_context/messageport.js"),
		"module.exports = { MessagePort: class MessagePort {} };\n",
	);
	writeFile(join(root, "lib/internal/README.md"), "not a builtin asset\n");
	writeFile(
		join(root, "lib/eslint.config_partial.mjs"),
		"export default [];\n",
	);

	git(root, "add", ".");
	git(root, "commit", "-m", "fixture");

	return {
		root,
		commit: git(root, "rev-parse", "HEAD"),
	};
}

describe("upstream Node asset sync", () => {
	it("exports deterministic builtin assets from a pinned git ref", () => {
		const fixture = createFixtureNodeCheckout();
		const outputDir = createTempDir("secure-exec-node-assets-output-");

		const summary = runSyncScript([
			"--source",
			fixture.root,
			"--source-ref",
			"HEAD",
			"--output",
			outputDir,
			"--expected-version",
			"v0.0.0-test",
			"--expected-commit",
			fixture.commit,
			"--expected-release-date",
			"2026-03-30",
			"--expected-lts-codename",
			"TestLine",
			"--expected-upstream-repo",
			"https://github.com/nodejs/node",
			"--expected-fork-repo",
			"https://github.com/rivet-dev/secure-exec-node",
		]);

		expect(summary).toMatchObject({
			mode: "write",
			nodeVersion: "v0.0.0-test",
			gitCommit: fixture.commit,
			builtinCount: 8,
			publicBuiltinCount: 2,
			internalBuiltinCount: 6,
		});

		const metadata = readJson<VersionMetadata>(join(outputDir, "VERSION.json"));
		const manifest = readJson<BuiltinManifest>(
			join(outputDir, "builtin-manifest.json"),
		);

		expect(metadata).toMatchObject({
			nodeVersion: "v0.0.0-test",
			gitCommit: fixture.commit,
			releaseDate: "2026-03-30",
			ltsCodename: "TestLine",
		});
		expect(manifest.builtins.map((entry) => entry.id)).toEqual([
			"fs",
			"internal/bootstrap/node",
			"internal/bootstrap/realm",
			"internal/main/eval_string",
			"internal/per_context/domexception",
			"internal/per_context/messageport",
			"internal/per_context/primordials",
			"module",
		]);
		expect(manifest.builtins).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "fs",
					assetPath: "lib/fs.js",
					sourcePath: "lib/fs.js",
					classification: "public",
				}),
				expect.objectContaining({
					id: "internal/bootstrap/realm",
					assetPath: "internal/bootstrap/realm.js",
					sourcePath: "lib/internal/bootstrap/realm.js",
					classification: "internal",
				}),
			]),
		);
		expect(existsSync(join(outputDir, "lib/fs.js"))).toBe(true);
		expect(existsSync(join(outputDir, "internal/bootstrap/realm.js"))).toBe(
			true,
		);
		expect(existsSync(join(outputDir, "lib/eslint.config_partial.mjs"))).toBe(
			false,
		);
		expect(existsSync(join(outputDir, "internal/README.md"))).toBe(false);

		const checkSummary = runSyncScript([
			"--source",
			fixture.root,
			"--source-ref",
			"HEAD",
			"--output",
			outputDir,
			"--check",
			"--expected-version",
			"v0.0.0-test",
			"--expected-commit",
			fixture.commit,
			"--expected-release-date",
			"2026-03-30",
			"--expected-lts-codename",
			"TestLine",
			"--expected-upstream-repo",
			"https://github.com/nodejs/node",
			"--expected-fork-repo",
			"https://github.com/rivet-dev/secure-exec-node",
		]);

		expect(checkSummary.mode).toBe("check");
	});

	it("vendors the pinned v24.14.1 builtin asset tree", () => {
		const metadata = readJson<VersionMetadata>(
			join(committedAssetRoot, "VERSION.json"),
		);
		const manifest = readJson<BuiltinManifest>(
			join(committedAssetRoot, "builtin-manifest.json"),
		);

		expect(metadata).toMatchObject({
			nodeVersion: "v24.14.1",
			gitCommit: "d89bb1b482fa09245c4f2cbb3b5b6a70bea6deaf",
			releaseDate: "2026-03-24",
			ltsCodename: "Krypton",
			upstreamRepository: "https://github.com/nodejs/node",
			upstreamForkRepository: "https://github.com/rivet-dev/secure-exec-node",
			builtinCount: 352,
			publicBuiltinCount: 73,
			internalBuiltinCount: 279,
		});
		expect(manifest.nodeVersion).toBe("v24.14.1");
		expect(manifest.gitCommit).toBe("d89bb1b482fa09245c4f2cbb3b5b6a70bea6deaf");
		expect(manifest.builtins).toHaveLength(352);
		expect(manifest.builtins).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "fs",
					assetPath: "lib/fs.js",
					sourcePath: "lib/fs.js",
					classification: "public",
				}),
				expect.objectContaining({
					id: "internal/bootstrap/realm",
					assetPath: "internal/bootstrap/realm.js",
					sourcePath: "lib/internal/bootstrap/realm.js",
					classification: "internal",
				}),
				expect.objectContaining({
					id: "internal/main/eval_string",
					assetPath: "internal/main/eval_string.js",
				}),
			]),
		);
		expect(existsSync(join(committedAssetRoot, "lib/fs.js"))).toBe(true);
		expect(
			existsSync(join(committedAssetRoot, "internal/bootstrap/node.js")),
		).toBe(true);
	});
});
