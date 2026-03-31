import * as nodeFs from "node:fs";
import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { runUpstreamFsFirstLightEval } from "../src/upstream/bootstrap-execution.ts";

interface FsPromisesParitySummary {
	promiseFile: string;
	writevFile: string;
	text: string;
	size: number;
	entryFound: boolean;
	realpath: string;
	partialReadBytes: number;
	partialReadText: string;
	remainderText: string;
	readvBytes: number;
	readvText: string;
	writevText: string;
	closeAfterExternalClose: {
		code: string;
		syscall: string;
	};
	statAfterClose: {
		code: string;
		syscall: string;
	};
}

interface StreamParitySummary {
	file: string;
	text: string;
}

interface ValidationSnapshot {
	constructorName: string;
	name: string;
	code?: string;
	message: string;
}

interface ValidationSummary {
	readSync: ValidationSnapshot;
	createReadStream: ValidationSnapshot;
}

const createdPaths = new Set<string>();

const PROMISES_PARITY_EVAL = `
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

async function main() {
  const promiseFile = path.join(
    os.tmpdir(),
    'secure-exec-upstream-fs-promises-' + process.pid + '-' + Date.now() + '.txt'
  );
  const writevFile = path.join(
    os.tmpdir(),
    'secure-exec-upstream-fs-writev-' + process.pid + '-' + Date.now() + '.txt'
  );

  const initialHandle = await fsp.open(promiseFile, 'w+');
  await initialHandle.writeFile('Hello World');
  await initialHandle.close();

  const text = await fsp.readFile(promiseFile, 'utf8');
  const stat = await fsp.stat(promiseFile);
  const entries = await fsp.readdir(path.dirname(promiseFile));
  const realpath = await fsp.realpath(promiseFile);

  const partialReadHandle = await fsp.open(promiseFile, 'r');
  const partialReadBuffer = Buffer.alloc(5);
  const { bytesRead: partialReadBytes } =
    await partialReadHandle.read(partialReadBuffer, 0, 5, null);
  const remainderText = (await partialReadHandle.readFile()).toString('utf8');
  await partialReadHandle.close();

  const writevHandle = await fsp.open(writevFile, 'w+');
  const writevBuffers = [Buffer.from('readv-'), Buffer.from('writev')];
  await writevHandle.writev([Buffer.from('')]);
  await writevHandle.writev(writevBuffers);
  await writevHandle.close();
  const writevText = await fsp.readFile(writevFile, 'utf8');

  const readvHandle = await fsp.open(writevFile, 'r');
  await readvHandle.readv([Buffer.from('')]);
  const readvBuffers = [Buffer.alloc(6), Buffer.alloc(6)];
  const { bytesRead: readvBytes } = await readvHandle.readv(readvBuffers);
  await readvHandle.close();

  const externallyClosedHandle = await fsp.open(writevFile, 'r');
  fs.closeSync(externallyClosedHandle.fd);
  let closeAfterExternalClose;
  try {
    await externallyClosedHandle.close();
  } catch (error) {
    closeAfterExternalClose = {
      code: error.code,
      syscall: error.syscall,
    };
  }

  const closedHandle = await fsp.open(writevFile, 'r');
  await closedHandle.close();
  let statAfterClose;
  try {
    await closedHandle.stat();
  } catch (error) {
    statAfterClose = {
      code: error.code,
      syscall: error.syscall,
    };
  }

  process.stdout.write(JSON.stringify({
    promiseFile,
    writevFile,
    text,
    size: stat.size,
    entryFound: entries.includes(path.basename(promiseFile)),
    realpath,
    partialReadBytes,
    partialReadText: partialReadBuffer.toString('utf8'),
    remainderText,
    readvBytes,
    readvText: Buffer.concat(readvBuffers).toString('utf8'),
    writevText,
    closeAfterExternalClose,
    statAfterClose,
  }));
  process.__secureExecDone();
}

main().catch((error) => process.__secureExecDone(error.stack || String(error)));
`.trim();

const STREAM_PARITY_EVAL = `
const fs = require('fs');
const os = require('os');
const path = require('path');

const file = path.join(
  os.tmpdir(),
  'secure-exec-upstream-fs-stream-' + process.pid + '-' + Date.now() + '.txt'
);
const writer = fs.createWriteStream(file);
writer.on('error', (error) => process.__secureExecDone(error.stack || String(error)));
writer.on('finish', () => {
  let text = '';
  const reader = fs.createReadStream(file, { encoding: 'utf8' });
  reader.on('data', (chunk) => {
    text += chunk;
  });
  reader.on('error', (error) => process.__secureExecDone(error.stack || String(error)));
  reader.on('end', () => {
    process.stdout.write(JSON.stringify({ file, text }));
    process.__secureExecDone();
  });
});
writer.end('stream-ok');
`.trim();

const VALIDATION_PARITY_EVAL = `
const fs = require('fs');

function snapshotError(run) {
  try {
    run();
    process.__secureExecDone('expected validation error');
  } catch (error) {
    return {
      constructorName: error.constructor?.name ?? 'Error',
      name: error.name,
      code: error.code,
      message: error.message,
    };
  }
}

process.stdout.write(JSON.stringify({
  readSync: snapshotError(() => fs.readSync(1, Buffer.alloc(1), 0, 1, -2)),
  createReadStream: snapshotError(() =>
    fs.createReadStream('/tmp/secure-exec-upstream-fs-validation.txt', {
      start: -1,
    })
  ),
}));
process.__secureExecDone();
`.trim();

