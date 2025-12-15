# WASM-JS Bridge Testing Spec

manual tests to verify @wasmer/sdk works and explore how to bridge WASM commands to JavaScript.

## 1. verify @wasmer/sdk package

first, confirm we have the right package and it works in Node.js.

```bash
mkdir wasmer-test && cd wasmer-test
pnpm init
pnpm add @wasmer/sdk
```

create `test-basic.mjs`:

```javascript
// for Node.js < 22, use: import { init, Wasmer } from "@wasmer/sdk/node"
import { init, Wasmer } from "@wasmer/sdk";

async function main() {
  console.log("initializing wasmer...");
  await init();
  console.log("wasmer initialized");

  // run a simple command from wasmer registry
  const pkg = await Wasmer.fromRegistry("sharrattj/coreutils");
  console.log("loaded coreutils package");

  const instance = await pkg.commands["echo"].run({
    args: ["hello", "from", "wasmer"]
  });

  const output = await instance.wait();
  console.log("exit code:", output.code);
  console.log("stdout:", output.stdout);
  console.log("stderr:", output.stderr);
}

main().catch(console.error);
```

run:
```bash
node test-basic.mjs
```

expected output:
```
initializing wasmer...
wasmer initialized
loaded coreutils package
exit code: 0
stdout: hello from wasmer
stderr:
```

check package version:
```bash
pnpm list @wasmer/sdk
```

## 2. test Directory filesystem

verify we can mount a virtual filesystem into WASM.

create `test-fs.mjs`:

```javascript
import { init, Wasmer, Directory } from "@wasmer/sdk";

async function main() {
  await init();

  const dir = new Directory();
  await dir.writeFile("/hello.txt", "content from javascript");

  const pkg = await Wasmer.fromRegistry("sharrattj/coreutils");

  // test cat command reading our file
  const instance = await pkg.commands["cat"].run({
    args: ["/app/hello.txt"],
    mount: { "/app": dir }
  });

  const output = await instance.wait();
  console.log("cat output:", output.stdout);

  // test ls command
  const lsInstance = await pkg.commands["ls"].run({
    args: ["-la", "/app"],
    mount: { "/app": dir }
  });

  const lsOutput = await lsInstance.wait();
  console.log("ls output:", lsOutput.stdout);
}

main().catch(console.error);
```

expected: cat shows "content from javascript", ls shows hello.txt

## 3. test bidirectional filesystem (WASM writes, JS reads)

this is the critical test - can JS read files that WASM wrote?

create `test-fs-write.mjs`:

```javascript
import { init, Wasmer, Directory } from "@wasmer/sdk";

async function main() {
  await init();

  const dir = new Directory();

  const pkg = await Wasmer.fromRegistry("sharrattj/coreutils");

  // have WASM write a file using echo + redirect
  // note: this may not work if echo doesn't support redirection
  // alternative: use a shell
  const bashPkg = await Wasmer.fromRegistry("sharrattj/bash");

  const instance = await bashPkg.entrypoint.run({
    args: ["-c", "echo 'written by wasm' > /out/test.txt"],
    mount: { "/out": dir }
  });

  await instance.wait();

  // now try to read it back from JS
  try {
    const content = await dir.readTextFile("/test.txt");
    console.log("SUCCESS: read back from JS:", content);
  } catch (e) {
    console.log("FAILED to read back:", e.message);
    console.log("this confirms the known issue - Directory may be one-way");
  }

  // also try readDir
  try {
    const entries = await dir.readDir("/");
    console.log("directory entries:", entries);
  } catch (e) {
    console.log("readDir failed:", e.message);
  }
}

main().catch(console.error);
```

## 4. test command interception (approach A: @wasmer/wasm-terminal)

test if the older wasm-terminal package provides command interception.

```bash
pnpm add @wasmer/wasm-terminal @wasmer/wasmfs
```

create `test-terminal.mjs`:

