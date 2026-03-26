import {
  createKernel,
  createInMemoryFileSystem,
  createNodeRuntime,
} from "secure-exec";

const kernel = createKernel({
  filesystem: createInMemoryFileSystem(),
  permissions: {
    childProcess: () => ({ allow: true }),
  },
});
await kernel.mount(createNodeRuntime());

const result = await kernel.exec(`node -e "
  const { execSync } = require('node:child_process');
  console.log(execSync('node --version', { encoding: 'utf8' }).trim());
"`);

console.log(result.stdout); // e.g. "v22.x.x\n"

await kernel.dispose();
