/**
 * Shared schema for posix-exclusions.json.
 *
 * Single source of truth for valid categories, expected values,
 * and the ExclusionEntry interface. Used by:
 *   - validate-posix-exclusions.ts
 *   - generate-posix-report.ts
 *   - posix-conformance.test.ts
 */

export const VALID_EXPECTED = ['fail', 'skip'] as const;
export type ExclusionExpected = (typeof VALID_EXPECTED)[number];

export const VALID_CATEGORIES = [
  'wasm-limitation',
  'wasi-gap',
  'implementation-gap',
  'patched-sysroot',
  'compile-error',
  'timeout',
] as const;
export type ExclusionCategory = (typeof VALID_CATEGORIES)[number];

export interface ExclusionEntry {
  expected: ExclusionExpected;
  reason: string;
  category: ExclusionCategory;
  issue?: string;
}

export interface ExclusionsFile {
  osTestVersion: string;
  sourceCommit: string;
  lastUpdated: string;
  exclusions: Record<string, ExclusionEntry>;
}

/** Category metadata for report generation (ordered for display). */
export const CATEGORY_META: Record<ExclusionCategory, { title: string; description: string }> = {
  'wasm-limitation': {
    title: 'WASM Limitations',
    description: 'Features impossible in wasm32-wasip1.',
  },
  'wasi-gap': {
    title: 'WASI Gaps',
    description: 'WASI Preview 1 lacks the required syscall.',
  },
  'implementation-gap': {
    title: 'Implementation Gaps',
    description: 'Features we should support but don\'t yet. Each has a tracking issue.',
  },
  'patched-sysroot': {
    title: 'Patched Sysroot',
    description: 'Test requires patched sysroot features not yet wired.',
  },
  'compile-error': {
    title: 'Compile Errors',
    description: 'Tests that don\'t compile for wasm32-wasip1 (missing headers, etc.).',
  },
  'timeout': {
    title: 'Timeouts',
    description: 'Tests that hang or take too long in WASM.',
  },
};

/** Display order for categories in reports. */
export const CATEGORY_ORDER: ExclusionCategory[] = [
  'wasm-limitation', 'wasi-gap', 'compile-error',
  'implementation-gap', 'patched-sysroot', 'timeout',
];