```javascript
// note: this package may be browser-only or deprecated
import WasmTerminal from "@wasmer/wasm-terminal";

async function main() {
  const fetchCommand = async ({ args, env }) => {
    console.log("intercepted command:", args);

    if (args[0] === "node") {
      // return a callback instead of WASM binary
      return async (options, wasmFs) => {
        console.log("executing node command in JS!");
        console.log("script path:", args[1]);
        return "hello from JS callback";
      };
    }

    // for other commands, would fetch from WAPM
    throw new Error("command not found: " + args[0]);
  };

  // this may fail if wasm-terminal is browser-only
  try {
    const terminal = new WasmTerminal({ fetchCommand });
    console.log("terminal created");
  } catch (e) {
    console.log("wasm-terminal failed (likely browser-only):", e.message);
  }
}

main().catch(console.error);
```

if this fails, the package is browser-only and we need alternative approaches.

## 5. test command interception (approach B: spawn callback in @wasmer/sdk)

check if @wasmer/sdk has any spawn/exec callback mechanism.

create `test-sdk-spawn.mjs`:

```javascript
import { init, Wasmer, Directory } from "@wasmer/sdk";

async function main() {
  await init();

  // check what's available on the Wasmer object
  console.log("Wasmer keys:", Object.keys(Wasmer));

  const pkg = await Wasmer.fromRegistry("sharrattj/bash");
  console.log("package keys:", Object.keys(pkg));
  console.log("entrypoint:", pkg.entrypoint);
  console.log("commands:", Object.keys(pkg.commands || {}));

  // check if there's any hook/callback mechanism
  const instance = await pkg.entrypoint.run({
    args: ["-c", "echo test"]
  });

  console.log("instance keys:", Object.keys(instance));

  // look for any spawn/fork/exec related APIs
  await instance.wait();
}

main().catch(console.error);
```

## 6. test command interception (approach C: custom /bin/node)

if no callback mechanism exists, we could potentially:
1. mount a custom `/bin/node` script
2. have it write to a special file that we poll
3. handle the "command" from JS

create `test-custom-bin.mjs`:

```javascript
import { init, Wasmer, Directory } from "@wasmer/sdk";

async function main() {
  await init();

  const bin = new Directory();
  const tmp = new Directory();

  // create a fake "node" script that writes its args to a file
  // then we could poll for that file
  await bin.writeFile("/node", `#!/bin/sh
echo "NODE_INTERCEPT:$@" > /tmp/node-request.txt
# in real impl, would wait for response
`);

  const pkg = await Wasmer.fromRegistry("sharrattj/bash");

  const instance = await pkg.entrypoint.run({
    args: ["-c", "chmod +x /bin/node && /bin/node script.js arg1 arg2"],
    mount: {
      "/bin": bin,
      "/tmp": tmp
    }
  });

  await instance.wait();

  // check if we can read the intercept file
  try {
    const request = await tmp.readTextFile("/node-request.txt");
    console.log("intercepted request:", request);
  } catch (e) {
    console.log("could not read intercept file:", e.message);
  }
}

main().catch(console.error);
```

## summary

run tests in order. document results:

| test | result | notes |
|------|--------|-------|
| 1. basic sdk | PASS | works with `@wasmer/sdk/node` import, requires tsx/pnpm |
| 2. directory read | PASS | JS writes, WASM reads via cat - works perfectly |
| 3. directory write (bidirectional) | PARTIAL | touch works (empty files), content-writing commands (cp, dd, truncate, bash redirect) hang |
| 4. wasm-terminal | FAIL | browser-only (requires window/xterm), not usable in Node.js |
| 5. sdk spawn hooks | NONE | no spawn/exec callback mechanism in SDK - designed for isolated execution |
| 6. custom /bin/node | PARTIAL | `bash -c "source /script"` works; cannot intercept real process spawns |

based on results, decide which approach to use for WASM-JS bridging.

### key findings

1. **@wasmer/sdk works in Node.js** but requires `/node` import path
2. **filesystem is one-way for content**: JS can write files that WASM reads, but WASM writing file content hangs
3. **no command interception**: SDK has no hooks for intercepting syscalls or process spawns
4. **workaround possible**: can mount custom scripts and use `bash -c "source /path"` to execute them
5. **exit code quirk**: bash WASM returns exit code 45 even on success

