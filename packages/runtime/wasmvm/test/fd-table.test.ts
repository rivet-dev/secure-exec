import { describe, it, expect } from 'vitest';
import {
  FDTable,
  FDEntry,
  FileDescription,
  FILETYPE_REGULAR_FILE,
  FILETYPE_DIRECTORY,
  FILETYPE_CHARACTER_DEVICE,
  FDFLAG_APPEND,
  RIGHT_FD_READ,
  RIGHT_FD_WRITE,
  RIGHT_FD_READDIR,
  RIGHT_PATH_OPEN,
  ERRNO_SUCCESS,
  ERRNO_EBADF,
} from './helpers/test-fd-table.ts';

describe('FDTable', () => {
  describe('stdio pre-allocation', () => {
    it('should pre-allocate fds 0, 1, 2 for stdin, stdout, stderr', () => {
      const table = new FDTable();
      const stdin = table.get(0)!;
      const stdout = table.get(1)!;
      const stderr = table.get(2)!;

      expect(stdin).not.toBe(null);
      expect(stdout).not.toBe(null);
      expect(stderr).not.toBe(null);

      expect((stdin.resource as { name: string }).name).toBe('stdin');
      expect((stdout.resource as { name: string }).name).toBe('stdout');
      expect((stderr.resource as { name: string }).name).toBe('stderr');
    });

    it('should set stdio fds as character devices', () => {
      const table = new FDTable();
      expect(table.get(0)!.filetype).toBe(FILETYPE_CHARACTER_DEVICE);
      expect(table.get(1)!.filetype).toBe(FILETYPE_CHARACTER_DEVICE);
      expect(table.get(2)!.filetype).toBe(FILETYPE_CHARACTER_DEVICE);
    });

    it('should set append flag on stdout and stderr', () => {
      const table = new FDTable();
      expect(table.get(0)!.fdflags).toBe(0);
      expect(table.get(1)!.fdflags).toBe(FDFLAG_APPEND);
      expect(table.get(2)!.fdflags).toBe(FDFLAG_APPEND);
    });

    it('should start with 3 open fds', () => {
      const table = new FDTable();
      expect(table.size).toBe(3);
    });
  });

  describe('open', () => {
    it('should return fd numbers starting at 3', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file', data: new Uint8Array() } as never);
      expect(fd).toBe(3);
    });

    it('should increment fd numbers', () => {
      const table = new FDTable();
      const fd1 = table.open({ type: 'file' } as never);
      const fd2 = table.open({ type: 'file' } as never);
      expect(fd1).toBe(3);
      expect(fd2).toBe(4);
    });

    it('should store the resource', () => {
      const table = new FDTable();
      const resource = { type: 'file', data: new Uint8Array([1, 2, 3]) } as never;
      const fd = table.open(resource);
      expect(table.get(fd)!.resource).toBe(resource);
    });

    it('should default to FILETYPE_REGULAR_FILE', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      expect(table.get(fd)!.filetype).toBe(FILETYPE_REGULAR_FILE);
    });

    it('should accept custom filetype', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'dir' } as never, { filetype: FILETYPE_DIRECTORY });
      expect(table.get(fd)!.filetype).toBe(FILETYPE_DIRECTORY);
    });

    it('should accept custom rights', () => {
      const table = new FDTable();
      const rights = RIGHT_FD_READ | RIGHT_FD_WRITE;
      const fd = table.open({ type: 'file' } as never, { rightsBase: rights });
      expect(table.get(fd)!.rightsBase).toBe(rights);
    });

    it('should accept custom fdflags', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never, { fdflags: FDFLAG_APPEND });
      expect(table.get(fd)!.fdflags).toBe(FDFLAG_APPEND);
    });

    it('should store the path if provided', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never, { path: '/tmp/test.txt' });
      expect(table.get(fd)!.path).toBe('/tmp/test.txt');
    });

    it('should initialize cursor to 0', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      expect(table.get(fd)!.cursor).toBe(0n);
    });
  });

  describe('close', () => {
    it('should close an open fd', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      expect(table.close(fd)).toBe(ERRNO_SUCCESS);
      expect(table.get(fd)).toBe(null);
    });

    it('should return EBADF for invalid fd', () => {
      const table = new FDTable();
      expect(table.close(99)).toBe(ERRNO_EBADF);
    });

    it('should reduce the number of open fds', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      expect(table.size).toBe(4);
      table.close(fd);
      expect(table.size).toBe(3);
    });

    it('should allow closing stdio fds', () => {
      const table = new FDTable();
      expect(table.close(0)).toBe(ERRNO_SUCCESS);
      expect(table.get(0)).toBe(null);
    });
  });

  describe('get', () => {
    it('should return the entry for an open fd', () => {
      const table = new FDTable();
      const entry = table.get(0)!;
      expect(entry).not.toBe(null);
      expect((entry.resource as { name: string }).name).toBe('stdin');
    });

    it('should return null for a closed fd', () => {
      const table = new FDTable();
      expect(table.get(99)).toBe(null);
    });
  });

  describe('dup', () => {
    it('should duplicate an fd', () => {
      const table = new FDTable();
      const resource = { type: 'file', data: 'hello' } as never;
      const fd = table.open(resource);
      const newFd = table.dup(fd);

      expect(newFd).not.toBe(fd);
      expect(table.get(newFd)!.resource).toBe(resource);
    });

    it('should copy filetype, rights, and flags', () => {
      const table = new FDTable();
      const rights = RIGHT_FD_READ;
      const fd = table.open({ type: 'file' } as never, {
        filetype: FILETYPE_REGULAR_FILE,
        rightsBase: rights,
        fdflags: FDFLAG_APPEND,
      });
      const newFd = table.dup(fd);
      const entry = table.get(newFd)!;

      expect(entry.filetype).toBe(FILETYPE_REGULAR_FILE);
      expect(entry.rightsBase).toBe(rights);
      expect(entry.fdflags).toBe(FDFLAG_APPEND);
    });

    it('should share cursor position via FileDescription', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      table.get(fd)!.cursor = 42n;
      const newFd = table.dup(fd);
      expect(table.get(newFd)!.cursor).toBe(42n);
      // Shared: seeking one moves the other
      table.get(fd)!.cursor = 100n;
      expect(table.get(newFd)!.cursor).toBe(100n);
    });

    it('should share the same FileDescription object', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      const newFd = table.dup(fd);
      expect(table.get(fd)!.fileDescription).toBe(table.get(newFd)!.fileDescription);
    });

    it('should increment FileDescription refCount', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      expect(table.get(fd)!.fileDescription.refCount).toBe(1);
      const newFd = table.dup(fd);
      expect(table.get(fd)!.fileDescription.refCount).toBe(2);
    });

    it('should return -1 for invalid fd', () => {
      const table = new FDTable();
      expect(table.dup(99)).toBe(-1);
    });

    it('should allow independent closure', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      const newFd = table.dup(fd);
      table.close(fd);
      expect(table.get(fd)).toBe(null);
      expect(table.get(newFd)).not.toBe(null);
    });

    it('close one fd, other fd still works with shared cursor', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      table.get(fd)!.cursor = 50n;
      const newFd = table.dup(fd);
      // Close original — duped fd retains cursor
      table.close(fd);
      expect(table.get(newFd)!.cursor).toBe(50n);
      // Can still seek on the remaining fd
      table.get(newFd)!.cursor = 99n;
      expect(table.get(newFd)!.cursor).toBe(99n);
    });

    it('close decrements FileDescription refCount', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      const newFd = table.dup(fd);
      const fileDesc = table.get(fd)!.fileDescription;
      expect(fileDesc.refCount).toBe(2);
      table.close(fd);
      expect(fileDesc.refCount).toBe(1);
      table.close(newFd);
      expect(fileDesc.refCount).toBe(0);
    });
  });

  describe('dup2', () => {
    it('should duplicate fd to a specific number', () => {
      const table = new FDTable();
      const resource = { type: 'file', data: 'test' } as never;
      const fd = table.open(resource);
      const result = table.dup2(fd, 10);

      expect(result).toBe(ERRNO_SUCCESS);
      expect(table.get(10)!.resource).toBe(resource);
    });

    it('should close the target fd if already open', () => {
      const table = new FDTable();
      const res1 = { type: 'file', name: 'first' } as never;
      const res2 = { type: 'file', name: 'second' } as never;
      const fd1 = table.open(res1);
      const fd2 = table.open(res2);

      table.dup2(fd1, fd2);
      expect(table.get(fd2)!.resource).toBe(res1);
    });

    it('should be a no-op when oldFd === newFd and fd is valid', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      expect(table.dup2(fd, fd)).toBe(ERRNO_SUCCESS);
    });

    it('should return EBADF when oldFd === newFd and fd is invalid', () => {
      const table = new FDTable();
      expect(table.dup2(99, 99)).toBe(ERRNO_EBADF);
    });

    it('should return EBADF for invalid source fd', () => {
      const table = new FDTable();
      expect(table.dup2(99, 10)).toBe(ERRNO_EBADF);
    });

    it('should share cursor position via FileDescription', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      table.get(fd)!.cursor = 100n;
      table.dup2(fd, 10);
      expect(table.get(10)!.cursor).toBe(100n);
      // Shared: seeking one moves the other
      table.get(10)!.cursor = 200n;
      expect(table.get(fd)!.cursor).toBe(200n);
    });

    it('should share the same FileDescription object via dup2', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      table.dup2(fd, 10);
      expect(table.get(fd)!.fileDescription).toBe(table.get(10)!.fileDescription);
      expect(table.get(fd)!.fileDescription.refCount).toBe(2);
    });

    it('should allow redirecting stdio', () => {
      const table = new FDTable();
      const file = { type: 'file', path: '/tmp/out.txt' } as never;
      const fd = table.open(file);

      // Redirect stdout (fd 1) to the file
      table.dup2(fd, 1);
      expect(table.get(1)!.resource).toBe(file);
    });
  });

  describe('has', () => {
    it('should return true for open fds', () => {
      const table = new FDTable();
      expect(table.has(0)).toBe(true);
      expect(table.has(1)).toBe(true);
      expect(table.has(2)).toBe(true);
    });

    it('should return false for closed fds', () => {
      const table = new FDTable();
      expect(table.has(99)).toBe(false);
    });
  });

  describe('FileDescription', () => {
    it('should have correct initial state', () => {
      const desc = new FileDescription(42, FDFLAG_APPEND);
      expect(desc.inode).toBe(42);
      expect(desc.cursor).toBe(0n);
      expect(desc.flags).toBe(FDFLAG_APPEND);
      expect(desc.refCount).toBe(1);
    });

    it('open() creates new FileDescription with refCount=1', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      const entry = table.get(fd)!;
      expect(entry.fileDescription).toBeInstanceOf(FileDescription);
      expect(entry.fileDescription.refCount).toBe(1);
      expect(entry.fileDescription.cursor).toBe(0n);
    });

    it('separate open() calls create separate FileDescriptions', () => {
      const table = new FDTable();
      const fd1 = table.open({ type: 'file' } as never);
      const fd2 = table.open({ type: 'file' } as never);
      expect(table.get(fd1)!.fileDescription).not.toBe(table.get(fd2)!.fileDescription);
    });
  });

  describe('cursor tracking', () => {
    it('should allow setting and reading cursor position', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      const entry = table.get(fd)!;

      expect(entry.cursor).toBe(0n);
      entry.cursor = 1024n;
      expect(table.get(fd)!.cursor).toBe(1024n);
    });

    it('should track cursor independently per separately-opened fd', () => {
      const table = new FDTable();
      const fd1 = table.open({ type: 'file' } as never);
      const fd2 = table.open({ type: 'file' } as never);

      table.get(fd1)!.cursor = 10n;
      table.get(fd2)!.cursor = 20n;

      expect(table.get(fd1)!.cursor).toBe(10n);
      expect(table.get(fd2)!.cursor).toBe(20n);
    });

    it('dup(fd) then seek on original — duped fd cursor also moved', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      const dupFd = table.dup(fd);

      // Seek original
      table.get(fd)!.cursor = 42n;
      // Duped fd sees the same cursor
      expect(table.get(dupFd)!.cursor).toBe(42n);

      // Seek duped fd
      table.get(dupFd)!.cursor = 99n;
      // Original also moved
      expect(table.get(fd)!.cursor).toBe(99n);
    });
  });

  describe('FD reclamation', () => {
    it('should reuse closed FD numbers', () => {
      const table = new FDTable();
      const fd1 = table.open({ type: 'file' } as never); // 3
      const fd2 = table.open({ type: 'file' } as never); // 4
      table.close(fd1); // free 3
      const fd3 = table.open({ type: 'file' } as never); // should reuse 3
      expect(fd3).toBe(fd1);
    });

    it('should reuse FDs after opening/closing 100 FDs', () => {
      const table = new FDTable();
      // Open 100 FDs (3..102)
      const fds: number[] = [];
      for (let i = 0; i < 100; i++) {
        fds.push(table.open({ type: 'file' } as never));
      }
      expect(fds[0]).toBe(3);
      expect(fds[99]).toBe(102);
      // Close all 100
      for (const fd of fds) {
        table.close(fd);
      }
      // Next open should reuse a low number (from free list)
      const reused = table.open({ type: 'file' } as never);
      expect(reused >= 3 && reused <= 102).toBeTruthy();
    });

    it('should never reclaim stdio FDs (0, 1, 2)', () => {
      const table = new FDTable();
      // Close stdio
      table.close(0);
      table.close(1);
      table.close(2);
      // Open new FDs — should NOT get 0, 1, or 2
      const fd1 = table.open({ type: 'file' } as never);
      const fd2 = table.open({ type: 'file' } as never);
      const fd3 = table.open({ type: 'file' } as never);
      expect(fd1 >= 3).toBeTruthy();
      expect(fd2 >= 3).toBeTruthy();
      expect(fd3 >= 3).toBeTruthy();
    });

    it('should reuse FDs from dup() after closing', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never); // 3
      const dupFd = table.dup(fd); // 4
      table.close(dupFd); // free 4
      const fd2 = table.open({ type: 'file' } as never); // should reuse 4
      expect(fd2).toBe(dupFd);
    });

    it('should allocate new FDs when free list is empty', () => {
      const table = new FDTable();
      const fd1 = table.open({ type: 'file' } as never); // 3
      const fd2 = table.open({ type: 'file' } as never); // 4
      expect(fd1).toBe(3);
      expect(fd2).toBe(4);
      // No closes, so free list is empty — next should be 5
      const fd3 = table.open({ type: 'file' } as never);
      expect(fd3).toBe(5);
    });
  });

  describe('rights tracking', () => {
    it('should track base and inheriting rights', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never, {
        rightsBase: RIGHT_FD_READ | RIGHT_FD_WRITE,
        rightsInheriting: RIGHT_FD_READ,
      });
      const entry = table.get(fd)!;
      expect(entry.rightsBase).toBe(RIGHT_FD_READ | RIGHT_FD_WRITE);
      expect(entry.rightsInheriting).toBe(RIGHT_FD_READ);
    });

    it('should give directories appropriate default rights', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'dir' } as never, { filetype: FILETYPE_DIRECTORY });
      const entry = table.get(fd)!;
      // Directory should have readdir and path_open rights
      expect(entry.rightsBase & RIGHT_FD_READDIR).not.toBe(0n);
      expect(entry.rightsBase & RIGHT_PATH_OPEN).not.toBe(0n);
    });
  });

  describe('renumber', () => {
    it('should move fd from old to new number', () => {
      const table = new FDTable();
      const resource = { type: 'file', name: 'test' } as never;
      const fd = table.open(resource);

      expect(table.renumber(fd, 10)).toBe(ERRNO_SUCCESS);
      expect(table.get(10)!.resource).toBe(resource);
      expect(table.get(fd)).toBe(null);
    });

    it('should close target fd if open', () => {
      const table = new FDTable();
      const res1 = { type: 'file', name: 'first' } as never;
      const res2 = { type: 'file', name: 'second' } as never;
      const fd1 = table.open(res1);
      const fd2 = table.open(res2);

      table.renumber(fd1, fd2);
      expect(table.get(fd2)!.resource).toBe(res1);
      expect(table.get(fd1)).toBe(null);
    });

    it('should return EBADF for invalid source', () => {
      const table = new FDTable();
      expect(table.renumber(99, 10)).toBe(ERRNO_EBADF);
    });

    it('should be a no-op when oldFd === newFd', () => {
      const table = new FDTable();
      const fd = table.open({ type: 'file' } as never);
      expect(table.renumber(fd, fd)).toBe(ERRNO_SUCCESS);
      expect(table.get(fd)).not.toBe(null);
    });
  });
});
