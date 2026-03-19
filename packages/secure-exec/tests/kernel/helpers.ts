/**
 * Cross-runtime integration test helpers.
 *
 * Creates a real kernel with InMemoryFileSystem and mounts actual runtime
 * drivers (WasmVM, Node, Python). Used by all kernel/ integration tests.
 *
 * Uses relative imports to avoid cyclic package dependencies
 * (runtime-node depends on secure-exec).
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKernel } from '../../../kernel/src/index.ts';
import type { Kernel, VirtualFileSystem } from '../../../kernel/src/index.ts';
import { InMemoryFileSystem } from '../../../os/browser/src/index.ts';
import { createWasmVmRuntime } from '../../../runtime/wasmvm/src/index.ts';
import { createNodeRuntime } from '../../../runtime/node/src/index.ts';
import { createPythonRuntime } from '../../../runtime/python/src/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// WASM standalone binaries directory (relative to this file → repo root)
const COMMANDS_DIR = resolve(
  __dirname,
  '../../../../wasmvm/target/wasm32-wasip1/release/commands',
);

export interface IntegrationKernelResult {
  kernel: Kernel;
  vfs: VirtualFileSystem;
  dispose: () => Promise<void>;
}

export interface IntegrationKernelOptions {
  runtimes?: ('wasmvm' | 'node' | 'python')[];
}

/**
 * Create a kernel with real runtime drivers for integration testing.
 *
 * Mount order matters — last-mounted driver wins for overlapping commands:
 *   1. WasmVM first: provides sh/bash/coreutils (90+ commands)
 *   2. Node second: overrides WasmVM's 'node' stub with real V8
 *   3. Python third: overrides WasmVM's 'python' stub with real Pyodide
 */
export async function createIntegrationKernel(
  options?: IntegrationKernelOptions,
): Promise<IntegrationKernelResult> {
  const runtimes = options?.runtimes ?? ['wasmvm'];
  const vfs = new InMemoryFileSystem();
  const kernel = createKernel({ filesystem: vfs });

  // Mount in fixed order: WasmVM → Node → Python
  // This ensures WasmVM provides the shell, while Node/Python override stubs
  if (runtimes.includes('wasmvm')) {
    await kernel.mount(
      createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }),
    );
  }
  if (runtimes.includes('node')) {
    await kernel.mount(createNodeRuntime());
  }
  if (runtimes.includes('python')) {
    await kernel.mount(createPythonRuntime());
  }

  return {
    kernel,
    vfs,
    dispose: () => kernel.dispose(),
  };
}

/**
 * Skip helper: returns a reason string if the WASM binaries are not built,
 * or false if the commands directory exists and tests can run.
 */
export function skipUnlessWasmBuilt(): string | false {
  return existsSync(COMMANDS_DIR)
    ? false
    : 'WASM binaries not built (run make wasm in wasmvm/)';
}

/**
 * Skip helper: returns a reason string if Pyodide is not available,
 * or false if Pyodide can be loaded.
 */
export function skipUnlessPyodide(): string | false {
  try {
    const require = createRequire(import.meta.url);
    require.resolve('pyodide');
    return false;
  } catch {
    return 'pyodide not installed';
  }
}
