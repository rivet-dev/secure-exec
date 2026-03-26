import { existsSync, readFileSync } from "node:fs";
import { dirname as pathDirname, join as pathJoin } from "node:path";
import { pathToFileURL } from "node:url";
import { transform, transformSync } from "esbuild";
import { initSync as initCjsLexerSync, parse as parseCjsExports } from "cjs-module-lexer";
import { init, initSync, parse } from "es-module-lexer";

const REQUIRE_TRANSFORM_MARKER = "/*__secure_exec_require_esm__*/";
const IMPORT_META_URL_HELPER = "__secureExecImportMetaUrl__";
const IMPORT_META_RESOLVE_HELPER = "__secureExecImportMetaResolve__";
const UNICODE_SET_REGEX_MARKER = "/v";
const CJS_IMPORT_DEFAULT_HELPER = "__secureExecImportedCjsModule__";

function isJavaScriptLikePath(filePath: string | undefined): boolean {
	return filePath === undefined || /\.[cm]?[jt]sx?$/.test(filePath);
}

function parseSourceSyntax(source: string, filePath?: string) {
	const [imports, , , hasModuleSyntax] = parse(source, filePath);
	const hasDynamicImport = imports.some((specifier) => specifier.d >= 0);
	const hasImportMeta = imports.some((specifier) => specifier.d === -2);
	return { hasModuleSyntax, hasDynamicImport, hasImportMeta };
}

function isValidIdentifier(value: string): boolean {
	return /^[$A-Z_][0-9A-Z_$]*$/i.test(value);
}

function getNearestPackageTypeSync(filePath: string): "module" | "commonjs" | null {
	let currentDir = pathDirname(filePath);
	while (true) {
		const packageJsonPath = pathJoin(currentDir, "package.json");
		if (existsSync(packageJsonPath)) {
			try {
				const pkgJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
					type?: unknown;
				};
				return pkgJson.type === "module" || pkgJson.type === "commonjs"
					? pkgJson.type
					: null;
			} catch {
				return null;
			}
		}

		const parentDir = pathDirname(currentDir);
		if (parentDir === currentDir) {
			return null;
		}
		currentDir = parentDir;
	}
}

function isCommonJsModuleForImportSync(source: string, formatPath: string): boolean {
	if (!isJavaScriptLikePath(formatPath)) {
		return false;
	}
	if (formatPath.endsWith(".cjs")) {
		return true;
	}
	if (formatPath.endsWith(".mjs")) {
		return false;
	}
	if (formatPath.endsWith(".js")) {
		const packageType = getNearestPackageTypeSync(formatPath);
		if (packageType === "module") {
			return false;
		}
		if (packageType === "commonjs") {
			return true;
		}

		initSync();
		return !parseSourceSyntax(source, formatPath).hasModuleSyntax;
	}
	return false;
}

function buildCommonJsImportWrapper(source: string, filePath: string): string {
	initCjsLexerSync();
	const { exports } = parseCjsExports(source);
	const namedExports = Array.from(
		new Set(
			exports.filter(
				(name) =>
					name !== "default" &&
					name !== "__esModule" &&
					isValidIdentifier(name),
			),
		),
	);
	const lines = [
		`const ${CJS_IMPORT_DEFAULT_HELPER} = globalThis._requireFrom(${JSON.stringify(filePath)}, "/");`,
		`export default ${CJS_IMPORT_DEFAULT_HELPER};`,
		...namedExports.map(
			(name) =>
				`export const ${name} = ${CJS_IMPORT_DEFAULT_HELPER} == null ? undefined : ${CJS_IMPORT_DEFAULT_HELPER}[${JSON.stringify(name)}];`,
		),
	];
	return lines.join("\n");
}

function getRequireTransformOptions(
	filePath: string,
	syntax: ReturnType<typeof parseSourceSyntax>,
) {
	const requiresEsmWrapper =
		syntax.hasModuleSyntax || syntax.hasImportMeta;
	const bannerLines = requiresEsmWrapper ? [REQUIRE_TRANSFORM_MARKER] : [];
	if (syntax.hasImportMeta) {
		bannerLines.push(
			`const ${IMPORT_META_URL_HELPER} = require("node:url").pathToFileURL(__secureExecFilename).href;`,
		);
	}

	return {
		banner: bannerLines.length > 0 ? bannerLines.join("\n") : undefined,
		define: syntax.hasImportMeta
			? {
					"import.meta.url": IMPORT_META_URL_HELPER,
				}
			: undefined,
		format: "cjs" as const,
		loader: "js" as const,
		platform: "node" as const,
		sourcefile: filePath,
		supported: {
			"dynamic-import": false,
		},
		target: "node22",
	};
}

