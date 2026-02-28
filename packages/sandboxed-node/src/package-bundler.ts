import type { VirtualFileSystem } from "./types.js";

// Path utilities (since we can't use node:path in a way that works in isolate)
function dirname(p: string): string {
	const lastSlash = p.lastIndexOf("/");
	if (lastSlash === -1) return ".";
	if (lastSlash === 0) return "/";
	return p.slice(0, lastSlash);
}

function join(...parts: string[]): string {
	const segments: string[] = [];
	for (const part of parts) {
		if (part.startsWith("/")) {
			segments.length = 0;
		}
		for (const seg of part.split("/")) {
			if (seg === "..") {
				segments.pop();
			} else if (seg && seg !== ".") {
				segments.push(seg);
			}
		}
	}
	return `/${segments.join("/")}`;
}

type ResolveMode = "require" | "import";

interface PackageJson {
	main?: string;
	type?: "module" | "commonjs";
	exports?: unknown;
}

const FILE_EXTENSIONS = [".js", ".json", ".mjs", ".cjs"];

/**
 * Resolve a module request to an absolute path in the virtual filesystem
 */
export async function resolveModule(
	request: string,
	fromDir: string,
	fs: VirtualFileSystem,
	mode: ResolveMode = "require",
): Promise<string | null> {
	// Absolute paths - resolve directly
	if (request.startsWith("/")) {
		return resolveAbsolute(request, fs, mode);
	}

	// Relative imports (including bare '.' and '..')
	if (
		request.startsWith("./") ||
		request.startsWith("../") ||
		request === "." ||
		request === ".."
	) {
		return resolveRelative(request, fromDir, fs, mode);
	}

	// Bare imports - walk up node_modules
	return resolveNodeModules(request, fromDir, fs, mode);
}

/**
 * Resolve an absolute path
 */
async function resolveAbsolute(
	request: string,
	fs: VirtualFileSystem,
	mode: ResolveMode,
): Promise<string | null> {
	return resolvePath(request, fs, mode);
}

/**
 * Resolve a relative import
 */
async function resolveRelative(
	request: string,
	fromDir: string,
	fs: VirtualFileSystem,
	mode: ResolveMode,
): Promise<string | null> {
	const basePath = join(fromDir, request);
	return resolvePath(basePath, fs, mode);
}

/**
 * Resolve a bare module import by walking up node_modules
 */
async function resolveNodeModules(
	request: string,
	fromDir: string,
	fs: VirtualFileSystem,
	mode: ResolveMode,
): Promise<string | null> {
	// Handle scoped packages: @scope/package
	let packageName: string;
	let subpath: string;

	if (request.startsWith("@")) {
		// Scoped package: @scope/package or @scope/package/subpath
		const parts = request.split("/");
		if (parts.length >= 2) {
			packageName = `${parts[0]}/${parts[1]}`;
			subpath = parts.slice(2).join("/");
		} else {
			return null;
		}
	} else {
		// Regular package: package or package/subpath
		const slashIndex = request.indexOf("/");
		if (slashIndex === -1) {
			packageName = request;
			subpath = "";
		} else {
			packageName = request.slice(0, slashIndex);
			subpath = request.slice(slashIndex + 1);
		}
	}

	let dir = fromDir;
	while (dir !== "" && dir !== ".") {
		const packageDir = join(dir, "node_modules", packageName);
		const entry = await resolvePackageEntryFromDir(packageDir, subpath, fs, mode);
		if (entry) {
			return entry;
		}

		if (dir === "/") break;
		dir = dirname(dir);
	}

	// Also check root node_modules
	const rootPackageDir = join("/node_modules", packageName);
	const rootEntry = await resolvePackageEntryFromDir(
		rootPackageDir,
		subpath,
		fs,
		mode,
	);
	if (rootEntry) {
		return rootEntry;
	}

	return null;
}

async function resolvePackageEntryFromDir(
	packageDir: string,
	subpath: string,
	fs: VirtualFileSystem,
	mode: ResolveMode,
): Promise<string | null> {
	const pkgJsonPath = join(packageDir, "package.json");
	const pkgJson = await readPackageJson(fs, pkgJsonPath);

	if (!pkgJson && !(await fs.exists(packageDir))) {
		return null;
	}

	// If package uses "exports", follow it and do not fall back to main/subpath
	if (pkgJson?.exports !== undefined) {
		const exportsTarget = resolveExportsTarget(
			pkgJson.exports,
			subpath ? `./${subpath}` : ".",
			mode,
		);
		if (!exportsTarget) {
			return null;
		}
		const targetPath = join(packageDir, normalizePackagePath(exportsTarget));
		return resolvePath(targetPath, fs, mode);
	}

	// Bare subpath import without exports map: package/sub/path
	if (subpath) {
		return resolvePath(join(packageDir, subpath), fs, mode);
	}

	// Root package import
	const entryField = getPackageEntryField(pkgJson, mode);
	if (entryField) {
		const entryPath = join(packageDir, normalizePackagePath(entryField));
		const resolved = await resolvePath(entryPath, fs, mode);
		if (resolved) return resolved;
	}

	// Default fallback
	return resolvePath(join(packageDir, "index"), fs, mode);
}

