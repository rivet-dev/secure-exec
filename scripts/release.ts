#!/usr/bin/env npx tsx

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const ROOT = join(import.meta.dirname, "..");

// ── Helpers ──

function run(cmd: string, opts?: { cwd?: string; stdio?: "pipe" | "inherit" }) {
  const result = execSync(cmd, {
    cwd: opts?.cwd ?? ROOT,
    stdio: opts?.stdio ?? "pipe",
    encoding: "utf-8",
  });
  // execSync returns null when stdio is "inherit"
  return result?.trim() ?? "";
}

function tryRun(cmd: string, opts?: { cwd?: string; stdio?: "pipe" | "inherit" }): { ok: boolean; output: string } {
  try {
    return { ok: true, output: run(cmd, opts) };
  } catch {
    return { ok: false, output: "" };
  }
}

function fatal(msg: string): never {
  console.error(`\x1b[31mError:\x1b[0m ${msg}`);
  process.exit(1);
}

async function confirm(msg: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${msg} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

function bumpVersion(current: string, type: "patch" | "minor" | "major"): string {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (type) {
    case "patch": return `${major}.${minor}.${patch + 1}`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "major": return `${major + 1}.0.0`;
  }
}

// ── Parse args ──

function parseArgs(): { version: string; tag: "latest" | "rc" } {
  const args = process.argv.slice(2);

  // RC: exact version required
  if (args.includes("--rc")) {
    const idx = args.indexOf("--rc");
    const ver = args[idx + 1];
    if (!ver || ver.startsWith("--")) {
      fatal("--rc requires an exact version (e.g. --rc 0.2.0-rc.1)");
    }
    if (!ver.includes("-")) {
      fatal(`RC version should contain a prerelease identifier (got "${ver}")`);
    }
    return { version: ver, tag: "rc" };
  }

  // Semver bump
  const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  const current = rootPkg.version;

  for (const type of ["patch", "minor", "major"] as const) {
    if (args.includes(`--${type}`)) {
      return { version: bumpVersion(current, type), tag: "latest" };
    }
  }

  fatal("Usage: release --patch | --minor | --major | --rc <version>");
}

// ── Find publishable packages ──

function getPublishablePackages(): string[] {
  const output = run("pnpm -r ls --json --depth -1");
  const packages = JSON.parse(output) as Array<{ name: string; path: string; private?: boolean }>;
  return packages
    .filter((p) => !p.private && p.path !== ROOT)
    .map((p) => p.path);
}

// ── Update version in a package.json ──

function setVersion(pkgPath: string, version: string) {
  const file = join(pkgPath, "package.json");
  const content = readFileSync(file, "utf-8");
  const pkg = JSON.parse(content);
  pkg.version = version;
  // Preserve original formatting (indent detection)
  const indent = content.match(/^(\s+)"/m)?.[1] ?? "  ";
  writeFileSync(file, JSON.stringify(pkg, null, indent) + "\n");
}

// ── Main ──

async function main() {
  const { version, tag } = parseArgs();

  // Git checks
  const branch = run("git branch --show-current");
  if (branch !== "main") {
    fatal(`Must be on main branch (currently on "${branch}")`);
  }

  run("git fetch origin main");
  const local = run("git rev-parse HEAD");
  const remote = run("git rev-parse origin/main");
  if (local !== remote) {
    fatal("Local main is not even with origin/main. Pull or push first.");
  }

  const status = run("git status --porcelain");
  if (status) {
    fatal("Working tree is not clean. Commit or stash changes first.");
  }

  // Find packages
  const packages = getPublishablePackages();
  const pkgNames = packages.map((p) => {
    const pkg = JSON.parse(readFileSync(join(p, "package.json"), "utf-8"));
    return pkg.name as string;
  });

  // Confirmation
  console.log(`\n\x1b[1mRelease Plan\x1b[0m`);
  console.log(`  Version: \x1b[36m${version}\x1b[0m`);
  console.log(`  NPM tag: \x1b[36m${tag}\x1b[0m`);
  console.log(`  Git tag: \x1b[36mv${version}\x1b[0m`);
  console.log(`  Packages (${pkgNames.length}):`);
  for (const name of pkgNames) {
    console.log(`    - ${name}`);
  }
  console.log();

  if (!(await confirm("Proceed?"))) {
    console.log("Aborted.");
    process.exit(0);
  }

  // Bump versions
  console.log(`\n\x1b[1mBumping versions to ${version}...\x1b[0m`);
  setVersion(ROOT, version);
  for (const pkg of packages) {
    setVersion(pkg, version);
  }

  // Commit & push
  console.log("\n\x1b[1mCommitting version bump...\x1b[0m");
  run("git add package.json");
  for (const pkg of packages) {
    run(`git add ${join(pkg, "package.json")}`);
  }
  const staged = run("git diff --cached --name-only");
  if (staged) {
    run(`git commit -m "release: v${version}"`);
    run("git push origin main");
  } else {
    console.log("  No version changes to commit, skipping.");
  }

  // Git tag
  console.log(`\n\x1b[1mCreating git tag v${version}...\x1b[0m`);
  const tagExists = tryRun(`git rev-parse v${version}`).ok;
  if (tagExists) {
    console.log(`  Tag v${version} already exists, skipping.`);
  } else {
    run(`git tag v${version}`);
    run(`git push origin v${version}`);
  }

  // Trigger CI release workflow
  console.log(`\n\x1b[1mTriggering CI release workflow...\x1b[0m`);
  run(`gh workflow run release.yml -f version=${version} -f npm-tag=${tag}`, { stdio: "inherit" });

  console.log(`\n\x1b[32m✓ Tag v${version} pushed — CI will handle publish + GitHub release.\x1b[0m`);
  console.log(`  Watch progress: \x1b[36mhttps://github.com/rivet-dev/secure-exec/actions/workflows/release.yml\x1b[0m`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
