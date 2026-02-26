import * as dns from "node:dns";
import * as fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import * as https from "node:https";
import type { Server as HttpServer } from "node:http";
import * as zlib from "node:zlib";
import { serve as honoServe } from "@hono/node-server";
import {
	filterEnv,
	wrapCommandExecutor,
	wrapFileSystem,
	wrapNetworkAdapter,
} from "../shared/permissions.js";
import type {
	CommandExecutor,
	NetworkAdapter,
	Permissions,
	SandboxDriver,
	VirtualFileSystem,
} from "../types.js";

export interface NodeDriverOptions {
	filesystem?: VirtualFileSystem;
	networkAdapter?: NetworkAdapter;
	commandExecutor?: CommandExecutor;
	permissions?: Permissions;
	useDefaultNetwork?: boolean;
}

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

	async removeFile(path: string): Promise<void> {
		await fs.unlink(path);
	}

	async removeDir(path: string): Promise<void> {
		await fs.rmdir(path);
	}
}

export function createDefaultNetworkAdapter(): NetworkAdapter {
	const servers = new Map<number, HttpServer>();
	let nextServerId = 1;

	return {
		async honoServe(options) {
			const server = honoServe({
				fetch: options.fetch,
				port: options.port ?? 3000,
				hostname: options.hostname,
			});

			await new Promise<void>((resolve, reject) => {
				const onListening = () => resolve();
				const onError = (err: Error) => reject(err);
				server.once("listening", onListening);
				server.once("error", onError);
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

			const serverId = nextServerId++;
			servers.set(serverId, server);
			return { serverId, address };
		},

		async honoClose(serverId) {
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

export function createNodeDriver(options: NodeDriverOptions = {}): SandboxDriver {
	const permissions = options.permissions;
	const filesystem = options.filesystem
		? wrapFileSystem(options.filesystem, permissions)
		: undefined;
	const networkAdapter = options.networkAdapter
		? wrapNetworkAdapter(options.networkAdapter, permissions)
		: options.useDefaultNetwork
			? wrapNetworkAdapter(createDefaultNetworkAdapter(), permissions)
			: undefined;
	const commandExecutor = options.commandExecutor
		? wrapCommandExecutor(options.commandExecutor, permissions)
		: undefined;

	return {
		filesystem,
		network: networkAdapter,
		commandExecutor,
		permissions,
	};
}

export { filterEnv };
