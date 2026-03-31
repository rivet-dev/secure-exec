import { afterEach, describe, expect, it } from "vitest";
import {
	createCommandExecutorStub,
	createInMemoryFileSystem,
	createKernel,
	type Kernel,
	type StdioEvent,
} from "@secure-exec/core";
import { NodeRuntime } from "../../secure-exec/src/runtime.ts";
import {
	createNodeDriver,
} from "../src/index.ts";
import {
	createReplacementNodeKernelRuntime,
	createReplacementNodeRuntimeDriverFactory,
	runUpstreamNetFirstLightEval,
} from "../src/upstream/bootstrap-execution.ts";

interface NetFirstLightSummary {
	serverHandle: string | null;
	serverOwner: boolean;
	clientHandle: string | null;
	clientOwner: boolean;
	serverRefStates: Array<boolean | null>;
	messages: string[];
}

const NET_FIRST_LIGHT_EVAL = `
const net = require('net');
const summary = {
  serverHandle: null,
  serverOwner: false,
  clientHandle: null,
  clientOwner: false,
  serverRefStates: [],
  messages: [],
};
let serverSocket;

function finish(error) {
  if (error) {
    process.__secureExecDone(error.stack || String(error));
    return;
  }
  process.stdout.write(JSON.stringify(summary));
  process.__secureExecDone();
}

const server = net.createServer((socket) => {
  serverSocket = socket;
  socket.once('data', (chunk) => {
    summary.messages.push('server:' + chunk.toString('utf8'));
    socket.write('pong');
  });
});

server.listen(0, '127.0.0.1', () => {
  summary.serverHandle = server._handle?.constructor?.name ?? null;
  summary.serverOwner = server._handle?.owner === server;
  summary.serverRefStates.push(server._handle?.hasRef?.() ?? null);
  server.unref();
  summary.serverRefStates.push(server._handle?.hasRef?.() ?? null);
  server.ref();
  summary.serverRefStates.push(server._handle?.hasRef?.() ?? null);

  const client = net.connect({ port: server.address().port, host: '127.0.0.1' });
  client.on('connect', () => {
    summary.clientHandle = client._handle?.constructor?.name ?? null;
    summary.clientOwner = client._handle?.owner === client;
    client.write('ping');
  });
  client.on('data', (chunk) => {
    summary.messages.push('client:' + chunk.toString('utf8'));
    client.destroy();
    serverSocket?.destroy();
    server.close();
    finish();
  });
  client.on('error', finish);
});

server.on('error', finish);
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

function parseNetSummary(stdout: string): NetFirstLightSummary {
	return JSON.parse(stdout) as NetFirstLightSummary;
}

function expectNetSummary(summary: NetFirstLightSummary): void {
	expect(summary.serverHandle).toBe("UpstreamTCP");
	expect(summary.serverOwner).toBe(true);
	expect(summary.clientHandle).toBe("UpstreamTCP");
	expect(summary.clientOwner).toBe(true);
	expect(summary.serverRefStates).toEqual([true, false, true]);
	expect(summary.messages).toEqual(["server:ping", "client:pong"]);
}

function expectSuccessfulNetEval(
	result: Awaited<ReturnType<typeof runUpstreamNetFirstLightEval>>,
): void {
	expect(result.status, result.errorMessage ?? result.stderr).toBe("pass");
	expect(result.code, result.stderr || result.errorMessage).toBe(0);
	expect(result.entrypoint).toBe("secure_exec/post_bootstrap_eval");
	expect(result.internalBindings).toEqual(
		expect.arrayContaining([
			"cares_wrap",
			"pipe_wrap",
			"stream_wrap",
			"tcp_wrap",
			"uv",
		]),
	);
	expect(result.vendoredPublicBuiltinsLoaded).toEqual(
		expect.arrayContaining(["net"]),
	);
	expect(result.publicBuiltinFallbacks).not.toContain("net");
	expect(result.appliedBindingShims).toEqual(
		expect.arrayContaining([
			"host-internal/util/debuglog-initializeDebugEnv",
			"internal/util/debuglog-initializeDebugEnv",
			"tcp_wrap-owner-subclass",
		]),
	);
}

describe("upstream net first-light", () => {
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

	it("loads vendored net through the isolated child runner for minimal listen/connect/read/write/close behavior", async () => {
		const result = await runUpstreamNetFirstLightEval({
			code: NET_FIRST_LIGHT_EVAL,
		});

		expectSuccessfulNetEval(result);
		expectNetSummary(parseNetSummary(result.stdout));
	});

	it("runs vendored net first-light through standalone NodeRuntime", async () => {
		const stdio: StdioEvent[] = [];
		runtime = new NodeRuntime({
			systemDriver: createNodeDriver({
				filesystem: createInMemoryFileSystem(),
				commandExecutor: createCommandExecutorStub(),
			}),
			runtimeDriverFactory: createReplacementNodeRuntimeDriverFactory(),
			onStdio: (event) => stdio.push(event),
		});

		const result = await runtime.exec(NET_FIRST_LIGHT_EVAL);

		expect(result.code).toBe(0);
		expectNetSummary(parseNetSummary(readStdout(stdio)));
	});

	it("runs vendored net first-light through a kernel-mounted runtime driver", async () => {
		kernel = createKernel({
			filesystem: createInMemoryFileSystem(),
		});
		await kernel.mount(createReplacementNodeKernelRuntime());

		const stdout: Uint8Array[] = [];
		const stderr: Uint8Array[] = [];
		const proc = kernel.spawn("node", ["-e", NET_FIRST_LIGHT_EVAL], {
			onStdout: (data) => stdout.push(data),
			onStderr: (data) => stderr.push(data),
		});
		const exitCode = await proc.wait();

		expect(exitCode, readBufferChunks(stderr)).toBe(0);
		expect(readBufferChunks(stderr)).toBe("");
		expectNetSummary(parseNetSummary(readBufferChunks(stdout)));
	});
});
