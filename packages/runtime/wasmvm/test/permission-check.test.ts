/**
 * Tests for permission enforcement helpers.
 *
 * Validates isWriteBlocked(), isSpawnBlocked(), isPathInCwd(), and
 * resolvePermissionTier() pure functions used by kernel-worker.ts
 * and the driver for per-command permission tiers.
 */

import { describe, it, expect } from 'vitest';
import { isWriteBlocked, isSpawnBlocked, isNetworkBlocked, isPathInCwd, resolvePermissionTier, validatePermissionTier } from '../src/permission-check.ts';

describe('isWriteBlocked', () => {
  it('full tier allows writes', () => {
    expect(isWriteBlocked('full')).toBe(false);
  });

  it('read-write tier allows writes', () => {
    expect(isWriteBlocked('read-write')).toBe(false);
  });

  it('read-only tier blocks writes', () => {
    expect(isWriteBlocked('read-only')).toBe(true);
  });

  it('isolated tier blocks writes', () => {
    expect(isWriteBlocked('isolated')).toBe(true);
  });
});

describe('isPathInCwd', () => {
  it('path equal to cwd is allowed', () => {
    expect(isPathInCwd('/home/user/project', '/home/user/project')).toBe(true);
  });

  it('path inside cwd is allowed', () => {
    expect(isPathInCwd('/home/user/project/src/file.ts', '/home/user/project')).toBe(true);
  });

  it('nested subdirectory is allowed', () => {
    expect(isPathInCwd('/home/user/project/src/deep/nested/file', '/home/user/project')).toBe(true);
  });

  it('path outside cwd is blocked', () => {
    expect(isPathInCwd('/home/user/other/file', '/home/user/project')).toBe(false);
  });

  it('parent directory is blocked', () => {
    expect(isPathInCwd('/home/user', '/home/user/project')).toBe(false);
  });

  it('sibling directory is blocked', () => {
    expect(isPathInCwd('/home/user/project2/file', '/home/user/project')).toBe(false);
  });

  it('root path is blocked when cwd is not root', () => {
    expect(isPathInCwd('/', '/home/user/project')).toBe(false);
  });

  it('handles relative paths resolved against cwd', () => {
    expect(isPathInCwd('src/file.ts', '/home/user/project')).toBe(true);
  });

  it('blocks path traversal with ..', () => {
    expect(isPathInCwd('/home/user/project/../other/file', '/home/user/project')).toBe(false);
  });

  it('allows .. that stays within cwd', () => {
    expect(isPathInCwd('/home/user/project/src/../lib/file', '/home/user/project')).toBe(true);
  });

  it('handles cwd with trailing slash', () => {
    expect(isPathInCwd('/home/user/project/file', '/home/user/project/')).toBe(true);
  });

  it('handles root cwd', () => {
    expect(isPathInCwd('/any/path', '/')).toBe(true);
  });

  it('blocks prefix collision (projectX vs project)', () => {
    expect(isPathInCwd('/home/user/projectX/file', '/home/user/project')).toBe(false);
  });

  describe('with resolveRealPath (symlink resolution)', () => {
    it('blocks symlink inside cwd pointing outside cwd', () => {
      // /cwd/link-to-etc -> /etc (symlink)
      const resolver = (p: string) => {
        if (p === '/home/user/project/link-to-etc') return '/etc';
        if (p.startsWith('/home/user/project/link-to-etc/')) {
          return '/etc' + p.slice('/home/user/project/link-to-etc'.length);
        }
        return p;
      };
      expect(isPathInCwd('/home/user/project/link-to-etc/passwd', '/home/user/project', resolver)).toBe(false);
    });

    it('blocks symlink chain escaping cwd', () => {
      const resolver = (p: string) => {
        if (p === '/home/user/project/a') return '/home/user/project/b';
        if (p === '/home/user/project/b') return '/tmp/escape';
        if (p.startsWith('/home/user/project/a/')) return '/tmp/escape' + p.slice('/home/user/project/a'.length);
        return p;
      };
      expect(isPathInCwd('/home/user/project/a/secret', '/home/user/project', resolver)).toBe(false);
    });

    it('allows symlink inside cwd pointing to another location inside cwd', () => {
      const resolver = (p: string) => {
        if (p === '/home/user/project/link') return '/home/user/project/src';
        if (p.startsWith('/home/user/project/link/')) {
          return '/home/user/project/src' + p.slice('/home/user/project/link'.length);
        }
        return p;
      };
      expect(isPathInCwd('/home/user/project/link/file.ts', '/home/user/project', resolver)).toBe(true);
    });

    it('allows non-symlink path with resolver', () => {
      const resolver = (p: string) => p; // identity — no symlinks
      expect(isPathInCwd('/home/user/project/src/file.ts', '/home/user/project', resolver)).toBe(true);
    });

    it('blocks resolved path outside cwd even with .. traversal', () => {
      const resolver = (p: string) => {
        if (p === '/home/user/project/link') return '/home/user/other';
        return p;
      };
      expect(isPathInCwd('/home/user/project/link', '/home/user/project', resolver)).toBe(false);
    });
  });
});

