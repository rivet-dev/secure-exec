import * as dns from "node:dns";
import * as fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import * as http from "node:http";
import * as https from "node:https";
import type { Server as HttpServer } from "node:http";
import * as zlib from "node:zlib";
import {
	filterEnv,
} from "../shared/permissions.js";
import { ModuleAccessFileSystem } from "./module-access.js";
import { NodeExecutionDriver } from "./execution-driver.js";
import type {
	OSConfig,
	ProcessConfig,
} from "../shared/api-types.js";
import type {
	CommandExecutor,
	NetworkAdapter,
	Permissions,
	RuntimeExecutionDriverFactory,
	RuntimeDriver,
	VirtualFileSystem,
} from "../types.js";
import type { ModuleAccessOptions } from "./module-access.js";

/** Options for assembling a Node.js-backed RuntimeDriver. */
export interface NodeDriverOptions {
	filesystem?: VirtualFileSystem;
	moduleAccess?: ModuleAccessOptions;
	networkAdapter?: NetworkAdapter;
	commandExecutor?: CommandExecutor;
	permissions?: Permissions;
	useDefaultNetwork?: boolean;
	processConfig?: ProcessConfig;
	osConfig?: OSConfig;
}

export interface NodeExecutionFactoryOptions {
	createIsolate?(memoryLimit: number): unknown;
}

/** Thin VFS adapter that delegates directly to `node:fs/promises`. */
export class NodeFileSystem implements VirtualFileSystem {
	async readFile(path: string): Promise<Uint8Array> {
		return fs.readFile(path);
	}

	async readTextFile(path: string): Promise<string> {
		return fs.readFile(path, "utf8");
	}

	async readDir(path: string): Promise<string[]> {
		return fs.readdir(path);
	}

	async readDirWithTypes(
		path: string,
	): Promise<Array<{ name: string; isDirectory: boolean }>> {
		const entries = await fs.readdir(path, { withFileTypes: true });
		return entries.map((entry) => ({
			name: entry.name,
			isDirectory: entry.isDirectory(),
		}));
	}

	async writeFile(path: string, content: string | Uint8Array): Promise<void> {
		await fs.writeFile(path, content);
	}

	async createDir(path: string): Promise<void> {
		await fs.mkdir(path);
	}

	async mkdir(path: string): Promise<void> {
		await fs.mkdir(path, { recursive: true });
	}

	async exists(path: string): Promise<boolean> {
		try {
			await fs.access(path);
			return true;
		} catch {
			return false;
		}
	}

	async stat(path: string): Promise<{
		mode: number;
		size: number;
		isDirectory: boolean;
		atimeMs: number;
		mtimeMs: number;
		ctimeMs: number;
		birthtimeMs: number;
	}> {
		const info = await fs.stat(path);
		return {
			mode: info.mode,
			size: info.size,
			isDirectory: info.isDirectory(),
			atimeMs: info.atimeMs,
			mtimeMs: info.mtimeMs,
			ctimeMs: info.ctimeMs,
			birthtimeMs: info.birthtimeMs,
		};
	}

	async removeFile(path: string): Promise<void> {
		await fs.unlink(path);
	}

	async removeDir(path: string): Promise<void> {
		await fs.rmdir(path);
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		await fs.rename(oldPath, newPath);
	}
}

/** Restrict HTTP server hostname to loopback interfaces; throws on non-local addresses. */
function normalizeLoopbackHostname(hostname?: string): string {
	if (!hostname || hostname === "localhost") return "127.0.0.1";
	if (hostname === "127.0.0.1" || hostname === "::1") return hostname;
	if (hostname === "0.0.0.0" || hostname === "::") return "127.0.0.1";
	throw new Error(
		`Sandbox HTTP servers are restricted to loopback interfaces. Received hostname: ${hostname}`,
	);
}

/**
 * Create a Node.js network adapter that provides real fetch, DNS, HTTP client,
 * and loopback-only HTTP server support. Binary responses are base64-encoded
 * with an `x-body-encoding` header so the bridge can decode them.
 */
