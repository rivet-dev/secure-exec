/**
 * Pi SDK sandbox coverage matrix — enforces that each axis has at least
 * one dedicated test proving unmodified Pi package behavior in the sandbox.
 *
 * ┌──────────────────────────────────────┬────────────────────────┬──────────────────────────────────────────────────┐
 * │ Axis                                 │ Provider               │ Test file                                        │
 * ├──────────────────────────────────────┼────────────────────────┼──────────────────────────────────────────────────┤
 * │ Real-provider session                │ real (Anthropic API)   │ pi-sdk-real-provider.test.ts                      │
 * │ Subprocess / bash                    │ mock LLM server        │ pi-sdk-tool-integration.test.ts                   │
 * │ Filesystem mutation (write)          │ mock LLM server        │ pi-sdk-tool-integration.test.ts                   │
 * │ Filesystem mutation (edit)           │ mock LLM server        │ pi-sdk-tool-integration.test.ts                   │
 * │ Subprocess stdout capture            │ mock LLM server        │ pi-sdk-subprocess-semantics.test.ts               │
 * │ Subprocess non-zero exit             │ mock LLM server        │ pi-sdk-subprocess-semantics.test.ts               │
 * │ Subprocess stderr capture            │ mock LLM server        │ pi-sdk-subprocess-semantics.test.ts               │
 * │ Subprocess cancellation/interruption │ mock LLM server        │ pi-sdk-subprocess-semantics.test.ts               │
 * │ Timeout cleanup                      │ mock LLM server        │ pi-sdk-resource-cleanup.test.ts                   │
 * │ Cancel-then-reuse (no leaked state)  │ mock LLM server        │ pi-sdk-resource-cleanup.test.ts                   │
 * │ Large tool output buffering          │ mock LLM server        │ pi-sdk-resource-cleanup.test.ts                   │
 * │ Tool event multi-tool ordering       │ mock LLM server        │ pi-sdk-tool-event-contract.test.ts                │
 * │ Tool event isError on success        │ mock LLM server        │ pi-sdk-tool-event-contract.test.ts                │
 * │ Tool event isError on failure        │ mock LLM server        │ pi-sdk-tool-event-contract.test.ts                │
 * │ Tool event payload shape             │ mock LLM server        │ pi-sdk-tool-event-contract.test.ts                │
 * └──────────────────────────────────────┴────────────────────────┴──────────────────────────────────────────────────┘
 *
 * Known limitations:
 *   - Real-provider traffic only exercises the read tool; bash, write, and
 *     edit are proved deterministically via mock LLM responses.
 *   - Pi SDK bootstrap/import compatibility is a prerequisite, not a matrix
 *     axis — covered by pi-sdk-bootstrap.test.ts.
 *   - Timeout, cancellation, and resource-cleanup behavior is covered by
 *     pi-sdk-resource-cleanup.test.ts.
 *   - Permission-denial behavior is covered by pi-sdk-permission-denial.test.ts.
 *   - Network allow/deny policy enforcement is covered by
 *     pi-sdk-network-policy.test.ts.
 *   - Path-traversal/escape hardening is covered by pi-sdk-path-safety.test.ts.
 *   - Tool event contract (ordering, isError, payload shape) is covered by
 *     pi-sdk-tool-event-contract.test.ts.
 *   - Filesystem edge cases (missing files, overwrite, non-ASCII, binary,
 *     large payloads) are covered by pi-sdk-filesystem-edge-cases.test.ts.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_EXEC_ROOT = path.resolve(__dirname, "../..");

const PI_SDK_ENTRY = path.resolve(
	SECURE_EXEC_ROOT,
	"node_modules/@mariozechner/pi-coding-agent/dist/index.js",
);

function skipUnlessPiInstalled(): string | false {
	return existsSync(PI_SDK_ENTRY)
		? false
		: "@mariozechner/pi-coding-agent not installed";
}

/**
 * Coverage matrix definition.  Each entry declares the axis, the test file
 * that proves it, and the provider mode (real vs mock).  The enforcement
 * test below verifies every axis has a matching test file on disk.
 */
