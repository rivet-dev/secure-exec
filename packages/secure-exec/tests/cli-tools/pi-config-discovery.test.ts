/**
 * Pi config-discovery contract — proves all three Pi surfaces (SDK, headless,
 * PTY) discover provider credentials exclusively through the documented
 * SecureExec environment contract.
 *
 * Documented credential/config paths:
 *   1. Exported env vars: ANTHROPIC_API_KEY in process.env
 *   2. ~/misc/env.txt fallback: loadRealProviderEnv() merges at test time
 *
 * Minimal env per surface (no ...process.env leakage):
 *   SDK:      { ANTHROPIC_API_KEY, HOME, NO_COLOR }
 *   Headless: { ANTHROPIC_API_KEY, HOME, NO_COLOR, PATH }
 *   PTY:      { ANTHROPIC_API_KEY, HOME, NO_COLOR, PATH }
 *
 * Each test passes ONLY these documented vars, proving Pi does not depend
 * on unrelated host-global state for provider/config discovery.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
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
  NodeRuntime,
  NodeFileSystem,
  allowAll,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
} from '../../src/index.js';
import {
  buildPiInteractiveCode,
  createHybridVfs,
  PI_CLI,
  SECURE_EXEC_ROOT,
  seedPiManagedTools,
  skipUnlessPiInstalled,
  WASM_COMMANDS_DIR,
} from './pi-pty-helpers.ts';
import { loadRealProviderEnv } from './real-provider-env.ts';

const REAL_PROVIDER_FLAG = 'SECURE_EXEC_PI_REAL_PROVIDER_E2E';

const PI_SDK_ENTRY = path.resolve(
  SECURE_EXEC_ROOT,
  'node_modules/@mariozechner/pi-coding-agent/dist/index.js',
);

function getSkipReason(): string | false {
  const piSkip = skipUnlessPiInstalled();
  if (piSkip) return piSkip;
  if (process.env[REAL_PROVIDER_FLAG] !== '1') {
    return `${REAL_PROVIDER_FLAG}=1 required for config-discovery E2E`;
  }
  return loadRealProviderEnv(['ANTHROPIC_API_KEY']).skipReason ?? false;
}

const skipReason = getSkipReason();
const ptySkipReason: string | false = !existsSync(path.join(WASM_COMMANDS_DIR, 'tar'))
  ? 'WasmVM tar not built'
  : false;

// --- Helpers ---

function parseLastJsonLine(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error('no output');
  for (let i = trimmed.lastIndexOf('{'); i >= 0; i = trimmed.lastIndexOf('{', i - 1)) {
    try {
      return JSON.parse(trimmed.slice(i)) as Record<string, unknown>;
    } catch { /* scan backward */ }
  }
  throw new Error(`no JSON object in output: ${stdout.slice(0, 500)}`);
}

function buildDiscoverySdkSource(workDir: string): string {
  return [
    'import path from "node:path";',
    `const workDir = ${JSON.stringify(workDir)};`,
    'try {',
    `  const pi = await globalThis.__dynamicImport(${JSON.stringify(PI_SDK_ENTRY)}, "/entry.mjs");`,
    '  const authStorage = pi.AuthStorage.create(path.join(workDir, "auth.json"));',
    '  const modelRegistry = new pi.ModelRegistry(authStorage);',
    '  const available = await modelRegistry.getAvailable();',
    '  const model = available.find(m => m.provider === "anthropic");',
    '  if (!model) throw new Error("No Anthropic model discovered from ANTHROPIC_API_KEY env var");',
    '  const { session } = await pi.createAgentSession({',
    '    cwd: workDir,',
    '    authStorage,',
    '    modelRegistry,',
    '    model,',
    '    tools: pi.createCodingTools(workDir),',
    '    sessionManager: pi.SessionManager.inMemory(),',
    '  });',
    '  await pi.runPrintMode(session, {',
    '    mode: "text",',
    '    initialMessage: "Reply with exactly DISCOVERY_OK",',
    '  });',
    '  console.log(JSON.stringify({',
    '    ok: true,',
    '    hasAnthropicModel: true,',
    '    model: `${model.provider}/${model.id}`,',
    '  }));',
    '  session.dispose();',
    '} catch (error) {',
    '  console.log(JSON.stringify({',
    '    ok: false,',
    '    error: error instanceof Error ? error.message : String(error),',
    '    hasAnthropicModel: false,',
    '  }));',
    '  process.exitCode = 1;',
    '}',
  ].join('\n');
}

function spawnPiClean(opts: {
  args: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs?: number;
}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    // Clean env: no ...process.env — only the documented vars
    const child = nodeSpawn('node', [PI_CLI, ...opts.args], {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => stdoutChunks.push(d));
    child.stderr.on('data', (d: Buffer) => stderrChunks.push(d));
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 90_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString(),
        stderr: Buffer.concat(stderrChunks).toString(),
      });
    });
    child.stdin.end();
  });
}

// --- Test suite ---