describe('isSpawnBlocked', () => {
  it('full tier allows spawning', () => {
    expect(isSpawnBlocked('full')).toBe(false);
  });

  it('read-write tier blocks spawning', () => {
    expect(isSpawnBlocked('read-write')).toBe(true);
  });

  it('read-only tier blocks spawning', () => {
    expect(isSpawnBlocked('read-only')).toBe(true);
  });

  it('isolated tier blocks spawning', () => {
    expect(isSpawnBlocked('isolated')).toBe(true);
  });
});

describe('isNetworkBlocked', () => {
  it('full tier allows network', () => {
    expect(isNetworkBlocked('full')).toBe(false);
  });

  it('read-write tier blocks network', () => {
    expect(isNetworkBlocked('read-write')).toBe(true);
  });

  it('read-only tier blocks network', () => {
    expect(isNetworkBlocked('read-only')).toBe(true);
  });

  it('isolated tier blocks network', () => {
    expect(isNetworkBlocked('isolated')).toBe(true);
  });
});

describe('resolvePermissionTier', () => {
  it('exact name match takes highest priority', () => {
    const perms = { 'sh': 'full' as const, '*': 'isolated' as const };
    expect(resolvePermissionTier('sh', perms)).toBe('full');
  });

  it('falls back to * when no match', () => {
    const perms = { 'sh': 'full' as const, '*': 'isolated' as const };
    expect(resolvePermissionTier('unknown', perms)).toBe('isolated');
  });

  it('defaults to read-write when no match and no *', () => {
    const perms = { 'sh': 'full' as const };
    expect(resolvePermissionTier('unknown', perms)).toBe('read-write');
  });

  it('wildcard pattern _untrusted/* matches directory prefix', () => {
    const perms = {
      'sh': 'full' as const,
      '_untrusted/*': 'isolated' as const,
      '*': 'read-write' as const,
    };
    expect(resolvePermissionTier('_untrusted/evil-cmd', perms)).toBe('isolated');
    expect(resolvePermissionTier('_untrusted/another', perms)).toBe('isolated');
  });

  it('wildcard pattern does not match non-matching commands', () => {
    const perms = {
      '_untrusted/*': 'isolated' as const,
      '*': 'read-write' as const,
    };
    expect(resolvePermissionTier('grep', perms)).toBe('read-write');
    expect(resolvePermissionTier('untrusted-cmd', perms)).toBe('read-write');
  });

  it('exact match takes precedence over wildcard pattern', () => {
    const perms = {
      '_untrusted/special': 'full' as const,
      '_untrusted/*': 'isolated' as const,
      '*': 'read-write' as const,
    };
    expect(resolvePermissionTier('_untrusted/special', perms)).toBe('full');
    expect(resolvePermissionTier('_untrusted/other', perms)).toBe('isolated');
  });

  it('longest glob pattern wins over shorter one', () => {
    const perms = {
      'vendor/*': 'read-write' as const,
      'vendor/untrusted/*': 'isolated' as const,
      '*': 'full' as const,
    };
    expect(resolvePermissionTier('vendor/untrusted/cmd', perms)).toBe('isolated');
    expect(resolvePermissionTier('vendor/trusted-cmd', perms)).toBe('read-write');
  });

  it('empty permissions config defaults to read-write', () => {
    expect(resolvePermissionTier('anything', {})).toBe('read-write');
  });

  it('all four tiers are accepted', () => {
    const perms = {
      'a': 'full' as const,
      'b': 'read-write' as const,
      'c': 'read-only' as const,
      'd': 'isolated' as const,
    };
    expect(resolvePermissionTier('a', perms)).toBe('full');
    expect(resolvePermissionTier('b', perms)).toBe('read-write');
    expect(resolvePermissionTier('c', perms)).toBe('read-only');
    expect(resolvePermissionTier('d', perms)).toBe('isolated');
  });

  it('defaults layer is consulted when permissions has no match', () => {
    const perms = { 'sh': 'full' as const };
    const defaults = { 'grep': 'read-only' as const, 'ls': 'read-only' as const };
    expect(resolvePermissionTier('grep', perms, defaults)).toBe('read-only');
    expect(resolvePermissionTier('ls', perms, defaults)).toBe('read-only');
    expect(resolvePermissionTier('sh', perms, defaults)).toBe('full');
    expect(resolvePermissionTier('unknown', perms, defaults)).toBe('read-write');
  });

  it('user * catch-all takes priority over defaults', () => {
    const perms = { '*': 'full' as const };
    const defaults = { 'grep': 'read-only' as const };
    // User's '*' catches everything before defaults are consulted
    expect(resolvePermissionTier('grep', perms, defaults)).toBe('full');
    expect(resolvePermissionTier('anything', perms, defaults)).toBe('full');
  });

  it('user exact match takes priority over defaults', () => {
    const perms = { 'grep': 'full' as const };
    const defaults = { 'grep': 'read-only' as const };
    expect(resolvePermissionTier('grep', perms, defaults)).toBe('full');
  });

  it('user glob pattern takes priority over defaults', () => {
    const perms = { 'vendor/*': 'isolated' as const };
    const defaults = { 'vendor/trusted': 'full' as const };
    // User glob matches before defaults are consulted
    expect(resolvePermissionTier('vendor/trusted', perms, defaults)).toBe('isolated');
  });
});

