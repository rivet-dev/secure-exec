/**
 * Permission enforcement helpers for WasmVM command tiers.
 *
 * Pure functions used by kernel-worker.ts to check whether an operation
 * is allowed under the command's permission tier. Extracted for testability.
 */

import type { PermissionTier } from './syscall-rpc.ts';
import { resolve as resolvePath, normalize } from 'node:path';

/** Check if the tier blocks write operations (file writes, VFS mutations). */
export function isWriteBlocked(tier: PermissionTier): boolean {
  return tier === 'read-only' || tier === 'isolated';
}

/** Check if a path is within the cwd subtree (for isolated tier read restriction). */
export function isPathInCwd(path: string, cwd: string): boolean {
  const normalizedCwd = normalize(cwd).replace(/\/+$/, '');
  const normalizedPath = normalize(resolvePath(cwd, path)).replace(/\/+$/, '');
  return normalizedPath === normalizedCwd || normalizedPath.startsWith(normalizedCwd + '/');
}
