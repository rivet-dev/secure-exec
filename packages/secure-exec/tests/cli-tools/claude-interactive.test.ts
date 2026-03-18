/**
 * E2E test: Claude Code interactive TUI through a real PTY.
 *
 * Spawns Claude Code as a host process inside a PTY (via Linux `script -qefc`)
 * so that process.stdout.isTTY is true and Claude renders its full Ink-based
 * TUI. Output is fed into @xterm/headless for deterministic screen-state
 * assertions.
 *
 * Uses ANTHROPIC_BASE_URL to redirect API calls to a mock LLM server.
 *
 * Uses relative imports to avoid cyclic package dependencies.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Terminal } from '@xterm/headless';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createMockLlmServer,
  type MockLlmServerHandle,
} from './mock-llm-server.ts';

// ---------------------------------------------------------------------------
// Skip helpers
// ---------------------------------------------------------------------------

function findClaudeBinary(): string | null {
  const candidates = [
    'claude',
    path.join(process.env.HOME ?? '', '.claude', 'local', 'claude'),
  ];
  const { execSync } = require('node:child_process');
  for (const bin of candidates) {
    try {
      execSync(`"${bin}" --version`, { stdio: 'ignore' });
      return bin;
    } catch {
      // continue
    }
  }
  return null;
}

const claudeBinary = findClaudeBinary();
const skipReason = claudeBinary
  ? false
  : 'claude binary not found';

// ---------------------------------------------------------------------------
// PtyHarness — host process with real PTY + xterm headless
// ---------------------------------------------------------------------------

/** Settlement window: resolve type() after this many ms of no new output. */
const SETTLE_MS = 150;
/** Poll interval for waitFor(). */
const POLL_MS = 50;
/** Default waitFor() timeout. */
const DEFAULT_WAIT_TIMEOUT_MS = 20_000;

/**
 * Wraps a host process in a real PTY via Linux `script -qefc` and wires
 * output to an @xterm/headless Terminal for screen-state assertions.
 */
class PtyHarness {
  readonly term: Terminal;
  private child: ChildProcess;
  private disposed = false;
  private typing = false;
  private exitCode: number | null = null;
  private exitPromise: Promise<number>;

  constructor(
    command: string,
    args: string[],
    options: {
      env: Record<string, string>;
      cwd: string;
      cols?: number;
      rows?: number;
    },
  ) {
    const cols = options.cols ?? 120;
    const rows = options.rows ?? 40;

    this.term = new Terminal({ cols, rows, allowProposedApi: true });

    // Build the full command string for script -c
    const fullCmd = [command, ...args]
      .map((a) => `'${a.replace(/'/g, "'\\''")}'`)
      .join(' ');

    this.child = spawn(
      'script',
      ['-qefc', fullCmd, '/dev/null'],
      {
        env: {
          ...options.env,
          TERM: 'xterm-256color',
          COLUMNS: String(cols),
          LINES: String(rows),
        },
        cwd: options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    // Wire PTY output → xterm
    this.child.stdout!.on('data', (data: Buffer) => {
      this.term.write(data);
    });
    this.child.stderr!.on('data', (data: Buffer) => {
      this.term.write(data);
    });

    this.exitPromise = new Promise<number>((resolve) => {
      this.child.on('close', (code) => {
        this.exitCode = code ?? 1;
        resolve(this.exitCode);
      });
    });
  }

  /** Send input through the PTY stdin. Resolves after output settles. */
  async type(input: string): Promise<void> {
    if (this.typing) {
      throw new Error(
        'PtyHarness.type() called while previous type() is still in-flight',
      );
    }
    this.typing = true;
    try {
      await this.typeInternal(input);
    } finally {
      this.typing = false;
    }
  }

  private typeInternal(input: string): Promise<void> {
    return new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let dataListener: ((data: Buffer) => void) | null = null;

      const resetTimer = () => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
          if (dataListener) this.child.stdout!.removeListener('data', dataListener);
          resolve();
        }, SETTLE_MS);
      };

      dataListener = (_data: Buffer) => {
        resetTimer();
      };
      this.child.stdout!.on('data', dataListener);

