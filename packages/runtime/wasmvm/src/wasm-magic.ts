/**
 * WASM magic byte validation.
 *
 * Identifies WASM binaries by reading the first 4 bytes and checking
 * for the magic number (0x00 0x61 0x73 0x6D = "\0asm"), the same
 * approach Linux uses with ELF headers.
 */

import { open } from 'node:fs/promises';
import { openSync, readSync, closeSync } from 'node:fs';

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d] as const;

/** Check WASM magic bytes — async version for init scans. */
export async function isWasmBinary(path: string): Promise<boolean> {
  let fd: number | undefined;
  try {
    const handle = await open(path, 'r');
    fd = handle.fd;
    const buf = new Uint8Array(4);
    const { bytesRead } = await handle.read(buf, 0, 4, 0);
    await handle.close();
    fd = undefined;
    if (bytesRead < 4) return false;
    return buf[0] === WASM_MAGIC[0] && buf[1] === WASM_MAGIC[1]
      && buf[2] === WASM_MAGIC[2] && buf[3] === WASM_MAGIC[3];
  } catch {
    return false;
  }
}

/** Check WASM magic bytes — sync version for tryResolve. */
export function isWasmBinarySync(path: string): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const buf = Buffer.alloc(4);
    const bytesRead = readSync(fd, buf, 0, 4, 0);
    closeSync(fd);
    fd = undefined;
    if (bytesRead < 4) return false;
    return buf[0] === WASM_MAGIC[0] && buf[1] === WASM_MAGIC[1]
      && buf[2] === WASM_MAGIC[2] && buf[3] === WASM_MAGIC[3];
  } catch {
    if (fd !== undefined) try { closeSync(fd); } catch { /* best effort */ }
    return false;
  }
}
