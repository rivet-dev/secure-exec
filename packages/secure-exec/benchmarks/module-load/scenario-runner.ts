import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
	allowAll,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
	createNodeV8Runtime,
	NodeFileSystem,
	NodeRuntime,
} from "../../src/index.js";
import {
	createMockLlmServer,
	type MockLlmResponse,
	type MockLlmServerHandle,
} from "../../tests/cli-tools/mock-llm-server.ts";
import {
	getModuleLoadScenario,
	type ModuleLoadScenarioId,
} from "./scenario-catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromBench = createRequire(import.meta.url);
const SECURE_EXEC_ROOT = path.resolve(__dirname, "../..");
const RESULTS_ROOT = path.resolve(__dirname, "../results/module-load");
const PI_PACKAGE_ROOT = path.resolve(
	SECURE_EXEC_ROOT,
	"node_modules/@mariozechner/pi-coding-agent",
);
const PI_SDK_ENTRY = path.join(PI_PACKAGE_ROOT, "dist/index.js");
const PI_CLI_ENTRY = path.join(PI_PACKAGE_ROOT, "dist/cli.js");
const PI_MAIN_ENTRY = path.join(PI_PACKAGE_ROOT, "dist/main.js");
const PDF_LIB_ENTRY = requireFromBench.resolve("pdf-lib");
const JSZIP_ENTRY = requireFromBench.resolve("jszip");
const PI_BASE_FLAGS = [
	"--verbose",
	"--no-session",
	"--no-extensions",
	"--no-skills",
	"--no-prompt-templates",
	"--no-themes",
	"--provider",
	"anthropic",
	"--model",
	"claude-sonnet-4-20250514",
] as const;
const PI_SNAPSHOT_PRELOADED_POLYFILLS = [
	"util",
	"buffer",
	"string_decoder",
	"events",
	"path",
	"internal/mime",
	"constants",
	"vm",
	"tty",
] as const;

type BenchmarkSample = {
	iteration: number;
	wallMs: number;
	code: number;
	errorMessage?: string;
	stdoutBytes: number;
	stderrBytes: number;
	sandboxMs?: number;
	mockRequests?: number;
	stdoutPreview: string;
	stderrPreview: string;
	checks: Record<string, string | number | boolean | undefined>;
};

type ScenarioResult = {
	scenarioId: string;
	title: string;
	target: string;
	kind: string;
	description: string;
	createdAt: string;
	iterations: number;
	artifacts: {
		resultFile: string;
		metricsFile: string;
		logFile: string;
	};
	samples: BenchmarkSample[];
	summary: {
		coldWallMs: number;
		warmWallMsMean?: number;
		coldSandboxMs?: number;
		warmSandboxMsMean?: number;
	};
};

type RuntimeCapture = {
	code: number;
	errorMessage?: string;
	stdoutText: string;
	stderrText: string;
	wallMs: number;
};

type ScenarioArgs = {
	scenarioId: ModuleLoadScenarioId;
	resultFile: string;
	metricsFile: string;
	logFile: string;
	binaryPath: string;
	metricsHost: string;
	metricsPort: number;
	metricsPath: string;
	iterations: number;
};

function readArg(name: string): string {
	const flag = `--${name}`;
	const index = process.argv.indexOf(flag);
	if (index === -1 || index + 1 >= process.argv.length) {
		throw new Error(`Missing required argument: ${flag}`);
	}
	return process.argv[index + 1];
}

function parseArgs(): ScenarioArgs {
	const metricsPort = Number(readArg("metrics-port"));
	if (
		!Number.isInteger(metricsPort) ||
		metricsPort <= 0 ||
		metricsPort > 65535
	) {
		throw new Error(`Invalid --metrics-port: ${metricsPort}`);
	}
	const iterations = Number(readArg("iterations"));
	if (!Number.isInteger(iterations) || iterations <= 0) {
		throw new Error(`Invalid --iterations: ${iterations}`);
	}
	return {
		scenarioId: readArg("scenario") as ModuleLoadScenarioId,
		resultFile: readArg("result-file"),
		metricsFile: readArg("metrics-file"),
		logFile: readArg("log-file"),
		binaryPath: readArg("binary-path"),
		metricsHost: readArg("metrics-host"),
		metricsPort,
		metricsPath: readArg("metrics-path"),
		iterations,
	};
}

