export type ModuleLoadScenarioKind =
	| "startup"
	| "end_to_end"
	| "lifecycle"
	| "import";

export interface ModuleLoadScenarioDefinition {
	id: string;
	title: string;
	target:
		| "microbench"
		| "hono"
		| "pdf_lib"
		| "jszip"
		| "pi_sdk"
		| "pi_cli";
	kind: ModuleLoadScenarioKind;
	description: string;
}

export const MODULE_LOAD_SCENARIOS: readonly ModuleLoadScenarioDefinition[] = [
	{
		id: "micro-empty-session",
		title: "Microbench Empty Session",
		target: "microbench",
		kind: "lifecycle",
		description:
			"Executes a no-op script to isolate fresh-session create, execute, and destroy overhead.",
	},
	{
		id: "micro-import-stream",
		title: "Microbench Import stream",
		target: "microbench",
		kind: "import",
		description:
			"Requires the hot Pi builtin `stream` once to isolate single-import bootstrap cost.",
	},
	{
		id: "micro-import-stream-web",
		title: "Microbench Import stream/web",
		target: "microbench",
		kind: "import",
		description:
			"Requires the hot Pi builtin `stream/web` once to isolate web-stream bootstrap cost.",
	},
	{
		id: "micro-import-crypto",
		title: "Microbench Import crypto",
		target: "microbench",
		kind: "import",
		description:
			"Requires the hot Pi builtin `crypto` once to isolate crypto bootstrap cost.",
	},
	{
		id: "micro-import-zlib",
		title: "Microbench Import zlib",
		target: "microbench",
		kind: "import",
		description:
			"Requires the hot Pi builtin `zlib` once to isolate compression bootstrap cost.",
	},
	{
		id: "micro-import-assert",
		title: "Microbench Import assert",
		target: "microbench",
		kind: "import",
		description:
			"Requires the hot Pi builtin `assert` once to isolate assertion/bootstrap cost.",
	},
	{
		id: "micro-import-url",
		title: "Microbench Import url",
		target: "microbench",
		kind: "import",
		description:
			"Requires the hot Pi builtin `url` once to isolate URL/bootstrap cost.",
	},
	{
		id: "micro-import-text-codec",
		title: "Microbench Import @borewit/text-codec",
		target: "microbench",
		kind: "import",
		description:
			"Dynamically imports the resolved `@borewit/text-codec` entry file to isolate projected package-file loading from the Pi startup path.",
	},
	{
		id: "hono-startup",
		title: "Hono Startup",
		target: "hono",
		kind: "startup",
		description: "Loads Hono and constructs a minimal app.",
	},
	{
		id: "hono-end-to-end",
		title: "Hono End-to-End",
		target: "hono",
		kind: "end_to_end",
		description:
			"Loads Hono, builds an app, serves a request, and reads the response.",
	},
	{
		id: "pdf-lib-startup",
		title: "pdf-lib Startup",
		target: "pdf_lib",
		kind: "startup",
		description:
			"Loads pdf-lib, creates a document, and embeds a standard font.",
	},
	{
		id: "pdf-lib-end-to-end",
		title: "pdf-lib End-to-End",
		target: "pdf_lib",
		kind: "end_to_end",
		description:
			"Creates a multi-page PDF with 50 form fields and serializes the document.",
	},
	{
		id: "jszip-startup",
		title: "JSZip Startup",
		target: "jszip",
		kind: "startup",
		description: "Loads JSZip, creates an archive, and stages a starter file.",
	},
	{
		id: "jszip-end-to-end",
		title: "JSZip End-to-End",
		target: "jszip",
		kind: "end_to_end",
		description:
			"Builds a representative nested archive and serializes it to a zip payload.",
	},
	{
		id: "pi-sdk-startup",
		title: "Pi SDK Startup",
		target: "pi_sdk",
		kind: "startup",
		description:
			"Loads the Pi SDK entry module and inspects its exported surface.",
	},
	{
		id: "pi-sdk-end-to-end",
		title: "Pi SDK End-to-End",
		target: "pi_sdk",
		kind: "end_to_end",
		description:
			"Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.",
	},
	{
		id: "pi-cli-startup",
		title: "Pi CLI Startup",
		target: "pi_cli",
		kind: "startup",
		description: "Boots the Pi CLI help path inside the sandbox.",
	},
	{
		id: "pi-cli-end-to-end",
		title: "Pi CLI End-to-End",
		target: "pi_cli",
		kind: "end_to_end",
		description:
			"Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.",
	},
] as const;

export type ModuleLoadScenarioId = (typeof MODULE_LOAD_SCENARIOS)[number]["id"];

export function getModuleLoadScenario(
	id: string,
): ModuleLoadScenarioDefinition {
	const scenario = MODULE_LOAD_SCENARIOS.find((entry) => entry.id === id);
	if (!scenario) {
		throw new Error(`Unknown module-load benchmark scenario: ${id}`);
	}
	return scenario;
}