describe.skipIf(skipReason)('Pi config discovery contract', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterAll(async () => {
    for (const cleanup of cleanups) await cleanup();
  });

  it(
    'SDK: discovers provider from ANTHROPIC_API_KEY in sandbox env only',
    async () => {
      const providerEnv = loadRealProviderEnv(['ANTHROPIC_API_KEY']);
      expect(providerEnv.skipReason).toBeUndefined();

      const workDir = await mkdtemp(path.join(tmpdir(), 'pi-config-sdk-'));
      cleanups.push(async () => rm(workDir, { recursive: true, force: true }));

      const stdout: string[] = [];
      const stderr: string[] = [];

      const runtime = new NodeRuntime({
        onStdio: (event) => {
          if (event.channel === 'stdout') stdout.push(event.message);
          if (event.channel === 'stderr') stderr.push(event.message);
        },
        systemDriver: createNodeDriver({
          filesystem: new NodeFileSystem(),
          moduleAccess: { cwd: SECURE_EXEC_ROOT },
          permissions: allowAll,
          useDefaultNetwork: true,
        }),
        runtimeDriverFactory: createNodeRuntimeDriverFactory(),
      });
      cleanups.push(async () => runtime.terminate());

      // Clean sandbox env: ONLY ANTHROPIC_API_KEY + HOME + NO_COLOR
      const result = await runtime.exec(buildDiscoverySdkSource(workDir), {
        cwd: workDir,
        filePath: '/entry.mjs',
        env: {
          ANTHROPIC_API_KEY: providerEnv.env!.ANTHROPIC_API_KEY,
          HOME: workDir,
          NO_COLOR: '1',
        },
      });

      expect(result.code, `stderr: ${stderr.join('')}`).toBe(0);
      const payload = parseLastJsonLine(stdout.join(''));
      expect(payload.ok, JSON.stringify(payload)).toBe(true);
      expect(payload.hasAnthropicModel).toBe(true);
    },
    60_000,
  );

  it(
    'Headless: discovers provider from clean env without host-global state',
    async () => {
      const providerEnv = loadRealProviderEnv(['ANTHROPIC_API_KEY']);
      expect(providerEnv.skipReason).toBeUndefined();

      const workDir = await mkdtemp(path.join(tmpdir(), 'pi-config-headless-'));
      cleanups.push(async () => rm(workDir, { recursive: true, force: true }));

      // Clean env: NO ...process.env leakage — only documented vars
      const result = await spawnPiClean({
        args: [
          '--no-session', '--no-extensions', '--no-skills',
          '--no-prompt-templates', '--no-themes',
          '--print', 'Reply with exactly DISCOVERY_OK',
        ],
        cwd: workDir,
        env: {
          ANTHROPIC_API_KEY: providerEnv.env!.ANTHROPIC_API_KEY,
          HOME: workDir,
          NO_COLOR: '1',
          PATH: '/usr/bin:/bin',
        },
      });

      expect(result.code, `stderr: ${result.stderr.slice(0, 2000)}`).toBe(0);
      // Non-empty stdout proves the API call completed via env-discovered credential
      expect(result.stdout.trim().length).toBeGreaterThan(0);
    },
    90_000,
  );

  it.skipIf(ptySkipReason)(
    'PTY: discovers provider from clean kernel shell env',
    async () => {
      const providerEnv = loadRealProviderEnv(['ANTHROPIC_API_KEY']);
      expect(providerEnv.skipReason).toBeUndefined();

      const workDir = await mkdtemp(path.join(tmpdir(), 'pi-config-pty-'));
      const tarDir = await mkdtemp(path.join(tmpdir(), 'pi-config-tar-'));
      const helperBinDir = await seedPiManagedTools(workDir);
      await copyFile(path.join(WASM_COMMANDS_DIR, 'tar'), path.join(tarDir, 'tar'));
      await chmod(path.join(tarDir, 'tar'), 0o755);

      let kernel: Kernel | undefined;
      let harness: TerminalHarness | undefined;
      cleanups.push(async () => {
        await harness?.dispose();
        await kernel?.dispose();
        await rm(workDir, { recursive: true, force: true });
        await rm(tarDir, { recursive: true, force: true });
      });

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
      await kernel.mount(createWasmVmRuntime({ commandDirs: [tarDir] }));

      // Clean kernel shell env: ONLY ANTHROPIC_API_KEY + HOME + NO_COLOR + PATH
      harness = new TerminalHarness(kernel, {
        command: 'node',
        args: ['-e', buildPiInteractiveCode({ workDir })],
        cwd: SECURE_EXEC_ROOT,
        env: {
          ANTHROPIC_API_KEY: providerEnv.env!.ANTHROPIC_API_KEY,
          HOME: workDir,
          NO_COLOR: '1',
          PATH: `${helperBinDir}:/usr/bin:/bin`,
        },
      });

      const rawOutput: string[] = [];
      const originalOnData = harness.shell.onData;
      harness.shell.onData = (data: Uint8Array) => {
        rawOutput.push(new TextDecoder().decode(data));
        originalOnData?.(data);
      };

      // Pi showing the model name proves it discovered the provider from env
      try {
        await harness.waitFor('claude-sonnet', 1, 60_000);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Pi PTY did not discover provider/model from clean env.\n${message}\nRaw PTY:\n${rawOutput.join('')}`,
        );
      }

      harness.shell.kill();
      await Promise.race([
        harness.shell.wait(),
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error('Pi did not terminate')), 10_000),
        ),
      ]);
    },
    120_000,
  );
});
