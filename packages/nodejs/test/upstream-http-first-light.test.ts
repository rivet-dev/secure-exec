import * as nodeHttp from "node:http";
import * as nodeNet from "node:net";
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
	createNodeRuntime,
	createNodeRuntimeDriverFactory,
} from "../src/index.ts";
import {
	runUpstreamHttpFirstLightEval,
	type UpstreamBootstrapEvalResult,
} from "../src/upstream/bootstrap-execution.ts";

interface HttpRoundTripSummary {
	method: string | null;
	url: string | null;
	statusCode: number | null;
	connection: string | null;
}

interface WireSummary {
	rawResponse: string;
}

interface HttpsLoadSummary {
	requestType: string;
	createServerType: string;
	globalAgentProtocol: string | null;
}

const HTTP_SUPPORT_PUBLIC_BUILTINS = [
	"net",
	"_http_agent",
	"_http_client",
	"_http_common",
	"_http_incoming",
	"_http_outgoing",
	"_http_server",
] as const;

const HTTP_ROUND_TRIP_EVAL = `
const http = require('http');
const summary = {
  method: null,
  url: null,
  statusCode: null,
  connection: null,
};
let finished = false;

function finish(error) {
  if (finished) {
    return;
  }
  finished = true;
  if (error) {
    process.__secureExecDone(error.stack || String(error));
    return;
  }
  process.stdout.write(JSON.stringify(summary));
  process.__secureExecDone();
}

const server = http.createServer((req, res) => {
  summary.method = req.method ?? null;
  summary.url = req.url ?? null;
  res.setHeader('Connection', 'close');
  res.end('pong');
});

server.listen(0, '127.0.0.1', () => {
  server.unref();
  const req = http.get({
    host: '127.0.0.1',
    port: server.address().port,
    path: '/first-light',
    headers: { Connection: 'close' },
  }, (res) => {
    summary.statusCode = res.statusCode ?? null;
    summary.connection = typeof res.headers.connection === 'string' ? res.headers.connection : null;
    req.destroy();
    res.socket?.destroy();
    finish();
  });

  req.on('socket', (socket) => {
    socket.unref();
  });
  req.on('error', finish);
});

server.on('error', finish);
`.trim();

const HTTP_WIRE_EVAL = `
const http = require('http');
const net = require('net');
const chunks = [];

function finish(error) {
  if (error) {
    process.__secureExecDone(error.stack || String(error));
    return;
  }
  process.stdout.write(JSON.stringify({
    rawResponse: Buffer.concat(chunks).toString('latin1'),
  }));
  process.__secureExecDone();
}

const server = http.createServer((req, res) => {
  res.sendDate = false;
  res.statusCode = 201;
  res.setHeader('X-Secure-Exec', 'wire');
  res.setHeader('Connection', 'close');
  res.end('pong');
});

server.listen(0, '127.0.0.1', () => {
  server.unref();
  const socket = net.connect({
    host: '127.0.0.1',
    port: server.address().port,
  });

  socket.on('connect', () => {
    socket.unref();
    socket.end('GET /wire HTTP/1.1\\r\\nHost: 127.0.0.1\\r\\nConnection: close\\r\\n\\r\\n');
  });
  socket.on('data', (chunk) => {
    chunks.push(Buffer.from(chunk));
    if (Buffer.concat(chunks).toString('latin1').includes('\\r\\n\\r\\npong')) {
      socket.destroy();
      finish();
    }
  });
  socket.on('error', (error) => {
    finish(error);
  });
});

server.on('error', finish);
`.trim();

