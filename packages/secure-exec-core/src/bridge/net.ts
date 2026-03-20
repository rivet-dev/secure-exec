// Net module polyfill for isolated-vm
// Provides TCP socket support that bridges to host net.Socket

import type {
	NetSocketConnectRawBridgeRef,
	NetSocketWriteRawBridgeRef,
	NetSocketEndRawBridgeRef,
	NetSocketDestroyRawBridgeRef,
	RegisterHandleBridgeFn,
	UnregisterHandleBridgeFn,
} from "../shared/bridge-contract.js";
import { exposeCustomGlobal } from "../shared/global-exposure.js";

// Declare host bridge References
declare const _netSocketConnectRaw: NetSocketConnectRawBridgeRef;
declare const _netSocketWriteRaw: NetSocketWriteRawBridgeRef;
declare const _netSocketEndRaw: NetSocketEndRawBridgeRef;
declare const _netSocketDestroyRaw: NetSocketDestroyRawBridgeRef;
declare const _registerHandle: RegisterHandleBridgeFn;
declare const _unregisterHandle: UnregisterHandleBridgeFn;

type EventListener = (...args: unknown[]) => void;

// Track active sockets by ID for host event dispatch
const activeSockets = new Map<number, Socket>();
let nextSocketId = 1;

/**
 * TCP Socket implementation that bridges to a real host net.Socket.
 * Follows the Node.js net.Socket API surface needed by pg, mysql2, ioredis, ssh2.
 */
class Socket {
	readonly _socketId: number;
	private _listeners: Record<string, EventListener[]> = {};
	private _connecting = false;
	private _connected = false;
	destroyed = false;
	writable = true;
	readable = true;
	remoteAddress: string | undefined;
	remotePort: number | undefined;
	remoteFamily: string | undefined;
	localAddress = "0.0.0.0";
	localPort = 0;
	bytesRead = 0;
	bytesWritten = 0;
	private _handleId: string | null = null;
	private _pendingConnect: { resolve: () => void; reject: (err: Error) => void } | null = null;

	constructor(_options?: Record<string, unknown>) {
		this._socketId = nextSocketId++;
		activeSockets.set(this._socketId, this);
	}

	get connecting(): boolean {
		return this._connecting;
	}

	connect(...args: unknown[]): this {
		// Parse arguments: connect(port, host?, cb?) or connect({ port, host }, cb?)
		let port: number;
		let host: string;
		let connectListener: EventListener | undefined;

		if (typeof args[0] === "object" && args[0] !== null) {
			const opts = args[0] as Record<string, unknown>;
			port = Number(opts.port);
			host = String(opts.host || "127.0.0.1");
			if (typeof args[1] === "function") connectListener = args[1] as EventListener;
		} else {
			port = Number(args[0]);
			host = typeof args[1] === "string" ? args[1] : "127.0.0.1";
			if (typeof args[1] === "function") {
				connectListener = args[1] as EventListener;
				host = "127.0.0.1";
			} else if (typeof args[2] === "function") {
				connectListener = args[2] as EventListener;
			}
		}

		if (connectListener) {
			this.once("connect", connectListener);
		}

		this._connecting = true;
		this.remotePort = port;
		this.remoteAddress = host;

		// Register active handle to keep execution alive
		this._handleId = `net-socket-${this._socketId}`;
		_registerHandle(this._handleId, "net.Socket");

		const optionsJson = JSON.stringify({
			socketId: this._socketId,
			host,
			port,
		});

		// Async connect — host creates real socket
		_netSocketConnectRaw.apply(undefined, [optionsJson], { result: { promise: true } })
			.then((resultJson: string) => {
				const result = JSON.parse(resultJson) as { socketId: number };
				// Connect event is dispatched from host via _netSocketDispatch
				void result;
			})
			.catch((err: Error) => {
				this._connecting = false;
				this._emitError(err);
			});

		return this;
	}

