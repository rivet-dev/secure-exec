// Build a BridgeHandlers map for V8 runtime.
//
// Each handler is a plain function that performs the host-side operation.
// Handler names match HOST_BRIDGE_GLOBAL_KEYS from the bridge contract.

import * as net from "node:net";
import * as http from "node:http";
import * as tls from "node:tls";
import { Duplex } from "node:stream";
import { readFileSync, realpathSync, existsSync } from "node:fs";
import { dirname as pathDirname, join as pathJoin, resolve as pathResolve } from "node:path";
import { createRequire } from "node:module";
import { serialize } from "node:v8";
import {
	randomFillSync,
	randomUUID,
	createHash,
	createHmac,
	pbkdf2Sync,
	scryptSync,
	hkdfSync,
	createCipheriv,
	createDecipheriv,
	sign,
	verify,
	generateKeyPairSync,
	createPrivateKey,
	createPublicKey,
	createSecretKey,
	createDiffieHellman,
	getDiffieHellman,
	createECDH,
	diffieHellman,
	generateKeySync,
	generatePrimeSync,
	publicEncrypt,
	privateDecrypt,
	privateEncrypt,
	publicDecrypt,
	timingSafeEqual,
	constants as cryptoConstants,
	KeyObject,
	type Cipher,
	type Decipher,
} from "node:crypto";
import {
	HOST_BRIDGE_GLOBAL_KEYS,
} from "./bridge-contract.js";
import {
	mkdir,
	FDTableManager,
	O_RDONLY,
	O_WRONLY,
	O_RDWR,
	O_CREAT,
	O_TRUNC,
	O_APPEND,
	FILETYPE_REGULAR_FILE,
} from "@secure-exec/core";
import { normalizeBuiltinSpecifier } from "./builtin-modules.js";
import { resolveModule, loadFile } from "./package-bundler.js";
import { transformDynamicImport, isESM } from "@secure-exec/core/internal/shared/esm-utils";
import { bundlePolyfill, hasPolyfill } from "./polyfills.js";
import {
	createBuiltinESMWrapper,
	getStaticBuiltinWrapperSource,
	getEmptyBuiltinESMWrapper,
} from "./esm-compiler.js";
import {
	checkBridgeBudget,
	assertPayloadByteLength,
	assertTextPayloadSize,
	getBase64EncodedByteLength,
	getHostBuiltinNamedExports,
	parseJsonWithLimit,
	polyfillCodeCache,
	RESOURCE_BUDGET_ERROR_CODE,
} from "./isolate-bootstrap.js";
import type {
	CommandExecutor,
	NetworkAdapter,
	SpawnedProcess,
} from "@secure-exec/core";
import type { VirtualFileSystem } from "@secure-exec/core";
import type { ResolutionCache } from "./package-bundler.js";
import type {
	StdioEvent,
	StdioHook,
	ProcessConfig,
} from "@secure-exec/core/internal/shared/api-types";
import type { BudgetState } from "./isolate-bootstrap.js";

/** A bridge handler function invoked when sandbox code calls a bridge global. */
export type BridgeHandler = (...args: unknown[]) => unknown | Promise<unknown>;

/** Map of bridge global names to their handler functions. */
export type BridgeHandlers = Record<string, BridgeHandler>;

/** Result of building crypto bridge handlers — includes dispose for session cleanup. */
export interface CryptoBridgeResult {
	handlers: BridgeHandlers;
	dispose: () => void;
}

type SerializedKeyValue =
	| {
		kind: "string";
		value: string;
	}
	| {
		kind: "buffer";
		value: string;
	}
	| {
		kind: "keyObject";
		value: SerializedSandboxKeyObject;
	}
	| {
		kind: "object";
		value: Record<string, unknown>;
	};

interface SerializedSandboxKeyObject {
	type: "public" | "private" | "secret";
	pem?: string;
	raw?: string;
	asymmetricKeyType?: string;
	asymmetricKeyDetails?: Record<string, unknown>;
	jwk?: Record<string, unknown>;
}

type SerializedBridgeValue =
	| null
	| boolean
	| number
	| string
	| {
			__type: "buffer";
			value: string;
	  }
	| {
			__type: "bigint";
			value: string;
	  }
	| {
			__type: "keyObject";
			value: SerializedSandboxKeyObject;
	  }
	| SerializedBridgeValue[]
	| {
			[key: string]: SerializedBridgeValue;
	  };

/** Stateful cipher/decipher session stored between bridge calls. */
interface CipherSession {
	cipher: Cipher | Decipher;
	algorithm: string;
}

interface SerializedDispatchError {
	message: string;
	name?: string;
	code?: string;
	stack?: string;
}

type DiffieHellmanSession =
	| ReturnType<typeof createDiffieHellman>
	| ReturnType<typeof getDiffieHellman>
	| ReturnType<typeof createECDH>;

function serializeKeyDetails(details: unknown): Record<string, unknown> | undefined {
	if (!details || typeof details !== "object") {
		return undefined;
	}

	return Object.fromEntries(
		Object.entries(details).map(([key, value]) => [
			key,
			typeof value === "bigint"
				? { __type: "bigint", value: value.toString() }
				: value,
		]),
	);
}

function serializeKeyValue(value: unknown): SerializedKeyValue {
	if (Buffer.isBuffer(value)) {
		return {
			kind: "buffer",
			value: value.toString("base64"),
		};
	}

	if (typeof value === "string") {
		return {
			kind: "string",
			value,
		};
	}

	if (
		value &&
		typeof value === "object" &&
		"type" in value &&
		((value as { type?: unknown }).type === "public" ||
			(value as { type?: unknown }).type === "private") &&
		typeof (value as { export?: unknown }).export === "function"
	) {
		return {
			kind: "keyObject",
			value: serializeSandboxKeyObject(value as any),
		};
	}

	return {
		kind: "object",
		value: value as Record<string, unknown>,
	};
}

function exportAsPem(keyObject: ReturnType<typeof createPrivateKey> | ReturnType<typeof createPublicKey>): string {
	return keyObject.type === "private"
		? (keyObject.export({ type: "pkcs8", format: "pem" }) as string)
		: (keyObject.export({ type: "spki", format: "pem" }) as string);
}

function serializeSandboxKeyObject(
	keyObject: ReturnType<typeof createPrivateKey> | ReturnType<typeof createPublicKey>,
): SerializedSandboxKeyObject {
	let jwk: Record<string, unknown> | undefined;
	try {
		jwk = keyObject.export({ format: "jwk" }) as Record<string, unknown>;
	} catch {
		jwk = undefined;
	}

	return {
		type: keyObject.type,
		pem: exportAsPem(keyObject),
		asymmetricKeyType: keyObject.asymmetricKeyType ?? undefined,
		asymmetricKeyDetails: serializeKeyDetails(keyObject.asymmetricKeyDetails),
		jwk,
	};
}

function serializeAnyKeyObject(keyObject: any): SerializedSandboxKeyObject {
	if (keyObject.type === "secret") {
		return {
			type: "secret",
			raw: Buffer.from(keyObject.export()).toString("base64"),
		};
	}

	return serializeSandboxKeyObject(keyObject);
}

function serializeBridgeValue(value: unknown): SerializedBridgeValue {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value;
	}

	if (typeof value === "bigint") {
		return {
			__type: "bigint",
			value: value.toString(),
		};
	}

	if (Buffer.isBuffer(value)) {
		return {
			__type: "buffer",
			value: value.toString("base64"),
		};
	}

	if (value instanceof ArrayBuffer) {
		return {
			__type: "buffer",
			value: Buffer.from(value).toString("base64"),
		};
	}

	if (ArrayBuffer.isView(value)) {
		return {
			__type: "buffer",
			value: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64"),
		};
	}

	if (Array.isArray(value)) {
		return value.map((entry) => serializeBridgeValue(entry));
	}

	if (
		value &&
		typeof value === "object" &&
		"type" in value &&
		(((value as { type?: unknown }).type === "public" ||
			(value as { type?: unknown }).type === "private" ||
			(value as { type?: unknown }).type === "secret")) &&
		typeof (value as { export?: unknown }).export === "function"
	) {
		return {
			__type: "keyObject",
			value: serializeAnyKeyObject(value as any),
		};
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).flatMap(([key, entry]) =>
				entry === undefined ? [] : [[key, serializeBridgeValue(entry)]],
			),
		);
	}

	return String(value);
}

function deserializeSandboxKeyObject(serialized: SerializedSandboxKeyObject): any {
	if (serialized.type === "secret") {
		return createSecretKey(Buffer.from(serialized.raw || "", "base64"));
	}

	if (serialized.type === "private") {
		return createPrivateKey(String(serialized.pem || ""));
	}

	return createPublicKey(String(serialized.pem || ""));
}

function deserializeBridgeValue(value: SerializedBridgeValue): unknown {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((entry) => deserializeBridgeValue(entry));
	}

	if ("__type" in value) {
		if (value.__type === "buffer") {
			return Buffer.from((value as { value: string }).value, "base64");
		}
		if (value.__type === "bigint") {
			return BigInt((value as { value: string }).value);
		}
		if (value.__type === "keyObject") {
			return deserializeSandboxKeyObject((value as { value: SerializedSandboxKeyObject }).value);
		}
	}

	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, deserializeBridgeValue(entry)]),
	);
}

function parseSerializedOptions(
	optionsJson: unknown,
): unknown {
	const parsed = JSON.parse(String(optionsJson)) as {
		hasOptions?: boolean;
		options?: SerializedBridgeValue;
	};
	if (!parsed || parsed.hasOptions !== true) {
		return undefined;
	}
	return deserializeBridgeValue(parsed.options ?? null);
}

function serializeDispatchError(error: unknown): SerializedDispatchError {
	if (error instanceof Error) {
		const withCode = error as Error & {
			code?: unknown;
		};
		return {
			message: error.message,
			name: error.name,
			code: typeof withCode.code === "string" ? withCode.code : undefined,
			stack: error.stack,
		};
	}

	return {
		message: String(error),
		name: "Error",
	};
}

function restoreDispatchArgument(value: unknown): unknown {
	if (!value || typeof value !== "object") {
		return value;
	}

	if (
		(value as { __secureExecDispatchType?: unknown }).__secureExecDispatchType ===
		"undefined"
	) {
		return undefined;
	}

	if (Array.isArray(value)) {
		return value.map((entry) => restoreDispatchArgument(entry));
	}

	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, restoreDispatchArgument(entry)]),
	);
}

function normalizeBridgeAlgorithm(algorithm: unknown): string | null {
	if (algorithm === null || algorithm === undefined || algorithm === "") {
		return null;
	}

	return String(algorithm);
}

interface BridgeCryptoKeyData {
	type: "public" | "private" | "secret";
	extractable: boolean;
	algorithm: Record<string, unknown>;
	usages: string[];
	_pem?: string;
	_jwk?: Record<string, unknown>;
	_raw?: string;
	_sourceKeyObjectData?: Record<string, unknown>;
}

function decodeBridgeBuffer(data: unknown): Buffer {
	return Buffer.from(String(data), "base64");
}

function sanitizeJsonValue(value: unknown): unknown {
	if (typeof value === "bigint") {
		return Number(value);
	}
	if (Array.isArray(value)) {
		return value.map((entry) => sanitizeJsonValue(entry));
	}
	if (!value || typeof value !== "object") {
		return value;
	}
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
			key,
			sanitizeJsonValue(entry),
		]),
	);
}

function serializeCryptoKeyDataFromKeyObject(
	keyObject: KeyObject,
	type: "public" | "private" | "secret",
	algorithm: Record<string, unknown>,
	extractable: boolean,
	usages: string[],
): BridgeCryptoKeyData {
	if (type === "secret") {
		return {
			type,
			algorithm,
			extractable,
			usages,
			_raw: keyObject.export().toString("base64"),
			_sourceKeyObjectData: {
				type: "secret",
				raw: keyObject.export().toString("base64"),
			},
		};
	}

	return {
		type,
		algorithm,
		extractable,
		usages,
		_pem:
			type === "private"
				? (keyObject.export({ type: "pkcs8", format: "pem" }) as string)
				: (keyObject.export({ type: "spki", format: "pem" }) as string),
		_sourceKeyObjectData: {
			type,
			pem:
				type === "private"
					? (keyObject.export({ type: "pkcs8", format: "pem" }) as string)
					: (keyObject.export({ type: "spki", format: "pem" }) as string),
			asymmetricKeyType: keyObject.asymmetricKeyType,
			asymmetricKeyDetails: sanitizeJsonValue(keyObject.asymmetricKeyDetails),
		},
	};
}

function deserializeCryptoKeyObject(key: BridgeCryptoKeyData): KeyObject {
	if (key.type === "secret") {
		return createSecretKey(decodeBridgeBuffer(key._raw));
	}

	return key.type === "private"
		? createPrivateKey(key._pem ?? "")
		: createPublicKey(key._pem ?? "");
}

function normalizeHmacLength(hashName: string, explicitLength?: unknown): number {
	if (typeof explicitLength === "number") {
		return explicitLength;
	}

	switch (hashName) {
		case "SHA-1":
		case "SHA-256":
			return 512;
		case "SHA-384":
		case "SHA-512":
			return 1024;
		default:
			return 512;
	}
}

function sliceDerivedBits(secret: Buffer, length: unknown): Buffer {
	if (length === undefined || length === null) {
		return Buffer.from(secret);
	}

	const requestedBits = Number(length);
	const maxBits = secret.byteLength * 8;
	if (requestedBits > maxBits) {
		throw new Error("derived bit length is too small");
	}

	const requestedBytes = Math.ceil(requestedBits / 8);
	const derived = Buffer.from(secret.subarray(0, requestedBytes));
	const remainder = requestedBits % 8;
	if (remainder !== 0 && derived.length > 0) {
		derived[derived.length - 1] &= 0xff << (8 - remainder);
	}
	return derived;
}

function deriveSecretKeyData(
	derivedKeyAlgorithm: Record<string, unknown> | string,
	extractable: boolean,
	usages: string[],
	secret: Buffer,
): BridgeCryptoKeyData {
	const normalizedAlgorithm =
		typeof derivedKeyAlgorithm === "string"
			? { name: derivedKeyAlgorithm }
			: derivedKeyAlgorithm;
	const algorithmName = String(normalizedAlgorithm.name ?? "");
	if (algorithmName === "HMAC") {
		const hashName =
			typeof normalizedAlgorithm.hash === "string"
				? normalizedAlgorithm.hash
				: String((normalizedAlgorithm.hash as { name?: string } | undefined)?.name ?? "");
		const lengthBits = normalizeHmacLength(hashName, normalizedAlgorithm.length);
		const keyBytes = Buffer.from(secret.subarray(0, Math.ceil(lengthBits / 8)));
		return serializeCryptoKeyDataFromKeyObject(
			createSecretKey(keyBytes),
			"secret",
			{
				name: "HMAC",
				hash: { name: hashName },
				length: lengthBits,
			},
			extractable,
			usages,
		);
	}

	const lengthBits = Number(normalizedAlgorithm.length ?? secret.byteLength * 8);
	const keyBytes = Buffer.from(secret.subarray(0, Math.ceil(lengthBits / 8)));
	return serializeCryptoKeyDataFromKeyObject(
		createSecretKey(keyBytes),
		"secret",
		{
			...normalizedAlgorithm,
			length: lengthBits,
		},
		extractable,
		usages,
	);
}

