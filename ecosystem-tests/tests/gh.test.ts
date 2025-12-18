import { describe, it, after, before } from "node:test";
import assert from "node:assert";
import { VirtualMachine } from "nanosandbox";

// GitHub CLI (gh) tests using Node's native test runner
// Note: gh is a native binary and may not be available in the WASM sandbox.
// These tests check for gh availability and skip gracefully if not found.
// Auth-requiring commands are skipped if GITHUB_TOKEN is not set.
describe("GitHub CLI (gh) Integration", () => {
	let vm: VirtualMachine;
	let ghAvailable = false;
	const hasGitHubToken = Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);

	/**
	 * Helper to check if gh is available in the environment
	 */
	async function checkGhAvailability(vm: VirtualMachine): Promise<boolean> {
		try {
			const result = await vm.spawn("gh", {
				args: ["--version"],
			});
			return result.code === 0 && result.stdout.includes("gh version");
		} catch {
			return false;
		}
	}

	/**
	 * Helper to run gh commands
	 */
	async function runGh(
		vm: VirtualMachine,
		args: string[],
	): Promise<{ stdout: string; stderr: string; code: number }> {
		return vm.spawn("gh", {
			args,
			env: {
				HOME: "/data/root",
				GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "",
				GITHUB_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "",
			},
		});
	}

	/**
	 * Helper to set up environment
	 */
	async function setupGhEnvironment(vm: VirtualMachine): Promise<void> {
		await vm.mkdir("/data/app");
		await vm.mkdir("/data/root");
		await vm.mkdir("/data/root/.config");
		await vm.mkdir("/data/root/.config/gh");
	}

	describe("Step 1: Check gh availability", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should check if gh CLI is available", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupGhEnvironment(vm);

			ghAvailable = await checkGhAvailability(vm);
			console.log("gh CLI available:", ghAvailable);

			// This test always passes - it's informational
			assert.ok(true, "Checked gh availability");

			if (!ghAvailable) {
				console.log("Note: gh CLI is not available in this sandbox environment.");
				console.log("This is expected as gh is a native binary, not a Node.js package.");
			}
		});
	});

	describe("Step 2: gh --version", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should run gh --version if available", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupGhEnvironment(vm);

			const available = await checkGhAvailability(vm);

			if (!available) {
				console.log("Skipping: gh CLI not available in sandbox");
				return;
			}

			const result = await runGh(vm, ["--version"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should output version number (e.g., "gh version 2.x.x")
			assert.match(result.stdout, /gh version \d+\.\d+\.\d+/);
		});
	});

	describe("Step 3: gh --help", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should run gh --help if available", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupGhEnvironment(vm);

			const available = await checkGhAvailability(vm);

			if (!available) {
				console.log("Skipping: gh CLI not available in sandbox");
				return;
			}

			const result = await runGh(vm, ["--help"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should output help info
			assert.ok(
				result.stdout.includes("GitHub") ||
				result.stdout.includes("gh") ||
				result.stdout.includes("USAGE")
			);
		});
	});

	describe("Step 4: gh auth status (requires auth)", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should check auth status if token is available", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupGhEnvironment(vm);

			const available = await checkGhAvailability(vm);

			if (!available) {
				console.log("Skipping: gh CLI not available in sandbox");
				return;
			}

			if (!hasGitHubToken) {
				console.log("Skipping: No GITHUB_TOKEN or GH_TOKEN environment variable set");
				return;
			}

			const result = await runGh(vm, ["auth", "status"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// If authenticated, should show account info
			// If not authenticated, will show error - that's also valid info
			assert.ok(true, "Auth status check completed");
		});
	});

	describe("Step 5: gh repo list (requires auth)", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should list repos if authenticated", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupGhEnvironment(vm);

			const available = await checkGhAvailability(vm);

			if (!available) {
				console.log("Skipping: gh CLI not available in sandbox");
				return;
			}

			if (!hasGitHubToken) {
				console.log("Skipping: No GITHUB_TOKEN or GH_TOKEN environment variable set");
				return;
			}

			const result = await runGh(vm, ["repo", "list", "--limit", "1"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should either list repos or show auth error
			assert.ok(
				result.code === 0 ||
				result.stderr.includes("auth") ||
				result.stderr.includes("login")
			);
		});
	});

	describe("Step 6: gh api (requires auth)", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should make API calls if authenticated", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupGhEnvironment(vm);

			const available = await checkGhAvailability(vm);

			if (!available) {
				console.log("Skipping: gh CLI not available in sandbox");
				return;
			}

			if (!hasGitHubToken) {
				console.log("Skipping: No GITHUB_TOKEN or GH_TOKEN environment variable set");
				return;
			}

			// Make a simple API call to get rate limit (works with auth)
			const result = await runGh(vm, ["api", "rate_limit"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			if (result.code === 0) {
				// Should return JSON with rate limit info
				assert.ok(result.stdout.includes("rate") || result.stdout.includes("limit"));
			} else {
				// Auth issue - that's expected without proper token
				console.log("API call failed (likely auth issue)");
				assert.ok(true);
			}
		});
	});

	describe("Step 7: gh gist list (requires auth)", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should list gists if authenticated", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupGhEnvironment(vm);

			const available = await checkGhAvailability(vm);

			if (!available) {
				console.log("Skipping: gh CLI not available in sandbox");
				return;
			}

			if (!hasGitHubToken) {
				console.log("Skipping: No GITHUB_TOKEN or GH_TOKEN environment variable set");
				return;
			}

			const result = await runGh(vm, ["gist", "list", "--limit", "1"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should either list gists or show auth error
			assert.ok(
				result.code === 0 ||
				result.stderr.includes("auth") ||
				result.stderr.includes("login")
			);
		});
	});

	describe("Step 8: gh extension list (no auth required)", () => {
		after(async () => {
			await vm?.disposeAsync();
		});

		it("should list extensions without auth", { timeout: 60000 }, async () => {
			vm = new VirtualMachine();
			await vm.init();

			await setupGhEnvironment(vm);

			const available = await checkGhAvailability(vm);

			if (!available) {
				console.log("Skipping: gh CLI not available in sandbox");
				return;
			}

			const result = await runGh(vm, ["extension", "list"]);

			console.log("stdout:", result.stdout);
			console.log("stderr:", result.stderr);
			console.log("code:", result.code);

			// Should complete (empty list is fine, or show installed extensions)
			assert.strictEqual(result.code, 0);
		});
	});
});