async function resolvePath(
	basePath: string,
	fs: VirtualFileSystem,
	mode: ResolveMode,
): Promise<string | null> {
	let isDirectory = false;

	try {
		const statInfo = await fs.stat(basePath);
		if (!statInfo.isDirectory) {
			return basePath;
		}
		isDirectory = true;
	} catch {
		// Path doesn't exist directly
	}

	// For extensionless specifiers, try files before directory resolution.
	for (const ext of FILE_EXTENSIONS) {
		const withExt = `${basePath}${ext}`;
		if (await fs.exists(withExt)) {
			return withExt;
		}
	}

	if (isDirectory) {
		const pkgJsonPath = join(basePath, "package.json");
		const pkgJson = await readPackageJson(fs, pkgJsonPath);
		const entryField = getPackageEntryField(pkgJson, mode);
		if (entryField) {
			const entryPath = join(basePath, normalizePackagePath(entryField));
			// Avoid directory self-reference loops like "main": "."
			if (entryPath !== basePath) {
				const entry = await resolvePath(entryPath, fs, mode);
				if (entry) return entry;
			}
		}

		for (const ext of FILE_EXTENSIONS) {
			const indexPath = join(basePath, `index${ext}`);
			if (await fs.exists(indexPath)) {
				return indexPath;
			}
		}

	}

	return null;
}

async function readPackageJson(
	fs: VirtualFileSystem,
	pkgJsonPath: string,
): Promise<PackageJson | null> {
	if (!(await fs.exists(pkgJsonPath))) {
		return null;
	}
	try {
		return JSON.parse(await fs.readTextFile(pkgJsonPath)) as PackageJson;
	} catch {
		return null;
	}
}

function normalizePackagePath(value: string): string {
	return value.replace(/^\.\//, "").replace(/\/$/, "");
}

function getPackageEntryField(
	pkgJson: PackageJson | null,
	_mode: ResolveMode,
): string | null {
	if (!pkgJson) return "index.js";
	// Match Node's package entrypoint precedence when exports is absent.
	if (typeof pkgJson.main === "string") return pkgJson.main;
	return "index.js";
}

function resolveExportsTarget(
	exportsField: unknown,
	subpath: string,
	mode: ResolveMode,
): string | null {
	// "exports": "./dist/index.js"
	if (typeof exportsField === "string") {
		return subpath === "." ? exportsField : null;
	}

	// "exports": ["./a.js", "./b.js"]
	if (Array.isArray(exportsField)) {
		for (const item of exportsField) {
			const resolved = resolveExportsTarget(item, subpath, mode);
			if (resolved) return resolved;
		}
		return null;
	}

	if (!exportsField || typeof exportsField !== "object") {
		return null;
	}

	const record = exportsField as Record<string, unknown>;

	// Root conditions object (no "./" keys)
	if (subpath === "." && !Object.keys(record).some((key) => key.startsWith("./"))) {
		return resolveConditionalTarget(record, mode);
	}

	// Exact subpath key first
	if (subpath in record) {
		return resolveExportsTarget(record[subpath], ".", mode);
	}

	// Pattern keys like "./*"
	for (const [key, value] of Object.entries(record)) {
		if (!key.includes("*")) continue;
		const [prefix, suffix] = key.split("*");
		if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
		const wildcard = subpath.slice(prefix.length, subpath.length - suffix.length);
		const resolved = resolveExportsTarget(value, ".", mode);
		if (!resolved) continue;
		return resolved.replaceAll("*", wildcard);
	}

	// Root key may still be present in object with subpaths
	if (subpath === "." && "." in record) {
		return resolveExportsTarget(record["."], ".", mode);
	}

	return null;
}

function resolveConditionalTarget(
	record: Record<string, unknown>,
	mode: ResolveMode,
): string | null {
	const order =
		mode === "import"
			? ["import", "node", "module", "default", "require"]
			: ["require", "node", "default", "import", "module"];

	for (const key of order) {
		if (!(key in record)) continue;
		const resolved = resolveExportsTarget(record[key], ".", mode);
		if (resolved) return resolved;
	}

	// Last resort: first key that resolves
	for (const value of Object.values(record)) {
		const resolved = resolveExportsTarget(value, ".", mode);
		if (resolved) return resolved;
	}

	return null;
}

/**
 * Load a file's content from the virtual filesystem
 */
export async function loadFile(
	path: string,
	fs: VirtualFileSystem,
): Promise<string | null> {
	try {
		return await fs.readTextFile(path);
	} catch {
		return null;
	}
}

/**
 * Legacy function - bundle a package from node_modules (simple approach)
 * This is kept for backwards compatibility but the new dynamic resolution is preferred
 */
export async function bundlePackage(
	packageName: string,
	fs: VirtualFileSystem,
): Promise<string | null> {
	// Resolve the package entry point
	const entryPath = await resolveNodeModules(packageName, "/", fs, "require");
	if (!entryPath) {
		return null;
	}

	try {
		const entryCode = await fs.readTextFile(entryPath);

		// Wrap the code in an IIFE that sets up module.exports
		const wrappedCode = `(function() {
      var module = { exports: {} };
      var exports = module.exports;
      ${entryCode}
      return module.exports;
    })()`;

		return wrappedCode;
	} catch {
		return null;
	}
}
