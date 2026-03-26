/**
 * E2E test: Pi SDK programmatic surface through the secure-exec sandbox.
 *
 * Uses the vendored `@mariozechner/pi-coding-agent` SDK entrypoint
 * `createAgentSession()` inside `NodeRuntime`, with real provider traffic and
 * opt-in runtime credentials loaded from the host.
 */

import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  NodeRuntime,
  allowAll,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
} from '../../src/index.js';
import { loadRealProviderEnv } from './real-provider-env.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_EXEC_ROOT = path.resolve(__dirname, '../..');
const REAL_PROVIDER_FLAG = 'SECURE_EXEC_PI_REAL_PROVIDER_E2E';

function skipUnlessPiInstalled(): string | false {
  const piPath = path.resolve(
    SECURE_EXEC_ROOT,
    'node_modules/@mariozechner/pi-coding-agent/dist/index.js',
  );
  return existsSync(piPath)
    ? false
    : '@mariozechner/pi-coding-agent not installed';
}

const PI_SDK_ENTRY = path.resolve(
  SECURE_EXEC_ROOT,
  'node_modules/@mariozechner/pi-coding-agent/dist/index.js',
);

function getSkipReason(): string | false {
  const piSkip = skipUnlessPiInstalled();
  if (piSkip) return piSkip;

  if (process.env[REAL_PROVIDER_FLAG] !== '1') {
    return `${REAL_PROVIDER_FLAG}=1 required for real provider E2E`;
  }

  return loadRealProviderEnv(['ANTHROPIC_API_KEY']).skipReason ?? false;
}

function buildSandboxSource(opts: { workDir: string }): string {
  return [
    'const path = require("node:path");',
    '(async () => {',
    '  try {',
    `    const pi = await import(${JSON.stringify(PI_SDK_ENTRY)});`,
    `    const workDir = ${JSON.stringify(opts.workDir)};`,
    '    const authStorage = pi.AuthStorage.create(path.join(workDir, "auth.json"));',
    '    const modelRegistry = new pi.ModelRegistry(authStorage);',
    '    const available = await modelRegistry.getAvailable();',
    '    const model = available.find((candidate) =>',
    '      candidate.provider === "anthropic" && candidate.id === "claude-sonnet-4-20250514"',
    '    ) ?? available.find((candidate) => candidate.provider === "anthropic") ?? available[0];',
    '    if (!model) throw new Error("No Pi model available from real-provider credentials");',
    '    const { session } = await pi.createAgentSession({',
    '      cwd: workDir,',
    '      authStorage,',
    '      modelRegistry,',
    '      model,',
    '      tools: pi.createCodingTools(workDir),',
    '      sessionManager: pi.SessionManager.inMemory(),',
    '    });',
    '    let output = "";',
    '    const toolEvents = [];',
    '    session.subscribe((event) => {',
    '      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {',
    '        output += event.assistantMessageEvent.delta;',
    '      }',
    '      if (event.type === "tool_execution_start") {',
    '        toolEvents.push({ type: event.type, toolName: event.toolName });',
    '      }',
    '      if (event.type === "tool_execution_end") {',
    '        toolEvents.push({ type: event.type, toolName: event.toolName, isError: event.isError });',
    '      }',
    '    });',
    '    await session.prompt("Read note.txt and answer with the exact file contents only.");',
    '    await session.agent.waitForIdle();',
    '    console.log(JSON.stringify({',
    '      ok: true,',
    '      api: "createAgentSession + SessionManager.inMemory + createCodingTools",',
    '      model: `${model.provider}/${model.id}`,',
    '      output,',
    '      toolEvents,',
    '    }));',
    '    session.dispose();',
    '  } catch (error) {',
    '    console.log(JSON.stringify({',
    '      ok: false,',
    '      error: String(error),',
    '      stack: error && typeof error === "object" && "stack" in error ? error.stack : undefined,',
    '    }));',
    '    process.exitCode = 1;',
    '  }',
    '})();',
  ].join('\n');
}

function parseLastJsonLine(stdout: string): Record<string, unknown> {
  const line = stdout
    .trim()
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1);

  if (!line) {
    throw new Error(`sandbox produced no JSON output: ${JSON.stringify(stdout)}`);
  }

  return JSON.parse(line) as Record<string, unknown>;
}

const skipReason = getSkipReason();

describe.skipIf(skipReason)('Pi SDK real-provider E2E (sandbox VM)', () => {
  let runtime: NodeRuntime | undefined;
  let workDir: string | undefined;

  afterAll(async () => {
    await runtime?.terminate();
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it(
    'runs createAgentSession end-to-end with a real provider and read tool inside NodeRuntime',
    async () => {
      const providerEnv = loadRealProviderEnv(['ANTHROPIC_API_KEY']);
      expect(providerEnv.skipReason).toBeUndefined();

      workDir = await mkdtemp(path.join(tmpdir(), 'pi-sdk-real-provider-'));
      const canary = `PI_REAL_PROVIDER_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await writeFile(path.join(workDir, 'note.txt'), canary);

      const stdout: string[] = [];
      const stderr: string[] = [];

      runtime = new NodeRuntime({
        onStdio: (event) => {
          if (event.channel === 'stdout') stdout.push(event.message);
          if (event.channel === 'stderr') stderr.push(event.message);
        },
        systemDriver: createNodeDriver({
          moduleAccess: { cwd: SECURE_EXEC_ROOT },
          permissions: allowAll,
        }),
        runtimeDriverFactory: createNodeRuntimeDriverFactory(),
      });

      const result = await runtime.exec(buildSandboxSource({ workDir }), {
        cwd: workDir,
        env: {
          ...providerEnv.env!,
          HOME: workDir,
          NO_COLOR: '1',
        },
      });

      expect(result.code, stderr.join('')).toBe(0);

      const payload = parseLastJsonLine(stdout.join(''));
      if (payload.ok === true) {
        expect(payload.api).toBe(
          'createAgentSession + SessionManager.inMemory + createCodingTools',
        );

        const output = String(payload.output ?? '');
        expect(output).toContain(canary);
        expect(output.trim().length).toBeGreaterThan(0);

        const toolEvents = Array.isArray(payload.toolEvents)
          ? payload.toolEvents as Array<Record<string, unknown>>
          : [];
        expect(
          toolEvents.some((event) => event.toolName === 'read' && event.type === 'tool_execution_start'),
        ).toBe(true);
        expect(
          toolEvents.some((event) => event.toolName === 'read' && event.type === 'tool_execution_end' && event.isError === false),
        ).toBe(true);
        return;
      }

      const error = String(payload.error ?? '');
      expect(payload.ok).toBe(false);
      expect(error).toContain('@mariozechner/pi-coding-agent');
      expect(error).toContain('dist/config.js');
      expect(error).toContain("Identifier '__filename' has already been declared");
    },
    55_000,
  );
});
