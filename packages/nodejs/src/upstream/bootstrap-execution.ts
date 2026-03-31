import { existsSync } from "node:fs";
import {
	lstat as lstatHost,
	mkdir as mkdirHost,
	mkdtemp,
	readlink as readHostLink,
	rm,
	symlink as symlinkHost,
	writeFile as writeHostFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deserialize } from "node:v8";
import type {
	DriverProcess,
	ExecOptions,
	ExecResult,
	KernelInterface,
	KernelRuntimeDriver,
	NodeRuntimeDriver,
	NodeRuntimeDriverFactory,
	RunResult,
	RuntimeDriverOptions,
	StdioHook,
	ProcessContext,
	VirtualFileSystem,
} from "@secure-exec/core";
import {
	createResolutionCache,
	resolveModule,
	type ResolutionCache,
} from "../package-bundler.js";

export interface UpstreamBootstrapEvalRequest {
	code?: string;
	filePath?: string;
	hostFilePath?: string;
	resolutionFilePath?: string;
	stageRoot?: string;
	cwd?: string;
	env?: Record<string, string>;
	argv?: string[];
	execArgv?: string[];
	vendoredPublicBuiltins?: string[];
	awaitCompletionSignal?: boolean;
	returnExports?: boolean;
	liveStdio?: boolean;
	stdinIsTTY?: boolean;
	stdoutIsTTY?: boolean;
	stderrIsTTY?: boolean;
	terminalColumns?: number;
	terminalRows?: number;
}

export interface UpstreamBootstrapEvalResult {
	status: "blocked" | "pass";
	summary: string;
	entrypoint?: string;
	code: number;
	stdout: string;
	stderr: string;
	errorMessage?: string;
	stack?: string;
	bootstrapPhases?: string[];
	internalBindings?: string[];
	publicBuiltinFallbacks?: string[];
	vendoredPublicBuiltinsLoaded?: string[];
	fsBackendAbiVersion?: number;
	fsBackendArtifacts?: string[];
	fsBackendOperations?: string[];
	appliedBindingShims?: string[];
	serializedExports?: string;
}

export interface ExperimentalUpstreamBootstrapOptions {
	vendoredPublicBuiltins?: readonly string[];
	awaitCompletionSignal?: boolean;
	awaitCompletionSignalMode?: "always" | "auto";
}

const DEFAULT_RUNNER_TIMEOUT_MS = 20_000;
const textEncoder = new TextEncoder();
const FS_FIRST_LIGHT_PUBLIC_BUILTINS = ["fs"] as const;
const NET_FIRST_LIGHT_PUBLIC_BUILTINS = ["net"] as const;
const READLINE_FIRST_LIGHT_PUBLIC_BUILTINS = [
	"readline",
	"readline/promises",
] as const;
const HTTP_FIRST_LIGHT_PUBLIC_BUILTINS = [
	"net",
	"http",
	"https",
	"_http_agent",
	"_http_client",
	"_http_common",
	"_http_incoming",
	"_http_outgoing",
	"_http_server",
] as const;
const ASYNC_HOOKS_FIRST_LIGHT_PUBLIC_BUILTINS = [
	"async_hooks",
	...HTTP_FIRST_LIGHT_PUBLIC_BUILTINS,
] as const;
const REPLACEMENT_PUBLIC_BUILTINS = [
	"fs",
	...ASYNC_HOOKS_FIRST_LIGHT_PUBLIC_BUILTINS,
	...READLINE_FIRST_LIGHT_PUBLIC_BUILTINS,
] as const;

function getBootstrapRunnerPath(): string {
	return fileURLToPath(
		new URL("../../scripts/run-upstream-node-bootstrap.mjs", import.meta.url),
	);
}

function getBootstrapRunnerEnv(
	extraEnv: Record<string, string> = {},
): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		...extraEnv,
	};
	delete env.NODE_CHANNEL_FD;
	delete env.NODE_UNIQUE_ID;
	return env;
}

function emitBufferedStdio(
	stdout: string,
	stderr: string,
	...hooks: Array<StdioHook | undefined>
): void {
	for (const hook of hooks) {
		if (!hook) {
			continue;
		}
		if (stdout.length > 0) {
			hook({ channel: "stdout", message: stdout });
		}
		if (stderr.length > 0) {
			hook({ channel: "stderr", message: stderr });
		}
	}
}

export async function runUpstreamBootstrapEval(
	request: UpstreamBootstrapEvalRequest,
): Promise<UpstreamBootstrapEvalResult> {
	return new Promise<UpstreamBootstrapEvalResult>((resolve, reject) => {
		const child = spawn(
			process.execPath,
			["--expose-internals", "--no-warnings", getBootstrapRunnerPath()],
			{
				stdio: ["pipe", "pipe", "pipe"],
				env: getBootstrapRunnerEnv(),
			},
		);

		let stdout = "";
		let stderr = "";
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, DEFAULT_RUNNER_TIMEOUT_MS);

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.on("close", (code, signal) => {
			clearTimeout(timeout);
			if (timedOut) {
				reject(
					new Error(
						`upstream bootstrap runner timed out after ${DEFAULT_RUNNER_TIMEOUT_MS}ms`,
					),
				);
				return;
			}

			const trimmed = stdout.trim();
			if (!trimmed) {
				reject(
					new Error(
						`upstream bootstrap runner produced no JSON output (code ${code ?? "unknown"}${signal ? `, signal ${signal}` : ""})${stderr ? `: ${stderr.trim()}` : ""}`,
					),
				);
				return;
			}

			try {
				resolve(JSON.parse(trimmed) as UpstreamBootstrapEvalResult);
			} catch (error) {
				reject(
					new Error(
						`failed to parse upstream bootstrap runner JSON: ${error instanceof Error ? error.message : String(error)}\n${trimmed}`,
					),
				);
			}
		});

		child.stdin.end(JSON.stringify(request));
	});
}

