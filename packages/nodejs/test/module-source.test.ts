import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	sourceHasModuleSyntax,
	transformSourceForImportSync,
	transformSourceForRequireSync,
} from "../src/module-source.ts";

describe("module source transforms", () => {
	it("normalizes shebang ESM entrypoints before require-mode wrapping", () => {
		const source = [
			"#!/usr/bin/env node",
			'import { main } from "./main.js";',
			"main();",
		].join("\n");

		const transformed = transformSourceForRequireSync(source, "/pkg/dist/cli.js");

		expect(transformed.startsWith("#!")).toBe(false);
		expect(transformed).not.toContain("#!/usr/bin/env node");
		expect(transformed.startsWith("/*__secure_exec_require_esm__*/")).toBe(true);
		expect(transformed).toContain('require("./main.js")');
		expect(() =>
			new Function(
				"exports",
				"require",
				"module",
				"__secureExecFilename",
				"__secureExecDirname",
				"__dynamicImport",
				transformed,
			),
		).not.toThrow();
	});

	it("normalizes shebang ESM entrypoints for import-mode passthrough", () => {
		const source = [
			"#!/usr/bin/env node",
			'import { main } from "./main.js";',
			"main();",
		].join("\n");

		const transformed = transformSourceForImportSync(source, "/pkg/dist/cli.js");

		expect(transformed.startsWith("#!")).toBe(false);
		expect(transformed.startsWith("///usr/bin/env node")).toBe(true);
		expect(transformed).toContain('import { main } from "./main.js";');
	});

	it("detects module syntax when a BOM-prefixed shebang is present", async () => {
		const source = '\uFEFF#!/usr/bin/env node\nimport "./main.js";\n';

		await expect(sourceHasModuleSyntax(source, "/pkg/dist/cli.js")).resolves.toBe(true);
	});

	it("expands nested star re-exports into named exports", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "secure-exec-module-source-"));
		const webhooksDir = join(tempDir, "resources", "webhooks");
		const entryPath = join(tempDir, "resources", "webhooks.mjs");

		mkdirSync(webhooksDir, { recursive: true });
		writeFileSync(entryPath, 'export * from "./webhooks/index.mjs";\n');
		writeFileSync(
			join(webhooksDir, "index.mjs"),
			'export * from "./webhooks.mjs";\n',
		);
		writeFileSync(
			join(webhooksDir, "webhooks.mjs"),
			"export class Webhooks {}\n",
		);

		const transformed = transformSourceForImportSync(
			readFileSync(entryPath, "utf8"),
			entryPath,
		);

		expect(transformed).toContain(
			"export { Webhooks } from './webhooks/index.mjs';",
		);
	});
});