### recommendation

the alternative approach is recommended:

## alternative: skip wasix shell entirely

if bridging proves too difficult, consider:
- only use @wasmer/sdk for specific linux commands (ls, cat, etc)
- route `node` commands directly to NodeProcess without going through WASM
- VirtualMachine.spawn() checks command name and routes accordingly

this would simplify the architecture but lose the ability to run arbitrary shell scripts that call node.

---

## 7. test Node.js native WASI

test if Node.js built-in WASI can intercept syscalls.

create `test7-nodejs-wasi.ts`:

```typescript
import { WASI } from "node:wasi";

async function main(): Promise<void> {
  const wasi = new WASI({
    version: "preview1",
    args: ["test"],
    env: {},
  });

  console.log("WASI.wasiImport keys:", Object.keys(wasi.wasiImport));

  // Check for spawn-related syscalls
  console.log("proc_spawn in wasiImport:", "proc_spawn" in wasi.wasiImport);
  console.log("proc_exec in wasiImport:", "proc_exec" in wasi.wasiImport);
}

main().catch(console.error);
```

**result**: FAIL - Node.js WASI preview1 only has `proc_exit` and `proc_raise`. No `proc_spawn` or `proc_exec` - those are WASIX extensions, not standard WASI.

## 8. test raw WebAssembly with JS imports

test if we can create WASM modules that call JavaScript functions.

create `test8b-raw-wasm.ts`:

```typescript
import { init, wat2wasm } from "@wasmer/sdk/node";

async function main(): Promise<void> {
  await init();

  const wat = `
    (module
      (import "env" "js_callback" (func $js_callback (param i32)))
      (memory (export "memory") 1)
      (func (export "_start")
        i32.const 42
        call $js_callback
      )
    )
  `;

  const wasmBytes = wat2wasm(wat);

  let callbackValue = 0;
  const imports = {
    env: {
      js_callback: (value: number) => {
        console.log(`[JS CALLBACK] value = ${value}`);
        callbackValue = value;
      },
    },
  };

  const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
  const start = instance.exports._start as () => void;
  start();

  console.log(`Callback received: ${callbackValue}`);
}

main().catch(console.error);
```

**result**: PASS - WASM can call JavaScript functions using raw WebAssembly.instantiate()!

## 9. test WASI + custom imports combined

test if we can combine Node.js WASI with custom bridge imports.

create `test9-wasi-plus-custom.ts`:

```typescript
import { WASI } from "node:wasi";
import { init, wat2wasm } from "@wasmer/sdk/node";

async function main(): Promise<void> {
  await init();

  const wat = `
    (module
      ;; WASI imports
      (import "wasi_snapshot_preview1" "fd_write"
        (func $fd_write (param i32 i32 i32 i32) (result i32)))

      ;; Custom bridge import
      (import "bridge" "spawn_node" (func $spawn_node (param i32 i32) (result i32)))

      (memory (export "memory") 1)
      (data (i32.const 0) "Hello from WASI!\\n")
      (data (i32.const 100) "script.js")
      (data (i32.const 200) "\\00\\00\\00\\00\\11\\00\\00\\00")
      (data (i32.const 300) "\\00\\00\\00\\00")

      (func (export "_start")
        i32.const 1
        i32.const 200
        i32.const 1
        i32.const 300
        call $fd_write
        drop
        i32.const 100
        i32.const 9
        call $spawn_node
        drop
      )
    )
  `;

  const wasmBytes = wat2wasm(wat);
  const wasi = new WASI({ version: "preview1", args: ["test"], env: {} });

  const imports = {
    wasi_snapshot_preview1: wasi.wasiImport,
    bridge: {
      spawn_node: (ptr: number, len: number): number => {
        const memory = instance.exports.memory as WebAssembly.Memory;
        const bytes = new Uint8Array(memory.buffer, ptr, len);
        const scriptPath = new TextDecoder().decode(bytes);
        console.log(`[BRIDGE] spawn_node called with: "${scriptPath}"`);
        return 0;
      },
    },
  };

  const result = await WebAssembly.instantiate(wasmBytes, imports);
  const instance = result.instance;
  wasi.start(instance);
}

main().catch(console.error);
```

