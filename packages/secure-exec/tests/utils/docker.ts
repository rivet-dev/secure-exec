/**
 * Shared Docker container utility for integration tests.
 *
 * Spins up containers via the docker CLI, waits for health checks,
 * and tears them down after tests. Automatically skips the enclosing
 * test suite when Docker is not available on the host.
 */

import { execFileSync, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

/* ------------------------------------------------------------------ */
/*  Docker availability check                                         */
/* ------------------------------------------------------------------ */

let dockerAvailable: boolean | undefined;

function isDockerAvailable(): boolean {
	if (dockerAvailable !== undefined) return dockerAvailable;
	try {
		execSync("docker info", { stdio: "ignore", timeout: 5_000 });
		dockerAvailable = true;
	} catch {
		dockerAvailable = false;
	}
	return dockerAvailable;
}

/**
 * Skip helper matching the project convention (`describe.skipIf(reason)`).
 * Returns a reason string when Docker is unavailable, or `false` when ready.
 */
export function skipUnlessDocker(): string | false {
	return isDockerAvailable()
		? false
		: "Docker is not available on this host";
}

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface StartContainerOptions {
	/** Port mappings — keys are container ports, values are host ports (0 = auto-assign). */
	ports?: Record<number, number>;
	/** Environment variables passed to the container. */
	env?: Record<string, string>;
	/** Command + args to run inside the container for the health check (via `docker exec`). */
	healthCheck?: string[];
	/** Maximum time (ms) to wait for the health check to pass. Default 30 000. */
	healthCheckTimeout?: number;
	/** Interval (ms) between health check retries. Default 500. */
	healthCheckInterval?: number;
	/** Extra arguments appended to `docker run`. */
	args?: string[];
	/** Command override (appended after the image name). */
	command?: string[];
}

export interface Container {
	/** Container ID (full SHA). */
	containerId: string;
	/** Host address — always "127.0.0.1" for local Docker. */
	host: string;
	/** Host port mapped to the *first* entry in `opts.ports`. */
	port: number;
	/** All resolved host→container port mappings. */
	ports: Record<number, number>;
	/** Idempotent stop + remove. Safe to call multiple times. */
	stop: () => void;
}

/* ------------------------------------------------------------------ */
/*  Core implementation                                               */
/* ------------------------------------------------------------------ */

/**
 * Build a Docker image from a Dockerfile and tag it.
 */
/**
 * Return a container's internal IP on the Docker bridge network.
 */
export function getContainerInternalIp(containerId: string): string {
	return execFileSync(
		"docker",
		["inspect", containerId, "-f", "{{.NetworkSettings.IPAddress}}"],
		{ encoding: "utf-8", timeout: 5_000 },
	).trim();
}

export function buildImage(dockerfilePath: string, tag: string): void {
	if (!isDockerAvailable()) {
		throw new Error("Docker is not available on this host");
	}
	execFileSync(
		"docker",
		["build", "-t", tag, "-f", dockerfilePath, path.dirname(dockerfilePath)],
		{ stdio: "ignore", timeout: 120_000 },
	);
}

/**
 * Pull an image if it is not already present locally.
 */
function ensureImage(image: string): void {
	try {
		execFileSync("docker", ["image", "inspect", image], {
			stdio: "ignore",
			timeout: 10_000,
		});
	} catch {
		// Image not present — pull it
		execFileSync("docker", ["pull", image], {
			stdio: "ignore",
			timeout: 120_000,
		});
	}
}

/**
 * Start a Docker container and optionally wait for a health check.
 *
 * @throws if Docker is unavailable, the image cannot be pulled, or the
 *         health check does not pass within the configured timeout.
 */
export function startContainer(
	image: string,
	opts: StartContainerOptions = {},
): Container {
	if (!isDockerAvailable()) {
		throw new Error("Docker is not available on this host");
	}

	ensureImage(image);

	const label = `secure-exec-test-${randomBytes(6).toString("hex")}`;
	const args: string[] = ["run", "-d", "--label", label];

	// Port mappings
	const requestedPorts = opts.ports ?? {};
	for (const [containerPort, hostPort] of Object.entries(requestedPorts)) {
		args.push("-p", `${hostPort}:${containerPort}`);
	}

	// Environment variables
	for (const [k, v] of Object.entries(opts.env ?? {})) {
		args.push("-e", `${k}=${v}`);
	}

	// Extra args
	if (opts.args) args.push(...opts.args);

	// Image + optional command
	args.push(image);
	if (opts.command) args.push(...opts.command);

	const containerId = execFileSync("docker", args, {
		encoding: "utf-8",
		timeout: 30_000,
	}).trim();

	// Resolve actual host ports (handles 0 = auto-assign)
	const resolvedPorts: Record<number, number> = {};
	for (const containerPort of Object.keys(requestedPorts)) {
		const mapped = execFileSync(
			"docker",
			["port", containerId, String(containerPort)],
			{ encoding: "utf-8", timeout: 5_000 },
		).trim();
		// Output format: "0.0.0.0:12345" or "[::]:12345" — grab the port
		const match = mapped.match(/:(\d+)$/m);
		resolvedPorts[Number(containerPort)] = match
			? Number(match[1])
			: Number(containerPort);
	}

	// Build stop() — idempotent
	let stopped = false;
	const stop = (): void => {
		if (stopped) return;
		stopped = true;
		try {
			execFileSync("docker", ["rm", "-f", containerId], {
				stdio: "ignore",
				timeout: 15_000,
			});
		} catch {
			// Container may already be gone — ignore
		}
	};

	// First port value (convenience)
	const firstPort =
		Object.values(resolvedPorts)[0] ??
		Number(Object.keys(requestedPorts)[0]) ??
		0;

	const container: Container = {
		containerId,
		host: "127.0.0.1",
		port: firstPort,
		ports: resolvedPorts,
		stop,
	};

	// Health check loop
	if (opts.healthCheck && opts.healthCheck.length > 0) {
		const timeout = opts.healthCheckTimeout ?? 30_000;
		const interval = opts.healthCheckInterval ?? 500;
		const deadline = Date.now() + timeout;
		let lastError: unknown;

		while (Date.now() < deadline) {
			try {
				execFileSync(
					"docker",
					["exec", containerId, ...opts.healthCheck],
					{ stdio: "ignore", timeout: 10_000 },
				);
				// Health check passed
				return container;
			} catch (err) {
				lastError = err;
				// Sleep before retry (use Atomics.wait for precise ms sleep without shell)
				const buf = new SharedArrayBuffer(4);
				Atomics.wait(new Int32Array(buf), 0, 0, interval);
			}
		}

		// Timed out — clean up and throw
		stop();
		throw new Error(
			`Health check for ${image} did not pass within ${timeout}ms: ${lastError}`,
		);
	}

	return container;
}
