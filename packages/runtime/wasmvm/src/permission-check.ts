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

/** Check if the tier blocks subprocess spawning. Only 'full' allows proc_spawn. */
export function isSpawnBlocked(tier: PermissionTier): boolean {
  return tier !== 'full';
}

/** Check if a path is within the cwd subtree (for isolated tier read restriction). */
export function isPathInCwd(path: string, cwd: string): boolean {
  const normalizedCwd = normalize(cwd).replace(/\/+$/, '');
  const normalizedPath = normalize(resolvePath(cwd, path)).replace(/\/+$/, '');
  return normalizedPath === normalizedCwd || normalizedPath.startsWith(normalizedCwd + '/');
}

/**
 * Resolve the permission tier for a command against a permissions config.
 * Priority: exact name match > longest glob pattern > '*' fallback > defaults > 'read-write'.
 *
 * When `defaults` is provided, it is only consulted if `permissions` has no match
 * (including no '*' catch-all). This ensures user-provided patterns (including '*')
 * always take priority over built-in default tiers.
 */
export function resolvePermissionTier(
  command: string,
  permissions: Record<string, PermissionTier>,
  defaults?: Readonly<Record<string, PermissionTier>>,
): PermissionTier {
  // Exact match first
  if (command in permissions) return permissions[command];

  // Find longest matching glob pattern (excluding '*' catch-all)
  let bestPattern: string | null = null;
  let bestLength = 0;

  for (const pattern of Object.keys(permissions)) {
    if (pattern === '*' || !pattern.includes('*')) continue;
    if (globMatch(pattern, command) && pattern.length > bestLength) {
      bestPattern = pattern;
      bestLength = pattern.length;
    }
  }

  if (bestPattern !== null) return permissions[bestPattern];

  // '*' catch-all fallback
  if ('*' in permissions) return permissions['*'];

  // Defaults layer — only consulted when permissions has no match
  if (defaults && command in defaults) return defaults[command];

  return 'read-write';
}

/** Simple glob matching: '*' matches any sequence of characters. */
function globMatch(pattern: string, str: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('^' + escaped.replace(/\*/g, '.*') + '$');
  return regex.test(str);
}
