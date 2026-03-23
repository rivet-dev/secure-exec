/**
 * Pipe manager.
 *
 * Creates and manages pipes for inter-process communication.
 * Supports cross-runtime pipes: data flows through kernel-managed buffers.
 * SharedArrayBuffer ring buffers are deferred — this uses buffered pipes.
 */

import type { FileDescription } from "./types.js";
import { FILETYPE_PIPE, O_RDONLY, O_WRONLY, KernelError } from "./types.js";
import type { ProcessFDTable } from "./fd-table.js";

export interface PipeEnd {
	description: FileDescription;
	filetype: typeof FILETYPE_PIPE;
}

interface PipeState {
	id: number;
	buffer: Uint8Array[];
	closed: { read: boolean; write: boolean };
	readDescription: FileDescription;
	writeDescription: FileDescription;
	/** Resolves waiting for data */
	readWaiters: Array<(data: Uint8Array | null) => void>;
}

/** Maximum buffered bytes per pipe before writes are rejected (EAGAIN). */
export const MAX_PIPE_BUFFER_BYTES = 65_536; // 64 KB — matches Linux default

export class PipeManager {
	private pipes: Map<number, PipeState> = new Map();
	/** Map description ID → pipe ID for routing reads/writes */
	private descToPipe: Map<number, { pipeId: number; end: "read" | "write" }> = new Map();
	private nextPipeId = 1;
	private nextDescId = 100_000; // High range to avoid FD table collisions

	/** Called before EPIPE when a write hits a closed read end. Receives writer PID. */
	onBrokenPipe: ((pid: number) => void) | null = null;

	/**
	 * Create a pipe. Returns two FileDescriptions:
	 * one for reading and one for writing.
	 */
	createPipe(): { read: PipeEnd; write: PipeEnd } {
		const id = this.nextPipeId++;

		const readDesc: FileDescription = {
			id: this.nextDescId++,
			path: `pipe:${id}:read`,
			cursor: 0n,
			flags: O_RDONLY,
			refCount: 0, // Not in any FD table yet — openWith() will bump
		};

		const writeDesc: FileDescription = {
			id: this.nextDescId++,
			path: `pipe:${id}:write`,
			cursor: 0n,
			flags: O_WRONLY,
			refCount: 0, // Not in any FD table yet — openWith() will bump
		};

		const state: PipeState = {
			id,
			buffer: [],
			closed: { read: false, write: false },
			readDescription: readDesc,
			writeDescription: writeDesc,
			readWaiters: [],
		};

		this.pipes.set(id, state);
		this.descToPipe.set(readDesc.id, { pipeId: id, end: "read" });
		this.descToPipe.set(writeDesc.id, { pipeId: id, end: "write" });

		return {
			read: { description: readDesc, filetype: FILETYPE_PIPE },
			write: { description: writeDesc, filetype: FILETYPE_PIPE },
		};
	}

	/** Write data to a pipe's write end. Delivers SIGPIPE via onBrokenPipe when read end is closed. */
	write(descriptionId: number, data: Uint8Array, writerPid?: number): number {
		const ref = this.descToPipe.get(descriptionId);
		if (!ref || ref.end !== "write") throw new KernelError("EBADF", "not a pipe write end");

		const state = this.pipes.get(ref.pipeId);
		if (!state) throw new KernelError("EBADF", "pipe not found");
		if (state.closed.write) throw new KernelError("EPIPE", "write end closed");
		if (state.closed.read) {
			// Deliver SIGPIPE before EPIPE (POSIX: signal first, then errno)
			if (writerPid !== undefined && this.onBrokenPipe) {
				this.onBrokenPipe(writerPid);
			}
			throw new KernelError("EPIPE", "read end closed");
		}

		// If readers are waiting, deliver directly (no buffering)
		if (state.readWaiters.length > 0) {
			const waiter = state.readWaiters.shift()!;
			waiter(data);
		} else {
			// Enforce buffer limit to prevent unbounded memory growth
			const currentSize = this.bufferSize(state);
			if (currentSize + data.length > MAX_PIPE_BUFFER_BYTES) {
				throw new KernelError("EAGAIN", "pipe buffer full");
			}
			state.buffer.push(new Uint8Array(data));
		}

		return data.length;
	}

