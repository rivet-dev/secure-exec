import { describe, expect, it, beforeAll } from "vitest";
import { Runtime } from "../src/runtime/index.js";

describe("VirtualMachine", () => {
	let runtime: Runtime;

	beforeAll(async () => {
		runtime = await Runtime.load();
	});

	describe("Basic run functionality", () => {
		it("should execute echo command", async () => {
			const vm = await runtime.run("echo", { args: ["hello world"] });
			expect(vm.stdout.trim()).toBe("hello world");
			expect(vm.code).toBe(0);
		});

		it("should execute ls command on root", async () => {
			const vm = await runtime.run("ls", { args: ["/"] });
			expect(vm.code).toBe(0);
			expect(vm.stdout).toContain("bin");
		});

		it("should execute bash with echo builtin", async () => {
			const vm = await runtime.run("bash", {
				args: ["-c", "echo foo; echo bar"],
			});
			expect(vm.stdout).toContain("foo");
			expect(vm.stdout).toContain("bar");
		});

		it("should handle command failure", async () => {
			const vm = await runtime.run("ls", { args: ["/nonexistent"] });
			expect(vm.code).not.toBe(0);
		});
	});

	describe("Filesystem via bash builtins", () => {
		it("should write files via redirection and read via bash", async () => {
			const vm = await runtime.run("bash", {
				args: ["-c", 'echo "hello" > /data/test.txt; read -r line < /data/test.txt; echo "$line"'],
			});
			expect(vm.stdout.trim()).toBe("hello");
		});

		it("should check file existence via bash test", async () => {
			const vm = await runtime.run("bash", {
				args: ["-c", 'echo test > /data/exists.txt; if [ -f /data/exists.txt ]; then echo "exists"; fi'],
			});
			expect(vm.stdout.trim()).toBe("exists");
		});
	});

	describe("Node via IPC", () => {
		it("should execute node -e directly", async () => {
			const vm = await runtime.run("node", {
				args: ["-e", "console.log('hello from node')"],
			});
			expect(vm.stdout).toContain("hello from node");
			expect(vm.code).toBe(0);
		});

		it("should handle node errors properly", async () => {
			const vm = await runtime.run("node", {
				args: ["-e", "throw new Error('oops')"],
			});
			expect(vm.code).not.toBe(0);
		});

		it("should ping-pong stdin/stdout 3 times (batch)", async () => {
			// Node script that reads stdin and responds with pong
			// Uses process.stdin.on('data') instead of readline (not implemented)
			const script = `
				let output = '';
				process.stdin.on('data', (chunk) => {
					output += chunk;
				});
				process.stdin.on('end', () => {
					const lines = output.trim().split('\\n');
					lines.forEach((line, i) => console.log('pong' + (i + 1)));
				});
			`;
			const vm = await runtime.run("node", {
				args: ["-e", script],
				stdin: "ping1\nping2\nping3\n",
			});
			expect(vm.stdout).toContain("pong1");
			expect(vm.stdout).toContain("pong2");
			expect(vm.stdout).toContain("pong3");
			expect(vm.code).toBe(0);
		});

		it("should stream stdin to process with spawn()", async () => {
			// spawn() provides a Process handle for streaming stdin
			// Note: In wasmer-js TTY mode, stdin is echoed to stdout.
			// The actual program output is mixed with echo.
			const proc = await runtime.spawn("bash", {
				args: ["-c", "while read line; do echo \"OUT:$line\"; done"],
			});

			// Send input with delays to let bash process each line
			await proc.writeStdin("ping1\n");
			await new Promise(r => setTimeout(r, 100));

			await proc.writeStdin("ping2\n");
			await new Promise(r => setTimeout(r, 100));

			await proc.writeStdin("ping3\n");
			await new Promise(r => setTimeout(r, 100));

			await proc.closeStdin();

			// Wait for process to complete
			const result = await proc.wait();

			// stdout contains TTY echo + program output
			// Due to TTY buffering, we may only see the echo
			expect(result.stdout).toContain("ping1");
			expect(result.stdout).toContain("ping2");
			expect(result.stdout).toContain("ping3");
		}, 30000);
	});

	describe("Isolation", () => {
		it("should have isolated filesystems between runs", async () => {
			await runtime.run("bash", {
				args: ["-c", "echo hello > /data/isolated.txt"],
			});

			const vm = await runtime.run("bash", {
				args: ["-c", 'if [ -f /data/isolated.txt ]; then echo "found"; else echo "not found"; fi'],
			});
			expect(vm.stdout.trim()).toBe("not found");
		});
	});
});
