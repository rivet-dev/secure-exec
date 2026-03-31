import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	allowAllFs,
	createInMemoryFileSystem,
	NodeRuntime,
} from "../../secure-exec/src/index.ts";
import { createNodeDriver } from "../src/index.ts";
import { createReplacementNodeRuntimeDriverFactory } from "../src/upstream/bootstrap-execution.ts";

type RuntimeHarness = {
	runtime?: NodeRuntime;
	tempDirs: string[];
};

async function createTempProject(tempDirs: string[]): Promise<string> {
	const projectDir = await mkdtemp(
		path.join(tmpdir(), "secure-exec-replacement-runtime-"),
	);
	tempDirs.push(projectDir);
	await mkdir(path.join(projectDir, "node_modules"), { recursive: true });
	return projectDir;
}

async function writePackage(
	projectDir: string,
	packageName: string,
	options: {
		main?: string;
		dependencies?: Record<string, string>;
		packageJsonFields?: Record<string, unknown>;
		files: Record<string, string>;
	},
): Promise<string> {
	const packageDir = path.join(
		projectDir,
		"node_modules",
		...packageName.split("/"),
	);
	await mkdir(packageDir, { recursive: true });
	await writeFile(
		path.join(packageDir, "package.json"),
		JSON.stringify(
			{
				name: packageName,
				main: options.main ?? "index.js",
				dependencies: options.dependencies,
				...options.packageJsonFields,
			},
			null,
			2,
		),
	);
	for (const [relativePath, contents] of Object.entries(options.files)) {
		const absolutePath = path.join(packageDir, relativePath);
		await mkdir(path.dirname(absolutePath), { recursive: true });
		await writeFile(absolutePath, contents);
	}
	return packageDir;
}

function createReplacementRuntime(
	filesystem = createInMemoryFileSystem(),
	options: {
		moduleAccessCwd?: string;
		cwd?: string;
	} = {},
): NodeRuntime {
	return new NodeRuntime({
		systemDriver: createNodeDriver({
			filesystem,
			moduleAccess: options.moduleAccessCwd
				? { cwd: options.moduleAccessCwd }
				: undefined,
			permissions: allowAllFs,
			processConfig: options.cwd ? { cwd: options.cwd } : undefined,
		}),
		runtimeDriverFactory: createReplacementNodeRuntimeDriverFactory(),
	});
}