function round(value: number): number {
	return Number(value.toFixed(3));
}

function mean(values: number[]): number | undefined {
	if (values.length === 0) return undefined;
	return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function preview(text: string, maxBytes = 240): string {
	return Buffer.from(text, "utf8").subarray(0, maxBytes).toString("utf8");
}

function getSnapshotPreloadedPolyfills(
	scenarioId: ModuleLoadScenarioId,
): readonly string[] | undefined {
	if (scenarioId.startsWith("pi-")) {
		return PI_SNAPSHOT_PRELOADED_POLYFILLS;
	}
	return undefined;
}

function parseTrailingJsonObject(stdoutText: string): Record<string, unknown> {
	const trimmed = stdoutText.trim();
	if (!trimmed) {
		throw new Error("sandbox produced no stdout");
	}
	for (
		let index = trimmed.lastIndexOf("{");
		index >= 0;
		index = trimmed.lastIndexOf("{", index - 1)
	) {
		try {
			return JSON.parse(trimmed.slice(index)) as Record<string, unknown>;
		} catch {
			// keep scanning backward for the trailing JSON object
		}
	}
	throw new Error(
		`sandbox produced no trailing JSON object: ${JSON.stringify(stdoutText)}`,
	);
}

function assertInstalled(): void {
	if (!existsSync(PI_SDK_ENTRY)) {
		throw new Error(
			"@mariozechner/pi-coding-agent is not installed in packages/secure-exec/node_modules",
		);
	}
	if (!existsSync(PI_CLI_ENTRY)) {
		throw new Error("@mariozechner/pi-coding-agent CLI entry is not installed");
	}
	if (!existsSync(PI_MAIN_ENTRY)) {
		throw new Error(
			"@mariozechner/pi-coding-agent main entry is not installed",
		);
	}
	if (!existsSync(PDF_LIB_ENTRY)) {
		throw new Error("pdf-lib is not installed");
	}
	if (!existsSync(JSZIP_ENTRY)) {
		throw new Error("jszip is not installed");
	}
}

async function createPiWorkDir(
	mockServer: MockLlmServerHandle,
	withModelsJson: boolean,
): Promise<{ workDir: string; agentDir: string }> {
	const workDir = await mkdtemp(path.join(tmpdir(), "secure-exec-bench-"));
	const agentDir = path.join(workDir, ".pi", "agent");
	await mkdir(agentDir, { recursive: true });
	if (withModelsJson) {
		await writeFile(
			path.join(agentDir, "models.json"),
			JSON.stringify(
				{
					providers: {
						anthropic: {
							baseUrl: `http://127.0.0.1:${mockServer.port}`,
						},
					},
				},
				null,
				2,
			),
		);
	}
	return { workDir, agentDir };
}

async function runRuntimeExec(
	v8Runtime: Awaited<ReturnType<typeof createNodeV8Runtime>>,
	options: {
		code: string;
		cwd: string;
		stdin?: string;
		useHostFileSystem?: boolean;
		useNetwork?: boolean;
		snapshotPreloadedPolyfills?: readonly string[];
	},
): Promise<RuntimeCapture> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const runtime = new NodeRuntime({
		onStdio: (event) => {
			if (event.channel === "stdout") stdout.push(event.message);
			if (event.channel === "stderr") stderr.push(event.message);
		},
		systemDriver: createNodeDriver({
			filesystem: options.useHostFileSystem ? new NodeFileSystem() : undefined,
			moduleAccess: { cwd: SECURE_EXEC_ROOT },
			permissions: allowAll,
			useDefaultNetwork: options.useNetwork,
		}),
		runtimeDriverFactory: createNodeRuntimeDriverFactory({
			v8Runtime,
			snapshotPreloadedPolyfills: options.snapshotPreloadedPolyfills,
		}),
	});

	const startedAt = performance.now();
	try {
		const result = await runtime.exec(options.code, {
			cwd: options.cwd,
			stdin: options.stdin,
		});
		return {
			code: result.code,
			errorMessage: result.errorMessage,
			stdoutText: stdout.join(""),
			stderrText: stderr.join(""),
			wallMs: round(performance.now() - startedAt),
		};
	} finally {
		await runtime.terminate();
	}
}

