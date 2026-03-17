import { describe, it, beforeEach, expect } from 'vitest';
import { FDTable, FILETYPE_REGULAR_FILE, ERRNO_SUCCESS, ERRNO_EBADF, ERRNO_EINVAL,
  RIGHT_FD_READ, RIGHT_FD_WRITE, RIGHT_FD_SEEK } from './helpers/test-fd-table.ts';
import { VFS } from './helpers/test-vfs.ts';
import { createStandaloneFileIO, createStandaloneProcessIO } from './helpers/test-bridges.ts';
import { WasiPolyfill, WasiProcExit, ERRNO_ENOSYS, ERRNO_ESPIPE } from '../src/wasi-polyfill.ts';

// --- Test helpers ---

interface MockMemory {
  buffer: ArrayBuffer;
}

function createMockMemory(size = 65536): MockMemory {
  return { buffer: new ArrayBuffer(size) };
}

function writeIovecs(memory: MockMemory, ptr: number, iovecs: { buf: number; buf_len: number }[]): void {
  const view = new DataView(memory.buffer);
  for (let i = 0; i < iovecs.length; i++) {
    view.setUint32(ptr + i * 8, iovecs[i].buf, true);
    view.setUint32(ptr + i * 8 + 4, iovecs[i].buf_len, true);
  }
}

function writeString(memory: MockMemory, ptr: number, str: string): number {
  const encoded = new TextEncoder().encode(str);
  new Uint8Array(memory.buffer).set(encoded, ptr);
  return encoded.length;
}

function readString(memory: MockMemory, ptr: number, len: number): string {
  return new TextDecoder().decode(new Uint8Array(memory.buffer, ptr, len));
}

function readU32(memory: MockMemory, ptr: number): number {
  return new DataView(memory.buffer).getUint32(ptr, true);
}

function readU64(memory: MockMemory, ptr: number): bigint {
  return new DataView(memory.buffer).getBigUint64(ptr, true);
}

function createTestSetup(options: Record<string, unknown> = {}) {
  const fdTable = new FDTable();
  const vfs = new VFS();
  const memory = createMockMemory();
  const args = (options.args as string[] | undefined) ?? [];
  const env = (options.env as Record<string, string> | undefined) ?? {};
  const fileIO = createStandaloneFileIO(fdTable, vfs);
  const processIO = createStandaloneProcessIO(fdTable, args, env);
  const wasi = new WasiPolyfill(fdTable, vfs, { fileIO, processIO, memory, ...options });
  return { fdTable, vfs, memory, wasi };
}

function openVfsFile(fdTable: FDTable, vfs: VFS, path: string, opts: Record<string, unknown> = {}): number {
  const ino = vfs.getIno(path);
  if (ino === null) throw new Error(`File not found: ${path}`);
  return fdTable.open(
    { type: 'vfsFile', ino, path },
    { filetype: FILETYPE_REGULAR_FILE, path, ...opts }
  );
}

// --- Tests ---