const COVERAGE_MATRIX: Array<{
	axis: string;
	testFile: string;
	providerMode: "real" | "mock";
	limitation?: string;
}> = [
	{
		axis: "real-provider session execution",
		testFile: "pi-sdk-real-provider.test.ts",
		providerMode: "real",
		limitation:
			"Only the read tool is exercised; bash/write/edit are not proved with real traffic",
	},
	{
		axis: "subprocess/bash execution",
		testFile: "pi-sdk-tool-integration.test.ts",
		providerMode: "mock",
		limitation: "Mock-provider-backed — tool call is deterministic, not model-chosen",
	},
	{
		axis: "filesystem mutation (write/create)",
		testFile: "pi-sdk-tool-integration.test.ts",
		providerMode: "mock",
		limitation: "Mock-provider-backed — tool call is deterministic, not model-chosen",
	},
	{
		axis: "filesystem mutation (edit/modify)",
		testFile: "pi-sdk-tool-integration.test.ts",
		providerMode: "mock",
		limitation: "Mock-provider-backed — tool call is deterministic, not model-chosen",
	},
	{
		axis: "subprocess stdout capture",
		testFile: "pi-sdk-subprocess-semantics.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — verifies tool result preserves stdout content",
	},
	{
		axis: "subprocess non-zero exit",
		testFile: "pi-sdk-subprocess-semantics.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — verifies tool result preserves exit status",
	},
	{
		axis: "subprocess stderr capture",
		testFile: "pi-sdk-subprocess-semantics.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — verifies tool result preserves stderr output",
	},
	{
		axis: "subprocess cancellation/interruption",
		testFile: "pi-sdk-subprocess-semantics.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — verifies session disposal terminates long-running subprocess",
	},
	{
		axis: "timeout cleanup",
		testFile: "pi-sdk-resource-cleanup.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — verifies runtime.exec() timeout terminates sandbox work during long-running tool",
	},
	{
		axis: "cancel-then-reuse (no leaked state)",
		testFile: "pi-sdk-resource-cleanup.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — verifies session disposal mid-tool does not break follow-on session reuse",
	},
	{
		axis: "large tool output buffering",
		testFile: "pi-sdk-resource-cleanup.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — verifies large bash output completes without buffering hang or truncation",
	},
	{
		axis: "permission denial (fs write denied, read allowed)",
		testFile: "pi-sdk-permission-denial.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves denial propagation, not model-driven recovery",
	},
	{
		axis: "permission denial (subprocess denied, write allowed)",
		testFile: "pi-sdk-permission-denial.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves denial propagation, not model-driven recovery",
	},
	{
		axis: "permission denial (network denied)",
		testFile: "pi-sdk-permission-denial.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves SDK surfaces clean error when network is denied",
	},
	{
		axis: "path safety (traversal escape denied)",
		testFile: "pi-sdk-path-safety.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves SecureExec blocks ../ and absolute-path traversal escapes",
	},
	{
		axis: "path safety (legitimate in-workdir ops succeed)",
		testFile: "pi-sdk-path-safety.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves allowed-path writes/edits succeed alongside denials",
	},
	{
		axis: "tool event multi-tool ordering",
		testFile: "pi-sdk-tool-event-contract.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves start→end event ordering across sequential tool calls",
	},
	{
		axis: "tool event isError on success",
		testFile: "pi-sdk-tool-event-contract.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves isError===false for bash(exit 0), write, and edit success",
	},
	{
		axis: "tool event isError on failure",
		testFile: "pi-sdk-tool-event-contract.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves isError===true for bash(nonzero exit) and edit(file not found)",
	},
	{
		axis: "tool event payload shape",
		testFile: "pi-sdk-tool-event-contract.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves toolCallId/toolName presence and start↔end consistency",
	},
	{
		axis: "network policy (allowed destination succeeds)",
		testFile: "pi-sdk-network-policy.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves allowed outbound request reaches mock server through SecureExec network path",
	},
	{
		axis: "network policy (denied destination fails)",
		testFile: "pi-sdk-network-policy.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves denied destination surfaces clean error and zero requests reach server",
	},
	{
		axis: "network policy (selective port allow/deny)",
		testFile: "pi-sdk-network-policy.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves selective policy allows one port while blocking another",
	},
	{
		axis: "filesystem edge case (missing file read)",
		testFile: "pi-sdk-filesystem-edge-cases.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves read tool on non-existent file surfaces isError",
	},
	{
		axis: "filesystem edge case (overwrite existing file)",
		testFile: "pi-sdk-filesystem-edge-cases.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves write tool overwrites content completely",
	},
	{
		axis: "filesystem edge case (non-ASCII Unicode filename)",
		testFile: "pi-sdk-filesystem-edge-cases.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves write tool handles Unicode filenames",
	},
	{
		axis: "filesystem edge case (binary-like content)",
		testFile: "pi-sdk-filesystem-edge-cases.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves write tool preserves control chars, emoji, astral plane",
	},
	{
		axis: "filesystem edge case (large payload)",
		testFile: "pi-sdk-filesystem-edge-cases.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves write tool handles ~50KB without truncation",
	},
	{
		axis: "session resume (SDK second turn observes prior state)",
		testFile: "pi-session-resume.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves two runPrintMode turns on same session share filesystem/subprocess state via SDK surface",
	},
	{
		axis: "session resume (PTY second turn observes prior state)",
		testFile: "pi-session-resume.test.ts",
		providerMode: "mock",
		limitation:
			"Mock-provider-backed — proves two runPrintMode turns on same session share filesystem/subprocess state via PTY surface",
	},
];