**result**: PASS - We can combine WASI syscalls with custom bridge functions! Output:
```
Hello from WASI!
[BRIDGE] spawn_node called with: "script.js"
```

## 10. test custom Wasmer package

test if we can create custom Wasmer packages with Wasmer.fromWasm().

**result**: PARTIAL - `Wasmer.fromWasm()` accepts custom WASM but `instance.wait()` hangs (same issue as other @wasmer/sdk operations).

---

## updated summary

| test | result | notes |
|------|--------|-------|
| 1. basic sdk | PASS | works with `@wasmer/sdk/node` import, requires tsx/pnpm |
| 2. directory read | PASS | JS writes, WASM reads via cat - works perfectly |
| 3. directory write (bidirectional) | PARTIAL | touch works (empty files), content-writing commands hang |
| 4. wasm-terminal | FAIL | browser-only (requires window/xterm), not usable in Node.js |
| 5. sdk spawn hooks | NONE | no spawn/exec callback mechanism in SDK |
| 6. custom /bin/node | PARTIAL | `bash -c "source /script"` works; cannot intercept real spawns |
| 7. Node.js WASI | FAIL | no proc_spawn/proc_exec - WASIX extensions not in preview1 |
| 8. raw WASM + JS imports | PASS | WebAssembly.instantiate() with custom imports works |
| 9. WASI + custom imports | **PASS** | can combine Node.js WASI with custom bridge functions |
| 10. custom Wasmer package | PARTIAL | fromWasm() works but wait() hangs |

### new key findings

1. **@wasmer/sdk is locked down**: no way to inject custom imports, override syscalls, or intercept spawns
2. **Node.js WASI preview1 lacks spawn syscalls**: `proc_spawn` is a WASIX extension, not part of standard WASI
3. **raw WebAssembly + custom imports WORKS**: we can create WASM that calls back to JavaScript
4. **WASI + custom bridge imports WORKS**: we can combine standard WASI syscalls with custom bridge functions using Node.js native WASI

### new approach: custom WASM shell binary

based on test 9, a viable approach is:

1. **create a custom WASM binary in Rust/C** that:
   - imports standard WASI functions (fd_write, fd_read, etc)
   - imports custom `bridge.*` functions (spawn_node, spawn_process, etc)
   - acts as a minimal shell that routes commands

2. **use Node.js native WASI** instead of @wasmer/sdk:
   - combine `wasi.wasiImport` with custom bridge imports
   - intercept bridge.spawn_node calls → route to NodeProcess
   - intercept bridge.spawn_process calls → route to Wasmer or system

3. **architecture**:
   ```
   User Code → VirtualMachine.spawn("node script.js")
                    ↓
            Custom WASM Shell Binary
            (imports: WASI + bridge.*)
                    ↓
            bridge.spawn_node("script.js")
                    ↓
            JavaScript Handler
                    ↓
            NodeProcess.spawn()
   ```

### tradeoffs

| approach | pros | cons |
|----------|------|------|
| @wasmer/sdk only | simple, uses existing packages | no spawn interception, can't bridge to JS |
| hybrid routing | simpler JS code | can't run shell scripts that call node |
| custom WASM shell | full control, true bridging | requires building custom WASM binary |

### recommendation

the **custom WASM shell** approach (based on test 9) provides the best long-term solution:
- true process interception at the WASM level
- can run arbitrary shell scripts that spawn node
- full control over syscall handling

for MVP, the **hybrid routing** approach remains viable:
- route linux commands → @wasmer/sdk
- route node commands → NodeProcess directly
- skip shell script support initially

---

## 11. test WASIX syscall interception