describe("replacement runtime module resolution", () => {
	const harness: RuntimeHarness = { tempDirs: [] };

	afterEach(async () => {
		harness.runtime?.dispose();
		harness.runtime = undefined;
		while (harness.tempDirs.length > 0) {
			const dir = harness.tempDirs.pop();
			if (!dir) {
				continue;
			}
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("resolves sandbox package imports, exports, and createRequire paths without host fallback", async () => {
		const projectDir = await createTempProject(harness.tempDirs);
		await writePackage(projectDir, "transitive-dep", {
			files: {
				"index.js": "module.exports = { value: 'dep' };",
			},
		});
		await writePackage(projectDir, "exported", {
			dependencies: {
				"transitive-dep": "1.0.0",
			},
			packageJsonFields: {
				exports: {
					".": "./dist/index.cjs",
					"./feature": "./dist/feature.cjs",
				},
			},
			files: {
				"dist/index.cjs":
					"module.exports = { value: 'pkg:' + require('transitive-dep').value };",
				"dist/feature.cjs": "module.exports = { value: 'feature' };",
			},
		});

		const filesystem = createInMemoryFileSystem();
		await filesystem.mkdir("/root/app", { recursive: true });
		await filesystem.writeFile(
			"/root/app/package.json",
			JSON.stringify({
				name: "sandbox-app",
				imports: {
					"#helper": "./helper.js",
				},
			}),
		);
		await filesystem.writeFile(
			"/root/app/helper.js",
			"module.exports = { value: 'local-helper' };",
		);

		harness.runtime = createReplacementRuntime(filesystem, {
			moduleAccessCwd: projectDir,
			cwd: "/root/app",
		});

		const result = await harness.runtime.run<{
			local: string;
			pkg: string;
			feature: string;
			resolved: string;
			paths: string[];
		}>(
			`
			const Module = require('module');
			const req = Module.createRequire(__filename);
			module.exports = {
				local: require('#helper').value,
				pkg: require('exported').value,
				feature: req('exported/feature').value,
				resolved: req.resolve('exported/feature'),
				paths: req.resolve.paths('exported'),
			};
			`,
			"/root/app/index.js",
		);

		expect(result.code).toBe(0);
		expect(result.exports).toEqual(
			expect.objectContaining({
				local: "local-helper",
				pkg: "pkg:dep",
				feature: "feature",
				resolved: "/root/node_modules/exported/dist/feature.cjs",
			}),
		);
		expect(result.exports?.paths.slice(0, 3)).toEqual([
			"/root/app/node_modules",
			"/root/node_modules",
			"/node_modules",
		]);
	});

	it("fails deterministically for host-only packages when eval has no filePath", async () => {
		harness.runtime = createReplacementRuntime(createInMemoryFileSystem(), {
			cwd: "/sandbox",
		});

		const result = await harness.runtime.exec(`require("cjs-module-lexer");`, {
			cwd: "/sandbox",
		});

		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain("Cannot find module 'cjs-module-lexer'");
	});

	it("supports pnpm virtual-store symlink targets and realpath-derived assets", async () => {
		const filesystem = createInMemoryFileSystem();
		await filesystem.mkdir("/node_modules/.pnpm/agent-pkg@1.0.0/node_modules/agent-pkg", {
			recursive: true,
		});
		await filesystem.mkdir("/node_modules/.pnpm/chalkish@1.0.0/node_modules/chalkish", {
			recursive: true,
		});
		await filesystem.writeFile(
			"/node_modules/.pnpm/agent-pkg@1.0.0/node_modules/agent-pkg/package.json",
			JSON.stringify(
				{
					name: "agent-pkg",
					version: "1.0.0",
					dependencies: {
						chalkish: "1.0.0",
					},
				},
				null,
				2,
			),
		);
		await filesystem.writeFile(
			"/node_modules/.pnpm/agent-pkg@1.0.0/node_modules/agent-pkg/README.md",
			"agent-readme\n",
		);
		await filesystem.writeFile(
			"/node_modules/.pnpm/agent-pkg@1.0.0/node_modules/agent-pkg/index.js",
			`
			const fs = require('fs');
			const path = require('path');
			const dep = require('chalkish');
			const readme = fs.readFileSync(
				path.join(path.dirname(fs.realpathSync(__filename)), 'README.md'),
				'utf8',
			).trim();
			module.exports = { value: dep.value + ':' + readme };
			`.trim(),
		);
		await filesystem.writeFile(
			"/node_modules/.pnpm/chalkish@1.0.0/node_modules/chalkish/package.json",
			JSON.stringify({ name: "chalkish", version: "1.0.0" }, null, 2),
		);
		await filesystem.writeFile(
			"/node_modules/.pnpm/chalkish@1.0.0/node_modules/chalkish/index.js",
			"module.exports = { value: 'chalk' };",
		);
		await filesystem.symlink(
			".pnpm/agent-pkg@1.0.0/node_modules/agent-pkg",
			"/node_modules/agent-pkg",
		);
		await filesystem.symlink(
			"../../chalkish@1.0.0/node_modules/chalkish",
			"/node_modules/.pnpm/agent-pkg@1.0.0/node_modules/chalkish",
		);

		harness.runtime = new NodeRuntime({
			systemDriver: {
				filesystem,
				permissions: allowAllFs,
				commandExecutor: undefined,
				network: undefined,
				runtime: {
					process: {
						cwd: "/root",
					},
					os: {},
				},
			},
			runtimeDriverFactory: createReplacementNodeRuntimeDriverFactory(),
		});

		const result = await harness.runtime.run<{ value: string }>(
			`
			module.exports = require('agent-pkg');
			`,
			"/root/index.js",
		);

		expect(result.code).toBe(0);
		expect(result.exports).toEqual({ value: "chalk:agent-readme" });
	});
});
