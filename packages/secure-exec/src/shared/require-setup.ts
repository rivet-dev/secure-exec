import { getIsolateRuntimeSource } from "../generated/isolate-runtime.js";

export function getRequireSetupCode(): string {
	return getIsolateRuntimeSource("requireSetup");
}