	write(data: string | Uint8Array, encodingOrCallback?: string | (() => void), callback?: () => void): boolean {
		if (this.destroyed) return false;

		let encoding = "utf8";
		let cb: (() => void) | undefined;
		if (typeof encodingOrCallback === "function") {
			cb = encodingOrCallback;
		} else if (typeof encodingOrCallback === "string") {
			encoding = encodingOrCallback;
			cb = callback;
		}

		let base64Data: string;
		if (typeof data === "string") {
			if (typeof Buffer !== "undefined") {
				base64Data = Buffer.from(data, encoding as BufferEncoding).toString("base64");
			} else {
				// Fallback for non-Buffer environments
				base64Data = btoa(data);
			}
		} else {
			if (typeof Buffer !== "undefined") {
				base64Data = Buffer.from(data).toString("base64");
			} else {
				base64Data = btoa(String.fromCharCode(...data));
			}
		}

		const result = _netSocketWriteRaw.applySync(undefined, [this._socketId, base64Data]);
		this.bytesWritten += data.length;
		if (cb) cb();
		return result;
	}

	end(data?: string | Uint8Array | (() => void), encodingOrCallback?: string | (() => void), callback?: () => void): this {
		if (typeof data === "function") {
			callback = undefined;
			data = undefined;
		}
		if (data !== undefined && data !== null) {
			this.write(data as string | Uint8Array, encodingOrCallback as string);
		}
		if (typeof encodingOrCallback === "function") {
			(encodingOrCallback as () => void)();
		} else if (callback) {
			callback();
		}
		this.writable = false;
		_netSocketEndRaw.applySync(undefined, [this._socketId]);
		return this;
	}

	destroy(error?: Error): this {
		if (this.destroyed) return this;
		this.destroyed = true;
		this.readable = false;
		this.writable = false;
		this._connecting = false;
		_netSocketDestroyRaw.applySync(undefined, [this._socketId]);
		if (error) {
			this._emit("error", error);
		}
		return this;
	}

	setTimeout(timeout: number, callback?: () => void): this {
		if (callback) this.once("timeout", callback);
		// Timeout handling delegated to host socket
		return this;
	}

	setNoDelay(_noDelay?: boolean): this {
		return this;
	}

	setKeepAlive(_enable?: boolean, _initialDelay?: number): this {
		return this;
	}

	ref(): this { return this; }
	unref(): this { return this; }
	pause(): this { return this; }
	resume(): this { return this; }
	address(): Record<string, unknown> {
		return { address: this.localAddress, family: "IPv4", port: this.localPort };
	}

	// EventEmitter-compatible interface
	on(event: string, listener: EventListener): this {
		if (!this._listeners[event]) this._listeners[event] = [];
		this._listeners[event].push(listener);
		return this;
	}

	addListener(event: string, listener: EventListener): this {
		return this.on(event, listener);
	}

	once(event: string, listener: EventListener): this {
		const wrapper = (...args: unknown[]): void => {
			this.off(event, wrapper);
			listener(...args);
		};
		return this.on(event, wrapper);
	}

	off(event: string, listener: EventListener): this {
		if (this._listeners[event]) {
			const idx = this._listeners[event].indexOf(listener);
			if (idx !== -1) this._listeners[event].splice(idx, 1);
		}
		return this;
	}

	removeListener(event: string, listener: EventListener): this {
		return this.off(event, listener);
	}

	removeAllListeners(event?: string): this {
		if (event) {
			delete this._listeners[event];
		} else {
			this._listeners = {};
		}
		return this;
	}

	emit(event: string, ...args: unknown[]): boolean {
		return this._emit(event, ...args);
	}

	listeners(event: string): EventListener[] {
		return (this._listeners[event] || []).slice();
	}

	listenerCount(event: string): number {
		return (this._listeners[event] || []).length;
	}

	prependListener(event: string, listener: EventListener): this {
		if (!this._listeners[event]) this._listeners[event] = [];
		this._listeners[event].unshift(listener);
		return this;
	}

	eventNames(): string[] {
		return Object.keys(this._listeners);
	}

