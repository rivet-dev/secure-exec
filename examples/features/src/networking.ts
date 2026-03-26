import * as http from "node:http";
import {
	NodeRuntime,
	allowAllNetwork,
	createDefaultNetworkAdapter,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
} from "../../../packages/secure-exec/src/index.ts";

const logs: string[] = [];
const server = http.createServer((_req, res) => {
	res.writeHead(200, { "content-type": "text/plain" });
	res.end("network-ok");
});

await new Promise<void>((resolve, reject) => {
	server.once("error", reject);
	server.listen(0, "127.0.0.1", () => resolve());
});

const address = server.address();
if (!address || typeof address === "string") {
	throw new Error("missing loopback address");
}

const runtime = new NodeRuntime({
	systemDriver: createNodeDriver({
		networkAdapter: createDefaultNetworkAdapter({
			initialExemptPorts: [address.port],
		}),
		permissions: { ...allowAllNetwork },
	}),
	runtimeDriverFactory: createNodeRuntimeDriverFactory(),
});

try {
	const result = await runtime.exec(
		`
			(async () => {
				const response = await fetch("http://127.0.0.1:${address.port}/");
				const body = await response.text();

				if (!response.ok || response.status !== 200 || body !== "network-ok") {
					throw new Error(
						"unexpected response: " + response.status + " " + body,
					);
				}

				console.log(JSON.stringify({ status: response.status, body }));
			})().catch((error) => {
				console.error(error instanceof Error ? error.message : String(error));
				process.exitCode = 1;
			});
		`,
		{
			onStdio: (event) => {
				logs.push(`[${event.channel}] ${event.message}`);
			},
		},
	);

	if (result.code !== 0) {
		throw new Error(`Unexpected execution result: ${JSON.stringify(result)}`);
	}

	const payload = logs
		.filter((line) => line.startsWith("[stdout] "))
		.map((line) => line.slice("[stdout] ".length))
		.map((line) => JSON.parse(line))
		.at(-1);

	if (payload?.status !== 200 || payload?.body !== "network-ok") {
		throw new Error(`Unexpected captured output: ${JSON.stringify(logs)}`);
	}

	console.log(
		JSON.stringify({
			ok: true,
			status: payload.status,
			body: payload.body,
			summary: "sandbox fetched a host-managed loopback HTTP server",
		}),
	);
} finally {
	runtime.dispose();
	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}