comprehensive test to explore all possible ways to intercept WASIX syscalls in @wasmer/sdk.

create `test11-wasix-syscall-intercept.ts`:

```typescript
import { init, Wasmer, Directory, runWasix, wat2wasm, Runtime } from "@wasmer/sdk/node";

async function main(): Promise<void> {
  await init();

  // Test 1: Inspect Runtime class for hidden customization
  const runtime = new Runtime();
  console.log("Runtime prototype methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(runtime)));
  // Result: [ 'constructor', '__destroy_into_raw', 'free', '__getClassname' ]

  // Test 2: Inspect Wasmer class for hook methods
  console.log("Wasmer static properties:", Object.getOwnPropertyNames(Wasmer));
  // Result: Only has createPackage, publishPackage, whoami, fromRegistry, fromFile, fromWasm, deployApp, deleteApp

  // Test 3: Load package and inspect instance for events
  const pkg = await Wasmer.fromRegistry("sharrattj/bash");
  const instance = await pkg.entrypoint!.run({ args: ["-c", "echo test"] });
  console.log("Instance prototype:", Object.getOwnPropertyNames(Object.getPrototypeOf(instance)));
  // Result: [ 'constructor', '__destroy_into_raw', 'free', 'stdin', 'stdout', 'stderr', 'wait' ]
  // No event emitters, no callbacks, no hooks

  // Test 4: Try custom runtime with undocumented options
  const customRuntime = new Runtime({
    registry: null,
    // @ts-ignore
    syscalls: { proc_spawn: () => console.log("hook!") },
    // @ts-ignore
    onSyscall: (name: string) => console.log("syscall:", name)
  } as any);
  // Result: Runtime created but undocumented options are ignored

  // Test 5: Try runWasix with custom imports
  const wasmBytes = wat2wasm(`(module ...)`);
  const instance2 = await runWasix(wasmBytes, {
    args: ["test"],
    // @ts-ignore
    imports: { custom: { intercept: () => {} } }
  });
  // Result: Panics with "Not able to serialize module"
}
```

**result**: FAIL - @wasmer/sdk is completely locked down

key findings from test 11:

| what we tried | result |
|---------------|--------|
| Runtime class inspection | only has free(), __getClassname(), global() - no hooks |
| Wasmer class inspection | only has static methods for loading packages - no hooks |
| Instance inspection | only has stdin/stdout/stderr/wait - no event system |
| Undocumented runtime options | silently ignored |
| Custom imports in runWasix | panics with "Not able to serialize module" |
| Subprocess spawning in bash | times out - WASIX proc_spawn doesn't work or requires special setup |

**conclusion**: there is absolutely no way to intercept syscalls in @wasmer/sdk. the SDK is designed for isolated execution with no escape hatches.

---

## final summary

| test | result | notes |
|------|--------|-------|
| 1. basic sdk | PASS | works with `@wasmer/sdk/node` import, requires tsx/pnpm |
| 2. directory read | PASS | JS writes, WASM reads via cat - works perfectly |
| 3. directory write (bidirectional) | PARTIAL | touch works (empty files), content-writing commands hang |
| 4. wasm-terminal | FAIL | browser-only (requires window/xterm), not usable in Node.js |
| 5. sdk spawn hooks | NONE | no spawn/exec callback mechanism in SDK |
| 6. custom /bin/node | PARTIAL | `bash -c "source /script"` works; cannot intercept real spawns |
| 7. Node.js WASI | FAIL | no proc_spawn/proc_exec - WASIX extensions not in preview1 |
| 8. raw WASM + JS imports | **PASS** | WebAssembly.instantiate() with custom imports works |
| 9. WASI + custom imports | **PASS** | can combine Node.js WASI with custom bridge functions |
| 10. custom Wasmer package | PARTIAL | fromWasm() works but wait() hangs |
| 11. WASIX syscall intercept | **FAIL** | @wasmer/sdk is completely locked down, no hooks |
| 12. WASIX + custom module | **PASS** | WebAssembly.instantiate + WASIX polyfill + bridge imports works |

