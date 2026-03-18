import { describe, expect, it } from "vitest";
import {
	allowAll,
	allowAllChildProcess,
	allowAllEnv,
	allowAllFs,
	allowAllNetwork,
	envAccessAllowed,
	filterEnv,
	wrapCommandExecutor,
	wrapFileSystem,
	wrapNetworkAdapter,
} from "../src/shared/permissions.js";
import type {
	CommandExecutor,
	NetworkAdapter,
	Permissions,
	VirtualFileSystem,
} from "../src/types.js";

const baseFs: VirtualFileSystem = {
	readFile: async () => new Uint8Array([1]),
	readTextFile: async () => "ok",
	readDir: async () => ["a"],
	readDirWithTypes: async () => [{ name: "a", isDirectory: false }],
	writeFile: async () => undefined,
	createDir: async () => undefined,
	mkdir: async () => undefined,
	exists: async () => true,
	stat: async () => ({
		mode: 0o100644,
		size: 1,
		isDirectory: false,
		atimeMs: 0,
		mtimeMs: 0,
		ctimeMs: 0,
		birthtimeMs: 0,
	}),
	removeFile: async () => undefined,
	removeDir: async () => undefined,
	rename: async () => undefined,
};

const baseNetwork: NetworkAdapter = {
	httpServerListen: async () => ({
		address: { address: "127.0.0.1", family: "IPv4", port: 3000 },
	}),
	httpServerClose: async () => undefined,
	fetch: async (url) => ({
		ok: true,
		status: 200,
		statusText: "OK",
		headers: {},
		body: `fetched:${url}`,
		url,
		redirected: false,
	}),
	dnsLookup: async () => ({ address: "127.0.0.1", family: 4 }),
	httpRequest: async (url) => ({
		status: 200,
		statusText: "OK",
		headers: {},
		body: `http:${url}`,
		url,
	}),
};

const baseExecutor: CommandExecutor = {
	spawn: () => ({
		writeStdin: () => undefined,
		closeStdin: () => undefined,
		kill: () => undefined,
		wait: async () => 0,
	}),
};

function expectEacces(error: unknown, syscall: string, path: string): void {
	expect(error).toMatchObject({
		code: "EACCES",
		syscall,
		path,
	});
}

describe("permissions deny-by-default", () => {
	it("denies fs reads when fs checker is missing", async () => {
		const guardedFs = wrapFileSystem(baseFs);
		let thrown: unknown;
		try {
			await guardedFs.readFile("/secret.txt");
		} catch (error) {
			thrown = error;
		}
		expectEacces(thrown, "open", "/secret.txt");
	});

	it("denies network fetch when network checker is missing", async () => {
		const guardedNetwork = wrapNetworkAdapter(baseNetwork);
		let thrown: unknown;
		try {
			await guardedNetwork.fetch("https://example.com", { method: "GET" });
		} catch (error) {
			thrown = error;
		}
		expectEacces(thrown, "connect", "https://example.com");
	});

	it("denies child process spawn when childProcess checker is missing", () => {
		const guardedExecutor = wrapCommandExecutor(baseExecutor);
		let thrown: unknown;
		try {
			guardedExecutor.spawn("ls", ["-la"], {});
		} catch (error) {
			thrown = error;
		}
		expectEacces(thrown, "spawn", "ls");
	});

	it("denies env access when env checker is missing", () => {
		let thrown: unknown;
		try {
			envAccessAllowed(undefined, { op: "read", key: "SECRET_KEY" });
		} catch (error) {
			thrown = error;
		}
		expectEacces(thrown, "access", "SECRET_KEY");
	});
});

describe("filterEnv", () => {
	it("returns empty object when env checker is missing", () => {
		expect(filterEnv({ A: "1", B: "2" }, undefined)).toEqual({});
	});

	it("returns all env entries with explicit allow-all env checker", () => {
		expect(filterEnv({ A: "1", B: "2" }, allowAll)).toEqual({
			A: "1",
			B: "2",
		});
	});
});

