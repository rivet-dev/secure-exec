import * as dns from "node:dns";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import type { AddressInfo } from "node:net";
import * as http from "node:http";
import * as https from "node:https";
import type { Server as HttpServer } from "node:http";
import * as zlib from "node:zlib";
import {
	filterEnv,
} from "@secure-exec/core/internal/shared/permissions";
import { ModuleAccessFileSystem } from "./module-access.js";
import { NodeExecutionDriver } from "./execution-driver.js";
import type {
	OSConfig,
	ProcessConfig,
} from "@secure-exec/core/internal/shared/api-types";
import type {
	CommandExecutor,
	NetworkAdapter,
	NodeRuntimeDriverFactory,
	Permissions,
	SystemDriver,
	VirtualFileSystem,
} from "@secure-exec/core";
import type { ModuleAccessOptions } from "./module-access.js";

/** Options for assembling a Node.js-backed SystemDriver. */
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

export interface NodeRuntimeDriverFactoryOptions {
	createIsolate?(memoryLimit: number): unknown;
	/** V8 runtime process to use for sessions.
	 *  If omitted, uses the global shared process (current behavior). */
	v8Runtime?: import("@secure-exec/v8").V8Runtime;
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

	async symlink(target: string, linkPath: string): Promise<void> {
		await fs.symlink(target, linkPath);
	}

	async readlink(path: string): Promise<string> {
		return fs.readlink(path);
	}

	async lstat(path: string): Promise<{
		mode: number;
		size: number;
		isDirectory: boolean;
		isSymbolicLink?: boolean;
		atimeMs: number;
		mtimeMs: number;
		ctimeMs: number;
		birthtimeMs: number;
	}> {
		const info = await fs.lstat(path);
		return {
			mode: info.mode,
			size: info.size,
			isDirectory: info.isDirectory(),
			isSymbolicLink: info.isSymbolicLink(),
			atimeMs: info.atimeMs,
			mtimeMs: info.mtimeMs,
			ctimeMs: info.ctimeMs,
			birthtimeMs: info.birthtimeMs,
		};
	}

	async link(oldPath: string, newPath: string): Promise<void> {
		await fs.link(oldPath, newPath);
	}

	async chmod(path: string, mode: number): Promise<void> {
		await fs.chmod(path, mode);
	}

	async chown(path: string, uid: number, gid: number): Promise<void> {
		await fs.chown(path, uid, gid);
	}

	async utimes(path: string, atime: number, mtime: number): Promise<void> {
		await fs.utimes(path, atime, mtime);
	}

