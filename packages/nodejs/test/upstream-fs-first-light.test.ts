import { rmSync } from "node:fs";
import { basename } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createCommandExecutorStub,
	createInMemoryFileSystem,
	createKernel,
	type Kernel,
	type StdioEvent,
} from "@secure-exec/core";
import { NodeRuntime } from "../../secure-exec/src/runtime.ts";
import { createNodeDriver } from "../src/driver.ts";
import {
	createExperimentalUpstreamFsFirstLightKernelRuntime,
	createExperimentalUpstreamFsFirstLightRuntimeDriverFactory,
	runUpstreamFsFirstLightEval,
} from "../src/upstream/bootstrap-execution.ts";

interface FsFirstLightSummary {
	file: string;
	bytesRead: number;
	size: number;
	text: string;
	entries: string[];
	realpath: string;
}

const SYNC_FS_FIRST_LIGHT_EVAL = `
const fs = require('fs');
const os = require('os');
const path = require('path');
const file = path.join(
  os.tmpdir(),
  'secure-exec-upstream-fs-sync-' + process.pid + '-' + Date.now() + '.txt'
);
const payload = Buffer.from('vendored-fs-sync');
const writeFd = fs.openSync(file, 'w+');
fs.writeSync(writeFd, payload, 0, payload.length, 0);
fs.closeSync(writeFd);
const readFd = fs.openSync(file, 'r');
const target = Buffer.alloc(payload.length);
const bytesRead = fs.readSync(readFd, target, 0, target.length, 0);
fs.closeSync(readFd);
const stat = fs.statSync(file);
const entries = fs.readdirSync(path.dirname(file)).filter((entry) => entry === path.basename(file));
const realpath = fs.realpathSync.native(file);
process.stdout.write(JSON.stringify({
  file,
  bytesRead,
  size: stat.size,
  text: target.toString('utf8'),
  entries,
  realpath,
}));
process.__secureExecDone();
`.trim();

const CALLBACK_FS_FIRST_LIGHT_EVAL = `
const fs = require('fs');
const os = require('os');
const path = require('path');
const file = path.join(
  os.tmpdir(),
  'secure-exec-upstream-fs-callback-' + process.pid + '-' + Date.now() + '.txt'
);
const payload = Buffer.from('vendored-fs-callback');
function finish(error) {
  process.__secureExecDone(error ? (error.stack || String(error)) : undefined);
}
function succeed(summary) {
  process.stdout.write(JSON.stringify(summary));
  finish();
}

fs.open(file, 'w+', (openErr, writeFd) => {
  if (openErr) return finish(openErr);
  fs.write(writeFd, payload, 0, payload.length, 0, (writeErr) => {
    if (writeErr) return finish(writeErr);
    fs.close(writeFd, (closeWriteErr) => {
      if (closeWriteErr) return finish(closeWriteErr);
      fs.open(file, 'r', (reopenErr, readFd) => {
        if (reopenErr) return finish(reopenErr);
        const target = Buffer.alloc(payload.length);
        fs.read(readFd, target, 0, target.length, 0, (readErr, bytesRead) => {
          if (readErr) return finish(readErr);
          fs.close(readFd, (closeReadErr) => {
            if (closeReadErr) return finish(closeReadErr);
            fs.stat(file, (statErr, stat) => {
              if (statErr) return finish(statErr);
              fs.readdir(path.dirname(file), (readdirErr, entries) => {
                if (readdirErr) return finish(readdirErr);
                fs.realpath.native(file, (realpathErr, realpath) => {
                  if (realpathErr) return finish(realpathErr);
                  succeed({
                    file,
                    bytesRead,
                    size: stat.size,
                    text: target.toString('utf8'),
                    entries: entries.filter((entry) => entry === path.basename(file)),
                    realpath,
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
`.trim();

function readStdout(events: readonly StdioEvent[]): string {
	return events
		.filter((event) => event.channel === "stdout")
		.map((event) => event.message)
		.join("");
}