	/** Read data from a pipe's read end. Returns null on EOF. */
	read(descriptionId: number, length: number): Promise<Uint8Array | null> {
		const ref = this.descToPipe.get(descriptionId);
		if (!ref || ref.end !== "read") throw new KernelError("EBADF", "not a pipe read end");

		const state = this.pipes.get(ref.pipeId);
		if (!state) throw new KernelError("EBADF", "pipe not found");

		// Data available in buffer
		if (state.buffer.length > 0) {
			return Promise.resolve(this.drainBuffer(state, length));
		}

		// Write end closed — EOF
		if (state.closed.write) {
			return Promise.resolve(null);
		}

		// Block until data or EOF
		return new Promise((resolve) => {
			state.readWaiters.push(resolve);
		});
	}

	/** Close one end of a pipe. */
	close(descriptionId: number): void {
		const ref = this.descToPipe.get(descriptionId);
		if (!ref) return;

		const state = this.pipes.get(ref.pipeId);
		if (!state) return;

		if (ref.end === "read") {
			state.closed.read = true;
		} else {
			state.closed.write = true;
			// Notify any blocked readers with EOF
			for (const waiter of state.readWaiters) {
				waiter(null);
			}
			state.readWaiters.length = 0;
		}

		this.descToPipe.delete(descriptionId);

		// Clean up when both ends are closed
		if (state.closed.read && state.closed.write) {
			this.pipes.delete(ref.pipeId);
		}
	}

	/** Check if a description ID belongs to a pipe */
	isPipe(descriptionId: number): boolean {
		return this.descToPipe.has(descriptionId);
	}

	/** Query poll state for a pipe end (used by poll/select syscalls). */
	pollState(descriptionId: number): { readable: boolean; writable: boolean; hangup: boolean } | null {
		const ref = this.descToPipe.get(descriptionId);
		if (!ref) return null;
		const state = this.pipes.get(ref.pipeId);
		if (!state) return null;

		if (ref.end === "read") {
			const hasData = state.buffer.length > 0;
			return {
				readable: hasData || state.closed.write,
				writable: false,
				hangup: state.closed.write,
			};
		} else {
			return {
				readable: false,
				writable: !state.closed.read && this.bufferSize(state) < MAX_PIPE_BUFFER_BYTES,
				hangup: state.closed.read,
			};
		}
	}

	/** Get the pipe ID for a description, or undefined if not a pipe */
	pipeIdFor(descriptionId: number): number | undefined {
		return this.descToPipe.get(descriptionId)?.pipeId;
	}

	/**
	 * Create pipe FDs in the given FD table.
	 * Returns the FD numbers for {read, write}.
	 */
	createPipeFDs(fdTable: ProcessFDTable): { readFd: number; writeFd: number } {
		const { read, write } = this.createPipe();
		const readFd = fdTable.openWith(read.description, read.filetype);
		const writeFd = fdTable.openWith(write.description, write.filetype);
		return { readFd, writeFd };
	}

	private bufferSize(state: PipeState): number {
		let size = 0;
		for (const chunk of state.buffer) size += chunk.length;
		return size;
	}

	private drainBuffer(state: PipeState, length: number): Uint8Array {
		// Concatenate buffered chunks up to `length` bytes
		const chunks: Uint8Array[] = [];
		let remaining = length;

		while (remaining > 0 && state.buffer.length > 0) {
			const chunk = state.buffer[0];
			if (chunk.length <= remaining) {
				chunks.push(chunk);
				remaining -= chunk.length;
				state.buffer.shift();
			} else {
				chunks.push(chunk.subarray(0, remaining));
				state.buffer[0] = chunk.subarray(remaining);
				remaining = 0;
			}
		}

		if (chunks.length === 1) return chunks[0];

		const total = chunks.reduce((sum, c) => sum + c.length, 0);
		const result = new Uint8Array(total);
		let offset = 0;
		for (const chunk of chunks) {
			result.set(chunk, offset);
			offset += chunk.length;
		}
		return result;
	}
}