      resetTimer();
      this.child.stdin!.write(input);
    });
  }

  /**
   * Full screen as a string: viewport rows only, trailing whitespace
   * trimmed per line, trailing empty lines dropped, joined with '\n'.
   */
  screenshotTrimmed(): string {
    const buf = this.term.buffer.active;
    const rows = this.term.rows;
    const lines: string[] = [];

    for (let y = 0; y < rows; y++) {
      const line = buf.getLine(buf.viewportY + y);
      lines.push(line ? line.translateToString(true) : '');
    }

    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    return lines.join('\n');
  }

  /**
   * Poll screen buffer every POLL_MS until `text` is found.
   * Throws a descriptive error on timeout.
   */
  async waitFor(
    text: string,
    occurrence: number = 1,
    timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const screen = this.screenshotTrimmed();

      let count = 0;
      let idx = -1;
      while (true) {
        idx = screen.indexOf(text, idx + 1);
        if (idx === -1) break;
        count++;
        if (count >= occurrence) return;
      }

      if (this.exitCode !== null) {
        throw new Error(
          `waitFor("${text}") failed: process exited with code ${this.exitCode} before text appeared.\n` +
            `Screen:\n${screen}`,
        );
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `waitFor("${text}", ${occurrence}) timed out after ${timeoutMs}ms.\n` +
            `Expected: "${text}" (occurrence ${occurrence})\n` +
            `Screen:\n${screen}`,
        );
      }

      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  /** Wait for the process to exit. Returns exit code. */
  async wait(): Promise<number> {
    return this.exitPromise;
  }

  /** Kill process and dispose terminal. Safe to call multiple times. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    try {
      if (this.exitCode === null) {
        this.child.kill('SIGTERM');
        const exited = await Promise.race([
          this.exitPromise.then(() => true),
          new Promise<boolean>((r) => setTimeout(() => r(false), 2000)),
        ]);
        if (!exited) {
          this.child.kill('SIGKILL');
          await Promise.race([
            this.exitPromise,
            new Promise((r) => setTimeout(r, 1000)),
          ]);
        }
      }
    } catch {
      // Process may already be dead
    }

    this.term.dispose();
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Create a PtyHarness that spawns Claude Code in interactive mode.
 * Auto-dismisses onboarding dialogs (theme selection, etc.).
 */
