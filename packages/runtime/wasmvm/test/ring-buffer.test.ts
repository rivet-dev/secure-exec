/**
 * Tests for ring-buffer.ts — SharedArrayBuffer ring buffer with timeouts.
 */

import { describe, test, expect } from 'vitest';
import { createRingBuffer, RingBufferWriter, RingBufferReader } from '../src/ring-buffer.ts';

describe('RingBuffer - basic read/write', () => {
  test('writer writes and reader reads data', () => {
    const sab = createRingBuffer(64);
    const writer = new RingBufferWriter(sab);
    const reader = new RingBufferReader(sab);

    const data = new TextEncoder().encode('hello');
    writer.write(data);
    writer.close();

    const buf = new Uint8Array(64);
    const n = reader.read(buf);
    expect(n).toBe(5);
    expect(new TextDecoder().decode(buf.subarray(0, n))).toBe('hello');
  });

  test('reader returns 0 (EOF) after writer closes', () => {
    const sab = createRingBuffer(64);
    const writer = new RingBufferWriter(sab);
    const reader = new RingBufferReader(sab);

    writer.close();

    const buf = new Uint8Array(64);
    const n = reader.read(buf);
    expect(n).toBe(0);
  });

  test('multiple writes and reads', () => {
    const sab = createRingBuffer(64);
    const writer = new RingBufferWriter(sab);
    const reader = new RingBufferReader(sab);

    writer.write(new TextEncoder().encode('abc'));
    writer.write(new TextEncoder().encode('def'));
    writer.close();

    const buf = new Uint8Array(64);
    let total = '';
    let n;
    while ((n = reader.read(buf)) > 0) {
      total += new TextDecoder().decode(buf.subarray(0, n));
    }
    expect(total).toBe('abcdef');
  });
});

describe('RingBuffer - writer timeout when reader is dead', () => {
  test('writer times out and returns partial write when buffer full and reader absent', () => {
    // Use a tiny buffer (8 bytes) and very short timeouts for fast testing
    const sab = createRingBuffer(8);
    const writer = new RingBufferWriter(sab, { waitTimeoutMs: 50, maxRetries: 2 });

    // Fill the buffer completely (8 bytes)
    const fillData = new Uint8Array(8);
    fillData.fill(0x42);
    const written1 = writer.write(fillData);
    expect(written1).toBe(8);

    // Try to write more — no reader is consuming, so writer should timeout
    const moreData = new Uint8Array(4);
    moreData.fill(0x43);
    const written2 = writer.write(moreData);
    expect(written2).toBe(0);

    // Buffer should be closed (EOF signaled)
    const header = new Int32Array(sab, 0, 4);
    expect(Atomics.load(header, 2)).toBe(1);
  });
});

describe('RingBuffer - reader timeout when writer is dead', () => {
  test('reader times out and returns EOF when writer disappears', () => {
    const sab = createRingBuffer(64);
    // No writer — reader will wait and timeout
    const reader = new RingBufferReader(sab, { waitTimeoutMs: 50, maxRetries: 2 });

    const buf = new Uint8Array(64);
    const n = reader.read(buf);
    expect(n).toBe(0);

    // Buffer should be marked closed
    const header = new Int32Array(sab, 0, 4);
    expect(Atomics.load(header, 2)).toBe(1);
  });
});
