/** A bridge handler function invoked when sandbox code calls a bridge global. */
export type BridgeHandler = (...args: unknown[]) => unknown | Promise<unknown>;

/** Map of bridge global names to their handler functions. */
export type BridgeHandlers = Record<string, BridgeHandler>;

/** Structured error from V8 execution. */
export interface V8ExecutionError {
	type: string;
	message: string;
	stack: string;
	code?: string;
}

/** Result of executing code in a V8 session. */
export interface V8ExecutionResult {
	code: number;
	exports?: Uint8Array | null;
	error?: V8ExecutionError | null;
}

/** Options for V8Session.execute(). */
export interface V8ExecutionOptions {
	/** Bridge bundle IIFE to execute before user code. */
	bridgeCode: string;
	/** User code to execute. */
	userCode: string;
	/** Execution mode: 'exec' for CJS script, 'run' for ES module. */
	mode: "exec" | "run";
	/** Virtual file path for ESM module resolution. */
	filePath?: string;
	/** Process config to inject as _processConfig global. */
	processConfig: {
		cwd: string;
		env: Record<string, string>;
		timing_mitigation: string;
		frozen_time_ms: number | null;
	};
	/** OS config to inject as _osConfig global. */
	osConfig: {
		homedir: string;
		tmpdir: string;
		platform: string;
		arch: string;
	};
	/** Bridge handler functions called when sandbox code invokes bridge globals. */
	bridgeHandlers: BridgeHandlers;
}

/** Options for creating a V8 session. */
export interface V8SessionOptions {
	/** V8 heap limit in MB. */
	heapLimitMb?: number;
	/** CPU time limit in ms. */
	cpuTimeLimitMs?: number;
}

/** A session represents a single V8 isolate with its own context. */
export interface V8Session {
	/** Execute code in this session's isolate. */
	execute(options: V8ExecutionOptions): Promise<V8ExecutionResult>;
	/** Destroy the session and its V8 isolate. */
	destroy(): Promise<void>;
}
