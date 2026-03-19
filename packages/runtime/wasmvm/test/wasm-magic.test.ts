import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isWasmBinary, isWasmBinarySync } from '../src/wasm-magic.ts';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Valid WASM magic: \0asm + version 1
const VALID_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

describe('isWasmBinary (async)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `wasm-magic-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns true for valid WASM binary', async () => {
    const path = join(tempDir, 'valid');
    await writeFile(path, VALID_WASM);
    expect(await isWasmBinary(path)).toBe(true);
  });

  it('returns false for non-WASM file', async () => {
    const path = join(tempDir, 'readme.md');
    await writeFile(path, 'Hello World');
    expect(await isWasmBinary(path)).toBe(false);
  });

  it('returns false for file with wrong magic bytes', async () => {
    const path = join(tempDir, 'bad');
    await writeFile(path, new Uint8Array([0x7f, 0x45, 0x4c, 0x46])); // ELF magic
    expect(await isWasmBinary(path)).toBe(false);
  });

  it('returns false for file shorter than 4 bytes', async () => {
    const path = join(tempDir, 'short');
    await writeFile(path, new Uint8Array([0x00, 0x61]));
    expect(await isWasmBinary(path)).toBe(false);
  });

  it('returns false for empty file', async () => {
    const path = join(tempDir, 'empty');
    await writeFile(path, new Uint8Array(0));
    expect(await isWasmBinary(path)).toBe(false);
  });

  it('returns false for nonexistent file', async () => {
    expect(await isWasmBinary(join(tempDir, 'no-such-file'))).toBe(false);
  });
});

describe('isWasmBinarySync', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `wasm-magic-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns true for valid WASM binary', async () => {
    const path = join(tempDir, 'valid');
    await writeFile(path, VALID_WASM);
    expect(isWasmBinarySync(path)).toBe(true);
  });

  it('returns false for non-WASM file', async () => {
    const path = join(tempDir, 'readme.md');
    await writeFile(path, 'Hello World');
    expect(isWasmBinarySync(path)).toBe(false);
  });

  it('returns false for nonexistent file', () => {
    expect(isWasmBinarySync(join(tempDir, 'no-such-file'))).toBe(false);
  });

  it('returns false for file shorter than 4 bytes', async () => {
    const path = join(tempDir, 'short');
    await writeFile(path, new Uint8Array([0x00]));
    expect(isWasmBinarySync(path)).toBe(false);
  });
});