---

## 12. test WASIX + custom module with bridge imports

test if we can create a custom WASM module that uses both WASIX imports and custom bridge imports.

create `test12-wasix-custom-module.ts`:

```typescript
import { init, Wasmer, runWasix, wat2wasm } from "@wasmer/sdk/node";

async function main(): Promise<void> {
  await init();

  // Create WAT with both WASIX and bridge imports
  const wat = `
    (module
      ;; WASIX imports
      (import "wasi_snapshot_preview1" "fd_write"
        (func $fd_write (param i32 i32 i32 i32) (result i32)))
      (import "wasi_snapshot_preview1" "proc_exit"
        (func $proc_exit (param i32)))

      ;; Custom bridge imports
      (import "bridge" "spawn_node" (func $spawn_node (param i32 i32) (result i32)))
      (import "bridge" "log" (func $log (param i32 i32)))

      (memory (export "memory") 1)
      (data (i32.const 0) "Hello from WASIX!\\n")
      (data (i32.const 100) "script.js")

      (func (export "_start")
        ;; write to stdout, then call bridge functions
        ;; ...
      )
    )
  `;

  const wasmBytes = wat2wasm(wat);

  // Test A: runWasix - FAILS (can't provide bridge imports)
  // Test B: Wasmer.fromWasm - FAILS (can't provide bridge imports)

  // Test C: WebAssembly.instantiate with custom imports - WORKS!
  const wasixPolyfill = {
    fd_write: (fd, iovs, iovs_len, nwritten) => { /* impl */ },
    proc_exit: (code) => console.log(`exit(${code})`),
  };

  const bridgeImports = {
    spawn_node: (ptr, len) => {
      const scriptPath = readFromMemory(ptr, len);
      console.log(`[BRIDGE] spawn_node("${scriptPath}")`);
      return 0;
    },
    log: (ptr, len) => console.log(`[BRIDGE] ${readFromMemory(ptr, len)}`),
  };

  const { instance } = await WebAssembly.instantiate(wasmBytes, {
    wasi_snapshot_preview1: wasixPolyfill,
    bridge: bridgeImports,
  });

  (instance.exports._start as () => void)();
}
```

**result**: PASS

| approach | result |
|----------|--------|
| runWasix with bridge imports | FAILS - times out, can't provide custom imports |
| Wasmer.fromWasm with bridge | FAILS - times out, can't provide custom imports |
| WebAssembly.instantiate + polyfill | **WORKS** - full control over all imports |

output:
```
Hello from WASIX module!
[BRIDGE] log: "Bridge log message from WASM"
[BRIDGE] spawn_node called!
[BRIDGE] Script path: "script.js"
[WASIX] proc_exit(0)
```

**key insight**: we can bypass @wasmer/sdk runtime entirely and use native WebAssembly.instantiate() with:
1. A custom WASIX polyfill (fd_write, proc_exit, etc.)
2. Custom bridge imports (spawn_node, log, etc.)

this confirms the approach: **build custom WASM modules that use WASIX for I/O and bridge.* for JS callbacks**.

## final recommendations

### for MVP: hybrid routing

the simplest approach that works today:

```
User Code → VirtualMachine.spawn(cmd)
                 ↓
         command router (JS)
         /                \
        ↓                  ↓
   node/bun?          linux cmd?
        ↓                  ↓
   NodeProcess       @wasmer/sdk
```

- pros: simple, works now, no custom WASM needed
- cons: can't run shell scripts that call node internally

### for future: custom WASM shell (test 9 approach)

build a custom WASM binary that bridges to JS:

```
User Code → VirtualMachine.spawn(cmd)
                 ↓
         Custom WASM Shell
         (WASI + bridge.* imports)
                 ↓
         bridge.spawn_node("script.js")
                 ↓
         JavaScript Handler → NodeProcess
```

- pros: full control, can run arbitrary shell scripts
- cons: requires building custom WASM binary in Rust/C
- implementation: use Node.js native WASI (not @wasmer/sdk) with custom imports
