import { describe, expect, it, beforeAll } from "vitest";
import { Runtime } from "../src/runtime/index.js";

describe("Host Exec Basic", () => {
	let runtime: Runtime;

	beforeAll(async () => {
		runtime = await Runtime.load();
	});

	it("bash echo works (no host_exec)", async () => {
		const vm = await runtime.run("bash", { args: ["-c", "echo hello"] });
		expect(vm.stdout.trim()).toBe("hello");
		expect(vm.code).toBe(0);
	}, 10000);

	it("simple node -e (uses host_exec)", async () => {
		// This should use host_exec to delegate to NodeProcess
		const vm = await runtime.run("node", { args: ["-e", "console.log('hello from node')"] });
		console.log("node stdout:", JSON.stringify(vm.stdout));
		console.log("node stderr:", JSON.stringify(vm.stderr));
		console.log("node code:", vm.code);
		expect(vm.stdout.trim()).toBe("hello from node");
	}, 10000);
});
