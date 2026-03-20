import ivm from "isolated-vm";
import {
	randomFillSync,
	randomUUID,
	createHash,
	createHmac,
	pbkdf2Sync,
	scryptSync,
	createCipheriv,
	createDecipheriv,
	sign,
	verify,
	generateKeyPairSync,
	createPublicKey,
	createPrivateKey,
	timingSafeEqual,
} from "node:crypto";
import {
	getInitialBridgeGlobalsSetupCode,
	getIsolateRuntimeSource,
	loadFile,
	resolveModule,
	normalizeBuiltinSpecifier,
	mkdir,
} from "@secure-exec/core";
import { getBridgeAttachCode, getRawBridgeCode } from "./bridge-loader.js";
import { bundlePolyfill, hasPolyfill } from "./polyfills.js";
import {
	transformDynamicImport,
} from "@secure-exec/core/internal/shared/esm-utils";
import { getConsoleSetupCode } from "@secure-exec/core/internal/shared/console-formatter";
import { getRequireSetupCode } from "@secure-exec/core/internal/shared/require-setup";
import {
	HOST_BRIDGE_GLOBAL_KEYS,
	RUNTIME_BRIDGE_GLOBAL_KEYS,
} from "@secure-exec/core/internal/shared/bridge-contract";
import {
	createCommandExecutorStub,
	createNetworkStub,
} from "@secure-exec/core/internal/shared/permissions";
import type {
	NetworkAdapter,
	SpawnedProcess,
} from "@secure-exec/core";
import type {
	StdioEvent,
	StdioHook,
	ProcessConfig,
	TimingMitigation,
} from "@secure-exec/core/internal/shared/api-types";
import {
	checkBridgeBudget,
	assertPayloadByteLength,
	assertTextPayloadSize,
	getBase64EncodedByteLength,
	parseJsonWithLimit,
	polyfillCodeCache,
	PAYLOAD_LIMIT_ERROR_CODE,
	RESOURCE_BUDGET_ERROR_CODE,
} from "./isolate-bootstrap.js";
import type { DriverDeps } from "./isolate-bootstrap.js";

// Env vars that could hijack child processes (library injection, node flags)
const DANGEROUS_ENV_KEYS = new Set([
	"LD_PRELOAD",
	"LD_LIBRARY_PATH",
	"NODE_OPTIONS",
	"DYLD_INSERT_LIBRARIES",
]);

/** Strip env vars that allow library injection or node flag smuggling. */
function stripDangerousEnv(
	env: Record<string, string> | undefined,
): Record<string, string> | undefined {
	if (!env) return env;
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		if (!DANGEROUS_ENV_KEYS.has(key)) {
			result[key] = value;
		}
	}
	return result;
}

type BridgeDeps = Pick<
	DriverDeps,
	| "filesystem"
	| "commandExecutor"
	| "networkAdapter"
	| "processConfig"
	| "osConfig"
	| "budgetState"
	| "maxBridgeCalls"
	| "maxOutputBytes"
	| "maxTimers"
	| "maxChildProcesses"
	| "maxHandles"
	| "bridgeBase64TransferLimitBytes"
	| "isolateJsonPayloadLimitBytes"
	| "activeHttpServerIds"
	| "activeChildProcesses"
	| "activeHostTimers"
	| "resolutionCache"
	| "onPtySetRawMode"
>;

export function emitConsoleEvent(
	onStdio: StdioHook | undefined,
	event: StdioEvent,
): void {
	if (!onStdio) {
		return;
	}
	try {
		onStdio(event);
	} catch {
		// Keep runtime execution deterministic even when host hooks fail.
	}
}

/**
 * Set up console with optional streaming log hook.
 */
export async function setupConsole(
	deps: BridgeDeps,
	context: ivm.Context,
	jail: ivm.Reference<Record<string, unknown>>,
	onStdio?: StdioHook,
): Promise<void> {
	const logRef = new ivm.Reference((msg: string) => {
		const str = String(msg);
		// Enforce output byte budget — reject messages that would exceed the limit
		if (deps.maxOutputBytes !== undefined) {
			const bytes = Buffer.byteLength(str, "utf8");
			if (deps.budgetState.outputBytes + bytes > deps.maxOutputBytes) return;
			deps.budgetState.outputBytes += bytes;
		}
		emitConsoleEvent(onStdio, { channel: "stdout", message: str });
	});
	const errorRef = new ivm.Reference((msg: string) => {
		const str = String(msg);
		if (deps.maxOutputBytes !== undefined) {
			const bytes = Buffer.byteLength(str, "utf8");
			if (deps.budgetState.outputBytes + bytes > deps.maxOutputBytes) return;
			deps.budgetState.outputBytes += bytes;
		}
		emitConsoleEvent(onStdio, { channel: "stderr", message: str });
	});

	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.log, logRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.error, errorRef);

	await context.eval(getConsoleSetupCode());
}

/**
 * Set up the require() system in a context.
 */
