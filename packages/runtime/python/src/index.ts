/**
 * @secure-exec/runtime-python
 *
 * Thin re-export layer. Canonical source now lives in @secure-exec/python.
 * This package exists for backward compatibility and will be removed in a future release.
 */

export { createPythonRuntime } from '@secure-exec/python';
export type { PythonRuntimeOptions } from '@secure-exec/python';