async function createClaudeHarness(opts: {
  port: number;
  cwd: string;
  extraArgs?: string[];
}): Promise<PtyHarness> {
  const harness = new PtyHarness(
    claudeBinary!,
    [
      '--dangerously-skip-permissions',
      '--model', 'haiku',
      ...(opts.extraArgs ?? []),
    ],
    {
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? tmpdir(),
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${opts.port}`,
      },
      cwd: opts.cwd,
    },
  );

  // Auto-dismiss setup dialogs (workspace trust, theme, etc.)
  const deadline = Date.now() + 30_000;
  let enterSent = 0;
  while (Date.now() < deadline) {
    const screen = harness.screenshotTrimmed();
    // Main prompt reached — Claude shows "Welcome" or model name
    if (screen.includes('Haiku') || screen.includes('Welcome')) {
      break;
    }
    // Dismiss dialogs (trust, theme) with Enter
    if (enterSent < 10 && screen.length > 10) {
      await new Promise((r) => setTimeout(r, 1500));
      await harness.type('\r');
      enterSent++;
      continue;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  return harness;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockServer: MockLlmServerHandle;
let workDir: string;

describe.skipIf(skipReason)('Claude Code interactive PTY E2E', () => {
  let harness: PtyHarness;

  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);
    workDir = await mkdtemp(path.join(tmpdir(), 'claude-interactive-'));
    // Pre-create Claude config to skip first-run setup (theme selection dialog)
    const claudeDir = path.join(workDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ skipDangerousModePermissionPrompt: true }),
    );
    // Pre-accept terms to skip onboarding
    await writeFile(path.join(claudeDir, '.terms-accepted'), '');
  });

  afterEach(async () => {
    await harness?.dispose();
  });

  afterAll(async () => {
    await mockServer?.close();
    await rm(workDir, { recursive: true, force: true });
  });

  it(
    'Claude TUI renders — screen shows Ink-based UI after boot',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Hello!' }]);

      harness = await createClaudeHarness({ port: mockServer.port, cwd: workDir });

      // Claude's Ink TUI shows a prompt area with '>' indicator
      await harness.waitFor('❯', 1, 5_000);

      const screen = harness.screenshotTrimmed();
      // Verify TUI booted — the screen should have content
      expect(screen.length).toBeGreaterThan(0);
    },
    45_000,
  );

  it(
    'Input area works — type prompt text, appears on screen',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Hello!' }]);

      harness = await createClaudeHarness({ port: mockServer.port, cwd: workDir });

      // Wait for TUI to boot
      await harness.waitFor('❯', 1, 5_000);

      // Type text into the prompt area
      await harness.type('hello world test');

      const screen = harness.screenshotTrimmed();
      expect(screen).toContain('hello world test');
    },
    45_000,
  );

  it(
    'Submit shows response — enter prompt, streaming response renders on screen',
    async () => {
      mockServer.reset([{ type: 'text', text: 'boot' }]);

      harness = await createClaudeHarness({ port: mockServer.port, cwd: workDir });
      await harness.waitFor('❯', 1, 5_000);

      // Reset mock AFTER onboarding (onboarding Enter presses may consume queue)
      // Pad queue: Claude may make title/metadata requests before main response
      const canary = 'INTERACTIVE_CANARY_CC_42';
      mockServer.reset([
        { type: 'text', text: canary },
        { type: 'text', text: canary },
        { type: 'text', text: canary },
      ]);

      // Type prompt and submit with Enter
      await harness.type('say hello\r');

      // Wait for the canned LLM response to appear on screen
      await harness.waitFor(canary, 1, 30_000);

      const screen = harness.screenshotTrimmed();
      expect(screen).toContain(canary);
    },
    60_000,
  );

  it(
    '^C interrupts response — send SIGINT during streaming, Claude stays alive',
    async () => {
      mockServer.reset([
        { type: 'text', text: 'First response' },
        { type: 'text', text: 'Second response' },
      ]);

      harness = await createClaudeHarness({ port: mockServer.port, cwd: workDir });

      // Wait for TUI to boot
      await harness.waitFor('❯', 1, 5_000);

      // Submit a prompt
      await harness.type('say hello\r');

      // Give Claude a moment to start processing, then send ^C
      await new Promise((r) => setTimeout(r, 500));
      await harness.type('\x03');

      // Claude should survive single ^C — wait for prompt to return
      await harness.waitFor('❯', 1, 15_000);

      // Verify Claude is still alive by typing more text
      await harness.type('still alive');
      const screen = harness.screenshotTrimmed();
      expect(screen).toContain('still alive');
    },
    60_000,
  );

  it(
    'Color output renders — ANSI color codes in xterm buffer',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Color test response' }]);

      harness = await createClaudeHarness({ port: mockServer.port, cwd: workDir });

      // Wait for TUI to boot — Claude's TUI uses colored text
      await harness.waitFor('❯', 1, 5_000);

      // Check xterm has parsed some cells with foreground color set
      const buf = harness.term.buffer.active;
      let hasColor = false;
      for (let y = 0; y < harness.term.rows && !hasColor; y++) {
        const line = buf.getLine(buf.viewportY + y);
        if (!line) continue;
        for (let x = 0; x < harness.term.cols; x++) {
          const cell = line.getCell(x);
          if (cell && cell.getFgColor() !== 0) {
            hasColor = true;
            break;
          }
        }
      }
      expect(hasColor).toBe(true);
    },
    45_000,
  );

  it(
    'Exit cleanly — /exit causes Claude to exit',
    async () => {
      mockServer.reset([]);

      harness = await createClaudeHarness({ port: mockServer.port, cwd: workDir });

      // Wait for TUI to boot
      await harness.waitFor('❯', 1, 5_000);

      // Type /exit and submit
      await harness.type('/exit\r');

      // Wait for process to exit
      const exitCode = await Promise.race([
        harness.wait(),
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error('Claude did not exit within 15s')), 15_000),
        ),
      ]);

      expect(exitCode).toBe(0);
    },
    30_000,
  );
});
