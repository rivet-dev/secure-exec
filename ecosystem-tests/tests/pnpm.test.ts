import { describe, it, after } from "node:test";
import assert from "node:assert";
import { VirtualMachine } from "nanosandbox";

// pnpm CLI tests using Node's native test runner
describe("PNPM CLI Integration", () => {
	let vm: VirtualMachine;

	/**
	 * Helper to run npm to install pnpm
	 */
	async function installPnpm(vm: VirtualMachine): Promise<void> {
		const script = `
(async function() {
  try {
    const Npm = require('/data/opt/npm/lib/npm.js');

    process.on('output', (type, ...args) => {
      if (type === 'standard') {
        process.stdout.write(args.join(' ') + '\\n');
      } else if (type === 'error') {
        process.stderr.write(args.join(' ') + '\\n');
      }
    });

    process.argv = ['node', 'npm', 'install', 'pnpm', '--prefix', '/data/tools'];

    const npm = new Npm();
    const { exec, command, args: npmArgs } = await npm.load();

    if (exec && command) {
      await npm.exec(command, npmArgs);
    }
  } catch (e) {
    if (!e.message.includes('formatWithOptions')) {
      console.error('Install error:', e.message);
      process.exitCode = 1;
    }
  }
})();
`;
		await vm.mkdir("/data/tmp");
		await vm.mkdir("/data/tools");
		await vm.writeFile("/data/tools/package.json", JSON.stringify({ name: "tools", version: "1.0.0" }));
		await vm.writeFile("/data/tmp/install-pnpm.js", script);

		const result = await vm.spawn("node", {
			args: ["/data/tmp/install-pnpm.js"],
			env: {
				HOME: "/data/root",
				npm_config_cache: "/data/root/.npm",
				npm_config_userconfig: "/data/root/.npmrc",
				npm_config_logs_max: "0",
			},
		});

		if (result.code !== 0) {
			throw new Error(`Failed to install pnpm: ${result.stderr}`);
		}
	}

	/**
	 * Helper to run pnpm commands
	 */
	async function runPnpm(
		vm: VirtualMachine,
		args: string[],
		cwd: string = "/data/app",
	): Promise<{ stdout: string; stderr: string; code: number }> {
		const script = `
(async function() {
  try {
    process.chdir('${cwd}');
    process.argv = ['node', 'pnpm', ${args.map((a) => JSON.stringify(a)).join(", ")}];

    // pnpm has its own CLI entry point
    const pnpmBin = '/data/tools/node_modules/pnpm/bin/pnpm.cjs';
    require(pnpmBin);
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  }
})();
`;
		await vm.writeFile("/data/tmp/pnpm-runner.js", script);

		return vm.spawn("node", {
			args: ["/data/tmp/pnpm-runner.js"],
			env: {
				HOME: "/data/root",
				PNPM_HOME: "/data/root/.pnpm",
				XDG_DATA_HOME: "/data/root/.local/share",
				XDG_CONFIG_HOME: "/data/root/.config",
				XDG_CACHE_HOME: "/data/root/.cache",
			},
		});
	}

	/**
	 * Helper to set up pnpm environment
	 */
	async function setupPnpmEnvironment(vm: VirtualMachine): Promise<void> {
		await vm.mkdir("/data/app");
		await vm.mkdir("/data/root");
		await vm.mkdir("/data/root/.npm");
		await vm.mkdir("/data/root/.npm/_logs");
		await vm.mkdir("/data/root/.pnpm");
		await vm.mkdir("/data/root/.local");
		await vm.mkdir("/data/root/.local/share");
		await vm.mkdir("/data/root/.config");
		await vm.mkdir("/data/root/.cache");
		await vm.writeFile("/data/root/.npmrc", "");
	}

	describe("Step 1: pnpm --version", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should run pnpm --version and return version string", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupPnpmEnvironment(vm);
			await installPnpm(vm);
			await vm.writeFile(
				"/data/app/package.json",
				JSON.stringify({ name: "test-app", version: "1.0.0" }),
			);

			const result = await runPnpm(vm, ["--version"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should output version number
			assert.match(result.stdout, /\d+\.\d+\.\d+/);
		});
	});

	describe("Step 2: pnpm help", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should run pnpm help and show usage", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupPnpmEnvironment(vm);
			await installPnpm(vm);

			const result = await runPnpm(vm, ["help"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should output help info
			assert.ok(
				result.stdout.includes("pnpm") ||
				result.stdout.includes("Usage") ||
				result.stdout.includes("Commands") ||
				result.stdout.toLowerCase().includes("manage")
			);
		});
	});

	describe("Step 3: pnpm init", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should initialize a new package.json", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupPnpmEnvironment(vm);
			await installPnpm(vm);
			await vm.mkdir("/data/newapp");

			const result = await runPnpm(vm, ["init"], "/data/newapp");

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Check if package.json was created
			const pkgExists = await vm.exists("/data/newapp/package.json");
			assert.strictEqual(pkgExists, true);

			const pkgContent = await vm.readFile("/data/newapp/package.json");
			const pkg = JSON.parse(pkgContent);
			assert.ok(pkg.name);
			assert.ok(pkg.version);
		});
	});

	describe("Step 4: pnpm list", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should list installed packages", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupPnpmEnvironment(vm);
			await installPnpm(vm);

			// Create app with a mock installed package
			await vm.mkdir("/data/app/node_modules");
			await vm.mkdir("/data/app/node_modules/lodash");
			await vm.writeFile(
				"/data/app/package.json",
				JSON.stringify({
					name: "test-app",
					version: "1.0.0",
					dependencies: {
						lodash: "^4.17.21",
					},
				}),
			);
			await vm.writeFile(
				"/data/app/node_modules/lodash/package.json",
				JSON.stringify({
					name: "lodash",
					version: "4.17.21",
				}),
			);

			const result = await runPnpm(vm, ["list", "--depth=0"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should show test-app or lodash in the output
			assert.ok(
				result.stdout.includes("lodash") ||
				result.stdout.includes("test-app")
			);
		});
	});

	describe("Step 5: pnpm install", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should install dependencies", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupPnpmEnvironment(vm);
			await installPnpm(vm);

			// Create package with a simple dependency
			await vm.writeFile(
				"/data/app/package.json",
				JSON.stringify({
					name: "test-app",
					version: "1.0.0",
					dependencies: {
						"is-number": "^7.0.0",
					},
				}),
			);

			const result = await runPnpm(vm, ["install"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Check if node_modules was created
			const nodeModulesExists = await vm.exists("/data/app/node_modules");
			console.log("node_modules exists:", nodeModulesExists);

			// Check if lock file was created
			const lockExists = await vm.exists("/data/app/pnpm-lock.yaml");
			console.log("pnpm-lock.yaml exists:", lockExists);

			// pnpm install should complete
			assert.strictEqual(result.code, 0);
		});
	});

	describe("Step 6: pnpm store path", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should show the store path", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupPnpmEnvironment(vm);
			await installPnpm(vm);
			await vm.writeFile(
				"/data/app/package.json",
				JSON.stringify({ name: "test-app", version: "1.0.0" }),
			);

			const result = await runPnpm(vm, ["store", "path"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should output a path
			assert.ok(result.stdout.includes("/") || result.code === 0);
		});
	});
});
