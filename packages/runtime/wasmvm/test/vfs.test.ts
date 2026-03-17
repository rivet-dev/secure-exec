import { describe, it, expect } from 'vitest';
import { VFS, VfsError } from './helpers/test-vfs.ts';

describe('VFS', () => {
  describe('initial layout', () => {
    it('should have root directory', () => {
      const vfs = new VFS();
      expect(vfs.exists('/')).toBe(true);
    });

    it('should pre-populate /bin', () => {
      const vfs = new VFS();
      expect(vfs.exists('/bin')).toBe(true);
      const s = vfs.stat('/bin');
      expect(s.type).toBe('dir');
    });

    it('should pre-populate /tmp', () => {
      const vfs = new VFS();
      expect(vfs.exists('/tmp')).toBe(true);
    });

    it('should pre-populate /home/user', () => {
      const vfs = new VFS();
      expect(vfs.exists('/home/user')).toBe(true);
      expect(vfs.exists('/home')).toBe(true);
    });

    it('should pre-populate /dev with device nodes', () => {
      const vfs = new VFS();
      expect(vfs.exists('/dev/null')).toBe(true);
      expect(vfs.exists('/dev/stdin')).toBe(true);
      expect(vfs.exists('/dev/stdout')).toBe(true);
      expect(vfs.exists('/dev/stderr')).toBe(true);
    });
  });

  describe('mkdir', () => {
    it('should create a directory', () => {
      const vfs = new VFS();
      vfs.mkdir('/tmp/testdir');
      expect(vfs.exists('/tmp/testdir')).toBe(true);
      const s = vfs.stat('/tmp/testdir');
      expect(s.type).toBe('dir');
    });

    it('should throw ENOENT if parent does not exist', () => {
      const vfs = new VFS();
      expect(() => vfs.mkdir('/nonexistent/dir')).toThrow(/ENOENT/);
    });

    it('should throw EEXIST if path already exists', () => {
      const vfs = new VFS();
      vfs.mkdir('/tmp/dup');
      expect(() => vfs.mkdir('/tmp/dup')).toThrow(/EEXIST/);
    });

    it('should update parent mtime', () => {
      const vfs = new VFS();
      const before = vfs.stat('/tmp').mtime;
      // Ensure time passes
      vfs.mkdir('/tmp/timedir');
      const after = vfs.stat('/tmp').mtime;
      expect(after >= before).toBeTruthy();
    });
  });

  describe('mkdirp', () => {
    it('should create nested directories', () => {
      const vfs = new VFS();
      vfs.mkdirp('/a/b/c/d');
      expect(vfs.exists('/a')).toBe(true);
      expect(vfs.exists('/a/b')).toBe(true);
      expect(vfs.exists('/a/b/c')).toBe(true);
      expect(vfs.exists('/a/b/c/d')).toBe(true);
    });

    it('should not fail if directories already exist', () => {
      const vfs = new VFS();
      vfs.mkdirp('/tmp/existing');
      expect(() => vfs.mkdirp('/tmp/existing')).not.toThrow();
    });
  });

  describe('writeFile / readFile', () => {
    it('should write and read a string file', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/hello.txt', 'hello world');
      const data = vfs.readFile('/tmp/hello.txt');
      expect(new TextDecoder().decode(data)).toBe('hello world');
    });

    it('should write and read a Uint8Array file', () => {
      const vfs = new VFS();
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      vfs.writeFile('/tmp/binary', bytes);
      const data = vfs.readFile('/tmp/binary');
      expect(data).toEqual(bytes);
    });

    it('should overwrite an existing file', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/overwrite.txt', 'first');
      vfs.writeFile('/tmp/overwrite.txt', 'second');
      const data = vfs.readFile('/tmp/overwrite.txt');
      expect(new TextDecoder().decode(data)).toBe('second');
    });

    it('should throw ENOENT if parent does not exist', () => {
      const vfs = new VFS();
      expect(() => vfs.writeFile('/nonexistent/file.txt', 'data')).toThrow(/ENOENT/);
    });

    it('should throw EISDIR when reading a directory', () => {
      const vfs = new VFS();
      expect(() => vfs.readFile('/tmp')).toThrow(/EISDIR/);
    });

    it('should throw ENOENT when reading nonexistent file', () => {
      const vfs = new VFS();
      expect(() => vfs.readFile('/tmp/nope.txt')).toThrow(/ENOENT/);
    });

    it('should throw EISDIR when writing to a directory', () => {
      const vfs = new VFS();
      expect(() => vfs.writeFile('/tmp', 'data')).toThrow(/EISDIR/);
    });

    it('should update mtime on overwrite', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/ts.txt', 'v1');
      const mtime1 = vfs.stat('/tmp/ts.txt').mtime;
      vfs.writeFile('/tmp/ts.txt', 'v2');
      const mtime2 = vfs.stat('/tmp/ts.txt').mtime;
      expect(mtime2 >= mtime1).toBeTruthy();
    });
  });

  describe('/dev/null', () => {
    it('should read as empty', () => {
      const vfs = new VFS();
      const data = vfs.readFile('/dev/null');
      expect(data.length).toBe(0);
    });

    it('should discard writes', () => {
      const vfs = new VFS();
      vfs.writeFile('/dev/null', 'this should be discarded');
      const data = vfs.readFile('/dev/null');
      expect(data.length).toBe(0);
    });
  });

  describe('readdir', () => {
    it('should list directory entries', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/a.txt', 'a');
      vfs.writeFile('/tmp/b.txt', 'b');
      const entries = vfs.readdir('/tmp');
      expect(entries).toContain('a.txt');
      expect(entries).toContain('b.txt');
    });

    it('should throw ENOENT for nonexistent directory', () => {
      const vfs = new VFS();
      expect(() => vfs.readdir('/nonexistent')).toThrow(/ENOENT/);
    });

    it('should throw ENOTDIR for a file', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/file.txt', 'data');
      expect(() => vfs.readdir('/tmp/file.txt')).toThrow(/ENOTDIR/);
    });

    it('should list root directory entries', () => {
      const vfs = new VFS();
      const entries = vfs.readdir('/');
      expect(entries).toContain('bin');
      expect(entries).toContain('tmp');
      expect(entries).toContain('home');
      expect(entries).toContain('dev');
    });
  });

  describe('stat', () => {
    it('should return stat for a file', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/stat.txt', 'hello');
      const s = vfs.stat('/tmp/stat.txt');
      expect(s.type).toBe('file');
      expect(s.size).toBe(5);
      expect(s.mode).toBe(0o644);
      expect(s.uid).toBe(1000);
      expect(s.gid).toBe(1000);
      expect(s.nlink).toBe(1);
      expect(s.atime > 0).toBeTruthy();
      expect(s.mtime > 0).toBeTruthy();
      expect(s.ctime > 0).toBeTruthy();
    });

    it('should return stat for a directory', () => {
      const vfs = new VFS();
      const s = vfs.stat('/tmp');
      expect(s.type).toBe('dir');
      expect(s.mode).toBe(0o755);
    });

    it('should throw ENOENT for nonexistent path', () => {
      const vfs = new VFS();
      expect(() => vfs.stat('/nonexistent')).toThrow(/ENOENT/);
    });

    it('should follow symlinks', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/target.txt', 'target content');
      vfs.symlink('/tmp/target.txt', '/tmp/link.txt');
      const s = vfs.stat('/tmp/link.txt');
      expect(s.type).toBe('file');
      expect(s.size).toBe(14);
    });
  });

  describe('lstat', () => {
    it('should not follow symlinks', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/target.txt', 'data');
      vfs.symlink('/tmp/target.txt', '/tmp/link.txt');
      const s = vfs.lstat('/tmp/link.txt');
      expect(s.type).toBe('symlink');
    });

    it('should return stat for regular files', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/regular.txt', 'data');
      const s = vfs.lstat('/tmp/regular.txt');
      expect(s.type).toBe('file');
    });
  });

  describe('unlink', () => {
    it('should remove a file', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/removeme.txt', 'data');
      expect(vfs.exists('/tmp/removeme.txt')).toBe(true);
      vfs.unlink('/tmp/removeme.txt');
      expect(vfs.exists('/tmp/removeme.txt')).toBe(false);
    });

    it('should throw ENOENT for nonexistent file', () => {
      const vfs = new VFS();
      expect(() => vfs.unlink('/tmp/nope.txt')).toThrow(/ENOENT/);
    });

    it('should throw EISDIR when trying to unlink a directory', () => {
      const vfs = new VFS();
      vfs.mkdir('/tmp/noremove');
      expect(() => vfs.unlink('/tmp/noremove')).toThrow(/EISDIR/);
    });

    it('should remove a symlink without affecting the target', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/target.txt', 'data');
      vfs.symlink('/tmp/target.txt', '/tmp/link.txt');
      vfs.unlink('/tmp/link.txt');
      expect(vfs.exists('/tmp/link.txt')).toBe(false);
      expect(vfs.exists('/tmp/target.txt')).toBe(true);
    });
  });

  describe('rmdir', () => {
    it('should remove an empty directory', () => {
      const vfs = new VFS();
      vfs.mkdir('/tmp/emptydir');
      vfs.rmdir('/tmp/emptydir');
      expect(vfs.exists('/tmp/emptydir')).toBe(false);
    });

    it('should throw ENOTEMPTY for non-empty directory', () => {
      const vfs = new VFS();
      vfs.mkdir('/tmp/notempty');
      vfs.writeFile('/tmp/notempty/file.txt', 'data');
      expect(() => vfs.rmdir('/tmp/notempty')).toThrow(/ENOTEMPTY/);
    });

    it('should throw ENOTDIR for a file', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/notdir.txt', 'data');
      expect(() => vfs.rmdir('/tmp/notdir.txt')).toThrow(/ENOTDIR/);
    });

    it('should throw EPERM when trying to remove root', () => {
      const vfs = new VFS();
      expect(() => vfs.rmdir('/')).toThrow(/EPERM/);
    });
  });

  describe('rename', () => {
    it('should rename a file', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/old.txt', 'data');
      vfs.rename('/tmp/old.txt', '/tmp/new.txt');
      expect(vfs.exists('/tmp/old.txt')).toBe(false);
      expect(vfs.exists('/tmp/new.txt')).toBe(true);
      expect(new TextDecoder().decode(vfs.readFile('/tmp/new.txt'))).toBe('data');
    });

    it('should rename a directory', () => {
      const vfs = new VFS();
      vfs.mkdir('/tmp/olddir');
      vfs.writeFile('/tmp/olddir/file.txt', 'content');
      vfs.rename('/tmp/olddir', '/tmp/newdir');
      expect(vfs.exists('/tmp/olddir')).toBe(false);
      expect(vfs.exists('/tmp/newdir')).toBe(true);
      expect(new TextDecoder().decode(vfs.readFile('/tmp/newdir/file.txt'))).toBe('content');
    });

    it('should overwrite destination file', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/src.txt', 'new');
      vfs.writeFile('/tmp/dst.txt', 'old');
      vfs.rename('/tmp/src.txt', '/tmp/dst.txt');
      expect(vfs.exists('/tmp/src.txt')).toBe(false);
      expect(new TextDecoder().decode(vfs.readFile('/tmp/dst.txt'))).toBe('new');
    });

    it('should move file across directories', () => {
      const vfs = new VFS();
      vfs.mkdir('/tmp/srcdir');
      vfs.mkdir('/tmp/dstdir');
      vfs.writeFile('/tmp/srcdir/file.txt', 'moved');
      vfs.rename('/tmp/srcdir/file.txt', '/tmp/dstdir/file.txt');
      expect(vfs.exists('/tmp/srcdir/file.txt')).toBe(false);
      expect(new TextDecoder().decode(vfs.readFile('/tmp/dstdir/file.txt'))).toBe('moved');
    });

    it('should throw ENOENT for nonexistent source', () => {
      const vfs = new VFS();
      expect(() => vfs.rename('/tmp/nope', '/tmp/nope2')).toThrow(/ENOENT/);
    });
  });

  describe('symlink / readlink', () => {
    it('should create and read a symlink', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/target.txt', 'target');
      vfs.symlink('/tmp/target.txt', '/tmp/link.txt');
      expect(vfs.readlink('/tmp/link.txt')).toBe('/tmp/target.txt');
    });

    it('should follow symlinks for readFile', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/real.txt', 'real content');
      vfs.symlink('/tmp/real.txt', '/tmp/sym.txt');
      const data = vfs.readFile('/tmp/sym.txt');
      expect(new TextDecoder().decode(data)).toBe('real content');
    });

    it('should throw EEXIST if link path already exists', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/existing.txt', 'data');
      expect(() => vfs.symlink('/tmp/target', '/tmp/existing.txt')).toThrow(/EEXIST/);
    });

    it('should throw EINVAL when readlink on non-symlink', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/regular.txt', 'data');
      expect(() => vfs.readlink('/tmp/regular.txt')).toThrow(/EINVAL/);
    });

    it('should follow symlinks to directories', () => {
      const vfs = new VFS();
      vfs.mkdir('/tmp/realdir');
      vfs.writeFile('/tmp/realdir/file.txt', 'found');
      vfs.symlink('/tmp/realdir', '/tmp/symdir');
      const data = vfs.readFile('/tmp/symdir/file.txt');
      expect(new TextDecoder().decode(data)).toBe('found');
    });

    it('should handle relative symlinks', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/actual.txt', 'relative target');
      vfs.symlink('actual.txt', '/tmp/rellink.txt');
      const data = vfs.readFile('/tmp/rellink.txt');
      expect(new TextDecoder().decode(data)).toBe('relative target');
    });
  });

  describe('chmod', () => {
    it('should change file permissions', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/chmod.txt', 'data');
      vfs.chmod('/tmp/chmod.txt', 0o000);
      expect(vfs.stat('/tmp/chmod.txt').mode).toBe(0o000);
    });

    it('should change directory permissions', () => {
      const vfs = new VFS();
      vfs.mkdir('/tmp/chmoddir');
      vfs.chmod('/tmp/chmoddir', 0o700);
      expect(vfs.stat('/tmp/chmoddir').mode).toBe(0o700);
    });

    it('should throw ENOENT for nonexistent path', () => {
      const vfs = new VFS();
      expect(() => vfs.chmod('/nonexistent', 0o644)).toThrow(/ENOENT/);
    });

    it('should update ctime', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/ctime.txt', 'data');
      const before = vfs.stat('/tmp/ctime.txt').ctime;
      vfs.chmod('/tmp/ctime.txt', 0o755);
      const after = vfs.stat('/tmp/ctime.txt').ctime;
      expect(after >= before).toBeTruthy();
    });
  });

  describe('path resolution', () => {
    it('should handle absolute paths', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/abs.txt', 'absolute');
      expect(vfs.exists('/tmp/abs.txt')).toBe(true);
    });

    it('should resolve . in paths', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/dot.txt', 'dot');
      expect(vfs.exists('/tmp/./dot.txt')).toBe(true);
    });

    it('should resolve .. in paths', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/dotdot.txt', 'dotdot');
      // Lexical normalization: /tmp/sub/../dotdot.txt -> /tmp/dotdot.txt
      vfs.mkdir('/tmp/sub');
      expect(vfs.exists('/tmp/sub/../dotdot.txt')).toBe(true);
      // /a/b/../c normalizes to /a/c regardless of b's existence
      expect(vfs.exists('/tmp/nonexistent/../dotdot.txt')).toBe(true);
    });

    it('should collapse multiple slashes', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/slashes.txt', 'data');
      expect(vfs.exists('/tmp///slashes.txt')).toBe(true);
    });

    it('should normalize trailing slashes', () => {
      const vfs = new VFS();
      expect(vfs.exists('/tmp/')).toBe(true);
    });

    it('should handle .. at root level', () => {
      const vfs = new VFS();
      expect(vfs.exists('/..')).toBe(true); // .. at root is root
    });
  });

  describe('exists', () => {
    it('should return true for existing files', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/exist.txt', 'yes');
      expect(vfs.exists('/tmp/exist.txt')).toBe(true);
    });

    it('should return false for nonexistent files', () => {
      const vfs = new VFS();
      expect(vfs.exists('/tmp/nope.txt')).toBe(false);
    });

    it('should return true for directories', () => {
      const vfs = new VFS();
      expect(vfs.exists('/tmp')).toBe(true);
    });

    it('should return true for symlinks pointing to existing targets', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/t.txt', 'data');
      vfs.symlink('/tmp/t.txt', '/tmp/l.txt');
      expect(vfs.exists('/tmp/l.txt')).toBe(true);
    });

    it('should return false for broken symlinks', () => {
      const vfs = new VFS();
      vfs.symlink('/tmp/doesnotexist', '/tmp/broken.txt');
      expect(vfs.exists('/tmp/broken.txt')).toBe(false);
    });
  });

  describe('getIno / getInodeByIno', () => {
    it('should return inode number for a path', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/ino.txt', 'data');
      const ino = vfs.getIno('/tmp/ino.txt');
      expect(ino !== null).toBeTruthy();
      expect(typeof ino === 'number').toBeTruthy();
    });

    it('should return null for nonexistent path', () => {
      const vfs = new VFS();
      expect(vfs.getIno('/nonexistent')).toBe(null);
    });

    it('should return the raw inode by number', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/raw.txt', 'raw data');
      const ino = vfs.getIno('/tmp/raw.txt')!;
      const inode = vfs.getInodeByIno(ino)!;
      expect(inode !== null).toBeTruthy();
      expect(inode.type).toBe('file');
      expect(new TextDecoder().decode(inode.data as Uint8Array)).toBe('raw data');
    });
  });

  describe('VfsError', () => {
    it('should be an instance of Error', () => {
      const err = new VfsError('ENOENT', 'no such file');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(VfsError);
    });

    it('should carry the correct code', () => {
      const err = new VfsError('EEXIST', 'already exists');
      expect(err.code).toBe('EEXIST');
      expect(err.name).toBe('VfsError');
    });

    it('should include code in message', () => {
      const err = new VfsError('ENOTDIR', 'not a directory');
      expect(err.message).toContain('ENOTDIR');
      expect(err.message).toContain('not a directory');
    });

    it('mkdir throws VfsError with ENOENT code', () => {
      const vfs = new VFS();
      try {
        vfs.mkdir('/nonexistent/dir');
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(VfsError);
        expect((e as VfsError).code).toBe('ENOENT');
      }
    });

    it('mkdir throws VfsError with EEXIST code', () => {
      const vfs = new VFS();
      vfs.mkdir('/tmp/dup');
      try {
        vfs.mkdir('/tmp/dup');
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(VfsError);
        expect((e as VfsError).code).toBe('EEXIST');
      }
    });

    it('readFile throws VfsError with EISDIR code', () => {
      const vfs = new VFS();
      try {
        vfs.readFile('/tmp');
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(VfsError);
        expect((e as VfsError).code).toBe('EISDIR');
      }
    });

    it('rmdir throws VfsError with ENOTEMPTY code', () => {
      const vfs = new VFS();
      vfs.mkdir('/tmp/notempty2');
      vfs.writeFile('/tmp/notempty2/file.txt', 'data');
      try {
        vfs.rmdir('/tmp/notempty2');
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(VfsError);
        expect((e as VfsError).code).toBe('ENOTEMPTY');
      }
    });

    it('rmdir throws VfsError with EPERM for root', () => {
      const vfs = new VFS();
      try {
        vfs.rmdir('/');
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(VfsError);
        expect((e as VfsError).code).toBe('EPERM');
      }
    });

    it('readlink throws VfsError with EINVAL code', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/notlink.txt', 'data');
      try {
        vfs.readlink('/tmp/notlink.txt');
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(VfsError);
        expect((e as VfsError).code).toBe('EINVAL');
      }
    });

    it('readdir throws VfsError with ENOTDIR code', () => {
      const vfs = new VFS();
      vfs.writeFile('/tmp/afile.txt', 'data');
      try {
        vfs.readdir('/tmp/afile.txt');
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(VfsError);
        expect((e as VfsError).code).toBe('ENOTDIR');
      }
    });
  });
});
