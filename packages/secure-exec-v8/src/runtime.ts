import type { V8Session, V8SessionOptions } from "./session.js";

/** Options for creating a V8 runtime. */
export interface V8RuntimeOptions {
	/** Path to the Rust binary. Auto-detected if omitted. */
	binaryPath?: string;
}

/** Manages the Rust V8 child process and session lifecycle. */
export interface V8Runtime {
	/** Create a new session (V8 isolate) in the runtime process. */
	createSession(options?: V8SessionOptions): Promise<V8Session>;
	/** Kill the child process and clean up. */
	dispose(): Promise<void>;
}

/** Spawn the Rust V8 runtime process and return a handle. */
export function createV8Runtime(_options?: V8RuntimeOptions): V8Runtime {
	// Stub — real implementation in US-020
	throw new Error("Not yet implemented");
}
