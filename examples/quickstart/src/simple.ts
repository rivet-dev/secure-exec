import {
  NodeRuntime,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
} from "secure-exec";

const runtime = new NodeRuntime({
  systemDriver: createNodeDriver(),
  runtimeDriverFactory: createNodeRuntimeDriverFactory(),
});

const result = await runtime.run<{ message: string }>(
  `export const message = "hello from secure-exec";`
);

console.log(result.exports?.message); // "hello from secure-exec"

runtime.dispose();
