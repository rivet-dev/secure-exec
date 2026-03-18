import type {
	OSConfig,
	ProcessConfig,
	ExecResult,
	RunResult,
	StdioChannel,
} from "@secure-exec/core";

export type SerializedPermissions = {
	fs?: string;
	network?: string;
	childProcess?: string;
	env?: string;
};

export type BrowserWorkerExecOptions = {
	filePath?: string;
	env?: Record<string, string>;
	cwd?: string;
	stdin?: string;
};

export type BrowserWorkerInitPayload = {
	processConfig?: ProcessConfig;
	osConfig?: OSConfig;
	permissions?: SerializedPermissions;
	filesystem?: "opfs" | "memory";
	networkEnabled?: boolean;
	payloadLimits?: {
		base64TransferBytes?: number;
		jsonPayloadBytes?: number;
	};
};

export type BrowserWorkerRequestMessage =
	| { id: number; type: "init"; payload: BrowserWorkerInitPayload }
	| {
			id: number;
			type: "exec";
			payload: {
				code: string;
				options?: BrowserWorkerExecOptions;
				captureStdio?: boolean;
			};
	  }
	| {
			id: number;
			type: "run";
			payload: {
				code: string;
				filePath?: string;
				captureStdio?: boolean;
			};
	  }
	| { id: number; type: "dispose" };

export type BrowserWorkerResponseMessage =
	| { type: "response"; id: number; ok: true; result: ExecResult | RunResult | true }
	| {
			type: "response";
			id: number;
			ok: false;
			error: { message: string; stack?: string; code?: string };
	  };

export type BrowserWorkerStdioMessage = {
	type: "stdio";
	requestId: number;
	channel: StdioChannel;
	message: string;
};

export type BrowserWorkerOutboundMessage =
	| BrowserWorkerResponseMessage
	| BrowserWorkerStdioMessage;