const HTTPS_LOAD_EVAL = `
const https = require('https');
process.stdout.write(JSON.stringify({
  requestType: typeof https.request,
  createServerType: typeof https.createServer,
  globalAgentProtocol: https.globalAgent?.protocol ?? null,
}));
process.__secureExecDone();
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

function parseJson<T>(stdout: string): T {
	return JSON.parse(stdout) as T;
}

function expectSuccessfulHttpEval(
	result: UpstreamBootstrapEvalResult,
	expectedBuiltins: readonly string[],
): void {
	expect(result.status, result.errorMessage ?? result.stderr).toBe("pass");
	expect(result.code, result.stderr || result.errorMessage).toBe(0);
	expect(result.entrypoint).toBe("secure_exec/post_bootstrap_eval");
	expect(result.internalBindings).toEqual(
		expect.arrayContaining([
			"cares_wrap",
			"http_parser",
			"pipe_wrap",
			"stream_wrap",
			"tcp_wrap",
			"uv",
		]),
	);
	expect(result.vendoredPublicBuiltinsLoaded).toEqual(
		expect.arrayContaining([
			...HTTP_SUPPORT_PUBLIC_BUILTINS,
			...expectedBuiltins,
		]),
	);
	for (const builtin of [
		"http",
		"https",
		"_http_agent",
		"_http_client",
		"_http_common",
		"_http_incoming",
		"_http_outgoing",
		"_http_server",
	]) {
		expect(result.publicBuiltinFallbacks).not.toContain(builtin);
	}
	expect(result.appliedBindingShims).toEqual(
		expect.arrayContaining([
			"http-cluster-host-context",
			"tcp_wrap-owner-subclass",
		]),
	);
}

function expectRoundTripSummary(summary: HttpRoundTripSummary): void {
	expect(summary).toEqual({
		method: "GET",
		url: "/first-light",
		statusCode: 200,
		connection: "close",
	});
}

async function captureHostWireResponse(): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		const server = nodeHttp.createServer((_req, res) => {
			res.sendDate = false;
			res.statusCode = 201;
			res.setHeader("X-Secure-Exec", "wire");
			res.setHeader("Connection", "close");
			res.end("pong");
		});

		const fail = (error: Error) => {
			server.close(() => reject(error));
		};

		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				fail(new Error("host HTTP control server did not expose a TCP port"));
				return;
			}

			const socket = nodeNet.connect({
				host: "127.0.0.1",
				port: address.port,
			});
			socket.on("connect", () => {
				socket.end(
					"GET /wire HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
				);
			});
			socket.on("data", (chunk) => {
				chunks.push(Buffer.from(chunk));
			});
			socket.on("end", () => {
				server.close((closeError) => {
					if (closeError) {
						reject(closeError);
						return;
					}
					resolve(Buffer.concat(chunks).toString("latin1"));
				});
			});
			socket.on("error", fail);
		});
	});
}

describe("upstream http first-light", () => {
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

	it("runs vendored http server/client round-trips through the isolated child runner", async () => {
		const result = await runUpstreamHttpFirstLightEval({
			code: HTTP_ROUND_TRIP_EVAL,
		});

		expectSuccessfulHttpEval(result, ["http"]);
		expectRoundTripSummary(parseJson<HttpRoundTripSummary>(result.stdout));
	});

	it("runs vendored http first-light through standalone NodeRuntime", async () => {
		const stdio: StdioEvent[] = [];
		runtime = new NodeRuntime({
			systemDriver: createNodeDriver({
				filesystem: createInMemoryFileSystem(),
				commandExecutor: createCommandExecutorStub(),
			}),
			runtimeDriverFactory: createNodeRuntimeDriverFactory(),
			onStdio: (event) => stdio.push(event),
		});

		const result = await runtime.exec(HTTP_ROUND_TRIP_EVAL);

		expect(result.code).toBe(0);
		expectRoundTripSummary(parseJson<HttpRoundTripSummary>(readStdout(stdio)));
	});

	it("runs vendored http first-light through a kernel-mounted runtime driver", async () => {
		kernel = createKernel({
			filesystem: createInMemoryFileSystem(),
		});
		await kernel.mount(createNodeRuntime());

		const stdout: Uint8Array[] = [];
		const stderr: Uint8Array[] = [];
		const proc = kernel.spawn("node", ["-e", HTTP_ROUND_TRIP_EVAL], {
			onStdout: (data) => stdout.push(data),
			onStderr: (data) => stderr.push(data),
		});
		const exitCode = await proc.wait();

		expect(exitCode, readBufferChunks(stderr)).toBe(0);
		expect(readBufferChunks(stderr)).toBe("");
		expectRoundTripSummary(
			parseJson<HttpRoundTripSummary>(readBufferChunks(stdout)),
		);
	});

	it("matches host Node wire bytes for a representative raw-socket HTTP response", async () => {
		const result = await runUpstreamHttpFirstLightEval({
			code: HTTP_WIRE_EVAL,
		});

		expectSuccessfulHttpEval(result, ["http"]);

		const summary = parseJson<WireSummary>(result.stdout);
		const hostWireResponse = await captureHostWireResponse();
		expect(summary.rawResponse).toBe(hostWireResponse);
	});

	it("loads vendored https through the replacement runtime while leaving tls on the host side", async () => {
		const result = await runUpstreamHttpFirstLightEval({
			code: HTTPS_LOAD_EVAL,
		});

		expectSuccessfulHttpEval(result, ["https"]);
		expect(parseJson<HttpsLoadSummary>(result.stdout)).toEqual({
			requestType: "function",
			createServerType: "function",
			globalAgentProtocol: "https:",
		});
	});
});
