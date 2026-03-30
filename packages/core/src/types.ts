/**
 * Core-only types for secure-exec SDK.
 *
 * VFS and permission types are now defined in src/kernel/ (canonical source).
 */

export interface SpawnedProcess {
	writeStdin(data: Uint8Array | string): void;
	closeStdin(): void;
	kill(signal?: number): void;
	wait(): Promise<number>;
}

export interface CommandExecutor {
	spawn(
		command: string,
		args: string[],
		options: {
			cwd?: string;
			env?: Record<string, string>;
			streamStdin?: boolean;
			onStdout?: (data: Uint8Array) => void;
			onStderr?: (data: Uint8Array) => void;
		},
	): SpawnedProcess;
}

export interface NetworkServerAddress {
	address: string;
	family: string;
	port: number;
}

export interface NetworkServerRequest {
	method: string;
	url: string;
	headers: Record<string, string>;
	rawHeaders: string[];
	bodyBase64?: string;
}

export interface NetworkServerResponse {
	status: number;
	headers?: Array<[string, string]>;
	body?: string;
	bodyEncoding?: "utf8" | "base64";
}

export interface NetworkServerListenOptions {
	serverId: number;
	port?: number;
	hostname?: string;
	onRequest(
		request: NetworkServerRequest,
	): Promise<NetworkServerResponse> | NetworkServerResponse;
	/** Called when an HTTP upgrade request arrives (e.g. WebSocket). */
	onUpgrade?(
		request: NetworkServerRequest,
		head: string,
		socketId: number,
	): void;
	/** Called when the real upgrade socket receives data from the remote peer. */
	onUpgradeSocketData?(socketId: number, dataBase64: string): void;
	/** Called when the real upgrade socket closes. */
	onUpgradeSocketEnd?(socketId: number): void;
}

export interface NetworkAdapter {
	fetch(
		url: string,
		options: {
			method?: string;
			headers?: Record<string, string>;
			body?: string | null;
		},
	): Promise<{
		ok: boolean;
		status: number;
		statusText: string;
		headers: Record<string, string>;
		body: string;
		url: string;
		redirected: boolean;
	}>;
	dnsLookup(hostname: string): Promise<
		| {
				address: string;
				family: number;
		  }
		| { error: string; code: string }
	>;
	httpRequest(
		url: string,
		options: {
			method?: string;
			headers?: Record<string, string>;
			body?: string | null;
			rejectUnauthorized?: boolean;
		},
	): Promise<{
		status: number;
		statusText: string;
		headers: Record<string, string>;
		body: string;
		url: string;
		trailers?: Record<string, string>;
		upgradeSocketId?: number;
	}>;
	/** Write data from the sandbox to a real upgrade socket on the host. */
	upgradeSocketWrite?(socketId: number, dataBase64: string): void;
	/** End a real upgrade socket on the host. */
	upgradeSocketEnd?(socketId: number): void;
	/** Destroy a real upgrade socket on the host. */
	upgradeSocketDestroy?(socketId: number): void;
	/** Register callbacks for client-side upgrade socket data push. */
	setUpgradeSocketCallbacks?(callbacks: {
		onData: (socketId: number, dataBase64: string) => void;
		onEnd: (socketId: number) => void;
	}): void;
}

export type {
	DriverRuntimeConfig,
	NodeRuntimeDriver,
	NodeRuntimeDriverFactory,
	PythonRuntimeDriver,
	PythonRuntimeDriverFactory,
	RuntimeDriver,
	RuntimeDriverFactory,
	RuntimeDriverOptions,
	SharedRuntimeDriver,
	SystemDriver,
} from "./runtime-driver.js";
