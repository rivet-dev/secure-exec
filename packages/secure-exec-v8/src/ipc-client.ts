// IPC client: connects to the Rust V8 runtime over UDS with
// length-prefixed MessagePack framing.

import net from "node:net";
import { encode, decode } from "@msgpack/msgpack";
import type { HostMessage, RustMessage } from "./ipc-types.js";

/** Maximum message payload size: 64 MB. */
const MAX_MESSAGE_SIZE = 64 * 1024 * 1024;

/** Callback invoked for each decoded message from the Rust process. */
export type MessageHandler = (msg: RustMessage) => void;

/** Options for creating an IPC client. */
export interface IpcClientOptions {
	/** Unix domain socket path to connect to. */
	socketPath: string;
	/** Handler called for each incoming message. */
	onMessage: MessageHandler;
	/** Handler called when the connection closes. */
	onClose?: () => void;
	/** Handler called on connection or framing errors. */
	onError?: (err: Error) => void;
}

/**
 * IPC client that communicates with the Rust V8 runtime process over
 * a Unix domain socket using length-prefixed MessagePack framing.
 *
 * Wire format: [4-byte u32 big-endian length][N-byte MessagePack payload]
 */
export class IpcClient {
	private socket: net.Socket | null = null;
	private recvBuf: Buffer = Buffer.alloc(0);
	private onMessage: MessageHandler;
	private onClose?: () => void;
	private onError?: (err: Error) => void;
	private socketPath: string;
	private connected = false;

	constructor(options: IpcClientOptions) {
		this.socketPath = options.socketPath;
		this.onMessage = options.onMessage;
		this.onClose = options.onClose;
		this.onError = options.onError;
	}

	/** Connect to the Unix domain socket. Resolves when connected. */
	connect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const socket = net.createConnection(this.socketPath);

			socket.on("connect", () => {
				this.connected = true;
				resolve();
			});

			socket.on("data", (chunk: Buffer) => {
				this.handleData(chunk);
			});

			socket.on("close", () => {
				this.connected = false;
				this.socket = null;
				this.onClose?.();
			});

			socket.on("error", (err: Error) => {
				if (!this.connected) {
					reject(err);
					return;
				}
				this.onError?.(err);
			});

			this.socket = socket;
		});
	}

	/** Send the auth token as the first message after connecting. */
	authenticate(token: string): void {
		this.send({ type: "Authenticate", token });
	}

	/** Send a host message to the Rust process. */
	send(msg: HostMessage): void {
		if (!this.socket || !this.connected) {
			throw new Error("IPC client is not connected");
		}

		// Encode payload.
		const payload = encode(msg);
		if (payload.byteLength > MAX_MESSAGE_SIZE) {
			throw new Error(
				`Message size ${payload.byteLength} exceeds maximum ${MAX_MESSAGE_SIZE}`,
			);
		}

		// Write length prefix (4-byte u32 big-endian) + payload.
		const header = Buffer.alloc(4);
		header.writeUInt32BE(payload.byteLength, 0);
		this.socket.write(header);
		this.socket.write(payload);
	}

	/** Close the connection. */
	close(): void {
		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
			this.connected = false;
		}
	}

	/** Whether the client is currently connected. */
	get isConnected(): boolean {
		return this.connected;
	}

	/** Parse incoming data with length-prefix framing. */
	private handleData(chunk: Buffer): void {
		this.recvBuf = Buffer.concat([this.recvBuf, chunk]);

		// Drain as many complete messages as possible.
		while (this.recvBuf.length >= 4) {
			const payloadLen = this.recvBuf.readUInt32BE(0);

			// Reject oversized messages.
			if (payloadLen > MAX_MESSAGE_SIZE) {
				const err = new Error(
					`Received message size ${payloadLen} exceeds maximum ${MAX_MESSAGE_SIZE}`,
				);
				this.onError?.(err);
				this.close();
				return;
			}

			// Wait for complete message.
			const totalLen = 4 + payloadLen;
			if (this.recvBuf.length < totalLen) {
				break;
			}

			// Extract and decode payload.
			const payload = this.recvBuf.subarray(4, totalLen);
			this.recvBuf = this.recvBuf.subarray(totalLen);

			try {
				const msg = decode(payload) as RustMessage;
				this.onMessage(msg);
			} catch (err) {
				this.onError?.(
					err instanceof Error
						? err
						: new Error(`Failed to decode IPC message: ${err}`),
				);
				this.close();
				return;
			}
		}
	}
}
