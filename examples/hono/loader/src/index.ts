import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  NodeFileSystem,
  NodeProcess,
  createNodeDriver,
} from "../../../../packages/sandboxed-node/src/index.ts";

const execFileAsync = promisify(execFile);

async function prepareRunnerInTempDir(sourceDir: string): Promise<{
  tempDir: string;
  entryPath: string;
}> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "libsandbox-hono-runner-"));

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
    entryPath: path.join(tempDir, "src/index.ts"),
  };
}

async function main(): Promise<void> {
  const loaderDir = path.dirname(fileURLToPath(import.meta.url));
  const runnerSourceRoot = path.resolve(loaderDir, "../../runner");

  const { tempDir: runnerRoot, entryPath: runnerEntry } =
    await prepareRunnerInTempDir(runnerSourceRoot);

  try {
    const runnerCode = await readFile(runnerEntry, "utf8");

    const driver = createNodeDriver({
      filesystem: new NodeFileSystem(),
      useDefaultNetwork: true,
    });

    const proc = new NodeProcess({
      driver,
      processConfig: {
        cwd: runnerRoot,
        argv: ["node", runnerEntry],
      },
    });

    const result = await proc.exec(runnerCode, {
      filePath: runnerEntry,
      cwd: runnerRoot,
    });

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    if (result.code !== 0) {
      throw new Error(`Sandboxed runner exited with code ${result.code}`);
    }
  } finally {
    await rm(runnerRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