	async truncate(path: string, length: number): Promise<void> {
		await fs.truncate(path, length);
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

/** Check whether an IP address falls in a private/reserved range (SSRF protection). */
export function isPrivateIp(ip: string): boolean {
	// Normalize IPv4-mapped IPv6 (::ffff:a.b.c.d → a.b.c.d)
	const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

	if (net.isIPv4(normalized)) {
		const parts = normalized.split(".").map(Number);
		const [a, b] = parts;
		return (
			a === 10 ||                                  // 10.0.0.0/8
			(a === 172 && b >= 16 && b <= 31) ||         // 172.16.0.0/12
			(a === 192 && b === 168) ||                   // 192.168.0.0/16
			a === 127 ||                                  // 127.0.0.0/8
			(a === 169 && b === 254) ||                   // 169.254.0.0/16 (link-local)
			a === 0 ||                                    // 0.0.0.0/8
			(a >= 224 && a <= 239) ||                     // 224.0.0.0/4 (multicast)
			(a >= 240)                                    // 240.0.0.0/4 (reserved)
		);
	}

	if (net.isIPv6(normalized)) {
		const lower = normalized.toLowerCase();
		return (
			lower === "::1" ||                            // loopback
			lower === "::" ||                             // unspecified
			lower.startsWith("fc") ||                     // fc00::/7 (ULA)
			lower.startsWith("fd") ||                     // fc00::/7 (ULA)
			lower.startsWith("fe80") ||                   // fe80::/10 (link-local)
			lower.startsWith("ff")                        // ff00::/8 (multicast)
		);
	}

	return false;
}

/** Check whether a hostname is a loopback address (127.x.x.x, ::1, localhost). */
function isLoopbackHost(hostname: string): boolean {
	const bare = hostname.startsWith("[") && hostname.endsWith("]")
		? hostname.slice(1, -1)
		: hostname;
	if (bare === "localhost" || bare === "::1") return true;
	// 127.0.0.0/8
	if (net.isIPv4(bare) && bare.startsWith("127.")) return true;
	return false;
}

/** Resolve hostname to IP and block private/reserved ranges (SSRF protection). */
async function assertNotPrivateHost(
	url: string,
	allowedLoopbackPorts?: ReadonlySet<number>,
): Promise<void> {
	const parsed = new URL(url);
	// Non-network schemes don't need SSRF checks
	if (parsed.protocol === "data:" || parsed.protocol === "blob:") return;

	const hostname = parsed.hostname;
	// Strip brackets from IPv6 literals
	const bare = hostname.startsWith("[") && hostname.endsWith("]")
		? hostname.slice(1, -1)
		: hostname;

	// Allow loopback fetch to sandbox-owned server ports
	if (allowedLoopbackPorts && allowedLoopbackPorts.size > 0 && isLoopbackHost(hostname)) {
		const port = parsed.port
			? Number(parsed.port)
			: parsed.protocol === "https:" ? 443 : 80;
		if (allowedLoopbackPorts.has(port)) return;
	}

	// If hostname is already an IP literal, check directly
	if (net.isIP(bare)) {
		if (isPrivateIp(bare)) {
			throw new Error(`SSRF blocked: ${hostname} resolves to private IP`);
		}
		return;
	}

	// Resolve DNS and check all addresses
	const address = await new Promise<string>((resolve, reject) => {
		dns.lookup(bare, (err, addr) => {
			if (err) reject(err);
			else resolve(addr);
		});
	});

	if (isPrivateIp(address)) {
		throw new Error(`SSRF blocked: ${hostname} resolves to private IP ${address}`);
	}
}

const MAX_REDIRECTS = 20;

/**
 * Create a Node.js network adapter that provides real fetch, DNS, HTTP client,
 * and loopback-only HTTP server support. Binary responses are base64-encoded
 * with an `x-body-encoding` header so the bridge can decode them.
 */
export function createDefaultNetworkAdapter(options?: {
	/** Pre-seed loopback ports that should bypass SSRF checks (e.g. host-managed servers). */
	initialExemptPorts?: Iterable<number>;
}): NetworkAdapter {
	const servers = new Map<number, HttpServer>();
	// Track ports owned by sandbox HTTP servers for loopback SSRF exemption
	const ownedServerPorts = new Set<number>(options?.initialExemptPorts);

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
				} catch {
					res.statusCode = 500;
					res.end("Internal Server Error");
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
			if (address) ownedServerPorts.add(address.port);
			return { address };
		},

		async httpServerClose(serverId) {
			const server = servers.get(serverId);
			if (!server) return;

			// Remove owned port before closing
			const addr = server.address();
			if (addr && typeof addr !== "string") {
				ownedServerPorts.delete((addr as AddressInfo).port);
			}

			await new Promise<void>((resolve, reject) => {
				server.close((err) => {
					if (err) reject(err);
					else resolve();
				});
			});

			servers.delete(serverId);
		},

		async fetch(url, options) {
			// SSRF: validate initial URL and manually follow redirects
			// Allow loopback fetch to sandbox-owned server ports
			let currentUrl = url;
			let redirected = false;

			for (let i = 0; i <= MAX_REDIRECTS; i++) {
				await assertNotPrivateHost(currentUrl, ownedServerPorts);

				const response = await fetch(currentUrl, {
					method: options?.method || "GET",
					headers: options?.headers,
					body: options?.body,
					redirect: "manual",
				});

				// Follow redirects with re-validation
				const status = response.status;
				if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
					const location = response.headers.get("location");
					if (!location) break;
					currentUrl = new URL(location, currentUrl).href;
					redirected = true;
					// POST→GET for 301/302/303
					if (status === 301 || status === 302 || status === 303) {
						options = { ...options, method: "GET", body: undefined };
					}
					continue;
				}

				const headers: Record<string, string> = {};
				response.headers.forEach((v, k) => {
					headers[k] = v;
				});

				delete headers["content-encoding"];

				const contentType = response.headers.get("content-type") || "";
				const isBinary =
					contentType.includes("octet-stream") ||
					contentType.includes("gzip") ||
					currentUrl.endsWith(".tgz");

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
					url: currentUrl,
					redirected,
				};
			}