function getImportTransformOptions(
	filePath: string,
	syntax: ReturnType<typeof parseSourceSyntax>,
) {
	const bannerLines: string[] = [];
	if (syntax.hasImportMeta) {
		bannerLines.push(
			`const ${IMPORT_META_URL_HELPER} = ${JSON.stringify(pathToFileURL(filePath).href)};`,
			`const ${IMPORT_META_RESOLVE_HELPER} = (specifier) => globalThis.__importMetaResolve(specifier, ${JSON.stringify(filePath)});`,
		);
	}
	return {
		banner: bannerLines.length > 0 ? bannerLines.join("\n") : undefined,
		define: syntax.hasImportMeta
			? {
					"import.meta.url": IMPORT_META_URL_HELPER,
					"import.meta.resolve": IMPORT_META_RESOLVE_HELPER,
				}
			: undefined,
		format: "esm" as const,
		loader: "js" as const,
		platform: "node" as const,
		sourcefile: filePath,
		target: "es2020",
	};
}

export async function sourceHasModuleSyntax(
	source: string,
	filePath?: string,
): Promise<boolean> {
	if (filePath?.endsWith(".mjs")) {
		return true;
	}
	if (filePath?.endsWith(".cjs")) {
		return false;
	}

	await init;
	return parseSourceSyntax(source, filePath).hasModuleSyntax;
}

export function transformSourceForRequireSync(
	source: string,
	filePath: string,
): string {
	if (!isJavaScriptLikePath(filePath)) {
		return source;
	}

	initSync();
	const syntax = parseSourceSyntax(source, filePath);
	if (!(syntax.hasModuleSyntax || syntax.hasDynamicImport || syntax.hasImportMeta)) {
		return source;
	}

	try {
		return transformSync(source, getRequireTransformOptions(filePath, syntax)).code;
	} catch {
		return source;
	}
}

export async function transformSourceForRequire(
	source: string,
	filePath: string,
): Promise<string> {
	if (!isJavaScriptLikePath(filePath)) {
		return source;
	}

	await init;
	const syntax = parseSourceSyntax(source, filePath);
	if (!(syntax.hasModuleSyntax || syntax.hasDynamicImport || syntax.hasImportMeta)) {
		return source;
	}

	try {
		return (
			await transform(source, getRequireTransformOptions(filePath, syntax))
		).code;
	} catch {
		return source;
	}
}

export async function transformSourceForImport(
	source: string,
	filePath: string,
): Promise<string> {
	if (!isJavaScriptLikePath(filePath)) {
		return source;
	}

	await init;
	const syntax = parseSourceSyntax(source, filePath);
	const needsTransform =
		source.includes(UNICODE_SET_REGEX_MARKER) || syntax.hasImportMeta;
	if (!(syntax.hasModuleSyntax || syntax.hasDynamicImport || syntax.hasImportMeta)) {
		return source;
	}
	if (!needsTransform) {
		return source;
	}

	try {
		return (await transform(source, getImportTransformOptions(filePath, syntax))).code;
	} catch {
		return source;
	}
}

export function transformSourceForImportSync(
	source: string,
	filePath: string,
	formatPath: string = filePath,
): string {
	if (!isJavaScriptLikePath(filePath)) {
		return source;
	}

	if (isCommonJsModuleForImportSync(source, formatPath)) {
		return buildCommonJsImportWrapper(source, filePath);
	}

	initSync();
	const syntax = parseSourceSyntax(source, filePath);
	const needsTransform =
		source.includes(UNICODE_SET_REGEX_MARKER) || syntax.hasImportMeta;
	if (!(syntax.hasModuleSyntax || syntax.hasDynamicImport || syntax.hasImportMeta)) {
		return source;
	}
	if (!needsTransform) {
		return source;
	}

	try {
		return transformSync(source, getImportTransformOptions(filePath, syntax)).code;
	} catch {
		return source;
	}
}