describe("allow helpers", () => {
	it("allowAll is a valid Permissions object that allows every domain", async () => {
		const permissions: Permissions = allowAll;
		expect(permissions.fs).toBeTypeOf("function");
		expect(permissions.network).toBeTypeOf("function");
		expect(permissions.childProcess).toBeTypeOf("function");
		expect(permissions.env).toBeTypeOf("function");

		const guardedFs = wrapFileSystem(baseFs, allowAll);
		await expect(guardedFs.readFile("/safe.txt")).resolves.toEqual(
			new Uint8Array([1]),
		);

		const guardedNetwork = wrapNetworkAdapter(baseNetwork, allowAll);
		await expect(
			guardedNetwork.fetch("https://example.com", { method: "GET" }),
		).resolves.toMatchObject({ status: 200 });

		const guardedExecutor = wrapCommandExecutor(baseExecutor, allowAll);
		expect(() => guardedExecutor.spawn("echo", ["ok"], {})).not.toThrow();
		expect(() =>
			envAccessAllowed(allowAll, { op: "read", key: "VISIBLE" }),
		).not.toThrow();

		expect(
			allowAllChildProcess.childProcess?.({
				command: "echo",
				args: ["ok"],
			})?.allow,
		).toBe(true);
		expect(
			allowAllEnv.env?.({ op: "read", key: "VISIBLE", value: "1" })?.allow,
		).toBe(true);
	});

	it("per-domain helpers compose for selective access", async () => {
		const permissions = { ...allowAllFs, ...allowAllNetwork };
		const guardedFs = wrapFileSystem(baseFs, permissions);
		const guardedNetwork = wrapNetworkAdapter(baseNetwork, permissions);
		const guardedExecutor = wrapCommandExecutor(baseExecutor, permissions);

		await expect(guardedFs.readTextFile("/allowed.txt")).resolves.toBe("ok");
		await expect(
			guardedNetwork.fetch("https://example.com", { method: "GET" }),
		).resolves.toMatchObject({ status: 200 });

		let childThrown: unknown;
		try {
			guardedExecutor.spawn("echo", ["blocked"], {});
		} catch (error) {
			childThrown = error;
		}
		expectEacces(childThrown, "spawn", "echo");

		let envThrown: unknown;
		try {
			envAccessAllowed(permissions, { op: "read", key: "HIDDEN" });
		} catch (error) {
			envThrown = error;
		}
		expectEacces(envThrown, "access", "HIDDEN");
	});
});

describe("permissions deny-by-default write-side", () => {
	it("denies writeFile when fs checker is missing", async () => {
		const guardedFs = wrapFileSystem(baseFs);
		let thrown: unknown;
		try {
			await guardedFs.writeFile("/data.bin", new Uint8Array([1, 2]));
		} catch (error) {
			thrown = error;
		}
		expectEacces(thrown, "write", "/data.bin");
	});

	it("denies createDir when fs checker is missing", async () => {
		const guardedFs = wrapFileSystem(baseFs);
		let thrown: unknown;
		try {
			await guardedFs.createDir("/newdir");
		} catch (error) {
			thrown = error;
		}
		expectEacces(thrown, "mkdir", "/newdir");
	});

	it("denies removeFile when fs checker is missing", async () => {
		const guardedFs = wrapFileSystem(baseFs);
		let thrown: unknown;
		try {
			await guardedFs.removeFile("/secret.txt");
		} catch (error) {
			thrown = error;
		}
		expectEacces(thrown, "unlink", "/secret.txt");
	});
});

describe("custom permission checker", () => {
	it("fs checker returning { allow: false, reason } produces EACCES with reason", async () => {
		const permissions: Permissions = {
			fs: () => ({ allow: false, reason: "policy" }),
		};
		const guardedFs = wrapFileSystem(baseFs, permissions);
		let thrown: unknown;
		try {
			await guardedFs.writeFile("/blocked.txt", new Uint8Array([1]));
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toMatchObject({ code: "EACCES", syscall: "write" });
		expect((thrown as Error).message).toContain("policy");
	});

	it("normalizes paths with .. traversal before checking permissions", async () => {
		const checked: string[] = [];
		const permissions: Permissions = {
			fs: (req) => {
				checked.push(req.path);
				// Only allow /data/*
				return { allow: req.path.startsWith("/data") };
			},
		};
		const guardedFs = wrapFileSystem(baseFs, permissions);

		// /data/../etc/passwd normalizes to /etc/passwd — should be denied
		let thrown: unknown;
		try {
			await guardedFs.readFile("/data/../etc/passwd");
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toMatchObject({ code: "EACCES" });
		// The path passed to the checker should be normalized
		expect(checked[0]).toBe("/etc/passwd");
	});

	it("normalizes paths with double slashes and dot segments before checking", async () => {
		const checked: string[] = [];
		const permissions: Permissions = {
			fs: (req) => {
				checked.push(req.path);
				return { allow: true };
			},
		};
		const guardedFs = wrapFileSystem(baseFs, permissions);

		await guardedFs.readFile("/data//./subdir/../file.txt");
		expect(checked[0]).toBe("/data/file.txt");
	});

	it("normalizes paths for all fs operations (write, stat, readdir, etc.)", async () => {
		const checked: string[] = [];
		const permissions: Permissions = {
			fs: (req) => {
				checked.push(req.path);
				return { allow: true };
			},
		};
		const guardedFs = wrapFileSystem(baseFs, permissions);

		await guardedFs.writeFile("/a/../b/file", new Uint8Array());
		await guardedFs.stat("/c/./d/../e");
		await guardedFs.readDir("/x//y");
		expect(checked).toEqual(["/b/file", "/c/e", "/x/y"]);
	});

	it("childProcess checker receives cwd parameter in request", () => {
		const captured: { command: string; args: string[]; cwd?: string }[] = [];
		const permissions: Permissions = {
			childProcess: (req) => {
				captured.push({
					command: req.command,
					args: req.args,
					cwd: req.cwd,
				});
				return { allow: true };
			},
		};
		const guardedExecutor = wrapCommandExecutor(baseExecutor, permissions);
		guardedExecutor.spawn("node", ["-e", "1"], { cwd: "/app" });
		expect(captured).toHaveLength(1);
		expect(captured[0].cwd).toBe("/app");
	});
});
