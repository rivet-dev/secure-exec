import { describe, expect, it } from "vitest";
import {
	getModuleLoadScenario,
	MODULE_LOAD_SCENARIOS,
} from "../benchmarks/module-load/scenario-catalog.js";

describe("module-load scenario catalog", () => {
	it("includes paired startup and end-to-end scenarios for pdf-lib and jszip", () => {
		const ids = new Set(MODULE_LOAD_SCENARIOS.map((scenario) => scenario.id));

		expect(ids.has("pdf-lib-startup")).toBe(true);
		expect(ids.has("pdf-lib-end-to-end")).toBe(true);
		expect(ids.has("jszip-startup")).toBe(true);
		expect(ids.has("jszip-end-to-end")).toBe(true);
	});

	it("describes representative document and archive workloads", () => {
		expect(getModuleLoadScenario("pdf-lib-end-to-end")).toMatchObject({
			target: "pdf_lib",
			kind: "end_to_end",
			title: "pdf-lib End-to-End",
		});
		expect(getModuleLoadScenario("jszip-end-to-end")).toMatchObject({
			target: "jszip",
			kind: "end_to_end",
			title: "JSZip End-to-End",
		});
	});
});
