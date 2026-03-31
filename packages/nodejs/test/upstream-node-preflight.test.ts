import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

type ProbeResult = {
	name: string;
	status: string;
	[key: string]: unknown;
};

type PreflightSummary = {
	nodeVersion: string;
	probes: ProbeResult[];
};

const scriptPath = fileURLToPath(
	new URL("../scripts/run-upstream-node-preflight.mjs", import.meta.url),
);

function runPreflight(): PreflightSummary {
	const stdout = execFileSync(process.execPath, [scriptPath], {
		encoding: "utf8",
	});

	return JSON.parse(stdout) as PreflightSummary;
}

function getProbe(summary: PreflightSummary, name: string): ProbeResult {
	const probe = summary.probes.find((candidate) => candidate.name === name);
	if (!probe) {
		throw new Error(`missing probe ${name}`);
	}
	return probe;
}

describe("upstream Node preflight", () => {
	let summary: PreflightSummary;

	beforeAll(() => {
		summary = runPreflight();
	});

	it("replays internal/bootstrap/realm to completion", () => {
		const probe = getProbe(summary, "bootstrap-realm");

		expect(probe.status).toBe("pass");
		expect(probe.producedInternalLoaders).toBe(true);
		expect(probe.internalBindings).toEqual(
			expect.arrayContaining(["builtins", "module_wrap", "errors"]),
		);
		expect(probe.compiledBuiltins).toEqual(
			expect.arrayContaining(["internal/errors", "internal/assert"]),
		);
	});

	it("records the current bootstrap/node blocker explicitly", () => {
		const probe = getProbe(summary, "bootstrap-node");

		expect(probe.status).toBe("blocked");
		expect(probe.blockerId).toBe("async-wrap-init");
		expect(probe.requiredHarnessShims).toEqual(
			expect.arrayContaining([
				"mutable-process-prototype",
				"buffer.setBufferPrototype-noop",
			]),
		);
		expect(String(probe.stderrExcerpt)).toContain("async_hooks_init_function");
	});

	it("proves module_wrap can execute a trivial ESM graph", () => {
		const probe = getProbe(summary, "module-wrap");

		expect(probe.status).toBe("pass");
		expect(probe.moduleRequests).toEqual(
			expect.arrayContaining([expect.objectContaining({ specifier: "bar" })]),
		);
		expect(probe.namespace).toEqual({ five: 5 });
	});

	it("proves contextify-backed vm contexts are usable", () => {
		const probe = getProbe(summary, "contextify");

		expect(probe.status).toBe("pass");
		expect(probe.contextifyKeys).toEqual(
			expect.arrayContaining(["compileFunction", "makeContext"]),
		);
		expect(probe.result).toBe(42);
		expect(probe.extra).toBe(2);
	});

	it("proves minimal uv and cares-backed host probes pass", () => {
		const uvProbe = getProbe(summary, "uv-net");
		const caresProbe = getProbe(summary, "cares-lookup");

		expect(uvProbe.status).toBe("pass");
		expect(uvProbe.uvHasErrname).toBe(true);
		expect(uvProbe.transcript).toEqual({
			clientToServer: "ping",
			serverToClient: "pong",
		});

		expect(caresProbe.status).toBe("pass");
		expect(caresProbe.caresExports).toEqual(
			expect.arrayContaining(["GetAddrInfoReqWrap", "getaddrinfo"]),
		);
		expect(typeof caresProbe.address).toBe("string");
		expect([4, 6]).toContain(caresProbe.family);
	});
});
