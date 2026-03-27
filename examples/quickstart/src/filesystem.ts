import {
  NodeRuntime,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
  createInMemoryFileSystem,
  allowAllFs,
} from "secure-exec";

const filesystem = createInMemoryFileSystem();

const runtime = new NodeRuntime({
  systemDriver: createNodeDriver({
    filesystem,
    permissions: { ...allowAllFs },
  }),
  runtimeDriverFactory: createNodeRuntimeDriverFactory(),
});

await runtime.exec(`
  import fs from "node:fs";
  fs.mkdirSync("/workspace", { recursive: true });
  fs.writeFileSync("/workspace/hello.txt", "hello from the sandbox");
`, { filePath: "/entry.mjs" });

const bytes = await filesystem.readFile("/workspace/hello.txt");
console.log(new TextDecoder().decode(bytes)); // "hello from the sandbox"

runtime.dispose();
