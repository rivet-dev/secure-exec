/**
 * Unit tests for UserManager (host_user syscall implementations).
 */

import { describe, it, beforeEach, expect } from 'vitest';
import { UserManager } from '../src/user.ts';
import { FDTable, FILETYPE_CHARACTER_DEVICE, FILETYPE_REGULAR_FILE, FILETYPE_UNKNOWN,
         RIGHT_FD_READ, RIGHT_FD_WRITE } from './helpers/test-fd-table.ts';

// Helper: create a WASM-like Memory with ArrayBuffer
function createMockMemory(size = 1024): { buffer: ArrayBuffer } {
  return { buffer: new ArrayBuffer(size) };
}

describe('UserManager', () => {
  let mem: { buffer: ArrayBuffer };
  let getMemory: () => { buffer: ArrayBuffer };

  beforeEach(() => {
    mem = createMockMemory();
    getMemory = () => mem;
  });

  describe('constructor defaults', () => {
    it('uses default uid/gid/username/homedir', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory });
      const imports = um.getImports();

      // getuid returns 1000
      expect(imports.getuid(0)).toBe(0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(1000);

      // getgid returns 1000
      expect(imports.getgid(4)).toBe(0);
      expect(new DataView(mem.buffer).getUint32(4, true)).toBe(1000);
    });

    it('euid defaults to uid, egid defaults to gid', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory, uid: 500, gid: 600 });
      const imports = um.getImports();

      expect(imports.geteuid(0)).toBe(0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(500);

      expect(imports.getegid(4)).toBe(0);
      expect(new DataView(mem.buffer).getUint32(4, true)).toBe(600);
    });

    it('ttyFds defaults to empty set (nothing is a TTY)', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory });
      const imports = um.getImports();

      expect(imports.isatty(0, 0)).toBe(0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(0);

      expect(imports.isatty(1, 0)).toBe(0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(0);
    });
  });

  describe('getuid', () => {
    it('writes configured uid to return pointer', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory, uid: 42 });
      const imports = um.getImports();

      const errno = imports.getuid(8);
      expect(errno).toBe(0);
      expect(new DataView(mem.buffer).getUint32(8, true)).toBe(42);
    });

    it('returns ENOSYS when memory not available', () => {
      const um = new UserManager({ getMemory: () => null as never });
      expect(um.getImports().getuid(0)).toBe(52);
    });
  });

  describe('getgid', () => {
    it('writes configured gid to return pointer', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory, gid: 99 });
      const errno = um.getImports().getgid(12);
      expect(errno).toBe(0);
      expect(new DataView(mem.buffer).getUint32(12, true)).toBe(99);
    });

    it('returns ENOSYS when memory not available', () => {
      const um = new UserManager({ getMemory: () => null as never });
      expect(um.getImports().getgid(0)).toBe(52);
    });
  });

  describe('geteuid', () => {
    it('writes configured euid to return pointer', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory, uid: 1000, euid: 0 });
      const errno = um.getImports().geteuid(0);
      expect(errno).toBe(0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(0);
    });

    it('defaults euid to uid', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory, uid: 777 });
      um.getImports().geteuid(0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(777);
    });
  });

  describe('getegid', () => {
    it('writes configured egid to return pointer', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory, gid: 500, egid: 0 });
      const errno = um.getImports().getegid(0);
      expect(errno).toBe(0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(0);
    });

    it('defaults egid to gid', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory, gid: 333 });
      um.getImports().getegid(0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(333);
    });
  });

  describe('isatty', () => {
    it('returns 0 (false) for non-TTY fds', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory });
      const errno = um.getImports().isatty(0, 0);
      expect(errno).toBe(0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(0);
    });

    it('returns 1 (true) for TTY fds when ttyFds=true (stdio)', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory, ttyFds: true });
      const imports = um.getImports();

      // fd 0 (stdin)
      imports.isatty(0, 0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(1);

      // fd 1 (stdout)
      imports.isatty(1, 0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(1);

      // fd 2 (stderr)
      imports.isatty(2, 0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(1);

      // fd 3 is NOT a TTY
      imports.isatty(3, 0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(0);
    });

    it('returns 1 for specific ttyFds set', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory, ttyFds: new Set([1, 2]) });
      const imports = um.getImports();

      imports.isatty(0, 0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(0); // stdin not in set

      imports.isatty(1, 0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(1); // stdout in set

      imports.isatty(2, 0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(1); // stderr in set
    });

    it('checks FDTable filetype when available', () => {
      const fdTable = new FDTable();
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory, fdTable, ttyFds: true });
      const imports = um.getImports();

      // fd 0 is a CHARACTER_DEVICE in FDTable -> TTY
      imports.isatty(0, 0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(1);

      // Open a regular file -- it should NOT be a TTY even if in ttyFds
      const fileFd = fdTable.open(
        { type: 'vfsFile', ino: 1, path: '/tmp/test' },
        { filetype: FILETYPE_REGULAR_FILE, rightsBase: RIGHT_FD_READ, rightsInheriting: 0n, fdflags: 0 }
      );
      // Even if we add fileFd to ttyFds, it's not a character device
      (um as unknown as { _ttyFds: Set<number> })._ttyFds.add(fileFd);
      imports.isatty(fileFd, 0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(0);
    });

    it('returns EBADF for non-existent fd when FDTable is available', () => {
      const fdTable = new FDTable();
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory, fdTable, ttyFds: true });
      const imports = um.getImports();

      const errno = imports.isatty(999, 0);
      expect(errno).toBe(8); // EBADF
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(0);
    });

    it('returns 0 for pipe fds', () => {
      const fdTable = new FDTable();
      const pipe = { buffer: new Uint8Array(), readOffset: 0, writeOffset: 0 };
      const pipeFd = fdTable.open(
        { type: 'pipe', pipe, end: 'read' },
        { filetype: FILETYPE_UNKNOWN, rightsBase: RIGHT_FD_READ, rightsInheriting: 0n, fdflags: 0 }
      );

      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory, fdTable, ttyFds: new Set([pipeFd]) });
      const imports = um.getImports();

      imports.isatty(pipeFd, 0);
      expect(new DataView(mem.buffer).getUint32(0, true)).toBe(0);
    });

    it('returns ENOSYS when memory not available', () => {
      const um = new UserManager({ getMemory: () => null as never });
      expect(um.getImports().isatty(0, 0)).toBe(52);
    });
  });

  describe('getpwuid', () => {
    it('returns configured user passwd entry for matching uid', () => {
      const um = new UserManager({
        getMemory: getMemory as () => WebAssembly.Memory,
        uid: 1000,
        gid: 1000,
        username: 'alice',
        homedir: '/home/alice',
        shell: '/bin/bash',
        gecos: 'Alice',
      });
      const imports = um.getImports();

      const bufPtr = 0;
      const bufLen = 256;
      const retLenPtr = 512;

      const errno = imports.getpwuid(1000, bufPtr, bufLen, retLenPtr);
      expect(errno).toBe(0);

      const len = new DataView(mem.buffer).getUint32(retLenPtr, true);
      const result = new TextDecoder().decode(new Uint8Array(mem.buffer, bufPtr, len));
      expect(result).toBe('alice:x:1000:1000:Alice:/home/alice:/bin/bash');
    });

    it('returns default passwd entry with default config', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory });
      const imports = um.getImports();

      const bufPtr = 0;
      const retLenPtr = 512;

      imports.getpwuid(1000, bufPtr, 256, retLenPtr);
      const len = new DataView(mem.buffer).getUint32(retLenPtr, true);
      const result = new TextDecoder().decode(new Uint8Array(mem.buffer, bufPtr, len));
      expect(result).toBe('user:x:1000:1000::/home/user:/bin/sh');
    });

    it('returns generic entry for non-matching uid', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory, uid: 1000 });
      const imports = um.getImports();

      const bufPtr = 0;
      const retLenPtr = 512;

      imports.getpwuid(500, bufPtr, 256, retLenPtr);
      const len = new DataView(mem.buffer).getUint32(retLenPtr, true);
      const result = new TextDecoder().decode(new Uint8Array(mem.buffer, bufPtr, len));
      expect(result).toBe('user500:x:500:500::/home/user500:/bin/sh');
    });

    it('truncates output when buffer is too small', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory });
      const imports = um.getImports();

      const bufPtr = 0;
      const retLenPtr = 512;

      // Very small buffer
      imports.getpwuid(1000, bufPtr, 10, retLenPtr);
      const len = new DataView(mem.buffer).getUint32(retLenPtr, true);
      expect(len).toBe(10);

      const result = new TextDecoder().decode(new Uint8Array(mem.buffer, bufPtr, len));
      expect(result).toBe('user:x:100');
    });

    it('returns ENOSYS when memory not available', () => {
      const um = new UserManager({ getMemory: () => null as never });
      expect(um.getImports().getpwuid(1000, 0, 256, 512)).toBe(52);
    });

    it('handles uid 0 (root)', () => {
      const um = new UserManager({
        getMemory: getMemory as () => WebAssembly.Memory,
        uid: 0,
        gid: 0,
        username: 'root',
        homedir: '/root',
      });
      const imports = um.getImports();

      const bufPtr = 0;
      const retLenPtr = 512;

      imports.getpwuid(0, bufPtr, 256, retLenPtr);
      const len = new DataView(mem.buffer).getUint32(retLenPtr, true);
      const result = new TextDecoder().decode(new Uint8Array(mem.buffer, bufPtr, len));
      expect(result).toBe('root:x:0:0::/root:/bin/sh');
    });
  });

  describe('getImports', () => {
    it('returns all 6 host_user functions', () => {
      const um = new UserManager({ getMemory: getMemory as () => WebAssembly.Memory });
      const imports = um.getImports();
      expect(typeof imports.getuid).toBe('function');
      expect(typeof imports.getgid).toBe('function');
      expect(typeof imports.geteuid).toBe('function');
      expect(typeof imports.getegid).toBe('function');
      expect(typeof imports.isatty).toBe('function');
      expect(typeof imports.getpwuid).toBe('function');
      expect(Object.keys(imports).length).toBe(6);
    });
  });
});
