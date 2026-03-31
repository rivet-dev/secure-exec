#!/usr/bin/env node

import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createKernel, allowAllFs } from "@secure-exec/core";
import { createWasmVmRuntime } from "@secure-exec/wasmvm";
import { HostNodeFileSystem } from "../dist/os-filesystem.js";

const ABI_VERSION = 1;
const BACKEND_ARTIFACT = new URL(
	"../assets/upstream-node-backend/node_fs_backend",
	import.meta.url,
);
const BACKEND_DIR = fileURLToPath(
	new URL("../assets/upstream-node-backend/", import.meta.url),
);
const BACKEND_RUNTIME_ROOT =
	process.env.SECURE_EXEC_UPSTREAM_FS_BACKEND_ROOT ??
	join(tmpdir(), "secure-exec-upstream-fs-backend");

function encodeError(error, fallback = {}) {
	return {
		abiVersion: ABI_VERSION,
		ok: false,
		error: {
			code: error?.code ?? fallback.code,
			errno: error?.errno,
			syscall: error?.syscall ?? fallback.syscall,
			path: error?.path ?? fallback.path,
			message:
				error instanceof Error
					? error.message
					: typeof error === "string"
						? error
						: "upstream fs backend helper failed",
		},
	};
}

async function readPayload() {
	let json = "";
	process.stdin.setEncoding("utf8");
	for await (const chunk of process.stdin) {
		json += chunk;
	}
	return JSON.parse(json || "{}");
}

function ensureBackendArtifact() {
	try {
		readFileSync(BACKEND_ARTIFACT);
	} catch {
		throw Object.assign(
			new Error(
				"missing packaged upstream fs backend artifact at packages/nodejs/assets/upstream-node-backend/node_fs_backend; rebuild with `make -C native/wasmvm/c build/node_fs_backend` and copy it into the package asset directory",
			),
			{
				code: "ENOENT",
				path: BACKEND_ARTIFACT.pathname,
				syscall: "open",
			},
		);
	}
}

async function invokeBackend(request) {
	ensureBackendArtifact();
	mkdirSync(BACKEND_RUNTIME_ROOT, { recursive: true });
	mkdirSync(join(BACKEND_RUNTIME_ROOT, "tmp"), { recursive: true });

	const kernel = createKernel({
		filesystem: new HostNodeFileSystem({ root: BACKEND_RUNTIME_ROOT }),
		permissions: { ...allowAllFs },
	});
	await kernel.mount(
		createWasmVmRuntime({
			commandDirs: [BACKEND_DIR],
		}),
	);

	const stdout = [];
	const stderr = [];
	const proc = kernel.spawn("node_fs_backend", [], {
		onStdout: (chunk) => stdout.push(Buffer.from(chunk)),
		onStderr: (chunk) => stderr.push(Buffer.from(chunk)),
	});
	proc.writeStdin(Buffer.from(JSON.stringify(request), "utf8"));
	proc.closeStdin();
	const exitCode = await proc.wait();

	try {
		const stdoutText = Buffer.concat(stdout).toString("utf8");
		const stderrText = Buffer.concat(stderr).toString("utf8");
		if (exitCode !== 0) {
			if (stdoutText.trim()) {
				return JSON.parse(stdoutText);
			}
			throw Object.assign(
				new Error(
					stderrText.trim() ||
						`upstream fs backend exited with status ${exitCode}`,
				),
				{
					code: "EIO",
					syscall: request?.syscall ?? request?.op,
					path: request?.path,
				},
			);
		}
		if (!stdoutText.trim()) {
			throw Object.assign(
				new Error("upstream fs backend produced no JSON output"),
				{
					code: "EIO",
					syscall: request?.syscall ?? request?.op,
					path: request?.path,
				},
			);
		}
		return JSON.parse(stdoutText);
	} finally {
		await kernel.dispose();
	}
}

try {
	const payload = await readPayload();
	if (payload?.abiVersion !== ABI_VERSION) {
		process.stdout.write(
			`${JSON.stringify(
				encodeError(
					Object.assign(
						new Error(
							`unsupported upstream fs backend ABI version ${String(payload?.abiVersion)}`,
						),
						{
							code: "EINVAL",
							syscall: payload?.syscall ?? payload?.op,
							path: payload?.path,
						},
					),
				),
			)}\n`,
		);
		process.exitCode = 1;
	} else {
		process.stdout.write(`${JSON.stringify(await invokeBackend(payload))}\n`);
	}
} catch (error) {
	process.stdout.write(`${JSON.stringify(encodeError(error))}\n`);
	process.exitCode = 1;
}
