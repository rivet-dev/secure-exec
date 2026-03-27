import {
  NodeRuntime,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
  createInMemoryFileSystem,
  allowAllFs,
} from "secure-exec";

const filesystem = createInMemoryFileSystem();

// Write module files to the virtual filesystem
await filesystem.writeFile(
  "/app/math.mjs",
  `export function add(a, b) { return a + b; }`
);
await filesystem.writeFile(
  "/app/greet.mjs",
  `export function greet(name) { return "hello, " + name; }`
);

const runtime = new NodeRuntime({
  systemDriver: createNodeDriver({
    filesystem,
    permissions: { ...allowAllFs },
  }),
  runtimeDriverFactory: createNodeRuntimeDriverFactory(),
});

const result = await runtime.run<{ sum: number; greeting: string }>(
  `
  import { add } from "./math.mjs";
  import { greet } from "./greet.mjs";

  export const sum = add(1, 2);
  export const greeting = greet("secure-exec");
  `,
  "/app/entry.mjs"
);

console.log(result.exports?.sum);      // 3
console.log(result.exports?.greeting); // "hello, secure-exec"

runtime.dispose();