describe.skipIf(skipUnlessPiInstalled())(
	"Pi SDK coverage matrix enforcement",
	() => {
		for (const entry of COVERAGE_MATRIX) {
			it(`[${entry.providerMode}] ${entry.axis} — test file exists`, () => {
				const fullPath = path.resolve(__dirname, entry.testFile);
				expect(
					existsSync(fullPath),
					`Missing test file for matrix axis "${entry.axis}": ${entry.testFile}`,
				).toBe(true);
			});
		}

		it("every matrix axis has an assigned test file", () => {
			const axes = COVERAGE_MATRIX.map((e) => e.axis);
			expect(axes).toContain("real-provider session execution");
			expect(axes).toContain("subprocess/bash execution");
			expect(axes).toContain("filesystem mutation (write/create)");
			expect(axes).toContain("filesystem mutation (edit/modify)");
			expect(axes).toContain("permission denial (fs write denied, read allowed)");
			expect(axes).toContain("permission denial (subprocess denied, write allowed)");
			expect(axes).toContain("permission denial (network denied)");
			expect(axes).toContain("path safety (traversal escape denied)");
			expect(axes).toContain("path safety (legitimate in-workdir ops succeed)");
			expect(axes).toContain("subprocess stdout capture");
			expect(axes).toContain("subprocess non-zero exit");
			expect(axes).toContain("subprocess stderr capture");
			expect(axes).toContain("subprocess cancellation/interruption");
			expect(axes).toContain("timeout cleanup");
			expect(axes).toContain("cancel-then-reuse (no leaked state)");
			expect(axes).toContain("large tool output buffering");
			expect(axes).toContain("tool event multi-tool ordering");
			expect(axes).toContain("tool event isError on success");
			expect(axes).toContain("tool event isError on failure");
			expect(axes).toContain("tool event payload shape");
			expect(axes).toContain("network policy (allowed destination succeeds)");
			expect(axes).toContain("network policy (denied destination fails)");
			expect(axes).toContain("network policy (selective port allow/deny)");
			expect(axes).toContain("filesystem edge case (missing file read)");
			expect(axes).toContain("filesystem edge case (overwrite existing file)");
			expect(axes).toContain("filesystem edge case (non-ASCII Unicode filename)");
			expect(axes).toContain("filesystem edge case (binary-like content)");
			expect(axes).toContain("filesystem edge case (large payload)");
			expect(axes).toContain("session resume (SDK second turn observes prior state)");
			expect(axes).toContain("session resume (PTY second turn observes prior state)");
		});

		it("matrix limitations are documented for mock-only axes", () => {
			const mockEntries = COVERAGE_MATRIX.filter(
				(e) => e.providerMode === "mock",
			);
			for (const entry of mockEntries) {
				expect(
					entry.limitation,
					`Mock-provider axis "${entry.axis}" must document its limitation`,
				).toBeTruthy();
			}
		});
	},
);
