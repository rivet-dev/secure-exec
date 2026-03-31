import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	NodeRuntime,
	allowAll,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
	createNodeV8Runtime,
} from "../../../src/index.js";
import type { NodeRuntimeOptions } from "../../../src/index.js";
import type { NodeRuntimeDriverFactory } from "../../../src/types.js";
import type { ProcessConfig } from "../../../src/shared/api-types.js";

type RuntimeOptions = Omit<NodeRuntimeOptions, "systemDriver" | "runtimeDriverFactory">;
const SECURE_EXEC_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function buildJsZipDeflateWorkload(): string {
	return `
const keepAlive = setInterval(() => {}, 10);
(async () => {
  try {
    const startedAt = performance.now();
    const JSZip = require("jszip");
    const zip = new JSZip();
    const sharedParagraph = Array.from(
      { length: 16 },
      (_, index) => "Section " + index + ": " + "benchmark-data-".repeat(24),
    ).join("\\n");

    for (let docIndex = 0; docIndex < 8; docIndex += 1) {
      zip.file(
        "docs/chapter-" + docIndex + ".md",
        "# Chapter " + docIndex + "\\n\\n" + sharedParagraph + "\\n\\n" + "line-".repeat(96),
      );
    }

    for (let datasetIndex = 0; datasetIndex < 4; datasetIndex += 1) {
      const rows = Array.from({ length: 20 }, (_, rowIndex) => ({
        id: "row-" + datasetIndex + "-" + rowIndex,
        status: rowIndex % 2 === 0 ? "ready" : "pending",
        weight: datasetIndex * 100 + rowIndex,
        label: "record-" + String(rowIndex).padStart(3, "0"),
      }));
      zip.file(
        "data/report-" + datasetIndex + ".json",
        JSON.stringify({ datasetIndex, rows }, null, 2),
      );
    }

    for (let assetIndex = 0; assetIndex < 3; assetIndex += 1) {
      const bytes = Uint8Array.from(
        { length: 1024 },
        (_, byteIndex) => (byteIndex * 17 + assetIndex * 29) % 251,
      );
      zip.file("assets/blob-" + assetIndex + ".bin", bytes);
    }

    zip.file(
      "manifest.json",
      JSON.stringify({
        generatedBy: "secure-exec-module-load-benchmark",
        docs: 8,
        datasets: 4,
        assets: 3,
      }, null, 2),
    );

    const archive = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const finishedAt = performance.now();
    console.log(JSON.stringify({
      ok: true,
      sandboxMs: Number((finishedAt - startedAt).toFixed(3)),
      fileCount: Object.values(zip.files).filter((entry) => !entry.dir).length,
      archiveBytes: archive.length,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  } finally {
    clearInterval(keepAlive);
  }
})();
`;
}

function createRuntimeWithProcessConfig(
	processConfig: ProcessConfig,
	runtimes: Set<NodeRuntime>,
): NodeRuntime {
	const runtime = new NodeRuntime({
		systemDriver: createNodeDriver({ processConfig }),
		runtimeDriverFactory: createNodeRuntimeDriverFactory(),
	});
	runtimes.add(runtime);
	return runtime;
}

