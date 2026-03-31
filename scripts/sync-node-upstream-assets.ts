#!/usr/bin/env -S npx tsx

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";

type AssetClassification = "public" | "internal";

type AssetEntry = {
	assetPath: string;
	bytes: number;
	classification: AssetClassification;
	id: string;
	sha256: string;
	sourcePath: string;
};

type VersionMetadata = {
	assetLayoutVersion: 1;
	builtinCount: number;
	gitCommit: string;
	internalBuiltinCount: number;
	ltsCodename: string;
	nodeMajorLine: string;
	nodeVersion: string;
	publicBuiltinCount: number;
	releaseDate: string;
	sourceRef: string;
	upstreamForkRepository: string;
	upstreamRepository: string;
};

type BuiltinManifest = {
	assetLayoutVersion: 1;
	builtins: AssetEntry[];
	gitCommit: string;
	internalBuiltinCount: number;
	nodeVersion: string;
	publicBuiltinCount: number;
};

type PinnedNodeRelease = {
	commit: string;
	forkRepository: string;
	ltsCodename: string;
	releaseDate: string;
	upstreamRepository: string;
	version: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DEFAULT_OUTPUT = resolve(
	ROOT,
	"packages/nodejs/assets/upstream-node",
);

const PINNED_RELEASE: PinnedNodeRelease = {
	version: "v24.14.1",
	commit: "d89bb1b482fa09245c4f2cbb3b5b6a70bea6deaf",
	releaseDate: "2026-03-24",
	ltsCodename: "Krypton",
	upstreamRepository: "https://github.com/nodejs/node",
	forkRepository: "https://github.com/rivet-dev/secure-exec-node",
};

const REQUIRED_BUILTINS = [
	"fs",
	"internal/bootstrap/node",
	"internal/bootstrap/realm",
	"internal/main/eval_string",
	"internal/per_context/domexception",
	"internal/per_context/messageport",
	"internal/per_context/primordials",
	"module",
] as const;

function runGit(cwd: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
	});
}