export function createDefaultNetworkAdapter(): NetworkAdapter {
	const servers = new Map<number, HttpServer>();

	return {
		async httpServerListen(options) {
			const listenHost = normalizeLoopbackHostname(options.hostname);
			const server = http.createServer(async (req, res) => {
				try {
					const chunks: Buffer[] = [];
					for await (const chunk of req) {
						chunks.push(
							Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
						);
					}

					const headers: Record<string, string> = {};
					Object.entries(req.headers).forEach(([key, value]) => {
						if (typeof value === "string") {
							headers[key] = value;
						} else if (Array.isArray(value)) {
							headers[key] = value[0] ?? "";
						}
					});
					if (!headers.host) {
						const localAddress = req.socket.localAddress;
						const localPort = req.socket.localPort;
						if (localAddress && localPort) {
							headers.host = `${localAddress}:${localPort}`;
						}
					}

					const response = await options.onRequest({
						method: req.method || "GET",
						url: req.url || "/",
						headers,
						rawHeaders: req.rawHeaders || [],
						bodyBase64:
							chunks.length > 0
								? Buffer.concat(chunks).toString("base64")
								: undefined,
					});

					res.statusCode = response.status || 200;
					for (const [key, value] of response.headers || []) {
						res.setHeader(key, value);
					}

					if (response.body !== undefined) {
						if (response.bodyEncoding === "base64") {
							res.end(Buffer.from(response.body, "base64"));
						} else {
							res.end(response.body);
						}
					} else {
						res.end();
					}
				} catch (error) {
					res.statusCode = 500;
					res.end(
						error instanceof Error
							? error.message
							: "Sandbox HTTP server bridge error",
					);
				}
			});

			await new Promise<void>((resolve, reject) => {
				const onListening = () => resolve();
				const onError = (err: Error) => reject(err);
				server.once("listening", onListening);
				server.once("error", onError);
				server.listen(options.port ?? 0, listenHost);
			});

			const rawAddress = server.address();
			let address: { address: string; family: string; port: number } | null = null;

			if (rawAddress && typeof rawAddress !== "string") {
				const info = rawAddress as AddressInfo;
				address = {
					address: info.address,
					family: String(info.family),
					port: info.port,
				};
			}

			servers.set(options.serverId, server);
			return { address };
		},

		async httpServerClose(serverId) {
			const server = servers.get(serverId);
			if (!server) return;

			await new Promise<void>((resolve, reject) => {
				server.close((err) => {
					if (err) reject(err);
					else resolve();
				});
			});

			servers.delete(serverId);
		},

		async fetch(url, options) {
			const response = await fetch(url, {
				method: options?.method || "GET",
				headers: options?.headers,
				body: options?.body,
			});
			const headers: Record<string, string> = {};
			response.headers.forEach((v, k) => {
				headers[k] = v;
			});

			delete headers["content-encoding"];

			const contentType = response.headers.get("content-type") || "";
			const isBinary =
				contentType.includes("octet-stream") ||
				contentType.includes("gzip") ||
				url.endsWith(".tgz");

			let body: string;
			if (isBinary) {
				const buffer = await response.arrayBuffer();
				body = Buffer.from(buffer).toString("base64");
				headers["x-body-encoding"] = "base64";
			} else {
				body = await response.text();
			}

			return {
				ok: response.ok,
				status: response.status,
				statusText: response.statusText,
				headers,
				body,
				url: response.url,
				redirected: response.redirected,
			};
		},

		async dnsLookup(hostname) {
			return new Promise((resolve) => {
				dns.lookup(hostname, (err, address, family) => {
					if (err) {
						resolve({ error: err.message, code: err.code || "ENOTFOUND" });
					} else {
						resolve({ address, family });
					}
				});
			});
		},

		async httpRequest(url, options) {
			return new Promise((resolve, reject) => {
				const urlObj = new URL(url);
				const reqOptions: https.RequestOptions = {
					hostname: urlObj.hostname,
					port: urlObj.port || 443,
					path: urlObj.pathname + urlObj.search,
					method: options?.method || "GET",
					headers: options?.headers || {},
				};

				const req = https.request(reqOptions, (res) => {
					const chunks: Buffer[] = [];
					res.on("data", (chunk: Buffer) => chunks.push(chunk));
					res.on("end", async () => {
						let buffer: Buffer = Buffer.concat(chunks);

						const contentEncoding = res.headers["content-encoding"];
						if (contentEncoding === "gzip" || contentEncoding === "deflate") {
							try {
								buffer = await new Promise((res, rej) => {
									const decompress =
										contentEncoding === "gzip" ? zlib.gunzip : zlib.inflate;
									decompress(buffer, (err, result) => {
										if (err) rej(err);
										else res(result);
									});
								});
							} catch {
								// If decompression fails, use original buffer
							}
						}

						const contentType = res.headers["content-type"] || "";
						const isBinary =
							contentType.includes("octet-stream") ||
							contentType.includes("gzip") ||
							url.endsWith(".tgz");

						const headers: Record<string, string> = {};
						Object.entries(res.headers).forEach(([k, v]) => {
							if (typeof v === "string") headers[k] = v;
							else if (Array.isArray(v)) headers[k] = v.join(", ");
						});

						delete headers["content-encoding"];

						if (isBinary) {
							headers["x-body-encoding"] = "base64";
							resolve({
								status: res.statusCode || 200,
								statusText: res.statusMessage || "OK",
								headers,
								body: buffer.toString("base64"),
								url,
							});
						} else {
							resolve({
								status: res.statusCode || 200,
								statusText: res.statusMessage || "OK",
								headers,
								body: buffer.toString("utf-8"),
								url,
							});
						}
					});
					res.on("error", reject);
				});

				req.on("error", reject);
				if (options?.body) req.write(options.body);
				req.end();
			});
		},
	};
}

/**
 * Assemble a RuntimeDriver from Node.js-native adapters. Wraps the filesystem
 * in a ModuleAccessFileSystem overlay and keeps capabilities deny-by-default
 * unless explicit permissions are provided.
 */
export function createNodeDriver(options: NodeDriverOptions = {}): RuntimeDriver {
	const filesystem = new ModuleAccessFileSystem(
		options.filesystem,
		options.moduleAccess ?? {},
	);
	const permissions = options.permissions;
	const networkAdapter = options.networkAdapter
		? options.networkAdapter
		: options.useDefaultNetwork
			? createDefaultNetworkAdapter()
			: undefined;

	return {
		filesystem,
		network: networkAdapter,
		commandExecutor: options.commandExecutor,
		permissions,
		runtime: {
			process: {
				...(options.processConfig ?? {}),
			},
			os: {
				...(options.osConfig ?? {}),
			},
		},
	};
}

export function createNodeExecutionFactory(
	options: NodeExecutionFactoryOptions = {},
): RuntimeExecutionDriverFactory {
	return {
		createExecutionDriver: (runtimeOptions) =>
			new NodeExecutionDriver({
				...runtimeOptions,
				createIsolate: options.createIsolate,
			}),
	};
}

export { filterEnv, NodeExecutionDriver };
export type { ModuleAccessOptions };
