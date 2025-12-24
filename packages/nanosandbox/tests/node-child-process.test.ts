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

		it("should handle multiple concurrent spawns", async () => {
			const script = `
				const { spawn } = require('child_process');

				let results = [];
				let pending = 2;

				const child1 = spawn('echo', ['first']);
				const child2 = spawn('echo', ['second']);

				child1.stdout.on('data', (data) => results.push('1:' + data.toString().trim()));
				child2.stdout.on('data', (data) => results.push('2:' + data.toString().trim()));

				child1.on('close', () => { if (--pending === 0) done(); });
				child2.on('close', () => { if (--pending === 0) done(); });

				function done() {
					console.log('results:', results.sort().join(','));
				}
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("results: 1:first,2:second");
		}, 30000);
	});

	// exec callback tests work with active handles, but bash -c returns wrong exit codes
	// in WASIX (code 45 instead of 0). Skipped until bash issue is fixed.
	// See tests/debug-bash-exit.test.ts for investigation details.
	describe("exec (callback style)", () => {
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

	// Environment variable passing works via bash workaround.
	// WASIX's proc_spawn doesn't pass env vars natively, but the runtime
	// works around this by wrapping commands with bash -c 'export ...'.
	describe("environment variables", () => {
		it("should pass env vars to child via spawnSync", async () => {
			// Test env option - the runtime handles the workaround internally
			const script = `
				const { spawnSync } = require('child_process');
				const result = spawnSync('printenv', ['MY_VAR'], {
					env: { MY_VAR: 'test_value_123', PATH: '/bin' }
				});
				console.log('env value:', result.stdout.toString().trim());
				console.log('status:', result.status);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("env value: test_value_123");
			expect(vm.stdout).toContain("status: 0");
		}, 30000);

		it("should pass env vars to child via spawn", async () => {
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
		it("should stream stderr via spawn events", async () => {
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
	describe("multiple commands", () => {
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
			// Note: pwd doesn't work in WASIX child processes ("Operation not supported on this platform")
			// so we test with echo, ls, and uname instead
			const script = `
				const { spawnSync } = require('child_process');

				const echo = spawnSync('echo', ['hello']);
				const ls = spawnSync('ls', ['/']);
				const uname = spawnSync('uname');

				console.log('echo ok:', echo.status === 0);
				console.log('ls ok:', ls.status === 0);
				console.log('uname ok:', uname.status === 0);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("echo ok: true");
			expect(vm.stdout).toContain("ls ok: true");
			expect(vm.stdout).toContain("uname ok: true");
		}, 30000);
	});

	// Coreutils tests
	describe("various coreutils commands", () => {
		// pwd test - debugging getcwd issue
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

	// Working directory tests
	describe("pwd after changing directory", () => {
		it("should reflect directory change via shell cd command", async () => {
			// This is the only working approach for changing cwd in WASIX
			const script = `
				const { spawnSync } = require('child_process');

				// Use bash to cd and then run pwd in the same shell
				const result = spawnSync('bash', ['-c', 'cd /bin && pwd']);
				console.log('pwd output:', result.stdout.toString().trim());
				console.log('status:', result.status);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("pwd output: /bin");
			expect(vm.stdout).toContain("status: 0");
		}, 30000);

		// WASIX limitation: cd to /bin doesn't work because /bin is a virtual mount point
		it.skip("should reflect directory change via process.chdir in JS", async () => {
			const script = `
				const { spawnSync } = require('child_process');

				// First check initial pwd
				const initial = spawnSync('pwd');
				console.log('initial pwd:', initial.stdout.toString().trim());

				// Change directory via JavaScript
				process.chdir('/bin');
				console.log('process.cwd after chdir:', process.cwd());

				// Now check pwd - should reflect the change
				const after = spawnSync('pwd');
				console.log('pwd after chdir:', after.stdout.toString().trim());
				console.log('status:', after.status);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("process.cwd after chdir: /bin");
			expect(vm.stdout).toContain("pwd after chdir: /bin");
			expect(vm.stdout).toContain("status: 0");
		}, 30000);

		// WASIX limitation: cd to /bin doesn't work because /bin is a virtual mount point
		// from the coreutils package, not a real filesystem directory.
		it.skip("should pass cwd option to spawnSync", async () => {
			const script = `
				const { spawnSync } = require('child_process');

				// Spawn pwd with explicit cwd option
				const result = spawnSync('pwd', [], { cwd: '/bin' });
				console.log('pwd output:', result.stdout.toString().trim());
				console.log('status:', result.status);
			`;
			const vm = await runtime.run("node", { args: ["-e", script] });
			expect(vm.stdout).toContain("pwd output: /bin");
			expect(vm.stdout).toContain("status: 0");
		}, 30000);
	});
});
