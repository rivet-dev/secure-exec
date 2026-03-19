import { afterEach, describe, expect, it } from "vitest";
import {
	allowAllFs,
	allowAllNetwork,
	NodeRuntime,
	createInMemoryFileSystem,
} from "../../../src/index.js";
import type { NetworkAdapter } from "../../../src/types.js";
import { createTestNodeRuntime } from "../../test-utils.js";

const DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES = 16 * 1024 * 1024;
const DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MAX_CONFIGURED_PAYLOAD_BYTES = 64 * 1024 * 1024;
const PAYLOAD_LIMIT_ERROR_CODE = "ERR_SANDBOX_PAYLOAD_TOO_LARGE";

type CapturedConsoleEvent = {
	channel: "stdout" | "stderr";
	message: string;
};

function formatConsoleChannel(
	events: CapturedConsoleEvent[],
	channel: CapturedConsoleEvent["channel"],
): string {
	const lines = events
		.filter((event) => event.channel === channel)
		.map((event) => event.message);
	return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

function createConsoleCapture() {
	const events: CapturedConsoleEvent[] = [];
	return {
		onStdio: (event: CapturedConsoleEvent) => {
			events.push(event);
		},
		stdout: () => formatConsoleChannel(events, "stdout"),
	};
}

function bytesOverBinaryLimit(limitBytes: number): number {
	return limitBytes + 1;
}

function createEchoNetworkAdapter(): NetworkAdapter {
	return {
		async fetch(url, options) {
			return {
				ok: true,
				status: 200,
				statusText: "OK",
				headers: {},
				body: options.body ?? "",
				url,
				redirected: false,
			};
		},
		async dnsLookup() {
			return { address: "127.0.0.1", family: 4 };
		},
		async httpRequest(url, options) {
			return {
				status: 200,
				statusText: "OK",
				headers: {},
				body: options.body ?? "",
				url,
			};
		},
	};
}

describe("NodeRuntime payload limits", () => {
	let proc: NodeRuntime | undefined;

	afterEach(() => {
		proc?.dispose();
		proc = undefined;
	});

	it("preserves in-limit binary read/write behavior", async () => {
		const fs = createInMemoryFileSystem();
		const payload = new Uint8Array([0, 1, 2, 3, 255]);
		await fs.mkdir("/data");
		await fs.writeFile("/data/source.bin", payload);

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(`
      const fs = require('fs');
      const input = fs.readFileSync('/data/source.bin');
      fs.writeFileSync('/data/copy.bin', input);
      console.log(input.length);
    `);

		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe("5\n");

		const copied = await fs.readFile("/data/copy.bin");
		expect(Array.from(copied)).toEqual(Array.from(payload));
	});

	it("rejects oversized binary reads", async () => {
		const fs = createInMemoryFileSystem();
		const oversizedRawBytes = bytesOverBinaryLimit(
			DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES,
		);
		await fs.mkdir("/data");
		await fs.writeFile("/data/too-large-read.bin", new Uint8Array(oversizedRawBytes));

		proc = createTestNodeRuntime({ filesystem: fs, permissions: allowAllFs });
		const result = await proc.exec(`
      const fs = require('fs');
      fs.readFileSync('/data/too-large-read.bin');
    `);

		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain(PAYLOAD_LIMIT_ERROR_CODE);
		expect(result.errorMessage).toContain("fs.readFileBinary");
	});

	it("rejects oversized binary writes", async () => {
		const fs = createInMemoryFileSystem();
		const oversizedRawBytes = bytesOverBinaryLimit(
			DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES,
		);
		await fs.mkdir("/data");

		proc = createTestNodeRuntime({ filesystem: fs, permissions: allowAllFs });
		const result = await proc.exec(`
      const fs = require('fs');
      fs.writeFileSync('/data/too-large-write.bin', Buffer.alloc(${oversizedRawBytes}));
    `);

		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain(PAYLOAD_LIMIT_ERROR_CODE);
		expect(result.errorMessage).toContain("fs.writeFileBinary");
		expect(await fs.exists("/data/too-large-write.bin")).toBe(false);
	});

	it("preserves in-limit JSON bridge payload parsing behavior", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			networkAdapter: createEchoNetworkAdapter(),
			permissions: allowAllNetwork,
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(`
      (async () => {
        const response = await fetch('https://example.test/in-limit', {
          method: 'POST',
          body: 'ok',
        });
        console.log(await response.text());
      })();
    `);

		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe("ok\n");
	});

	it("rejects oversized JSON payloads before host JSON.parse", async () => {
		proc = createTestNodeRuntime({
			networkAdapter: createEchoNetworkAdapter(),
			permissions: allowAllNetwork,
		});
		const result = await proc.exec(`
      (async () => {
        const body = 'x'.repeat(${DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES + 1024});
        await fetch('https://example.test/too-large', {
          method: 'POST',
          body,
        });
      })();
    `);

		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain(PAYLOAD_LIMIT_ERROR_CODE);
		expect(result.errorMessage).toContain("network.fetch options");
	});

	it("allows larger binary payloads with in-range configured limits", async () => {
		const fs = createInMemoryFileSystem();
		const oversizedRawBytes = bytesOverBinaryLimit(
			DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES,
		);
		await fs.mkdir("/data");

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
			payloadLimits: {
				base64TransferBytes: DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES + 4096,
			},
		});
		const result = await proc.exec(`
      const fs = require('fs');
      fs.writeFileSync('/data/large-configured.bin', Buffer.alloc(${oversizedRawBytes}));
      console.log('ok');
    `);

		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe("ok\n");
		const stored = await fs.readFile("/data/large-configured.bin");
		expect(stored.byteLength).toBe(oversizedRawBytes);
	});

	it("allows larger JSON payloads with in-range configured limits", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			networkAdapter: createEchoNetworkAdapter(),
			permissions: allowAllNetwork,
			onStdio: capture.onStdio,
			payloadLimits: {
				jsonPayloadBytes: DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES + 4096,
			},
		});
		const result = await proc.exec(`
      (async () => {
        const body = 'x'.repeat(${DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES + 1024});
        await fetch('https://example.test/configured', { method: 'POST', body });
        console.log('ok');
      })();
    `);

		expect(result.code).toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(capture.stdout()).toBe("ok\n");
	});

	it("rejects oversized fetch response body", async () => {
		const oversizedBody = "x".repeat(DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES);
		const adapter: NetworkAdapter = {
			async fetch() {
				return {
					ok: true,
					status: 200,
					statusText: "OK",
					headers: {},
					body: oversizedBody,
					url: "https://example.test/large",
					redirected: false,
				};
			},
			async dnsLookup() {
				return { address: "127.0.0.1", family: 4 };
			},
			async httpRequest() {
				return {
					status: 200,
					statusText: "OK",
					headers: {},
					body: "",
					url: "https://example.test/large",
				};
			},
		};
		proc = createTestNodeRuntime({
			networkAdapter: adapter,
			permissions: allowAllNetwork,
		});
		const result = await proc.exec(`
      (async () => {
        await fetch('https://example.test/large');
      })();
    `);
		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain(PAYLOAD_LIMIT_ERROR_CODE);
		expect(result.errorMessage).toContain("network.fetch response");
	});

	it("rejects oversized httpRequest response body", async () => {
		const oversizedBody = "x".repeat(DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES);
		const adapter: NetworkAdapter = {
			async fetch() {
				return {
					ok: true,
					status: 200,
					statusText: "OK",
					headers: {},
					body: "",
					url: "https://example.test/ok",
					redirected: false,
				};
			},
			async dnsLookup() {
				return { address: "127.0.0.1", family: 4 };
			},
			async httpRequest() {
				return {
					status: 200,
					statusText: "OK",
					headers: {},
					body: oversizedBody,
					url: "https://example.test/large",
				};
			},
		};
		proc = createTestNodeRuntime({
			networkAdapter: adapter,
			permissions: allowAllNetwork,
		});
		const result = await proc.exec(`
      (async () => {
        const http = require('http');
        await new Promise((resolve, reject) => {
          const req = http.request('https://example.test/large', { method: 'GET' }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
          });
          req.on('error', reject);
          req.end();
        });
      })();
    `);
		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain(PAYLOAD_LIMIT_ERROR_CODE);
		expect(result.errorMessage).toContain("network.httpRequest response");
	});

	it("rejects oversized readDir result", async () => {
		const fs = createInMemoryFileSystem();
		// Create enough entries to exceed the JSON payload limit
		// Each entry is ~40 bytes in JSON, so we need ~100k entries for 4MB
		const entryCount = Math.ceil(DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES / 30);
		await fs.mkdir("/bigdir");
		for (let i = 0; i < entryCount; i++) {
			await fs.writeFile(`/bigdir/file-${String(i).padStart(6, "0")}`, "x");
		}

		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
		});
		const result = await proc.exec(`
      const fs = require('fs');
      fs.readdirSync('/bigdir');
    `);
		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain(PAYLOAD_LIMIT_ERROR_CODE);
		expect(result.errorMessage).toContain("fs.readDir");
	});

	it("allows normal-sized readDir results", async () => {
		const fs = createInMemoryFileSystem();
		await fs.mkdir("/normaldir");
		for (let i = 0; i < 10; i++) {
			await fs.writeFile(`/normaldir/file-${i}`, "x");
		}

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(`
      const fs = require('fs');
      const entries = fs.readdirSync('/normaldir');
      console.log(entries.length);
    `);
		expect(result.code).toBe(0);
		expect(capture.stdout()).toBe("10\n");
	});

	it("allows normal-sized fetch response", async () => {
		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			networkAdapter: createEchoNetworkAdapter(),
			permissions: allowAllNetwork,
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(`
      (async () => {
        const response = await fetch('https://example.test/ok', {
          method: 'POST',
          body: 'hello',
        });
        console.log(await response.text());
      })();
    `);
		expect(result.code).toBe(0);
		expect(capture.stdout()).toBe("hello\n");
	});

	it("rejects oversized text file reads", async () => {
		const fs = createInMemoryFileSystem();
		const oversizedText = "x".repeat(DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES + 1);
		await fs.mkdir("/data");
		await fs.writeFile("/data/too-large.txt", oversizedText);

		proc = createTestNodeRuntime({ filesystem: fs, permissions: allowAllFs });
		const result = await proc.exec(`
      const fs = require('fs');
      fs.readFileSync('/data/too-large.txt', 'utf8');
    `);

		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain(PAYLOAD_LIMIT_ERROR_CODE);
		expect(result.errorMessage).toContain("fs.readFile");
	});

	it("allows normal-sized text file reads", async () => {
		const fs = createInMemoryFileSystem();
		await fs.mkdir("/data");
		await fs.writeFile("/data/normal.txt", "hello world");

		const capture = createConsoleCapture();
		proc = createTestNodeRuntime({
			filesystem: fs,
			permissions: allowAllFs,
			onStdio: capture.onStdio,
		});
		const result = await proc.exec(`
      const fs = require('fs');
      const content = fs.readFileSync('/data/normal.txt', 'utf8');
      console.log(content);
    `);

		expect(result.code).toBe(0);
		expect(capture.stdout()).toBe("hello world\n");
	});

	it("rejects out-of-range payload limit configuration", () => {
		expect(
			() => createTestNodeRuntime({ payloadLimits: { jsonPayloadBytes: 0 } }),
		).toThrow(RangeError);
		expect(
			() =>
				createTestNodeRuntime({
					payloadLimits: {
						base64TransferBytes: MAX_CONFIGURED_PAYLOAD_BYTES + 1,
					},
				}),
		).toThrow(RangeError);
	});
});