describe('validatePermissionTier', () => {
  it('accepts all four valid tiers', () => {
    expect(validatePermissionTier('full')).toBe('full');
    expect(validatePermissionTier('read-write')).toBe('read-write');
    expect(validatePermissionTier('read-only')).toBe('read-only');
    expect(validatePermissionTier('isolated')).toBe('isolated');
  });

  it('unknown tier string defaults to isolated', () => {
    expect(validatePermissionTier('admin')).toBe('isolated');
  });

  it('empty string defaults to isolated', () => {
    expect(validatePermissionTier('')).toBe('isolated');
  });

  it('similar-but-wrong strings default to isolated', () => {
    expect(validatePermissionTier('Full')).toBe('isolated');
    expect(validatePermissionTier('readwrite')).toBe('isolated');
    expect(validatePermissionTier('read_only')).toBe('isolated');
    expect(validatePermissionTier('ISOLATED')).toBe('isolated');
  });

  it('unknown tier blocks writes (isolated behavior)', () => {
    const tier = validatePermissionTier('admin');
    expect(isWriteBlocked(tier)).toBe(true);
  });

  it('unknown tier blocks spawns (isolated behavior)', () => {
    const tier = validatePermissionTier('admin');
    expect(isSpawnBlocked(tier)).toBe(true);
  });
});
