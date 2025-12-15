# lightweight sandbox

## overview

goal: design an emulated linux machine for Node.js (not browser) using WebAssembly.sh for Linux emulation and isolated-vm for the node emulation. these are both bound to the same core "virtual machine" for filesystem & network & etc. this allows for emulating a linux environment without sacrificing performance (mostly, polyfills have some overhead) on the NodeJS app since it's in an isolate.

the closest prior art is WebContainers, OpenWebContainers, and Nodebox. however, these all target the browser or use pure WASM. this project targets Node.js as the host runtime.

## project structure

- use typescript
- keep all in a single package in src/
- add a script check-types to check that types are working
- use vitest to test your work

loosely follow this structure, keep things simple:

```
src/
    vm/
        index.ts  # class VirtualMachine - orchestrates WasixInstance and NodeProcess
        ...etc...
    system-bridge/
        index.ts  # class SystemBridge - shared filesystem, network, etc
        fs.ts     # filesystem implementation
        ...etc...
    node-process/
        index.ts  # class NodeProcess (using isolated-vm)
        ...etc...
    wasix/
        index.ts  # class WasixInstance
        ...etc...
```

the end user api looks like:

```
const vm = new VirtualMachine("/path/to/local/fs");
const output = await vm.spawn("ls", ["/"]);
console.log('output', output.stdout, output.stderr, output.code)
```

by the end of this project, we should be able to do:

```
const shCode = `
    #!/bin/sh
    node script.js
`;

const jsCode = `
    const fs = require("fs");
    const path = require("path");

    // test ms package (simple, no deps)
    const ms = require("ms");
    console.log("1 hour in ms:", ms("1h"));

    // test jsonfile package (uses fs internally)
    const jsonfile = require("jsonfile");
    const testFile = "/test.json";
    jsonfile.writeFileSync(testFile, { hello: "world" });

`;

const vm = new VirtualMachine("/path/to/local/fs");

// write scripts to the vm filesystem
vm.writeFile("/test.sh", shCode);
vm.writeFile("/script.js", jsCode);

// run the shell script (assumes pnpm add jsonfile ms was run on host)
const output = await vm.spawn("sh", ["/test.sh"]);
console.log('output', output.stdout, output.stderr, output.code)

// read back to verify
const raw = vm.readFile("/test.json");
console.log("read back:", JSON.parse(raw));
```

## components

### virtual machine

orchestrates WasixInstance and NodeProcess. provides the main `spawn()` API that routes commands to the appropriate runtime. owns the SystemBridge instance that both runtimes share.

### system bridge

shared layer for filesystem, network, and other system resources. both WasixInstance and NodeProcess use this to access the same underlying state. forwards filesystem operations to a dedicated folder on the host.

### node process

runs Node.js code in an isolated-vm isolate. provides polyfilled node stdlib (fs, path, etc) that routes through SystemBridge. supports requiring packages from node_modules.

### wasix instance

uses WebAssembly.sh to emulate a Linux shell environment. provides shell commands (ls, cd, etc) via SystemBridge. when running `node` commands, delegates to NodeProcess.

### dependencies

**@wasmer/sdk** - Wasmer's JavaScript SDK for running WASI/WASIX modules in Node.js. docs: https://wasmerio.github.io/wasmer-js/index.html

```bash
pnpm add @wasmer/sdk
```

- Node.js 22+: `import { init, Wasmer, Directory } from "@wasmer/sdk"`
- Node.js < 22: `import { init, Wasmer, Directory } from "@wasmer/sdk/node"`

provides:
- `Directory` class for virtual filesystem (writeFile, readFile, readDir, mount into WASM)
- stdout/stderr capture via `instance.wait()` or streaming
- run packages from Wasmer registry

**node-stdlib-browser** - pure JavaScript polyfills for Node.js stdlib modules. works in isolated-vm because it has no native bindings and doesn't require browser APIs (despite the name, it's just pure JS implementations).

