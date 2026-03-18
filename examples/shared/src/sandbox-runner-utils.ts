import { execFile } from "node:child_process";
import { cp, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const LOOPBACK_HOST = "127.0.0.1";

type FetchLike = {
	network: {
		fetch(
			url: string,
			options: { method?: string },
		): Promise<{ status: number }>;
	};
};

export async function findOpenPort(host: string = LOOPBACK_HOST): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, host, () => resolve());
	});

	const address = server.address();
	const port = address && typeof address === "object" ? address.port : undefined;
	await new Promise<void>((resolve, reject) => {
		server.close((err) => {
			if (err) reject(err);
			else resolve();
		});
	});

	if (!port) {
		throw new Error("Failed to allocate an open port");
	}
	return port;
}

export async function waitForServer(
	proc: FetchLike,
	baseUrl: string,
): Promise<void> {
	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			const response = await proc.network.fetch(`${baseUrl}/`, { method: "GET" });
			if (response.status === 200) {
				return;
			}
		} catch {
			// Retry while server starts.
		}

		await new Promise((resolve) => setTimeout(resolve, 50));
	}

	throw new Error(`Timed out waiting for sandbox server at ${baseUrl}`);
}

export async function prepareRunnerInTempDir(
	sourceDir: string,
	entryRelativePath: string = path.join("src", "index.ts"),
): Promise<{ tempDir: string; entryPath: string }> {
	const tempDir = await mkdtemp(path.join(tmpdir(), "secure-exec-hono-runner-"));

	await cp(sourceDir, tempDir, {
		recursive: true,
		filter: (src) => !src.includes(`${path.sep}node_modules`),
	});

	try {
		await execFileAsync("pnpm", ["install", "--ignore-workspace"], {
			cwd: tempDir,
			maxBuffer: 10 * 1024 * 1024,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown pnpm install failure";
		throw new Error(`Failed to install runner dependencies in temp dir: ${message}`);
	}

	return {
		tempDir,
		entryPath: path.join(tempDir, entryRelativePath),
	};
}
