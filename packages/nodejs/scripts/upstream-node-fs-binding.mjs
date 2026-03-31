import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ABI_VERSION = 1;
const BACKEND_ARTIFACT = "node_fs_backend";

function getBackendRunnerPath() {
	return fileURLToPath(
		new URL("./run-upstream-node-fs-backend.mjs", import.meta.url),
	);
}

function createBackendError(payload, fallback) {
	const error = new Error(payload?.message ?? fallback.message);
	if (payload?.code) {
		error.code = payload.code;
	}
	if (payload?.errno !== undefined) {
		error.errno = payload.errno;
	}
	if (payload?.syscall ?? fallback.syscall) {
		error.syscall = payload?.syscall ?? fallback.syscall;
	}
	if (payload?.path ?? fallback.path) {
		error.path = payload?.path ?? fallback.path;
	}
	return error;
}

function parseBackendEnvelope(stdout, fallback) {
	if (!stdout.trim()) {
		throw createBackendError(
			{
				message: "upstream fs backend helper produced no JSON output",
			},
			fallback,
		);
	}

	let envelope;
	try {
		envelope = JSON.parse(stdout);
	} catch (error) {
		throw createBackendError(
			{
				message:
					`failed to parse upstream fs backend helper JSON: ${error instanceof Error ? error.message : String(error)}`,
			},
			fallback,
		);
	}

	if (envelope?.abiVersion !== ABI_VERSION) {
		throw createBackendError(
			{
				message:
					`upstream fs backend helper returned unsupported ABI version ${String(envelope?.abiVersion)}`,
			},
			fallback,
		);
	}

	if (envelope.ok !== true) {
		throw createBackendError(envelope?.error, fallback);
	}

	return envelope.result ?? {};
}

function invokeBackendSync(request) {
	const fallback = {
		message: `upstream fs backend ${request.op} request failed`,
		syscall: request.syscall,
		path: request.path,
	};
	const result = spawnSync(process.execPath, [getBackendRunnerPath()], {
		encoding: "utf8",
		input: JSON.stringify({
			abiVersion: ABI_VERSION,
			...request,
		}),
		maxBuffer: 4 * 1024 * 1024,
	});

	if (result.error) {
		throw createBackendError(
			{
				message: result.error.message,
			},
			fallback,
		);
	}

	if (result.status !== 0) {
		if (result.stdout.trim()) {
			return parseBackendEnvelope(result.stdout, fallback);
		}
		throw createBackendError(
			{
				message:
					result.stderr.trim() ||
					`upstream fs backend helper exited with status ${result.status}`,
			},
			fallback,
		);
	}

	return parseBackendEnvelope(result.stdout, fallback);
}

function invokeBackendAsync(request, callback) {
	try {
		const result = invokeBackendSync(request);
		queueMicrotask(() => {
			callback(null, result);
		});
	} catch (error) {
		queueMicrotask(() => {
			callback(error);
		});
	}
}

function createStatsView(rawStats, bigint) {
	if (!Array.isArray(rawStats) || rawStats.length !== 18) {
		throw new Error("upstream fs backend returned an invalid stats payload");
	}

	if (bigint) {
		return BigInt64Array.from(rawStats, (value) => BigInt(value));
	}

	return Float64Array.from(rawStats);
}

function populateStatValues(statValues, rawStats) {
	if (!statValues || !Array.isArray(rawStats)) {
		return;
	}
	for (let index = 0; index < Math.min(statValues.length, rawStats.length); index += 1) {
		statValues[index] = rawStats[index];
	}
}

function decodeBufferResult(result) {
	if (!Array.isArray(result?.buffer)) {
		throw new Error("upstream fs backend returned an invalid buffer payload");
	}
	return Uint8Array.from(result.buffer);
}

function decodeStringResult(value, encoding) {
	if (encoding === "buffer") {
		return Buffer.from(value);
	}
	return value;
}