			throw new Error("Too many redirects");
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
			// SSRF: block requests to private/reserved IPs
			// Allow loopback requests to sandbox-owned server ports
			await assertNotPrivateHost(url, ownedServerPorts);

			return new Promise((resolve, reject) => {
				const urlObj = new URL(url);
				const isHttps = urlObj.protocol === "https:";
				const transport = isHttps ? https : http;
				const reqOptions: https.RequestOptions = {
					hostname: urlObj.hostname,
					port: urlObj.port || (isHttps ? 443 : 80),
					path: urlObj.pathname + urlObj.search,
					method: options?.method || "GET",
					headers: options?.headers || {},
					...(isHttps && options?.rejectUnauthorized !== undefined && {
						rejectUnauthorized: options.rejectUnauthorized,
					}),
				};

				const req = transport.request(reqOptions, (res) => {
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

						// Collect trailer headers
						const trailers: Record<string, string> = {};
						if (res.trailers) {
							Object.entries(res.trailers).forEach(([k, v]) => {
								if (typeof v === "string") trailers[k] = v;
							});
						}
						const hasTrailers = Object.keys(trailers).length > 0;

						const base = {
							status: res.statusCode || 200,
							statusText: res.statusMessage || "OK",
							headers,
							url,
							...(hasTrailers ? { trailers } : {}),
						};

						if (isBinary) {
							headers["x-body-encoding"] = "base64";
							resolve({ ...base, body: buffer.toString("base64") });
						} else {
							resolve({ ...base, body: buffer.toString("utf-8") });
						}
					});
					res.on("error", reject);
				});

				// Handle HTTP upgrade (101 Switching Protocols)
				req.on("upgrade", (res, socket, head) => {
					const headers: Record<string, string> = {};
					Object.entries(res.headers).forEach(([k, v]) => {
						if (typeof v === "string") headers[k] = v;
						else if (Array.isArray(v)) headers[k] = v.join(", ");
					});
					socket.destroy();
					resolve({
						status: res.statusCode || 101,
						statusText: res.statusMessage || "Switching Protocols",
						headers,
						body: head.toString(),
						url,
					});
				});

				req.on("error", reject);
				if (options?.body) req.write(options.body);
				req.end();
			});
		},
	};
}

/**
 * Assemble a SystemDriver from Node.js-native adapters. Wraps the filesystem
 * in a ModuleAccessFileSystem overlay and keeps capabilities deny-by-default
 * unless explicit permissions are provided.
 */
export function createNodeDriver(options: NodeDriverOptions = {}): SystemDriver {
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

export function createNodeRuntimeDriverFactory(
	options: NodeRuntimeDriverFactoryOptions = {},
): NodeRuntimeDriverFactory {
	return {
		createRuntimeDriver: (runtimeOptions) =>
			new NodeExecutionDriver({
				...runtimeOptions,
				createIsolate: options.createIsolate,
				v8Runtime: options.v8Runtime,
			}),
	};
}

export { filterEnv, NodeExecutionDriver };
export type { ModuleAccessOptions };