export async function setupRequire(
	deps: BridgeDeps,
	context: ivm.Context,
	jail: ivm.Reference<Record<string, unknown>>,
	timingMitigation: TimingMitigation,
	frozenTimeMs: number,
): Promise<void> {
	// Create a reference that can load polyfills on demand
	const loadPolyfillRef = new ivm.Reference(
		async (moduleName: string): Promise<string | null> => {
			const name = moduleName.replace(/^node:/, "");

			// fs is handled specially
			if (name === "fs") {
				return null;
			}

			// child_process is handled specially
			if (name === "child_process") {
				return null;
			}

			// Network modules are handled specially
			if (
				name === "http" ||
				name === "https" ||
				name === "http2" ||
				name === "dns" ||
				name === "net"
			) {
				return null;
			}

			// os module is handled specially with our own polyfill
			if (name === "os") {
				return null;
			}

			// module is handled specially with our own polyfill
			if (name === "module") {
				return null;
			}

			if (!hasPolyfill(name)) {
				return null;
			}
			// Check cache first
			let code = polyfillCodeCache.get(name);
			if (!code) {
				code = await bundlePolyfill(name);
				polyfillCodeCache.set(name, code);
			}
			return code;
		},
	);

	// Create a reference for resolving module paths
	const resolveModuleRef = new ivm.Reference(
		async (request: string, fromDir: string): Promise<string | null> => {
			const builtinSpecifier = normalizeBuiltinSpecifier(request);
			if (builtinSpecifier) {
				return builtinSpecifier;
			}
			return resolveModule(request, fromDir, deps.filesystem, "require", deps.resolutionCache);
		},
	);

	// Synchronous module resolution using Node.js require.resolve().
	// Used as fallback inside applySync contexts where applySyncPromise can't
	// pump the event loop (e.g. require() inside net socket data callbacks).
	const { createRequire } = await import("node:module");
	const resolveModuleSyncRef = new ivm.Reference(
		(request: string, fromDir: string): string | null => {
			const builtinSpecifier = normalizeBuiltinSpecifier(request);
			if (builtinSpecifier) {
				return builtinSpecifier;
			}
			try {
				const hostRequire = createRequire(fromDir + "/noop.js");
				const result = hostRequire.resolve(request);
				return result;
			} catch {
				return null;
			}
		},
	);

	// Create a reference for loading file content
	// Also transforms dynamic import() calls to __dynamicImport()
	const loadFileRef = new ivm.Reference(
		async (path: string): Promise<string | null> => {
			const source = await loadFile(path, deps.filesystem);
			if (source === null) {
				return null;
			}
			// Transform dynamic import() to __dynamicImport() for V8 compatibility
			return transformDynamicImport(source);
		},
	);

	// Synchronous file loading for use inside applySync contexts.
	const { readFileSync } = await import("node:fs");
	const loadFileSyncRef = new ivm.Reference(
		(filePath: string): string | null => {
			try {
				const source = readFileSync(filePath, "utf8");
				return transformDynamicImport(source);
			} catch {
				return null;
			}
		},
	);

	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.loadPolyfill, loadPolyfillRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.resolveModule, resolveModuleRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.resolveModuleSync, resolveModuleSyncRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.loadFile, loadFileRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.loadFileSync, loadFileSyncRef);

	// Set up timer Reference for actual delays (not just microtasks)
	const scheduleTimerRef = new ivm.Reference((delayMs: number) => {
		checkBridgeBudget(deps);
		return new Promise<void>((resolve) => {
			const id = globalThis.setTimeout(() => {
				deps.activeHostTimers.delete(id);
				resolve();
			}, delayMs);
			deps.activeHostTimers.add(id);
		});
	});
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.scheduleTimer, scheduleTimerRef);

	// Inject maxTimers limit for bridge-side enforcement (synchronous check)
	if (deps.maxTimers !== undefined) {
		await jail.set("_maxTimers", deps.maxTimers, { copy: true });
	}

	// Inject maxHandles limit for bridge-side active handle cap
	if (deps.maxHandles !== undefined) {
		await jail.set("_maxHandles", deps.maxHandles, { copy: true });
	}

	// Set up host crypto references for secure randomness.
	// Cap matches Web Crypto API spec (65536 bytes) to prevent host OOM.
	const cryptoRandomFillRef = new ivm.Reference((byteLength: number) => {
		if (byteLength > 65536) {
			throw new RangeError(
				`The ArrayBufferView's byte length (${byteLength}) exceeds the number of bytes of entropy available via this API (65536)`,
			);
		}
		const buffer = Buffer.allocUnsafe(byteLength);
		randomFillSync(buffer);
		return buffer.toString("base64");
	});
	const cryptoRandomUuidRef = new ivm.Reference(() => {
		return randomUUID();
	});
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoRandomFill, cryptoRandomFillRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoRandomUuid, cryptoRandomUuidRef);

	// Set up host crypto references for createHash/createHmac.
	// Guest accumulates update() data, sends base64 to host for digest.
	const cryptoHashDigestRef = new ivm.Reference(
		(algorithm: string, dataBase64: string) => {
			const data = Buffer.from(dataBase64, "base64");
			const hash = createHash(algorithm);
			hash.update(data);
			return hash.digest("base64");
		},
	);
	const cryptoHmacDigestRef = new ivm.Reference(
		(algorithm: string, keyBase64: string, dataBase64: string) => {
			const key = Buffer.from(keyBase64, "base64");
			const data = Buffer.from(dataBase64, "base64");
			const hmac = createHmac(algorithm, key);
			hmac.update(data);
			return hmac.digest("base64");
		},
	);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoHashDigest, cryptoHashDigestRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoHmacDigest, cryptoHmacDigestRef);

	// Set up host crypto references for pbkdf2/scrypt key derivation.
	const cryptoPbkdf2Ref = new ivm.Reference(
		(
			passwordBase64: string,
			saltBase64: string,
			iterations: number,
			keylen: number,
			digest: string,
		) => {
			const password = Buffer.from(passwordBase64, "base64");
			const salt = Buffer.from(saltBase64, "base64");
			return pbkdf2Sync(password, salt, iterations, keylen, digest).toString(
				"base64",
			);
		},
	);
	const cryptoScryptRef = new ivm.Reference(
		(
			passwordBase64: string,
			saltBase64: string,
			keylen: number,
			optionsJson: string,
		) => {
			const password = Buffer.from(passwordBase64, "base64");
			const salt = Buffer.from(saltBase64, "base64");
			const options = JSON.parse(optionsJson);
			return scryptSync(password, salt, keylen, options).toString("base64");
		},
	);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoPbkdf2, cryptoPbkdf2Ref);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoScrypt, cryptoScryptRef);

	// Set up host crypto references for createCipheriv/createDecipheriv.
	// Guest accumulates update() data, sends base64 to host for encrypt/decrypt.
	// Returns JSON for GCM (includes authTag), plain base64 for other modes.
	const cryptoCipherivRef = new ivm.Reference(
		(
			algorithm: string,
			keyBase64: string,
			ivBase64: string,
			dataBase64: string,
		) => {
			const key = Buffer.from(keyBase64, "base64");
			const iv = Buffer.from(ivBase64, "base64");
			const data = Buffer.from(dataBase64, "base64");
			const cipher = createCipheriv(algorithm, key, iv) as any;
			const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
			const isGcm = algorithm.includes("-gcm");
			if (isGcm) {
				return JSON.stringify({
					data: encrypted.toString("base64"),
					authTag: cipher.getAuthTag().toString("base64"),
				});
			}
			return JSON.stringify({ data: encrypted.toString("base64") });
		},
	);
	const cryptoDecipherivRef = new ivm.Reference(
		(
			algorithm: string,
			keyBase64: string,
			ivBase64: string,
			dataBase64: string,
			optionsJson: string,
		) => {
			const key = Buffer.from(keyBase64, "base64");
			const iv = Buffer.from(ivBase64, "base64");
			const data = Buffer.from(dataBase64, "base64");
			const options = JSON.parse(optionsJson);
			const decipher = createDecipheriv(algorithm, key, iv) as any;
			const isGcm = algorithm.includes("-gcm");
			if (isGcm && options.authTag) {
				decipher.setAuthTag(Buffer.from(options.authTag, "base64"));
			}
			return Buffer.concat([decipher.update(data), decipher.final()]).toString(
				"base64",
			);
		},
	);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoCipheriv, cryptoCipherivRef);
	await jail.set(
		HOST_BRIDGE_GLOBAL_KEYS.cryptoDecipheriv,
		cryptoDecipherivRef,
	);

	// Stateful cipher/decipher for streaming crypto (ssh2 AES-GCM, etc.)
	const cipherSessions = new Map<
		number,
		{ instance: any; isGcm: boolean; mode: "cipher" | "decipher" }
	>();
	let nextCipherSessionId = 1;

	const cryptoCipherivCreateRef = new ivm.Reference(
		(
			mode: string,
			algorithm: string,
			keyBase64: string,
			ivBase64: string,
		): number => {
			const key = Buffer.from(keyBase64, "base64");
			const iv = Buffer.from(ivBase64, "base64");
			const sessionId = nextCipherSessionId++;
			const isCipher = mode === "cipher";
			const instance = isCipher
				? createCipheriv(algorithm, key, iv)
				: createDecipheriv(algorithm, key, iv);
			cipherSessions.set(sessionId, {
				instance,
				isGcm: algorithm.includes("-gcm"),
				mode: isCipher ? "cipher" : "decipher",
			});
			return sessionId;
		},
	);

	const cryptoCipherivUpdateRef = new ivm.Reference(
		(sessionId: number, dataBase64: string, optionsJson?: string): string => {
			const session = cipherSessions.get(sessionId);
			if (!session) throw new Error("Invalid cipher session");
			if (optionsJson) {
				const opts = JSON.parse(optionsJson);
				if (opts.setAAD) {
					(session.instance as any).setAAD(
						Buffer.from(opts.setAAD, "base64"),
					);
				}
				if (opts.setAuthTag) {
					(session.instance as any).setAuthTag(
						Buffer.from(opts.setAuthTag, "base64"),
					);
				}
				if (opts.setAutoPadding !== undefined) {
					(session.instance as any).setAutoPadding(opts.setAutoPadding);
				}
				// Options-only call (no data to process)
				if (!dataBase64) return "";
			}
			const data = Buffer.from(dataBase64, "base64");
			const result = session.instance.update(data);
			return result.toString("base64");
		},
	);

	const cryptoCipherivFinalRef = new ivm.Reference(
		(sessionId: number): string => {
			const session = cipherSessions.get(sessionId);
			if (!session) throw new Error("Invalid cipher session");
			const result = session.instance.final();
			const response: Record<string, string> = {
				data: result.toString("base64"),
			};
			if (session.isGcm && session.mode === "cipher") {
				response.authTag = (session.instance as any)
					.getAuthTag()
					.toString("base64");
			}
			cipherSessions.delete(sessionId);
			return JSON.stringify(response);
		},
	);

	await jail.set(
		HOST_BRIDGE_GLOBAL_KEYS.cryptoCipherivCreate,
		cryptoCipherivCreateRef,
	);
	await jail.set(
		HOST_BRIDGE_GLOBAL_KEYS.cryptoCipherivUpdate,
		cryptoCipherivUpdateRef,
	);
	await jail.set(
		HOST_BRIDGE_GLOBAL_KEYS.cryptoCipherivFinal,
		cryptoCipherivFinalRef,
	);

	// Set up host crypto references for sign/verify and key generation.
	// sign: (algorithm, dataBase64, keyPem) → signatureBase64
	const cryptoSignRef = new ivm.Reference(
		(algorithm: string, dataBase64: string, keyPem: string) => {
			const data = Buffer.from(dataBase64, "base64");
			const key = createPrivateKey(keyPem);
			const signature = sign(algorithm, data, key);
			return signature.toString("base64");
		},
	);
	// verify: (algorithm, dataBase64, keyPem, signatureBase64) → boolean
	const cryptoVerifyRef = new ivm.Reference(
		(
			algorithm: string,
			dataBase64: string,
			keyPem: string,
			signatureBase64: string,
		) => {
			const data = Buffer.from(dataBase64, "base64");
			const key = createPublicKey(keyPem);
			const signature = Buffer.from(signatureBase64, "base64");
			return verify(algorithm, data, key, signature);
		},
	);
	// generateKeyPairSync: (type, optionsJson) → JSON { publicKey, privateKey }
	const cryptoGenerateKeyPairSyncRef = new ivm.Reference(
		(type: string, optionsJson: string) => {
			const options = JSON.parse(optionsJson);
			// Always produce PEM output for cross-boundary transfer
			const genOptions = {
				...options,
				publicKeyEncoding: { type: "spki" as const, format: "pem" as const },
				privateKeyEncoding: {
					type: "pkcs8" as const,
					format: "pem" as const,
				},
			};
			const { publicKey, privateKey } = generateKeyPairSync(
				type as any,
				genOptions as any,
			);
			return JSON.stringify({ publicKey, privateKey });
		},
	);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoSign, cryptoSignRef);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoVerify, cryptoVerifyRef);
	await jail.set(
		HOST_BRIDGE_GLOBAL_KEYS.cryptoGenerateKeyPairSync,
		cryptoGenerateKeyPairSyncRef,
	);

	// Set up host crypto.subtle dispatcher for Web Crypto API.
	// Single dispatcher handles all subtle operations via JSON-encoded requests.
	const cryptoSubtleRef = new ivm.Reference((opJson: string): string => {
		const req = JSON.parse(opJson);
		const normalizeHash = (h: string | { name: string }): string => {
			const n = typeof h === "string" ? h : h.name;
			return n.toLowerCase().replace("-", "");
		};
		switch (req.op) {
			case "digest": {
				const algo = normalizeHash(req.algorithm);
				const data = Buffer.from(req.data, "base64");
				return JSON.stringify({
					data: createHash(algo).update(data).digest("base64"),
				});
			}
			case "generateKey": {
				const algoName = req.algorithm.name;
				if (
					algoName === "AES-GCM" ||
					algoName === "AES-CBC" ||
					algoName === "AES-CTR"
				) {
					const keyBytes = Buffer.allocUnsafe(req.algorithm.length / 8);
					randomFillSync(keyBytes);
					return JSON.stringify({
						key: {
							type: "secret",
							algorithm: req.algorithm,
							extractable: req.extractable,
							usages: req.usages,
							_raw: keyBytes.toString("base64"),
						},
					});
				}
				if (algoName === "HMAC") {
					const hashName =
						typeof req.algorithm.hash === "string"
							? req.algorithm.hash
							: req.algorithm.hash.name;
					const hashLens: Record<string, number> = {
						"SHA-1": 20,
						"SHA-256": 32,
						"SHA-384": 48,
						"SHA-512": 64,
					};
					const len = req.algorithm.length
						? req.algorithm.length / 8
						: hashLens[hashName] || 32;
					const keyBytes = Buffer.allocUnsafe(len);
					randomFillSync(keyBytes);
					return JSON.stringify({
						key: {
							type: "secret",
							algorithm: req.algorithm,
							extractable: req.extractable,
							usages: req.usages,
							_raw: keyBytes.toString("base64"),
						},
					});
				}
				if (
					algoName === "RSASSA-PKCS1-v1_5" ||
					algoName === "RSA-OAEP" ||
					algoName === "RSA-PSS"
				) {
					let publicExponent = 65537;
					if (req.algorithm.publicExponent) {
						const expBytes = Buffer.from(
							req.algorithm.publicExponent,
							"base64",
						);
						publicExponent = 0;
						for (const b of expBytes) {
							publicExponent = (publicExponent << 8) | b;
						}
					}
					const { publicKey, privateKey } = generateKeyPairSync("rsa", {
						modulusLength: req.algorithm.modulusLength || 2048,
						publicExponent,
						publicKeyEncoding: {
							type: "spki" as const,
							format: "pem" as const,
						},
						privateKeyEncoding: {
							type: "pkcs8" as const,
							format: "pem" as const,
						},
					});
					return JSON.stringify({
						publicKey: {
							type: "public",
							algorithm: req.algorithm,
							extractable: req.extractable,
							usages: req.usages.filter((u: string) =>
								["verify", "encrypt", "wrapKey"].includes(u),
							),
							_pem: publicKey,
						},
						privateKey: {
							type: "private",
							algorithm: req.algorithm,
							extractable: req.extractable,
							usages: req.usages.filter((u: string) =>
								["sign", "decrypt", "unwrapKey"].includes(u),
							),
							_pem: privateKey,
						},
					});
				}
				throw new Error(`Unsupported key algorithm: ${algoName}`);
			}
			case "importKey": {
				const { format, keyData, algorithm, extractable, usages } = req;
				if (format === "raw") {
					return JSON.stringify({
						key: {
							type: "secret",
							algorithm,
							extractable,
							usages,
							_raw: keyData,
						},
					});
				}
				if (format === "jwk") {
					const jwk =
						typeof keyData === "string" ? JSON.parse(keyData) : keyData;
					if (jwk.kty === "oct") {
						const raw = Buffer.from(jwk.k, "base64url");
						return JSON.stringify({
							key: {
								type: "secret",
								algorithm,
								extractable,
								usages,
								_raw: raw.toString("base64"),
							},
						});
					}
					if (jwk.d) {
						const keyObj = createPrivateKey({ key: jwk, format: "jwk" });
						const pem = keyObj.export({
							type: "pkcs8",
							format: "pem",
						}) as string;
						return JSON.stringify({
							key: { type: "private", algorithm, extractable, usages, _pem: pem },
						});
					}
					const keyObj = createPublicKey({ key: jwk, format: "jwk" });
					const pem = keyObj.export({ type: "spki", format: "pem" }) as string;
					return JSON.stringify({
						key: { type: "public", algorithm, extractable, usages, _pem: pem },
					});
				}
				if (format === "pkcs8") {
					const keyBuf = Buffer.from(keyData, "base64");
					const keyObj = createPrivateKey({
						key: keyBuf,
						format: "der",
						type: "pkcs8",
					});
					const pem = keyObj.export({
						type: "pkcs8",
						format: "pem",
					}) as string;
					return JSON.stringify({
						key: { type: "private", algorithm, extractable, usages, _pem: pem },
					});
				}
				if (format === "spki") {
					const keyBuf = Buffer.from(keyData, "base64");
					const keyObj = createPublicKey({
						key: keyBuf,
						format: "der",
						type: "spki",
					});
					const pem = keyObj.export({ type: "spki", format: "pem" }) as string;
					return JSON.stringify({
						key: { type: "public", algorithm, extractable, usages, _pem: pem },
					});
				}
				throw new Error(`Unsupported import format: ${format}`);
			}
			case "exportKey": {
				const { format, key } = req;
				if (format === "raw") {
					if (!key._raw)
						throw new Error("Cannot export asymmetric key as raw");
					return JSON.stringify({
						data: key._raw,
					});
				}
				if (format === "jwk") {
					if (key._raw) {
						const raw = Buffer.from(key._raw, "base64");
						return JSON.stringify({
							jwk: {
								kty: "oct",
								k: raw.toString("base64url"),
								ext: key.extractable,
								key_ops: key.usages,
							},
						});
					}
					const keyObj =
						key.type === "private"
							? createPrivateKey(key._pem)
							: createPublicKey(key._pem);
					return JSON.stringify({
						jwk: keyObj.export({ format: "jwk" }),
					});
				}
				if (format === "pkcs8") {
					if (key.type !== "private")
						throw new Error("Cannot export non-private key as pkcs8");
					const keyObj = createPrivateKey(key._pem);
					const der = keyObj.export({
						type: "pkcs8",
						format: "der",
					}) as Buffer;
					return JSON.stringify({ data: der.toString("base64") });
				}
				if (format === "spki") {
					const keyObj =
						key.type === "private"
							? createPublicKey(createPrivateKey(key._pem))
							: createPublicKey(key._pem);
					const der = keyObj.export({
						type: "spki",
						format: "der",
					}) as Buffer;
					return JSON.stringify({ data: der.toString("base64") });
				}
				throw new Error(`Unsupported export format: ${format}`);
			}
			case "encrypt": {
				const { algorithm, key, data } = req;
				const rawKey = Buffer.from(key._raw, "base64");
				const plaintext = Buffer.from(data, "base64");
				const algoName = algorithm.name;
				if (algoName === "AES-GCM") {
					const iv = Buffer.from(algorithm.iv, "base64");
					const tagLength = (algorithm.tagLength || 128) / 8;
					const cipher = createCipheriv(
						`aes-${rawKey.length * 8}-gcm` as any,
						rawKey,
						iv,
						{ authTagLength: tagLength } as any,
					) as any;
					if (algorithm.additionalData) {
						cipher.setAAD(Buffer.from(algorithm.additionalData, "base64"));
					}
					const encrypted = Buffer.concat([
						cipher.update(plaintext),
						cipher.final(),
					]);
					const authTag = cipher.getAuthTag();
					return JSON.stringify({
						data: Buffer.concat([encrypted, authTag]).toString("base64"),
					});
				}
				if (algoName === "AES-CBC") {
					const iv = Buffer.from(algorithm.iv, "base64");
					const cipher = createCipheriv(
						`aes-${rawKey.length * 8}-cbc` as any,
						rawKey,
						iv,
					);
					const encrypted = Buffer.concat([
						cipher.update(plaintext),
						cipher.final(),
					]);
					return JSON.stringify({ data: encrypted.toString("base64") });
				}
				throw new Error(`Unsupported encrypt algorithm: ${algoName}`);
			}
			case "decrypt": {
				const { algorithm, key, data } = req;
				const rawKey = Buffer.from(key._raw, "base64");
				const ciphertext = Buffer.from(data, "base64");
				const algoName = algorithm.name;
				if (algoName === "AES-GCM") {
					const iv = Buffer.from(algorithm.iv, "base64");
					const tagLength = (algorithm.tagLength || 128) / 8;
					const encData = ciphertext.subarray(
						0,
						ciphertext.length - tagLength,
					);
					const authTag = ciphertext.subarray(
						ciphertext.length - tagLength,
					);
					const decipher = createDecipheriv(
						`aes-${rawKey.length * 8}-gcm` as any,
						rawKey,
						iv,
						{ authTagLength: tagLength } as any,
					) as any;
					decipher.setAuthTag(authTag);
					if (algorithm.additionalData) {
						decipher.setAAD(
							Buffer.from(algorithm.additionalData, "base64"),
						);
					}
					const decrypted = Buffer.concat([
						decipher.update(encData),
						decipher.final(),
					]);
					return JSON.stringify({ data: decrypted.toString("base64") });
				}
				if (algoName === "AES-CBC") {
					const iv = Buffer.from(algorithm.iv, "base64");
					const decipher = createDecipheriv(
						`aes-${rawKey.length * 8}-cbc` as any,
						rawKey,
						iv,
					);
					const decrypted = Buffer.concat([
						decipher.update(ciphertext),
						decipher.final(),
					]);
					return JSON.stringify({ data: decrypted.toString("base64") });
				}
				throw new Error(`Unsupported decrypt algorithm: ${algoName}`);
			}
			case "sign": {
				const { key, data } = req;
				const dataBytes = Buffer.from(data, "base64");
				const algoName = key.algorithm.name;
				if (algoName === "HMAC") {
					const rawKey = Buffer.from(key._raw, "base64");
					const hashAlgo = normalizeHash(key.algorithm.hash);
					return JSON.stringify({
						data: createHmac(hashAlgo, rawKey)
							.update(dataBytes)
							.digest("base64"),
					});
				}
				if (algoName === "RSASSA-PKCS1-v1_5") {
					const hashAlgo = normalizeHash(key.algorithm.hash);
					const pkey = createPrivateKey(key._pem);
					return JSON.stringify({
						data: sign(hashAlgo, dataBytes, pkey).toString("base64"),
					});
				}
				throw new Error(`Unsupported sign algorithm: ${algoName}`);
			}
			case "verify": {
				const { key, signature, data } = req;
				const dataBytes = Buffer.from(data, "base64");
				const sigBytes = Buffer.from(signature, "base64");
				const algoName = key.algorithm.name;
				if (algoName === "HMAC") {
					const rawKey = Buffer.from(key._raw, "base64");
					const hashAlgo = normalizeHash(key.algorithm.hash);
					const expected = createHmac(hashAlgo, rawKey)
						.update(dataBytes)
						.digest();
					if (expected.length !== sigBytes.length)
						return JSON.stringify({ result: false });
					return JSON.stringify({
						result: timingSafeEqual(expected, sigBytes),
					});
				}
				if (algoName === "RSASSA-PKCS1-v1_5") {
					const hashAlgo = normalizeHash(key.algorithm.hash);
					const pkey = createPublicKey(key._pem);
					return JSON.stringify({
						result: verify(hashAlgo, dataBytes, pkey, sigBytes),
					});
				}
				throw new Error(`Unsupported verify algorithm: ${algoName}`);
			}
			case "deriveBits": {
				const algoName = req.algorithm.name;
				if (algoName === "PBKDF2") {
					const salt = Buffer.from(req.algorithm.salt, "base64");
					const hashName = normalizeHash(req.algorithm.hash);
					const keyBytes = Buffer.from(req.baseKey._raw, "base64");
					const derived = pbkdf2Sync(keyBytes, salt, req.algorithm.iterations, req.length / 8, hashName);
					return JSON.stringify({ data: derived.toString("base64") });
				}
				if (algoName === "HKDF") {
					const hashName = normalizeHash(req.algorithm.hash);
					const salt = req.algorithm.salt ? Buffer.from(req.algorithm.salt, "base64") : Buffer.alloc(0);
					const info = req.algorithm.info ? Buffer.from(req.algorithm.info, "base64") : Buffer.alloc(0);
					const ikm = Buffer.from(req.baseKey._raw, "base64");
					// HKDF-Extract
					const prk = createHmac(hashName, salt.length > 0 ? salt : Buffer.alloc(32)).update(ikm).digest();
					// HKDF-Expand
					const hashLen = prk.length;
					const numBlocks = Math.ceil((req.length / 8) / hashLen);
					const okm: Buffer[] = [];
					let prev = Buffer.alloc(0);
					for (let i = 1; i <= numBlocks; i++) {
						prev = createHmac(hashName, prk).update(prev).update(info).update(Buffer.from([i])).digest();
						okm.push(prev);
					}
					const derived = Buffer.concat(okm).subarray(0, req.length / 8);
					return JSON.stringify({ data: derived.toString("base64") });
				}
				throw new Error(`Unsupported deriveBits algorithm: ${algoName}`);
			}
			case "deriveKey": {
				const dkAlgoName = req.algorithm.name;
				let derivedLength = req.derivedKeyType.length;
				if (!derivedLength && req.derivedKeyType.name === "HMAC") {
					const hashLens: Record<string, number> = { "SHA-1": 160, "SHA-256": 256, "SHA-384": 384, "SHA-512": 512 };
					const hname = typeof req.derivedKeyType.hash === "string" ? req.derivedKeyType.hash : req.derivedKeyType.hash?.name;
					derivedLength = hashLens[hname] || 256;
				}
				if (dkAlgoName === "PBKDF2") {
					const salt = Buffer.from(req.algorithm.salt, "base64");
					const hashName = normalizeHash(req.algorithm.hash);
					const keyBytes = Buffer.from(req.baseKey._raw, "base64");
					const derived = pbkdf2Sync(keyBytes, salt, req.algorithm.iterations, derivedLength / 8, hashName);
					return JSON.stringify({
						key: {
							type: "secret",
							algorithm: req.derivedKeyType,
							extractable: req.extractable,
							usages: req.usages,
							_raw: derived.toString("base64"),
						},
					});
				}
				throw new Error(`Unsupported deriveKey algorithm: ${dkAlgoName}`);
			}
			default:
				throw new Error(`Unsupported subtle operation: ${req.op}`);
		}
	});
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.cryptoSubtle, cryptoSubtleRef);

	// Set up fs References (stubbed if filesystem is disabled)
	{
		const fs = deps.filesystem;
		const base64Limit = deps.bridgeBase64TransferLimitBytes;
		const fsJsonPayloadLimit = deps.isolateJsonPayloadLimitBytes;

		// Create individual References for each fs operation
		const readFileRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			const text = await fs.readTextFile(path);
			assertTextPayloadSize(
				`fs.readFile ${path}`,
				text,
				fsJsonPayloadLimit,
			);
			return text;
		});
		const writeFileRef = new ivm.Reference(
			async (path: string, content: string) => {
				checkBridgeBudget(deps);
				await fs.writeFile(path, content);
			},
		);
		// Binary file operations using base64 encoding
		const readFileBinaryRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			const data = await fs.readFile(path);
				assertPayloadByteLength(
					`fs.readFileBinary ${path}`,
					getBase64EncodedByteLength(data.byteLength),
					base64Limit,
				);
			// Convert to base64 for transfer across isolate boundary
			return Buffer.from(data).toString("base64");
		});
		const writeFileBinaryRef = new ivm.Reference(
			async (path: string, base64Content: string) => {
				checkBridgeBudget(deps);
					assertTextPayloadSize(
						`fs.writeFileBinary ${path}`,
						base64Content,
						base64Limit,
					);
				// Decode base64 and write as binary
				const data = Buffer.from(base64Content, "base64");
				await fs.writeFile(path, data);
			},
		);
		const readDirRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			const entries = await fs.readDirWithTypes(path);
			// Validate payload size before transfer
			const json = JSON.stringify(entries);
			assertTextPayloadSize(`fs.readDir ${path}`, json, fsJsonPayloadLimit);
			return json;
		});
		const mkdirRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			await mkdir(fs, path);
		});
		const rmdirRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			await fs.removeDir(path);
		});
		const existsRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			return fs.exists(path);
		});
		const statRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			const statInfo = await fs.stat(path);
			// Return as JSON string for transfer
			return JSON.stringify({
				mode: statInfo.mode,
				size: statInfo.size,
				isDirectory: statInfo.isDirectory,
				atimeMs: statInfo.atimeMs,
				mtimeMs: statInfo.mtimeMs,
				ctimeMs: statInfo.ctimeMs,
				birthtimeMs: statInfo.birthtimeMs,
			});
		});
		const unlinkRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			await fs.removeFile(path);
		});
		const renameRef = new ivm.Reference(
			async (oldPath: string, newPath: string) => {
				checkBridgeBudget(deps);
				await fs.rename(oldPath, newPath);
			},
		);
		const chmodRef = new ivm.Reference(
			async (path: string, mode: number) => {
				checkBridgeBudget(deps);
				await fs.chmod(path, mode);
			},
		);
		const chownRef = new ivm.Reference(
			async (path: string, uid: number, gid: number) => {
				checkBridgeBudget(deps);
				await fs.chown(path, uid, gid);
			},
		);
		const linkRef = new ivm.Reference(
			async (oldPath: string, newPath: string) => {
				checkBridgeBudget(deps);
				await fs.link(oldPath, newPath);
			},
		);
		const symlinkRef = new ivm.Reference(
			async (target: string, linkPath: string) => {
				checkBridgeBudget(deps);
				await fs.symlink(target, linkPath);
			},
		);
		const readlinkRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			return fs.readlink(path);
		});
		const lstatRef = new ivm.Reference(async (path: string) => {
			checkBridgeBudget(deps);
			const statInfo = await fs.lstat(path);
			return JSON.stringify({
				mode: statInfo.mode,
				size: statInfo.size,
				isDirectory: statInfo.isDirectory,
				isSymbolicLink: statInfo.isSymbolicLink,
				atimeMs: statInfo.atimeMs,
				mtimeMs: statInfo.mtimeMs,
				ctimeMs: statInfo.ctimeMs,
				birthtimeMs: statInfo.birthtimeMs,
			});
		});
		const truncateRef = new ivm.Reference(
			async (path: string, length: number) => {
				checkBridgeBudget(deps);
				await fs.truncate(path, length);
			},
		);
		const utimesRef = new ivm.Reference(
			async (path: string, atime: number, mtime: number) => {
				checkBridgeBudget(deps);
				await fs.utimes(path, atime, mtime);
			},
		);

		// Set up each fs Reference individually in the isolate
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsReadFile, readFileRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsWriteFile, writeFileRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsReadFileBinary, readFileBinaryRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsWriteFileBinary, writeFileBinaryRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsReadDir, readDirRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsMkdir, mkdirRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsRmdir, rmdirRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsExists, existsRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsStat, statRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsUnlink, unlinkRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsRename, renameRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsChmod, chmodRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsChown, chownRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsLink, linkRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsSymlink, symlinkRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsReadlink, readlinkRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsLstat, lstatRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsTruncate, truncateRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.fsUtimes, utimesRef);

		// Create the _fs object inside the isolate.
		await context.eval(getIsolateRuntimeSource("setupFsFacade"));
	}

	// Set up child_process References (stubbed when disabled)
	{
		const executor = deps.commandExecutor ?? createCommandExecutorStub();
		let nextSessionId = 1;
		const sessions = deps.activeChildProcesses;
		const jsonPayloadLimit = deps.isolateJsonPayloadLimitBytes;

		// Lazy-initialized dispatcher reference from isolate
		// We can't get this upfront because _childProcessDispatch is set by bridge code
		// which loads AFTER these references are set up
		let dispatchRef: ivm.Reference<
			(
				sessionId: number,
				type: "stdout" | "stderr" | "exit",
				data: Uint8Array | number,
			) => void
		> | null = null;

		const getDispatchRef = () => {
			if (!dispatchRef) {
				dispatchRef = context.global.getSync(
					RUNTIME_BRIDGE_GLOBAL_KEYS.childProcessDispatch,
					{
					reference: true,
					},
				) as ivm.Reference<
					(
						sessionId: number,
						type: "stdout" | "stderr" | "exit",
						data: Uint8Array | number,
					) => void
				>;
			}
			return dispatchRef!;
		};

		// Start a spawn - returns session ID
		const spawnStartRef = new ivm.Reference(
			(command: string, argsJson: string, optionsJson: string): number => {
				checkBridgeBudget(deps);
				if (deps.maxChildProcesses !== undefined && deps.budgetState.childProcesses >= deps.maxChildProcesses) {
					throw new Error(`${RESOURCE_BUDGET_ERROR_CODE}: maximum child processes exceeded`);
				}
				deps.budgetState.childProcesses++;
				const args = parseJsonWithLimit<string[]>(
					"child_process.spawn args",
					argsJson,
					jsonPayloadLimit,
				);
				const options = parseJsonWithLimit<{
					cwd?: string;
					env?: Record<string, string>;
				}>("child_process.spawn options", optionsJson, jsonPayloadLimit);
				const sessionId = nextSessionId++;

				// Use init-time filtered env when no explicit env — sandbox
				// process.env mutations must not propagate to children
				const childEnv = stripDangerousEnv(options.env ?? deps.processConfig.env);

				const proc = executor.spawn(command, args, {
					cwd: options.cwd,
					env: childEnv,
					onStdout: (data) => {
						getDispatchRef().applySync(
							undefined,
							[sessionId, "stdout", data],
							{ arguments: { copy: true } },
						);
					},
					onStderr: (data) => {
						getDispatchRef().applySync(
							undefined,
							[sessionId, "stderr", data],
							{ arguments: { copy: true } },
						);
					},
				});

				proc.wait().then((code) => {
					getDispatchRef().applySync(undefined, [sessionId, "exit", code]);
					sessions.delete(sessionId);
				});

				sessions.set(sessionId, proc);
				return sessionId;
			},
		);

		// Stdin write
		const stdinWriteRef = new ivm.Reference(
			(sessionId: number, data: Uint8Array): void => {
				sessions.get(sessionId)?.writeStdin(data);
			},
		);

		// Stdin close
		const stdinCloseRef = new ivm.Reference((sessionId: number): void => {
			sessions.get(sessionId)?.closeStdin();
		});

		// Kill
		const killRef = new ivm.Reference(
			(sessionId: number, signal: number): void => {
				sessions.get(sessionId)?.kill(signal);
			},
		);

		// Synchronous spawn - blocks until process exits, returns all output
		// Used by execSync/spawnSync which need to wait for completion
		const spawnSyncRef = new ivm.Reference(
			async (
				command: string,
				argsJson: string,
				optionsJson: string,
			): Promise<string> => {
				checkBridgeBudget(deps);
				if (deps.maxChildProcesses !== undefined && deps.budgetState.childProcesses >= deps.maxChildProcesses) {
					throw new Error(`${RESOURCE_BUDGET_ERROR_CODE}: maximum child processes exceeded`);
				}
				deps.budgetState.childProcesses++;
				const args = parseJsonWithLimit<string[]>(
					"child_process.spawnSync args",
					argsJson,
					jsonPayloadLimit,
				);
				const options = parseJsonWithLimit<{
					cwd?: string;
					env?: Record<string, string>;
					maxBuffer?: number;
				}>("child_process.spawnSync options", optionsJson, jsonPayloadLimit);

				// Collect stdout/stderr with maxBuffer enforcement (default 1MB)
				const maxBuffer = options.maxBuffer ?? 1024 * 1024;
				const stdoutChunks: Uint8Array[] = [];
				const stderrChunks: Uint8Array[] = [];
				let stdoutBytes = 0;
				let stderrBytes = 0;
				let maxBufferExceeded = false;

				// Use init-time filtered env when no explicit env — sandbox
				// process.env mutations must not propagate to children
				const childEnv = stripDangerousEnv(options.env ?? deps.processConfig.env);

				const proc = executor.spawn(command, args, {
					cwd: options.cwd,
					env: childEnv,
					onStdout: (data) => {
						if (maxBufferExceeded) return;
						stdoutBytes += data.length;
						if (maxBuffer !== undefined && stdoutBytes > maxBuffer) {
							maxBufferExceeded = true;
							proc.kill(15);
							return;
						}
						stdoutChunks.push(data);
					},
					onStderr: (data) => {
						if (maxBufferExceeded) return;
						stderrBytes += data.length;
						if (maxBuffer !== undefined && stderrBytes > maxBuffer) {
							maxBufferExceeded = true;
							proc.kill(15);
							return;
						}
						stderrChunks.push(data);
					},
				});

				// Wait for process to exit
				const exitCode = await proc.wait();

				// Combine chunks into strings
				const decoder = new TextDecoder();
				const stdout = stdoutChunks.map((c) => decoder.decode(c)).join("");
				const stderr = stderrChunks.map((c) => decoder.decode(c)).join("");

				return JSON.stringify({ stdout, stderr, code: exitCode, maxBufferExceeded });
			},
		);

		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.childProcessSpawnStart, spawnStartRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.childProcessStdinWrite, stdinWriteRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.childProcessStdinClose, stdinCloseRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.childProcessKill, killRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.childProcessSpawnSync, spawnSyncRef);
	}

	// Set up network References (stubbed when disabled)
	{
		const adapter = deps.networkAdapter ?? createNetworkStub();
		const jsonPayloadLimit = deps.isolateJsonPayloadLimitBytes;

		// Reference for fetch - returns JSON string for transfer
		const networkFetchRef = new ivm.Reference(
			(url: string, optionsJson: string): Promise<string> => {
				checkBridgeBudget(deps);
				const options = parseJsonWithLimit<{
					method?: string;
					headers?: Record<string, string>;
					body?: string | null;
				}>("network.fetch options", optionsJson, jsonPayloadLimit);
				return adapter
					.fetch(url, options)
					.then((result) => {
						const json = JSON.stringify(result);
						assertTextPayloadSize("network.fetch response", json, jsonPayloadLimit);
						return json;
					});
			},
		);

		// Reference for DNS lookup - returns JSON string for transfer
		const networkDnsLookupRef = new ivm.Reference(
			async (hostname: string): Promise<string> => {
				checkBridgeBudget(deps);
				const result = await adapter.dnsLookup(hostname);
				return JSON.stringify(result);
			},
		);

		// Reference for HTTP request - returns JSON string for transfer
		const networkHttpRequestRef = new ivm.Reference(
			(url: string, optionsJson: string): Promise<string> => {
				checkBridgeBudget(deps);
				const options = parseJsonWithLimit<{
					method?: string;
					headers?: Record<string, string>;
					body?: string | null;
					rejectUnauthorized?: boolean;
				}>("network.httpRequest options", optionsJson, jsonPayloadLimit);
				return adapter
					.httpRequest(url, options)
					.then((result) => {
						const json = JSON.stringify(result);
						assertTextPayloadSize("network.httpRequest response", json, jsonPayloadLimit);
						return json;
					});
			},
		);

		// Track server IDs created in this context for ownership validation
		const ownedHttpServers = new Set<number>();

		// Lazy dispatcher reference for in-sandbox HTTP server callbacks
		let httpServerDispatchRef: ivm.Reference<
			(serverId: number, requestJson: string) => Promise<string>
		> | null = null;

		const getHttpServerDispatchRef = () => {
			if (!httpServerDispatchRef) {
				httpServerDispatchRef = context.global.getSync(
					RUNTIME_BRIDGE_GLOBAL_KEYS.httpServerDispatch,
					{
						reference: true,
					},
				) as ivm.Reference<
					(serverId: number, requestJson: string) => Promise<string>
				>;
			}
			return httpServerDispatchRef!;
		};

		// Lazy dispatcher reference for upgrade events
		let httpServerUpgradeDispatchRef: ivm.Reference<
			(serverId: number, requestJson: string, headBase64: string, socketId: number) => void
		> | null = null;

		const getUpgradeDispatchRef = () => {
			if (!httpServerUpgradeDispatchRef) {
				httpServerUpgradeDispatchRef = context.global.getSync(
					RUNTIME_BRIDGE_GLOBAL_KEYS.httpServerUpgradeDispatch,
					{ reference: true },
				) as ivm.Reference<
					(serverId: number, requestJson: string, headBase64: string, socketId: number) => void
				>;
			}
			return httpServerUpgradeDispatchRef!;
		};

		// Lazy dispatcher references for upgrade socket data push
		let upgradeSocketDataRef: ivm.Reference<
			(socketId: number, dataBase64: string) => void
		> | null = null;

		const getUpgradeSocketDataRef = () => {
			if (!upgradeSocketDataRef) {
				upgradeSocketDataRef = context.global.getSync(
					RUNTIME_BRIDGE_GLOBAL_KEYS.upgradeSocketData,
					{ reference: true },
				) as ivm.Reference<
					(socketId: number, dataBase64: string) => void
				>;
			}
			return upgradeSocketDataRef!;
		};

		let upgradeSocketEndDispatchRef: ivm.Reference<
			(socketId: number) => void
		> | null = null;

		const getUpgradeSocketEndRef = () => {
			if (!upgradeSocketEndDispatchRef) {
				upgradeSocketEndDispatchRef = context.global.getSync(
					RUNTIME_BRIDGE_GLOBAL_KEYS.upgradeSocketEnd,
					{ reference: true },
				) as ivm.Reference<(socketId: number) => void>;
			}
			return upgradeSocketEndDispatchRef!;
		};

		// Reference for starting an in-sandbox HTTP server
		const networkHttpServerListenRef = new ivm.Reference(
			(optionsJson: string): Promise<string> => {
				if (!adapter.httpServerListen) {
					throw new Error(
						"http.createServer requires NetworkAdapter.httpServerListen support",
					);
				}

				const options = parseJsonWithLimit<{
					serverId: number;
					port?: number;
					hostname?: string;
				}>("network.httpServer.listen options", optionsJson, jsonPayloadLimit);

				return (async () => {
					const result = await adapter.httpServerListen!({
						serverId: options.serverId,
						port: options.port,
						hostname: options.hostname,
						onRequest: async (request) => {
							const requestJson = JSON.stringify(request);

							const responseJson = await getHttpServerDispatchRef().apply(
								undefined,
								[options.serverId, requestJson],
								{ result: { promise: true } },
							);
							return parseJsonWithLimit<{
								status: number;
								headers?: Array<[string, string]>;
								body?: string;
								bodyEncoding?: "utf8" | "base64";
							}>("network.httpServer response", String(responseJson), jsonPayloadLimit);
						},
						onUpgrade: (request, head, socketId) => {
							const requestJson = JSON.stringify(request);
							getUpgradeDispatchRef().applySync(
								undefined,
								[options.serverId, requestJson, head, socketId],
							);
						},
						onUpgradeSocketData: (socketId, dataBase64) => {
							getUpgradeSocketDataRef().applySync(
								undefined,
								[socketId, dataBase64],
							);
						},
						onUpgradeSocketEnd: (socketId) => {
							getUpgradeSocketEndRef().applySync(
								undefined,
								[socketId],
							);
						},
					});
					ownedHttpServers.add(options.serverId);
					deps.activeHttpServerIds.add(options.serverId);
					return JSON.stringify(result);
				})();
			},
		);

		// Reference for closing an in-sandbox HTTP server
		const networkHttpServerCloseRef = new ivm.Reference(
			(serverId: number): Promise<void> => {
				if (!adapter.httpServerClose) {
					throw new Error(
						"http.createServer close requires NetworkAdapter.httpServerClose support",
					);
				}
				// Ownership check: only allow closing servers created in this context
				if (!ownedHttpServers.has(serverId)) {
					throw new Error(
						`Cannot close server ${serverId}: not owned by this execution context`,
					);
				}
				return adapter.httpServerClose(serverId).then(() => {
					ownedHttpServers.delete(serverId);
					deps.activeHttpServerIds.delete(serverId);
				});
			},
		);

		// References for upgrade socket write/end/destroy (sandbox → host)
		const upgradeSocketWriteRef = new ivm.Reference(
			(socketId: number, dataBase64: string): void => {
				adapter.upgradeSocketWrite?.(socketId, dataBase64);
			},
		);

		const upgradeSocketEndRef = new ivm.Reference(
			(socketId: number): void => {
				adapter.upgradeSocketEnd?.(socketId);
			},
		);

		const upgradeSocketDestroyRef = new ivm.Reference(
			(socketId: number): void => {
				adapter.upgradeSocketDestroy?.(socketId);
			},
		);

		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.networkFetchRaw, networkFetchRef);
		await jail.set(
			HOST_BRIDGE_GLOBAL_KEYS.networkDnsLookupRaw,
			networkDnsLookupRef,
		);
		await jail.set(
			HOST_BRIDGE_GLOBAL_KEYS.networkHttpRequestRaw,
			networkHttpRequestRef,
		);
		await jail.set(
			HOST_BRIDGE_GLOBAL_KEYS.networkHttpServerListenRaw,
			networkHttpServerListenRef,
		);
		await jail.set(
			HOST_BRIDGE_GLOBAL_KEYS.networkHttpServerCloseRaw,
			networkHttpServerCloseRef,
		);
		await jail.set(
			HOST_BRIDGE_GLOBAL_KEYS.upgradeSocketWriteRaw,
			upgradeSocketWriteRef,
		);
		await jail.set(
			HOST_BRIDGE_GLOBAL_KEYS.upgradeSocketEndRaw,
			upgradeSocketEndRef,
		);
		await jail.set(
			HOST_BRIDGE_GLOBAL_KEYS.upgradeSocketDestroyRaw,
			upgradeSocketDestroyRef,
		);

		// Register client-side upgrade socket callbacks so httpRequest can push data
		adapter.setUpgradeSocketCallbacks?.({
			onData: (socketId, dataBase64) => {
				getUpgradeSocketDataRef().applySync(
					undefined,
					[socketId, dataBase64],
				);
			},
			onEnd: (socketId) => {
				getUpgradeSocketEndRef().applySync(
					undefined,
					[socketId],
				);
			},
		});

		// TCP socket bridge refs (net module)
		let netSocketDispatchRef: ivm.Reference<
			(socketId: number, type: string, data: string) => void
		> | null = null;

		const getNetSocketDispatchRef = () => {
			if (!netSocketDispatchRef) {
				netSocketDispatchRef = context.global.getSync(
					RUNTIME_BRIDGE_GLOBAL_KEYS.netSocketDispatch,
					{ reference: true },
				) as ivm.Reference<
					(socketId: number, type: string, data: string) => void
				>;
			}
			return netSocketDispatchRef!;
		};

		const dispatchNetEvent = (socketId: number, type: string, data: string) => {
			try {
				getNetSocketDispatchRef().applySync(
					undefined,
					[socketId, type, data],
				);
			} catch {
				// Isolate may have been disposed; silently drop the event
			}
		};

		const netSocketConnectRef = new ivm.Reference(
			(host: string, port: number): number => {
				checkBridgeBudget(deps);
				// Use adapter-returned socketId for all dispatch/write/end/destroy
				let socketId = -1;
				socketId = adapter.netSocketConnect?.(host, port, {
					onConnect: () => dispatchNetEvent(socketId, "connect", ""),
					onData: (dataBase64) => dispatchNetEvent(socketId, "data", dataBase64),
					onEnd: () => dispatchNetEvent(socketId, "end", ""),
					onError: (message) => dispatchNetEvent(socketId, "error", message),
					onClose: (hadError) => dispatchNetEvent(socketId, "close", hadError ? "1" : "0"),
				}) ?? -1;
				return socketId;
			},
		);

		const netSocketWriteRef = new ivm.Reference(
			(socketId: number, dataBase64: string): void => {
				adapter.netSocketWrite?.(socketId, dataBase64);
			},
		);

		const netSocketEndRef = new ivm.Reference(
			(socketId: number): void => {
				adapter.netSocketEnd?.(socketId);
			},
		);

		const netSocketDestroyRef = new ivm.Reference(
			(socketId: number): void => {
				adapter.netSocketDestroy?.(socketId);
			},
		);

		const netSocketUpgradeTlsRef = new ivm.Reference(
			(socketId: number, optionsJson: string): void => {
				checkBridgeBudget(deps);
				adapter.netSocketUpgradeTls?.(socketId, optionsJson, {
					onData: (dataBase64) => dispatchNetEvent(socketId, "data", dataBase64),
					onEnd: () => dispatchNetEvent(socketId, "end", ""),
					onError: (message) => dispatchNetEvent(socketId, "error", message),
					onClose: (hadError) => dispatchNetEvent(socketId, "close", hadError ? "1" : "0"),
					onSecureConnect: () => dispatchNetEvent(socketId, "secureConnect", ""),
				});
			},
		);

		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.netSocketConnectRaw, netSocketConnectRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.netSocketWriteRaw, netSocketWriteRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.netSocketEndRaw, netSocketEndRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.netSocketDestroyRaw, netSocketDestroyRef);
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.netSocketUpgradeTlsRaw, netSocketUpgradeTlsRef);
	}

	// Set up PTY setRawMode bridge ref when stdin is a TTY
	if (deps.processConfig.stdinIsTTY) {
		const onSetRawMode = deps.onPtySetRawMode;
		const ptySetRawModeRef = new ivm.Reference((mode: boolean): void => {
			if (onSetRawMode) onSetRawMode(mode);
		});
		await jail.set(HOST_BRIDGE_GLOBAL_KEYS.ptySetRawMode, ptySetRawModeRef);
	}

	// Install isolate-global descriptor helpers before runtime bootstrap scripts.
	await context.eval(getIsolateRuntimeSource("globalExposureHelpers"));

	// Set up globals needed by the bridge BEFORE loading it.
	const initialCwd = deps.processConfig.cwd ?? "/";
	await jail.set(
		"__runtimeBridgeSetupConfig",
		{
			initialCwd,
			jsonPayloadLimitBytes: deps.isolateJsonPayloadLimitBytes,
			payloadLimitErrorCode: PAYLOAD_LIMIT_ERROR_CODE,
		},
		{ copy: true },
	);
	await context.eval(getInitialBridgeGlobalsSetupCode());

	// Load the bridge bundle which sets up all polyfill modules.
	await jail.set(
		HOST_BRIDGE_GLOBAL_KEYS.processConfig,
		createProcessConfigForExecution(deps.processConfig, timingMitigation, frozenTimeMs),
		{ copy: true },
	);
	await jail.set(HOST_BRIDGE_GLOBAL_KEYS.osConfig, deps.osConfig, {
		copy: true,
	});
	await context.eval(getRawBridgeCode());
	await context.eval(getBridgeAttachCode());
	await applyTimingMitigation(context, timingMitigation, frozenTimeMs);

	// Set up the require system with dynamic CommonJS resolution
	await context.eval(getRequireSetupCode());
	// module and process are already initialized by the bridge
}

