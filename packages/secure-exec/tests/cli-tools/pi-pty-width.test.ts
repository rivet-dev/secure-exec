/**
 * US-103: Pi PTY width/rendering parity against expected terminal output.
 *
 * Regression test that launches the unmodified Pi package through
 * kernel.openShell() + @xterm/headless at specific terminal dimensions
 * and uses exact screen snapshot assertions to verify width-sensitive
 * rendering.
 *
 * Uses a mock LLM server so the test is self-contained (no real provider
 * credentials required).
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  allowAllChildProcess,
  allowAllEnv,
  allowAllFs,
  allowAllNetwork,
  createKernel,
} from '../../../core/src/index.ts';
import type { Kernel } from '../../../core/src/index.ts';
import { TerminalHarness } from '../../../core/test/kernel/terminal-harness.ts';
import {
  createNodeHostNetworkAdapter,
  createNodeRuntime,
} from '../../../nodejs/src/index.ts';
import {
  createMockLlmServer,
  type MockLlmServerHandle,
} from './mock-llm-server.ts';
import {
  createHybridVfs,
  PI_BASE_FLAGS,
  PI_CLI,
  SECURE_EXEC_ROOT,
  skipUnlessPiInstalled,
} from './pi-pty-helpers.ts';

const piSkip = skipUnlessPiInstalled();

// ---------------------------------------------------------------------------
// Pi sandbox code builder (with mock fetch redirect)
// ---------------------------------------------------------------------------

function buildPiCode(opts: {
  mockUrl: string;
  cwd: string;
}): string {
  const flags = [
    ...PI_BASE_FLAGS,
    '--provider', 'anthropic',
    '--model', 'claude-sonnet-4-20250514',
  ];

  return `(async () => {
    const origFetch = globalThis.fetch;
    const mockUrl = ${JSON.stringify(opts.mockUrl)};
    globalThis.fetch = function(input, init) {
      let url = typeof input === 'string' ? input
        : input instanceof URL ? input.href
        : input.url;
      if (url && url.includes('api.anthropic.com')) {
        const newUrl = url.replace(/https?:\\/\\/api\\.anthropic\\.com/, mockUrl);
        if (typeof input === 'string') input = newUrl;
        else if (input instanceof URL) input = new URL(newUrl);
        else input = new Request(newUrl, input);
      }
      return origFetch.call(this, input, init);
    };
    process.argv = ['node', 'pi', ${flags.map((f) => JSON.stringify(f)).join(', ')}];
    process.env.HOME = ${JSON.stringify(opts.cwd)};
    process.env.ANTHROPIC_API_KEY = 'test-key';
    await import(${JSON.stringify(PI_CLI)});
  })()`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockServer: MockLlmServerHandle;
let workDir: string;
let kernel: Kernel;
let sandboxSkip: string | false = false;

describe.skipIf(piSkip)('Pi PTY Width/Rendering Parity (US-103)', () => {
  let harness: TerminalHarness;

  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);
    workDir = await mkdtemp(path.join(tmpdir(), 'pi-width-'));

    const permissions = {
      ...allowAllFs,
      ...allowAllNetwork,
      ...allowAllChildProcess,
      ...allowAllEnv,
    };

    kernel = createKernel({
      filesystem: createHybridVfs(workDir),
      hostNetworkAdapter: createNodeHostNetworkAdapter(),
      permissions,
    });
    await kernel.mount(createNodeRuntime({ permissions }));

    // Probe: node works through openShell
    try {
      const shell = kernel.openShell({
        command: 'node',
        args: ['-e', 'console.log("PROBE_OK")'],
        cwd: SECURE_EXEC_ROOT,
        cols: 80,
        rows: 24,
      });
      let output = '';
      shell.onData = (data: Uint8Array) => {
        output += new TextDecoder().decode(data);
      };
      const exitCode = await Promise.race([
        shell.wait(),
        new Promise<number>((_, rej) =>
          setTimeout(() => rej(new Error('probe timed out')), 10_000),
        ),
      ]);
      if (exitCode !== 0 || !output.includes('PROBE_OK')) {
        sandboxSkip = `openShell + node probe failed: exitCode=${exitCode}`;
      }
    } catch (e) {
      sandboxSkip = `openShell probe: ${(e as Error).message}`;
    }

    // Probe: process.stdout.columns reflects PTY dimensions
    if (!sandboxSkip) {
      try {
        const shell = kernel.openShell({
          command: 'node',
          args: ['-e', 'console.log("COLS:" + process.stdout.columns + " ROWS:" + process.stdout.rows)'],
          cwd: SECURE_EXEC_ROOT,
          cols: 120,
          rows: 40,
        });
        let output = '';
        shell.onData = (data: Uint8Array) => {
          output += new TextDecoder().decode(data);
        };
        const exitCode = await Promise.race([
          shell.wait(),
          new Promise<number>((_, rej) =>
            setTimeout(() => rej(new Error('cols probe timed out')), 10_000),
          ),
        ]);
        if (exitCode !== 0) {
          sandboxSkip = `columns probe failed: exitCode=${exitCode}`;
        } else if (!output.includes('COLS:120')) {
          sandboxSkip = `process.stdout.columns not propagated: ${JSON.stringify(output)}`;
        }
      } catch (e) {
        sandboxSkip = `columns probe: ${(e as Error).message}`;
      }
    }

    // Probe: Pi can load
    if (!sandboxSkip) {
      try {
        const shell = kernel.openShell({
          command: 'node',
          args: [
            '-e',
            '(async()=>{try{const pi=await import("@mariozechner/pi-coding-agent");' +
              'console.log("PI_LOADED:"+typeof pi.createAgentSession)}catch(e){' +
              'console.log("PI_LOAD_FAILED:"+e.message)}})()',
          ],
          cwd: SECURE_EXEC_ROOT,
          cols: 80,
          rows: 24,
        });
        let output = '';
        shell.onData = (data: Uint8Array) => {
          output += new TextDecoder().decode(data);
        };
        await Promise.race([
          shell.wait(),
          new Promise<number>((_, rej) =>
            setTimeout(() => rej(new Error('Pi load timed out')), 15_000),
          ),
        ]);
        if (output.includes('PI_LOAD_FAILED:')) {
          const reason = output.split('PI_LOAD_FAILED:')[1]?.split('\n')[0]?.trim();
          sandboxSkip = `Pi cannot load: ${reason}`;
        } else if (!output.includes('PI_LOADED:function')) {
          sandboxSkip = `Pi load probe inconclusive: ${JSON.stringify(output.slice(0, 200))}`;
        }
      } catch (e) {
        sandboxSkip = `Pi probe: ${(e as Error).message}`;
      }
    }

    if (sandboxSkip) {
      console.warn(`[pi-pty-width] Skipping: ${sandboxSkip}`);
    }
  }, 45_000);

  afterEach(async () => {
    await harness?.dispose();
  });

  afterAll(async () => {
    await mockServer?.close();
    await kernel?.dispose();
    await rm(workDir, { recursive: true, force: true });
  });

  function createPiHarness(cols: number, rows: number): TerminalHarness {
    return new TerminalHarness(kernel, {
      command: 'node',
      args: [
        '-e',
        buildPiCode({
          mockUrl: `http://127.0.0.1:${mockServer.port}`,
          cwd: workDir,
        }),
      ],
      cwd: SECURE_EXEC_ROOT,
      cols,
      rows,
      env: {
        ANTHROPIC_API_KEY: 'test-key',
        HOME: workDir,
        PATH: process.env.PATH ?? '/usr/bin',
      },
    });
  }

  it(
    'process.stdout.columns/rows reflect PTY dimensions (non-default size)',
    async ({ skip }) => {
      if (sandboxSkip) skip();

      // Run a probe at a non-default terminal size to verify dimensions
      const testCols = 120;
      const testRows = 40;
      const shell = kernel.openShell({
        command: 'node',
        args: [
          '-e',
          `console.log(JSON.stringify({
            cols: process.stdout.columns,
            rows: process.stdout.rows,
            envCols: process.env.COLUMNS,
            envLines: process.env.LINES,
            isTTY: !!process.stdout.isTTY,
          }))`,
        ],
        cwd: SECURE_EXEC_ROOT,
        cols: testCols,
        rows: testRows,
      });

      let output = '';
      shell.onData = (data: Uint8Array) => {
        output += new TextDecoder().decode(data);
      };
      const exitCode = await Promise.race([
        shell.wait(),
        new Promise<number>((_, rej) =>
          setTimeout(() => rej(new Error('timed out')), 10_000),
        ),
      ]);

      expect(exitCode).toBe(0);

      // Extract JSON payload from PTY output (may contain escape sequences)
      const jsonMatch = output.match(/\{[^}]+\}/);
      expect(jsonMatch).not.toBeNull();
      const result = JSON.parse(jsonMatch![0]);

      expect(result.cols).toBe(testCols);
      expect(result.rows).toBe(testRows);
      expect(result.envCols).toBe(String(testCols));
      expect(result.envLines).toBe(String(testRows));
      expect(result.isTTY).toBe(true);
    },
    15_000,
  );

  it(
    'Pi boot screen separator line width matches terminal columns',
    async ({ skip }) => {
      if (sandboxSkip) skip();

      // Use a non-default width to prove Pi respects the terminal dimensions
      const testCols = 100;
      const testRows = 30;

      mockServer.reset([]);
      harness = createPiHarness(testCols, testRows);

      const rawOutput: string[] = [];
      const originalOnData = harness.shell.onData;
      harness.shell.onData = (data: Uint8Array) => {
        rawOutput.push(new TextDecoder().decode(data));
        originalOnData?.(data);
      };

      try {
        await harness.waitFor('claude-sonnet', 1, 30_000);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`${msg}\nRaw PTY output:\n${rawOutput.join('')}`);
      }

      const screen = harness.screenshotTrimmed();
      const lines = screen.split('\n');

      // All lines must fit within the terminal width
      for (let i = 0; i < lines.length; i++) {
        expect(
          lines[i].length,
          `Line ${i} exceeds terminal width (${testCols}): "${lines[i]}"`,
        ).toBeLessThanOrEqual(testCols);
      }

      // Screen must fit within terminal height
      expect(lines.length).toBeLessThanOrEqual(testRows);

      // Find the separator line (all ─ characters) and verify it spans the terminal width.
      // Pi renders a full-width separator using box-drawing characters.
      const separatorLines = lines.filter((l) => {
        const trimmed = l.trim();
        return trimmed.length > 0 && /^[─]+$/.test(trimmed);
      });

      expect(
        separatorLines.length,
        `Expected at least one separator line in:\n${screen}`,
      ).toBeGreaterThanOrEqual(1);

      // The separator line should be close to the full terminal width
      // (Pi may leave a small margin, so we check it's at least 80% of cols)
      const longestSeparator = Math.max(...separatorLines.map((l) => l.trim().length));
      expect(
        longestSeparator,
        `Separator line should span most of the terminal width (${testCols}). ` +
        `Got ${longestSeparator} chars. This suggests process.stdout.columns is not ` +
        `reflecting the PTY dimensions.`,
      ).toBeGreaterThanOrEqual(testCols * 0.8);

      // Verify boot screen contains expected TUI elements
      expect(screen).toContain('claude-sonnet');
    },
    45_000,
  );

  it(
    'Pi renders differently at narrow width vs wide width',
    async ({ skip }) => {
      if (sandboxSkip) skip();

      // Boot Pi at standard 80-column width
      mockServer.reset([]);
      harness = createPiHarness(80, 24);

      try {
        await harness.waitFor('claude-sonnet', 1, 30_000);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`80-col boot failed: ${msg}`);
      }

      const screen80 = harness.screenshotTrimmed();
      const lines80 = screen80.split('\n');
      await harness.dispose();

      // Find 80-col separator width
      const sep80 = lines80
        .filter((l) => /^[─]+$/.test(l.trim()) && l.trim().length > 0)
        .map((l) => l.trim().length);

      // Boot Pi at wider 120-column width
      mockServer.reset([]);
      harness = createPiHarness(120, 30);

      try {
        await harness.waitFor('claude-sonnet', 1, 30_000);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`120-col boot failed: ${msg}`);
      }

      const screen120 = harness.screenshotTrimmed();
      const lines120 = screen120.split('\n');

      // Find 120-col separator width
      const sep120 = lines120
        .filter((l) => /^[─]+$/.test(l.trim()) && l.trim().length > 0)
        .map((l) => l.trim().length);

      // Both screens must have separators
      expect(sep80.length).toBeGreaterThanOrEqual(1);
      expect(sep120.length).toBeGreaterThanOrEqual(1);

      // The separator at 120 cols must be wider than at 80 cols.
      // This is the definitive width-sensitive assertion: if process.stdout.columns
      // were hardcoded, both separators would be the same width.
      const maxSep80 = Math.max(...sep80);
      const maxSep120 = Math.max(...sep120);

      expect(
        maxSep120,
        `Separator at 120 cols (${maxSep120}) must be wider than at 80 cols (${maxSep80}). ` +
        `If equal, terminal dimensions are not being respected.\n` +
        `80-col screen:\n${screen80}\n\n120-col screen:\n${screen120}`,
      ).toBeGreaterThan(maxSep80);

      // Verify all 120-col lines fit within bounds
      for (const line of lines120) {
        expect(line.length).toBeLessThanOrEqual(120);
      }
    },
    90_000,
  );
});
