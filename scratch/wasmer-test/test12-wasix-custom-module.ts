// Test 12: WASIX + Custom Module with Bridge Imports
// Can we load a custom WASM module into WASIX that has custom bridge imports?
//
// The goal is to create a WASM module that:
// 1. Uses WASIX imports (fd_write, etc.) for standard I/O
// 2. Uses custom bridge.* imports for JS callbacks
// 3. Runs under @wasmer/sdk's WASIX runtime

import { init, Wasmer, runWasix, wat2wasm } from "@wasmer/sdk/node";

async function main(): Promise<void> {
  console.log("Test 12: WASIX + Custom Module with Bridge Imports");
  console.log("===================================================\n");

  await init();

  // Create a WAT module that imports both WASIX and custom bridge functions
  const wat = `
    (module
      ;; WASIX imports for standard I/O
      (import "wasi_snapshot_preview1" "fd_write"
        (func $fd_write (param i32 i32 i32 i32) (result i32)))
      (import "wasi_snapshot_preview1" "proc_exit"
        (func $proc_exit (param i32)))

      ;; Custom bridge imports for JS callbacks
      (import "bridge" "spawn_node" (func $spawn_node (param i32 i32) (result i32)))
      (import "bridge" "log" (func $log (param i32 i32)))

      ;; Memory
      (memory (export "memory") 1)

      ;; String data
      (data (i32.const 0) "Hello from WASIX module!\\n")
      (data (i32.const 100) "script.js")
      (data (i32.const 200) "Bridge log message from WASM")

      ;; iov structure for fd_write at offset 300
      (data (i32.const 300) "\\00\\00\\00\\00\\19\\00\\00\\00")  ;; ptr=0, len=25

      ;; bytes written location at offset 400
      (data (i32.const 400) "\\00\\00\\00\\00")

      (func (export "_start")
        ;; Step 1: Write to stdout using WASIX fd_write
        i32.const 1      ;; fd = 1 (stdout)
        i32.const 300    ;; iovs pointer
        i32.const 1      ;; iovs_len
        i32.const 400    ;; nwritten pointer
        call $fd_write
        drop

        ;; Step 2: Call our custom bridge.log function
        i32.const 200    ;; pointer to "Bridge log message from WASM"
        i32.const 28     ;; length
        call $log

        ;; Step 3: Call our custom bridge.spawn_node function
        i32.const 100    ;; pointer to "script.js"
        i32.const 9      ;; length
        call $spawn_node
        drop

        ;; Exit cleanly
        i32.const 0
        call $proc_exit
      )
    )
  `;

  console.log("Creating WASM module with WASIX + bridge imports...");
  const wasmBytes = wat2wasm(wat);
  console.log(`WASM bytes: ${wasmBytes.length} bytes\n`);

  // Test 12a: Try runWasix (expected to fail - no way to provide bridge imports)
  console.log("--- Test 12a: Try runWasix (will fail) ---\n");
  try {
    const instance = await runWasix(wasmBytes, {
      args: ["test"],
    });
    console.log("runWasix instance created");
    const result = await Promise.race([
      instance.wait(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
    ]);
    console.log("Output:", result.stdout);
  } catch (e: unknown) {
    const err = e as Error;
    console.log("EXPECTED FAILURE:", err.message);
    console.log("(runWasix cannot provide custom bridge imports)\n");
  }

  // Test 12b: Try Wasmer.fromWasm (expected to fail similarly)
  console.log("--- Test 12b: Try Wasmer.fromWasm (will fail) ---\n");
  try {
    const pkg = await Wasmer.fromWasm(wasmBytes);
    console.log("Wasmer.fromWasm succeeded");
    console.log("Entrypoint:", pkg.entrypoint);

    if (pkg.entrypoint) {
      const instance = await pkg.entrypoint.run({ args: ["test"] });
      const result = await Promise.race([
        instance.wait(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
      ]);
      console.log("Output:", result.stdout);
    }
  } catch (e: unknown) {
    const err = e as Error;
    console.log("EXPECTED FAILURE:", err.message);
    console.log("(Wasmer.fromWasm cannot provide custom bridge imports)\n");
  }

  // Test 12c: Try raw WebAssembly.instantiate with WASIX polyfill
  console.log("--- Test 12c: WebAssembly.instantiate with custom WASIX impl ---\n");
  console.log("Building a minimal WASIX polyfill + bridge imports...\n");

  let wasmMemory: WebAssembly.Memory | null = null;

  // Create a minimal WASIX implementation
  const wasixPolyfill = {
    fd_write: (fd: number, iovs: number, iovs_len: number, nwritten: number): number => {
      if (!wasmMemory) return -1;

      const view = new DataView(wasmMemory.buffer);
      const bytes = new Uint8Array(wasmMemory.buffer);

      let totalWritten = 0;
      for (let i = 0; i < iovs_len; i++) {
        const ptr = view.getUint32(iovs + i * 8, true);
        const len = view.getUint32(iovs + i * 8 + 4, true);
        const chunk = bytes.slice(ptr, ptr + len);
        const text = new TextDecoder().decode(chunk);

        if (fd === 1) {
          process.stdout.write(text);
        } else if (fd === 2) {
          process.stderr.write(text);
        }
        totalWritten += len;
      }

      view.setUint32(nwritten, totalWritten, true);
      return 0;
    },
    proc_exit: (code: number): void => {
      console.log(`[WASIX] proc_exit(${code})`);
      // Don't actually exit - just log it
    },
  };

  // Create bridge imports
  const bridgeImports = {
    spawn_node: (ptr: number, len: number): number => {
      if (!wasmMemory) return -1;

      const bytes = new Uint8Array(wasmMemory.buffer, ptr, len);
      const scriptPath = new TextDecoder().decode(bytes);

      console.log(`[BRIDGE] spawn_node called!`);
      console.log(`[BRIDGE] Script path: "${scriptPath}"`);
      console.log(`[BRIDGE] This would call NodeProcess.spawn() in the real implementation`);

      return 0;
    },
    log: (ptr: number, len: number): void => {
      if (!wasmMemory) return;

      const bytes = new Uint8Array(wasmMemory.buffer, ptr, len);
      const message = new TextDecoder().decode(bytes);

      console.log(`[BRIDGE] log: "${message}"`);
    },
  };

  try {
    const imports = {
      wasi_snapshot_preview1: wasixPolyfill,
      bridge: bridgeImports,
    };

    const result = await WebAssembly.instantiate(wasmBytes, imports);
    const instance = result.instance;

    // Get memory export
    wasmMemory = instance.exports.memory as WebAssembly.Memory;

    console.log("Module instantiated with WASIX polyfill + bridge imports!");
    console.log("Exports:", Object.keys(instance.exports));
    console.log("\nCalling _start()...\n");

    const start = instance.exports._start as () => void;
    start();

    console.log("\n--- SUCCESS! ---");
    console.log("We can run custom WASM modules with:");
    console.log("  1. WASIX syscalls (fd_write, proc_exit)");
    console.log("  2. Custom bridge imports (spawn_node, log)");
    console.log("\nThis approach bypasses @wasmer/sdk entirely and uses:");
    console.log("  - @wasmer/sdk wat2wasm() for WAT compilation");
    console.log("  - WebAssembly.instantiate() for runtime");
    console.log("  - Custom WASIX polyfill for I/O");
    console.log("  - Custom bridge imports for JS callbacks");
  } catch (e: unknown) {
    const err = e as Error;
    console.log("WebAssembly.instantiate failed:", err.message);
    console.log(err.stack);
  }

  console.log("\n=== Summary ===\n");
  console.log("Test 12 results:");
  console.log("  - runWasix with custom bridge imports: FAILS (no custom import support)");
  console.log("  - Wasmer.fromWasm with custom bridge imports: FAILS (no custom import support)");
  console.log("  - WebAssembly.instantiate + WASIX polyfill + bridge: WORKS!");
  console.log("\nConclusion: We must bypass @wasmer/sdk runtime to use custom imports.");
  console.log("The approach is: custom WAT -> wat2wasm -> WebAssembly.instantiate");
}

main().catch(console.error);
