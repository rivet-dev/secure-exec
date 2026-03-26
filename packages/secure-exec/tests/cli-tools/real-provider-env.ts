import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const DEFAULT_ENV_FILE = path.join(homedir(), 'misc', 'env.txt');

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  const contents = readFileSync(filePath, 'utf8');

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const withoutExport = line.startsWith('export ')
      ? line.slice('export '.length).trim()
      : line;
    const separator = withoutExport.indexOf('=');
    if (separator <= 0) continue;

    const key = withoutExport.slice(0, separator).trim();
    const rawValue = withoutExport.slice(separator + 1).trim();
    if (!key) continue;

    env[key] = stripWrappingQuotes(rawValue);
  }

  return env;
}

export function loadRealProviderEnv(requiredKeys: string[]): {
  env?: Record<string, string>;
  source?: string;
  skipReason?: string;
} {
  const fileEnv = existsSync(DEFAULT_ENV_FILE)
    ? parseEnvFile(DEFAULT_ENV_FILE)
    : {};
  const mergedEnv: Record<string, string> = {};

  for (const key of requiredKeys) {
    const value = process.env[key] ?? fileEnv[key];
    if (typeof value === 'string' && value.length > 0) {
      mergedEnv[key] = value;
    }
  }

  const missingKeys = requiredKeys.filter((key) => !(key in mergedEnv));
  if (missingKeys.length > 0) {
    return {
      skipReason:
        `missing required real-provider credentials: ${missingKeys.join(', ')}`,
    };
  }

  const sources: string[] = [];
  if (requiredKeys.some((key) => typeof process.env[key] === 'string')) {
    sources.push('process.env');
  }
  if (existsSync(DEFAULT_ENV_FILE)) {
    sources.push(DEFAULT_ENV_FILE);
  }

  return {
    env: mergedEnv,
    source: sources.join(' + ') || 'process.env',
  };
}
