import { exposeCustomGlobal } from "@secure-exec/core/internal/shared/global-exposure";
import { bridgeDispatchSync } from "./dispatch.js";

/**
 * Active Handles: Mechanism to keep the sandbox alive for async operations.
 *
 * The V8 isolate doesn't have an event loop, so async callbacks (like child process
 * events) would never fire because the sandbox exits immediately after synchronous
 * code finishes. This module tracks active handles and provides a promise that
 * resolves when all handles complete.
 *
 * See: docs-internal/node/ACTIVE_HANDLES.md
 */

const HANDLE_DISPATCH = {
	register: "kernelHandleRegister",
	unregister: "kernelHandleUnregister",
	list: "kernelHandleList",
} as const;

// Resolvers waiting for all handles to complete
let _waitResolvers: Array<() => void> = [];
let _handlePollTimer: ReturnType<typeof setInterval> | null = null;

function ensureHandlePollTimer(): void {
	if (_handlePollTimer !== null) {
		return;
	}
	_handlePollTimer = setInterval(() => {
		if (_getActiveHandles().length > 0) {
			return;
		}
		if (_handlePollTimer !== null) {
			clearInterval(_handlePollTimer);
			_handlePollTimer = null;
		}
	}, 25);
}

/**
 * Register an active handle that keeps the sandbox alive.
 * Throws if the handle cap (_maxHandles) would be exceeded.
 * @param id Unique identifier for the handle
 * @param description Human-readable description for debugging
 */
export function _registerHandle(id: string, description: string): void {
	try {
		bridgeDispatchSync<void>(HANDLE_DISPATCH.register, id, description);
		ensureHandlePollTimer();
	} catch (error) {
		if (error instanceof Error && error.message.includes("EAGAIN")) {
			throw new Error(
				"ERR_RESOURCE_BUDGET_EXCEEDED: maximum active handles exceeded",
			);
		}
		throw error;
	}
}

/**
 * Unregister a handle. If no handles remain, resolves all waiters.
 * @param id The handle identifier to unregister
 */
export function _unregisterHandle(id: string): void {
	const remaining = bridgeDispatchSync<number>(HANDLE_DISPATCH.unregister, id);
	if (remaining === 0 && _handlePollTimer !== null) {
		clearInterval(_handlePollTimer);
		_handlePollTimer = null;
	}
	if (remaining === 0 && _waitResolvers.length > 0) {
		const resolvers = _waitResolvers;
		_waitResolvers = [];
		resolvers.forEach((r) => r());
	}
}

/**
 * Wait for all active handles to complete.
 * Returns immediately if no handles are active.
 */
export function _waitForActiveHandles(): Promise<void> {
	if (_getActiveHandles().length === 0) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		let settled = false;
		const complete = () => {
			if (settled) {
				return;
			}
			settled = true;
			resolve();
		};
		_waitResolvers.push(complete);
		const poll = () => {
			if (settled) {
				return;
			}
			if (_getActiveHandles().length === 0) {
				complete();
				return;
			}
			setTimeout(poll, 10);
		};
		setTimeout(poll, 10);
	});
}

/**
 * Get list of currently active handles (for debugging).
 * Returns array of [id, description] tuples.
 */
export function _getActiveHandles(): Array<[string, string]> {
	return bridgeDispatchSync<Array<[string, string]>>(HANDLE_DISPATCH.list);
}

// Install on globalThis for use by other bridge modules and exec().
// Lock bridge internals so sandbox code cannot replace lifecycle hooks.
exposeCustomGlobal("_registerHandle", _registerHandle);
exposeCustomGlobal("_unregisterHandle", _unregisterHandle);
exposeCustomGlobal("_waitForActiveHandles", _waitForActiveHandles);
exposeCustomGlobal("_getActiveHandles", _getActiveHandles);