function buildHonoStartupCode(): string {
	return `
(async () => {
  try {
    const startedAt = performance.now();
    const { Hono } = require("hono");
    const app = new Hono();
    app.get("/", (context) => context.text("ok"));
    const finishedAt = performance.now();
    console.log(JSON.stringify({
      ok: true,
      sandboxMs: Number((finishedAt - startedAt).toFixed(3)),
      honoType: typeof Hono,
      fetchType: typeof app.fetch,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  }
})();
`;
}

function buildHonoEndToEndCode(): string {
	return `
(async () => {
  try {
    const startedAt = performance.now();
    const { Hono } = require("hono");
    const app = new Hono();
    app.get("/hello", (context) => context.json({ ok: true, framework: "hono" }));
    const response = await app.request("http://localhost/hello");
    const body = await response.text();
    const finishedAt = performance.now();
    console.log(JSON.stringify({
      ok: true,
      sandboxMs: Number((finishedAt - startedAt).toFixed(3)),
      status: response.status,
      body,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  }
})();
`;
}

function buildPdfLibStartupCode(): string {
	return `
(async () => {
  try {
    const startedAt = performance.now();
    const { PDFDocument, StandardFonts } = require("pdf-lib");
    const pdfDoc = await PDFDocument.create();
    await pdfDoc.embedFont(StandardFonts.Helvetica);
    const finishedAt = performance.now();
    console.log(JSON.stringify({
      ok: true,
      sandboxMs: Number((finishedAt - startedAt).toFixed(3)),
      pdfDocumentType: typeof PDFDocument,
      standardFontName: String(StandardFonts.Helvetica),
      pageCount: pdfDoc.getPageCount(),
    }));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  }
})();
`;
}

