/**
 * Tests for permission enforcement helpers.
 *
 * Validates isWriteBlocked() and isPathInCwd() pure functions used
 * by kernel-worker.ts for per-command permission tiers.
 */

import { describe, it, expect } from 'vitest';
import { isWriteBlocked, isPathInCwd } from '../src/permission-check.ts';

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
});
