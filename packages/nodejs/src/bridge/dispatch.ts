import type {
	BridgeDispatchBridgeRef,
	LoadPolyfillBridgeRef,
} from "../bridge-contract.js";

type DispatchBridgeRef = LoadPolyfillBridgeRef & {
	applySyncPromise(ctx: undefined, args: [string]): string | null;
};

type NativeDispatchBridgeRef = BridgeDispatchBridgeRef & {
	applySyncPromise(
		ctx: undefined,
		args: [string, ...unknown[]],
	): unknown;
};

declare const _loadPolyfill: DispatchBridgeRef | undefined;
declare const _bridgeDispatch: NativeDispatchBridgeRef | undefined;

function encodeDispatchArgs(args: unknown[]): string {
	return JSON.stringify(args, (_key, value) =>
		value === undefined ? { __secureExecDispatchType: "undefined" } : value,
	);
}

function encodeDispatch(method: string, args: unknown[]): string {
	return `__bd:${method}:${encodeDispatchArgs(args)}`;
}

function parseDispatchResult<T>(payload: unknown): T {
	if (payload === null) {
		return undefined as T;
	}

	const parsed =
		typeof payload === "string"
			? (JSON.parse(payload) as Record<string, unknown>)
			: (payload as Record<string, unknown>);
	const errorField = parsed.__bd_error;
	if (errorField) {
		const errorPayload =
			typeof errorField === "string"
				? { message: errorField }
				: (errorField as {
						message: string;
						name?: string;
						code?: string;
						stack?: string;
					});
		const error = new Error(errorPayload.message);
		error.name = errorPayload.name ?? "Error";
		if (errorPayload.code !== undefined) {
			(error as Error & { code?: string }).code = errorPayload.code;
		}
		if (errorPayload.stack) {
			error.stack = errorPayload.stack;
		}
		throw error;
	}
	return parsed.__bd_result as T;
}

function requireLegacyDispatchBridge(): DispatchBridgeRef {
	if (_loadPolyfill) {
		return _loadPolyfill;
	}
	throw new Error("dispatch bridge is not available in sandbox");
}

export function bridgeDispatchSync<T>(method: string, ...args: unknown[]): T {
	if (_bridgeDispatch) {
		return parseDispatchResult<T>(
			_bridgeDispatch.applySyncPromise(undefined, [method, ...args]),
		);
	}
	const bridge = requireLegacyDispatchBridge();
	return parseDispatchResult<T>(
		bridge.applySyncPromise(undefined, [encodeDispatch(method, args)]),
	);
}

export async function bridgeDispatchAsync<T>(
	method: string,
	...args: unknown[]
): Promise<T> {
	if (_bridgeDispatch) {
		return parseDispatchResult<T>(
			_bridgeDispatch.applySyncPromise(undefined, [method, ...args]),
		);
	}
	const bridge = requireLegacyDispatchBridge();
	return parseDispatchResult<T>(
		await bridge.apply(undefined, [encodeDispatch(method, args)], {
			result: { promise: true },
		}),
	);
}
