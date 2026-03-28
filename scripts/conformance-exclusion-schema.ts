/**
 * Shared schema for conformance exclusion files.
 *
 * Single source of truth for valid categories, expected values,
 * and the ExclusionEntry interface. Used by:
 *   - os-test-conformance.test.ts / validate-os-test-exclusions.ts / generate-os-test-report.ts
 *   - libc-test-conformance.test.ts / validate-libc-test-exclusions.ts / generate-libc-test-report.ts
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
  sourceCommit: string;
  lastUpdated: string;
  exclusions: Record<string, ExclusionEntry>;
  [key: string]: unknown;
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
