import { runInContext, createContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_CONSOLE_SERIALIZATION_BUDGET,
	formatConsoleArgs,
	getConsoleSetupCode,
	safeStringifyConsoleValue,
	type ConsoleSerializationBudget,
} from "../src/shared/console-formatter.js";

describe("console formatter", () => {
	it("serializes plain objects", () => {
		const value = { a: 1, b: "two" };
		const result = safeStringifyConsoleValue(
			value,
			DEFAULT_CONSOLE_SERIALIZATION_BUDGET,
		);
		expect(result).toBe('{"a":1,"b":"two"}');
	});

	it("serializes circular objects with marker", () => {
		const value: Record<string, unknown> = { name: "root" };
		value.self = value;

		const result = safeStringifyConsoleValue(
			value,
			DEFAULT_CONSOLE_SERIALIZATION_BUDGET,
		);
		expect(result).toContain("[Circular]");
	});

	it("formats null and undefined values", () => {
		const result = formatConsoleArgs(
			[null, undefined],
			DEFAULT_CONSOLE_SERIALIZATION_BUDGET,
		);
		expect(result).toBe("null undefined");
	});

	it("applies array and key budgets", () => {
		const budget: ConsoleSerializationBudget = {
			...DEFAULT_CONSOLE_SERIALIZATION_BUDGET,
			maxArrayLength: 2,
			maxKeys: 2,
		};

		const arrayResult = safeStringifyConsoleValue([1, 2, 3, 4], budget);
		expect(arrayResult).toBe('[1,2,"[Truncated]"]');

		const objectResult = safeStringifyConsoleValue(
			{ a: 1, b: 2, c: 3 },
			budget,
		);
		expect(objectResult).toContain('"[Truncated]"');
	});

	it("applies output-length budget", () => {
		const budget: ConsoleSerializationBudget = {
			...DEFAULT_CONSOLE_SERIALIZATION_BUDGET,
			maxOutputLength: 20,
		};

		const result = safeStringifyConsoleValue(
			{ message: "abcdefghijklmnopqrstuvwxyz" },
			budget,
		);
		expect(result.length).toBeLessThanOrEqual(20);
		expect(result).toContain("...");
	});

	it("wires generated setup code into isolate console methods", () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const context = createContext({
			_log: (msg: unknown) => {
				stdout.push(String(msg));
			},
			_error: (msg: unknown) => {
				stderr.push(String(msg));
			},
		});

		runInContext(getConsoleSetupCode(), context);
		runInContext(
			`
        const circular = { label: "x" };
        circular.self = circular;
        console.log(circular);
        console.error(circular);
      `,
			context,
		);

		expect(stdout[0]).toContain("[Circular]");
		expect(stderr[0]).toContain("[Circular]");
	});

	it("console.debug routes to _log (stdout)", () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const context = createContext({
			_log: (msg: unknown) => {
				stdout.push(String(msg));
			},
			_error: (msg: unknown) => {
				stderr.push(String(msg));
			},
		});

		runInContext(getConsoleSetupCode(), context);
		runInContext(`console.debug("debug-msg");`, context);

		expect(stdout).toHaveLength(1);
		expect(stdout[0]).toContain("debug-msg");
		expect(stderr).toHaveLength(0);
	});

	it("console.trace routes to _error (stderr)", () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const context = createContext({
			_log: (msg: unknown) => {
				stdout.push(String(msg));
			},
			_error: (msg: unknown) => {
				stderr.push(String(msg));
			},
		});

		runInContext(getConsoleSetupCode(), context);
		runInContext(`console.trace("trace-msg");`, context);

		expect(stderr).toHaveLength(1);
		expect(stderr[0]).toContain("trace-msg");
		expect(stdout).toHaveLength(0);
	});

	it("console.dir routes to _log (stdout)", () => {
		const stdout: string[] = [];
		const context = createContext({
			_log: (msg: unknown) => {
				stdout.push(String(msg));
			},
			_error: () => {},
		});

		runInContext(getConsoleSetupCode(), context);
		runInContext(`console.dir({ key: "val" });`, context);

		expect(stdout).toHaveLength(1);
		expect(stdout[0]).toContain("key");
	});

	it("console.table routes to _log (stdout)", () => {
		const stdout: string[] = [];
		const context = createContext({
			_log: (msg: unknown) => {
				stdout.push(String(msg));
			},
			_error: () => {},
		});

		runInContext(getConsoleSetupCode(), context);
		runInContext(`console.table([{ a: 1 }, { a: 2 }]);`, context);

		expect(stdout).toHaveLength(1);
		expect(stdout[0]).toContain("1");
	});
});