function getBufferView(buffer) {
	if (buffer instanceof Uint8Array) {
		return buffer;
	}
	return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function copyIntoBufferView(buffer, offset, chunk) {
	getBufferView(buffer).set(chunk, offset);
}

function sliceBufferView(buffer, offset, length) {
	return getBufferView(buffer).subarray(offset, offset + length);
}

class UpstreamFsReqCallback {
	constructor(bigint = false) {
		this.bigint = bigint === true;
		this.context = undefined;
		this.oncomplete = undefined;
	}
}

function dispatchReqCompletion(req, ...args) {
	if (!req || typeof req.oncomplete !== "function") {
		return;
	}
	req.oncomplete(...args);
}

function isPromiseRequest(hostBinding, req) {
	return req === hostBinding.kUsePromises;
}

function resolveSyncResult(operation) {
	try {
		return Promise.resolve(operation());
	} catch (error) {
		return Promise.reject(error);
	}
}

function isKnownBackendFd(fdState, fd) {
	return fdState.handles.has(fd);
}

function createBadFdError(fd, syscall, path) {
	return createBackendError(
		{
			code: "EBADF",
			message: `bad file descriptor: ${fd}`,
			syscall,
			path,
		},
		{
			message: `bad file descriptor: ${fd}`,
			syscall,
			path,
		},
	);
}

function resolveBackendHandle(fdState, fd, syscall = "fd") {
	const handle = fdState.handles.get(fd);
	if (!handle) {
		throw createBadFdError(fd, syscall);
	}
	return handle;
}

function deriveHandleAccess(flags, constants) {
	const accessMode = flags & 3;
	return {
		append: (flags & constants.O_APPEND) !== 0,
		canRead: accessMode !== constants.O_WRONLY,
		canWrite:
			accessMode === constants.O_WRONLY || accessMode === constants.O_RDWR,
		reopenFlags: flags & ~(constants.O_CREAT | constants.O_EXCL | constants.O_TRUNC),
	};
}

function normalizePosition(handle, position) {
	if (typeof position === "bigint") {
		position = Number(position);
	}
	if (position == null || position < 0) {
		return {
			position: handle.position,
			updatesCurrentOffset: true,
		};
	}
	return {
		position,
		updatesCurrentOffset: false,
	};
}

function allocBackendFd(fdState, handle) {
	const fd = fdState.nextFd;
	fdState.nextFd += 1;
	handle.asyncId = fdState.nextAsyncId;
	fdState.nextAsyncId += 1;
	fdState.handles.set(fd, handle);
	return fd;
}

function createAsyncResultDispatcher(req, callbackFactory) {
	return (error, result) => {
		if (error) {
			dispatchReqCompletion(req, error);
			return;
		}
		callbackFactory(result);
	};
}

export function createUpstreamFsBinding({ internalBinding }) {
	const hostBinding = internalBinding("fs");
	const constants = internalBinding("constants").fs;
	const usedArtifacts = new Set();
	const usedOperations = new Set();
	const fdState = {
		handles: new Map(),
		nextFd: 10_000,
		nextAsyncId: 1,
	};

	function noteBackendOperation(operation) {
		usedArtifacts.add(BACKEND_ARTIFACT);
		usedOperations.add(operation);
	}

	function statPathSync(path, bigint, syscall, throwIfNoEntry = true) {
		noteBackendOperation(syscall);
		try {
			const result = invokeBackendSync({
				op: syscall,
				path,
				syscall,
			});
			populateStatValues(hostBinding.statValues, result.stats);
			return createStatsView(result.stats, bigint);
		} catch (error) {
			if (throwIfNoEntry === false && error?.code === "ENOENT") {
				return undefined;
			}
			throw error;
		}
	}

	function statPathAsync(path, bigint, req, syscall) {
		noteBackendOperation(syscall);
		invokeBackendAsync(
			{
				op: syscall,
				path,
				syscall,
			},
			(error, result) => {
				if (error) {
					dispatchReqCompletion(req, error);
					return;
				}
				populateStatValues(hostBinding.statValues, result.stats);
				dispatchReqCompletion(req, null, createStatsView(result.stats, bigint));
			},
		);
	}

	function openHandleSync(path, flags, mode) {
		noteBackendOperation("open");
		invokeBackendSync({
			op: "open",
			path,
			flags,
			mode,
			syscall: "open",
		});
		const access = deriveHandleAccess(flags, constants);
		return allocBackendFd(fdState, {
			path,
			flags,
			position: 0,
			...access,
		});
	}

	function openHandleAsync(path, flags, mode, req) {
		noteBackendOperation("open");
		invokeBackendAsync(
			{
				op: "open",
				path,
				flags,
				mode,
				syscall: "open",
			},
			(error) => {
				if (error) {
					dispatchReqCompletion(req, error);
					return;
				}
				const access = deriveHandleAccess(flags, constants);
				dispatchReqCompletion(
					req,
					null,
					allocBackendFd(fdState, {
						path,
						flags,
						position: 0,
						...access,
					}),
				);
			},
		);
	}

	function createBackendFileHandle(fd) {
		return {
			fd,
			close() {
				return resolveSyncResult(() => {
					resolveBackendHandle(fdState, fd, "close");
					closeKnownFdSync(fd);
				});
			},
			getAsyncId() {
				return resolveBackendHandle(fdState, fd, "close").asyncId;
			},
		};
	}

	function readKnownFdSync(handle, buffer, offset, length, position) {
		if (length === 0) {
			return 0;
		}

		if (!handle.canRead) {
			throw createBackendError(
				{
					code: "EBADF",
					message: "file descriptor is not open for reading",
					syscall: "read",
					path: handle.path,
				},
				{
					message: "file descriptor is not open for reading",
					syscall: "read",
					path: handle.path,
				},
			);
		}

		const resolved = normalizePosition(handle, position);
		noteBackendOperation("read");
		const result = invokeBackendSync({
			op: "read",
			path: handle.path,
			position: resolved.position,
			length,
			syscall: "read",
		});
		const chunk = decodeBufferResult(result);
		copyIntoBufferView(buffer, offset, chunk);
		if (resolved.updatesCurrentOffset) {
			handle.position += result.bytesRead;
		}
		return result.bytesRead;
	}

	function readKnownFdAsync(handle, buffer, offset, length, position, req) {
		if (!handle.canRead) {
			queueMicrotask(() => {
				dispatchReqCompletion(
					req,
					createBackendError(
						{
							code: "EBADF",
							message: "file descriptor is not open for reading",
							syscall: "read",
							path: handle.path,
						},
						{
							message: "file descriptor is not open for reading",
							syscall: "read",
							path: handle.path,
						},
					),
				);
			});
			return;
		}

		const resolved = normalizePosition(handle, position);
		noteBackendOperation("read");
		invokeBackendAsync(
			{
				op: "read",
				path: handle.path,
				position: resolved.position,
				length,
				syscall: "read",
			},
			createAsyncResultDispatcher(req, (result) => {
				const chunk = decodeBufferResult(result);
				copyIntoBufferView(buffer, offset, chunk);
				if (resolved.updatesCurrentOffset) {
					handle.position += result.bytesRead;
				}
				dispatchReqCompletion(req, null, result.bytesRead);
			}),
		);
	}

	function readBuffersKnownFdSync(handle, buffers, position) {
		if (buffers.length === 0) {
			return 0;
		}

		let totalBytesRead = 0;
		let nextPosition =
			typeof position === "bigint" ? Number(position) : position;
		const usesCurrentOffset = nextPosition == null || nextPosition < 0;

		for (const buffer of buffers) {
			if (buffer.byteLength === 0) {
				continue;
			}

			const bytesRead = readKnownFdSync(
				handle,
				buffer,
				0,
				buffer.byteLength,
				usesCurrentOffset ? null : nextPosition,
			);
			totalBytesRead += bytesRead;
			if (!usesCurrentOffset) {
				nextPosition += bytesRead;
			}
			if (bytesRead < buffer.byteLength) {
				break;
			}
		}

		return totalBytesRead;
	}

	function writeKnownFdSync(handle, bytes, position) {
		if (bytes.byteLength === 0) {
			return 0;
		}

		if (!handle.canWrite) {
			throw createBackendError(
				{
					code: "EBADF",
					message: "file descriptor is not open for writing",
					syscall: "write",
					path: handle.path,
				},
				{
					message: "file descriptor is not open for writing",
					syscall: "write",
					path: handle.path,
				},
			);
		}

		const resolved = normalizePosition(handle, position);
		noteBackendOperation("write");
		const result = invokeBackendSync({
			op: "write",
			path: handle.path,
			flags: handle.reopenFlags,
			position: resolved.position,
			append: handle.append,
			buffer: Array.from(bytes),
			syscall: "write",
		});
		if (resolved.updatesCurrentOffset) {
			handle.position += result.bytesWritten;
		}
		return result.bytesWritten;
	}

	function writeKnownFdAsync(handle, bytes, position, req) {
		if (!handle.canWrite) {
			queueMicrotask(() => {
				dispatchReqCompletion(
					req,
					createBackendError(
						{
							code: "EBADF",
							message: "file descriptor is not open for writing",
							syscall: "write",
							path: handle.path,
						},
						{
							message: "file descriptor is not open for writing",
							syscall: "write",
							path: handle.path,
						},
					),
				);
			});
			return;
		}

		const resolved = normalizePosition(handle, position);
		noteBackendOperation("write");
		invokeBackendAsync(
			{
				op: "write",
				path: handle.path,
				flags: handle.reopenFlags,
				position: resolved.position,
				append: handle.append,
				buffer: Array.from(bytes),
				syscall: "write",
			},
			createAsyncResultDispatcher(req, (result) => {
				if (resolved.updatesCurrentOffset) {
					handle.position += result.bytesWritten;
				}
				dispatchReqCompletion(req, null, result.bytesWritten);
			}),
		);
	}

	function writeBuffersKnownFdSync(handle, buffers, position) {
		if (buffers.length === 0) {
			return 0;
		}

		let totalBytesWritten = 0;
		let nextPosition =
			typeof position === "bigint" ? Number(position) : position;
		const usesCurrentOffset = nextPosition == null || nextPosition < 0;

		for (const buffer of buffers) {
			if (buffer.byteLength === 0) {
				continue;
			}

			const bytesWritten = writeKnownFdSync(
				handle,
				sliceBufferView(buffer, 0, buffer.byteLength),
				usesCurrentOffset ? null : nextPosition,
			);
			totalBytesWritten += bytesWritten;
			if (!usesCurrentOffset) {
				nextPosition += bytesWritten;
			}
			if (bytesWritten < buffer.byteLength) {
				break;
			}
		}

		return totalBytesWritten;
	}

	function closeKnownFdSync(fd) {
		fdState.handles.delete(fd);
	}

	function closeKnownFdAsync(fd, req) {
		fdState.handles.delete(fd);
		queueMicrotask(() => {
			dispatchReqCompletion(req, null);
		});
	}

	const binding = {
		...hostBinding,
		FSReqCallback: UpstreamFsReqCallback,
		statValues: hostBinding.statValues,
		open(path, flags, mode, req) {
			if (isPromiseRequest(hostBinding, req)) {
				return resolveSyncResult(() => openHandleSync(path, flags, mode));
			}
			if (!req) {
				return openHandleSync(path, flags, mode);
			}
			return openHandleAsync(path, flags, mode, req);
		},
		openFileHandle(path, flags, mode, req) {
			if (!isPromiseRequest(hostBinding, req)) {
				return hostBinding.openFileHandle(path, flags, mode, req);
			}
			return resolveSyncResult(() =>
				createBackendFileHandle(openHandleSync(path, flags, mode)),
			);
		},
		read(fd, buffer, offset, length, position, req) {
			if (!isKnownBackendFd(fdState, fd)) {
				return hostBinding.read(fd, buffer, offset, length, position, req);
			}
			const handle = resolveBackendHandle(fdState, fd, "read");
			if (isPromiseRequest(hostBinding, req)) {
				return resolveSyncResult(() =>
					readKnownFdSync(handle, buffer, offset, length, position),
				);
			}
			if (!req) {
				return readKnownFdSync(handle, buffer, offset, length, position);
			}
			return readKnownFdAsync(handle, buffer, offset, length, position, req);
		},
		readBuffers(fd, buffers, position, req) {
			if (!isKnownBackendFd(fdState, fd)) {
				return hostBinding.readBuffers(fd, buffers, position, req);
			}
			const handle = resolveBackendHandle(fdState, fd, "read");
			if (isPromiseRequest(hostBinding, req)) {
				return resolveSyncResult(() =>
					readBuffersKnownFdSync(handle, buffers, position),
				);
			}
			queueMicrotask(() => {
				try {
					dispatchReqCompletion(
						req,
						null,
						readBuffersKnownFdSync(handle, buffers, position),
					);
				} catch (error) {
					dispatchReqCompletion(req, error);
				}
			});
		},
		writeBuffer(fd, buffer, offset, length, position, req, ctx) {
			if (!isKnownBackendFd(fdState, fd)) {
				return hostBinding.writeBuffer(
					fd,
					buffer,
					offset,
					length,
					position,
					req,
					ctx,
				);
			}
			const handle = resolveBackendHandle(fdState, fd, "write");
			const bytes = sliceBufferView(buffer, offset, length);
			if (isPromiseRequest(hostBinding, req)) {
				return resolveSyncResult(() => writeKnownFdSync(handle, bytes, position));
			}
			if (!req) {
				return writeKnownFdSync(handle, bytes, position);
			}
			return writeKnownFdAsync(handle, bytes, position, req);
		},
		writeString(fd, string, position, encoding, req, ctx) {
			if (!isKnownBackendFd(fdState, fd)) {
				return hostBinding.writeString(
					fd,
					string,
					position,
					encoding,
					req,
					ctx,
				);
			}
			const handle = resolveBackendHandle(fdState, fd, "write");
			const bytes = Buffer.from(string, encoding ?? "utf8");
			if (isPromiseRequest(hostBinding, req)) {
				return resolveSyncResult(() => writeKnownFdSync(handle, bytes, position));
			}
			if (!req) {
				return writeKnownFdSync(handle, bytes, position);
			}
			return writeKnownFdAsync(handle, bytes, position, req);
		},
		writeBuffers(fd, buffers, position, req) {
			if (!isKnownBackendFd(fdState, fd)) {
				return hostBinding.writeBuffers(fd, buffers, position, req);
			}
			const handle = resolveBackendHandle(fdState, fd, "write");
			if (isPromiseRequest(hostBinding, req)) {
				return resolveSyncResult(() =>
					writeBuffersKnownFdSync(handle, buffers, position),
				);
			}
			queueMicrotask(() => {
				try {
					dispatchReqCompletion(
						req,
						null,
						writeBuffersKnownFdSync(handle, buffers, position),
					);
				} catch (error) {
					dispatchReqCompletion(req, error);
				}
			});
		},
		close(fd, req) {
			if (!isKnownBackendFd(fdState, fd)) {
				return hostBinding.close(fd, req);
			}
			if (isPromiseRequest(hostBinding, req)) {
				return resolveSyncResult(() => closeKnownFdSync(fd));
			}
			if (!req) {
				return closeKnownFdSync(fd);
			}
			return closeKnownFdAsync(fd, req);
		},
		fstat(fd, bigint, req, throwIfNoEntry) {
			if (!isKnownBackendFd(fdState, fd)) {
				return hostBinding.fstat(fd, bigint, req, throwIfNoEntry);
			}
			const handle = resolveBackendHandle(fdState, fd, "fstat");
			if (isPromiseRequest(hostBinding, req)) {
				return resolveSyncResult(() =>
					statPathSync(handle.path, bigint, "stat", throwIfNoEntry),
				);
			}
			if (!req) {
				return statPathSync(handle.path, bigint, "stat", throwIfNoEntry);
			}
			return statPathAsync(handle.path, bigint, req, "stat");
		},
		stat(path, bigint, req, throwIfNoEntry) {
			if (isPromiseRequest(hostBinding, req)) {
				return resolveSyncResult(() =>
					statPathSync(path, bigint, "stat", throwIfNoEntry),
				);
			}
			if (!req) {
				return statPathSync(path, bigint, "stat", throwIfNoEntry);
			}
			return statPathAsync(path, bigint, req, "stat");
		},
		lstat(path, bigint, req, throwIfNoEntry) {
			if (isPromiseRequest(hostBinding, req)) {
				return resolveSyncResult(() =>
					statPathSync(path, bigint, "lstat", throwIfNoEntry),
				);
			}
			if (!req) {
				return statPathSync(path, bigint, "lstat", throwIfNoEntry);
			}
			return statPathAsync(path, bigint, req, "lstat");
		},
		readdir(path, encoding, withFileTypes, req) {
			if (withFileTypes) {
				return hostBinding.readdir(path, encoding, withFileTypes, req);
			}
			if (isPromiseRequest(hostBinding, req)) {
				return resolveSyncResult(() => {
					noteBackendOperation("readdir");
					const result = invokeBackendSync({
						op: "readdir",
						path,
						syscall: "readdir",
					});
					if (encoding === "buffer") {
						return result.entries.map((entry) => Buffer.from(entry));
					}
					return result.entries;
				});
			}
			if (!req) {
				noteBackendOperation("readdir");
				const result = invokeBackendSync({
					op: "readdir",
					path,
					syscall: "readdir",
				});
				if (encoding === "buffer") {
					return result.entries.map((entry) => Buffer.from(entry));
				}
				return result.entries;
			}
			noteBackendOperation("readdir");
			return invokeBackendAsync(
				{
					op: "readdir",
					path,
					syscall: "readdir",
				},
					createAsyncResultDispatcher(req, (result) => {
						if (encoding === "buffer") {
							dispatchReqCompletion(
								req,
								null,
								result.entries.map((entry) => Buffer.from(entry)),
							);
							return;
						}
						dispatchReqCompletion(req, null, result.entries);
					}),
			);
		},
		realpath(path, encoding, req) {
			if (isPromiseRequest(hostBinding, req)) {
				return resolveSyncResult(() => {
					noteBackendOperation("realpath");
					const result = invokeBackendSync({
						op: "realpath",
						path,
						syscall: "realpath",
					});
					return decodeStringResult(result.path, encoding);
				});
			}
			if (!req) {
				noteBackendOperation("realpath");
				const result = invokeBackendSync({
					op: "realpath",
					path,
					syscall: "realpath",
				});
				return decodeStringResult(result.path, encoding);
			}
			noteBackendOperation("realpath");
			return invokeBackendAsync(
				{
					op: "realpath",
					path,
					syscall: "realpath",
					},
					createAsyncResultDispatcher(req, (result) => {
						dispatchReqCompletion(
							req,
							null,
							decodeStringResult(result.path, encoding),
						);
					}),
				);
			},
	};

	return {
		binding,
		describeUsage() {
			return {
				abiVersion: ABI_VERSION,
				artifacts: [...usedArtifacts].sort(),
				operations: [...usedOperations].sort(),
			};
		},
		resetUsage() {
			usedArtifacts.clear();
			usedOperations.clear();
		},
	};
}