function readBufferChunks(chunks: readonly Uint8Array[]): string {
	return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function parseFsSummary(stdout: string): FsFirstLightSummary {
	return JSON.parse(stdout) as FsFirstLightSummary;
}

function cleanupSummary(summary: FsFirstLightSummary): void {
	rmSync(summary.file, { force: true });
	rmSync(summary.realpath, { force: true });
}

function expectFirstLightSummary(
	summary: FsFirstLightSummary,
	expectedText: string,
): void {
	expect(summary.bytesRead).toBe(expectedText.length);
	expect(summary.size).toBe(expectedText.length);
	expect(summary.text).toBe(expectedText);
	expect(summary.entries).toHaveLength(1);
	expect(basename(summary.realpath)).toBe(basename(summary.file));
}

describe("upstream fs first-light", () => {
	let runtime: NodeRuntime | undefined;
	let kernel: Kernel | undefined;

	afterEach(async () => {
		runtime?.dispose();
		runtime = undefined;

		if (kernel) {
			await kernel.dispose();
			kernel = undefined;
		}
	});

	it("loads vendored fs through the isolated child runner for sync first-light operations", async () => {
		const result = await runUpstreamFsFirstLightEval({
			code: SYNC_FS_FIRST_LIGHT_EVAL,
		});

		expect(result.status).toBe("pass");
		expect(result.code).toBe(0);
		expect(result.internalBindings).toEqual(expect.arrayContaining(["fs"]));
		expect(result.vendoredPublicBuiltinsLoaded).toEqual(
			expect.arrayContaining(["fs"]),
		);
		expect(result.publicBuiltinFallbacks).not.toContain("fs");
		expect(result.fsBackendAbiVersion).toBe(1);
		expect(result.fsBackendArtifacts).toEqual(["node_fs_backend"]);
		expect(result.fsBackendOperations).toEqual(
			expect.arrayContaining([
				"open",
				"read",
				"readdir",
				"realpath",
				"stat",
				"write",
			]),
		);

		const summary = parseFsSummary(result.stdout);
		try {
			expectFirstLightSummary(summary, "vendored-fs-sync");
		} finally {
			cleanupSummary(summary);
		}
	});

	it("loads vendored fs through the isolated child runner for callback first-light operations", async () => {
		const result = await runUpstreamFsFirstLightEval({
			code: CALLBACK_FS_FIRST_LIGHT_EVAL,
		});

		expect(result.status).toBe("pass");
		expect(result.code).toBe(0);
		expect(result.internalBindings).toEqual(expect.arrayContaining(["fs"]));
		expect(result.vendoredPublicBuiltinsLoaded).toEqual(
			expect.arrayContaining(["fs"]),
		);
		expect(result.publicBuiltinFallbacks).not.toContain("fs");
		expect(result.fsBackendAbiVersion).toBe(1);
		expect(result.fsBackendArtifacts).toEqual(["node_fs_backend"]);
		expect(result.fsBackendOperations).toEqual(
			expect.arrayContaining([
				"open",
				"read",
				"readdir",
				"realpath",
				"stat",
				"write",
			]),
		);

		const summary = parseFsSummary(result.stdout);
		try {
			expectFirstLightSummary(summary, "vendored-fs-callback");
		} finally {
			cleanupSummary(summary);
		}
	});

	it("runs vendored fs first-light through standalone NodeRuntime", async () => {
		const stdio: StdioEvent[] = [];
		runtime = new NodeRuntime({
			systemDriver: createNodeDriver({
				filesystem: createInMemoryFileSystem(),
				commandExecutor: createCommandExecutorStub(),
			}),
			runtimeDriverFactory:
				createExperimentalUpstreamFsFirstLightRuntimeDriverFactory(),
			onStdio: (event) => stdio.push(event),
		});

		const result = await runtime.exec(SYNC_FS_FIRST_LIGHT_EVAL);

		expect(result.code).toBe(0);

		const summary = parseFsSummary(readStdout(stdio));
		try {
			expectFirstLightSummary(summary, "vendored-fs-sync");
		} finally {
			cleanupSummary(summary);
		}
	});

	it("runs vendored fs first-light through a kernel-mounted runtime driver", async () => {
		kernel = createKernel({
			filesystem: createInMemoryFileSystem(),
		});
		await kernel.mount(createExperimentalUpstreamFsFirstLightKernelRuntime());

		const stdout: Uint8Array[] = [];
		const stderr: Uint8Array[] = [];
		const proc = kernel.spawn("node", ["-e", CALLBACK_FS_FIRST_LIGHT_EVAL], {
			onStdout: (data) => stdout.push(data),
			onStderr: (data) => stderr.push(data),
		});
		const exitCode = await proc.wait();
		const stdoutText = readBufferChunks(stdout);
		const stderrText = readBufferChunks(stderr);

		expect(exitCode).toBe(0);
		expect(stderrText).toBe("");

		const summary = parseFsSummary(stdoutText);
		try {
			expectFirstLightSummary(summary, "vendored-fs-callback");
		} finally {
			cleanupSummary(summary);
		}
	});
});
