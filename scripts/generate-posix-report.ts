#!/usr/bin/env -S npx tsx
/**
 * Generates docs/posix-conformance-report.mdx from test results and exclusion data.
 *
 * Usage: pnpm tsx scripts/generate-posix-report.ts
 *   --input posix-conformance-report.json
 *   --exclusions packages/wasmvm/test/posix-exclusions.json
 *   --output docs/posix-conformance-report.mdx
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { VALID_CATEGORIES, CATEGORY_META, CATEGORY_ORDER } from './posix-exclusion-schema.js';
import type { ExclusionEntry, ExclusionsFile } from './posix-exclusion-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    input: { type: 'string', default: resolve(__dirname, '../posix-conformance-report.json') },
    exclusions: { type: 'string', default: resolve(__dirname, '../packages/wasmvm/test/posix-exclusions.json') },
    output: { type: 'string', default: resolve(__dirname, '../docs/posix-conformance-report.mdx') },
  },
});

const inputPath = resolve(values.input!);
const exclusionsPath = resolve(values.exclusions!);
const outputPath = resolve(values.output!);

// ── Load data ───────────────────────────────────────────────────────────

interface SuiteStats {
  total: number;
  pass: number;
  fail: number;
  skip: number;
}

interface Report {
  osTestVersion: string;
  timestamp: string;
  total: number;
  pass: number;
  fail: number;
  skip: number;
  passRate: string;
  nativeParity: number;
  suites: Record<string, SuiteStats>;
}

const report: Report = JSON.parse(readFileSync(inputPath, 'utf-8'));
const exclusionsData: ExclusionsFile = JSON.parse(readFileSync(exclusionsPath, 'utf-8'));

// ── Group exclusions by category ────────────────────────────────────────

interface GroupedExclusion {
  key: string;
  entry: ExclusionEntry;
}

const validCats = new Set<string>(VALID_CATEGORIES);
const byCategory = new Map<string, GroupedExclusion[]>();
for (const [key, entry] of Object.entries(exclusionsData.exclusions)) {
  const cat = entry.category;
  if (!validCats.has(cat)) {
    throw new Error(`[${key}] Unknown category "${cat}" — valid: ${VALID_CATEGORIES.join(', ')}`);
  }
  if (!byCategory.has(cat)) byCategory.set(cat, []);
  byCategory.get(cat)!.push({ key, entry });
}

// Count total tests matched per exclusion (globs can match many)
function formatExclusionKey(key: string): string {
  return `\`${key}\``;
}

// ── Build MDX ───────────────────────────────────────────────────────────

const lines: string[] = [];

function line(s = '') {
  lines.push(s);
}

// Frontmatter
line('---');
line('title: POSIX Conformance Report');
line('description: os-test POSIX.1-2024 conformance results for WasmVM.');
line('icon: "chart-bar"');
line('---');
line();
line('{/* AUTO-GENERATED — do not edit. Run scripts/generate-posix-report.ts */}');
line();

// Summary table
const mustPass = report.total - report.skip - report.fail;
const nativeParityPct = mustPass > 0 ? ((report.nativeParity / mustPass) * 100).toFixed(1) : '0';
const nativeParityLabel = `${report.nativeParity} of ${mustPass} passing tests verified against native (${nativeParityPct}%)`;
const lastUpdated = report.timestamp ? report.timestamp.split('T')[0] : exclusionsData.lastUpdated;

line('## Summary');
line();
line('| Metric | Value |');
line('| --- | --- |');
line(`| os-test version | ${report.osTestVersion} |`);
line(`| Total tests | ${report.total} |`);
line(`| Passing | ${report.pass} (${report.passRate}) |`);
line(`| Expected fail | ${report.fail} |`);
line(`| Skip | ${report.skip} |`);
line(`| Native parity | ${nativeParityLabel} |`);
line(`| Last updated | ${lastUpdated} |`);
line();

// Per-suite results table
line('## Per-Suite Results');
line();
line('| Suite | Total | Pass | Fail | Skip | Pass Rate |');
line('| --- | --- | --- | --- | --- | --- |');

const sortedSuites = Object.entries(report.suites).sort(([a], [b]) => a.localeCompare(b));
for (const [suite, stats] of sortedSuites) {
  const runnable = stats.total - stats.skip;
  const rate = runnable > 0 ? `${((stats.pass / runnable) * 100).toFixed(1)}%` : '—';
  line(`| ${suite} | ${stats.total} | ${stats.pass} | ${stats.fail} | ${stats.skip} | ${rate} |`);
}

// Totals row
const totalRate = mustPass > 0 ? `${((report.pass / mustPass) * 100).toFixed(1)}%` : '—';
line(`| **Total** | **${report.total}** | **${report.pass}** | **${report.fail}** | **${report.skip}** | **${totalRate}** |`);
line();

// Exclusions by category
line('## Exclusions by Category');
line();

// Order categories logically
for (const cat of CATEGORY_ORDER) {
  const entries = byCategory.get(cat);
  if (!entries || entries.length === 0) continue;

  const meta = CATEGORY_META[cat];
  const totalExcluded = entries.length;

  line(`### ${meta.title} (${totalExcluded} ${totalExcluded === 1 ? 'entry' : 'entries'})`);
  line();
  line(meta.description);
  line();

  // Use a table with issue column for fail/implementation-gap/patched-sysroot
  const hasIssues = entries.some((e) => e.entry.issue);

  if (hasIssues) {
    line('| Test | Reason | Issue |');
    line('| --- | --- | --- |');
    for (const { key, entry } of entries) {
      const issueLink = entry.issue
        ? `[${entry.issue.replace('https://github.com/rivet-dev/secure-exec/issues/', '#')}](${entry.issue})`
        : '—';
      line(`| ${formatExclusionKey(key)} | ${entry.reason} | ${issueLink} |`);
    }
  } else {
    line('| Test | Reason |');
    line('| --- | --- |');
    for (const { key, entry } of entries) {
      line(`| ${formatExclusionKey(key)} | ${entry.reason} |`);
    }
  }
  line();
}

// ── Write output ────────────────────────────────────────────────────────

const mdx = lines.join('\n');
writeFileSync(outputPath, mdx, 'utf-8');

console.log(`POSIX Conformance Report generated`);
console.log(`  Input:      ${inputPath}`);
console.log(`  Exclusions: ${exclusionsPath}`);
console.log(`  Output:     ${outputPath}`);
console.log(`  Summary:    ${report.pass}/${report.total} passing (${report.passRate})`);
