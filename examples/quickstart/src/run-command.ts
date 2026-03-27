import {
  NodeRuntime,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
  allowAllChildProcess,
} from "secure-exec";

const runtime = new NodeRuntime({
  systemDriver: createNodeDriver({
    permissions: { ...allowAllChildProcess },
  }),
  runtimeDriverFactory: createNodeRuntimeDriverFactory(),
  onStdio: (event) => {
    process.stdout.write(event.message);
  },
});

await runtime.exec(`
  import { execSync } from "node:child_process";
  console.log(execSync("node --version", { encoding: "utf8" }).trim());
`, { filePath: "/entry.mjs" });

runtime.dispose();
