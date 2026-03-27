import {
  NodeRuntime,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
} from "secure-exec";

const runtime = new NodeRuntime({
  systemDriver: createNodeDriver(),
  runtimeDriverFactory: createNodeRuntimeDriverFactory(),
  onStdio: (event) => {
    process.stdout.write(event.message);
  },
});

const result = await runtime.exec(`
  console.log("hello from secure-exec");
`);

console.log("exit code:", result.code); // 0

runtime.dispose();