```bash
pnpm add node-stdlib-browser
```

provides polyfills for: `buffer`, `events`, `stream`, `util`, `path`, `process`, `crypto` (partial), `assert`, `timers`, `url`, `querystring`, `os`, `console`, `vm`, `zlib`, etc.

modules that still need bridging to main isolate (real I/O): `fs`, `net`, `http`, `child_process`

**isolated-vm** - runs JavaScript in a separate V8 isolate for sandboxing.

```bash
pnpm add isolated-vm
```

**wasm-js bridging** - how WasixInstance delegates `node` commands to NodeProcess. see TEST_WASM_JS_BRIDGE.md for research.

**hybrid routing** - VirtualMachine routes commands in JS before hitting WASM:
- `node` commands → NodeProcess directly
- linux commands → @wasmer/sdk
- simple, works now, but can't run shell scripts that internally call node

## steps

1. implement VirtualMachine and SystemBridge with basic filesystem. VirtualMachine owns a SystemBridge that forwards to a dedicated folder on the host.

```ts
import { VirtualMachine } from "./vm";
import { SystemBridge } from "./system-bridge";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-test-"));

// SystemBridge can be used directly
const bridge = new SystemBridge(tmpDir);
bridge.writeFile("/direct.txt", "hello");
expect(fs.readFileSync(path.join(tmpDir, "direct.txt"), "utf8")).toBe("hello");

// VirtualMachine wraps SystemBridge
const vm = new VirtualMachine(tmpDir);
vm.writeFile("/foo.txt", "bar");
expect(vm.readFile("/foo.txt")).toBe("bar");
```

2. get basic isolates & bindings working using isolated-vm

```ts
import { NodeProcess } from "./node-process";

const proc = new NodeProcess();
const result = await proc.run(`module.exports = 1 + 1`);
expect(result).toBe(2);
```

3. impl nodejs require with polyfill for node stdlib

```ts
import { NodeProcess } from "./node-process";

const proc = new NodeProcess();
const result = await proc.run(`
  const path = require("path");
  module.exports = path.join("foo", "bar");
`);
expect(result).toBe("foo/bar");
```

4. get basic wasix shell working

```ts
import { WasixInstance } from "./wasix";

const wasix = new WasixInstance();
const result = await wasix.exec("echo hello");
expect(result.stdout).toBe("hello\n");
```

5. get wasix file system bindings working (test ls, cd, etc)

```ts
import { VirtualMachine } from "./vm";

const vm = new VirtualMachine(tmpDir);
vm.writeFile("/test.txt", "content");

const result = await vm.spawn("ls", ["/"]);
expect(result.stdout).toContain("test.txt");
```

6. implement package imports using the code in node_modules

```ts
import { VirtualMachine } from "./vm";
import { NodeProcess } from "./node-process";

const vm = new VirtualMachine(tmpDir);
// assume `pnpm add ms` was run in tmpDir on host
const proc = new NodeProcess(vm);
const result = await proc.run(`
  const ms = require("ms");
  module.exports = ms("1h");
`);
expect(result).toBe(3600000);
```

7. auto-install `node` program in wasix/webassembly.sh to kick out to the nodejs shim that will spawn the isolate

```ts
import { VirtualMachine } from "./vm";

const vm = new VirtualMachine(tmpDir);
vm.writeFile("/script.js", `console.log("hello from node")`);

const result = await vm.spawn("node", ["/script.js"]);
expect(result.stdout).toBe("hello from node\n");
```

## future work

- terminal emulation
- get claude code cli working in this emulator
- emulate npm
- use node_modules instead of pulling packages from cdn
- **custom WASM shell** - build a WASM binary with bridge imports:
  - use Node.js native WASI (not @wasmer/sdk) with custom `bridge.*` imports
  - WASM calls `bridge.spawn_node("script.js")` → JS handler → NodeProcess
  - full control, can run arbitrary shell scripts that spawn node
  - requires building custom WASM binary in Rust/C

