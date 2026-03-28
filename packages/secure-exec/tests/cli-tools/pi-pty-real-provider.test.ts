/**
 * E2E test: Pi interactive PTY through the sandbox with real provider traffic.
 *
 * Coverage:
 *   [real-provider/read]      read tool with canary file verification
 *   [real-provider/tool-use]  write + bash tools with file-on-disk and
 *                             subprocess output verification
 *
 * Uses kernel.openShell() + TerminalHarness, real Anthropic credentials loaded
 * at runtime, host-backed filesystem access for the mutable temp worktree, and
 * host network for provider requests.
 */

import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
import { createWasmVmRuntime } from '../../../wasmvm/src/index.ts';
import {
  buildPiInteractiveCode,
  createHybridVfs,
  SECURE_EXEC_ROOT,
  seedPiManagedTools,
  skipUnlessPiInstalled,
  WASM_COMMANDS_DIR,
} from './pi-pty-helpers.ts';
import { loadRealProviderEnv } from './real-provider-env.ts';

const REAL_PROVIDER_FLAG = 'SECURE_EXEC_PI_REAL_PROVIDER_E2E';

function getSkipReason(): string | false {
  const piSkip = skipUnlessPiInstalled();
  if (piSkip) return piSkip;

  if (!existsSync(path.join(WASM_COMMANDS_DIR, 'tar'))) {
    return 'WasmVM tar command not built (expected native/wasmvm/.../commands/tar)';
  }

  if (process.env[REAL_PROVIDER_FLAG] !== '1') {
    return `${REAL_PROVIDER_FLAG}=1 required for real provider PTY E2E`;
  }

  return loadRealProviderEnv(['ANTHROPIC_API_KEY']).skipReason ?? false;
}

const skipReason = getSkipReason();

describe.skipIf(skipReason)('Pi PTY real-provider E2E (sandbox)', () => {
  let kernel: Kernel | undefined;
  let harness: TerminalHarness | undefined;
  let workDir: string | undefined;
  let tarRuntimeDir: string | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
    await kernel?.dispose();
    kernel = undefined;
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
    if (tarRuntimeDir) {
      await rm(tarRuntimeDir, { recursive: true, force: true });
      tarRuntimeDir = undefined;
    }
  });

  it(
    'renders Pi in a sandbox PTY and answers from a real provider using the note canary',
    async () => {
      const providerEnv = loadRealProviderEnv(['ANTHROPIC_API_KEY']);
      expect(providerEnv.skipReason).toBeUndefined();

      workDir = await mkdtemp(path.join(tmpdir(), 'pi-pty-real-provider-'));
      tarRuntimeDir = await mkdtemp(path.join(tmpdir(), 'pi-pty-tar-runtime-'));
      const canary = `PI_PTY_REAL_PROVIDER_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await writeFile(path.join(workDir, 'note.txt'), canary);
      const helperBinDir = await seedPiManagedTools(workDir);
      await copyFile(path.join(WASM_COMMANDS_DIR, 'tar'), path.join(tarRuntimeDir, 'tar'));
      await chmod(path.join(tarRuntimeDir, 'tar'), 0o755);

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
      await kernel.mount(
        createNodeRuntime({
          permissions,
        }),
      );
      await kernel.mount(createWasmVmRuntime({ commandDirs: [tarRuntimeDir] }));

      harness = new TerminalHarness(kernel, {
        command: 'node',
        args: ['-e', buildPiInteractiveCode({ workDir })],
        cwd: SECURE_EXEC_ROOT,
        env: {
          ...providerEnv.env!,
          HOME: workDir,
          NO_COLOR: '1',
          PATH: `${helperBinDir}:${process.env.PATH ?? '/usr/bin:/bin'}`,
        },
      });
      const rawOutput: string[] = [];
      const originalOnData = harness.shell.onData;
      harness.shell.onData = (data: Uint8Array) => {
        rawOutput.push(new TextDecoder().decode(data));
        originalOnData?.(data);
      };

      try {
        await harness.waitFor('claude-sonnet', 1, 60_000);
        await harness.waitFor('drop files to attach', 1, 15_000);
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message}\nRaw PTY:\n${rawOutput.join('')}`);
      }
      await harness.type(`Read ${path.join(workDir, 'note.txt')} and answer with the exact file contents only.`);
      harness.shell.write('\r');
      await new Promise((resolve) => setTimeout(resolve, 200));
      await harness.waitFor(canary, 1, 90_000);

      expect(harness.screenshotTrimmed()).toContain(canary);

      harness.shell.kill();
      const exitCode = await Promise.race([
        harness.shell.wait(),
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error('Pi did not terminate after success')), 20_000),
        ),
      ]);

      expect(exitCode).not.toBeNull();
    },
    120_000,
  );

  it(
    'performs both filesystem and subprocess tool actions with real provider in sandbox PTY',
    async () => {
      const providerEnv = loadRealProviderEnv(['ANTHROPIC_API_KEY']);
      expect(providerEnv.skipReason).toBeUndefined();

      workDir = await mkdtemp(path.join(tmpdir(), 'pi-pty-real-provider-tool-'));
      tarRuntimeDir = await mkdtemp(path.join(tmpdir(), 'pi-pty-tar-runtime-tool-'));
      const fsCanary = `FS_PTY_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const bashCanary = `BASH_PTY_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const targetFile = path.join(workDir, 'tool-output.txt');
      const helperBinDir = await seedPiManagedTools(workDir);
      await copyFile(path.join(WASM_COMMANDS_DIR, 'tar'), path.join(tarRuntimeDir, 'tar'));
      await chmod(path.join(tarRuntimeDir, 'tar'), 0o755);

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
      await kernel.mount(
        createNodeRuntime({
          permissions,
        }),
      );
      await kernel.mount(createWasmVmRuntime({ commandDirs: [tarRuntimeDir] }));

      harness = new TerminalHarness(kernel, {
        command: 'node',
        args: ['-e', buildPiInteractiveCode({ workDir })],
        cwd: SECURE_EXEC_ROOT,
        env: {
          ...providerEnv.env!,
          HOME: workDir,
          NO_COLOR: '1',
          PATH: `${helperBinDir}:${process.env.PATH ?? '/usr/bin:/bin'}`,
        },
      });
      const rawOutput: string[] = [];
      const originalOnData = harness.shell.onData;
      harness.shell.onData = (data: Uint8Array) => {
        rawOutput.push(new TextDecoder().decode(data));
        originalOnData?.(data);
      };

      try {
        await harness.waitFor('claude-sonnet', 1, 60_000);
        await harness.waitFor('drop files to attach', 1, 15_000);
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message}\nRaw PTY:\n${rawOutput.join('')}`);
      }

      await harness.type(
        `Do two things: 1) Create a file at ${targetFile} with exact content '${fsCanary}'. 2) Run: echo '${bashCanary}'. Report the echo output.`,
      );
      harness.shell.write('\r');
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Wait for subprocess canary in terminal (proves bash tool ran)
      await harness.waitFor(bashCanary, 1, 120_000);

      // Verify filesystem action: file was created on disk
      const fileContent = await readFile(targetFile, 'utf8');
      expect(fileContent).toContain(fsCanary);

      // Verify subprocess action: bash canary in terminal output
      expect(harness.screenshotTrimmed()).toContain(bashCanary);

      harness.shell.kill();
      const exitCode = await Promise.race([
        harness.shell.wait(),
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error('Pi did not terminate after tool-use success')), 20_000),
        ),
      ]);
      expect(exitCode).not.toBeNull();
    },
    180_000,
  );
});