describe('WasiPolyfill US-009: args, env, clock, random, proc_exit', () => {

  describe('args_sizes_get', () => {
    it('returns 0 args when none provided', () => {
      const { wasi, memory } = createTestSetup();
      const errno = wasi.args_sizes_get(100, 104);
      expect(errno).toBe(ERRNO_SUCCESS);
      expect(readU32(memory, 100)).toBe(0); // argc
      expect(readU32(memory, 104)).toBe(0); // buf size
    });

    it('returns correct sizes for multiple args', () => {
      const { wasi, memory } = createTestSetup({ args: ['echo', 'hello', 'world'] });
      const errno = wasi.args_sizes_get(100, 104);
      expect(errno).toBe(ERRNO_SUCCESS);
      expect(readU32(memory, 100)).toBe(3); // argc
      // "echo\0" + "hello\0" + "world\0" = 5+6+6 = 17
      expect(readU32(memory, 104)).toBe(17);
    });

    it('handles single arg', () => {
      const { wasi, memory } = createTestSetup({ args: ['ls'] });
      const errno = wasi.args_sizes_get(100, 104);
      expect(errno).toBe(ERRNO_SUCCESS);
      expect(readU32(memory, 100)).toBe(1);
      expect(readU32(memory, 104)).toBe(3); // "ls\0"
    });
  });

  describe('args_get', () => {
    it('writes args into WASM memory', () => {
      const { wasi, memory } = createTestSetup({ args: ['echo', 'hi'] });
      // argv pointers at 100, arg strings at 200
      const errno = wasi.args_get(100, 200);
      expect(errno).toBe(ERRNO_SUCCESS);

      // First pointer should point to 200
      expect(readU32(memory, 100)).toBe(200);
      // Second pointer should point to 200 + 5 (echo\0)
      expect(readU32(memory, 104)).toBe(205);

      // Read strings (null-terminated)
      expect(readString(memory, 200, 4)).toBe('echo');
      expect(new Uint8Array(memory.buffer)[204]).toBe(0); // null terminator
      expect(readString(memory, 205, 2)).toBe('hi');
      expect(new Uint8Array(memory.buffer)[207]).toBe(0);
    });

    it('handles empty args', () => {
      const { wasi } = createTestSetup();
      const errno = wasi.args_get(100, 200);
      expect(errno).toBe(ERRNO_SUCCESS);
      // No pointers written, no strings written
    });
  });

  describe('environ_sizes_get', () => {
    it('returns 0 when no env vars', () => {
      const { wasi, memory } = createTestSetup();
      const errno = wasi.environ_sizes_get(100, 104);
      expect(errno).toBe(ERRNO_SUCCESS);
      expect(readU32(memory, 100)).toBe(0);
      expect(readU32(memory, 104)).toBe(0);
    });

    it('returns correct sizes for env vars', () => {
      const { wasi, memory } = createTestSetup({
        env: { HOME: '/home/user', PATH: '/bin' }
      });
      const errno = wasi.environ_sizes_get(100, 104);
      expect(errno).toBe(ERRNO_SUCCESS);
      expect(readU32(memory, 100)).toBe(2); // 2 env vars
      // "HOME=/home/user\0" = 16, "PATH=/bin\0" = 10 => 26
      expect(readU32(memory, 104)).toBe(26);
    });
  });

  describe('environ_get', () => {
    it('writes env vars into WASM memory', () => {
      const { wasi, memory } = createTestSetup({
        env: { HOME: '/home/user', TERM: 'xterm' }
      });
      const errno = wasi.environ_get(100, 300);
      expect(errno).toBe(ERRNO_SUCCESS);

      // First pointer
      expect(readU32(memory, 100)).toBe(300);
      // Read first env string
      const firstLen = 'HOME=/home/user'.length;
      expect(readString(memory, 300, firstLen)).toBe('HOME=/home/user');
      expect(new Uint8Array(memory.buffer)[300 + firstLen]).toBe(0);

      // Second env var
      const secondStart = 300 + firstLen + 1;
      expect(readU32(memory, 104)).toBe(secondStart);
      const secondLen = 'TERM=xterm'.length;
      expect(readString(memory, secondStart, secondLen)).toBe('TERM=xterm');
    });

    it('handles empty env', () => {
      const { wasi } = createTestSetup();
      const errno = wasi.environ_get(100, 300);
      expect(errno).toBe(ERRNO_SUCCESS);
    });
  });

  describe('clock_time_get', () => {
    it('returns realtime clock in nanoseconds', () => {
      const { wasi, memory } = createTestSetup();
      const before = BigInt(Date.now()) * 1_000_000n;
      const errno = wasi.clock_time_get(0, 0n, 200);
      const after = BigInt(Date.now()) * 1_000_000n;

      expect(errno).toBe(ERRNO_SUCCESS);
      const time = readU64(memory, 200);
      expect(time >= before).toBeTruthy();
      expect(time <= after).toBeTruthy();
    });

    it('returns monotonic clock in nanoseconds', () => {
      const { wasi, memory } = createTestSetup();
      const errno = wasi.clock_time_get(1, 0n, 200);
      expect(errno).toBe(ERRNO_SUCCESS);
      const time = readU64(memory, 200);
      expect(time > 0n).toBeTruthy();
    });

    it('returns EINVAL for invalid clock id', () => {
      const { wasi } = createTestSetup();
      const errno = wasi.clock_time_get(99, 0n, 200);
      expect(errno).toBe(ERRNO_EINVAL);
    });

    it('supports process and thread cputime clocks', () => {
      const { wasi, memory } = createTestSetup();
      expect(wasi.clock_time_get(2, 0n, 200)).toBe(ERRNO_SUCCESS);
      expect(readU64(memory, 200) > 0n).toBeTruthy();
      expect(wasi.clock_time_get(3, 0n, 200)).toBe(ERRNO_SUCCESS);
      expect(readU64(memory, 200) > 0n).toBeTruthy();
    });
  });

  describe('clock_res_get', () => {
    it('returns resolution for realtime clock', () => {
      const { wasi, memory } = createTestSetup();
      const errno = wasi.clock_res_get(0, 200);
      expect(errno).toBe(ERRNO_SUCCESS);
      expect(readU64(memory, 200)).toBe(1_000_000n); // 1ms in ns
    });

    it('returns resolution for monotonic clock', () => {
      const { wasi, memory } = createTestSetup();
      const errno = wasi.clock_res_get(1, 200);
      expect(errno).toBe(ERRNO_SUCCESS);
      expect(readU64(memory, 200)).toBe(1_000n); // 1us in ns
    });

    it('returns EINVAL for invalid clock id', () => {
      const { wasi } = createTestSetup();
      const errno = wasi.clock_res_get(99, 200);
      expect(errno).toBe(ERRNO_EINVAL);
    });
  });

  describe('random_get', () => {
    it('fills buffer with random bytes', () => {
      const { wasi, memory } = createTestSetup();
      const errno = wasi.random_get(200, 32);
      expect(errno).toBe(ERRNO_SUCCESS);

      // Very unlikely that 32 random bytes are all zero
      const buf = new Uint8Array(memory.buffer, 200, 32);
      const allZero = buf.every(b => b === 0);
      expect(allZero).toBeFalsy();
    });

    it('fills exact number of bytes', () => {
      const { wasi, memory } = createTestSetup();
      // Zero out a region first
      new Uint8Array(memory.buffer).fill(0, 200, 210);
      const errno = wasi.random_get(200, 5);
      expect(errno).toBe(ERRNO_SUCCESS);
      // Bytes outside range should still be zero
      expect(new Uint8Array(memory.buffer)[210]).toBe(0);
    });

    it('handles zero-length request', () => {
      const { wasi } = createTestSetup();
      const errno = wasi.random_get(200, 0);
      expect(errno).toBe(ERRNO_SUCCESS);
    });
  });

  describe('proc_exit', () => {
    it('throws WasiProcExit with exit code', () => {
      const { wasi } = createTestSetup();
      expect(() => wasi.proc_exit(0)).toThrow(WasiProcExit);
      expect(wasi.exitCode).toBe(0);
    });

    it('throws WasiProcExit with non-zero exit code', () => {
      const { wasi } = createTestSetup();
      expect(() => wasi.proc_exit(42)).toThrow(WasiProcExit);
      expect(wasi.exitCode).toBe(42);
    });

    it('WasiProcExit is instance of Error', () => {
      const err = new WasiProcExit(1);
      expect(err).toBeInstanceOf(Error);
      expect(err.exitCode).toBe(1);
      expect(err.name).toBe('WasiProcExit');
    });
  });

  describe('proc_raise', () => {
    it('returns ENOSYS', () => {
      const { wasi } = createTestSetup();
      expect(wasi.proc_raise(9)).toBe(ERRNO_ENOSYS);
    });
  });

  describe('sched_yield', () => {
    it('returns success', () => {
      const { wasi } = createTestSetup();
      expect(wasi.sched_yield()).toBe(ERRNO_SUCCESS);
    });
  });

  describe('poll_oneoff', () => {
    it('handles clock subscription', () => {
      const { wasi, memory } = createTestSetup();
      const view = new DataView(memory.buffer);

      // Write a clock subscription at offset 1000 (48 bytes)
      view.setBigUint64(1000, 42n, true);   // userdata
      view.setUint8(1008, 0);                // type = clock
      view.setUint32(1016, 1, true);         // clock_id = monotonic
      view.setBigUint64(1024, 1000000n, true); // timeout = 1ms in ns
      view.setBigUint64(1032, 0n, true);     // precision
      view.setUint16(1040, 0, true);         // flags

      // Output events at offset 2000
      const errno = wasi.poll_oneoff(1000, 2000, 1, 3000);
      expect(errno).toBe(ERRNO_SUCCESS);

      // Check nevents
      expect(readU32(memory, 3000)).toBe(1);

      // Check event
      expect(readU64(memory, 2000)).toBe(42n);     // userdata
      const errCode = new DataView(memory.buffer).getUint16(2008, true);
      expect(errCode).toBe(0);                       // error = success
      expect(new Uint8Array(memory.buffer)[2010]).toBe(0); // type = clock
    });

    it('handles multiple subscriptions', () => {
      const { wasi, memory } = createTestSetup();
      const view = new DataView(memory.buffer);

      // Two clock subscriptions
      for (let i = 0; i < 2; i++) {
        const base = 1000 + i * 48;
        view.setBigUint64(base, BigInt(i + 1), true);
        view.setUint8(base + 8, 0); // clock
      }

      const errno = wasi.poll_oneoff(1000, 2000, 2, 3000);
      expect(errno).toBe(ERRNO_SUCCESS);
      expect(readU32(memory, 3000)).toBe(2);
    });

    it('handles fd_read subscription', () => {
      const { wasi, memory } = createTestSetup();
      const view = new DataView(memory.buffer);

      // FD read subscription
      view.setBigUint64(1000, 99n, true);
      view.setUint8(1008, 1); // type = fd_read

      const errno = wasi.poll_oneoff(1000, 2000, 1, 3000);
      expect(errno).toBe(ERRNO_SUCCESS);
      expect(readU32(memory, 3000)).toBe(1);
      expect(readU64(memory, 2000)).toBe(99n);
    });
  });

  describe('fd_advise', () => {
    it('returns success for valid fd', () => {
      const { wasi } = createTestSetup();
      expect(wasi.fd_advise(0, 0, 0, 0)).toBe(ERRNO_SUCCESS);
    });

    it('returns EBADF for invalid fd', () => {
      const { wasi } = createTestSetup();
      expect(wasi.fd_advise(99, 0, 0, 0)).toBe(ERRNO_EBADF);
    });
  });

  describe('fd_allocate', () => {
    it('returns success for valid fd', () => {
      const { wasi } = createTestSetup();
      expect(wasi.fd_allocate(0, 0, 100)).toBe(ERRNO_SUCCESS);
    });

    it('returns EBADF for invalid fd', () => {
      const { wasi } = createTestSetup();
      expect(wasi.fd_allocate(99, 0, 100)).toBe(ERRNO_EBADF);
    });
  });

  describe('fd_datasync', () => {
    it('returns success for valid fd', () => {
      const { wasi } = createTestSetup();
      expect(wasi.fd_datasync(0)).toBe(ERRNO_SUCCESS);
    });

    it('returns EBADF for invalid fd', () => {
      const { wasi } = createTestSetup();
      expect(wasi.fd_datasync(99)).toBe(ERRNO_EBADF);
    });
  });

  describe('fd_sync', () => {
    it('returns success for valid fd', () => {
      const { wasi } = createTestSetup();
      expect(wasi.fd_sync(0)).toBe(ERRNO_SUCCESS);
    });

    it('returns EBADF for invalid fd', () => {
      const { wasi } = createTestSetup();
      expect(wasi.fd_sync(99)).toBe(ERRNO_EBADF);
    });
  });

  describe('fd_fdstat_set_rights', () => {
    it('shrinks rights on a valid fd', () => {
      const { wasi, fdTable, vfs } = createTestSetup();
      vfs.writeFile('/tmp/test.txt', 'data');
      const fd = openVfsFile(fdTable, vfs, '/tmp/test.txt');
      const entry = fdTable.get(fd)!;
      const origRights = entry.rightsBase;

      // Shrink to only read
      const errno = wasi.fd_fdstat_set_rights(fd, RIGHT_FD_READ, 0n);
      expect(errno).toBe(ERRNO_SUCCESS);
      expect(entry.rightsBase).toBe(origRights & RIGHT_FD_READ);
    });

    it('returns EBADF for invalid fd', () => {
      const { wasi } = createTestSetup();
      expect(wasi.fd_fdstat_set_rights(99, 0n, 0n)).toBe(ERRNO_EBADF);
    });
  });

  describe('fd_pread', () => {
    it('reads at offset without changing cursor', () => {
      const { wasi, memory, vfs, fdTable } = createTestSetup();
      vfs.writeFile('/tmp/test.txt', 'ABCDEFGHIJ');
      const fd = openVfsFile(fdTable, vfs, '/tmp/test.txt');

      writeIovecs(memory, 0, [{ buf: 256, buf_len: 3 }]);
      const errno = wasi.fd_pread(fd, 0, 1, 5n, 100);
      expect(errno).toBe(ERRNO_SUCCESS);
      expect(readU32(memory, 100)).toBe(3);
      expect(readString(memory, 256, 3)).toBe('FGH');

      // Cursor should still be at 0
      expect(fdTable.get(fd)!.cursor).toBe(0n);
    });

    it('returns EBADF for invalid fd', () => {
      const { wasi, memory } = createTestSetup();
      writeIovecs(memory, 0, [{ buf: 256, buf_len: 5 }]);
      expect(wasi.fd_pread(99, 0, 1, 0n, 100)).toBe(ERRNO_EBADF);
    });

    it('returns ESPIPE for non-seekable fd', () => {
      const { wasi, memory } = createTestSetup();
      writeIovecs(memory, 0, [{ buf: 256, buf_len: 5 }]);
      expect(wasi.fd_pread(0, 0, 1, 0n, 100)).toBe(ERRNO_ESPIPE);
    });
  });

  describe('fd_pwrite', () => {
    it('writes at offset without changing cursor', () => {
      const { wasi, memory, vfs, fdTable } = createTestSetup();
      vfs.writeFile('/tmp/test.txt', 'AAAAAAAAAA');
      const fd = openVfsFile(fdTable, vfs, '/tmp/test.txt');

      writeString(memory, 256, 'BB');
      writeIovecs(memory, 0, [{ buf: 256, buf_len: 2 }]);
      const errno = wasi.fd_pwrite(fd, 0, 1, 3n, 100);
      expect(errno).toBe(ERRNO_SUCCESS);
      expect(readU32(memory, 100)).toBe(2);

      const content = new TextDecoder().decode(vfs.readFile('/tmp/test.txt'));
      expect(content).toBe('AAABBAAAAA');

      // Cursor should still be at 0
      expect(fdTable.get(fd)!.cursor).toBe(0n);
    });

    it('extends file when writing past end', () => {
      const { wasi, memory, vfs, fdTable } = createTestSetup();
      vfs.writeFile('/tmp/test.txt', 'AB');
      const fd = openVfsFile(fdTable, vfs, '/tmp/test.txt');

      writeString(memory, 256, 'CD');
      writeIovecs(memory, 0, [{ buf: 256, buf_len: 2 }]);
      wasi.fd_pwrite(fd, 0, 1, 5n, 100);

      const data = vfs.readFile('/tmp/test.txt');
      expect(data.length).toBe(7);
      expect(data[5]).toBe(67); // 'C'
      expect(data[6]).toBe(68); // 'D'
    });

    it('returns EBADF for invalid fd', () => {
      const { wasi, memory } = createTestSetup();
      writeIovecs(memory, 0, [{ buf: 256, buf_len: 5 }]);
      expect(wasi.fd_pwrite(99, 0, 1, 0n, 100)).toBe(ERRNO_EBADF);
    });
  });

  describe('fd_renumber', () => {
    it('renumbers a file descriptor', () => {
      const { wasi, fdTable, vfs } = createTestSetup();
      vfs.writeFile('/tmp/test.txt', 'data');
      const fd = openVfsFile(fdTable, vfs, '/tmp/test.txt');

      const errno = wasi.fd_renumber(fd, 10);
      expect(errno).toBe(ERRNO_SUCCESS);
      expect(fdTable.has(fd)).toBeFalsy();
      expect(fdTable.has(10)).toBeTruthy();
    });

    it('returns EBADF for invalid source fd', () => {
      const { wasi } = createTestSetup();
      expect(wasi.fd_renumber(99, 10)).toBe(ERRNO_EBADF);
    });
  });

  describe('path_link', () => {
    it('returns ENOSYS', () => {
      const { wasi } = createTestSetup();
      expect(wasi.path_link(3, 0, 0, 0, 3, 0, 0)).toBe(ERRNO_ENOSYS);
    });
  });

  describe('socket stubs', () => {
    it('sock_accept returns ENOSYS', () => {
      const { wasi } = createTestSetup();
      expect(wasi.sock_accept(0, 0, 0)).toBe(ERRNO_ENOSYS);
    });

    it('sock_recv returns ENOSYS', () => {
      const { wasi } = createTestSetup();
      expect(wasi.sock_recv(0, 0, 0, 0, 0, 0)).toBe(ERRNO_ENOSYS);
    });

    it('sock_send returns ENOSYS', () => {
      const { wasi } = createTestSetup();
      expect(wasi.sock_send(0, 0, 0, 0, 0)).toBe(ERRNO_ENOSYS);
    });

    it('sock_shutdown returns ENOSYS', () => {
      const { wasi } = createTestSetup();
      expect(wasi.sock_shutdown(0, 0)).toBe(ERRNO_ENOSYS);
    });
  });

  describe('getImports completeness', () => {
    it('exports all 46 wasi_snapshot_preview1 functions', () => {
      const { wasi } = createTestSetup();
      const imports = wasi.getImports() as unknown as Record<string, unknown>;

      const expectedFunctions = [
        // Core fd (US-007)
        'fd_read', 'fd_write', 'fd_seek', 'fd_tell', 'fd_close',
        'fd_fdstat_get', 'fd_fdstat_set_flags',
        'fd_prestat_get', 'fd_prestat_dir_name',
        // Path ops (US-008)
        'path_open', 'path_create_directory', 'path_unlink_file',
        'path_remove_directory', 'path_rename', 'path_symlink', 'path_readlink',
        'path_filestat_get', 'path_filestat_set_times',
        // FD filestat/readdir (US-008)
        'fd_filestat_get', 'fd_filestat_set_size', 'fd_filestat_set_times',
        'fd_readdir',
        // Args, env, clock, random, process (US-009)
        'args_get', 'args_sizes_get',
        'environ_get', 'environ_sizes_get',
        'clock_res_get', 'clock_time_get',
        'random_get',
        'proc_exit', 'proc_raise',
        'sched_yield',
        'poll_oneoff',
        // Stub fd ops (US-009)
        'fd_advise', 'fd_allocate', 'fd_datasync', 'fd_sync',
        'fd_fdstat_set_rights', 'fd_pread', 'fd_pwrite', 'fd_renumber',
        // Path stubs (US-009)
        'path_link',
        // Socket stubs (US-009)
        'sock_accept', 'sock_recv', 'sock_send', 'sock_shutdown',
      ];

      for (const name of expectedFunctions) {
        expect(typeof imports[name]).toBe('function');
      }

      expect(expectedFunctions.length).toBe(46);
      expect(Object.keys(imports).length).toBe(46);
    });

    it('import functions delegate correctly for proc_exit', () => {
      const { wasi } = createTestSetup();
      const imports = wasi.getImports() as unknown as Record<string, Function>;
      expect(() => imports.proc_exit(0)).toThrow(WasiProcExit);
    });
  });
});
