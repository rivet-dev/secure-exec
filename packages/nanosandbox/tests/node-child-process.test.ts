import { describe, expect, it, beforeAll } from "vitest";
import { Runtime } from "../src/runtime/index.js";

/**
 * Comprehensive tests for child process spawning from sandboxed Node.js.
 *
 * When sandboxed Node.js code calls child_process functions, child processes
 * run as actual WASM instances from the runtime package.
 *
 * ## Working: spawnSync for basic commands
 *
 * The wasix-runtime is compiled with `cargo wasix build` which provides full
 * WASIX subprocess support. Child processes spawn natively within WASIX.
 *
 * ## Known Issues
 *
 * 1. Environment variable passing to child processes doesn't work yet
 * 2. Async spawn() tests are skipped (sandbox exits before callbacks fire)
 */
describe("Child Process from Sandboxed Node", () => {
	let runtime: Runtime;

	beforeAll(async () => {
		runtime = await Runtime.load();
	});

	describe("spawnSync", () => {
		it("should spawn echo and capture stdout", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				const result = spawnSync('echo', ['hello', 'world']);
				console.log('stdout:', result.stdout.toString().trim());
				console.log('status:', result.status);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("stdout: hello world");
			expect(vm.stdout).toContain("status: 0");
			expect(vm.code).toBe(0);
		}, 30000);

		it("should spawn ls and list directories", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				const result = spawnSync('ls', ['/']);
				const dirs = result.stdout.toString().trim().split('\\n');
				console.log('found dirs:', dirs.length);
				console.log('has bin:', dirs.includes('bin'));
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("has bin: true");
			expect(vm.code).toBe(0);
		}, 30000);

		it("should return status code from child", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				const result = spawnSync('false'); // 'false' command exits with 1
				console.log('status:', result.status);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("status: 1");
		}, 30000);

		it("should return status 0 from true command", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				const result = spawnSync('true'); // 'true' command exits with 0
				console.log('status:', result.status);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("status: 0");
		}, 30000);

		it("should handle command not found", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				const result = spawnSync('nonexistent_command_xyz');
				console.log('status:', result.status);
				console.log('has error:', result.error !== undefined || result.status !== 0);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("has error: true");
		}, 30000);
	});

	// Async streaming tests now work with the active handles mechanism
	// See: packages/sandboxed-node/docs/ACTIVE_HANDLES.md
	describe("spawn (streaming)", () => {
		it("should spawn and stream stdout via events", async () => {
			const script = `
				const { spawn } = require('child_process');
				const child = spawn('echo', ['streaming', 'output']);

				let output = '';
				child.stdout.on('data', (data) => {
					output += data.toString();
				});

				child.on('close', (code) => {
					console.log('output:', output.trim());
					console.log('code:', code);
				});
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("output: streaming output");
			expect(vm.stdout).toContain("code: 0");
		}, 30000);

		it("should spawn ls and stream directory listing", async () => {
			const script = `
				const { spawn } = require('child_process');
				const child = spawn('ls', ['/']);

				let output = '';
				child.stdout.on('data', (data) => {
					output += data.toString();
				});

				child.on('close', (code) => {
					console.log('has bin:', output.includes('bin'));
					console.log('code:', code);
				});
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("has bin: true");
			expect(vm.stdout).toContain("code: 0");
		}, 30000);

		it("should emit exit event with code", async () => {
			const script = `
				const { spawn } = require('child_process');
				const child = spawn('true');

				child.on('exit', (code, signal) => {
					console.log('exit code:', code);
					console.log('signal:', signal);
				});
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("exit code: 0");
		}, 30000);
	});

	// exec callback tests work with active handles, but bash -c returns wrong exit codes
	// in WASIX (code 45 instead of 0). Skipped until bash issue is fixed.
	// See tests/debug-bash-exit.test.ts for investigation details.
	describe.skip("exec (callback style)", () => {
		it("should execute command with callback", async () => {
			const script = `
				const { exec } = require('child_process');
				exec('echo hello from exec', (error, stdout, stderr) => {
					console.log('error:', error);
					console.log('stdout:', stdout.trim());
					console.log('stderr:', stderr);
				});
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("stdout: hello from exec");
			expect(vm.stdout).toContain("error: null");
		}, 30000);

		it("should return ChildProcess with pid", async () => {
			const script = `
				const { exec } = require('child_process');
				const child = exec('echo test');
				console.log('has pid:', typeof child.pid === 'number');
				console.log('has stdout:', child.stdout !== null);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("has pid: true");
			expect(vm.stdout).toContain("has stdout: true");
		}, 30000);
	});

	// Environment variable passing to child processes doesn't work yet
	// (env vars aren't being forwarded through the spawn request properly)
	describe.skip("environment variables", () => {
		it("should pass env vars to child via spawnSync", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				const result = spawnSync('printenv', ['MY_VAR'], {
					env: { MY_VAR: 'test_value_123', PATH: '/bin' }
				});
				console.log('env value:', result.stdout.toString().trim());
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("env value: test_value_123");
		}, 30000);

		// Async spawn test skipped - sandbox exits before callback fires
		it.skip("should pass env vars to child via spawn", async () => {
			const script = `
				const { spawn } = require('child_process');
				const child = spawn('printenv', ['CUSTOM_VAR'], {
					env: { CUSTOM_VAR: 'spawn_env_test', PATH: '/bin' }
				});

				let output = '';
				child.stdout.on('data', (data) => output += data.toString());
				child.on('close', () => console.log('env value:', output.trim()));
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("env value: spawn_env_test");
		}, 30000);
	});

	describe("stderr handling", () => {
		it("should capture stderr from child", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				// ls on nonexistent path should produce stderr
				const result = spawnSync('ls', ['/nonexistent_path_xyz']);
				console.log('has stderr:', result.stderr.toString().length > 0);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("has stderr: true");
		}, 30000);

		// Async spawn test skipped - sandbox exits before callback fires
		it.skip("should stream stderr via spawn events", async () => {
			const script = `
				const { spawn } = require('child_process');
				const child = spawn('ls', ['/nonexistent_path_xyz']);

				let stderr = '';
				child.stderr.on('data', (data) => stderr += data.toString());
				child.on('close', () => {
					console.log('has stderr:', stderr.length > 0);
				});
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("has stderr: true");
		}, 30000);
	});

	// Multiple command tests are skipped due to wasmer-js scheduler race condition.
	// Running more than ~2 WASM commands across separate test blocks causes hangs.
	describe.skip("multiple commands", () => {
		it("should run multiple sequential spawnSync calls", async () => {
			const script = `
				const { spawnSync } = require('child_process');

				const r1 = spawnSync('echo', ['first']);
				const r2 = spawnSync('echo', ['second']);
				const r3 = spawnSync('echo', ['third']);

				console.log('first:', r1.stdout.toString().trim());
				console.log('second:', r2.stdout.toString().trim());
				console.log('third:', r3.stdout.toString().trim());
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("first: first");
			expect(vm.stdout).toContain("second: second");
			expect(vm.stdout).toContain("third: third");
		}, 30000);

		it("should run different commands in sequence", async () => {
			const script = `
				const { spawnSync } = require('child_process');

				const echo = spawnSync('echo', ['hello']);
				const ls = spawnSync('ls', ['/']);
				const pwd = spawnSync('pwd');

				console.log('echo ok:', echo.status === 0);
				console.log('ls ok:', ls.status === 0);
				console.log('pwd ok:', pwd.status === 0);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("echo ok: true");
			expect(vm.stdout).toContain("ls ok: true");
			expect(vm.stdout).toContain("pwd ok: true");
		}, 30000);
	});

	// Coreutils tests are skipped due to wasmer-js scheduler race condition.
	// Running many test blocks causes scheduler hangs after the first few.
	describe.skip("various coreutils commands", () => {
		it("should run pwd command", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				const result = spawnSync('pwd');
				const output = result.stdout.toString().trim();
				console.log('pwd output:', output || '(empty)');
				console.log('status:', result.status);
				// pwd may fail if cwd is not set properly, just verify it runs
				console.log('ran:', result.error === undefined);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			// pwd might not output correctly in sandbox, just verify it ran without error
			expect(vm.stdout).toContain("ran: true");
		}, 30000);

		it("should run uname command", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				const result = spawnSync('uname');
				console.log('uname output:', result.stdout.toString().trim());
				console.log('status:', result.status);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("status: 0");
			// uname output varies but should exist
			expect(vm.stdout).toContain("uname output:");
		}, 30000);

		it("should run date command", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				const result = spawnSync('date');
				console.log('has output:', result.stdout.toString().length > 0);
				console.log('status:', result.status);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("has output: true");
			expect(vm.stdout).toContain("status: 0");
		}, 30000);

		it("should run cat with arguments", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				// Use printf to create input, then pipe to cat via bash
				// Since we can't easily pipe, just test cat --help
				const result = spawnSync('cat', ['--help']);
				console.log('has output:', result.stdout.toString().length > 0);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("has output: true");
		}, 30000);

		it("should run wc command", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				const result = spawnSync('wc', ['--help']);
				console.log('has output:', result.stdout.toString().length > 0);
				console.log('status:', result.status);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("has output: true");
			expect(vm.stdout).toContain("status: 0");
		}, 30000);

		it("should run head command", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				const result = spawnSync('head', ['--help']);
				console.log('has output:', result.stdout.toString().length > 0);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("has output: true");
		}, 30000);

		it("should run tail command", async () => {
			const script = `
				const { spawnSync } = require('child_process');
				const result = spawnSync('tail', ['--help']);
				console.log('has output:', result.stdout.toString().length > 0);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("has output: true");
		}, 30000);
	});
});
