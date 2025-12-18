import { describe, it, after } from "node:test";
import assert from "node:assert";
import { VirtualMachine } from "nanosandbox";

// TypeScript compiler (tsc) tests using Node's native test runner
describe("TSC CLI Integration", () => {
	let vm: VirtualMachine;

	/**
	 * Helper to run npm to install typescript
	 */
	async function installTypeScript(vm: VirtualMachine): Promise<void> {
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

    process.argv = ['node', 'npm', 'install', 'typescript', '--prefix', '/data/tools'];

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
		await vm.writeFile("/data/tmp/install-typescript.js", script);

		const result = await vm.spawn("node", {
			args: ["/data/tmp/install-typescript.js"],
			env: {
				HOME: "/data/root",
				npm_config_cache: "/data/root/.npm",
				npm_config_userconfig: "/data/root/.npmrc",
				npm_config_logs_max: "0",
			},
		});

		if (result.code !== 0) {
			throw new Error(`Failed to install typescript: ${result.stderr}`);
		}
	}

	/**
	 * Helper to run tsc commands
	 */
	async function runTsc(
		vm: VirtualMachine,
		args: string[],
		cwd: string = "/data/app",
	): Promise<{ stdout: string; stderr: string; code: number }> {
		const script = `
(async function() {
  try {
    process.chdir('${cwd}');
    process.argv = ['node', 'tsc', ${args.map((a) => JSON.stringify(a)).join(", ")}];

    // tsc has a bin entry point
    require('/data/tools/node_modules/typescript/bin/tsc');
  } catch (e) {
    // tsc exits with code 1 for type errors, which is expected
    if (e.code !== 'ERR_PROCESS_EXIT' && !e.message.includes('process.exit')) {
      console.error('Error:', e.message);
      process.exitCode = 1;
    }
  }
})();
`;
		await vm.writeFile("/data/tmp/tsc-runner.js", script);

		return vm.spawn("node", {
			args: ["/data/tmp/tsc-runner.js"],
			env: {
				HOME: "/data/root",
			},
		});
	}

	/**
	 * Helper to set up tsc environment
	 */
	async function setupTscEnvironment(vm: VirtualMachine): Promise<void> {
		await vm.mkdir("/data/app");
		await vm.mkdir("/data/root");
		await vm.mkdir("/data/root/.npm");
		await vm.mkdir("/data/root/.npm/_logs");
		await vm.writeFile("/data/root/.npmrc", "");
	}

	describe("Step 1: tsc --version", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should run tsc --version and return version string", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupTscEnvironment(vm);
			await installTypeScript(vm);

			const result = await runTsc(vm, ["--version"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should output version number (e.g., "Version 5.x.x")
			assert.ok(
				result.stdout.includes("Version") ||
				result.stdout.match(/\d+\.\d+\.\d+/)
			);
		});
	});

	describe("Step 2: tsc --help", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should run tsc --help and show usage", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupTscEnvironment(vm);
			await installTypeScript(vm);

			const result = await runTsc(vm, ["--help"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should output help info
			assert.ok(
				result.stdout.includes("tsc") ||
				result.stdout.includes("--") ||
				result.stdout.includes("Options")
			);
		});
	});

	describe("Step 3: tsc --init", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should initialize a tsconfig.json", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupTscEnvironment(vm);
			await installTypeScript(vm);
			await vm.writeFile(
				"/data/app/package.json",
				JSON.stringify({ name: "test-app", version: "1.0.0" }),
			);

			const result = await runTsc(vm, ["--init"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Check if tsconfig.json was created
			const tsconfigExists = await vm.exists("/data/app/tsconfig.json");
			console.log("tsconfig.json exists:", tsconfigExists);
			assert.strictEqual(tsconfigExists, true);

			// Read and verify it's valid JSON
			const tsconfigContent = await vm.readFile("/data/app/tsconfig.json");
			// Remove comments from tsconfig (tsc generates with comments)
			const cleaned = tsconfigContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
			const tsconfig = JSON.parse(cleaned);
			assert.ok(tsconfig.compilerOptions);
		});
	});

	describe("Step 4: tsc compile valid TypeScript", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should compile a TypeScript file to JavaScript", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupTscEnvironment(vm);
			await installTypeScript(vm);

			// Create a simple TypeScript file
			await vm.writeFile(
				"/data/app/hello.ts",
				`const greeting: string = "Hello, TypeScript!";
console.log(greeting);

function add(a: number, b: number): number {
  return a + b;
}

console.log(add(2, 3));
`,
			);

			const result = await runTsc(vm, ["hello.ts"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Check if .js file was created
			const jsExists = await vm.exists("/data/app/hello.js");
			console.log("hello.js exists:", jsExists);
			assert.strictEqual(jsExists, true);

			// Verify the compiled output
			const jsContent = await vm.readFile("/data/app/hello.js");
			assert.ok(jsContent.includes("Hello, TypeScript!"));
			assert.ok(jsContent.includes("function add"));
		});
	});

	describe("Step 5: tsc detect type errors", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should report type errors in invalid TypeScript", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupTscEnvironment(vm);
			await installTypeScript(vm);

			// Create a TypeScript file with type errors
			await vm.writeFile(
				"/data/app/error.ts",
				`const num: number = "not a number"; // Type error!

function greet(name: string): void {
  console.log(\`Hello, \${name}\`);
}

greet(123); // Type error - number instead of string
`,
			);

			const result = await runTsc(vm, ["error.ts", "--noEmit"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should report type errors (exit code 1 or error messages)
			assert.ok(
				result.code !== 0 ||
				result.stdout.includes("error") ||
				result.stderr.includes("error")
			);
		});
	});

	describe("Step 6: tsc with tsconfig.json", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should compile using tsconfig.json settings", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupTscEnvironment(vm);
			await installTypeScript(vm);

			// Create a tsconfig.json
			await vm.writeFile(
				"/data/app/tsconfig.json",
				JSON.stringify(
					{
						compilerOptions: {
							target: "ES2020",
							module: "commonjs",
							strict: true,
							outDir: "./dist",
							rootDir: "./src",
						},
						include: ["src/**/*"],
					},
					null,
					2,
				),
			);

			// Create source directory and file
			await vm.mkdir("/data/app/src");
			await vm.writeFile(
				"/data/app/src/index.ts",
				`interface User {
  name: string;
  age: number;
}

const user: User = {
  name: "Alice",
  age: 30,
};

console.log(\`User: \${user.name}, Age: \${user.age}\`);
`,
			);

			const result = await runTsc(vm, []);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Check if output was created in dist folder
			const distExists = await vm.exists("/data/app/dist");
			console.log("dist folder exists:", distExists);

			const indexJsExists = await vm.exists("/data/app/dist/index.js");
			console.log("dist/index.js exists:", indexJsExists);

			assert.strictEqual(result.code, 0);
			assert.strictEqual(distExists, true);
			assert.strictEqual(indexJsExists, true);
		});
	});

	describe("Step 7: tsc --showConfig", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should show effective configuration", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupTscEnvironment(vm);
			await installTypeScript(vm);

			// Create a tsconfig.json
			await vm.writeFile(
				"/data/app/tsconfig.json",
				JSON.stringify(
					{
						compilerOptions: {
							target: "ES2020",
							strict: true,
						},
					},
					null,
					2,
				),
			);

			const result = await runTsc(vm, ["--showConfig"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should output the configuration
			assert.ok(
				result.stdout.includes("compilerOptions") ||
				result.stdout.includes("target")
			);
		});
	});
});
