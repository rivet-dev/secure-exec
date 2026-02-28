import { getIsolateRuntimeSource } from "./generated/isolate-runtime.js";

export function getInitialBridgeGlobalsSetupCode(): string {
	return getIsolateRuntimeSource("bridgeInitialGlobals");
}
