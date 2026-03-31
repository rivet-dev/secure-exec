import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createV8Runtime } from "../src/runtime.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
	while (cleanupDirs.length > 0) {
		const dir = cleanupDirs.pop();
		if (dir) {
			await rm(dir, { recursive: true, force: true });
		}
	}
});

describe("runtime startup failure", () => {
	it("fails fast when the runtime exits before announcing its socket path", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "secure-exec-v8-startup-failure-"));
		cleanupDirs.push(dir);

		const binaryPath = path.join(dir, "fake-secure-exec-v8");
		await writeFile(binaryPath, "#!/bin/sh\nexit 17\n", "utf8");
		await chmod(binaryPath, 0o755);

		const startedAt = Date.now();
		await expect(createV8Runtime({ binaryPath })).rejects.toThrow(
			/before sending socket path/,
		);
		expect(Date.now() - startedAt).toBeLessThan(2_000);
	});
});
