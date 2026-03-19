// IPC client: connects to the Rust V8 runtime over UDS with
// binary header framing and V8 serialization.

import net from "node:net";
import {
	type BinaryFrame,
	encodeFrame,
	decodeFrame,
} from "./ipc-binary.js";

/** Maximum message payload size: 64 MB. */
const MAX_MESSAGE_SIZE = 64 * 1024 * 1024;

/** Callback invoked for each decoded frame from the Rust process. */
export type MessageHandler = (frame: BinaryFrame) => void;

/** Options for creating an IPC client. */
export interface IpcClientOptions {
	/** Unix domain socket path to connect to. */
	socketPath: string;
	/** Handler called for each incoming frame. */
	onMessage: MessageHandler;
	/** Handler called when the connection closes. */
	onClose?: () => void;
	/** Handler called on connection or framing errors. */
	onError?: (err: Error) => void;
}

/**
 * IPC client that communicates with the Rust V8 runtime process over
 * a Unix domain socket using binary header framing with V8 serialization.
 *
 * Wire format: [4-byte u32 big-endian length][N-byte binary frame body]
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

	/** Send a binary frame to the Rust process. */
	send(frame: BinaryFrame): void {
		if (!this.socket || !this.connected) {
			throw new Error("IPC client is not connected");
		}

		// Encode and write the frame (encodeFrame includes 4-byte length prefix).
		const buf = encodeFrame(frame);
		this.socket.write(buf);
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

		// Drain as many complete frames as possible.
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

			// Extract body (without length prefix) and decode.
			const body = this.recvBuf.subarray(4, totalLen);
			this.recvBuf = this.recvBuf.subarray(totalLen);

			try {
				const frame = decodeFrame(Buffer.from(body));
				this.onMessage(frame);
			} catch (err) {
				this.onError?.(
					err instanceof Error
						? err
						: new Error(`Failed to decode IPC frame: ${err}`),
				);
				this.close();
				return;
			}
		}
	}
}
