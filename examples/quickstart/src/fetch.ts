import {
  createKernel,
  createInMemoryFileSystem,
  createNodeRuntime,
} from "secure-exec";

const kernel = createKernel({
  filesystem: createInMemoryFileSystem(),
  permissions: {
    network: () => ({ allow: true }),
  },
});
await kernel.mount(createNodeRuntime());

const result = await kernel.exec(`node -e "
  (async () => {
    const response = await fetch('https://example.com');
    console.log(response.status);
  })();
"`);

console.log(result.stdout); // "200\n"

await kernel.dispose();
