import { spawn } from "node:child_process";
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
import {
	isScenarioRunStage,
	summarizeNewSessionSamples,
	type ScenarioBenchmarkModesFragment,
	type ScenarioRunStage,
	type ScenarioStageResult,
} from "./orchestration.js";
import type {
	ScenarioBenchmarkModes,
	ScenarioChecks,
	ScenarioNewSessionReplayModeResult,
	ScenarioSameSessionReplayModeResult,
	ScenarioTrueColdStartModeResult,
} from "./summary.js";

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
	benchmarkModes?: ScenarioBenchmarkModes;
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

type RuntimeRunCapture<T> = {
	code: number;
	errorMessage?: string;
	exports?: T;
	wallMs: number;
};

type SameSessionReplayPayload = {
	ok: true;
	totalWallMs: number;
	firstPassMs: number;
	replayPassMs: number;
	first: Record<string, unknown>;
	replay: Record<string, unknown>;
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
	stage?: ScenarioRunStage;
};

const BENCH_DEBUG = process.env.SECURE_EXEC_BENCH_DEBUG === "1";

function benchDebug(scope: string, message: string): void {
	if (!BENCH_DEBUG) {
		return;
	}
	console.error(`[bench-debug] ${scope}: ${message}`);
}

function readArg(name: string): string {
	const flag = `--${name}`;
	const index = process.argv.indexOf(flag);
	if (index === -1 || index + 1 >= process.argv.length) {
		throw new Error(`Missing required argument: ${flag}`);
	}
	return process.argv[index + 1];
}

