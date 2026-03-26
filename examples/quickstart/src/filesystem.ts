import {
  createKernel,
  createInMemoryFileSystem,
  createNodeRuntime,
} from "secure-exec";

const filesystem = createInMemoryFileSystem();
const kernel = createKernel({
  filesystem,
  permissions: {
    fs: () => ({ allow: true }),
  },
});
await kernel.mount(createNodeRuntime());

await kernel.exec(`node -e "
  const fs = require('node:fs');
  fs.mkdirSync('/workspace', { recursive: true });
  fs.writeFileSync('/workspace/hello.txt', 'hello from the sandbox');
"`);

const bytes = await filesystem.readFile("/workspace/hello.txt");
console.log(new TextDecoder().decode(bytes)); // "hello from the sandbox"

await kernel.dispose();
