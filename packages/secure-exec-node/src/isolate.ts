import type { TimingMitigation } from "@secure-exec/core/internal/shared/api-types";
import {
	TIMEOUT_ERROR_MESSAGE as _TIMEOUT_ERROR_MESSAGE,
} from "@secure-exec/core";

/** Default timing side-channel mitigation: freeze Date.now/performance.now inside the isolate. */
export const DEFAULT_TIMING_MITIGATION: TimingMitigation = "freeze";

// Re-export from core so existing callers that import from ./isolate.js continue to work.
export { TIMEOUT_EXIT_CODE, TIMEOUT_ERROR_MESSAGE } from "@secure-exec/core";

/** Thrown when an isolate execution exceeds its CPU time budget. */
export class ExecutionTimeoutError extends Error {
	constructor() {
		super(_TIMEOUT_ERROR_MESSAGE);
		this.name = "ExecutionTimeoutError";
	}
}

/**
 * Create a new V8 isolate with the given heap memory limit (in MB).
 *
 * @deprecated This function required isolated-vm which has been removed.
 * Use @secure-exec/v8 createV8Runtime() instead.
 */
export function createIsolate(_memoryLimit: number): unknown {
	throw new Error("createIsolate() is no longer available. Use @secure-exec/v8 createV8Runtime() instead.");
}

/** Convert a relative timeout duration into an absolute wall-clock deadline. */
export function getExecutionDeadlineMs(timeoutMs?: number): number | undefined {
	if (timeoutMs === undefined) {
		return undefined;
	}
	return Date.now() + timeoutMs;
}

/**
 * Build execution run options with a timeout derived from the remaining
 * wall-clock budget. Throws immediately if the deadline has already passed.
 */
export function getExecutionRunOptions(
	executionDeadlineMs?: number,
): { timeout?: number } {
	if (executionDeadlineMs === undefined) {
		return {};
	}
	const remainingMs = Math.floor(executionDeadlineMs - Date.now());
	if (remainingMs <= 0) {
		throw new ExecutionTimeoutError();
	}
	return { timeout: Math.max(1, remainingMs) };
}

/**
 * Race an async operation against the execution deadline.
 * Used for host-side awaits (e.g. active-handle drain) that happen outside
 * the isolate's own timeout enforcement.
 */
export async function runWithExecutionDeadline<T>(
	operation: Promise<T>,
	executionDeadlineMs?: number,
): Promise<T> {
	if (executionDeadlineMs === undefined) {
		return operation;
	}
	const remainingMs = Math.floor(executionDeadlineMs - Date.now());
	if (remainingMs <= 0) {
		throw new ExecutionTimeoutError();
	}
	return await new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new ExecutionTimeoutError()), remainingMs);
		operation.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(err) => {
				clearTimeout(timer);
				reject(err);
			},
		);
	});
}

/**
 * Detect timeout errors from both our own `ExecutionTimeoutError` and
 * V8 runtime timeout messages.
 */
export function isExecutionTimeoutError(error: unknown): boolean {
	if (error instanceof ExecutionTimeoutError) {
		return true;
	}
	const message = error instanceof Error ? error.message : String(error);
	return /timed out|time limit exceeded/i.test(message);
}
