#!/usr/bin/env -S npx tsx
/**
 * Pulls musl libc-test from the Bytecode Alliance mirror and replaces the local source.
 *
 * Usage: pnpm tsx scripts/import-libc-test.ts --version master
 *   Downloads the specified branch/tag from GitHub and replaces
 *   native/wasmvm/c/libc-test/ with the new source. Prints a diff summary
 *   of added/removed/changed files.
 */

import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    version: { type: 'string', short: 'v' },
  },
});

if (!values.version) {
  console.error('Usage: pnpm tsx scripts/import-libc-test.ts --version <version>');
  console.error('  e.g. --version master  or  --version v1.0.0');
  process.exit(1);
}

const version = values.version;

// Validate version format
const VERSION_RE = /^[a-zA-Z0-9][a-zA-Z0-9._\-/]*$/;
if (!VERSION_RE.test(version)) {
  console.error(`Invalid version format: "${version}"`);
  process.exit(1);
}

// ── Paths ───────────────────────────────────────────────────────────────

const C_DIR = resolve(__dirname, '../native/wasmvm/c');
const LIBC_TEST_DIR = join(C_DIR, 'libc-test');
const CACHE_DIR = join(C_DIR, '.cache/libs');
const ARCHIVE_PATH = join(CACHE_DIR, 'libc-test.tar.gz');
const TEMP_DIR = join(C_DIR, 'libc-test-incoming');
const URL = `https://github.com/bytecodealliance/libc-test/archive/refs/heads/${version}.tar.gz`;
const EXCLUSIONS_PATH = resolve(__dirname, '../packages/wasmvm/test/libc-test-exclusions.json');

// ── Helpers ─────────────────────────────────────────────────────────────

function collectFiles(dir: string, prefix = ''): Set<string> {
  const results = new Set<string>();
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const f of collectFiles(join(dir, entry.name), rel)) {
        results.add(f);
      }
    } else {
      results.add(rel);
    }
  }
  return results;
}

function resolveCommitHash(ref: string): string {
  try {
    const output = execSync(
      `git ls-remote https://github.com/bytecodealliance/libc-test.git "${ref}"`,
      { stdio: 'pipe', encoding: 'utf-8' },
    ).trim();
    const match = output.match(/^([0-9a-f]{40})/m);
    if (match) return match[1];
  } catch {
    // Fall through
  }
  if (/^[0-9a-f]{40}$/.test(ref)) return ref;
  console.warn(`  Warning: could not resolve commit hash for "${ref}" — using as-is`);
  return ref;
}

// ── Snapshot existing files ─────────────────────────────────────────────

console.log(`Importing musl libc-test ${version}`);
console.log(`  URL: ${URL}`);
console.log('');

const oldFiles = collectFiles(LIBC_TEST_DIR);

// ── Download ────────────────────────────────────────────────────────────

console.log('Downloading...');
mkdirSync(CACHE_DIR, { recursive: true });

try {
  execSync(`curl -fSL "${URL}" -o "${ARCHIVE_PATH}"`, { stdio: 'pipe' });
} catch {
  console.error(`Download failed.`);
  console.error(`  URL: ${URL}`);
  process.exit(1);
}

const archiveSize = statSync(ARCHIVE_PATH).size;
console.log(`  Downloaded ${(archiveSize / 1024 / 1024).toFixed(1)} MB`);

// ── Extract to temp dir and validate ────────────────────────────────────

console.log('Extracting to temp directory...');

if (existsSync(TEMP_DIR)) {
  rmSync(TEMP_DIR, { recursive: true, force: true });
}
mkdirSync(TEMP_DIR, { recursive: true });

try {
  execSync(`tar -xzf "${ARCHIVE_PATH}" --strip-components=1 -C "${TEMP_DIR}"`, {
    stdio: 'pipe',
  });
} catch (err) {
  rmSync(TEMP_DIR, { recursive: true, force: true });
  console.error('Extraction failed — existing libc-test/ is untouched.');
  process.exit(1);
}

// Validate: libc-test has src/ directory with .c files
const tempFiles = collectFiles(TEMP_DIR);
const tempCFiles = [...tempFiles].filter((f) => f.endsWith('.c'));
if (tempCFiles.length === 0) {
  rmSync(TEMP_DIR, { recursive: true, force: true });
  console.error('Validation failed: extracted archive contains no .c files.');
  console.error('  Existing libc-test/ is untouched.');
  process.exit(1);
}

console.log(`  Validated: ${tempCFiles.length} .c files found`);

// ── Swap: remove old, move new into place ───────────────────────────────

console.log('Replacing libc-test/ ...');
if (existsSync(LIBC_TEST_DIR)) {
  rmSync(LIBC_TEST_DIR, { recursive: true, force: true });
}
renameSync(TEMP_DIR, LIBC_TEST_DIR);

// ── Resolve commit hash and update exclusions metadata ──────────────────

console.log('Resolving commit hash...');
const commitHash = resolveCommitHash(version);
console.log(`  Commit: ${commitHash}`);

if (existsSync(EXCLUSIONS_PATH)) {
  const exclusions = JSON.parse(readFileSync(EXCLUSIONS_PATH, 'utf-8'));
  exclusions.libcTestVersion = version;
  exclusions.sourceCommit = commitHash;
  exclusions.lastUpdated = new Date().toISOString().slice(0, 10);
  writeFileSync(EXCLUSIONS_PATH, JSON.stringify(exclusions, null, 2) + '\n');
  console.log('  Updated libc-test-exclusions.json metadata');
}

// ── Diff summary ────────────────────────────────────────────────────────

const newFiles = collectFiles(LIBC_TEST_DIR);

const added: string[] = [];
const removed: string[] = [];

for (const f of newFiles) {
  if (!oldFiles.has(f)) added.push(f);
}
for (const f of oldFiles) {
  if (!newFiles.has(f)) removed.push(f);
}

const cFiles = [...newFiles].filter((f) => f.endsWith('.c'));

console.log('');
console.log('Diff Summary');
console.log('\u2500'.repeat(50));
console.log(`  Previously: ${oldFiles.size} files`);
console.log(`  Now:        ${newFiles.size} files`);
console.log(`  Added:      ${added.length} files`);
console.log(`  Removed:    ${removed.length} files`);
console.log(`  C tests:    ${cFiles.length} .c files`);

if (added.length > 0 && added.length <= 50) {
  console.log('');
  console.log('  Added files:');
  for (const f of added.sort()) console.log(`    + ${f}`);
}

if (removed.length > 0 && removed.length <= 50) {
  console.log('');
  console.log('  Removed files:');
  for (const f of removed.sort()) console.log(`    - ${f}`);
}

if (added.length > 50 || removed.length > 50) {
  console.log('');
  console.log(`  (${added.length} added / ${removed.length} removed — too many to list)`);
}

// ── Next steps ──────────────────────────────────────────────────────────

console.log('');
console.log('Next steps:');
console.log('  1. Rebuild:  make -C native/wasmvm/c libc-test libc-test-native');
console.log('  2. Test:     pnpm vitest run packages/wasmvm/test/libc-test-conformance.test.ts');
console.log('  3. Update exclusions: review new failures and update libc-test-exclusions.json');
console.log('  4. Validate: pnpm tsx scripts/validate-libc-test-exclusions.ts');
console.log('  5. Report:   pnpm tsx scripts/generate-libc-test-report.ts');
