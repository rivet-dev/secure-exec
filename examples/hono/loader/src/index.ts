import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  allowAllEnv,
  allowAllFs,
  allowAllNetwork,
  NodeFileSystem,
  NodeRuntime,
  createNodeDriver,
  createNodeExecutionFactory,
} from "../../../../packages/secure-exec/src/index.ts";
import {
  LOOPBACK_HOST,
  findOpenPort,
  prepareRunnerInTempDir,
  waitForServer,
} from "../../../shared/src/sandbox-runner-utils.ts";

function createProcess(runnerRoot: string, runnerEntry: string): NodeRuntime {
  const driver = createNodeDriver({
    filesystem: new NodeFileSystem(),
    useDefaultNetwork: true,
    processConfig: {
      cwd: runnerRoot,
      argv: ["node", runnerEntry],
    },
    permissions: {
      ...allowAllFs,
      ...allowAllNetwork,
      ...allowAllEnv,
    },
  });

  return new NodeRuntime({
    driver,
    executionFactory: createNodeExecutionFactory(),
  });
}

async function runFetchHandlerEntrypoint(
  runnerRoot: string,
  fetchHandlerEntry: string,
): Promise<void> {
  const probeFilePath = path.join(runnerRoot, "src/__fetch-handler-probe.ts");
  const probeCode = `
const { fetch } = require("./fetch-handler.ts");

(async () => {
  const textResponse = await fetch(new Request("http://sandbox.local/"));
  const jsonResponse = await fetch(new Request("http://sandbox.local/json"));
  const textBody = await textResponse.text();
  const jsonBody = await jsonResponse.text();

  console.log(\`loader:fetch-handler:text:\${textResponse.status}:\${textBody}\`);
  console.log(\`loader:fetch-handler:json:\${jsonResponse.status}:\${jsonBody}\`);
})();
`;

  const proc = createProcess(runnerRoot, fetchHandlerEntry);
  try {
    const result = await proc.exec(probeCode, {
      filePath: probeFilePath,
      cwd: runnerRoot,
    });

    if (result.stdout.trim()) {
      console.log(result.stdout.trim());
    }

    if (result.code !== 0) {
      throw new Error(
        `Fetch-handler entrypoint failed with code ${result.code}: ${result.stderr}`,
      );
    }
  } finally {
    proc.dispose();
  }
}

async function runHttpServerEntrypoint(
  runnerRoot: string,
  serverEntry: string,
): Promise<void> {
  const runnerCode = await readFile(serverEntry, "utf8");
  const runnerPort = await findOpenPort();
  const baseUrl = `http://${LOOPBACK_HOST}:${runnerPort}`;

  const proc = createProcess(runnerRoot, serverEntry);
  const execPromise = proc.exec(runnerCode, {
    filePath: serverEntry,
    cwd: runnerRoot,
    env: {
      HONO_PORT: String(runnerPort),
      HONO_HOST: LOOPBACK_HOST,
    },
  });

  try {
    await waitForServer(proc, baseUrl);

    const textResponse = await proc.network.fetch(`${baseUrl}/`, { method: "GET" });
    const jsonResponse = await proc.network.fetch(`${baseUrl}/json`, { method: "GET" });

    console.log(`loader:server:text:${textResponse.status}:${textResponse.body}`);
    console.log(`loader:server:json:${jsonResponse.status}:${jsonResponse.body}`);
  } finally {
    await proc.terminate();
    await execPromise.catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const loaderDir = path.dirname(fileURLToPath(import.meta.url));
  const runnerSourceRoot = path.resolve(loaderDir, "../../runner");

  const { tempDir: runnerRoot, entryPath: runnerEntry } =
    await prepareRunnerInTempDir(runnerSourceRoot, "src/server.ts");
  const fetchHandlerEntry = path.join(runnerRoot, "src/fetch-handler.ts");

  try {
    await runFetchHandlerEntrypoint(runnerRoot, fetchHandlerEntry);
    await runHttpServerEntrypoint(runnerRoot, runnerEntry);
  } finally {
    await rm(runnerRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