function readOptionalArg(name: string): string | undefined {
	const flag = `--${name}`;
	const index = process.argv.indexOf(flag);
	if (index === -1 || index + 1 >= process.argv.length) {
		return undefined;
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
	const stageArg = readOptionalArg("stage");
	if (stageArg && !isScenarioRunStage(stageArg)) {
		throw new Error(`Invalid --stage: ${stageArg}`);
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
		stage: stageArg as ScenarioRunStage | undefined,
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
	const debugScope = `runRuntimeExec cwd=${options.cwd}`;
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
		benchDebug(debugScope, "starting runtime.exec()");
		const result = await runtime.exec(options.code, {
			cwd: options.cwd,
			stdin: options.stdin,
		});
		benchDebug(
			debugScope,
			`runtime.exec() completed code=${result.code} wallMs=${round(performance.now() - startedAt)}`,
		);
		return {
			code: result.code,
			errorMessage: result.errorMessage,
			stdoutText: stdout.join(""),
			stderrText: stderr.join(""),
			wallMs: round(performance.now() - startedAt),
		};
	} finally {
		benchDebug(debugScope, "starting runtime.terminate()");
		await runtime.terminate();
		benchDebug(debugScope, "runtime.terminate() completed");
	}
}

async function runRuntimeModule<T>(
	v8Runtime: Awaited<ReturnType<typeof createNodeV8Runtime>>,
	options: {
		code: string;
		cwd: string;
		filePath: string;
		useHostFileSystem?: boolean;
		useNetwork?: boolean;
		snapshotPreloadedPolyfills?: readonly string[];
	},
): Promise<RuntimeRunCapture<T>> {
	const debugScope = `runRuntimeModule file=${options.filePath}`;
	const runtime = new NodeRuntime({
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
		benchDebug(debugScope, "starting runtime.run()");
		const result = await runtime.run<T>(options.code, options.filePath);
		benchDebug(
			debugScope,
			`runtime.run() completed code=${result.code} wallMs=${round(performance.now() - startedAt)}`,
		);
		return {
			code: result.code,
			errorMessage: result.errorMessage,
			exports: result.exports,
			wallMs: round(performance.now() - startedAt),
		};
	} finally {
		benchDebug(debugScope, "starting runtime.terminate()");
		await runtime.terminate();
		benchDebug(debugScope, "runtime.terminate() completed");
	}
}

async function runHostExec(options: {
	code: string;
	cwd: string;
	stdin?: string;
	env?: Record<string, string>;
}): Promise<RuntimeCapture> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const startedAt = performance.now();
	const bootstrap = `
const { pathToFileURL } = require("node:url");
globalThis.__dynamicImport = async (modulePath) => import(pathToFileURL(modulePath).href);
`;
	return await new Promise<RuntimeCapture>((resolve, reject) => {
		const child = spawn(process.execPath, ["-e", `${bootstrap}\n${options.code}`], {
			cwd: options.cwd,
			env: {
				...process.env,
				NO_COLOR: "1",
				...options.env,
			},
			stdio: ["pipe", "pipe", "pipe"],
		});
		child.stdout.on("data", (chunk: Buffer) => {
			stdout.push(chunk.toString("utf8"));
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr.push(chunk.toString("utf8"));
		});
		child.on("error", reject);
		child.on("close", (code) => {
			resolve({
				code: code ?? 1,
				stdoutText: stdout.join(""),
				stderrText: stderr.join(""),
				wallMs: round(performance.now() - startedAt),
			});
		});
		child.stdin.end(options.stdin ?? "");
	});
}

function parseSameSessionReplayPayload(
	stdoutText: string,
): SameSessionReplayPayload {
	const payload = parseTrailingJsonObject(stdoutText);
	if (
		payload.ok !== true ||
		typeof payload.totalWallMs !== "number" ||
		typeof payload.firstPassMs !== "number" ||
		typeof payload.replayPassMs !== "number" ||
		!payload.first ||
		typeof payload.first !== "object" ||
		!payload.replay ||
		typeof payload.replay !== "object"
	) {
		throw new Error(`Invalid same-session replay payload: ${JSON.stringify(payload)}`);
	}
	return payload as SameSessionReplayPayload;
}

function extractChecks(
	value: Record<string, unknown>,
	keys: readonly string[],
): ScenarioChecks {
	return Object.fromEntries(
		keys.map((key) => [
			key,
			typeof value[key] === "boolean" ||
			typeof value[key] === "number" ||
			typeof value[key] === "string"
				? (value[key] as string | number | boolean)
				: undefined,
		]),
	);
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

function buildSameSessionReplayStdoutCode(
	runOnceBody: string,
	options: {
		prelude?: string;
		keepAlive?: boolean;
	} = {},
): string {
	return `
${options.prelude ?? ""}
${options.keepAlive ? "const keepAlive = setInterval(() => {}, 10);" : ""}
(async () => {
  try {
    const runOnce = async () => {
${runOnceBody}
    };
    const benchStartedAt = performance.now();
    const firstStartedAt = performance.now();
    const first = await runOnce();
    const firstFinishedAt = performance.now();
    const replayStartedAt = performance.now();
    const replay = await runOnce();
    const replayFinishedAt = performance.now();
    const benchFinishedAt = performance.now();
    const payload = JSON.stringify({
      ok: true,
      totalWallMs: Number((benchFinishedAt - benchStartedAt).toFixed(3)),
      firstPassMs: Number((firstFinishedAt - firstStartedAt).toFixed(3)),
      replayPassMs: Number((replayFinishedAt - replayStartedAt).toFixed(3)),
      first,
      replay,
    });
    console.log(payload);
    await new Promise((resolve) => process.stdout.write("", resolve));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  } finally {
${options.keepAlive ? "    clearInterval(keepAlive);" : ""}
  }
})();
`;
}

function buildSameSessionReplayModuleCode(
	runOnceBody: string,
	options: {
		prelude?: string;
	} = {},
): string {
	return `
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
${options.prelude ?? ""}
const runOnce = async () => {
${runOnceBody}
};
const benchStartedAt = performance.now();
const firstStartedAt = performance.now();
const first = await runOnce();
const firstFinishedAt = performance.now();
const replayStartedAt = performance.now();
const replay = await runOnce();
const replayFinishedAt = performance.now();
const benchFinishedAt = performance.now();
export default {
  ok: true,
  totalWallMs: Number((benchFinishedAt - benchStartedAt).toFixed(3)),
  firstPassMs: Number((firstFinishedAt - firstStartedAt).toFixed(3)),
  replayPassMs: Number((replayFinishedAt - replayStartedAt).toFixed(3)),
  first,
  replay,
};
`;
}

function buildHonoStartupReplayCode(mode: "stdout" | "exports" = "stdout"): string {
	const body = `
      const startedAt = performance.now();
      const { Hono } = require("hono");
      const app = new Hono();
      app.get("/", (context) => context.text("ok"));
      const finishedAt = performance.now();
      return {
        workloadMs: Number((finishedAt - startedAt).toFixed(3)),
        honoType: typeof Hono,
        fetchType: typeof app.fetch,
      };
`;
	return mode === "exports"
		? buildSameSessionReplayModuleCode(body)
		: buildSameSessionReplayStdoutCode(body);
}

function buildHonoEndToEndReplayCode(mode: "stdout" | "exports" = "stdout"): string {
	const body = `
      const startedAt = performance.now();
      const { Hono } = require("hono");
      const app = new Hono();
      app.get("/hello", (context) => context.json({ ok: true, framework: "hono" }));
      const response = await app.request("http://localhost/hello");
      const body = await response.text();
      const finishedAt = performance.now();
      return {
        workloadMs: Number((finishedAt - startedAt).toFixed(3)),
        status: response.status,
        body,
      };
`;
	return mode === "exports"
		? buildSameSessionReplayModuleCode(body)
		: buildSameSessionReplayStdoutCode(body);
}

function buildPdfLibStartupReplayCode(mode: "stdout" | "exports" = "stdout"): string {
	const body = `
      const startedAt = performance.now();
      const { PDFDocument, StandardFonts } = require("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      await pdfDoc.embedFont(StandardFonts.Helvetica);
      const finishedAt = performance.now();
      return {
        workloadMs: Number((finishedAt - startedAt).toFixed(3)),
        pdfDocumentType: typeof PDFDocument,
        standardFontName: String(StandardFonts.Helvetica),
        pageCount: pdfDoc.getPageCount(),
      };
`;
	return mode === "exports"
		? buildSameSessionReplayModuleCode(body)
		: buildSameSessionReplayStdoutCode(body);
}

function buildPdfLibEndToEndReplayCode(mode: "stdout" | "exports" = "stdout"): string {
	const body = `
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

      const finishedAt = performance.now();
      return {
        workloadMs: Number((finishedAt - startedAt).toFixed(3)),
        pageCount: pdfDoc.getPageCount(),
        fieldCount: form.getFields().length,
      };
`;
	return mode === "exports"
		? buildSameSessionReplayModuleCode(body)
		: buildSameSessionReplayStdoutCode(body);
}

function buildJsZipStartupReplayCode(mode: "stdout" | "exports" = "stdout"): string {
	const body = `
      const startedAt = performance.now();
      const JSZip = require("jszip");
      const zip = new JSZip();
      zip.file("README.txt", "secure-exec benchmark");
      const fileCount = Object.values(zip.files).filter((entry) => !entry.dir).length;
      const finishedAt = performance.now();
      return {
        workloadMs: Number((finishedAt - startedAt).toFixed(3)),
        jszipType: typeof JSZip,
        generateAsyncType: typeof zip.generateAsync,
        fileCount,
      };
`;
	return mode === "exports"
		? buildSameSessionReplayModuleCode(body)
		: buildSameSessionReplayStdoutCode(body);
}

function buildJsZipEndToEndReplayCode(mode: "stdout" | "exports" = "stdout"): string {
	const body = `
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

      const fileCount = Object.values(zip.files).filter((entry) => !entry.dir).length;
      const finishedAt = performance.now();
      return {
        workloadMs: Number((finishedAt - startedAt).toFixed(3)),
        fileCount,
        manifestPresent: !!zip.files["manifest.json"],
      };
`;
	return mode === "exports"
		? buildSameSessionReplayModuleCode(body)
		: buildSameSessionReplayStdoutCode(body);
}

function buildPiSdkStartupReplayCode(mode: "stdout" | "exports" = "stdout"): string {
	const body = `
      const startedAt = performance.now();
      const pi = await globalThis.__dynamicImport(${JSON.stringify(PI_SDK_ENTRY)}, "/bench-pi-sdk-startup-replay.mjs");
      const finishedAt = performance.now();
      return {
        workloadMs: Number((finishedAt - startedAt).toFixed(3)),
        createAgentSessionType: typeof pi.createAgentSession,
        runPrintModeType: typeof pi.runPrintMode,
      };
`;
	return mode === "exports"
		? buildSameSessionReplayModuleCode(body)
		: buildSameSessionReplayStdoutCode(body);
}

function buildPiSdkEndToEndReplayCode(
	workDir: string,
	agentDir: string,
	mode: "stdout" | "exports" = "stdout",
): string {
	const body = `
      let session;
      try {
        const startedAt = performance.now();
        const pi = await globalThis.__dynamicImport(${JSON.stringify(PI_SDK_ENTRY)}, "/bench-pi-sdk-end-to-end-replay.mjs");
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
        return {
          workloadMs: Number((finishedAt - startedAt).toFixed(3)),
          messageCount: session.state?.messages?.length ?? 0,
        };
      } finally {
        if (session) {
          try { session.dispose(); } catch {}
        }
      }
`;
	return mode === "exports"
		? buildSameSessionReplayModuleCode(body)
		: buildSameSessionReplayStdoutCode(body);
}

function buildPiCliReplayPrelude(workDir: string, agentDir: string): string {
	return `
process.title = "pi";
process.env.HOME = ${JSON.stringify(workDir)};
process.env.PI_CODING_AGENT_DIR = ${JSON.stringify(agentDir)};
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.NO_COLOR = "1";
Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
const captureCliMain = async (argv, entryRef) => {
  const { main } = await globalThis.__dynamicImport(${JSON.stringify(PI_MAIN_ENTRY)}, entryRef);
  const stdoutChunks = [];
  const stderrChunks = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalProcessExit = process.exit.bind(process);
  process.stdout.write = function(chunk, encoding, callback) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === "string" ? encoding : "utf8") : String(chunk);
    stdoutChunks.push(text);
    if (typeof encoding === "function") {
      encoding();
    } else if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  process.stderr.write = function(chunk, encoding, callback) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === "string" ? encoding : "utf8") : String(chunk);
    stderrChunks.push(text);
    if (typeof encoding === "function") {
      encoding();
    } else if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  process.exit = function(code) {
    const exitCode = typeof code === "number" ? code : 0;
    const error = new Error("process.exit(" + exitCode + ")");
    error.name = "ProcessExitError";
    throw error;
  };
  try {
    await main(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!(error instanceof Error && error.name === "ProcessExitError" && message === "process.exit(0)")) {
      throw error;
    }
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exit = originalProcessExit;
  }
  return {
    stdoutText: stdoutChunks.join(""),
    stderrText: stderrChunks.join(""),
  };
};
`;
}

function buildPiCliStartupReplayCode(
	workDir: string,
	agentDir: string,
	mode: "stdout" | "exports" = "stdout",
): string {
	const body = `
      const startedAt = performance.now();
      await captureCliMain(["--help"], "/bench-pi-cli-startup-replay.mjs");
      const finishedAt = performance.now();
      return {
        workloadMs: Number((finishedAt - startedAt).toFixed(3)),
        completed: true,
      };
`;
	const prelude = buildPiCliReplayPrelude(workDir, agentDir);
	return mode === "exports"
		? buildSameSessionReplayModuleCode(body, { prelude })
		: buildSameSessionReplayStdoutCode(body, { prelude });
}

function buildPiCliEndToEndReplayCode(
	workDir: string,
	agentDir: string,
	mode: "stdout" | "exports" = "stdout",
): string {
	const body = `
      const startedAt = performance.now();
      await captureCliMain([
        ...${JSON.stringify(PI_BASE_FLAGS)},
        "--print",
        "Say hello from the CLI benchmark.",
      ], "/bench-pi-cli-end-to-end-replay.mjs");
      const finishedAt = performance.now();
      return {
        workloadMs: Number((finishedAt - startedAt).toFixed(3)),
        completed: true,
      };
`;
	const prelude = buildPiCliReplayPrelude(workDir, agentDir);
	return mode === "exports"
		? buildSameSessionReplayModuleCode(body, { prelude })
		: buildSameSessionReplayStdoutCode(body, { prelude });
}

async function withScenarioRuntime<T>(
	binaryPath: string,
	scenarioId: ModuleLoadScenarioId,
	options: {
		warmSnapshotEnabled?: boolean;
	},
	fn: (
		v8Runtime: Awaited<ReturnType<typeof createNodeV8Runtime>>,
	) => Promise<T>,
): Promise<T> {
	const snapshotPreloadedPolyfills = getSnapshotPreloadedPolyfills(scenarioId);
	const v8Runtime = await createNodeV8Runtime({
		binaryPath,
		snapshotPreloadedPolyfills,
		warmupBridgeCode: options.warmSnapshotEnabled === false ? "" : undefined,
	});
	try {
		return await fn(v8Runtime);
	} finally {
		await v8Runtime.dispose();
	}
}

async function measureTrueColdStartMode(
	binaryPath: string,
	scenarioId: ModuleLoadScenarioId,
	mockServer: MockLlmServerHandle,
	warmSnapshotEnabled: boolean,
): Promise<ScenarioTrueColdStartModeResult> {
	const runtimeCreateStartedAt = performance.now();
	return await withScenarioRuntime(
		binaryPath,
		scenarioId,
		{ warmSnapshotEnabled },
		async (v8Runtime) => {
			const runtimeCreateMs = round(performance.now() - runtimeCreateStartedAt);
			const sample = await runScenarioIteration(
				v8Runtime,
				scenarioId,
				mockServer,
				1,
			);
			return {
				totalWallMs: round(runtimeCreateMs + sample.wallMs),
				runtimeCreateMs,
				firstPassWallMs: sample.wallMs,
				firstPassSandboxMs: sample.sandboxMs,
				mockRequests: sample.mockRequests,
				checks: sample.checks,
			};
		},
	);
}

async function measureNewSessionReplayMode(
	binaryPath: string,
	scenarioId: ModuleLoadScenarioId,
	mockServer: MockLlmServerHandle,
	warmSnapshotEnabled: boolean,
	iterations: number,
): Promise<ScenarioNewSessionReplayModeResult> {
	return await withScenarioRuntime(
		binaryPath,
		scenarioId,
		{ warmSnapshotEnabled },
		async (v8Runtime) => {
			const samples: BenchmarkSample[] = [];
			for (let iteration = 1; iteration <= iterations; iteration += 1) {
				samples.push(
					await runScenarioIteration(v8Runtime, scenarioId, mockServer, iteration),
				);
			}
			return summarizeNewSessionSamples(samples);
		},
	);
}

function buildReplayChecks(
	scenarioId: ModuleLoadScenarioId,
	payload: Record<string, unknown>,
): ScenarioChecks {
	switch (scenarioId) {
		case "hono-startup":
			if (payload.honoType !== "function" || payload.fetchType !== "function") {
				throw new Error(`Hono startup replay failed: ${JSON.stringify(payload)}`);
			}
			return extractChecks(payload, ["honoType", "fetchType"]);
		case "hono-end-to-end":
			if (payload.status !== 200 || payload.body !== '{"ok":true,"framework":"hono"}') {
				throw new Error(`Hono end-to-end replay failed: ${JSON.stringify(payload)}`);
			}
			return extractChecks(payload, ["status", "body"]);
		case "pdf-lib-startup":
			if (payload.pdfDocumentType !== "function") {
				throw new Error(`pdf-lib startup replay failed: ${JSON.stringify(payload)}`);
			}
			return extractChecks(payload, ["pdfDocumentType", "standardFontName", "pageCount"]);
		case "pdf-lib-end-to-end":
			if (
				Number(payload.pageCount ?? 0) !== 5 ||
				Number(payload.fieldCount ?? 0) !== 50
			) {
				throw new Error(`pdf-lib end-to-end replay failed: ${JSON.stringify(payload)}`);
			}
			return extractChecks(payload, ["pageCount", "fieldCount"]);
		case "jszip-startup":
			if (
				payload.jszipType !== "function" ||
				payload.generateAsyncType !== "function" ||
				Number(payload.fileCount ?? 0) !== 1
			) {
				throw new Error(`JSZip startup replay failed: ${JSON.stringify(payload)}`);
			}
			return extractChecks(payload, ["jszipType", "generateAsyncType", "fileCount"]);
		case "jszip-end-to-end":
			if (
				Number(payload.fileCount ?? 0) !== 16 ||
				payload.manifestPresent !== true
			) {
				throw new Error(`JSZip end-to-end replay failed: ${JSON.stringify(payload)}`);
			}
			return extractChecks(payload, ["fileCount", "manifestPresent"]);
		case "pi-sdk-startup":
			if (
				payload.createAgentSessionType !== "function" ||
				payload.runPrintModeType !== "function"
			) {
				throw new Error(`Pi SDK startup replay failed: ${JSON.stringify(payload)}`);
			}
			return extractChecks(payload, ["createAgentSessionType", "runPrintModeType"]);
		case "pi-sdk-end-to-end":
			if (Number(payload.messageCount ?? 0) <= 0) {
				throw new Error(`Pi SDK end-to-end replay failed: ${JSON.stringify(payload)}`);
			}
			return extractChecks(payload, ["messageCount"]);
		case "pi-cli-startup":
			if (payload.completed !== true) {
				throw new Error(`Pi CLI startup replay failed: ${JSON.stringify(payload)}`);
			}
			return extractChecks(payload, ["completed"]);
		case "pi-cli-end-to-end":
			if (payload.completed !== true) {
				throw new Error(`Pi CLI end-to-end replay failed: ${JSON.stringify(payload)}`);
			}
			return extractChecks(payload, ["completed"]);
	}
	throw new Error(`Unhandled replay scenario: ${String(scenarioId)}`);
}

async function measureSameSessionReplayMode(
	binaryPath: string,
	scenarioId: ModuleLoadScenarioId,
	mockServer: MockLlmServerHandle,
	environment: "sandbox" | "host",
): Promise<ScenarioSameSessionReplayModeResult> {
	const replayCodeMode: "stdout" | "exports" =
		environment === "sandbox" && scenarioId.startsWith("pi-cli")
			? "exports"
			: "stdout";
	let code = "";
	let cwd = SECURE_EXEC_ROOT;
	let stdin: string | undefined;
	let useHostFileSystem = false;
	let useNetwork = false;
	let cleanup: (() => Promise<void>) | undefined;

	switch (scenarioId) {
		case "hono-startup":
			code = buildHonoStartupReplayCode(replayCodeMode);
			break;
		case "hono-end-to-end":
			code = buildHonoEndToEndReplayCode(replayCodeMode);
			break;
		case "pdf-lib-startup":
			code = buildPdfLibStartupReplayCode(replayCodeMode);
			break;
		case "pdf-lib-end-to-end":
			code = buildPdfLibEndToEndReplayCode(replayCodeMode);
			break;
		case "jszip-startup":
			code = buildJsZipStartupReplayCode(replayCodeMode);
			break;
		case "jszip-end-to-end":
			code = buildJsZipEndToEndReplayCode(replayCodeMode);
			break;
		case "pi-sdk-startup":
			code = buildPiSdkStartupReplayCode(replayCodeMode);
			break;
		case "pi-sdk-end-to-end": {
			mockServer.reset([
				{ type: "text", text: "benchmark-pi-sdk-response" },
				{ type: "text", text: "benchmark-pi-sdk-response" },
			]);
			const { workDir, agentDir } = await createPiWorkDir(mockServer, true);
			cwd = workDir;
			useHostFileSystem = true;
			useNetwork = true;
			cleanup = async () => {
				await rm(workDir, { recursive: true, force: true });
			};
			code = buildPiSdkEndToEndReplayCode(workDir, agentDir, replayCodeMode);
			break;
		}
		case "pi-cli-startup": {
			const { workDir, agentDir } = await createPiWorkDir(mockServer, false);
			cwd = workDir;
			stdin = "";
			useHostFileSystem = true;
			cleanup = async () => {
				await rm(workDir, { recursive: true, force: true });
			};
			code = buildPiCliStartupReplayCode(workDir, agentDir, replayCodeMode);
			break;
		}
		case "pi-cli-end-to-end": {
			mockServer.reset([
				{ type: "text", text: "benchmark-pi-cli-response" },
				{ type: "text", text: "benchmark-pi-cli-response" },
			]);
			const { workDir, agentDir } = await createPiWorkDir(mockServer, true);
			cwd = workDir;
			stdin = "";
			useHostFileSystem = true;
			useNetwork = true;
			cleanup = async () => {
				await rm(workDir, { recursive: true, force: true });
			};
			code = buildPiCliEndToEndReplayCode(workDir, agentDir, replayCodeMode);
			break;
		}
	}

	try {
		let payload: SameSessionReplayPayload;
		let totalWallMs: number | undefined;
		if (environment === "host") {
			const capture = await runHostExec({ code, cwd, stdin });
			payload = parseSameSessionReplayPayload(capture.stdoutText);
			totalWallMs = payload.totalWallMs;
		} else {
			if (replayCodeMode === "exports") {
				const capture = await withScenarioRuntime(
					binaryPath,
					scenarioId,
					{ warmSnapshotEnabled: true },
					(v8Runtime) =>
						runRuntimeModule<{ default: SameSessionReplayPayload }>(v8Runtime, {
							code,
							cwd,
							filePath: `/bench-${scenarioId}-same-session-replay.mjs`,
							useHostFileSystem,
							useNetwork,
							snapshotPreloadedPolyfills:
								getSnapshotPreloadedPolyfills(scenarioId),
						}),
				);
				if (!capture.exports?.default) {
					throw new Error(`Missing sandbox replay exports for ${scenarioId}`);
				}
				payload = capture.exports.default;
				totalWallMs = capture.wallMs;
			} else {
				const capture = await withScenarioRuntime(
					binaryPath,
					scenarioId,
					{ warmSnapshotEnabled: true },
					(v8Runtime) =>
						runRuntimeExec(v8Runtime, {
							code,
							cwd,
							stdin,
							useHostFileSystem,
							useNetwork,
							snapshotPreloadedPolyfills:
								getSnapshotPreloadedPolyfills(scenarioId),
						}),
				);
				payload = parseSameSessionReplayPayload(capture.stdoutText);
				totalWallMs = capture.wallMs;
			}
		}
		const mockRequests =
			scenarioId === "pi-sdk-end-to-end" || scenarioId === "pi-cli-end-to-end"
				? mockServer.requestCount()
				: undefined;
		if (
			(scenarioId === "pi-sdk-end-to-end" || scenarioId === "pi-cli-end-to-end") &&
			mockRequests !== 2
		) {
			throw new Error(
				`${scenarioId} replay expected 2 mock requests, saw ${mockRequests}`,
			);
		}
		return {
			totalWallMs: totalWallMs ?? payload.totalWallMs,
			firstPassMs: payload.firstPassMs,
			replayPassMs: payload.replayPassMs,
			mockRequests,
			firstPassChecks: buildReplayChecks(scenarioId, payload.first),
			replayPassChecks: buildReplayChecks(scenarioId, payload.replay),
		};
	} finally {
		await cleanup?.();
	}
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

function buildStageResult(
	scenario: ReturnType<typeof getModuleLoadScenario>,
	iterations: number,
	stage: ScenarioRunStage,
	extras: {
		samples?: BenchmarkSample[];
		benchmarkModes?: ScenarioBenchmarkModesFragment;
	},
): ScenarioStageResult {
	return {
		stage,
		scenarioId: scenario.id,
		title: scenario.title,
		target: scenario.target,
		kind: scenario.kind,
		description: scenario.description,
		createdAt: new Date().toISOString(),
		iterations,
		...extras,
	};
}

async function runSamplesStage(
	args: ScenarioArgs,
	scenario: ReturnType<typeof getModuleLoadScenario>,
): Promise<ScenarioStageResult> {
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
		return buildStageResult(scenario, args.iterations, "samples", {
			samples,
			benchmarkModes: {
				sandboxNewSessionReplay: {
					warmSnapshotEnabled: summarizeNewSessionSamples(samples),
				},
			},
		});
	} finally {
		await v8Runtime.dispose();
		await mockServer.close();
	}
}

async function runBenchmarkModeStage(
	args: ScenarioArgs,
	scenario: ReturnType<typeof getModuleLoadScenario>,
	stage: Exclude<ScenarioRunStage, "samples">,
): Promise<ScenarioStageResult> {
	const mockServer = await createMockLlmServer([]);
	try {
		switch (stage) {
			case "sandbox_true_cold_start_warm_snapshot_enabled":
				return buildStageResult(scenario, args.iterations, stage, {
					benchmarkModes: {
						sandboxTrueColdStart: {
							warmSnapshotEnabled: await measureTrueColdStartMode(
								args.binaryPath,
								args.scenarioId,
								mockServer,
								true,
							),
						},
					},
				});
			case "sandbox_true_cold_start_warm_snapshot_disabled":
				return buildStageResult(scenario, args.iterations, stage, {
					benchmarkModes: {
						sandboxTrueColdStart: {
							warmSnapshotDisabled: await measureTrueColdStartMode(
								args.binaryPath,
								args.scenarioId,
								mockServer,
								false,
							),
						},
					},
				});
			case "sandbox_new_session_replay_warm_snapshot_disabled":
				return buildStageResult(scenario, args.iterations, stage, {
					benchmarkModes: {
						sandboxNewSessionReplay: {
							warmSnapshotDisabled: await measureNewSessionReplayMode(
								args.binaryPath,
								args.scenarioId,
								mockServer,
								false,
								args.iterations,
							),
						},
					},
				});
			case "sandbox_same_session_replay":
				return buildStageResult(scenario, args.iterations, stage, {
					benchmarkModes: {
						sandboxSameSessionReplay: await measureSameSessionReplayMode(
							args.binaryPath,
							args.scenarioId,
							mockServer,
							"sandbox",
						),
					},
				});
			case "host_same_session_control":
				return buildStageResult(scenario, args.iterations, stage, {
					benchmarkModes: {
						hostSameSessionControl: await measureSameSessionReplayMode(
							args.binaryPath,
							args.scenarioId,
							mockServer,
							"host",
						),
					},
				});
		}
		throw new Error(`Unhandled stage: ${stage}`);
	} finally {
		await mockServer.close();
	}
}

async function runRequestedStage(
	args: ScenarioArgs,
	scenario: ReturnType<typeof getModuleLoadScenario>,
): Promise<ScenarioStageResult> {
	if (!args.stage) {
		throw new Error("runRequestedStage requires args.stage");
	}
	if (args.stage === "samples") {
		return runSamplesStage(args, scenario);
	}
	return runBenchmarkModeStage(args, scenario, args.stage);
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
	if (args.stage) {
		const stageResult = await runRequestedStage(args, scenario);
		if (args.stage !== "samples") {
			await writeFile(args.metricsFile, "", "utf8");
		}
		await writeFile(
			args.resultFile,
			`${JSON.stringify(stageResult, null, 2)}\n`,
			"utf8",
		);
		console.error(`Completed ${scenario.id} stage ${args.stage}.`);
		return;
	}

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
		console.error(`Measuring ${scenario.id} benchmark modes...`);
		console.error("- sandbox true cold start (warm snapshot enabled)");
		const sandboxTrueColdStartWarmSnapshotEnabled =
			await measureTrueColdStartMode(
				args.binaryPath,
				args.scenarioId,
				mockServer,
				true,
			);
		console.error("- sandbox true cold start (warm snapshot disabled)");
		const sandboxTrueColdStartWarmSnapshotDisabled =
			await measureTrueColdStartMode(
				args.binaryPath,
				args.scenarioId,
				mockServer,
				false,
			);
		console.error("- sandbox new-session replay (warm snapshot disabled)");
		const sandboxNewSessionReplayWarmSnapshotDisabled =
			await measureNewSessionReplayMode(
				args.binaryPath,
				args.scenarioId,
				mockServer,
				false,
				args.iterations,
			);
		console.error("- sandbox same-session replay");
		const sandboxSameSessionReplay = await measureSameSessionReplayMode(
			args.binaryPath,
			args.scenarioId,
			mockServer,
			"sandbox",
		);
		console.error("- host same-session control");
		const hostSameSessionControl = await measureSameSessionReplayMode(
			args.binaryPath,
			args.scenarioId,
			mockServer,
			"host",
		);
		const benchmarkModes: ScenarioBenchmarkModes = {
			sandboxTrueColdStart: {
				warmSnapshotEnabled: sandboxTrueColdStartWarmSnapshotEnabled,
				warmSnapshotDisabled: sandboxTrueColdStartWarmSnapshotDisabled,
			},
			sandboxNewSessionReplay: {
				warmSnapshotEnabled: summarizeNewSessionSamples(samples),
				warmSnapshotDisabled: sandboxNewSessionReplayWarmSnapshotDisabled,
			},
			sandboxSameSessionReplay,
			hostSameSessionControl,
		};

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
			benchmarkModes,
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
