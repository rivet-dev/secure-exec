import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesRoot = path.resolve(__dirname, "..");

const featureFiles = [
  "src/child-processes.ts",
  "src/filesystem.ts",
  "src/module-loading.ts",
  "src/networking.ts",
  "src/output-capture.ts",
  "src/permissions.ts",
  "src/resource-limits.ts",
  "src/typescript.ts",
];

function runExample(relativePath) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "tsx", relativePath], {
      cwd: examplesRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `${relativePath} exited with code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
        return;
      }

      const jsonLine = stdout
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1);

      if (!jsonLine) {
        reject(new Error(`${relativePath} produced no JSON result`));
        return;
      }

      let payload;
      try {
        payload = JSON.parse(jsonLine);
      } catch (error) {
        reject(
          new Error(
            `${relativePath} produced invalid JSON\nstdout:\n${stdout}\nstderr:\n${stderr}\n${error}`,
          ),
        );
        return;
      }

      if (!payload?.ok) {
        reject(
          new Error(
            `${relativePath} reported failure\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
        return;
      }

      resolve(payload);
    });
  });
}

for (const featureFile of featureFiles) {
  const result = await runExample(featureFile);
  console.log(`${featureFile}: ${result.summary ?? "ok"}`);
}

console.log("Feature examples passed end-to-end.");