function cleanupPath(filePath: string | undefined): void {
	if (!filePath) {
		return;
	}
	createdPaths.delete(filePath);
	rmSync(filePath, { force: true });
}

function rememberCleanup(...paths: Array<string | undefined>): void {
	for (const filePath of paths) {
		if (filePath) {
			createdPaths.add(filePath);
		}
	}
}

function expectSuccessfulFsEval(
	result: Awaited<ReturnType<typeof runUpstreamFsFirstLightEval>>,
	expectedOperations: readonly string[],
	options: {
		expectBackendUsage?: boolean;
	} = {},
): void {
	const { expectBackendUsage = true } = options;
	expect(result.status, result.errorMessage ?? result.stderr).toBe("pass");
	expect(result.code, result.stderr || result.errorMessage).toBe(0);
	expect(result.internalBindings).toEqual(expect.arrayContaining(["fs"]));
	expect(result.vendoredPublicBuiltinsLoaded).toEqual(
		expect.arrayContaining(["fs"]),
	);
	expect(result.publicBuiltinFallbacks).not.toContain("fs");
	expect(result.fsBackendAbiVersion).toBe(1);
	if (expectBackendUsage) {
		expect(result.fsBackendArtifacts).toEqual(["node_fs_backend"]);
		expect(result.fsBackendOperations).toEqual(
			expect.arrayContaining(expectedOperations),
		);
	} else {
		expect(result.fsBackendArtifacts).toEqual([]);
		expect(result.fsBackendOperations).toEqual([]);
	}
}

function parseResultJson<T>(
	result: Awaited<ReturnType<typeof runUpstreamFsFirstLightEval>>,
): T {
	return JSON.parse(result.stdout) as T;
}

function snapshotHostValidationError(run: () => unknown): ValidationSnapshot {
	try {
		run();
		throw new Error("expected validation error");
	} catch (error) {
		if (!(error instanceof Error)) {
			return {
				constructorName: "Error",
				name: "Error",
				message: String(error),
			};
		}
		return {
			constructorName: error.constructor?.name ?? "Error",
			name: error.name,
			code: (error as Error & { code?: string }).code,
			message: error.message,
		};
	}
}

describe("upstream fs parity", () => {
	afterEach(() => {
		for (const filePath of [...createdPaths]) {
			cleanupPath(filePath);
		}
	});

	it("covers vendored fs.promises and FileHandle scenarios derived from node conformance", async () => {
		const result = await runUpstreamFsFirstLightEval({
			code: PROMISES_PARITY_EVAL,
		});

		expectSuccessfulFsEval(result, [
			"open",
			"read",
			"readdir",
			"realpath",
			"stat",
			"write",
		]);
		expect(result.internalBindings).toEqual(
			expect.arrayContaining(["cjs_lexer", "fs_event_wrap", "uv"]),
		);

		const summary = parseResultJson<FsPromisesParitySummary>(result);
		rememberCleanup(summary.promiseFile, summary.realpath, summary.writevFile);

		expect(summary.text).toBe("Hello World");
		expect(summary.size).toBe(summary.text.length);
		expect(summary.entryFound).toBe(true);
		expect(summary.partialReadBytes).toBe(5);
		expect(summary.partialReadText).toBe("Hello");
		expect(summary.remainderText).toBe(" World");
		expect(summary.readvBytes).toBe(12);
		expect(summary.readvText).toBe("readv-writev");
		expect(summary.writevText).toBe("readv-writev");
		expect(summary.closeAfterExternalClose).toEqual({
			code: "EBADF",
			syscall: "close",
		});
		expect(summary.statAfterClose).toEqual({
			code: "EBADF",
			syscall: "fstat",
		});
	});

	it("supports upstream path-based fs streams on the replacement runtime", async () => {
		const result = await runUpstreamFsFirstLightEval({
			code: STREAM_PARITY_EVAL,
		});

		expectSuccessfulFsEval(result, ["open", "read", "write"]);
		expect(result.publicBuiltinFallbacks).toEqual(
			expect.arrayContaining(["stream"]),
		);

		const summary = parseResultJson<StreamParitySummary>(result);
		rememberCleanup(summary.file);
		expect(summary.text).toBe("stream-ok");
	});

	it("matches host Node validation snapshots for the implemented fs subset", async () => {
		const result = await runUpstreamFsFirstLightEval({
			code: VALIDATION_PARITY_EVAL,
		});

		expectSuccessfulFsEval(result, [], { expectBackendUsage: false });

		const summary = parseResultJson<ValidationSummary>(result);
		const hostSummary: ValidationSummary = {
			readSync: snapshotHostValidationError(() =>
				nodeFs.readSync(1, Buffer.alloc(1), 0, 1, -2),
			),
			createReadStream: snapshotHostValidationError(() =>
				nodeFs.createReadStream("/tmp/secure-exec-upstream-fs-validation.txt", {
					start: -1,
				}),
			),
		};

		expect(summary).toEqual(hostSummary);
	});
});