function buildPdfLibEndToEndCode(): string {
	return `
const keepAlive = setInterval(() => {}, 10);
(async () => {
  try {
    const startedAt = performance.now();
    const { PDFDocument, StandardFonts } = require("pdf-lib");
    const pdfDoc = await PDFDocument.create();
    await pdfDoc.embedFont(StandardFonts.Helvetica);
    const form = pdfDoc.getForm();

    for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
      const page = pdfDoc.addPage([612, 792]);
      page.drawText("SecureExec pdf-lib benchmark", {
        x: 50,
        y: 750,
        size: 18,
      });
      for (let fieldIndex = 0; fieldIndex < 10; fieldIndex += 1) {
        const textField = form.createTextField("p" + pageIndex + "_f" + fieldIndex);
        textField.setText("field-" + pageIndex + "-" + fieldIndex);
        textField.addToPage(page, {
          x: 50,
          y: 700 - fieldIndex * 60,
          width: 220,
          height: 28,
        });
      }
    }

    const bytes = await pdfDoc.save();
    const finishedAt = performance.now();
    console.log(JSON.stringify({
      ok: true,
      sandboxMs: Number((finishedAt - startedAt).toFixed(3)),
      pageCount: pdfDoc.getPageCount(),
      fieldCount: form.getFields().length,
      savedSize: bytes.length,
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

function buildJsZipStartupCode(): string {
	return `
(async () => {
  try {
    const startedAt = performance.now();
    const JSZip = require("jszip");
    const zip = new JSZip();
    zip.file("README.txt", "secure-exec benchmark");
    const fileCount = Object.values(zip.files).filter((entry) => !entry.dir).length;
    const finishedAt = performance.now();
    console.log(JSON.stringify({
      ok: true,
      sandboxMs: Number((finishedAt - startedAt).toFixed(3)),
      jszipType: typeof JSZip,
      generateAsyncType: typeof zip.generateAsync,
      fileCount,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  }
})();
`;
}

function buildJsZipEndToEndCode(): string {
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
    const fileCount = Object.values(zip.files).filter((entry) => !entry.dir).length;
    const finishedAt = performance.now();
    console.log(JSON.stringify({
      ok: true,
      sandboxMs: Number((finishedAt - startedAt).toFixed(3)),
      fileCount,
      archiveBytes: archive.length,
      compression: "DEFLATE",
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

function buildPiSdkStartupCode(): string {
	return `
(async () => {
  try {
    const startedAt = performance.now();
    const pi = await globalThis.__dynamicImport(${JSON.stringify(PI_SDK_ENTRY)}, "/bench-pi-sdk-startup.mjs");
    const finishedAt = performance.now();
    console.log(JSON.stringify({
      ok: true,
      sandboxMs: Number((finishedAt - startedAt).toFixed(3)),
      createAgentSessionType: typeof pi.createAgentSession,
      runPrintModeType: typeof pi.runPrintMode,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  }
})();
`;
}

function buildPiSdkEndToEndCode(workDir: string, agentDir: string): string {
	return `
(async () => {
  let session;
  try {
    const startedAt = performance.now();
    const pi = await globalThis.__dynamicImport(${JSON.stringify(PI_SDK_ENTRY)}, "/bench-pi-sdk-end-to-end.mjs");
    const authStorage = pi.AuthStorage.inMemory();
    authStorage.setRuntimeApiKey("anthropic", "test-key");
    const modelRegistry = new pi.ModelRegistry(authStorage, ${JSON.stringify(path.join(agentDir, "models.json"))});
    const model = modelRegistry.find("anthropic", "claude-sonnet-4-20250514")
      ?? modelRegistry.getAll().find((candidate) => candidate.provider === "anthropic");
    if (!model) throw new Error("No anthropic model");
    ({ session } = await pi.createAgentSession({
      cwd: ${JSON.stringify(workDir)},
      agentDir: ${JSON.stringify(agentDir)},
      authStorage,
      modelRegistry,
      model,
      tools: pi.createCodingTools(${JSON.stringify(workDir)}),
      sessionManager: pi.SessionManager.inMemory(),
    }));
    await pi.runPrintMode(session, {
      mode: "text",
      initialMessage: "Say hello from the benchmark runner.",
    });
    const finishedAt = performance.now();
    console.log(JSON.stringify({
      ok: true,
      sandboxMs: Number((finishedAt - startedAt).toFixed(3)),
      messageCount: session.state?.messages?.length ?? 0,
    }));
    session.dispose();
  } catch (error) {
    if (session) {
      try { session.dispose(); } catch {}
    }
    console.log(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  }
})();
`;
}

function buildPiCliStartupCode(workDir: string, agentDir: string): string {
	return `
process.title = "pi";
(async () => {
  try {
    const { main } = await globalThis.__dynamicImport(${JSON.stringify(PI_MAIN_ENTRY)}, "/bench-pi-cli-startup.mjs");
    process.env.HOME = ${JSON.stringify(workDir)};
    process.env.PI_CODING_AGENT_DIR = ${JSON.stringify(agentDir)};
    process.env.NO_COLOR = "1";
    await main(["--help"]);
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  }
})();
`;
}

function buildPiCliEndToEndCode(workDir: string, agentDir: string): string {
	return `
process.title = "pi";
let finishState = "running";
let failureText = "";
const keepAlive = setInterval(() => {
  if (finishState === "running") return;
  clearInterval(keepAlive);
  if (finishState === "exit-0") {
    process.exit(0);
    return;
  }
  if (finishState === "error") {
    console.error(failureText);
    process.exitCode = 1;
  }
}, 10);
(async () => {
  try {
    const { main } = await globalThis.__dynamicImport(${JSON.stringify(PI_MAIN_ENTRY)}, "/bench-pi-cli-end-to-end-cli.mjs");
    process.env.HOME = ${JSON.stringify(workDir)};
    process.env.PI_CODING_AGENT_DIR = ${JSON.stringify(agentDir)};
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.NO_COLOR = "1";
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    await main([
      ...${JSON.stringify(PI_BASE_FLAGS)},
      "--print",
      "Say hello from the CLI benchmark.",
    ]);
    finishState = "done";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.name === "ProcessExitError" && message === "process.exit(0)") {
      finishState = "exit-0";
      return;
    }
    failureText = error instanceof Error ? error.stack ?? error.message : String(error);
    finishState = "error";
  }
})();
`;
}

async function runScenarioIteration(
	v8Runtime: Awaited<ReturnType<typeof createNodeV8Runtime>>,
	scenarioId: ModuleLoadScenarioId,
	mockServer: MockLlmServerHandle,
	iteration: number,
): Promise<BenchmarkSample> {
	const snapshotPreloadedPolyfills = getSnapshotPreloadedPolyfills(scenarioId);
	const runCapture = (options: Parameters<typeof runRuntimeExec>[1]) =>
		runRuntimeExec(v8Runtime, {
			...options,
			snapshotPreloadedPolyfills,
		});

	switch (scenarioId) {
		case "hono-startup": {
			const capture = await runCapture({
				code: buildHonoStartupCode(),
				cwd: SECURE_EXEC_ROOT,
			});
			const payload = parseTrailingJsonObject(capture.stdoutText);
			if (payload.ok !== true) {
				throw new Error(`Hono startup failed: ${JSON.stringify(payload)}`);
			}
			return {
				iteration,
				wallMs: capture.wallMs,
				code: capture.code,
				errorMessage: capture.errorMessage,
				stdoutBytes: Buffer.byteLength(capture.stdoutText, "utf8"),
				stderrBytes: Buffer.byteLength(capture.stderrText, "utf8"),
				sandboxMs: Number(payload.sandboxMs ?? 0),
				stdoutPreview: preview(capture.stdoutText),
				stderrPreview: preview(capture.stderrText),
				checks: {
					honoType: String(payload.honoType),
					fetchType: String(payload.fetchType),
				},
			};
		}
		case "hono-end-to-end": {
			const capture = await runCapture({
				code: buildHonoEndToEndCode(),
				cwd: SECURE_EXEC_ROOT,
			});
			const payload = parseTrailingJsonObject(capture.stdoutText);
			if (payload.ok !== true || payload.status !== 200) {
				throw new Error(`Hono end-to-end failed: ${JSON.stringify(payload)}`);
			}
			return {
				iteration,
				wallMs: capture.wallMs,
				code: capture.code,
				errorMessage: capture.errorMessage,
				stdoutBytes: Buffer.byteLength(capture.stdoutText, "utf8"),
				stderrBytes: Buffer.byteLength(capture.stderrText, "utf8"),
				sandboxMs: Number(payload.sandboxMs ?? 0),
				stdoutPreview: preview(capture.stdoutText),
				stderrPreview: preview(capture.stderrText),
				checks: {
					status: Number(payload.status),
					body: String(payload.body),
				},
			};
		}
		case "pdf-lib-startup": {
			const capture = await runCapture({
				code: buildPdfLibStartupCode(),
				cwd: SECURE_EXEC_ROOT,
			});
			const payload = parseTrailingJsonObject(capture.stdoutText);
			if (payload.ok !== true || payload.pdfDocumentType !== "function") {
				throw new Error(`pdf-lib startup failed: ${JSON.stringify(payload)}`);
			}
			return {
				iteration,
				wallMs: capture.wallMs,
				code: capture.code,
				errorMessage: capture.errorMessage,
				stdoutBytes: Buffer.byteLength(capture.stdoutText, "utf8"),
				stderrBytes: Buffer.byteLength(capture.stderrText, "utf8"),
				sandboxMs: Number(payload.sandboxMs ?? 0),
				stdoutPreview: preview(capture.stdoutText),
				stderrPreview: preview(capture.stderrText),
				checks: {
					pdfDocumentType: String(payload.pdfDocumentType),
					pageCount: Number(payload.pageCount ?? 0),
					standardFontName: String(payload.standardFontName),
				},
			};
		}
		case "pdf-lib-end-to-end": {
			const capture = await runCapture({
				code: buildPdfLibEndToEndCode(),
				cwd: SECURE_EXEC_ROOT,
			});
			const payload = parseTrailingJsonObject(capture.stdoutText);
			if (
				payload.ok !== true ||
				Number(payload.pageCount ?? 0) !== 5 ||
				Number(payload.fieldCount ?? 0) !== 50 ||
				Number(payload.savedSize ?? 0) <= 10_000
			) {
				throw new Error(`pdf-lib end-to-end failed: ${JSON.stringify(payload)}`);
			}
			return {
				iteration,
				wallMs: capture.wallMs,
				code: capture.code,
				errorMessage: capture.errorMessage,
				stdoutBytes: Buffer.byteLength(capture.stdoutText, "utf8"),
				stderrBytes: Buffer.byteLength(capture.stderrText, "utf8"),
				sandboxMs: Number(payload.sandboxMs ?? 0),
				stdoutPreview: preview(capture.stdoutText),
				stderrPreview: preview(capture.stderrText),
				checks: {
					pageCount: Number(payload.pageCount ?? 0),
					fieldCount: Number(payload.fieldCount ?? 0),
					savedSize: Number(payload.savedSize ?? 0),
				},
			};
		}
		case "jszip-startup": {
			const capture = await runCapture({
				code: buildJsZipStartupCode(),
				cwd: SECURE_EXEC_ROOT,
			});
			const payload = parseTrailingJsonObject(capture.stdoutText);
			if (
				payload.ok !== true ||
				payload.jszipType !== "function" ||
				payload.generateAsyncType !== "function"
			) {
				throw new Error(`JSZip startup failed: ${JSON.stringify(payload)}`);
			}
			return {
				iteration,
				wallMs: capture.wallMs,
				code: capture.code,
				errorMessage: capture.errorMessage,
				stdoutBytes: Buffer.byteLength(capture.stdoutText, "utf8"),
				stderrBytes: Buffer.byteLength(capture.stderrText, "utf8"),
				sandboxMs: Number(payload.sandboxMs ?? 0),
				stdoutPreview: preview(capture.stdoutText),
				stderrPreview: preview(capture.stderrText),
				checks: {
					jszipType: String(payload.jszipType),
					generateAsyncType: String(payload.generateAsyncType),
					fileCount: Number(payload.fileCount ?? 0),
				},
			};
		}
		case "jszip-end-to-end": {
			const capture = await runCapture({
				code: buildJsZipEndToEndCode(),
				cwd: SECURE_EXEC_ROOT,
			});
			const payload = parseTrailingJsonObject(capture.stdoutText);
			if (
				payload.ok !== true ||
				Number(payload.fileCount ?? 0) !== 16 ||
				Number(payload.archiveBytes ?? 0) <= 2_000 ||
				Number(payload.archiveBytes ?? 0) >= 8_000 ||
				payload.compression !== "DEFLATE"
			) {
				throw new Error(`JSZip end-to-end failed: ${JSON.stringify(payload)}`);
			}
			return {
				iteration,
				wallMs: capture.wallMs,
				code: capture.code,
				errorMessage: capture.errorMessage,
				stdoutBytes: Buffer.byteLength(capture.stdoutText, "utf8"),
				stderrBytes: Buffer.byteLength(capture.stderrText, "utf8"),
				sandboxMs: Number(payload.sandboxMs ?? 0),
				stdoutPreview: preview(capture.stdoutText),
				stderrPreview: preview(capture.stderrText),
				checks: {
					fileCount: Number(payload.fileCount ?? 0),
					archiveBytes: Number(payload.archiveBytes ?? 0),
					compression: String(payload.compression ?? ""),
				},
			};
		}
		case "pi-sdk-startup": {
			const capture = await runCapture({
				code: buildPiSdkStartupCode(),
				cwd: SECURE_EXEC_ROOT,
			});
			const payload = parseTrailingJsonObject(capture.stdoutText);
			if (payload.ok !== true) {
				throw new Error(`Pi SDK startup failed: ${JSON.stringify(payload)}`);
			}
			return {
				iteration,
				wallMs: capture.wallMs,
				code: capture.code,
				errorMessage: capture.errorMessage,
				stdoutBytes: Buffer.byteLength(capture.stdoutText, "utf8"),
				stderrBytes: Buffer.byteLength(capture.stderrText, "utf8"),
				sandboxMs: Number(payload.sandboxMs ?? 0),
				stdoutPreview: preview(capture.stdoutText),
				stderrPreview: preview(capture.stderrText),
				checks: {
					createAgentSessionType: String(payload.createAgentSessionType),
					runPrintModeType: String(payload.runPrintModeType),
				},
			};
		}
		case "pi-sdk-end-to-end": {
			mockServer.reset([
				{
					type: "text",
					text: "benchmark-pi-sdk-response",
				} satisfies MockLlmResponse,
			]);
			const { workDir, agentDir } = await createPiWorkDir(mockServer, true);
			try {
				const capture = await runCapture({
					code: buildPiSdkEndToEndCode(workDir, agentDir),
					cwd: workDir,
					useHostFileSystem: true,
					useNetwork: true,
				});
				const payload = parseTrailingJsonObject(capture.stdoutText);
				if (payload.ok !== true) {
					throw new Error(
						`Pi SDK end-to-end failed: ${JSON.stringify(payload)}`,
					);
				}
				return {
					iteration,
					wallMs: capture.wallMs,
					code: capture.code,
					errorMessage: capture.errorMessage,
					stdoutBytes: Buffer.byteLength(capture.stdoutText, "utf8"),
					stderrBytes: Buffer.byteLength(capture.stderrText, "utf8"),
					sandboxMs: Number(payload.sandboxMs ?? 0),
					mockRequests: mockServer.requestCount(),
					stdoutPreview: preview(capture.stdoutText),
					stderrPreview: preview(capture.stderrText),
					checks: {
						messageCount: Number(payload.messageCount ?? 0),
					},
				};
			} finally {
				await rm(workDir, { recursive: true, force: true });
			}
		}
		case "pi-cli-startup": {
			const { workDir, agentDir } = await createPiWorkDir(mockServer, false);
			try {
				const capture = await runCapture({
					code: buildPiCliStartupCode(workDir, agentDir),
					cwd: workDir,
					stdin: "",
					useHostFileSystem: true,
				});
				if (capture.code !== 0 || !capture.stdoutText.trim()) {
					throw new Error(
						`Pi CLI startup failed with code ${capture.code}: ${capture.stderrText || capture.stdoutText}`,
					);
				}
				return {
					iteration,
					wallMs: capture.wallMs,
					code: capture.code,
					errorMessage: capture.errorMessage,
					stdoutBytes: Buffer.byteLength(capture.stdoutText, "utf8"),
					stderrBytes: Buffer.byteLength(capture.stderrText, "utf8"),
					stdoutPreview: preview(capture.stdoutText),
					stderrPreview: preview(capture.stderrText),
					checks: {
						stdoutHasUsage: capture.stdoutText.includes("Usage"),
					},
				};
			} finally {
				await rm(workDir, { recursive: true, force: true });
			}
		}
		case "pi-cli-end-to-end": {
			mockServer.reset([
				{
					type: "text",
					text: "benchmark-pi-cli-response",
				} satisfies MockLlmResponse,
			]);
			const { workDir, agentDir } = await createPiWorkDir(mockServer, true);
			try {
				const capture = await runCapture({
					code: buildPiCliEndToEndCode(workDir, agentDir),
					cwd: workDir,
					stdin: "",
					useHostFileSystem: true,
					useNetwork: true,
				});
				const mockRequests = mockServer.requestCount();
				if (
					capture.code !== 0 ||
					!capture.stdoutText.includes("benchmark-pi-cli-response")
				) {
					throw new Error(
						`Pi CLI end-to-end failed with code ${capture.code}; mockRequests=${mockRequests}; stdout=${JSON.stringify(preview(capture.stdoutText))}; stderr=${JSON.stringify(preview(capture.stderrText))}`,
					);
				}
				return {
					iteration,
					wallMs: capture.wallMs,
					code: capture.code,
					errorMessage: capture.errorMessage,
					stdoutBytes: Buffer.byteLength(capture.stdoutText, "utf8"),
					stderrBytes: Buffer.byteLength(capture.stderrText, "utf8"),
					mockRequests,
					stdoutPreview: preview(capture.stdoutText),
					stderrPreview: preview(capture.stderrText),
					checks: {
						responseSeen: true,
					},
				};
			} finally {
				await rm(workDir, { recursive: true, force: true });
			}
		}
	}
	throw new Error(`Unhandled scenario: ${String(scenarioId)}`);
}

async function main(): Promise<void> {
	assertInstalled();
	const args = parseArgs();
	const scenario = getModuleLoadScenario(args.scenarioId);
	console.error(
		`Running ${scenario.id} for ${args.iterations} iteration(s)...`,
	);

	await mkdir(path.dirname(args.resultFile), { recursive: true });
	await mkdir(path.dirname(args.metricsFile), { recursive: true });
	await mkdir(path.dirname(args.logFile), { recursive: true });
	await writeFile(args.logFile, "", "utf8");

	const mockServer = await createMockLlmServer([]);
	const snapshotPreloadedPolyfills = getSnapshotPreloadedPolyfills(
		args.scenarioId,
	);
	const v8Runtime = await createNodeV8Runtime({
		binaryPath: args.binaryPath,
		snapshotPreloadedPolyfills,
		observability: {
			logFile: args.logFile,
			metrics: {
				host: args.metricsHost,
				port: args.metricsPort,
				path: args.metricsPath,
			},
		},
	});

	try {
		const samples: BenchmarkSample[] = [];
		for (let iteration = 1; iteration <= args.iterations; iteration += 1) {
			samples.push(
				await runScenarioIteration(
					v8Runtime,
					args.scenarioId,
					mockServer,
					iteration,
				),
			);
		}

		const metricsResponse = await fetch(
			`http://${args.metricsHost}:${args.metricsPort}${args.metricsPath}`,
		);
		if (!metricsResponse.ok) {
			throw new Error(
				`Failed to scrape metrics: HTTP ${metricsResponse.status}`,
			);
		}
		await writeFile(args.metricsFile, await metricsResponse.text(), "utf8");

		const warmSamples = samples.slice(1);
		const result: ScenarioResult = {
			scenarioId: scenario.id,
			title: scenario.title,
			target: scenario.target,
			kind: scenario.kind,
			description: scenario.description,
			createdAt: new Date().toISOString(),
			iterations: args.iterations,
			artifacts: {
				resultFile: path.relative(RESULTS_ROOT, args.resultFile),
				metricsFile: path.relative(RESULTS_ROOT, args.metricsFile),
				logFile: path.relative(RESULTS_ROOT, args.logFile),
			},
			samples,
			summary: {
				coldWallMs: samples[0].wallMs,
				warmWallMsMean: mean(warmSamples.map((sample) => sample.wallMs)),
				coldSandboxMs: samples[0].sandboxMs,
				warmSandboxMsMean: mean(
					warmSamples
						.map((sample) => sample.sandboxMs)
						.filter((sample): sample is number => typeof sample === "number"),
				),
			},
		};
		await writeFile(
			args.resultFile,
			`${JSON.stringify(result, null, 2)}\n`,
			"utf8",
		);
		console.error(
			`Completed ${scenario.id}. Cold wall: ${result.summary.coldWallMs} ms`,
		);
	} finally {
		await v8Runtime.dispose();
		await mockServer.close();
	}
}

void main()
	.then(() => {
		process.exit(0);
	})
	.catch(async (error) => {
		const args = (() => {
			try {
				return parseArgs();
			} catch {
				return null;
			}
		})();
		const message =
			error instanceof Error
				? `${error.stack ?? error.message}`
				: String(error);
		console.error(message);
		if (args) {
			await writeFile(
				args.resultFile,
				`${JSON.stringify({ error: message }, null, 2)}\n`,
				"utf8",
			).catch(() => {});
			const logExists = existsSync(args.logFile);
			if (!logExists) {
				await writeFile(args.logFile, "", "utf8").catch(() => {});
			}
			const metricsExists = existsSync(args.metricsFile);
			if (!metricsExists) {
				await writeFile(args.metricsFile, "", "utf8").catch(() => {});
			}
		}
		process.exit(1);
	});