function normalizeLines(value: string): string[] {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

function assertGitRepository(source: string): void {
	try {
		runGit(source, ["rev-parse", "--show-toplevel"]);
	} catch (error) {
		throw new Error(
			`source path is not a git checkout: ${source}\n${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

function resolveCommit(source: string, sourceRef: string): string {
	try {
		return runGit(source, ["rev-parse", `${sourceRef}^{commit}`]).trim();
	} catch (error) {
		throw new Error(
			`unable to resolve source ref ${sourceRef} in ${source}\n${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

function listSourcePaths(source: string, sourceRef: string): string[] {
	const output = runGit(source, ["ls-tree", "-r", "--name-only", sourceRef, "lib"]);
	return normalizeLines(output).filter(isBuiltinSourcePath);
}

function isBuiltinSourcePath(sourcePath: string): boolean {
	if (!sourcePath.startsWith("lib/")) {
		return false;
	}

	if (!sourcePath.endsWith(".js")) {
		return false;
	}

	return true;
}

function toBuiltinId(sourcePath: string): string {
	return sourcePath.replace(/^lib\//, "").replace(/\.js$/, "");
}

function toAssetPath(sourcePath: string): string {
	if (sourcePath.startsWith("lib/internal/")) {
		return sourcePath.replace(/^lib\/internal\//, "internal/");
	}

	return sourcePath;
}

function classifyBuiltin(sourcePath: string): AssetClassification {
	return sourcePath.startsWith("lib/internal/") ? "internal" : "public";
}

function readSourceFile(source: string, sourceRef: string, sourcePath: string): string {
	return execFileSync("git", ["show", `${sourceRef}:${sourcePath}`], {
		cwd: source,
		encoding: "utf8",
		maxBuffer: 16 * 1024 * 1024,
	});
}

function sha256(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function createManifest(
	source: string,
	sourceRef: string,
	sourcePaths: string[],
	release: PinnedNodeRelease,
): {
	manifest: BuiltinManifest;
	metadata: VersionMetadata;
	files: Map<string, string>;
} {
	const files = new Map<string, string>();
	const builtins: AssetEntry[] = [];

	for (const sourcePath of sourcePaths) {
		const content = readSourceFile(source, sourceRef, sourcePath);
		const assetPath = toAssetPath(sourcePath);
		const classification = classifyBuiltin(sourcePath);
		const entry: AssetEntry = {
			id: toBuiltinId(sourcePath),
			sourcePath,
			assetPath,
			classification,
			sha256: sha256(content),
			bytes: Buffer.byteLength(content),
		};

		files.set(assetPath, content);
		builtins.push(entry);
	}

	builtins.sort((left, right) => left.id.localeCompare(right.id));

	for (const builtinId of REQUIRED_BUILTINS) {
		if (!builtins.some((entry) => entry.id === builtinId)) {
			throw new Error(`missing required builtin ${builtinId}`);
		}
	}

	const publicBuiltinCount = builtins.filter(
		(entry) => entry.classification === "public",
	).length;
	const internalBuiltinCount = builtins.length - publicBuiltinCount;

	const metadata: VersionMetadata = {
		assetLayoutVersion: 1,
		nodeVersion: release.version,
		nodeMajorLine: release.version.replace(/^v(\d+).*/, "v$1"),
		releaseDate: release.releaseDate,
		ltsCodename: release.ltsCodename,
		gitCommit: release.commit,
		sourceRef,
		upstreamRepository: release.upstreamRepository,
		upstreamForkRepository: release.forkRepository,
		builtinCount: builtins.length,
		publicBuiltinCount,
		internalBuiltinCount,
	};

	const manifest: BuiltinManifest = {
		assetLayoutVersion: 1,
		nodeVersion: release.version,
		gitCommit: release.commit,
		publicBuiltinCount,
		internalBuiltinCount,
		builtins,
	};

	return { manifest, metadata, files };
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function materializeOutput(
	outputDir: string,
	metadata: VersionMetadata,
	manifest: BuiltinManifest,
	files: Map<string, string>,
): void {
	rmSync(outputDir, { recursive: true, force: true });
	mkdirSync(outputDir, { recursive: true });

	writeJson(join(outputDir, "VERSION.json"), metadata);
	writeJson(join(outputDir, "builtin-manifest.json"), manifest);

	for (const [assetPath, content] of files) {
		const absolutePath = join(outputDir, assetPath);
		mkdirSync(dirname(absolutePath), { recursive: true });
		writeFileSync(absolutePath, content);
	}
}

function listFilesRecursive(root: string): string[] {
	if (!existsSync(root)) {
		return [];
	}

	const files: string[] = [];
	const stack = [root];

	while (stack.length > 0) {
		const current = stack.pop()!;
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const absolutePath = join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(absolutePath);
				continue;
			}
			files.push(relative(root, absolutePath));
		}
	}

	return files.sort();
}

function compareOutput(expectedDir: string, actualDir: string): void {
	const expectedFiles = listFilesRecursive(expectedDir);
	const actualFiles = listFilesRecursive(actualDir);

	if (expectedFiles.length !== actualFiles.length) {
		throw new Error(
			`asset file count mismatch: expected ${expectedFiles.length}, found ${actualFiles.length}`,
		);
	}

	for (let index = 0; index < expectedFiles.length; index += 1) {
		if (expectedFiles[index] !== actualFiles[index]) {
			throw new Error(
				`asset file mismatch: expected ${expectedFiles[index] ?? "<missing>"}, found ${actualFiles[index] ?? "<missing>"}`,
			);
		}
	}

	for (const file of expectedFiles) {
		const expected = readFileSync(join(expectedDir, file), "utf8");
		const actual = readFileSync(join(actualDir, file), "utf8");
		if (expected !== actual) {
			throw new Error(`asset content mismatch for ${file}`);
		}
	}
}

function printSummary(
	mode: "check" | "write",
	outputDir: string,
	metadata: VersionMetadata,
): void {
	console.log(
		JSON.stringify(
			{
				mode,
				outputDir,
				nodeVersion: metadata.nodeVersion,
				gitCommit: metadata.gitCommit,
				sourceRef: metadata.sourceRef,
				builtinCount: metadata.builtinCount,
				publicBuiltinCount: metadata.publicBuiltinCount,
				internalBuiltinCount: metadata.internalBuiltinCount,
			},
			null,
			2,
		),
	);
}

const { values } = parseArgs({
	options: {
		source: {
			type: "string",
		},
		output: {
			type: "string",
			default: DEFAULT_OUTPUT,
		},
		"source-ref": {
			type: "string",
			default: PINNED_RELEASE.commit,
		},
		check: {
			type: "boolean",
			default: false,
		},
		"expected-version": {
			type: "string",
			default: PINNED_RELEASE.version,
		},
		"expected-commit": {
			type: "string",
			default: PINNED_RELEASE.commit,
		},
		"expected-release-date": {
			type: "string",
			default: PINNED_RELEASE.releaseDate,
		},
		"expected-lts-codename": {
			type: "string",
			default: PINNED_RELEASE.ltsCodename,
		},
		"expected-upstream-repo": {
			type: "string",
			default: PINNED_RELEASE.upstreamRepository,
		},
		"expected-fork-repo": {
			type: "string",
			default: PINNED_RELEASE.forkRepository,
		},
	},
});

if (!values.source) {
	console.error("--source is required");
	process.exit(1);
}

const source = resolve(values.source);
const outputDir = resolve(values.output);
const sourceRef = values["source-ref"]!;
const release: PinnedNodeRelease = {
	version: values["expected-version"]!,
	commit: values["expected-commit"]!,
	releaseDate: values["expected-release-date"]!,
	ltsCodename: values["expected-lts-codename"]!,
	upstreamRepository: values["expected-upstream-repo"]!,
	forkRepository: values["expected-fork-repo"]!,
};

try {
	assertGitRepository(source);

	const resolvedCommit = resolveCommit(source, sourceRef);
	if (resolvedCommit !== release.commit) {
		throw new Error(
			`source ref ${sourceRef} resolved to ${resolvedCommit}, expected ${release.commit}. Fetch the pinned release into the local fork checkout before syncing.`,
		);
	}

	const sourcePaths = listSourcePaths(source, sourceRef);
	if (sourcePaths.length === 0) {
		throw new Error(`no builtin source files found under lib/ at ${sourceRef}`);
	}

	const { manifest, metadata, files } = createManifest(
		source,
		sourceRef,
		sourcePaths,
		release,
	);
	const tempDir = mkdtempSync(join(tmpdir(), "secure-exec-node-assets-"));

	try {
		materializeOutput(tempDir, metadata, manifest, files);

		if (values.check) {
			compareOutput(tempDir, outputDir);
			printSummary("check", outputDir, metadata);
		} else {
			materializeOutput(outputDir, metadata, manifest, files);
			printSummary("write", outputDir, metadata);
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
