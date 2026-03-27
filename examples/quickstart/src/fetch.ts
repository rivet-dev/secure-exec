import {
  NodeRuntime,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
  allowAllNetwork,
} from "secure-exec";

const runtime = new NodeRuntime({
  systemDriver: createNodeDriver({
    permissions: { ...allowAllNetwork },
  }),
  runtimeDriverFactory: createNodeRuntimeDriverFactory(),
  onStdio: (event) => {
    process.stdout.write(event.message);
  },
});

await runtime.exec(`
  const response = await fetch("https://example.com");
  console.log(response.status); // 200
`);

runtime.dispose();