function resolveDerivedKeyLengthBits(
	derivedKeyAlgorithm: Record<string, unknown> | string,
	fallbackBits: number,
): number {
	const normalizedAlgorithm =
		typeof derivedKeyAlgorithm === "string"
			? { name: derivedKeyAlgorithm }
			: derivedKeyAlgorithm;
	if (typeof normalizedAlgorithm.length === "number") {
		return normalizedAlgorithm.length;
	}
	if (normalizedAlgorithm.name === "HMAC") {
		const hashName =
			typeof normalizedAlgorithm.hash === "string"
				? normalizedAlgorithm.hash
				: String((normalizedAlgorithm.hash as { name?: string } | undefined)?.name ?? "");
		return normalizeHmacLength(hashName);
	}
	return fallbackBits;
}

/**
 * Build crypto bridge handlers.
 *
 * All handler functions are plain functions (no ivm.Reference wrapping).
 * The V8 runtime registers these by name on the V8 global.
 * Call dispose() when the execution ends to clear stateful cipher sessions.
 */
export function buildCryptoBridgeHandlers(): CryptoBridgeResult {
	const handlers: BridgeHandlers = {};
	const K = HOST_BRIDGE_GLOBAL_KEYS;

	// Stateful cipher sessions — tracks cipher/decipher instances between
	// create/update/final bridge calls (needed for ssh2 streaming AES-GCM).
	const cipherSessions = new Map<number, CipherSession>();
	let nextCipherSessionId = 1;
	const diffieHellmanSessions = new Map<number, DiffieHellmanSession>();
	let nextDiffieHellmanSessionId = 1;

	// Secure randomness — cap matches Web Crypto API spec (65536 bytes).
	handlers[K.cryptoRandomFill] = (byteLength: unknown) => {
		const len = Number(byteLength);
		if (len > 65536) {
			throw new RangeError(
				`The ArrayBufferView's byte length (${len}) exceeds the number of bytes of entropy available via this API (65536)`,
			);
		}
		const buffer = Buffer.allocUnsafe(len);
		randomFillSync(buffer);
		return buffer.toString("base64");
	};
	handlers[K.cryptoRandomUuid] = () => randomUUID();

	// createHash — guest accumulates update() data, sends base64 to host for digest.
	handlers[K.cryptoHashDigest] = (algorithm: unknown, dataBase64: unknown) => {
		const data = Buffer.from(String(dataBase64), "base64");
		const hash = createHash(String(algorithm));
		hash.update(data);
		return hash.digest("base64");
	};

	// createHmac — guest accumulates update() data, sends base64 to host for HMAC digest.
	handlers[K.cryptoHmacDigest] = (algorithm: unknown, keyBase64: unknown, dataBase64: unknown) => {
		const key = Buffer.from(String(keyBase64), "base64");
		const data = Buffer.from(String(dataBase64), "base64");
		const hmac = createHmac(String(algorithm), key);
		hmac.update(data);
		return hmac.digest("base64");
	};

	// pbkdf2Sync — derive key from password + salt.
	handlers[K.cryptoPbkdf2] = (
		passwordBase64: unknown,
		saltBase64: unknown,
		iterations: unknown,
		keylen: unknown,
		digest: unknown,
	) => {
		const password = Buffer.from(String(passwordBase64), "base64");
		const salt = Buffer.from(String(saltBase64), "base64");
		return pbkdf2Sync(
			password,
			salt,
			Number(iterations),
			Number(keylen),
			String(digest),
		).toString("base64");
	};

	// scryptSync — derive key from password + salt with tunable cost params.
	handlers[K.cryptoScrypt] = (
		passwordBase64: unknown,
		saltBase64: unknown,
		keylen: unknown,
		optionsJson: unknown,
	) => {
		const password = Buffer.from(String(passwordBase64), "base64");
		const salt = Buffer.from(String(saltBase64), "base64");
		const options = JSON.parse(String(optionsJson));
		return scryptSync(password, salt, Number(keylen), options).toString(
			"base64",
		);
	};

	// createCipheriv — guest accumulates update() data, sends base64 to host for encryption.
	// Returns JSON with data (and authTag for GCM modes).
	handlers[K.cryptoCipheriv] = (
		algorithm: unknown,
		keyBase64: unknown,
		ivBase64: unknown,
		dataBase64: unknown,
	) => {
		const key = Buffer.from(String(keyBase64), "base64");
		const iv = Buffer.from(String(ivBase64), "base64");
		const data = Buffer.from(String(dataBase64), "base64");
		const cipher = createCipheriv(String(algorithm), key, iv) as any;
		const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
		const isGcm = String(algorithm).includes("-gcm");
		if (isGcm) {
			return JSON.stringify({
				data: encrypted.toString("base64"),
				authTag: cipher.getAuthTag().toString("base64"),
			});
		}
		return JSON.stringify({ data: encrypted.toString("base64") });
	};

	// createDecipheriv — guest accumulates update() data, sends base64 to host for decryption.
	// Accepts optionsJson with authTag for GCM modes.
	handlers[K.cryptoDecipheriv] = (
		algorithm: unknown,
		keyBase64: unknown,
		ivBase64: unknown,
		dataBase64: unknown,
		optionsJson: unknown,
	) => {
		const key = Buffer.from(String(keyBase64), "base64");
		const iv = Buffer.from(String(ivBase64), "base64");
		const data = Buffer.from(String(dataBase64), "base64");
		const options = JSON.parse(String(optionsJson));
		const decipher = createDecipheriv(String(algorithm), key, iv) as any;
		const isGcm = String(algorithm).includes("-gcm");
		if (isGcm && options.authTag) {
			decipher.setAuthTag(Buffer.from(options.authTag, "base64"));
		}
		return Buffer.concat([decipher.update(data), decipher.final()]).toString(
			"base64",
		);
	};

	// Stateful cipheriv create — opens a cipher or decipher session on the host.
	// mode: "cipher" | "decipher"; returns sessionId.
	handlers[K.cryptoCipherivCreate] = (
		mode: unknown,
		algorithm: unknown,
		keyBase64: unknown,
		ivBase64: unknown,
		optionsJson: unknown,
	) => {
		const algo = String(algorithm);
		const key = Buffer.from(String(keyBase64), "base64");
		const iv = Buffer.from(String(ivBase64), "base64");
		const options = optionsJson ? JSON.parse(String(optionsJson)) : {};
		const isGcm = algo.includes("-gcm");

		let instance: Cipher | Decipher;
		if (String(mode) === "decipher") {
			const d = createDecipheriv(algo, key, iv) as any;
			if (isGcm && options.authTag) {
				d.setAuthTag(Buffer.from(options.authTag, "base64"));
			}
			instance = d;
		} else {
			instance = createCipheriv(algo, key, iv) as any;
		}

		const sessionId = nextCipherSessionId++;
		cipherSessions.set(sessionId, { cipher: instance, algorithm: algo });
		return sessionId;
	};

	// Stateful cipheriv update — feeds data into an open session, returns partial result.
	handlers[K.cryptoCipherivUpdate] = (
		sessionId: unknown,
		dataBase64: unknown,
	) => {
		const id = Number(sessionId);
		const session = cipherSessions.get(id);
		if (!session) throw new Error(`Cipher session ${id} not found`);
		const data = Buffer.from(String(dataBase64), "base64");
		const result = session.cipher.update(data);
		return result.toString("base64");
	};

	// Stateful cipheriv final — finalizes session, returns last block + authTag for GCM.
	// Removes session from map.
	handlers[K.cryptoCipherivFinal] = (sessionId: unknown) => {
		const id = Number(sessionId);
		const session = cipherSessions.get(id);
		if (!session) throw new Error(`Cipher session ${id} not found`);
		cipherSessions.delete(id);
		const final = session.cipher.final();
		const isGcm = session.algorithm.includes("-gcm");
		if (isGcm) {
			const authTag = (session.cipher as any).getAuthTag?.();
			return JSON.stringify({
				data: final.toString("base64"),
				authTag: authTag ? authTag.toString("base64") : undefined,
			});
		}
		return JSON.stringify({ data: final.toString("base64") });
	};

	// sign — host signs data with a PEM private key.
	handlers[K.cryptoSign] = (
		algorithm: unknown,
		dataBase64: unknown,
		keyJson: unknown,
	) => {
		const data = Buffer.from(String(dataBase64), "base64");
		const key = deserializeBridgeValue(JSON.parse(String(keyJson)) as SerializedBridgeValue) as any;
		const signature = sign(normalizeBridgeAlgorithm(algorithm), data, key);
		return signature.toString("base64");
	};

	// verify — host verifies signature with a PEM public key.
	handlers[K.cryptoVerify] = (
		algorithm: unknown,
		dataBase64: unknown,
		keyJson: unknown,
		signatureBase64: unknown,
	) => {
		const data = Buffer.from(String(dataBase64), "base64");
		const key = deserializeBridgeValue(JSON.parse(String(keyJson)) as SerializedBridgeValue) as any;
		const signature = Buffer.from(String(signatureBase64), "base64");
		return verify(normalizeBridgeAlgorithm(algorithm), data, key, signature);
	};

	// Asymmetric encrypt/decrypt — use real Node crypto so DER inputs, encrypted
	// PEM options bags, and sandbox KeyObject handles all follow host semantics.
	handlers[K.cryptoAsymmetricOp] = (
		operation: unknown,
		keyJson: unknown,
		dataBase64: unknown,
	) => {
		const key = deserializeBridgeValue(JSON.parse(String(keyJson)) as SerializedBridgeValue) as any;
		const data = Buffer.from(String(dataBase64), "base64");
		switch (String(operation)) {
			case "publicEncrypt":
				return publicEncrypt(key, data).toString("base64");
			case "privateDecrypt":
				return privateDecrypt(key, data).toString("base64");
			case "privateEncrypt":
				return privateEncrypt(key, data).toString("base64");
			case "publicDecrypt":
				return publicDecrypt(key, data).toString("base64");
			default:
				throw new Error(`Unsupported asymmetric crypto operation: ${String(operation)}`);
		}
	};

	// createPublicKey/createPrivateKey — import through host crypto so metadata
	// like asymmetricKeyType/asymmetricKeyDetails survives reconstruction.
	handlers[K.cryptoCreateKeyObject] = (
		operation: unknown,
		keyJson: unknown,
	) => {
		const key = deserializeBridgeValue(JSON.parse(String(keyJson)) as SerializedBridgeValue) as any;
		switch (String(operation)) {
			case "createPrivateKey":
				return JSON.stringify(serializeAnyKeyObject(createPrivateKey(key)));
			case "createPublicKey":
				return JSON.stringify(serializeAnyKeyObject(createPublicKey(key)));
			default:
				throw new Error(`Unsupported key creation operation: ${String(operation)}`);
		}
	};

	// generateKeyPairSync — host generates key pair, preserving requested encodings.
	// For KeyObject output, serialize PEM + metadata so the isolate can recreate a
	// Node-compatible KeyObject surface.
	handlers[K.cryptoGenerateKeyPairSync] = (
		type: unknown,
		optionsJson: unknown,
	) => {
		const options = parseSerializedOptions(optionsJson);
		const encodingOptions = options as
			| {
					publicKeyEncoding?: unknown;
					privateKeyEncoding?: unknown;
			  }
			| undefined;
		const hasExplicitEncoding =
			encodingOptions &&
			(encodingOptions.publicKeyEncoding || encodingOptions.privateKeyEncoding);
		const { publicKey, privateKey } = generateKeyPairSync(type as any, options as any);

		if (hasExplicitEncoding) {
			return JSON.stringify({
				publicKey: serializeKeyValue(publicKey as unknown),
				privateKey: serializeKeyValue(privateKey as unknown),
			});
		}

		return JSON.stringify({
			publicKey: serializeSandboxKeyObject(publicKey as any),
			privateKey: serializeSandboxKeyObject(privateKey as any),
		});
	};

	// generateKeySync — host generates symmetric KeyObject values with native
	// validation so length/error semantics match Node.
	handlers[K.cryptoGenerateKeySync] = (
		type: unknown,
		optionsJson: unknown,
	) => {
		const options = parseSerializedOptions(optionsJson);
		return JSON.stringify(
			serializeAnyKeyObject(generateKeySync(type as any, options as any)),
		);
	};

	// generatePrimeSync — host generates prime material so bigint/add/rem options
	// follow Node semantics instead of polyfill approximations.
	handlers[K.cryptoGeneratePrimeSync] = (
		size: unknown,
		optionsJson: unknown,
	) => {
		const options = parseSerializedOptions(optionsJson);
		const prime =
			options === undefined
				? generatePrimeSync(size as any)
				: generatePrimeSync(size as any, options as any);
		return JSON.stringify(serializeBridgeValue(prime));
	};

	// Diffie-Hellman/ECDH — keep native host objects alive by session id so
	// sandbox calls preserve Node's return values, validation, and stateful key material.
	handlers[K.cryptoDiffieHellman] = (optionsJson: unknown) => {
		const options = deserializeBridgeValue(
			JSON.parse(String(optionsJson)) as SerializedBridgeValue,
		) as Parameters<typeof diffieHellman>[0];
		return JSON.stringify(
			serializeBridgeValue(diffieHellman(options)),
		);
	};

	handlers[K.cryptoDiffieHellmanGroup] = (name: unknown) => {
		const group = getDiffieHellman(String(name));
		return JSON.stringify({
			prime: serializeBridgeValue(group.getPrime()),
			generator: serializeBridgeValue(group.getGenerator()),
		});
	};

	handlers[K.cryptoDiffieHellmanSessionCreate] = (requestJson: unknown) => {
		const request = JSON.parse(String(requestJson)) as {
			type: "dh" | "group" | "ecdh";
			name?: string;
			args?: SerializedBridgeValue[];
		};
		const args = (request.args ?? []).map((value) =>
			deserializeBridgeValue(value),
		);

		let session: DiffieHellmanSession;
		switch (request.type) {
			case "dh":
				session = createDiffieHellman(...(args as Parameters<typeof createDiffieHellman>));
				break;
			case "group":
				session = getDiffieHellman(String(request.name));
				break;
			case "ecdh":
				session = createECDH(String(request.name));
				break;
			default:
				throw new Error(`Unsupported Diffie-Hellman session type: ${String((request as any).type)}`);
		}

		const sessionId = nextDiffieHellmanSessionId++;
		diffieHellmanSessions.set(sessionId, session);
		return sessionId;
	};

	handlers[K.cryptoDiffieHellmanSessionCall] = (
		sessionId: unknown,
		requestJson: unknown,
	) => {
		const session = diffieHellmanSessions.get(Number(sessionId));
		if (!session) {
			throw new Error(`Diffie-Hellman session ${String(sessionId)} not found`);
		}

		const request = JSON.parse(String(requestJson)) as {
			method: string;
			args?: SerializedBridgeValue[];
		};
		const args = (request.args ?? []).map((value) =>
			deserializeBridgeValue(value),
		);

		const sessionRecord = session as unknown as Record<string, unknown>;

		if (request.method === "verifyError") {
			return JSON.stringify({
				result: typeof sessionRecord.verifyError === "number" ? sessionRecord.verifyError : undefined,
				hasResult: typeof sessionRecord.verifyError === "number",
			});
		}

		const method = sessionRecord[request.method];
		if (typeof method !== "function") {
			throw new Error(`Unsupported Diffie-Hellman method: ${request.method}`);
		}

		const result = (method as (...callArgs: unknown[]) => unknown).apply(session, args);
		return JSON.stringify({
			result: result === undefined ? null : serializeBridgeValue(result),
			hasResult: result !== undefined,
		});
	};

	// crypto.subtle — single dispatcher for all Web Crypto API operations.
	// Guest-side SandboxSubtle serializes each call as JSON { op, ... }.
	handlers[K.cryptoSubtle] = (opJson: unknown) => {
		const req = JSON.parse(String(opJson));
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
					algoName === "AES-CTR" ||
					algoName === "AES-KW"
				) {
					const keyBytes = Buffer.allocUnsafe(req.algorithm.length / 8);
					randomFillSync(keyBytes);
					return JSON.stringify({
						key: serializeCryptoKeyDataFromKeyObject(
							createSecretKey(keyBytes),
							"secret",
							req.algorithm,
							req.extractable,
							req.usages,
						),
					});
				}
				if (algoName === "HMAC") {
					const hashName =
						typeof req.algorithm.hash === "string"
							? req.algorithm.hash
							: req.algorithm.hash.name;
					const len = normalizeHmacLength(hashName, req.algorithm.length) / 8;
					const keyBytes = Buffer.allocUnsafe(len);
					randomFillSync(keyBytes);
					return JSON.stringify({
						key: serializeCryptoKeyDataFromKeyObject(
							createSecretKey(keyBytes),
							"secret",
							{
								...req.algorithm,
								hash: { name: hashName },
								length: len * 8,
							},
							req.extractable,
							req.usages,
						),
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
					const publicKeyObject = createPublicKey(publicKey);
					const privateKeyObject = createPrivateKey(privateKey);
					return JSON.stringify({
						publicKey: serializeCryptoKeyDataFromKeyObject(
							publicKeyObject,
							"public",
							req.algorithm,
							req.extractable,
							req.usages.filter((u: string) =>
								["verify", "encrypt", "wrapKey"].includes(u),
							),
						),
						privateKey: serializeCryptoKeyDataFromKeyObject(
							privateKeyObject,
							"private",
							req.algorithm,
							req.extractable,
							req.usages.filter((u: string) =>
								["sign", "decrypt", "unwrapKey"].includes(u),
							),
						),
					});
				}
				if (algoName === "ECDSA" || algoName === "ECDH") {
					const { publicKey, privateKey } = generateKeyPairSync("ec", {
						namedCurve: String(req.algorithm.namedCurve),
						publicKeyEncoding: { type: "spki", format: "pem" },
						privateKeyEncoding: { type: "pkcs8", format: "pem" },
					});
					return JSON.stringify({
						publicKey: serializeCryptoKeyDataFromKeyObject(
							createPublicKey(publicKey),
							"public",
							{ ...req.algorithm, name: algoName },
							req.extractable,
							req.usages.filter((u: string) =>
								algoName === "ECDSA"
									? ["verify"].includes(u)
									: ["deriveBits", "deriveKey"].includes(u),
							),
						),
						privateKey: serializeCryptoKeyDataFromKeyObject(
							createPrivateKey(privateKey),
							"private",
							{ ...req.algorithm, name: algoName },
							req.extractable,
							req.usages.filter((u: string) =>
								algoName === "ECDSA"
									? ["sign"].includes(u)
									: ["deriveBits", "deriveKey"].includes(u),
							),
						),
					});
				}
				if (["Ed25519", "Ed448", "X25519", "X448"].includes(algoName)) {
					const keyPair =
						algoName === "Ed25519"
							? generateKeyPairSync("ed25519")
							: algoName === "Ed448"
								? generateKeyPairSync("ed448")
								: algoName === "X25519"
									? generateKeyPairSync("x25519")
									: generateKeyPairSync("x448");
					const { publicKey, privateKey } = keyPair;
					return JSON.stringify({
						publicKey: serializeCryptoKeyDataFromKeyObject(
							publicKey,
							"public",
							{ name: algoName },
							req.extractable,
							req.usages.filter((u: string) =>
								algoName.startsWith("Ed")
									? ["verify"].includes(u)
									: ["deriveBits", "deriveKey"].includes(u),
							),
						),
						privateKey: serializeCryptoKeyDataFromKeyObject(
							privateKey,
							"private",
							{ name: algoName },
							req.extractable,
							req.usages.filter((u: string) =>
								algoName.startsWith("Ed")
									? ["sign"].includes(u)
									: ["deriveBits", "deriveKey"].includes(u),
							),
						),
					});
				}
				throw new Error(`Unsupported key algorithm: ${algoName}`);
			}
			case "importKey": {
				const { format, keyData, algorithm, extractable, usages } = req;
				if (format === "raw") {
					return JSON.stringify({
						key: serializeCryptoKeyDataFromKeyObject(
							createSecretKey(Buffer.from(keyData, "base64")),
							"secret",
							algorithm.name === "HMAC" && !algorithm.length
								? {
										...algorithm,
										hash:
											typeof algorithm.hash === "string"
												? { name: algorithm.hash }
												: algorithm.hash,
										length: Buffer.from(keyData, "base64").byteLength * 8,
								  }
								: algorithm,
							extractable,
							usages,
						),
					});
				}
				if (format === "jwk") {
					const jwk =
						typeof keyData === "string" ? JSON.parse(keyData) : keyData;
					if (jwk.kty === "oct") {
						const raw = Buffer.from(jwk.k, "base64url");
						return JSON.stringify({
							key: serializeCryptoKeyDataFromKeyObject(
								createSecretKey(raw),
								"secret",
								algorithm,
								extractable,
								usages,
							),
						});
					}
					if (jwk.d) {
						const keyObj = createPrivateKey({ key: jwk, format: "jwk" });
						const pem = keyObj.export({
							type: "pkcs8",
							format: "pem",
						}) as string;
						return JSON.stringify({
							key: serializeCryptoKeyDataFromKeyObject(
								createPrivateKey(pem),
								"private",
								algorithm,
								extractable,
								usages,
							),
						});
					}
					const keyObj = createPublicKey({ key: jwk, format: "jwk" });
					const pem = keyObj.export({ type: "spki", format: "pem" }) as string;
					return JSON.stringify({
						key: serializeCryptoKeyDataFromKeyObject(
							createPublicKey(pem),
							"public",
							algorithm,
							extractable,
							usages,
						),
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
						key: serializeCryptoKeyDataFromKeyObject(
							createPrivateKey(pem),
							"private",
							algorithm,
							extractable,
							usages,
						),
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
						key: serializeCryptoKeyDataFromKeyObject(
							createPublicKey(pem),
							"public",
							algorithm,
							extractable,
							usages,
						),
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
				const { key, data, algorithm } = req;
				const dataBytes = Buffer.from(data, "base64");
				const algoName = key.algorithm.name;
				if (algoName === "HMAC") {
					const rawKey = Buffer.from(key._raw, "base64");
					const hashAlgo = normalizeHash(algorithm.hash ?? key.algorithm.hash);
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
				if (algoName === "RSA-PSS") {
					const hashAlgo = normalizeHash(key.algorithm.hash);
					return JSON.stringify({
						data: sign(hashAlgo, dataBytes, {
							key: createPrivateKey(key._pem),
							padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
							saltLength: algorithm.saltLength,
						}).toString("base64"),
					});
				}
				if (algoName === "ECDSA") {
					const hashAlgo = normalizeHash(algorithm.hash ?? key.algorithm.hash);
					return JSON.stringify({
						data: sign(hashAlgo, dataBytes, createPrivateKey(key._pem)).toString("base64"),
					});
				}
				if (algoName === "Ed25519" || algoName === "Ed448") {
					if (
						algoName === "Ed448" &&
						algorithm.context &&
						Buffer.from(algorithm.context, "base64").byteLength > 0
					) {
						throw new Error("Non zero-length context is not yet supported");
					}
					return JSON.stringify({
						data: sign(null, dataBytes, createPrivateKey(key._pem)).toString("base64"),
					});
				}
				throw new Error(`Unsupported sign algorithm: ${algoName}`);
			}
			case "verify": {
				const { key, signature, data, algorithm } = req;
				const dataBytes = Buffer.from(data, "base64");
				const sigBytes = Buffer.from(signature, "base64");
				const algoName = key.algorithm.name;
				if (algoName === "HMAC") {
					const rawKey = Buffer.from(key._raw, "base64");
					const hashAlgo = normalizeHash(algorithm.hash ?? key.algorithm.hash);
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
				if (algoName === "RSA-PSS") {
					const hashAlgo = normalizeHash(key.algorithm.hash);
					return JSON.stringify({
						result: verify(hashAlgo, dataBytes, {
							key: createPublicKey(key._pem),
							padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
							saltLength: algorithm.saltLength,
						}, sigBytes),
					});
				}
				if (algoName === "ECDSA") {
					const hashAlgo = normalizeHash(algorithm.hash ?? key.algorithm.hash);
					return JSON.stringify({
						result: verify(hashAlgo, dataBytes, createPublicKey(key._pem), sigBytes),
					});
				}
				if (algoName === "Ed25519" || algoName === "Ed448") {
					if (
						algoName === "Ed448" &&
						algorithm.context &&
						Buffer.from(algorithm.context, "base64").byteLength > 0
					) {
						throw new Error("Non zero-length context is not yet supported");
					}
					return JSON.stringify({
						result: verify(null, dataBytes, createPublicKey(key._pem), sigBytes),
					});
				}
				throw new Error(`Unsupported verify algorithm: ${algoName}`);
			}
			case "deriveBits": {
				const { algorithm, baseKey, length } = req;
				const algoName = algorithm.name;
				if (algoName === "PBKDF2") {
					const bitLength = Number(length);
					const byteLength = bitLength / 8;
					const password = Buffer.from(baseKey._raw, "base64");
					const salt = Buffer.from(algorithm.salt, "base64");
					const hash = normalizeHash(algorithm.hash);
					const derived = pbkdf2Sync(
						password,
						salt,
						algorithm.iterations,
						byteLength,
						hash,
					);
					return JSON.stringify({ data: derived.toString("base64") });
				}
				if (algoName === "HKDF") {
					const bitLength = Number(length);
					const byteLength = bitLength / 8;
					const ikm = Buffer.from(baseKey._raw, "base64");
					const salt = Buffer.from(algorithm.salt, "base64");
					const info = Buffer.from(algorithm.info, "base64");
					const hash = normalizeHash(algorithm.hash);
					const derived = Buffer.from(
						hkdfSync(hash, ikm, salt, info, byteLength),
					);
					return JSON.stringify({ data: derived.toString("base64") });
				}
				if (algoName === "ECDH" || algoName === "X25519" || algoName === "X448") {
					const secret = diffieHellman({
						privateKey: deserializeCryptoKeyObject(baseKey),
						publicKey: deserializeCryptoKeyObject(algorithm.public),
					});
					return JSON.stringify({
						data: sliceDerivedBits(secret, length).toString("base64"),
					});
				}
				throw new Error(`Unsupported deriveBits algorithm: ${algoName}`);
			}
			case "deriveKey": {
				const { algorithm, baseKey, derivedKeyAlgorithm, extractable, usages } = req;
				const algoName = algorithm.name;
				if (algoName === "PBKDF2") {
					const keyLengthBits = resolveDerivedKeyLengthBits(
						derivedKeyAlgorithm,
						Buffer.from(baseKey._raw, "base64").byteLength * 8,
					);
					const byteLength = keyLengthBits / 8;
					const password = Buffer.from(baseKey._raw, "base64");
					const salt = Buffer.from(algorithm.salt, "base64");
					const hash = normalizeHash(algorithm.hash);
					const derived = pbkdf2Sync(
						password,
						salt,
						algorithm.iterations,
						byteLength,
						hash,
					);
					return JSON.stringify({ key: deriveSecretKeyData(derivedKeyAlgorithm, extractable, usages, derived) });
				}
				if (algoName === "HKDF") {
					const keyLengthBits = resolveDerivedKeyLengthBits(
						derivedKeyAlgorithm,
						Buffer.from(baseKey._raw, "base64").byteLength * 8,
					);
					const byteLength = keyLengthBits / 8;
					const ikm = Buffer.from(baseKey._raw, "base64");
					const salt = Buffer.from(algorithm.salt, "base64");
					const info = Buffer.from(algorithm.info, "base64");
					const hash = normalizeHash(algorithm.hash);
					const derived = Buffer.from(
						hkdfSync(hash, ikm, salt, info, byteLength),
					);
					return JSON.stringify({ key: deriveSecretKeyData(derivedKeyAlgorithm, extractable, usages, derived) });
				}
				if (algoName === "ECDH" || algoName === "X25519" || algoName === "X448") {
					const secret = diffieHellman({
						privateKey: deserializeCryptoKeyObject(baseKey),
						publicKey: deserializeCryptoKeyObject(algorithm.public),
					});
					return JSON.stringify({
						key: deriveSecretKeyData(derivedKeyAlgorithm, extractable, usages, secret),
					});
				}
				throw new Error(`Unsupported deriveKey algorithm: ${algoName}`);
			}
			case "wrapKey": {
				const { format, key, wrappingKey, wrapAlgorithm } = req;
				const exported = JSON.parse(
					handlers[K.cryptoSubtle](
						JSON.stringify({
							op: "exportKey",
							format,
							key,
						}),
					) as string,
				) as { data?: string; jwk?: JsonWebKey };
				const keyData =
					format === "jwk"
						? Buffer.from(JSON.stringify(exported.jwk), "utf8")
						: decodeBridgeBuffer(exported.data);
				if (wrapAlgorithm.name === "AES-KW") {
					const wrappingBytes = decodeBridgeBuffer(wrappingKey._raw);
					const cipherName = `id-aes${wrappingBytes.byteLength * 8}-wrap`;
					const cipher = createCipheriv(
						cipherName as never,
						wrappingBytes,
						Buffer.alloc(8, 0xa6),
					);
					return JSON.stringify({
						data: Buffer.concat([cipher.update(keyData), cipher.final()]).toString("base64"),
					});
				}
				if (wrapAlgorithm.name === "RSA-OAEP") {
					return JSON.stringify({
						data: publicEncrypt(
							{
								key: createPublicKey(wrappingKey._pem),
								oaepHash: normalizeHash(wrappingKey.algorithm.hash),
								oaepLabel: wrapAlgorithm.label
									? decodeBridgeBuffer(wrapAlgorithm.label)
									: undefined,
							},
							keyData,
						).toString("base64"),
					});
				}
				if (
					wrapAlgorithm.name === "AES-CTR" ||
					wrapAlgorithm.name === "AES-CBC" ||
					wrapAlgorithm.name === "AES-GCM"
				) {
					const wrappingBytes = decodeBridgeBuffer(wrappingKey._raw);
					const algorithmName =
						wrapAlgorithm.name === "AES-CTR"
							? `aes-${wrappingBytes.byteLength * 8}-ctr`
							: wrapAlgorithm.name === "AES-CBC"
								? `aes-${wrappingBytes.byteLength * 8}-cbc`
								: `aes-${wrappingBytes.byteLength * 8}-gcm`;
					const iv =
						wrapAlgorithm.name === "AES-CTR"
							? decodeBridgeBuffer(wrapAlgorithm.counter)
							: decodeBridgeBuffer(wrapAlgorithm.iv);
					const cipher = createCipheriv(
						algorithmName as never,
						wrappingBytes,
						iv,
						wrapAlgorithm.name === "AES-GCM"
							? ({ authTagLength: (wrapAlgorithm.tagLength || 128) / 8 } as never)
							: undefined,
					) as Cipher & { setAAD?: (aad: Buffer) => void; getAuthTag?: () => Buffer };
					if (wrapAlgorithm.name === "AES-GCM" && wrapAlgorithm.additionalData) {
						cipher.setAAD?.(decodeBridgeBuffer(wrapAlgorithm.additionalData));
					}
					const encrypted = Buffer.concat([cipher.update(keyData), cipher.final()]);
					const payload =
						wrapAlgorithm.name === "AES-GCM"
							? Buffer.concat([encrypted, cipher.getAuthTag?.() ?? Buffer.alloc(0)])
							: encrypted;
					return JSON.stringify({ data: payload.toString("base64") });
				}
				throw new Error(`Unsupported wrap algorithm: ${wrapAlgorithm.name}`);
			}
			case "unwrapKey": {
				const {
					format,
					wrappedKey,
					unwrappingKey,
					unwrapAlgorithm,
					unwrappedKeyAlgorithm,
					extractable,
					usages,
				} = req;
				let unwrapped: Buffer;
				if (unwrapAlgorithm.name === "AES-KW") {
					const unwrappingBytes = decodeBridgeBuffer(unwrappingKey._raw);
					const cipherName = `id-aes${unwrappingBytes.byteLength * 8}-wrap`;
					const decipher = createDecipheriv(
						cipherName as never,
						unwrappingBytes,
						Buffer.alloc(8, 0xa6),
					);
					unwrapped = Buffer.concat([
						decipher.update(decodeBridgeBuffer(wrappedKey)),
						decipher.final(),
					]);
				} else if (unwrapAlgorithm.name === "RSA-OAEP") {
					unwrapped = privateDecrypt(
						{
							key: createPrivateKey(unwrappingKey._pem),
							oaepHash: normalizeHash(unwrappingKey.algorithm.hash),
							oaepLabel: unwrapAlgorithm.label
								? decodeBridgeBuffer(unwrapAlgorithm.label)
								: undefined,
						},
						decodeBridgeBuffer(wrappedKey),
					);
				} else if (
					unwrapAlgorithm.name === "AES-CTR" ||
					unwrapAlgorithm.name === "AES-CBC" ||
					unwrapAlgorithm.name === "AES-GCM"
				) {
					const unwrappingBytes = decodeBridgeBuffer(unwrappingKey._raw);
					const algorithmName =
						unwrapAlgorithm.name === "AES-CTR"
							? `aes-${unwrappingBytes.byteLength * 8}-ctr`
							: unwrapAlgorithm.name === "AES-CBC"
								? `aes-${unwrappingBytes.byteLength * 8}-cbc`
								: `aes-${unwrappingBytes.byteLength * 8}-gcm`;
					const iv =
						unwrapAlgorithm.name === "AES-CTR"
							? decodeBridgeBuffer(unwrapAlgorithm.counter)
							: decodeBridgeBuffer(unwrapAlgorithm.iv);
					const wrappedBytes = decodeBridgeBuffer(wrappedKey);
					const decipher = createDecipheriv(
						algorithmName as never,
						unwrappingBytes,
						iv,
						unwrapAlgorithm.name === "AES-GCM"
							? ({ authTagLength: (unwrapAlgorithm.tagLength || 128) / 8 } as never)
							: undefined,
					) as Decipher & {
						setAAD?: (aad: Buffer) => void;
						setAuthTag?: (tag: Buffer) => void;
					};
					let ciphertext = wrappedBytes;
					if (unwrapAlgorithm.name === "AES-GCM") {
						const tagLength = (unwrapAlgorithm.tagLength || 128) / 8;
						ciphertext = wrappedBytes.subarray(0, wrappedBytes.byteLength - tagLength);
						decipher.setAuthTag?.(wrappedBytes.subarray(wrappedBytes.byteLength - tagLength));
						if (unwrapAlgorithm.additionalData) {
							decipher.setAAD?.(decodeBridgeBuffer(unwrapAlgorithm.additionalData));
						}
					}
					unwrapped = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
				} else {
					throw new Error(`Unsupported unwrap algorithm: ${unwrapAlgorithm.name}`);
				}
				return handlers[K.cryptoSubtle](
					JSON.stringify({
						op: "importKey",
						format,
						keyData:
							format === "jwk"
								? JSON.parse(unwrapped.toString("utf8"))
								: unwrapped.toString("base64"),
						algorithm: unwrappedKeyAlgorithm,
						extractable,
						usages,
					}),
				);
			}
			default:
				throw new Error(`Unsupported subtle operation: ${req.op}`);
		}
	};

	const dispose = () => {
		cipherSessions.clear();
		diffieHellmanSessions.clear();
	};

	return { handlers, dispose };
}

/** Dependencies for building net socket bridge handlers. */
export interface NetSocketBridgeDeps {
	/** Dispatch a socket event back to the guest (socketId, event, data?). */
	dispatch: (socketId: number, event: string, data?: string) => void;
	/** Kernel socket table — when provided, routes through kernel instead of host TCP. */
	socketTable?: import("@secure-exec/core").SocketTable;
	/** Process ID for kernel socket ownership. Required when socketTable is set. */
	pid?: number;
}

/** Result of building net socket bridge handlers — includes dispose for cleanup. */
export interface NetSocketBridgeResult {
	handlers: BridgeHandlers;
	dispose: () => void;
}

/**
 * Build net socket bridge handlers.
 *
 * All TCP operations route through kernel sockets (loopback or external via
 * the host adapter).
 * Call dispose() when the execution ends to destroy all open sockets.
 */
export function buildNetworkSocketBridgeHandlers(
	deps: NetSocketBridgeDeps,
): NetSocketBridgeResult {
	const { socketTable, pid } = deps;
	if (!socketTable || pid === undefined) {
		throw new Error("buildNetworkSocketBridgeHandlers requires a kernel socketTable and pid");
	}
	return buildKernelSocketBridgeHandlers(deps.dispatch, socketTable, pid);
}

/**
 * Build bridge handlers that route net socket operations through the
 * kernel SocketTable. Data flows through kernel send/recv, connections
 * route through loopback (paired sockets) or external (host adapter).
 */
function buildKernelSocketBridgeHandlers(
	dispatch: NetSocketBridgeDeps["dispatch"],
	socketTable: import("@secure-exec/core").SocketTable,
	pid: number,
): NetSocketBridgeResult {
	const {
		AF_INET, SOCK_STREAM,
	} = require("@secure-exec/core") as typeof import("@secure-exec/core");
	const handlers: BridgeHandlers = {};
	const K = HOST_BRIDGE_GLOBAL_KEYS;

	// Track active kernel socket IDs for cleanup
	const activeSocketIds = new Set<number>();
	// Track TLS-upgraded sockets that bypass kernel recv (host-side TLS)
	const tlsSockets = new Map<number, net.Socket>();

	/** Background read pump: polls kernel recv() and dispatches data/end/close. */
	function startReadPump(socketId: number): void {
		const pump = async () => {
			try {
				while (activeSocketIds.has(socketId)) {
					// Try to read data
					let data: Uint8Array | null;
					try {
						data = socketTable.recv(socketId, 65536, 0);
					} catch {
						// Socket closed or error — stop pump
						break;
					}

					if (data !== null) {
						dispatch(socketId, "data", Buffer.from(data).toString("base64"));
						continue;
					}

					// No data — check if EOF
					const socket = socketTable.get(socketId);
					if (!socket) break;
					if (socket.state === "closed" || socket.state === "read-closed") {
						dispatch(socketId, "end");
						break;
					}
					if (socket.peerWriteClosed || (socket.peerId === undefined && !socket.external)) {
						dispatch(socketId, "end");
						break;
					}
					// For external sockets, check hostSocket EOF via readBuffer state
					if (socket.external && socket.readBuffer.length === 0 && socket.peerWriteClosed) {
						dispatch(socketId, "end");
						break;
					}

					// Wait for data to arrive
					const handle = socket.readWaiters.enqueue();
					await handle.wait();
				}
			} catch {
				// Socket destroyed during pump — expected
			}
			// Dispatch close if socket was active
			if (activeSocketIds.delete(socketId)) {
				dispatch(socketId, "close");
			}
		};
		pump();
	}

	// Connect — create kernel socket and start async connect + read pump
	handlers[K.netSocketConnectRaw] = (host: unknown, port: unknown) => {
		const socketId = socketTable.create(AF_INET, SOCK_STREAM, 0, pid);
		activeSocketIds.add(socketId);

		// Async connect — dispatch 'connect' on success, 'error' on failure
		socketTable.connect(socketId, { host: String(host), port: Number(port) })
			.then(() => {
				if (!activeSocketIds.has(socketId)) return;
				dispatch(socketId, "connect");
				startReadPump(socketId);
			})
			.catch((err: Error) => {
				if (!activeSocketIds.has(socketId)) return;
				dispatch(socketId, "error", err.message);
				activeSocketIds.delete(socketId);
				dispatch(socketId, "close");
			});

		return socketId;
	};

	// Write — send data through kernel socket
	handlers[K.netSocketWriteRaw] = (
		socketId: unknown,
		dataBase64: unknown,
	) => {
		const id = Number(socketId);
		// TLS-upgraded sockets write directly to host TLS socket
		const tlsSocket = tlsSockets.get(id);
		if (tlsSocket) {
			tlsSocket.write(Buffer.from(String(dataBase64), "base64"));
			return;
		}
		const data = Buffer.from(String(dataBase64), "base64");
		socketTable.send(id, new Uint8Array(data), 0);
	};

	// End — half-close write side
	handlers[K.netSocketEndRaw] = (socketId: unknown) => {
		const id = Number(socketId);
		const tlsSocket = tlsSockets.get(id);
		if (tlsSocket) {
			tlsSocket.end();
			return;
		}
		try {
			socketTable.shutdown(id, "write");
		} catch {
			// Socket may already be closed
		}
	};

	// Destroy — close kernel socket
	handlers[K.netSocketDestroyRaw] = (socketId: unknown) => {
		const id = Number(socketId);
		const tlsSocket = tlsSockets.get(id);
		if (tlsSocket) {
			tlsSocket.destroy();
			tlsSockets.delete(id);
		}
		if (activeSocketIds.has(id)) {
			activeSocketIds.delete(id);
			try {
				socketTable.close(id, pid);
			} catch {
				// Already closed
			}
		}
	};

	// TLS upgrade — for external kernel sockets, unwrap the host socket
	// and wrap with TLS. Loopback sockets cannot be TLS-upgraded (no real TCP).
	handlers[K.netSocketUpgradeTlsRaw] = (
		socketId: unknown,
		optionsJson: unknown,
	) => {
		const id = Number(socketId);
		const socket = socketTable.get(id);
		if (!socket) throw new Error(`Socket ${id} not found for TLS upgrade`);

		// TLS only works for external sockets with a real host socket
		if (!socket.external || !socket.hostSocket) {
			throw new Error(`Socket ${id} cannot be TLS-upgraded (loopback socket)`);
		}

		const options = optionsJson ? JSON.parse(String(optionsJson)) : {};

		// Access the underlying net.Socket from the host adapter
		const hostSocket = socket.hostSocket as unknown as { socket?: net.Socket };
		const realSocket = (hostSocket as any).socket as net.Socket | undefined;
		if (!realSocket) {
			throw new Error(`Socket ${id} has no underlying TCP socket for TLS upgrade`);
		}

		// Detach the kernel read pump by clearing the host socket ref
		socket.hostSocket = undefined;

		const tlsSocket = tls.connect({
			socket: realSocket,
			rejectUnauthorized: options.rejectUnauthorized ?? false,
			servername: options.servername,
			...( options.minVersion ? { minVersion: options.minVersion } : {}),
			...( options.maxVersion ? { maxVersion: options.maxVersion } : {}),
		});

		// Track TLS socket for write/end/destroy bypass
		tlsSockets.set(id, tlsSocket as unknown as net.Socket);

		tlsSocket.on("secureConnect", () => dispatch(id, "secureConnect"));
		tlsSocket.on("data", (chunk: Buffer) =>
			dispatch(id, "data", chunk.toString("base64")),
		);
		tlsSocket.on("end", () => dispatch(id, "end"));
		tlsSocket.on("error", (err: Error) =>
			dispatch(id, "error", err.message),
		);
		tlsSocket.on("close", () => {
			tlsSockets.delete(id);
			activeSocketIds.delete(id);
			dispatch(id, "close");
		});
	};

	const dispose = () => {
		for (const id of activeSocketIds) {
			try { socketTable.close(id, pid); } catch { /* best effort */ }
		}
		activeSocketIds.clear();
		for (const socket of tlsSockets.values()) {
			socket.destroy();
		}
		tlsSockets.clear();
	};

	return { handlers, dispose };
}

/** Dependencies for building sync module resolution bridge handlers. */
export interface ModuleResolutionBridgeDeps {
	/** Translate sandbox path (e.g. /root/node_modules/...) to host path. */
	sandboxToHostPath: (sandboxPath: string) => string | null;
	/** Translate host path back to sandbox path. */
	hostToSandboxPath: (hostPath: string) => string;
}

/**
 * Convert ESM source to CJS-compatible code for require() loading.
 * Handles import declarations, export declarations, and re-exports.
 */
/** Strip // and /* comments from an export/import list string. */
function stripComments(s: string): string {
	return s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function convertEsmToCjs(source: string, filePath: string): string {
	if (!isESM(source, filePath)) return source;

	let code = source;

	// Remove const __filename/dirname declarations (already provided by CJS wrapper)
	code = code.replace(/^\s*(?:const|let|var)\s+__filename\s*=\s*[^;]+;?\s*$/gm, "// __filename provided by CJS wrapper");
	code = code.replace(/^\s*(?:const|let|var)\s+__dirname\s*=\s*[^;]+;?\s*$/gm, "// __dirname provided by CJS wrapper");

	// import X from 'Y' → const X = require('Y')
	code = code.replace(
		/^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?/gm,
		"const $1 = (function(m) { return m && m.__esModule ? m.default : m; })(require('$2'));",
	);

	// import { a, b as c } from 'Y' → const { a, b: c } = require('Y')
	code = code.replace(
		/^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]\s*;?/gm,
		(_match, imports: string, mod: string) => {
			const mapped = stripComments(imports).split(",").map((s: string) => {
				const t = s.trim();
				if (!t) return null;
				const parts = t.split(/\s+as\s+/);
				return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : t;
			}).filter(Boolean).join(", ");
			return `const { ${mapped} } = require('${mod}');`;
		},
	);

	// import * as X from 'Y' → const X = require('Y')
	code = code.replace(
		/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?/gm,
		"const $1 = require('$2');",
	);

	// Side-effect imports: import 'Y' → require('Y')
	code = code.replace(
		/^\s*import\s+['"]([^'"]+)['"]\s*;?/gm,
		"require('$1');",
	);

	// export { a, b } from 'Y' → re-export
	code = code.replace(
		/^\s*export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]\s*;?/gm,
		(_match, exports: string, mod: string) => {
			return stripComments(exports).split(",").map((s: string) => {
				const t = s.trim();
				if (!t) return "";
				const parts = t.split(/\s+as\s+/);
				const local = parts[0].trim();
				const exported = parts.length === 2 ? parts[1].trim() : local;
				return `Object.defineProperty(exports, '${exported}', { get: () => require('${mod}').${local}, enumerable: true });`;
			}).filter(Boolean).join("\n");
		},
	);

	// export * from 'Y'
	code = code.replace(
		/^\s*export\s+\*\s+from\s+['"]([^'"]+)['"]\s*;?/gm,
		"Object.assign(exports, require('$1'));",
	);

	// export default X → module.exports.default = X
	code = code.replace(
		/^\s*export\s+default\s+/gm,
		"module.exports.default = ",
	);

	// export const/let/var X = ... → const/let/var X = ...; exports.X = X;
	code = code.replace(
		/^\s*export\s+(const|let|var)\s+(\w+)\s*=/gm,
		"$1 $2 =",
	);
	// Capture the names separately to add exports at the end
	const exportedVars: string[] = [];
	for (const m of source.matchAll(/^\s*export\s+(?:const|let|var)\s+(\w+)\s*=/gm)) {
		exportedVars.push(m[1]);
	}

	// export function X(...) → function X(...); exports.X = X;
	code = code.replace(
		/^\s*export\s+function\s+(\w+)/gm,
		"function $1",
	);
	for (const m of source.matchAll(/^\s*export\s+function\s+(\w+)/gm)) {
		exportedVars.push(m[1]);
	}

	// export class X → class X; exports.X = X;
	code = code.replace(
		/^\s*export\s+class\s+(\w+)/gm,
		"class $1",
	);
	for (const m of source.matchAll(/^\s*export\s+class\s+(\w+)/gm)) {
		exportedVars.push(m[1]);
	}

	// export { a, b } (local re-export without from)
	code = code.replace(
		/^\s*export\s+\{([^}]+)\}\s*;?/gm,
		(_match, exports: string) => {
			return stripComments(exports).split(",").map((s: string) => {
				const t = s.trim();
				if (!t) return "";
				const parts = t.split(/\s+as\s+/);
				const local = parts[0].trim();
				const exported = parts.length === 2 ? parts[1].trim() : local;
				return `Object.defineProperty(exports, '${exported}', { get: () => ${local}, enumerable: true });`;
			}).filter(Boolean).join("\n");
		},
	);

	// Append named exports for exported vars/functions/classes
	if (exportedVars.length > 0) {
		const lines = exportedVars.map(
			(name) => `Object.defineProperty(exports, '${name}', { get: () => ${name}, enumerable: true });`,
		);
		code += "\n" + lines.join("\n");
	}

	return code;
}

/**
 * Resolve a package specifier by walking up directories and reading package.json exports.
 * Handles both root imports ('pkg') and subpath imports ('pkg/sub').
 */
function resolvePackageExport(
	req: string,
	startDir: string,
	mode: "require" | "import" = "require",
): string | null {
	// Split into package name and subpath
	const parts = req.startsWith("@") ? req.split("/") : [req.split("/")[0], ...req.split("/").slice(1)];
	const pkgName = req.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
	const subpath = req.startsWith("@")
		? (parts.length > 2 ? "./" + parts.slice(2).join("/") : ".")
		: (parts.length > 1 ? "./" + parts.slice(1).join("/") : ".");

	let cur = startDir;
	while (cur !== pathDirname(cur)) {
		const pkgJsonPath = pathJoin(cur, "node_modules", ...pkgName.split("/"), "package.json");
		if (existsSync(pkgJsonPath)) {
			const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
			let entry: string | undefined;
			if (pkg.exports) {
				const exportEntry = pkg.exports[subpath];
				if (typeof exportEntry === "string") entry = exportEntry;
				else if (exportEntry) {
					const conditionalEntry = exportEntry as {
						import?: string;
						require?: string;
						default?: string;
					};
					entry =
						mode === "import"
							? conditionalEntry.import ?? conditionalEntry.default ?? conditionalEntry.require
							: conditionalEntry.require ?? conditionalEntry.default ?? conditionalEntry.import;
				}
			}
			if (!entry && subpath === ".") entry = pkg.main;
			if (entry) return pathResolve(pathDirname(pkgJsonPath), entry);
		}
		cur = pathDirname(cur);
	}
	return null;
}

const hostRequire = createRequire(import.meta.url);

/**
 * Build sync module resolution bridge handlers.
 *
 * These use Node.js require.resolve() and readFileSync() directly,
 * avoiding the async VirtualFileSystem path. Needed because the async
 * applySyncPromise pattern can't nest inside synchronous bridge
 * callbacks (e.g. net socket data events that trigger require()).
 */
export function buildModuleResolutionBridgeHandlers(
	deps: ModuleResolutionBridgeDeps,
): BridgeHandlers {
	const handlers: BridgeHandlers = {};
	const K = HOST_BRIDGE_GLOBAL_KEYS;

	// Sync require.resolve — translates sandbox paths and uses Node.js resolution.
	// Falls back to realpath + manual package.json resolution for pnpm/ESM packages.
	handlers[K.resolveModuleSync] = (
		request: unknown,
		fromDir: unknown,
		requestedMode?: unknown,
	) => {
		const req = String(request);
		const resolveMode =
			requestedMode === "require" || requestedMode === "import"
				? requestedMode
				: "require";

		// Builtins don't need filesystem resolution
		const builtin = normalizeBuiltinSpecifier(req);
		if (builtin) return builtin;

		// Translate sandbox fromDir to host path for resolution context
		const sandboxDir = String(fromDir);
		const hostDir = deps.sandboxToHostPath(sandboxDir) ?? sandboxDir;
		const resolveFromExports = (dir: string) => {
			const resolved = resolvePackageExport(req, dir, resolveMode);
			return resolved ? deps.hostToSandboxPath(resolved) : null;
		};

		if (resolveMode === "import") {
			const resolved = resolveFromExports(hostDir);
			if (resolved) return resolved;
		}

		// Try require.resolve first
		try {
			const resolved = hostRequire.resolve(req, { paths: [hostDir] });
			return deps.hostToSandboxPath(resolved);
		} catch { /* CJS resolution failed */ }

		// Fallback: follow symlinks and try ESM-compatible resolution
		try {
			let realDir: string;
			try { realDir = realpathSync(hostDir); } catch { realDir = hostDir; }
			if (resolveMode === "import") {
				const resolved = resolveFromExports(realDir);
				if (resolved) return resolved;
			}
			// Try require.resolve from real path
			try {
				const resolved = hostRequire.resolve(req, { paths: [realDir] });
				return deps.hostToSandboxPath(resolved);
			} catch { /* ESM-only, manual resolution */ }
			// Manual package.json resolution for ESM packages
			const resolved = resolveFromExports(realDir);
			if (resolved) return resolved;
		} catch { /* fallback failed */ }
		return null;
	};

	// Sync file read — translates sandbox path and reads via readFileSync.
	// Transforms dynamic import() to __dynamicImport() and converts ESM to CJS
	// for npm packages so require() can load ESM-only dependencies.
	handlers[K.loadFileSync] = (filePath: unknown) => {
		const sandboxPath = String(filePath);
		const hostPath = deps.sandboxToHostPath(sandboxPath) ?? sandboxPath;

		try {
			let source = readFileSync(hostPath, "utf-8");
			source = convertEsmToCjs(source, hostPath);
			return transformDynamicImport(source);
		} catch {
			return null;
		}
	};

	return handlers;
}

// Env vars that could hijack child processes (library injection, node flags)
const DANGEROUS_ENV_KEYS = new Set([
	"LD_PRELOAD",
	"LD_LIBRARY_PATH",
	"NODE_OPTIONS",
	"DYLD_INSERT_LIBRARIES",
]);

/** Strip env vars that allow library injection or node flag smuggling. */
export function stripDangerousEnv(
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

export function emitConsoleEvent(
	onStdio: StdioHook | undefined,
	event: StdioEvent,
): void {
	if (!onStdio) return;
	try {
		onStdio(event);
	} catch {
		// Keep runtime execution deterministic even when host hooks fail.
	}
}

/** Dependencies for console bridge handlers. */
export interface ConsoleBridgeDeps {
	onStdio?: StdioHook;
	budgetState: BudgetState;
	maxOutputBytes?: number;
}

/** Build console/logging bridge handlers. */
export function buildConsoleBridgeHandlers(deps: ConsoleBridgeDeps): BridgeHandlers {
	const handlers: BridgeHandlers = {};
	const K = HOST_BRIDGE_GLOBAL_KEYS;

	handlers[K.log] = (msg: unknown) => {
		const str = String(msg);
		if (deps.maxOutputBytes !== undefined) {
			const bytes = Buffer.byteLength(str, "utf8");
			if (deps.budgetState.outputBytes + bytes > deps.maxOutputBytes) return;
			deps.budgetState.outputBytes += bytes;
		}
		emitConsoleEvent(deps.onStdio, { channel: "stdout", message: str });
	};

	handlers[K.error] = (msg: unknown) => {
		const str = String(msg);
		if (deps.maxOutputBytes !== undefined) {
			const bytes = Buffer.byteLength(str, "utf8");
			if (deps.budgetState.outputBytes + bytes > deps.maxOutputBytes) return;
			deps.budgetState.outputBytes += bytes;
		}
		emitConsoleEvent(deps.onStdio, { channel: "stderr", message: str });
	};

	return handlers;
}

/** Dependencies for module loading bridge handlers. */
export interface ModuleLoadingBridgeDeps {
	filesystem: VirtualFileSystem;
	resolutionCache: ResolutionCache;
	resolveMode?: "require" | "import";
	/** Convert sandbox path to host path for pnpm/symlink resolution fallback. */
	sandboxToHostPath?: (sandboxPath: string) => string | null;
}

/** Build module loading bridge handlers (loadPolyfill, resolveModule, loadFile). */
export function buildModuleLoadingBridgeHandlers(
	deps: ModuleLoadingBridgeDeps,
	/** Extra handlers to dispatch through _loadPolyfill for V8 runtime compatibility. */
	dispatchHandlers?: BridgeHandlers,
): BridgeHandlers {
	const handlers: BridgeHandlers = {};
	const K = HOST_BRIDGE_GLOBAL_KEYS;

	// Polyfill loading — also serves as bridge dispatch multiplexer.
	// The V8 runtime binary only registers a fixed set of bridge globals.
	// Newer handlers (crypto, net sockets, etc.) are dispatched through
	// _loadPolyfill with a "__bd:" prefix.
	handlers[K.loadPolyfill] = async (moduleName: unknown): Promise<string | null> => {
		const nameStr = String(moduleName);

		// Bridge dispatch: "__bd:methodName:base64args"
		if (nameStr.startsWith("__bd:") && dispatchHandlers) {
			const colonIdx = nameStr.indexOf(":", 5);
			const method = nameStr.substring(5, colonIdx > 0 ? colonIdx : undefined);
			const argsJson = colonIdx > 0 ? nameStr.substring(colonIdx + 1) : "[]";
			const handler = dispatchHandlers[method];
			if (!handler) return JSON.stringify({ __bd_error: `No handler: ${method}` });
			try {
				const args = restoreDispatchArgument(JSON.parse(argsJson));
				const result = await handler(...(Array.isArray(args) ? args : [args]));
				return JSON.stringify({ __bd_result: result });
			} catch (err) {
				return JSON.stringify({ __bd_error: serializeDispatchError(err) });
			}
		}

		const name = nameStr.replace(/^node:/, "");
		if (name === "fs" || name === "child_process" || name === "http" ||
			name === "https" || name === "http2" || name === "dns" ||
			name === "os" || name === "module") {
			return null;
		}
		if (!hasPolyfill(name)) return null;
		let code = polyfillCodeCache.get(name);
		if (!code) {
			code = await bundlePolyfill(name);
			polyfillCodeCache.set(name, code);
		}
		return code;
	};

	// Async module path resolution via VFS
	// V8 ESM module resolve sends the full file path as referrer, not a directory.
	// Extract dirname when the referrer looks like a file path.
	// Falls back to Node.js require.resolve() with realpath for pnpm compatibility.
	handlers[K.resolveModule] = async (
		request: unknown,
		fromDir: unknown,
		requestedMode?: unknown,
	): Promise<string | null> => {
		const req = String(request);
		const resolveMode =
			requestedMode === "require" || requestedMode === "import"
				? requestedMode
				: (deps.resolveMode ?? "require");
		const builtin = normalizeBuiltinSpecifier(req);
		if (builtin) return builtin;
		let dir = String(fromDir);
		if (/\.[cm]?[jt]sx?$/.test(dir)) {
			const lastSlash = dir.lastIndexOf("/");
			if (lastSlash > 0) dir = dir.slice(0, lastSlash);
		}
		const vfsResult = await resolveModule(
			req,
			dir,
			deps.filesystem,
			resolveMode,
			deps.resolutionCache,
		);
		if (vfsResult) return vfsResult;
		// Fallback: resolve through real host paths for pnpm symlink compatibility.
		const hostDir = deps.sandboxToHostPath?.(dir) ?? dir;
		try {
			let realDir: string;
			try { realDir = realpathSync(hostDir); } catch { realDir = hostDir; }
			if (resolveMode === "import") {
				const resolvedImport = resolvePackageExport(req, realDir, "import");
				if (resolvedImport) return resolvedImport;
			}
			// Try require.resolve (works for CJS packages)
			try {
				return hostRequire.resolve(req, { paths: [realDir] });
			} catch { /* ESM-only, try manual resolution */ }
			// Manual package.json resolution for ESM packages
			const resolved = resolvePackageExport(req, realDir, resolveMode);
			if (resolved) return resolved;
		} catch { /* resolution failed */ }
		return null;
	};

	// Dynamic import bridge — returns null to fall back to require() in the sandbox.
	// V8 ESM module mode handles static imports natively via module_resolve_callback;
	// this handler covers the __dynamicImport() path used in exec mode.
	handlers[K.dynamicImport] = async (): Promise<null> => null;

	// Async file read + dynamic import transform.
	// Also serves ESM wrappers for built-in modules (fs, path, etc.) when
	// used from V8's ES module system which calls _loadFile after _resolveModule.
	handlers[K.loadFile] = async (
		path: unknown,
		requestedMode?: unknown,
	): Promise<string | null> => {
		const p = String(path);
		const loadMode =
			requestedMode === "require" || requestedMode === "import"
				? requestedMode
				: (deps.resolveMode ?? "require");
		// Built-in module ESM wrappers (V8 module system resolves 'fs' then loads it)
		const bare = p.replace(/^node:/, "");
		const builtin = getStaticBuiltinWrapperSource(bare);
		if (builtin) return builtin;
		// Polyfill-backed builtins (crypto, zlib, etc.)
		if (hasPolyfill(bare)) {
			return createBuiltinESMWrapper(
				`globalThis._requireFrom(${JSON.stringify(bare)}, "/")`,
				getHostBuiltinNamedExports(bare),
			);
		}
		// Regular files load differently for CommonJS require() vs V8's ESM loader.
		let source = await loadFile(p, deps.filesystem);
		if (source === null) return null;
		if (loadMode === "require") {
			source = convertEsmToCjs(source, p);
		}
		return transformDynamicImport(source);
	};

	return handlers;
}

/** Dependencies for timer bridge handlers. */
export interface TimerBridgeDeps {
	budgetState: BudgetState;
	maxBridgeCalls?: number;
	activeHostTimers: Set<ReturnType<typeof setTimeout>>;
}

/** Build timer bridge handler. */
export function buildTimerBridgeHandlers(deps: TimerBridgeDeps): BridgeHandlers {
	const handlers: BridgeHandlers = {};
	const K = HOST_BRIDGE_GLOBAL_KEYS;

	handlers[K.scheduleTimer] = (delayMs: unknown) => {
		checkBridgeBudget(deps);
		return new Promise<void>((resolve) => {
			const id = globalThis.setTimeout(() => {
				deps.activeHostTimers.delete(id);
				resolve();
			}, Number(delayMs));
			deps.activeHostTimers.add(id);
		});
	};

	return handlers;
}

export interface KernelTimerDispatchDeps {
	timerTable: import("@secure-exec/core").TimerTable;
	pid: number;
	budgetState: BudgetState;
	maxBridgeCalls?: number;
	activeHostTimers: Set<ReturnType<typeof setTimeout>>;
	sendStreamEvent(eventType: string, payload: Uint8Array): void;
}

export function buildKernelTimerDispatchHandlers(
	deps: KernelTimerDispatchDeps,
): BridgeHandlers {
	const handlers: BridgeHandlers = {};

	handlers.kernelTimerCreate = (delayMs: unknown, repeat: unknown) => {
		checkBridgeBudget(deps);
		const normalizedDelay = Number(delayMs);
		return deps.timerTable.createTimer(
			deps.pid,
			Number.isFinite(normalizedDelay) && normalizedDelay > 0
				? Math.floor(normalizedDelay)
				: 0,
			Boolean(repeat),
			() => {},
		);
	};

	handlers.kernelTimerArm = (timerId: unknown) => {
		checkBridgeBudget(deps);
		const timer = deps.timerTable.get(Number(timerId));
		if (!timer || timer.pid !== deps.pid || timer.cleared) {
			return;
		}

		const dispatchFire = () => {
			const activeTimer = deps.timerTable.get(timer.id);
			if (!activeTimer || activeTimer.pid !== deps.pid || activeTimer.cleared) {
				return;
			}

			activeTimer.hostHandle = undefined;
			if (!activeTimer.repeat) {
				deps.timerTable.clearTimer(activeTimer.id, deps.pid);
			}
			deps.sendStreamEvent(
				"timer",
				Buffer.from(JSON.stringify({ timerId: activeTimer.id })),
			);
		};

		if (timer.delayMs <= 0) {
			queueMicrotask(dispatchFire);
			return;
		}

		const hostHandle = globalThis.setTimeout(() => {
			deps.activeHostTimers.delete(hostHandle);
			dispatchFire();
		}, timer.delayMs);

		timer.hostHandle = hostHandle;
		deps.activeHostTimers.add(hostHandle);
	};

	handlers.kernelTimerClear = (timerId: unknown) => {
		checkBridgeBudget(deps);
		const timer = deps.timerTable.get(Number(timerId));
		if (!timer || timer.pid !== deps.pid) return;

		if (timer.hostHandle !== undefined) {
			clearTimeout(timer.hostHandle as ReturnType<typeof setTimeout>);
			deps.activeHostTimers.delete(
				timer.hostHandle as ReturnType<typeof setTimeout>,
			);
			timer.hostHandle = undefined;
		}
		deps.timerTable.clearTimer(timer.id, deps.pid);
	};

	return handlers;
}

export interface KernelHandleDispatchDeps {
	processTable?: import("@secure-exec/core").ProcessTable;
	pid: number;
	budgetState: BudgetState;
	maxBridgeCalls?: number;
}

export function buildKernelHandleDispatchHandlers(
	deps: KernelHandleDispatchDeps,
): BridgeHandlers {
	const handlers: BridgeHandlers = {};

	handlers.kernelHandleRegister = (id: unknown, description: unknown) => {
		checkBridgeBudget(deps);
		if (!deps.processTable) return;

		const handleId = String(id);
		let activeHandles: Map<string, string>;
		try {
			activeHandles = deps.processTable.getHandles(deps.pid);
		} catch {
			return;
		}
		if (activeHandles.has(handleId)) {
			try {
				deps.processTable.unregisterHandle(deps.pid, handleId);
			} catch {
				// Process exit races turn re-register into a no-op.
			}
		}
		deps.processTable.registerHandle(deps.pid, handleId, String(description));
	};

	handlers.kernelHandleUnregister = (id: unknown) => {
		checkBridgeBudget(deps);
		if (!deps.processTable) return 0;

		try {
			deps.processTable.unregisterHandle(deps.pid, String(id));
		} catch {
			// Unknown handles already behave like a no-op at the bridge layer.
		}
		try {
			return deps.processTable.getHandles(deps.pid).size;
		} catch {
			return 0;
		}
	};

	handlers.kernelHandleList = () => {
		checkBridgeBudget(deps);
		if (!deps.processTable) return [];
		try {
			return Array.from(deps.processTable.getHandles(deps.pid).entries());
		} catch {
			return [];
		}
	};

	return handlers;
}

/** Dependencies for filesystem bridge handlers. */
export interface FsBridgeDeps {
	filesystem: VirtualFileSystem;
	budgetState: BudgetState;
	maxBridgeCalls?: number;
	bridgeBase64TransferLimitBytes: number;
	isolateJsonPayloadLimitBytes: number;
}

/** Build filesystem bridge handlers (readFile, writeFile, stat, etc.). */
export function buildFsBridgeHandlers(deps: FsBridgeDeps): BridgeHandlers {
	const handlers: BridgeHandlers = {};
	const K = HOST_BRIDGE_GLOBAL_KEYS;
	const fs = deps.filesystem;
	const base64Limit = deps.bridgeBase64TransferLimitBytes;
	const jsonLimit = deps.isolateJsonPayloadLimitBytes;

	handlers[K.fsReadFile] = async (path: unknown) => {
		checkBridgeBudget(deps);
		const text = await fs.readTextFile(String(path));
		assertTextPayloadSize(`fs.readFile ${path}`, text, jsonLimit);
		return text;
	};

	handlers[K.fsWriteFile] = async (path: unknown, content: unknown) => {
		checkBridgeBudget(deps);
		await fs.writeFile(String(path), String(content));
	};

	handlers[K.fsReadFileBinary] = async (path: unknown) => {
		checkBridgeBudget(deps);
		const data = await fs.readFile(String(path));
		assertPayloadByteLength(`fs.readFileBinary ${path}`, getBase64EncodedByteLength(data.byteLength), base64Limit);
		return Buffer.from(data).toString("base64");
	};

	handlers[K.fsWriteFileBinary] = async (path: unknown, base64Content: unknown) => {
		checkBridgeBudget(deps);
		const b64 = String(base64Content);
		assertTextPayloadSize(`fs.writeFileBinary ${path}`, b64, base64Limit);
		await fs.writeFile(String(path), Buffer.from(b64, "base64"));
	};

	handlers[K.fsReadDir] = async (path: unknown) => {
		checkBridgeBudget(deps);
		const entries = (await fs.readDirWithTypes(String(path))).filter(
			(entry) => entry.name !== "." && entry.name !== "..",
		);
		const json = JSON.stringify(entries);
		assertTextPayloadSize(`fs.readDir ${path}`, json, jsonLimit);
		return json;
	};

	handlers[K.fsMkdir] = async (path: unknown) => {
		checkBridgeBudget(deps);
		await mkdir(fs, String(path));
	};

	handlers[K.fsRmdir] = async (path: unknown) => {
		checkBridgeBudget(deps);
		await fs.removeDir(String(path));
	};

	handlers[K.fsExists] = async (path: unknown) => {
		checkBridgeBudget(deps);
		return fs.exists(String(path));
	};

	handlers[K.fsStat] = async (path: unknown) => {
		checkBridgeBudget(deps);
		const s = await fs.stat(String(path));
		return JSON.stringify({ mode: s.mode, size: s.size, isDirectory: s.isDirectory,
			atimeMs: s.atimeMs, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs, birthtimeMs: s.birthtimeMs });
	};

	handlers[K.fsUnlink] = async (path: unknown) => {
		checkBridgeBudget(deps);
		await fs.removeFile(String(path));
	};

	handlers[K.fsRename] = async (oldPath: unknown, newPath: unknown) => {
		checkBridgeBudget(deps);
		await fs.rename(String(oldPath), String(newPath));
	};

	handlers[K.fsChmod] = async (path: unknown, mode: unknown) => {
		checkBridgeBudget(deps);
		await fs.chmod(String(path), Number(mode));
	};

	handlers[K.fsChown] = async (path: unknown, uid: unknown, gid: unknown) => {
		checkBridgeBudget(deps);
		await fs.chown(String(path), Number(uid), Number(gid));
	};

	handlers[K.fsLink] = async (oldPath: unknown, newPath: unknown) => {
		checkBridgeBudget(deps);
		await fs.link(String(oldPath), String(newPath));
	};

	handlers[K.fsSymlink] = async (target: unknown, linkPath: unknown) => {
		checkBridgeBudget(deps);
		await fs.symlink(String(target), String(linkPath));
	};

	handlers[K.fsReadlink] = async (path: unknown) => {
		checkBridgeBudget(deps);
		return fs.readlink(String(path));
	};

	handlers[K.fsLstat] = async (path: unknown) => {
		checkBridgeBudget(deps);
		const s = await fs.lstat(String(path));
		return JSON.stringify({ mode: s.mode, size: s.size, isDirectory: s.isDirectory,
			isSymbolicLink: s.isSymbolicLink, atimeMs: s.atimeMs, mtimeMs: s.mtimeMs,
			ctimeMs: s.ctimeMs, birthtimeMs: s.birthtimeMs });
	};

	handlers[K.fsTruncate] = async (path: unknown, length: unknown) => {
		checkBridgeBudget(deps);
		await fs.truncate(String(path), Number(length));
	};

	handlers[K.fsUtimes] = async (path: unknown, atime: unknown, mtime: unknown) => {
		checkBridgeBudget(deps);
		await fs.utimes(String(path), Number(atime), Number(mtime));
	};

	return handlers;
}

/** Dependencies for child process bridge handlers. */
export interface ChildProcessBridgeDeps {
	commandExecutor: CommandExecutor;
	processConfig: ProcessConfig;
	budgetState: BudgetState;
	maxBridgeCalls?: number;
	maxChildProcesses?: number;
	isolateJsonPayloadLimitBytes: number;
	activeChildProcesses: Map<number, SpawnedProcess>;
	/** Push child process events into the V8 isolate. */
	sendStreamEvent: (eventType: string, payload: Uint8Array) => void;
	/** Kernel process table — when provided, child processes are registered for cross-runtime visibility. */
	processTable?: import("@secure-exec/core").ProcessTable;
	/** Parent process PID for kernel process table registration. */
	parentPid?: number;
}

/** Build child process bridge handlers. */
export function buildChildProcessBridgeHandlers(deps: ChildProcessBridgeDeps): BridgeHandlers {
	const handlers: BridgeHandlers = {};
	const K = HOST_BRIDGE_GLOBAL_KEYS;
	const jsonLimit = deps.isolateJsonPayloadLimitBytes;
	let nextSessionId = 1;
	const sessions = deps.activeChildProcesses;
	const { processTable, parentPid } = deps;

	// Map sessionId → kernel PID for kernel-registered processes
	const sessionToPid = new Map<number, number>();

	/** Wrap a SpawnedProcess as a kernel DriverProcess (adds callback stubs). */
	function wrapAsDriverProcess(proc: SpawnedProcess) {
		return {
			writeStdin: (data: Uint8Array) => proc.writeStdin(data),
			closeStdin: () => proc.closeStdin(),
			kill: (signal: number) => proc.kill(signal),
			wait: () => proc.wait(),
			onStdout: null as ((data: Uint8Array) => void) | null,
			onStderr: null as ((data: Uint8Array) => void) | null,
			onExit: null as ((code: number) => void) | null,
		};
	}

	// Serialize a child process event and push it into the V8 isolate
	const dispatchEvent = (sessionId: number, type: string, data?: Uint8Array | number) => {
		try {
			const payload = JSON.stringify({ sessionId, type, data: data instanceof Uint8Array ? Buffer.from(data).toString("base64") : data });
			deps.sendStreamEvent("childProcess", Buffer.from(payload));
		} catch {
			// Context may be disposed
		}
	};

	handlers[K.childProcessSpawnStart] = (command: unknown, argsJson: unknown, optionsJson: unknown): number => {
		checkBridgeBudget(deps);
		if (deps.maxChildProcesses !== undefined && deps.budgetState.childProcesses >= deps.maxChildProcesses) {
			throw new Error(`${RESOURCE_BUDGET_ERROR_CODE}: maximum child processes exceeded`);
		}
		deps.budgetState.childProcesses++;
		const args = parseJsonWithLimit<string[]>("child_process.spawn args", String(argsJson), jsonLimit);
		const options = parseJsonWithLimit<{ cwd?: string; env?: Record<string, string> }>(
			"child_process.spawn options", String(optionsJson), jsonLimit);
		const sessionId = nextSessionId++;
		const childEnv = stripDangerousEnv(options.env ?? deps.processConfig.env);

		const proc = deps.commandExecutor.spawn(String(command), args, {
			cwd: options.cwd,
			env: childEnv,
			onStdout: (data) => dispatchEvent(sessionId, "stdout", data),
			onStderr: (data) => dispatchEvent(sessionId, "stderr", data),
		});

		// Register with kernel process table for cross-runtime visibility
		if (processTable && parentPid !== undefined) {
			const childPid = processTable.allocatePid();
			processTable.register(childPid, "node", String(command), args, {
				pid: childPid,
				ppid: parentPid,
				env: childEnv ?? {},
				cwd: options.cwd ?? deps.processConfig.cwd ?? "/",
				fds: { stdin: 0, stdout: 1, stderr: 2 },
			}, wrapAsDriverProcess(proc));
			sessionToPid.set(sessionId, childPid);
		}

		proc.wait().then((code) => {
			// Mark exited in kernel process table
			const childPid = sessionToPid.get(sessionId);
			if (childPid !== undefined && processTable) {
				try { processTable.markExited(childPid, code); } catch { /* already exited */ }
				sessionToPid.delete(sessionId);
			}
			dispatchEvent(sessionId, "exit", code);
			sessions.delete(sessionId);
		});

		sessions.set(sessionId, proc);
		return sessionId;
	};

	handlers[K.childProcessStdinWrite] = (sessionId: unknown, data: unknown) => {
		const d = data instanceof Uint8Array ? data : Buffer.from(String(data), "base64");
		sessions.get(Number(sessionId))?.writeStdin(d);
	};

	handlers[K.childProcessStdinClose] = (sessionId: unknown) => {
		sessions.get(Number(sessionId))?.closeStdin();
	};

	handlers[K.childProcessKill] = (sessionId: unknown, signal: unknown) => {
		const id = Number(sessionId);
		// Route through kernel process table when available
		const childPid = sessionToPid.get(id);
		if (childPid !== undefined && processTable) {
			try { processTable.kill(childPid, Number(signal)); } catch { /* already dead */ }
			return;
		}
		sessions.get(id)?.kill(Number(signal));
	};

	handlers[K.childProcessSpawnSync] = async (command: unknown, argsJson: unknown, optionsJson: unknown): Promise<string> => {
		checkBridgeBudget(deps);
		if (deps.maxChildProcesses !== undefined && deps.budgetState.childProcesses >= deps.maxChildProcesses) {
			throw new Error(`${RESOURCE_BUDGET_ERROR_CODE}: maximum child processes exceeded`);
		}
		deps.budgetState.childProcesses++;
		const args = parseJsonWithLimit<string[]>("child_process.spawnSync args", String(argsJson), jsonLimit);
		const options = parseJsonWithLimit<{ cwd?: string; env?: Record<string, string>; maxBuffer?: number }>(
			"child_process.spawnSync options", String(optionsJson), jsonLimit);

		const maxBuffer = options.maxBuffer ?? 1024 * 1024;
		const stdoutChunks: Uint8Array[] = [];
		const stderrChunks: Uint8Array[] = [];
		let stdoutBytes = 0;
		let stderrBytes = 0;
		let maxBufferExceeded = false;

		const childEnv = stripDangerousEnv(options.env ?? deps.processConfig.env);

		const proc = deps.commandExecutor.spawn(String(command), args, {
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

		// Register sync child with kernel process table
		let syncChildPid: number | undefined;
		if (processTable && parentPid !== undefined) {
			syncChildPid = processTable.allocatePid();
			processTable.register(syncChildPid, "node", String(command), args, {
				pid: syncChildPid,
				ppid: parentPid,
				env: childEnv ?? {},
				cwd: options.cwd ?? deps.processConfig.cwd ?? "/",
				fds: { stdin: 0, stdout: 1, stderr: 2 },
			}, wrapAsDriverProcess(proc));
		}

		const exitCode = await proc.wait();

		// Mark exited in kernel
		if (syncChildPid !== undefined && processTable) {
			try { processTable.markExited(syncChildPid, exitCode); } catch { /* already exited */ }
		}

		const decoder = new TextDecoder();
		const stdout = stdoutChunks.map((c) => decoder.decode(c)).join("");
		const stderr = stderrChunks.map((c) => decoder.decode(c)).join("");
		return JSON.stringify({ stdout, stderr, code: exitCode, maxBufferExceeded });
	};

	return handlers;
}

/** Dependencies for network bridge handlers. */
export interface NetworkBridgeDeps {
	networkAdapter: NetworkAdapter;
	budgetState: BudgetState;
	maxBridgeCalls?: number;
	isolateJsonPayloadLimitBytes: number;
	activeHttpServerIds: Set<number>;
	activeHttpServerClosers: Map<number, () => Promise<void>>;
	pendingHttpServerStarts: { count: number };
	/** Push HTTP server/upgrade events into the V8 isolate. */
	sendStreamEvent: (eventType: string, payload: Uint8Array) => void;
	/** Kernel socket table for all bridge-managed HTTP server routing. */
	socketTable?: import("@secure-exec/core").SocketTable;
	/** Process ID for kernel socket ownership. */
	pid?: number;
}

/** Result of building network bridge handlers — includes dispose for cleanup. */
export interface NetworkBridgeResult {
	handlers: BridgeHandlers;
	dispose: () => Promise<void>;
}

/** Restrict HTTP server hostname to loopback interfaces. */
function normalizeLoopbackHostname(hostname?: string): string {
	if (!hostname || hostname === "localhost") return "127.0.0.1";
	if (hostname === "127.0.0.1" || hostname === "::1") return hostname;
	if (hostname === "0.0.0.0" || hostname === "::") return "127.0.0.1";
	throw new Error(
		`Sandbox HTTP servers are restricted to loopback interfaces. Received hostname: ${hostname}`,
	);
}

/** State for a kernel-routed HTTP server. */
interface KernelHttpServerState {
	listenSocketId: number;
	httpServer: http.Server;
	acceptLoopActive: boolean;
	closedPromise: Promise<void>;
	resolveClosed: () => void;
	pendingRequests: number;
	closeRequested: boolean;
	transportClosed: boolean;
}

function debugHttpBridge(...args: unknown[]): void {
	if (process.env.SECURE_EXEC_DEBUG_HTTP_BRIDGE === "1") {
		console.error("[secure-exec http bridge]", ...args);
	}
}

/**
 * Create a Duplex stream backed by a kernel socket.
 * Readable side reads from kernel socket readBuffer; writable side writes via send().
 */
function createKernelSocketDuplex(
	socketId: number,
	socketTable: import("@secure-exec/core").SocketTable,
	pid: number,
): Duplex {
	let readPumpStarted = false;

	const duplex = new Duplex({
		read() {
			if (readPumpStarted) return;
			readPumpStarted = true;
			runReadPump();
		},
		write(
			chunk: Buffer | string | Uint8Array,
			encoding: BufferEncoding,
			callback: (error?: Error | null) => void,
		) {
			try {
				const data = typeof chunk === "string"
					? Buffer.from(chunk, encoding)
					: Buffer.isBuffer(chunk)
						? chunk
						: Buffer.from(chunk);
				debugHttpBridge("socket write", socketId, data.length);
				socketTable.send(socketId, new Uint8Array(data), 0);
				callback();
			} catch (err) {
				debugHttpBridge("socket write error", socketId, err);
				callback(err instanceof Error ? err : new Error(String(err)));
			}
		},
		final(callback: (error?: Error | null) => void) {
			try { socketTable.shutdown(socketId, "write"); } catch { /* already closed */ }
			callback();
		},
		destroy(err: Error | null, callback: (error?: Error | null) => void) {
			try { socketTable.close(socketId, pid); } catch { /* already closed */ }
			callback(err);
		},
	});

	// Socket-like properties for Node http module
	(duplex as any).remoteAddress = "127.0.0.1";
	(duplex as any).remotePort = 0;
	(duplex as any).localAddress = "127.0.0.1";
	(duplex as any).localPort = 0;
	(duplex as any).encrypted = false;
	(duplex as any).setNoDelay = () => duplex;
	(duplex as any).setKeepAlive = () => duplex;
	(duplex as any).setTimeout = (ms: number, cb?: () => void) => {
		if (cb) duplex.once("timeout", cb);
		return duplex;
	};
	(duplex as any).ref = () => duplex;
	(duplex as any).unref = () => duplex;

	async function runReadPump(): Promise<void> {
		try {
			while (true) {
				let data: Uint8Array | null;
				try {
					data = socketTable.recv(socketId, 65536, 0);
				} catch {
					break; // socket closed or error
				}

				if (data !== null) {
					debugHttpBridge("socket read", socketId, data.length);
					if (!duplex.push(Buffer.from(data))) {
						// Backpressure — wait for drain before continuing
						readPumpStarted = false;
						return;
					}
					continue;
				}

				// Check for EOF
				const sock = socketTable.get(socketId);
				if (!sock) break;
				if (sock.state === "closed" || sock.state === "read-closed") break;
				if (sock.peerWriteClosed || (sock.peerId === undefined && !sock.external)) break;
				if (sock.external && sock.readBuffer.length === 0 && sock.peerWriteClosed) break;

				// Wait for data
				const handle = sock.readWaiters.enqueue();
				await handle.wait();
			}
		} catch {
			// Socket destroyed during pump
		}
		duplex.push(null); // EOF
	}

	return duplex;
}

/** Build network bridge handlers (fetch, httpRequest, dnsLookup, httpServer). */
export function buildNetworkBridgeHandlers(deps: NetworkBridgeDeps): NetworkBridgeResult {
	if (!deps.socketTable || deps.pid === undefined) {
		throw new Error("buildNetworkBridgeHandlers requires a kernel socketTable and pid");
	}

	const handlers: BridgeHandlers = {};
	const K = HOST_BRIDGE_GLOBAL_KEYS;
	const adapter = deps.networkAdapter;
	const jsonLimit = deps.isolateJsonPayloadLimitBytes;
	const ownedHttpServers = new Set<number>();
	const { socketTable, pid } = deps;

	// Track kernel HTTP servers for cleanup
	const kernelHttpServers = new Map<number, KernelHttpServerState>();
	const kernelUpgradeSockets = new Map<number, Duplex>();
	let nextKernelUpgradeSocketId = 1;
	const loopbackAwareAdapter = adapter as NetworkAdapter & {
		__setLoopbackPortChecker?: (checker: (hostname: string, port: number) => boolean) => void;
	};

	// Let host-side runtime.network.fetch/httpRequest reach only the HTTP
	// listeners owned by this execution.
	loopbackAwareAdapter.__setLoopbackPortChecker?.((_hostname, port) => {
		for (const state of kernelHttpServers.values()) {
			const socket = socketTable.get(state.listenSocketId);
			const localAddr = socket?.localAddr;
			if (localAddr && typeof localAddr === "object" && "port" in localAddr) {
				if (localAddr.port === port) {
					return true;
				}
			}
		}
		return false;
	});

	const registerKernelUpgradeSocket = (socket: Duplex): number => {
		const socketId = nextKernelUpgradeSocketId++;
		kernelUpgradeSockets.set(socketId, socket);

		socket.on("data", (chunk) => {
			deps.sendStreamEvent("upgradeSocketData", Buffer.from(JSON.stringify({
				socketId,
				dataBase64: Buffer.from(chunk).toString("base64"),
			})));
		});
		socket.on("end", () => {
			deps.sendStreamEvent("upgradeSocketEnd", Buffer.from(JSON.stringify({ socketId })));
		});
		socket.on("close", () => {
			kernelUpgradeSockets.delete(socketId);
		});

		return socketId;
	};

	const finalizeKernelServerClose = (serverId: number, state: KernelHttpServerState): void => {
		debugHttpBridge("finalize close check", serverId, state.closeRequested, state.pendingRequests);
		if (!state.closeRequested || state.pendingRequests > 0) {
			return;
		}
		if (!state.transportClosed) {
			state.acceptLoopActive = false;
			state.transportClosed = true;
			try { socketTable?.close(state.listenSocketId, pid!); } catch { /* already closed */ }
			try { state.httpServer.close(); } catch { /* parser server is never bound */ }
		}
		debugHttpBridge("finalize close", serverId);
		state.resolveClosed();
		kernelHttpServers.delete(serverId);
		ownedHttpServers.delete(serverId);
		deps.activeHttpServerIds.delete(serverId);
		deps.activeHttpServerClosers.delete(serverId);
	};

	const closeKernelServer = async (serverId: number): Promise<void> => {
		const state = kernelHttpServers.get(serverId);
		if (!state) return;
		debugHttpBridge("close requested", serverId, state.pendingRequests);
		state.closeRequested = true;
		finalizeKernelServerClose(serverId, state);
	};

	handlers[K.networkFetchRaw] = async (url: unknown, optionsJson: unknown): Promise<string> => {
		checkBridgeBudget(deps);
		const options = parseJsonWithLimit<{ method?: string; headers?: Record<string, string>; body?: string | null }>(
			"network.fetch options", String(optionsJson), jsonLimit);
		const result = await adapter.fetch(String(url), options);
		const json = JSON.stringify(result);
		assertTextPayloadSize("network.fetch response", json, jsonLimit);
		return json;
	};

	handlers[K.networkDnsLookupRaw] = async (hostname: unknown): Promise<string> => {
		checkBridgeBudget(deps);
		const result = await adapter.dnsLookup(String(hostname));
		return JSON.stringify(result);
	};

	handlers[K.networkHttpRequestRaw] = async (url: unknown, optionsJson: unknown): Promise<string> => {
		checkBridgeBudget(deps);
		const options = parseJsonWithLimit<{ method?: string; headers?: Record<string, string>; body?: string | null; rejectUnauthorized?: boolean }>(
			"network.httpRequest options", String(optionsJson), jsonLimit);
		const result = await adapter.httpRequest(String(url), options);
		const json = JSON.stringify(result);
		assertTextPayloadSize("network.httpRequest response", json, jsonLimit);
		return json;
	};

	handlers[K.networkHttpServerRespondRaw] = (
		serverId: unknown,
		requestId: unknown,
		responseJson: unknown,
	): void => {
		const numericServerId = Number(serverId);
		debugHttpBridge("respond callback", numericServerId, requestId);
		resolveHttpServerResponse({
			serverId: numericServerId,
			requestId: Number(requestId),
			responseJson: String(responseJson),
		});
		const state = kernelHttpServers.get(numericServerId);
		if (!state) {
			return;
		}
		state.pendingRequests = Math.max(0, state.pendingRequests - 1);
		finalizeKernelServerClose(numericServerId, state);
	};

	handlers[K.networkHttpServerWaitRaw] = async (serverId: unknown): Promise<void> => {
		const numericServerId = Number(serverId);
		debugHttpBridge("wait start", numericServerId);
		const state = kernelHttpServers.get(numericServerId);
		if (!state) {
			debugHttpBridge("wait missing", numericServerId);
			return;
		}
		await state.closedPromise;
		debugHttpBridge("wait resolved", numericServerId);
	};

	// HTTP server listen — always route through the kernel socket table
	handlers[K.networkHttpServerListenRaw] = (optionsJson: unknown): Promise<string> => {
		const options = parseJsonWithLimit<{ serverId: number; port?: number; hostname?: string }>(
			"network.httpServer.listen options", String(optionsJson), jsonLimit);
		deps.pendingHttpServerStarts.count += 1;

		return (async () => {
			try {
				const {
					AF_INET, SOCK_STREAM,
				} = require("@secure-exec/core") as typeof import("@secure-exec/core");

				const host = normalizeLoopbackHostname(options.hostname);
				debugHttpBridge("listen start", options.serverId, host, options.port ?? 0);
				const listenSocketId = socketTable.create(AF_INET, SOCK_STREAM, 0, pid);
				await socketTable.bind(listenSocketId, { host, port: options.port ?? 0 });
				await socketTable.listen(listenSocketId, 128, { external: true });

				// Get actual bound address (may differ for ephemeral port)
				const listenSocket = socketTable.get(listenSocketId);
				const addr = listenSocket?.localAddr as { host: string; port: number } | undefined;
				const address = addr ? {
					address: addr.host,
					family: addr.host.includes(":") ? "IPv6" : "IPv4",
					port: addr.port,
				} : null;

			// Create local HTTP server for parsing (not bound to any port)
			const httpServer = http.createServer(async (req, res) => {
				try {
					debugHttpBridge("request start", options.serverId, req.method, req.url);
					const chunks: Buffer[] = [];
					for await (const chunk of req) {
						chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
					}

					const headers: Record<string, string> = {};
					Object.entries(req.headers).forEach(([key, value]) => {
						if (typeof value === "string") headers[key] = value;
						else if (Array.isArray(value)) headers[key] = value[0] ?? "";
					});
					if (!headers.host && addr) {
						headers.host = `${addr.host}:${addr.port}`;
					}

					const requestJson = JSON.stringify({
						method: req.method || "GET",
						url: req.url || "/",
						headers,
						rawHeaders: req.rawHeaders || [],
						bodyBase64: chunks.length > 0
							? Buffer.concat(chunks).toString("base64")
							: undefined,
					});

					const requestId = nextHttpRequestId++;

					// Send request to sandbox and wait for response
					const responsePromise = new Promise<string>((resolve) => {
						registerPendingHttpResponse(options.serverId, requestId, resolve);
					});
					state.pendingRequests += 1;
					deps.sendStreamEvent("http_request", serialize({
						requestId,
						serverId: options.serverId,
						request: requestJson,
					}));
					const responseJson = await responsePromise;
					const response = parseJsonWithLimit<{
						status: number;
						headers?: Array<[string, string]>;
						body?: string;
						bodyEncoding?: "utf8" | "base64";
					}>("network.httpServer response", responseJson, jsonLimit);

					res.statusCode = response.status || 200;
					for (const [key, value] of response.headers || []) {
						res.setHeader(key, value);
					}

					if (response.body !== undefined) {
						if (response.bodyEncoding === "base64") {
							debugHttpBridge("response end", options.serverId, response.status, "base64", response.body.length);
							res.end(Buffer.from(response.body, "base64"));
						} else {
							debugHttpBridge("response end", options.serverId, response.status, "utf8", response.body.length);
							res.end(response.body);
						}
					} else {
						debugHttpBridge("response end", options.serverId, response.status, "empty", 0);
						res.end();
					}
				} catch {
					debugHttpBridge("request error", options.serverId, req.method, req.url);
					res.statusCode = 500;
					res.end("Internal Server Error");
				}
			});

			// Handle HTTP upgrades through kernel sockets
			httpServer.on("upgrade", (req, socket, head) => {
				const upgradeHeaders: Record<string, string> = {};
				Object.entries(req.headers).forEach(([key, value]) => {
					if (typeof value === "string") upgradeHeaders[key] = value;
					else if (Array.isArray(value)) upgradeHeaders[key] = value[0] ?? "";
				});
				const upgradeSocketId = registerKernelUpgradeSocket(socket as Duplex);
				deps.sendStreamEvent("httpServerUpgrade", Buffer.from(JSON.stringify({
					serverId: options.serverId,
					request: JSON.stringify({
						method: req.method || "GET",
						url: req.url || "/",
						headers: upgradeHeaders,
						rawHeaders: req.rawHeaders || [],
					}),
					head: head.toString("base64"),
					socketId: upgradeSocketId,
				})));
			});

				let resolveClosed!: () => void;
				const closedPromise = new Promise<void>((resolve) => {
					resolveClosed = resolve;
				});
				const state: KernelHttpServerState = {
					listenSocketId,
					httpServer,
					acceptLoopActive: true,
					closedPromise,
					resolveClosed,
					pendingRequests: 0,
					closeRequested: false,
					transportClosed: false,
				};
				debugHttpBridge("listen ready", options.serverId, address);
				kernelHttpServers.set(options.serverId, state);
				ownedHttpServers.add(options.serverId);
				deps.activeHttpServerIds.add(options.serverId);
				deps.activeHttpServerClosers.set(
					options.serverId,
					() => closeKernelServer(options.serverId),
				);

				// Start accept loop (fire-and-forget)
				void startKernelHttpAcceptLoop(state, socketTable, pid);

				return JSON.stringify({ address });
			} finally {
				deps.pendingHttpServerStarts.count -= 1;
			}
		})();
	};

	// HTTP server close — kernel-owned servers only
	handlers[K.networkHttpServerCloseRaw] = (serverId: unknown): Promise<void> => {
		const id = Number(serverId);
		debugHttpBridge("close bridge call", id);
		if (!ownedHttpServers.has(id)) {
			throw new Error(`Cannot close server ${id}: not owned by this execution context`);
		}

		const kernelState = kernelHttpServers.get(id);
		if (!kernelState) {
			throw new Error(`Cannot close server ${id}: kernel server state missing`);
		}
		return closeKernelServer(id);
	};

	handlers[K.upgradeSocketWriteRaw] = (
		socketId: unknown,
		dataBase64: unknown,
	) => {
		const id = Number(socketId);
		const socket = kernelUpgradeSockets.get(id);
		if (socket) {
			socket.write(Buffer.from(String(dataBase64), "base64"));
			return;
		}
		adapter.upgradeSocketWrite?.(id, String(dataBase64));
	};

	handlers[K.upgradeSocketEndRaw] = (socketId: unknown) => {
		const id = Number(socketId);
		const socket = kernelUpgradeSockets.get(id);
		if (socket) {
			socket.end();
			return;
		}
		adapter.upgradeSocketEnd?.(id);
	};

	handlers[K.upgradeSocketDestroyRaw] = (socketId: unknown) => {
		const id = Number(socketId);
		const socket = kernelUpgradeSockets.get(id);
		if (socket) {
			kernelUpgradeSockets.delete(id);
			socket.destroy();
			return;
		}
		adapter.upgradeSocketDestroy?.(id);
	};

	// Register upgrade socket callbacks for httpRequest client-side upgrades
	adapter.setUpgradeSocketCallbacks?.({
		onData: (socketId, dataBase64) => {
			deps.sendStreamEvent("upgradeSocketData", Buffer.from(JSON.stringify({ socketId, dataBase64 })));
		},
		onEnd: (socketId) => {
			deps.sendStreamEvent("upgradeSocketEnd", Buffer.from(JSON.stringify({ socketId })));
		},
	});

	// Dispose: close all kernel HTTP servers
	const dispose = async (): Promise<void> => {
		for (const serverId of Array.from(kernelHttpServers.keys())) {
			await closeKernelServer(serverId);
		}
		for (const socket of kernelUpgradeSockets.values()) {
			socket.destroy();
		}
		kernelUpgradeSockets.clear();
	};

	return { handlers, dispose };
}

/** Accept loop: dequeue connections from kernel listener and feed to http.Server. */
async function startKernelHttpAcceptLoop(
	state: KernelHttpServerState,
	socketTable: import("@secure-exec/core").SocketTable,
	pid: number,
): Promise<void> {
	try {
		while (state.acceptLoopActive) {
			const listenSocket = socketTable.get(state.listenSocketId);
			if (!listenSocket || listenSocket.state !== "listening") break;

			const acceptedId = socketTable.accept(state.listenSocketId);
			if (acceptedId !== null) {
				debugHttpBridge("accept backlog", state.listenSocketId, acceptedId);
				// Wrap kernel socket in Duplex and hand off to http.Server
				const duplex = createKernelSocketDuplex(acceptedId, socketTable, pid);
				state.httpServer.emit("connection", duplex);
				continue;
			}

			// Avoid a lost wake-up if a connection arrives between accept() and enqueue().
			const handle = listenSocket.acceptWaiters.enqueue();
			const acceptedAfterEnqueue = socketTable.accept(state.listenSocketId);
			if (acceptedAfterEnqueue !== null) {
				handle.wake();
				debugHttpBridge("accept after enqueue", state.listenSocketId, acceptedAfterEnqueue);
				const duplex = createKernelSocketDuplex(
					acceptedAfterEnqueue,
					socketTable,
					pid,
				);
				state.httpServer.emit("connection", duplex);
				continue;
			}

			// No pending connections — wait for accept waker
			await handle.wait();
		}
	} catch {
		// Listener closed — expected
	}
}

type PendingHttpResponse = {
	serverId: number;
	resolve: (response: string) => void;
};

// Track request IDs directly, but also keep per-server FIFO queues so older
// callbacks that only report serverId still resolve the correct pending waiters.
const pendingHttpResponses = new Map<number, PendingHttpResponse>();
const pendingHttpResponsesByServer = new Map<number, number[]>();
let nextHttpRequestId = 1;

function registerPendingHttpResponse(
	serverId: number,
	requestId: number,
	resolve: (response: string) => void,
): void {
	pendingHttpResponses.set(requestId, { serverId, resolve });
	const queue = pendingHttpResponsesByServer.get(serverId);
	if (queue) {
		queue.push(requestId);
	} else {
		pendingHttpResponsesByServer.set(serverId, [requestId]);
	}
}

function removePendingHttpResponse(serverId: number, requestId: number): PendingHttpResponse | undefined {
	const pending = pendingHttpResponses.get(requestId);
	if (!pending) return undefined;

	pendingHttpResponses.delete(requestId);

	const queue = pendingHttpResponsesByServer.get(serverId);
	if (queue) {
		const index = queue.indexOf(requestId);
		if (index !== -1) queue.splice(index, 1);
		if (queue.length === 0) pendingHttpResponsesByServer.delete(serverId);
	}

	return pending;
}

function takePendingHttpResponseByServer(serverId: number): PendingHttpResponse | undefined {
	const queue = pendingHttpResponsesByServer.get(serverId);
	if (!queue || queue.length === 0) return undefined;

	const requestId = queue.shift()!;
	if (queue.length === 0) pendingHttpResponsesByServer.delete(serverId);

	const pending = pendingHttpResponses.get(requestId);
	if (pending) {
		pendingHttpResponses.delete(requestId);
	}

	return pending;
}

/** Resolve a pending HTTP server response (called from stream callback handler). */
export function resolveHttpServerResponse(options: {
	requestId?: number;
	serverId?: number;
	responseJson: string;
}): void {
	const pending =
		options.requestId !== undefined
			? removePendingHttpResponse(
				options.serverId ?? pendingHttpResponses.get(options.requestId)?.serverId ?? -1,
				options.requestId,
			)
			: options.serverId !== undefined
				? takePendingHttpResponseByServer(options.serverId)
				: undefined;
	pending?.resolve(options.responseJson);
}

/** Dependencies for PTY bridge handlers. */
export interface PtyBridgeDeps {
	onPtySetRawMode?: (mode: boolean) => void;
	stdinIsTTY?: boolean;
}

/** Build PTY bridge handlers. */
export function buildPtyBridgeHandlers(deps: PtyBridgeDeps): BridgeHandlers {
	const handlers: BridgeHandlers = {};
	const K = HOST_BRIDGE_GLOBAL_KEYS;

	if (deps.stdinIsTTY && deps.onPtySetRawMode) {
		handlers[K.ptySetRawMode] = (mode: unknown) => {
			deps.onPtySetRawMode!(Boolean(mode));
		};
	}

	return handlers;
}

/** Dependencies for kernel FD table bridge handlers. */
export interface KernelFdBridgeDeps {
	filesystem: VirtualFileSystem;
	budgetState: BudgetState;
	maxBridgeCalls?: number;
}

/** Result of building kernel FD bridge handlers — includes dispose for cleanup. */
export interface KernelFdBridgeResult {
	handlers: BridgeHandlers;
	dispose: () => void;
}

const O_ACCMODE = 3;

function canRead(flags: number): boolean {
	const access = flags & O_ACCMODE;
	return access === O_RDONLY || access === O_RDWR;
}

function canWrite(flags: number): boolean {
	const access = flags & O_ACCMODE;
	return access === O_WRONLY || access === O_RDWR;
}

/**
 * Build kernel FD table bridge handlers.
 *
 * Creates a ProcessFDTable per execution and routes all FD operations
 * (open, close, read, write, fstat, ftruncate, fsync) through it.
 * The FD table tracks file descriptors, cursor positions, and flags.
 * Actual file I/O is delegated to the VirtualFileSystem.
 */
export function buildKernelFdBridgeHandlers(deps: KernelFdBridgeDeps): KernelFdBridgeResult {
	const handlers: BridgeHandlers = {};
	const K = HOST_BRIDGE_GLOBAL_KEYS;
	const vfs = deps.filesystem;

	// Create a per-execution FD table via the kernel FDTableManager
	const fdManager = new FDTableManager();
	const pid = 1;
	const fdTable = fdManager.create(pid);

	// fdOpen(path, flags, mode?) → fd number
	handlers[K.fdOpen] = async (path: unknown, flags: unknown, mode: unknown) => {
		checkBridgeBudget(deps);
		const pathStr = String(path);
		const numFlags = Number(flags);
		const numMode = mode !== undefined && mode !== null ? Number(mode) : undefined;

		const exists = await vfs.exists(pathStr);

		// O_CREAT: create if doesn't exist
		if ((numFlags & O_CREAT) && !exists) {
			await vfs.writeFile(pathStr, "");
		} else if (!exists && !(numFlags & O_CREAT)) {
			throw new Error(`ENOENT: no such file or directory, open '${pathStr}'`);
		}

		// O_TRUNC: truncate existing file
		if ((numFlags & O_TRUNC) && exists) {
			await vfs.writeFile(pathStr, "");
		}

		const fd = fdTable.open(pathStr, numFlags, FILETYPE_REGULAR_FILE);

		// Store creation mode for umask application
		if (numMode !== undefined && (numFlags & O_CREAT)) {
			const entry = fdTable.get(fd);
			if (entry) entry.description.creationMode = numMode;
		}

		return fd;
	};

	// fdClose(fd)
	handlers[K.fdClose] = (fd: unknown) => {
		const fdNum = Number(fd);
		const ok = fdTable.close(fdNum);
		if (!ok) throw new Error("EBADF: bad file descriptor, close");
	};

	// fdRead(fd, length, position?) → base64 data
	handlers[K.fdRead] = async (fd: unknown, length: unknown, position: unknown) => {
		checkBridgeBudget(deps);
		const fdNum = Number(fd);
		const len = Number(length);
		const entry = fdTable.get(fdNum);
		if (!entry) throw new Error("EBADF: bad file descriptor, read");
		if (!canRead(entry.description.flags)) throw new Error("EBADF: bad file descriptor, read");

		const pos = (position !== null && position !== undefined)
			? Number(position)
			: Number(entry.description.cursor);

		const data = await vfs.pread(entry.description.path, pos, len);

		// Update cursor only when no explicit position
		if (position === null || position === undefined) {
			entry.description.cursor += BigInt(data.length);
		}

		return Buffer.from(data).toString("base64");
	};

	// fdWrite(fd, base64data, position?) → bytes written
	handlers[K.fdWrite] = async (fd: unknown, base64data: unknown, position: unknown) => {
		checkBridgeBudget(deps);
		const fdNum = Number(fd);
		const entry = fdTable.get(fdNum);
		if (!entry) throw new Error("EBADF: bad file descriptor, write");
		if (!canWrite(entry.description.flags)) throw new Error("EBADF: bad file descriptor, write");

		const data = Buffer.from(String(base64data), "base64");

		// Read existing content
		let content: Uint8Array;
		try {
			content = await vfs.readFile(entry.description.path);
		} catch {
			content = new Uint8Array(0);
		}

		// Determine write position
		let writePos: number;
		if (entry.description.flags & O_APPEND) {
			writePos = content.length;
		} else if (position !== null && position !== undefined) {
			writePos = Number(position);
		} else {
			writePos = Number(entry.description.cursor);
		}

		// Splice data into content
		const endPos = writePos + data.length;
		const newContent = new Uint8Array(Math.max(content.length, endPos));
		newContent.set(content);
		newContent.set(data, writePos);
		await vfs.writeFile(entry.description.path, newContent);

		// Update cursor only when no explicit position
		if (position === null || position === undefined) {
			entry.description.cursor = BigInt(endPos);
		}

		return data.length;
	};

	// fdFstat(fd) → JSON stat string
	handlers[K.fdFstat] = async (fd: unknown) => {
		checkBridgeBudget(deps);
		const fdNum = Number(fd);
		const entry = fdTable.get(fdNum);
		if (!entry) throw new Error("EBADF: bad file descriptor, fstat");

		const stat = await vfs.stat(entry.description.path);
		return JSON.stringify({
			dev: 0,
			ino: stat.ino ?? 0,
			mode: stat.mode,
			nlink: stat.nlink ?? 1,
			uid: stat.uid ?? 0,
			gid: stat.gid ?? 0,
			rdev: 0,
			size: stat.size,
			blksize: 4096,
			blocks: Math.ceil(stat.size / 512),
			atimeMs: stat.atimeMs ?? Date.now(),
			mtimeMs: stat.mtimeMs ?? Date.now(),
			ctimeMs: stat.ctimeMs ?? Date.now(),
			birthtimeMs: stat.birthtimeMs ?? Date.now(),
		});
	};

	// fdFtruncate(fd, len?)
	handlers[K.fdFtruncate] = async (fd: unknown, len: unknown) => {
		checkBridgeBudget(deps);
		const fdNum = Number(fd);
		const entry = fdTable.get(fdNum);
		if (!entry) throw new Error("EBADF: bad file descriptor, ftruncate");

		const newLen = (len !== undefined && len !== null) ? Number(len) : 0;
		let content: Uint8Array;
		try {
			content = await vfs.readFile(entry.description.path);
		} catch {
			content = new Uint8Array(0);
		}

		if (content.length > newLen) {
			await vfs.writeFile(entry.description.path, content.slice(0, newLen));
		} else if (content.length < newLen) {
			const padded = new Uint8Array(newLen);
			padded.set(content);
			await vfs.writeFile(entry.description.path, padded);
		}
	};

	// fdFsync(fd) — no-op for in-memory VFS, validates FD exists
	handlers[K.fdFsync] = (fd: unknown) => {
		const fdNum = Number(fd);
		const entry = fdTable.get(fdNum);
		if (!entry) throw new Error("EBADF: bad file descriptor, fsync");
	};

	// fdGetPath(fd) → path string or null
	handlers[K.fdGetPath] = (fd: unknown) => {
		const fdNum = Number(fd);
		const entry = fdTable.get(fdNum);
		return entry ? entry.description.path : null;
	};

	return {
		handlers,
		dispose: () => {
			fdTable.closeAll();
		},
	};
}

export function createProcessConfigForExecution(
	processConfig: ProcessConfig,
	timingMitigation: string,
	frozenTimeMs: number,
): ProcessConfig {
	return {
		...processConfig,
		timingMitigation: timingMitigation as ProcessConfig["timingMitigation"],
		frozenTimeMs: timingMitigation === "freeze" ? frozenTimeMs : undefined,
	};
}