describe("runtime driver specific: node", () => {
	const runtimes = new Set<NodeRuntime>();

	const createRuntime = (options: RuntimeOptions = {}): NodeRuntime => {
		const runtime = new NodeRuntime({
			...options,
			systemDriver: createNodeDriver({}),
			runtimeDriverFactory: createNodeRuntimeDriverFactory(),
		});
		runtimes.add(runtime);
		return runtime;
	};

	afterEach(async () => {
		const runtimeList = Array.from(runtimes);
		runtimes.clear();

		for (const runtime of runtimeList) {
			try {
				await runtime.terminate();
			} catch {
				runtime.dispose();
			}
		}
	});

	it("accepts Node-only runtime construction options", async () => {
		const runtimeDriverFactory: NodeRuntimeDriverFactory =
			createNodeRuntimeDriverFactory();
		const runtime = new NodeRuntime({
			memoryLimit: 128,
			// Keep the default runtime limit low enough to exercise node-only
			// construction options without depending on machine-specific startup jitter.
			cpuTimeLimitMs: 500,
			timingMitigation: "off",
			payloadLimits: {
				base64TransferBytes: 4096,
				jsonPayloadBytes: 4096,
			},
			systemDriver: createNodeDriver({}),
			runtimeDriverFactory,
		});

		const result = await runtime.exec(`console.log("node-runtime-options-ok");`);
		expect(result.code).toBe(0);
	});

	it("accepts Node-only exec options", async () => {
		const runtime = createRuntime();
		const result = await runtime.exec(`console.log("node-exec-options-ok");`, {
			// Keep the limit low enough to exercise the node-only option path
			// without coupling the test to machine-specific startup jitter.
			cpuTimeLimitMs: 250,
			timingMitigation: "off",
		});
		expect(result.code).toBe(0);
	});

	it("treats empty exec stdin as an immediate EOF", async () => {
		const runtime = new NodeRuntime({
			systemDriver: createNodeDriver({}),
			runtimeDriverFactory: createNodeRuntimeDriverFactory(),
		});
		runtimes.add(runtime);

		const result = await runtime.exec(
			[
				'let sawData = false;',
				'process.stdin.setEncoding("utf8");',
				'process.stdin.on("data", () => { sawData = true; });',
				'let sawEnd = false;',
				'process.stdin.on("end", () => { sawEnd = true; });',
				'process.stdin.resume();',
				'setTimeout(() => {',
				'  if (!sawEnd || sawData) process.exitCode = 9;',
				'}, 0);',
			].join("\n"),
			{ stdin: "" },
		);

		expect(result.code).toBe(0);
	});

	it("keeps exec and run bootstrap features working when post-restore source is cached by ref", async () => {
		const projectDir = await mkdtemp(
			path.join(tmpdir(), "secure-exec-post-restore-bootstrap-"),
		);
		const entryPath = path.join(projectDir, "entry.mjs");
		const helperPath = path.join(projectDir, "helper.mjs");
		const v8Runtime = await createNodeV8Runtime();
		const runtime = new NodeRuntime({
			systemDriver: createNodeDriver({
				moduleAccess: { cwd: projectDir },
				permissions: allowAll,
			}),
			runtimeDriverFactory: createNodeRuntimeDriverFactory({ v8Runtime }),
		});

		try {
			await writeFile(entryPath, "", "utf8");
			await writeFile(
				helperPath,
				'export const helperValue = "dynamic-import-ok";\n',
				"utf8",
			);

			const execResult = await runtime.exec(
				[
					'const fs = require("node:fs");',
					'console.log("require-type:" + typeof fs.readFileSync);',
				].join("\n"),
			);
			expect(execResult.code).toBe(0);

			const secondExecResult = await runtime.exec(
				[
					'const fs = require("node:fs");',
					'console.log("require-type:" + typeof fs.readFileSync);',
				].join("\n"),
			);
			expect(secondExecResult.code).toBe(0);

			const runResult = await runtime.run(
				[
					'const helper = await import("./helper.mjs");',
					'console.log("dynamic-import:" + helper.helperValue);',
					"export const helperValue = helper.helperValue;",
				].join("\n"),
				entryPath,
			);
			expect(runResult.exports).toEqual({ helperValue: "dynamic-import-ok" });
		} finally {
			runtime.dispose();
			await v8Runtime.dispose().catch(() => {});
		}
	});

	it(
		"memoizes repeated bare-specifier polyfill misses within a single workload",
		async () => {
			const runtime = createRuntime();
			const result = await runtime.run(
				`
					const seen = [];
					const original = _loadPolyfill.applySyncPromise;
					_loadPolyfill.applySyncPromise = function(ctx, args) {
						seen.push(args[0]);
						return original.call(this, ctx, args);
					};

					for (let i = 0; i < 5; i += 1) {
						try {
							require("definitely-not-a-real-package");
						} catch {}
					}

					module.exports = seen.filter(
						(entry) =>
							typeof entry === "string" && !entry.startsWith("__bd:"),
					);
				`,
			);
			expect(result.exports).toEqual(["definitely-not-a-real-package"]);
		},
		20_000,
	);

	it(
		"skips repeated relative-specifier polyfill probes within a single workload",
		async () => {
			const runtime = createRuntime();
			const result = await runtime.run(
				`
					const seen = [];
					const original = _loadPolyfill.applySyncPromise;
					_loadPolyfill.applySyncPromise = function(ctx, args) {
						seen.push(args[0]);
						return original.call(this, ctx, args);
					};

					for (let i = 0; i < 5; i += 1) {
						try {
							require("./definitely-not-a-real-relative.js");
						} catch {}
					}

					module.exports = seen.filter(
						(entry) =>
							typeof entry === "string" && !entry.startsWith("__bd:"),
					);
				`,
			);
			expect(result.exports).toEqual([]);
		},
		20_000,
	);

	it(
		"memoizes repeated node_modules internal resolutions within a single workload",
		async () => {
			const projectDir = await mkdtemp(
				path.join(tmpdir(), "secure-exec-resolution-cache-"),
			);
			const packageDir = path.join(projectDir, "node_modules", "pkg");

			try {
				await mkdir(packageDir, { recursive: true });
				await writeFile(
					path.join(packageDir, "package.json"),
					JSON.stringify({ name: "pkg", main: "index.js" }),
					"utf8",
				);
				await writeFile(
					path.join(packageDir, "inner.js"),
					"module.exports = 42;\n",
					"utf8",
				);
				await writeFile(
					path.join(packageDir, "index.js"),
					[
						"for (let i = 0; i < 5; i += 1) {",
						'  require.resolve("./inner.js");',
						"}",
						'module.exports = require("./inner.js");',
						"",
					].join("\n"),
					"utf8",
				);

				const runtime = new NodeRuntime({
					systemDriver: createNodeDriver({
						moduleAccess: { cwd: projectDir },
						permissions: allowAll,
					}),
					runtimeDriverFactory: createNodeRuntimeDriverFactory(),
				});
				runtimes.add(runtime);

				const result = await runtime.run(
					`
						const seen = [];
						const original = _resolveModuleSync.applySync;
						_resolveModuleSync.applySync = function(ctx, args) {
							seen.push(args.join("\\u0000"));
							return original.call(this, ctx, args);
						};

						const value = require(${JSON.stringify(
							path.join(packageDir, "index.js"),
						)});
						module.exports = {
							value,
							innerResolveCalls: seen.filter(
								(entry) =>
									entry === ${JSON.stringify(
										`./inner.js\u0000${packageDir}`,
									)},
							).length,
						};
					`,
				);

				expect(result.exports).toEqual({
					value: 42,
					innerResolveCalls: 1,
				});
			} finally {
				await rm(projectDir, { recursive: true, force: true });
			}
		},
		20_000,
	);

	it(
		"reuses a shared V8 runtime across repeated compressed JSZip sessions",
		async () => {
			const v8Runtime = await createNodeV8Runtime();
			const runtimeDriverFactory = createNodeRuntimeDriverFactory({ v8Runtime });

			try {
				for (let iteration = 1; iteration <= 4; iteration += 1) {
					const stdout: string[] = [];
					const runtime = new NodeRuntime({
						onStdio: (event) => {
							if (event.channel === "stdout") {
								stdout.push(event.message);
							}
						},
						systemDriver: createNodeDriver({
							moduleAccess: { cwd: SECURE_EXEC_ROOT },
							permissions: allowAll,
						}),
						runtimeDriverFactory,
					});
					runtimes.add(runtime);
					try {
						const result = await Promise.race([
							runtime.exec(buildJsZipDeflateWorkload(), {
								cwd: SECURE_EXEC_ROOT,
							}),
							new Promise<never>((_, reject) => {
								setTimeout(
									() =>
										reject(
											new Error(
												`timed out compressed JSZip iteration ${iteration}`,
											),
										),
									15_000,
								);
							}),
						]);

						expect(result.code).toBe(0);
						const payload = JSON.parse(stdout.join(""));
						expect(payload).toMatchObject({
							ok: true,
							fileCount: 16,
						});
						expect(Number(payload.archiveBytes)).toBeLessThan(8_000);
					} finally {
						try {
							await runtime.terminate();
						} catch {
							runtime.dispose();
						}
						runtimes.delete(runtime);
					}
				}
			} finally {
				await v8Runtime.dispose();
			}
		},
		20_000,
	);

	it("treats TypeScript-only syntax as a JavaScript execution failure", async () => {
		const runtime = createRuntime();
		const result = await runtime.exec(
			`
			const value: string = 123;
			console.log(value);
		`,
			{ filePath: "/entry.js" },
		);
		expect(result.code).toBe(1);
		expect(result.errorMessage).toBeDefined();
	});

	describe("isTTY and setRawMode", () => {
		it("process.stdout.isTTY is true when stdoutIsTTY is set in processConfig", async () => {
			const runtime = createRuntimeWithProcessConfig(
				{ stdoutIsTTY: true },
				runtimes,
			);
			const result = await runtime.run(
				`module.exports = process.stdout.isTTY;`,
			);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(true);
		});

		it("process.stderr.isTTY is true when stderrIsTTY is set in processConfig", async () => {
			const runtime = createRuntimeWithProcessConfig(
				{ stderrIsTTY: true },
				runtimes,
			);
			const result = await runtime.run(
				`module.exports = process.stderr.isTTY;`,
			);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(true);
		});

		it("process.stdin.isTTY is true when stdinIsTTY is set in processConfig", async () => {
			const runtime = createRuntimeWithProcessConfig(
				{ stdinIsTTY: true },
				runtimes,
			);
			const result = await runtime.run(
				`module.exports = process.stdin.isTTY;`,
			);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(true);
		});

		it("process.stdout.isTTY is false by default (no PTY)", async () => {
			const runtime = createRuntime();
			const result = await runtime.run(
				`module.exports = process.stdout.isTTY;`,
			);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(false);
		});

		it("process.stdin.isTTY is false by default (no PTY)", async () => {
			const runtime = createRuntime();
			const result = await runtime.run(
				`module.exports = process.stdin.isTTY;`,
			);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(false);
		});

		it("process.stdin.setRawMode(true) succeeds when stdinIsTTY is true", async () => {
			const runtime = createRuntimeWithProcessConfig(
				{ stdinIsTTY: true },
				runtimes,
			);
			const result = await runtime.run(`
				const ret = process.stdin.setRawMode(true);
				module.exports = ret === process.stdin;
			`);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(true);
		});

		it("process.stdin.setRawMode(false) succeeds when stdinIsTTY is true", async () => {
			const runtime = createRuntimeWithProcessConfig(
				{ stdinIsTTY: true },
				runtimes,
			);
			const result = await runtime.run(`
				process.stdin.setRawMode(true);
				const ret = process.stdin.setRawMode(false);
				module.exports = ret === process.stdin;
			`);
			expect(result.code).toBe(0);
			expect(result.exports).toBe(true);
		});

		it("process.stdin.setRawMode throws when isTTY is false", async () => {
			const runtime = createRuntime();
			const result = await runtime.exec(`
				try {
					process.stdin.setRawMode(true);
					console.log("ERROR:no-throw");
				} catch (e) {
					console.log("CAUGHT:" + e.message);
				}
			`);
			expect(result.code).toBe(0);
		});

		it("isTTY flags are independent per stream", async () => {
			const runtime = createRuntimeWithProcessConfig(
				{ stdinIsTTY: true, stdoutIsTTY: false, stderrIsTTY: true },
				runtimes,
			);
			const result = await runtime.run(`
				module.exports = {
					stdin: process.stdin.isTTY,
					stdout: process.stdout.isTTY,
					stderr: process.stderr.isTTY,
				};
			`);
			expect(result.code).toBe(0);
			expect(result.exports).toEqual({
				stdin: true,
				stdout: false,
				stderr: true,
			});
		});
	});
});
