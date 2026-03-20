/**
 * Test helper: re-exports FDTable from src/ plus all WASI constants/types.
 *
 * Existing tests can import everything they need from this single file.
 */

export { FDTable } from '../../src/fd-table.ts';

// Re-exports for convenience — tests can import everything from this file
export * from '../../src/wasi-constants.ts';
export * from '../../src/wasi-types.ts';