	// Internal emit used by dispatch
	_emit(event: string, ...args: unknown[]): boolean {
		const handlers = this._listeners[event];
		if (handlers) {
			handlers.slice().forEach((fn) => fn(...args));
		}
		return handlers !== undefined && handlers.length > 0;
	}

	_emitError(err: Error): void {
		if (this._listeners["error"] && this._listeners["error"].length > 0) {
			this._emit("error", err);
		}
	}

	// Called from host via dispatch
	_onConnect(): void {
		this._connecting = false;
		this._connected = true;
		this._emit("connect");
		this._emit("ready");
	}

	_onData(dataBase64: string): void {
		const buf = typeof Buffer !== "undefined"
			? Buffer.from(dataBase64, "base64")
			: new Uint8Array(
				atob(dataBase64).split("").map((c) => c.charCodeAt(0)),
			);
		this.bytesRead += buf.length;
		this._emit("data", buf);
	}

	_onEnd(): void {
		this.readable = false;
		this._emit("end");
	}

	_onClose(hadError: boolean): void {
		this._connected = false;
		this._connecting = false;
		activeSockets.delete(this._socketId);
		if (this._handleId) {
			_unregisterHandle(this._handleId);
			this._handleId = null;
		}
		this._emit("close", hadError);
	}

	_onError(message: string): void {
		this._connecting = false;
		const err = new Error(message) as Error & { code?: string };
		// Extract common error codes from message
		if (message.includes("ECONNREFUSED")) err.code = "ECONNREFUSED";
		else if (message.includes("ECONNRESET")) err.code = "ECONNRESET";
		else if (message.includes("ETIMEDOUT")) err.code = "ETIMEDOUT";
		else if (message.includes("ENOTFOUND")) err.code = "ENOTFOUND";
		this._emitError(err);
	}
}

// Dispatch function called from host to push events to sandbox sockets
function netSocketDispatch(
	socketId: number,
	type: "data" | "connect" | "end" | "close" | "error",
	payload: string,
): void {
	const socket = activeSockets.get(socketId);
	if (!socket) return;

	switch (type) {
		case "connect":
			socket._onConnect();
			break;
		case "data":
			socket._onData(payload);
			break;
		case "end":
			socket._onEnd();
			break;
		case "close":
			socket._onClose(payload === "true");
			break;
		case "error":
			socket._onError(payload);
			break;
	}
}

// IP utility functions
function isIP(input: string): number {
	if (isIPv4(input)) return 4;
	if (isIPv6(input)) return 6;
	return 0;
}

function isIPv4(input: string): boolean {
	const parts = input.split(".");
	if (parts.length !== 4) return false;
	for (const part of parts) {
		const num = Number(part);
		if (!Number.isInteger(num) || num < 0 || num > 255) return false;
		if (part !== String(num)) return false; // no leading zeros
	}
	return true;
}

function isIPv6(input: string): boolean {
	// Simplified check — accepts standard IPv6 formats
	if (input.indexOf(":") === -1) return false;
	const parts = input.split(":");
	if (parts.length < 3 || parts.length > 8) return false;
	for (const part of parts) {
		if (part === "") continue; // :: compression
		if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return false;
	}
	return true;
}

// Connect helper functions
function connect(...args: unknown[]): Socket {
	const socket = new Socket();
	socket.connect(...args);
	return socket;
}

function createConnection(...args: unknown[]): Socket {
	return connect(...args);
}

function createServer(): never {
	throw new Error("net.createServer is not supported in sandbox");
}

// Export net module
export const netModule = {
	Socket,
	connect,
	createConnection,
	createServer,
	isIP,
	isIPv4,
	isIPv6,
	Stream: Socket,
	default: {
		Socket,
		connect,
		createConnection,
		createServer,
		isIP,
		isIPv4,
		isIPv6,
		Stream: Socket,
	},
};

// Expose as globals for require() and host dispatch
exposeCustomGlobal("_netModule", netModule);
exposeCustomGlobal("_netSocketDispatch", netSocketDispatch);
