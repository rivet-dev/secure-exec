#!/usr/bin/env -S npx tsx
/**
 * Validates posix-exclusions.json for integrity.
 *
 * Checks:
 * 1. Every exclusion key matches a compiled test binary
 * 2. Every entry has a non-empty reason string
 * 3. Every expected-fail entry has a non-empty issue URL
 * 4. Every entry has a valid category from the fixed set
 * 5. Every entry has a valid expected value (fail or skip)
 *
 * Usage: pnpm tsx scripts/validate-posix-exclusions.ts
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VALID_EXPECTED, VALID_CATEGORIES } from './posix-exclusion-schema.js';
import type { ExclusionEntry } from './posix-exclusion-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Paths ──────────────────────────────────────────────────────────────

const EXCLUSIONS_PATH = resolve(__dirname, '../packages/wasmvm/test/posix-exclusions.json');
const OS_TEST_WASM_DIR = resolve(__dirname, '../native/wasmvm/c/build/os-test');

// ── Test discovery ─────────────────────────────────────────────────────

function discoverTests(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...discoverTests(join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results.sort();
}

// ── Load data ──────────────────────────────────────────────────────────

const exclusionsData = JSON.parse(readFileSync(EXCLUSIONS_PATH, 'utf-8'));
const exclusions: Record<string, ExclusionEntry> = exclusionsData.exclusions;
const allTests = discoverTests(OS_TEST_WASM_DIR);

// ── Validation ─────────────────────────────────────────────────────────

const errors: string[] = [];
const warnings: string[] = [];

for (const [key, entry] of Object.entries(exclusions)) {
  // Valid expected value
  if (!VALID_EXPECTED.includes(entry.expected as any)) {
    errors.push(`[${key}] Invalid expected "${entry.expected}" — must be one of: ${VALID_EXPECTED.join(', ')}`);
  }

  // Valid category
  if (!VALID_CATEGORIES.includes(entry.category as any)) {
    errors.push(`[${key}] Invalid category "${entry.category}" — must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }

  // Non-empty reason
  if (!entry.reason || entry.reason.trim().length === 0) {
    errors.push(`[${key}] Missing or empty reason`);
  }

  // expected-fail entries must have issue URL matching GitHub pattern
  if (entry.expected === 'fail') {
    if (!entry.issue || entry.issue.trim().length === 0) {
      errors.push(`[${key}] Expected "fail" but missing issue URL`);
    } else if (!/^https:\/\/github\.com\/rivet-dev\/secure-exec\/issues\/\d+$/.test(entry.issue)) {
      errors.push(`[${key}] Issue URL must match https://github.com/rivet-dev/secure-exec/issues/<number>, got: ${entry.issue}`);
    }
  }

  // Key must match a compiled test binary
  if (allTests.length > 0 && !allTests.includes(key)) {
    warnings.push(`[${key}] Does not match any compiled test binary`);
  }
}

// ── Output ─────────────────────────────────────────────────────────────

if (allTests.length === 0) {
  console.log('Warning: No compiled os-test WASM binaries found — skipping binary checks');
  console.log(`  Build them with: make -C native/wasmvm/c os-test`);
}

const entryCount = Object.keys(exclusions).length;
const skipCount = Object.values(exclusions).filter((e) => e.expected === 'skip').length;
const failCount = Object.values(exclusions).filter((e) => e.expected === 'fail').length;

console.log(`\nPOSIX Exclusion List Validation`);
console.log('─'.repeat(50));
console.log(`Entries:          ${entryCount}`);
console.log(`Expected fail:    ${failCount}`);
console.log(`Skip (unrunnable): ${skipCount}`);
console.log(`Test binaries:    ${allTests.length}`);
console.log('');

if (warnings.length > 0) {
  console.log(`Warnings (${warnings.length}):`);
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log('');
}

if (errors.length > 0) {
  console.log(`Errors (${errors.length}):`);
  for (const e of errors) console.log(`  x ${e}`);
  console.log('');
  process.exit(1);
}

console.log('All checks passed');