/**
 * Set up ESM-compatible globals (process, Buffer, etc.)
 */
export async function setupESMGlobals(
	deps: BridgeDeps,
	context: ivm.Context,
	jail: ivm.Reference<Record<string, unknown>>,
	timingMitigation: TimingMitigation,
	frozenTimeMs: number,
): Promise<void> {
	await setupRequire(deps, context, jail, timingMitigation, frozenTimeMs);
}

export function createProcessConfigForExecution(
	processConfig: ProcessConfig,
	timingMitigation: TimingMitigation,
	frozenTimeMs: number,
): ProcessConfig {
	return {
		...processConfig,
		timingMitigation,
		frozenTimeMs: timingMitigation === "freeze" ? frozenTimeMs : undefined,
	};
}

async function applyTimingMitigation(
	context: ivm.Context,
	timingMitigation: TimingMitigation,
	frozenTimeMs: number,
): Promise<void> {
	if (timingMitigation !== "freeze") {
		await context.eval(getIsolateRuntimeSource("applyTimingMitigationOff"));
		return;
	}

	await context.global.set(
		"__runtimeTimingMitigationConfig",
		{ frozenTimeMs },
		{ copy: true },
	);
	await context.eval(getIsolateRuntimeSource("applyTimingMitigationFreeze"));
}
