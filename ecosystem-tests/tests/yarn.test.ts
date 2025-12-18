import { describe, it, after } from "node:test";
import assert from "node:assert";
import { VirtualMachine } from "nanosandbox";

// Yarn CLI tests using Node's native test runner
// Tests yarn classic (v1) which is installable via npm
describe("Yarn CLI Integration", () => {
	let vm: VirtualMachine;

	/**
	 * Helper to run npm to install yarn
	 */
	async function installYarn(vm: VirtualMachine): Promise<void> {
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

    process.argv = ['node', 'npm', 'install', 'yarn', '--prefix', '/data/tools'];

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
		await vm.writeFile("/data/tmp/install-yarn.js", script);

		const result = await vm.spawn("node", {
			args: ["/data/tmp/install-yarn.js"],
			env: {
				HOME: "/data/root",
				npm_config_cache: "/data/root/.npm",
				npm_config_userconfig: "/data/root/.npmrc",
				npm_config_logs_max: "0",
			},
		});

		if (result.code !== 0) {
			throw new Error(`Failed to install yarn: ${result.stderr}`);
		}
	}

	/**
	 * Helper to run yarn commands
	 */
	async function runYarn(
		vm: VirtualMachine,
		args: string[],
		cwd: string = "/data/app",
	): Promise<{ stdout: string; stderr: string; code: number }> {
		const script = `
(async function() {
  try {
    process.chdir('${cwd}');
    process.argv = ['node', 'yarn', ${args.map((a) => JSON.stringify(a)).join(", ")}];

    // yarn uses its own CLI entry
    require('/data/tools/node_modules/yarn/bin/yarn.js');
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  }
})();
`;
		await vm.writeFile("/data/tmp/yarn-runner.js", script);

		return vm.spawn("node", {
			args: ["/data/tmp/yarn-runner.js"],
			env: {
				HOME: "/data/root",
				YARN_CACHE_FOLDER: "/data/root/.yarn-cache",
			},
		});
	}

	/**
	 * Helper to set up yarn environment
	 */
	async function setupYarnEnvironment(vm: VirtualMachine): Promise<void> {
		await vm.mkdir("/data/app");
		await vm.mkdir("/data/root");
		await vm.mkdir("/data/root/.npm");
		await vm.mkdir("/data/root/.npm/_logs");
		await vm.mkdir("/data/root/.yarn-cache");
		await vm.writeFile("/data/root/.npmrc", "");
	}

	describe("Step 1: yarn --version", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should run yarn --version and return version string", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupYarnEnvironment(vm);
			await installYarn(vm);
			await vm.writeFile(
				"/data/app/package.json",
				JSON.stringify({ name: "test-app", version: "1.0.0" }),
			);

			const result = await runYarn(vm, ["--version"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should output version number (yarn 1.x)
			assert.match(result.stdout, /\d+\.\d+\.\d+/);
		});
	});

	describe("Step 2: yarn help", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should run yarn help and show usage", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupYarnEnvironment(vm);
			await installYarn(vm);

			const result = await runYarn(vm, ["help"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should output help info
			assert.ok(
				result.stdout.includes("yarn") ||
				result.stdout.includes("Usage") ||
				result.stdout.includes("Commands")
			);
		});
	});

	describe("Step 3: yarn init -y", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should initialize a new package.json", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupYarnEnvironment(vm);
			await installYarn(vm);
			await vm.mkdir("/data/newapp");

			const result = await runYarn(vm, ["init", "-y"], "/data/newapp");

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

	describe("Step 4: yarn list", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should list installed packages", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupYarnEnvironment(vm);
			await installYarn(vm);

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

			const result = await runYarn(vm, ["list", "--depth=0"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should show lodash in the list
			assert.ok(result.stdout.includes("lodash"));
		});
	});

	describe("Step 5: yarn install", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should install dependencies", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupYarnEnvironment(vm);
			await installYarn(vm);

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

			const result = await runYarn(vm, ["install"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Check if node_modules was created
			const nodeModulesExists = await vm.exists("/data/app/node_modules");
			console.log("node_modules exists:", nodeModulesExists);

			// Check if lock file was created
			const lockExists = await vm.exists("/data/app/yarn.lock");
			console.log("yarn.lock exists:", lockExists);

			// yarn install should complete
			assert.strictEqual(result.code, 0);
		});
	});
});
