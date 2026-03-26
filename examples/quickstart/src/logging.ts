import {
  createKernel,
  createInMemoryFileSystem,
  createNodeRuntime,
} from "secure-exec";

const kernel = createKernel({
  filesystem: createInMemoryFileSystem(),
});
await kernel.mount(createNodeRuntime());

const result = await kernel.exec(
  "node -e \"console.log('hello from secure-exec')\""
);

console.log(result.stdout); // "hello from secure-exec\n"
console.log(result.stderr); // ""

await kernel.dispose();
