/**
 * Cross-runtime terminal tests — node -e and python3 -c from brush-shell.
 *
 * Mounts WasmVM + Node + Python into the same kernel and verifies
 * interactive output through TerminalHarness.
 *
 * Gated: WasmVM binary required for all tests, Pyodide import for Python.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { TerminalHarness } from '../../../kernel/test/terminal-harness.ts';
import {
  createIntegrationKernel,
  skipUnlessWasmBuilt,
  type IntegrationKernelResult,
} from './helpers.ts';

/** brush-shell interactive prompt. */
const PROMPT = 'sh-0.4$ ';

const wasmSkip = skipUnlessWasmBuilt();

// Dynamic import check — require.resolve finds pyodide but ESM import may fail
let pyodideImportable = false;
try {
  await import('pyodide');
  pyodideImportable = true;
} catch {
  // pyodide can't be imported as ESM — skip Python tests
}

// ---------------------------------------------------------------------------
// Node cross-runtime terminal tests
// ---------------------------------------------------------------------------

describe.skipIf(wasmSkip)('cross-runtime terminal: node', () => {
  let harness: TerminalHarness;
  let ctx: IntegrationKernelResult;

  afterEach(async () => {
    await harness?.dispose();
    await ctx?.dispose();
  });

  it('node -e "console.log(42)" → 42 appears on screen', async () => {
    ctx = await createIntegrationKernel({ runtimes: ['wasmvm', 'node'] });
    harness = new TerminalHarness(ctx.kernel);

    await harness.waitFor(PROMPT);
    await harness.type('node -e "console.log(42)"\n');
    await harness.waitFor(PROMPT, 2, 10_000);

    const screen = harness.screenshotTrimmed();
    expect(screen).toContain('42');
    // Verify prompt returned
    const lines = screen.split('\n');
    expect(lines[lines.length - 1]).toBe(PROMPT);
  }, 15_000);

  it('^C during node -e — shell survives and prompt returns', async () => {
    ctx = await createIntegrationKernel({ runtimes: ['wasmvm', 'node'] });
    harness = new TerminalHarness(ctx.kernel);

    await harness.waitFor(PROMPT);
    // Start a long-running node process
    harness.shell.write('node -e "setTimeout(() => {}, 60000)"\n');

    // Give it a moment to start, then send ^C
    await new Promise((r) => setTimeout(r, 500));
    harness.shell.write('\x03');

    // Wait for prompt to return
    await harness.waitFor(PROMPT, 2, 10_000);

    // Verify shell is still alive — type another command
    await harness.type('echo alive\n');
    await harness.waitFor('alive', 1, 5_000);

    const screen = harness.screenshotTrimmed();
    expect(screen).toContain('alive');
  }, 20_000);
});

// ---------------------------------------------------------------------------
// Python cross-runtime terminal tests
// ---------------------------------------------------------------------------

describe.skipIf(wasmSkip || !pyodideImportable)('cross-runtime terminal: python', () => {
  let harness: TerminalHarness;
  let ctx: IntegrationKernelResult;

  afterEach(async () => {
    await harness?.dispose();
    await ctx?.dispose();
  });

  it('python3 -c "print(99)" → 99 appears on screen', async () => {
    ctx = await createIntegrationKernel({
      runtimes: ['wasmvm', 'python'],
    });
    harness = new TerminalHarness(ctx.kernel);

    await harness.waitFor(PROMPT);
    await harness.type('python3 -c "print(99)"\n');
    await harness.waitFor(PROMPT, 2, 30_000);

    const screen = harness.screenshotTrimmed();
    expect(screen).toContain('99');
    // Verify prompt returned
    const lines = screen.split('\n');
    expect(lines[lines.length - 1]).toBe(PROMPT);
  }, 45_000);
});