function normalizeVendoredPublicBuiltins(
	values: readonly string[] | undefined,
): string[] {
	if (!values || values.length === 0) {
		return [];
	}
	return [...new Set(values)];
}

function shouldAwaitCompletionSignal(
	mode: "always" | "auto" | undefined,
	code: string,
): boolean {
	if (mode === "always") {
		return true;
	}
	if (mode === "auto") {
		return code.includes("__secureExecDone");
	}
	return false;
}

function parseTerminalDimension(value: string | undefined): number | undefined {
	if (typeof value !== "string" || value.length === 0) {
		return undefined;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function decodeSerializedExports<T>(
	serializedExports: string | undefined,
): T | undefined {
	if (typeof serializedExports !== "string" || serializedExports.length === 0) {
		return undefined;
	}
	return deserialize(Buffer.from(serializedExports, "base64")) as T;
}

interface StagedUpstreamEntry {
	entryFilePath: string;
	logicalEntryPath: string;
	stageRoot?: string;
	cwd?: string;
	cleanup(): Promise<void>;
}

function normalizeVirtualPath(filePath: string, cwd?: string): string {
	if (filePath.startsWith("/")) {
		return path.posix.normalize(filePath);
	}
	return path.posix.normalize(path.posix.join(cwd ?? "/", filePath));
}

function getHostPathForVirtualPath(stageRoot: string, virtualPath: string): string {
	const normalized = path.posix.normalize(virtualPath);
	const relativePath = normalized === "/" ? "" : normalized.slice(1);
	return path.join(stageRoot, relativePath);
}

async function findNearestVirtualPackageRoot(
	filesystem: VirtualFileSystem,
	filePath: string,
): Promise<string | null> {
	let currentDir = path.posix.dirname(path.posix.normalize(filePath));
	while (true) {
		const packageJsonPath =
			currentDir === "/"
				? "/package.json"
				: path.posix.join(currentDir, "package.json");
		if (await filesystem.exists(packageJsonPath)) {
			return currentDir;
		}
		if (currentDir === "/") {
			return null;
		}
		currentDir = path.posix.dirname(currentDir);
	}
}

async function copyVirtualPathToHost(
	filesystem: VirtualFileSystem,
	virtualPath: string,
	stageRoot: string,
): Promise<void> {
	const stat = await lstatVirtualPath(filesystem, virtualPath);
	const hostPath = getHostPathForVirtualPath(stageRoot, virtualPath);

	if (stat.isSymbolicLink) {
		await mkdirHost(path.dirname(hostPath), { recursive: true });
		await symlinkHost(await readVirtualLinkTarget(filesystem, virtualPath), hostPath);
		return;
	}

	if (stat.isDirectory) {
		await mkdirHost(hostPath, { recursive: true });
		return;
	}

	await mkdirHost(path.dirname(hostPath), { recursive: true });
	await writeHostFile(hostPath, await filesystem.readFile(virtualPath));
}

function extractModuleSpecifiers(source: string): string[] {
	const matches = source.matchAll(
		/(?:\brequire\s*\(\s*|(?:\bimport|\bexport)\s+(?:[^"'`]*?\s+from\s+)?|\bimport\s*\(\s*)["']([^"'`]+)["']/g,
	);
	return [...new Set([...matches].map((match) => match[1]).filter(Boolean))];
}

function isRelativeOrAbsoluteSpecifier(specifier: string): boolean {
	return (
		specifier.startsWith("/") ||
		specifier.startsWith("./") ||
		specifier.startsWith("../") ||
		specifier === "." ||
		specifier === ".."
	);
}

function supportsHostPathTranslation(
	filesystem: VirtualFileSystem,
): filesystem is VirtualFileSystem & {
	toHostPath(path: string): string | null;
	toSandboxPath(path: string): string;
} {
	return (
		typeof (filesystem as { toHostPath?: unknown }).toHostPath === "function" &&
		typeof (filesystem as { toSandboxPath?: unknown }).toSandboxPath ===
			"function"
	);
}

async function readVirtualLinkTarget(
	filesystem: VirtualFileSystem,
	virtualPath: string,
): Promise<string> {
	try {
		return await filesystem.readlink(virtualPath);
	} catch (error) {
		if (!supportsHostPathTranslation(filesystem)) {
			throw error;
		}
		const hostPath = filesystem.toHostPath(virtualPath);
		if (!hostPath) {
			throw error;
		}
		return readHostLink(hostPath);
	}
}

async function lstatVirtualPath(
	filesystem: VirtualFileSystem,
	virtualPath: string,
): Promise<Awaited<ReturnType<VirtualFileSystem["lstat"]>>> {
	if (supportsHostPathTranslation(filesystem)) {
		const hostPath = filesystem.toHostPath(virtualPath);
		if (hostPath) {
			try {
				const info = await lstatHost(hostPath);
				return {
					mode: info.mode,
					size: info.size,
					isDirectory: info.isDirectory(),
					isSymbolicLink: info.isSymbolicLink(),
					atimeMs: info.atimeMs,
					mtimeMs: info.mtimeMs,
					ctimeMs: info.ctimeMs,
					birthtimeMs: info.birthtimeMs,
					ino: info.ino,
					nlink: info.nlink,
					uid: info.uid,
					gid: info.gid,
				};
			} catch {
				// Fall back to the VFS view when the host path is not directly readable.
			}
		}
	}
	return filesystem.lstat(virtualPath);
}

async function findPnpmDependencyRoot(
	filesystem: VirtualFileSystem,
	packageRoot: string,
	dependencyName: string,
): Promise<string | null> {
	let currentDir = path.posix.dirname(packageRoot);
	while (true) {
		const pnpmRoot =
			currentDir === "/"
				? "/.pnpm"
				: path.posix.join(currentDir, ".pnpm");
		if (await filesystem.exists(pnpmRoot)) {
			for (const entry of await filesystem.readDirWithTypes(pnpmRoot)) {
				if (!entry.isDirectory) {
					continue;
				}
				const candidateRoot = path.posix.join(
					pnpmRoot,
					entry.name,
					"node_modules",
					...dependencyName.split("/"),
				);
				if (await filesystem.exists(candidateRoot)) {
					return candidateRoot;
				}
			}
		}
		if (currentDir === "/") {
			return null;
		}
		currentDir = path.posix.dirname(currentDir);
	}
}

async function stageNearestVirtualPackageJson(
	filesystem: VirtualFileSystem,
	filePath: string,
	stageRoot: string,
	stagedPaths: Set<string>,
): Promise<void> {
	const packageRoot = await findNearestVirtualPackageRoot(filesystem, filePath);
	if (!packageRoot) {
		return;
	}
	const packageJsonPath =
		packageRoot === "/"
			? "/package.json"
			: path.posix.join(packageRoot, "package.json");
	if (stagedPaths.has(packageJsonPath)) {
		return;
	}
	await copyVirtualPathToHost(filesystem, packageJsonPath, stageRoot);
	stagedPaths.add(packageJsonPath);
}

async function stageVirtualTree(
	filesystem: VirtualFileSystem,
	virtualPath: string,
	stageRoot: string,
	stagedPaths: Set<string>,
	visitedPaths: Set<string>,
): Promise<void> {
	if (visitedPaths.has(virtualPath)) {
		return;
	}
	visitedPaths.add(virtualPath);

	const stat = await lstatVirtualPath(filesystem, virtualPath);
	if (!stagedPaths.has(virtualPath)) {
		await copyVirtualPathToHost(filesystem, virtualPath, stageRoot);
		stagedPaths.add(virtualPath);
	}

	if (stat.isSymbolicLink) {
		const linkTarget = await readVirtualLinkTarget(filesystem, virtualPath);
		const resolvedTarget = linkTarget.startsWith("/")
			? path.posix.normalize(linkTarget)
			: path.posix.resolve(path.posix.dirname(virtualPath), linkTarget);
		try {
			if (await filesystem.exists(resolvedTarget)) {
				await stageVirtualTree(
					filesystem,
					resolvedTarget,
					stageRoot,
					stagedPaths,
					visitedPaths,
				);
			}
		} catch {
			// Ignore unreadable targets so staging mirrors sandbox visibility.
		}
		return;
	}

	if (!stat.isDirectory) {
		return;
	}

	for (const entry of await filesystem.readDirWithTypes(virtualPath)) {
		await stageVirtualTree(
			filesystem,
			path.posix.join(virtualPath, entry.name),
			stageRoot,
			stagedPaths,
			visitedPaths,
		);
	}
}

async function stageResolvedSourceDependency(
	filesystem: VirtualFileSystem,
	resolvedPath: string,
	stageRoot: string,
	stagedPaths: Set<string>,
	visitedFiles: Set<string>,
	visitedPackages: Set<string>,
	resolutionCache: ResolutionCache,
): Promise<void> {
	const packageRoot = await findNearestVirtualPackageRoot(filesystem, resolvedPath);
	if (
		packageRoot &&
		(
			packageRoot === "/node_modules" ||
			packageRoot.startsWith("/node_modules/") ||
			packageRoot.includes("/node_modules/")
		)
	) {
		await stageVirtualPackageRoot(
			filesystem,
			packageRoot,
			stageRoot,
			stagedPaths,
			visitedFiles,
			visitedPackages,
			resolutionCache,
		);
		return;
	}

	await stageVirtualModuleClosure(
		filesystem,
		resolvedPath,
		stageRoot,
		stagedPaths,
		visitedFiles,
		visitedPackages,
		resolutionCache,
	);
}

async function stageVirtualSourceDependencies(
	filesystem: VirtualFileSystem,
	referrerFilePath: string,
	source: string,
	stageRoot: string,
	stagedPaths: Set<string>,
	visitedFiles: Set<string>,
	visitedPackages: Set<string>,
	resolutionCache: ResolutionCache,
): Promise<void> {
	for (const specifier of extractModuleSpecifiers(source)) {
		if (specifier.startsWith("node:")) {
			continue;
		}
		const resolvedDependency = await resolveModule(
			specifier,
			path.posix.dirname(referrerFilePath),
			filesystem,
			"require",
			resolutionCache,
		);
		if (!resolvedDependency || !resolvedDependency.startsWith("/")) {
			continue;
		}

		if (specifier.startsWith("#") || isRelativeOrAbsoluteSpecifier(specifier)) {
			await stageResolvedSourceDependency(
				filesystem,
				resolvedDependency,
				stageRoot,
				stagedPaths,
				visitedFiles,
				visitedPackages,
				resolutionCache,
			);
			continue;
		}

		const packageRoot = await findNearestVirtualPackageRoot(
			filesystem,
			resolvedDependency,
		);
		if (!packageRoot) {
			await stageResolvedSourceDependency(
				filesystem,
				resolvedDependency,
				stageRoot,
				stagedPaths,
				visitedFiles,
				visitedPackages,
				resolutionCache,
			);
			continue;
		}
		await stageVirtualPackageRoot(
			filesystem,
			packageRoot,
			stageRoot,
			stagedPaths,
			visitedFiles,
			visitedPackages,
			resolutionCache,
		);
	}
}

async function stageVirtualPackageRoot(
	filesystem: VirtualFileSystem,
	packageRoot: string,
	stageRoot: string,
	stagedPaths: Set<string>,
	visitedFiles: Set<string>,
	visitedPackages: Set<string>,
	resolutionCache: ResolutionCache,
): Promise<void> {
	if (visitedPackages.has(packageRoot)) {
		return;
	}
	visitedPackages.add(packageRoot);

	await stageVirtualTree(
		filesystem,
		packageRoot,
		stageRoot,
		stagedPaths,
		visitedFiles,
	);

	const dependencyResolutionRoots = [packageRoot];
	const translatedPackageRoot =
		typeof (filesystem as unknown as { toHostPath?: unknown }).toHostPath ===
		"function"
			? (
					filesystem as unknown as {
						toHostPath(path: string): string | null;
					}
				).toHostPath(
					packageRoot,
				)
			: null;
	if (translatedPackageRoot) {
		try {
			const hostPackageInfo = await lstatHost(translatedPackageRoot);
			if (hostPackageInfo.isSymbolicLink()) {
				const hostLinkTarget = await readHostLink(translatedPackageRoot);
				const resolvedHostTarget = path.resolve(
					path.dirname(translatedPackageRoot),
					hostLinkTarget,
				);
				const resolvedSandboxTarget =
					typeof (filesystem as unknown as { toSandboxPath?: unknown })
						.toSandboxPath ===
					"function"
						? (
								filesystem as unknown as {
									toSandboxPath(path: string): string;
								}
							).toSandboxPath(resolvedHostTarget)
						: resolvedHostTarget;
				if (await filesystem.exists(resolvedSandboxTarget)) {
					dependencyResolutionRoots.unshift(resolvedSandboxTarget);
				}
			}
		} catch {
			// Fall through to the generic VFS lstat/readlink path below.
		}
	}
	if (dependencyResolutionRoots.length === 1) {
		try {
			const packageStat = await lstatVirtualPath(filesystem, packageRoot);
			if (packageStat.isSymbolicLink) {
				const linkTarget = await readVirtualLinkTarget(filesystem, packageRoot);
				const resolvedTarget = linkTarget.startsWith("/")
					? path.posix.normalize(linkTarget)
					: path.posix.resolve(path.posix.dirname(packageRoot), linkTarget);
				if (await filesystem.exists(resolvedTarget)) {
					dependencyResolutionRoots.unshift(resolvedTarget);
				}
			}
		} catch {
			// Fall back to the visible package root if lstat/readlink is unavailable.
		}
	}

	const packageMetadataRoot = dependencyResolutionRoots[0] ?? packageRoot;
	const packageJsonPath =
		packageMetadataRoot === "/"
			? "/package.json"
			: path.posix.join(packageMetadataRoot, "package.json");
	if (!await filesystem.exists(packageJsonPath)) {
		return;
	}

	type PackageJsonDependencies = {
		dependencies?: Record<string, string>;
		optionalDependencies?: Record<string, string>;
		peerDependencies?: Record<string, string>;
	};

	let packageJson: PackageJsonDependencies;
	try {
		packageJson = JSON.parse(
			await filesystem.readTextFile(packageJsonPath),
		) as PackageJsonDependencies;
	} catch {
		return;
	}

	const dependencyNames = new Set<string>([
		...Object.keys(packageJson.dependencies ?? {}),
		...Object.keys(packageJson.optionalDependencies ?? {}),
	]);
	for (const dependencyName of dependencyNames) {
		let dependencyEntry = null;
		for (const resolutionRoot of dependencyResolutionRoots) {
			dependencyEntry = await resolveModule(
				dependencyName,
				resolutionRoot,
				filesystem,
				"require",
				resolutionCache,
			);
			if (dependencyEntry) {
				break;
			}
		}
		let dependencyRoot = null;
		if (!dependencyEntry) {
			dependencyRoot = await findPnpmDependencyRoot(
				filesystem,
				packageRoot,
				dependencyName,
			);
			for (const resolutionRoot of dependencyResolutionRoots) {
				if (dependencyRoot) {
					break;
				}
				const siblingDependencyRoot = path.posix.join(
					path.posix.dirname(resolutionRoot),
					...dependencyName.split("/"),
				);
				if (await filesystem.exists(siblingDependencyRoot)) {
					dependencyRoot = siblingDependencyRoot;
					break;
				}
				const nestedDependencyRoot = path.posix.join(
					resolutionRoot,
					"node_modules",
					...dependencyName.split("/"),
				);
				if (await filesystem.exists(nestedDependencyRoot)) {
					dependencyRoot = nestedDependencyRoot;
					break;
				}
			}
			if (!dependencyRoot) {
				continue;
			}
		} else {
			dependencyRoot = await findNearestVirtualPackageRoot(
				filesystem,
				dependencyEntry,
			);
			if (!dependencyRoot) {
				continue;
			}
		}
		await stageVirtualPackageRoot(
			filesystem,
			dependencyRoot,
			stageRoot,
			stagedPaths,
			visitedFiles,
			visitedPackages,
			resolutionCache,
		);

		if (dependencyResolutionRoots[0] !== packageRoot) {
			const packageDependencyContainerRoot = dependencyResolutionRoots[0];
			const dependencyLinkVirtualPath = path.posix.join(
				packageDependencyContainerRoot,
				"node_modules",
				...dependencyName.split("/"),
			);
			const dependencyLinkHostPath = getHostPathForVirtualPath(
				stageRoot,
				dependencyLinkVirtualPath,
			);
			if (!existsSync(dependencyLinkHostPath)) {
				const dependencyTargetHostPath = getHostPathForVirtualPath(
					stageRoot,
					dependencyRoot,
				);
				await mkdirHost(path.dirname(dependencyLinkHostPath), {
					recursive: true,
				});
				await symlinkHost(
					path.relative(
						path.dirname(dependencyLinkHostPath),
						dependencyTargetHostPath,
					),
					dependencyLinkHostPath,
				);
			}
		}
	}
}

async function stageVirtualModuleClosure(
	filesystem: VirtualFileSystem,
	filePath: string,
	stageRoot: string,
	stagedPaths: Set<string>,
	visitedFiles: Set<string>,
	visitedPackages: Set<string>,
	resolutionCache: ResolutionCache,
): Promise<void> {
	if (visitedFiles.has(filePath)) {
		return;
	}
	visitedFiles.add(filePath);

	if (!stagedPaths.has(filePath)) {
		await copyVirtualPathToHost(filesystem, filePath, stageRoot);
		stagedPaths.add(filePath);
	}

	await stageNearestVirtualPackageJson(filesystem, filePath, stageRoot, stagedPaths);

	const lowerPath = filePath.toLowerCase();
	if (
		!lowerPath.endsWith(".js") &&
		!lowerPath.endsWith(".mjs") &&
		!lowerPath.endsWith(".cjs") &&
		!lowerPath.endsWith(".ts") &&
		!lowerPath.endsWith(".mts") &&
		!lowerPath.endsWith(".cts")
	) {
		return;
	}

	const source = await filesystem.readTextFile(filePath);
	await stageVirtualSourceDependencies(
		filesystem,
		filePath,
		source,
		stageRoot,
		stagedPaths,
		visitedFiles,
		visitedPackages,
		resolutionCache,
	);
}

async function stageUpstreamEntryFromFilesystem(
	filesystem: VirtualFileSystem | undefined,
	filePath: string | undefined,
	code: string | undefined,
	cwd: string | undefined,
): Promise<StagedUpstreamEntry | null> {
	if (typeof filePath !== "string" || filePath.length === 0) {
		if (typeof code !== "string") {
			return null;
		}
	}

	const logicalFilePath =
		typeof filePath === "string" && filePath.length > 0
			? normalizeVirtualPath(filePath, cwd)
			: normalizeVirtualPath(
					path.posix.join(cwd ?? "/", "__secure_exec_eval__.js"),
				);
	const logicalCwd =
		typeof cwd === "string" && cwd.length > 0
			? normalizeVirtualPath(cwd)
			: undefined;

	if (!filesystem && existsSync(logicalFilePath)) {
		return {
			entryFilePath: logicalFilePath,
			logicalEntryPath: logicalFilePath,
			cwd: logicalCwd && existsSync(logicalCwd) ? logicalCwd : undefined,
			cleanup: async () => {},
		};
	}

	const stageRoot = await mkdtemp(
		path.join(os.tmpdir(), "secure-exec-upstream-entry-"),
	);

	try {
		const stagedPaths = new Set<string>();
		const visitedFiles = new Set<string>();
		const visitedPackages = new Set<string>();
		const resolutionCache = createResolutionCache();
		if (filesystem && await filesystem.exists(logicalFilePath)) {
			await stageVirtualModuleClosure(
				filesystem,
				logicalFilePath,
				stageRoot,
				stagedPaths,
				visitedFiles,
				visitedPackages,
				resolutionCache,
			);
		} else if (filesystem && typeof code === "string") {
			await stageNearestVirtualPackageJson(
				filesystem,
				logicalFilePath,
				stageRoot,
				stagedPaths,
			);
			await stageVirtualSourceDependencies(
				filesystem,
				logicalFilePath,
				code,
				stageRoot,
				stagedPaths,
				visitedFiles,
				visitedPackages,
				resolutionCache,
			);
		}

		const stagedEntryFilePath = getHostPathForVirtualPath(stageRoot, logicalFilePath);
		if (typeof code === "string") {
			await mkdirHost(path.dirname(stagedEntryFilePath), { recursive: true });
			await writeHostFile(stagedEntryFilePath, code, "utf8");
		}

		const stagedCwd =
			typeof logicalCwd === "string"
				? getHostPathForVirtualPath(stageRoot, logicalCwd)
				: undefined;

		return {
			entryFilePath: stagedEntryFilePath,
			logicalEntryPath: logicalFilePath,
			stageRoot,
			cwd: stagedCwd,
			cleanup: async () => {
				await rm(stageRoot, { recursive: true, force: true });
			},
		};
	} catch (error) {
		await rm(stageRoot, { recursive: true, force: true });
		throw error;
	}
}

class ExperimentalUpstreamBootstrapRuntimeDriver implements NodeRuntimeDriver {
	readonly #runtime: RuntimeDriverOptions["runtime"];
	readonly #filesystem?: VirtualFileSystem;
	readonly #defaultOnStdio?: StdioHook;
	readonly #vendoredPublicBuiltins: string[];
	readonly #awaitCompletionSignalMode?: "always" | "auto";

	constructor(
		options: RuntimeDriverOptions & ExperimentalUpstreamBootstrapOptions,
	) {
		this.#runtime = options.runtime;
		this.#filesystem = options.system.filesystem;
		this.#defaultOnStdio = options.onStdio;
		this.#vendoredPublicBuiltins = normalizeVendoredPublicBuiltins(
			options.vendoredPublicBuiltins,
		);
		this.#awaitCompletionSignalMode =
			options.awaitCompletionSignalMode ??
			(options.awaitCompletionSignal === true ? "always" : undefined);
	}

	async exec(code: string, options: ExecOptions = {}): Promise<ExecResult> {
		const result = await this.#evaluate(code, options);
		return {
			code: result.code,
			errorMessage: result.errorMessage,
		};
	}

	async run<T = unknown>(code: string, filePath?: string): Promise<RunResult<T>> {
		const result = await this.#evaluate<T>(code, {
			mode: "run",
			filePath,
		});
		return {
			code: result.code,
			errorMessage: result.errorMessage,
			exports: result.exports,
		};
	}

	async #evaluate<T = unknown>(
		code: string,
		options: ExecOptions = {},
	): Promise<RunResult<T>> {
		const requestedCwd = options.cwd ?? this.#runtime.process.cwd;
		const logicalFilePath =
			typeof options.filePath === "string" && options.filePath.length > 0
				? normalizeVirtualPath(options.filePath, requestedCwd)
				: undefined;
		const stagedEntry = await stageUpstreamEntryFromFilesystem(
			this.#filesystem,
			options.filePath,
			code,
			requestedCwd,
		);

		try {
			const effectiveFilePath = stagedEntry?.entryFilePath ?? logicalFilePath;
			const effectiveCwd = stagedEntry?.cwd ?? options.cwd;
			const result = await runUpstreamBootstrapEval({
				code,
				filePath: logicalFilePath,
				hostFilePath: effectiveFilePath,
				resolutionFilePath: stagedEntry?.logicalEntryPath ?? logicalFilePath,
				stageRoot: stagedEntry?.stageRoot,
				cwd: effectiveCwd,
				env: {
					...(this.#runtime.process.env ?? {}),
					...(options.env ?? {}),
				},
				argv:
					logicalFilePath !== undefined
						? [process.execPath, logicalFilePath]
						: this.#runtime.process.argv,
				vendoredPublicBuiltins:
					this.#vendoredPublicBuiltins.length > 0
						? [...this.#vendoredPublicBuiltins]
						: undefined,
				awaitCompletionSignal: shouldAwaitCompletionSignal(
					this.#awaitCompletionSignalMode,
					code,
				),
				returnExports: options.mode === "run",
			});

			emitBufferedStdio(
				result.stdout,
				result.stderr,
				this.#defaultOnStdio,
				options.onStdio,
			);

			if (result.status === "blocked") {
				return {
					code: 1,
					errorMessage: result.errorMessage ?? result.summary,
				};
			}

			return {
				code: result.code,
				errorMessage:
					result.code === 0 ? undefined : result.stderr || result.summary,
				exports: decodeSerializedExports<T>(result.serializedExports),
			};
		} finally {
			await stagedEntry?.cleanup();
		}
	}

	dispose(): void {}
}

export function createExperimentalUpstreamBootstrapRuntimeDriverFactory(
	options: ExperimentalUpstreamBootstrapOptions = {},
): NodeRuntimeDriverFactory {
	const vendoredPublicBuiltins = normalizeVendoredPublicBuiltins(
		options.vendoredPublicBuiltins,
	);
	const awaitCompletionSignalMode =
		options.awaitCompletionSignalMode ??
		(options.awaitCompletionSignal === true ? "always" : undefined);
	return {
		createRuntimeDriver: (options) =>
			new ExperimentalUpstreamBootstrapRuntimeDriver({
				...options,
				awaitCompletionSignalMode,
				vendoredPublicBuiltins,
			}),
	};
}

export async function runUpstreamFsFirstLightEval(
	request: Omit<UpstreamBootstrapEvalRequest, "vendoredPublicBuiltins">,
): Promise<UpstreamBootstrapEvalResult> {
	return runUpstreamBootstrapEval({
		...request,
		awaitCompletionSignal: true,
		vendoredPublicBuiltins: [...FS_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

export async function runUpstreamNetFirstLightEval(
	request: Omit<UpstreamBootstrapEvalRequest, "vendoredPublicBuiltins">,
): Promise<UpstreamBootstrapEvalResult> {
	return runUpstreamBootstrapEval({
		...request,
		awaitCompletionSignal: true,
		vendoredPublicBuiltins: [...NET_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

export async function runUpstreamHttpFirstLightEval(
	request: Omit<UpstreamBootstrapEvalRequest, "vendoredPublicBuiltins">,
): Promise<UpstreamBootstrapEvalResult> {
	return runUpstreamBootstrapEval({
		...request,
		awaitCompletionSignal: true,
		vendoredPublicBuiltins: [...HTTP_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

export async function runUpstreamAsyncHooksFirstLightEval(
	request: Omit<UpstreamBootstrapEvalRequest, "vendoredPublicBuiltins">,
): Promise<UpstreamBootstrapEvalResult> {
	return runUpstreamBootstrapEval({
		...request,
		awaitCompletionSignal: true,
		vendoredPublicBuiltins: [...ASYNC_HOOKS_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

export async function runUpstreamReadlineFirstLightEval(
	request: Omit<UpstreamBootstrapEvalRequest, "vendoredPublicBuiltins">,
): Promise<UpstreamBootstrapEvalResult> {
	return runUpstreamBootstrapEval({
		...request,
		awaitCompletionSignal: true,
		vendoredPublicBuiltins: [...READLINE_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

export function createExperimentalUpstreamFsFirstLightRuntimeDriverFactory(): NodeRuntimeDriverFactory {
	return createExperimentalUpstreamBootstrapRuntimeDriverFactory({
		awaitCompletionSignalMode: "always",
		vendoredPublicBuiltins: [...FS_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

/**
 * Internal-only helper-child runtime factory for upstream bring-up coverage.
 * Public product surfaces must stay on NodeExecutionDriver/secure-exec-v8 until
 * this loader can execute inside the real V8 session.
 */
export function createReplacementNodeRuntimeDriverFactory(): NodeRuntimeDriverFactory {
	return createExperimentalUpstreamBootstrapRuntimeDriverFactory({
		awaitCompletionSignalMode: "auto",
		vendoredPublicBuiltins: [...REPLACEMENT_PUBLIC_BUILTINS],
	});
}

function createImmediateProcessExit(
	exitCode: number,
	stderr: string,
	ctx: ProcessContext,
): DriverProcess {
	let resolved = false;
	let resolveExit!: (code: number) => void;
	const exitPromise = new Promise<number>((resolve) => {
		resolveExit = resolve;
	});

	const proc: DriverProcess = {
		onStdout: null,
		onStderr: null,
		onExit: null,
		writeStdin() {},
		closeStdin() {},
		kill() {
			if (resolved) {
				return;
			}
			resolved = true;
			resolveExit(exitCode);
			proc.onExit?.(exitCode);
		},
		wait: () => exitPromise,
	};

	queueMicrotask(() => {
		if (stderr.length > 0) {
			const data = textEncoder.encode(stderr);
			ctx.onStderr?.(data);
			proc.onStderr?.(data);
		}
		if (!resolved) {
			resolved = true;
			resolveExit(exitCode);
			proc.onExit?.(exitCode);
		}
	});

	return proc;
}

function extractEvalCode(args: string[]): string | null {
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if ((arg === "-e" || arg === "--eval") && typeof args[index + 1] === "string") {
			return args[index + 1];
		}
	}
	return null;
}

interface ExtractedFileEntry {
	filePath: string;
	scriptArgs: string[];
}

function extractFileEntry(args: string[]): ExtractedFileEntry | null {
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "-e" || arg === "--eval" || arg === "-p" || arg === "--print") {
			return null;
		}
		if (arg.startsWith("-")) {
			continue;
		}
		return {
			filePath: arg,
			scriptArgs: args.slice(index + 1),
		};
	}
	return null;
}

class ExperimentalUpstreamBootstrapKernelRuntime implements KernelRuntimeDriver {
	readonly name = "node-upstream-bootstrap";
	readonly commands = ["node"];
	readonly #vendoredPublicBuiltins: string[];
	readonly #awaitCompletionSignalMode?: "always" | "auto";
	#kernel: KernelInterface | null = null;

	constructor(options: ExperimentalUpstreamBootstrapOptions = {}) {
		this.#vendoredPublicBuiltins = normalizeVendoredPublicBuiltins(
			options.vendoredPublicBuiltins,
		);
		this.#awaitCompletionSignalMode =
			options.awaitCompletionSignalMode ??
			(options.awaitCompletionSignal === true ? "always" : undefined);
	}

	async init(kernel: KernelInterface): Promise<void> {
		this.#kernel = kernel;
	}

	#createLiveProcess(
		code: string,
		ctx: ProcessContext,
	): DriverProcess {
		if (!this.#kernel) {
			return createImmediateProcessExit(
				1,
				`${this.name} was spawned before init() stored the kernel interface`,
				ctx,
			);
		}

		const kernel = this.#kernel;
		const child = spawn(
			process.execPath,
			["--expose-internals", "--no-warnings", getBootstrapRunnerPath()],
			{
				stdio: ["pipe", "pipe", "pipe", "ipc"],
				env: getBootstrapRunnerEnv({
					SECURE_EXEC_UPSTREAM_LIVE_STDIO: "1",
				}),
			},
		);
		const childStdin = child.stdin;
		const childStdout = child.stdout;
		const childStderr = child.stderr;
		if (!childStdin || !childStdout || !childStderr) {
			return createImmediateProcessExit(
				1,
				`${this.name} failed to allocate child stdio pipes for live PTY mode`,
				ctx,
			);
		}

		let resolved = false;
		let stdinClosed = false;
		let resolveExit!: (code: number) => void;
		const exitPromise = new Promise<number>((resolve) => {
			resolveExit = resolve;
		});

		const finish = (code: number) => {
			if (resolved) {
				return;
			}
			resolved = true;
			resolveExit(code);
			proc.onExit?.(code);
		};

		const emitOutput = (
			channel: "stdout" | "stderr",
			chunk: Uint8Array,
		) => {
			if (channel === "stdout") {
				ctx.onStdout?.(chunk);
				proc.onStdout?.(chunk);
				return;
			}
			ctx.onStderr?.(chunk);
			proc.onStderr?.(chunk);
		};

		const closeChildStdin = () => {
			if (stdinClosed) {
				return;
			}
			stdinClosed = true;
			childStdin.end();
		};

		const proc: DriverProcess = {
			onStdout: null,
			onStderr: null,
			onExit: null,
			writeStdin(data) {
				if (ctx.stdinIsTTY || stdinClosed || childStdin.destroyed) {
					return;
				}
				childStdin.write(data);
			},
			closeStdin() {
				closeChildStdin();
			},
			kill(signal) {
				if (resolved) {
					return;
				}
				if (signal === 28) {
					if (child.connected) {
						child.send({ type: "signal", signal: "SIGWINCH" });
					}
					return;
				}
				child.kill(signal as number);
			},
			wait: () => exitPromise,
		};

		childStdout.on("data", (chunk: Buffer) => {
			emitOutput("stdout", new Uint8Array(chunk));
		});
		childStderr.on("data", (chunk: Buffer) => {
			emitOutput("stderr", new Uint8Array(chunk));
		});
		child.on("message", (message) => {
			if (
				!message ||
				typeof message !== "object" ||
				(message as { type?: unknown }).type !== "pty-set-raw-mode" ||
				ctx.stdinIsTTY !== true
			) {
				return;
			}
			const mode = (message as { mode?: unknown }).mode === true;
			kernel.tcsetattr(ctx.pid, ctx.fds.stdin, {
				icanon: !mode,
				echo: !mode,
				isig: !mode,
				icrnl: !mode,
			});
		});
		child.on("error", (error) => {
			emitOutput(
				"stderr",
				textEncoder.encode(
					error instanceof Error ? error.message : String(error),
				),
			);
			finish(1);
		});
		child.on("close", (code) => {
			closeChildStdin();
			finish(typeof code === "number" ? code : 1);
		});

		child.send({
			code,
			cwd: ctx.cwd,
			env: ctx.env,
			argv: ["node", "-e", code],
			execArgv: [],
			vendoredPublicBuiltins:
				this.#vendoredPublicBuiltins.length > 0
					? [...this.#vendoredPublicBuiltins]
					: undefined,
			awaitCompletionSignal: shouldAwaitCompletionSignal(
				this.#awaitCompletionSignalMode,
				code,
			),
			liveStdio: true,
			stdinIsTTY: ctx.stdinIsTTY,
			stdoutIsTTY: ctx.stdoutIsTTY,
			stderrIsTTY: ctx.stderrIsTTY,
			terminalColumns: parseTerminalDimension(ctx.env.COLUMNS),
			terminalRows: parseTerminalDimension(ctx.env.LINES),
		} satisfies UpstreamBootstrapEvalRequest);

		if (ctx.stdinIsTTY) {
			queueMicrotask(async () => {
				try {
					while (!resolved) {
						const chunk = await kernel.fdRead(ctx.pid, ctx.fds.stdin, 4096);
						if (resolved) {
							break;
						}
						if (chunk.length === 0) {
							closeChildStdin();
							break;
						}
						if (!childStdin.write(chunk)) {
							await new Promise<void>((resolve) => {
								childStdin.once("drain", resolve);
							});
						}
					}
				} catch {
					closeChildStdin();
				}
			});
		}

		return proc;
	}

	spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
		if (command !== "node") {
			return createImmediateProcessExit(
				1,
				`unsupported command for ${this.name}: ${command}`,
				ctx,
			);
		}

		const code = extractEvalCode(args);
		const fileEntry = code === null ? extractFileEntry(args) : null;
		if (code === null && fileEntry === null) {
			return createImmediateProcessExit(
				1,
				`${this.name} only supports \`node -e <code>\` or \`node <file>\` during the bootstrap bring-up story`,
				ctx,
			);
		}

		if (
			ctx.streamStdin === true ||
			ctx.stdinIsTTY === true ||
			ctx.stdoutIsTTY === true ||
			ctx.stderrIsTTY === true
		) {
			if (fileEntry !== null) {
				return createImmediateProcessExit(
					1,
					`${this.name} does not yet support PTY/live-stdio file entrypoints`,
					ctx,
				);
			}
			return this.#createLiveProcess(code ?? "", ctx);
		}

		let resolved = false;
		let resolveExit!: (code: number) => void;
		const exitPromise = new Promise<number>((resolve) => {
			resolveExit = resolve;
		});

		const proc: DriverProcess = {
			onStdout: null,
			onStderr: null,
			onExit: null,
			writeStdin() {},
			closeStdin() {},
			kill() {
				if (resolved) {
					return;
				}
				resolved = true;
				resolveExit(1);
				proc.onExit?.(1);
			},
			wait: () => exitPromise,
		};

		queueMicrotask(async () => {
			try {
				const stagedEntry =
					fileEntry === null
						? null
						: await stageUpstreamEntryFromFilesystem(
								this.#kernel?.vfs,
								fileEntry.filePath,
								undefined,
								ctx.cwd,
							);

				try {
					const effectiveFilePath =
						stagedEntry?.entryFilePath ?? fileEntry?.filePath;
					const effectiveCwd = stagedEntry?.cwd ?? ctx.cwd;
					const result = await runUpstreamBootstrapEval({
						code: code ?? undefined,
						filePath: effectiveFilePath,
						cwd: effectiveCwd,
						env: ctx.env,
						argv:
							fileEntry === null
								? ["node", "-e", code ?? ""]
								: [
										"node",
										effectiveFilePath ?? fileEntry.filePath,
										...fileEntry.scriptArgs,
									],
						execArgv: [],
						vendoredPublicBuiltins:
							this.#vendoredPublicBuiltins.length > 0
								? [...this.#vendoredPublicBuiltins]
								: undefined,
						awaitCompletionSignal:
							code === null
								? false
								: shouldAwaitCompletionSignal(
										this.#awaitCompletionSignalMode,
										code,
									),
					});
				const stdout = result.stdout;
				const stderr =
					result.status === "pass"
						? result.stderr
						: result.stderr || result.errorMessage || result.summary;
				if (stdout.length > 0) {
					const data = textEncoder.encode(stdout);
					ctx.onStdout?.(data);
					proc.onStdout?.(data);
				}
				if (stderr.length > 0) {
					const data = textEncoder.encode(stderr);
					ctx.onStderr?.(data);
					proc.onStderr?.(data);
				}
				const exitCode = result.status === "pass" ? result.code : 1;
				if (!resolved) {
					resolved = true;
					resolveExit(exitCode);
					proc.onExit?.(exitCode);
				}
				} finally {
					await stagedEntry?.cleanup();
				}
			} catch (error) {
				const data = textEncoder.encode(
					error instanceof Error ? error.message : String(error),
				);
				ctx.onStderr?.(data);
				proc.onStderr?.(data);
				if (!resolved) {
					resolved = true;
					resolveExit(1);
					proc.onExit?.(1);
				}
			}
		});

		return proc;
	}

	tryResolve(command: string): boolean {
		return command === "node";
	}

	async dispose(): Promise<void> {
		this.#kernel = null;
	}
}

export function createExperimentalUpstreamBootstrapKernelRuntime(
	options: ExperimentalUpstreamBootstrapOptions = {},
): KernelRuntimeDriver {
	return new ExperimentalUpstreamBootstrapKernelRuntime(options);
}

export function createExperimentalUpstreamFsFirstLightKernelRuntime(): KernelRuntimeDriver {
	return createExperimentalUpstreamBootstrapKernelRuntime({
		awaitCompletionSignalMode: "always",
		vendoredPublicBuiltins: [...FS_FIRST_LIGHT_PUBLIC_BUILTINS],
	});
}

/**
 * Internal-only helper-child kernel runtime for upstream bring-up coverage.
 * Public `createNodeRuntime()` must stay on the V8-backed kernel runtime until
 * the upstream loader no longer depends on `node --expose-internals`.
 */
export function createReplacementNodeKernelRuntime(): KernelRuntimeDriver {
	return createExperimentalUpstreamBootstrapKernelRuntime({
		awaitCompletionSignalMode: "auto",
		vendoredPublicBuiltins: [...REPLACEMENT_PUBLIC_BUILTINS],
	});
}
