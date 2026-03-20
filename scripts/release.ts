#!/usr/bin/env npx tsx

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
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
  // Strip prerelease suffix (e.g. "0.1.0-rc.4" → "0.1.0")
  const base = current.replace(/-.*$/, "");
  const [major, minor, patch] = base.split(".").map(Number);
  switch (type) {
    case "patch": return `${major}.${minor}.${patch + 1}`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "major": return `${major + 1}.0.0`;
  }
}

// ── Parse args ──

function npmTag(version: string): "latest" | "rc" {
  return version.includes("-") ? "rc" : "latest";
}

function parseArgs(): { version: string; tag: "latest" | "rc"; noGitChecks: boolean } {
  const args = process.argv.slice(2);
  const noGitChecks = args.includes("--no-git-checks");

  // Exact version: --version 0.1.0 or --version 0.2.0-rc.1
  if (args.includes("--version")) {
    const idx = args.indexOf("--version");
    const ver = args[idx + 1];
    if (!ver || ver.startsWith("--")) {
      fatal("--version requires an exact version (e.g. --version 0.1.0 or --version 0.2.0-rc.1)");
    }
    if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(ver)) {
      fatal(`Invalid version format: "${ver}"`);
    }
    return { version: ver, tag: npmTag(ver), noGitChecks };
  }

  // Semver bump
  const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  const current = rootPkg.version;

  for (const type of ["patch", "minor", "major"] as const) {
    if (args.includes(`--${type}`)) {
      return { version: bumpVersion(current, type), tag: "latest", noGitChecks };
    }
  }

  fatal("Usage: release --patch | --minor | --major | --version <version>");
}

// ── Find publishable packages ──

function getPublishablePackages(): string[] {
  const output = run("pnpm -r ls --json --depth -1");
  const packages = JSON.parse(output) as Array<{ name: string; path: string; private?: boolean }>;
  const paths = packages
    .filter((p) => !p.private && p.path !== ROOT)
    .map((p) => p.path);

  // Include v8 platform packages (not in pnpm workspace)
  const platformDir = join(ROOT, "crates/v8-runtime/npm");
  if (existsSync(platformDir)) {
    for (const entry of readdirSync(platformDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const pkgJsonPath = join(platformDir, entry.name, "package.json");
        if (existsSync(pkgJsonPath)) {
          paths.push(join(platformDir, entry.name));
        }
      }
    }
  }

  return paths;
}

// ── Update version in a package.json ──

function setVersion(pkgPath: string, version: string) {
  const file = join(pkgPath, "package.json");
  const content = readFileSync(file, "utf-8");
  const pkg = JSON.parse(content);
  pkg.version = version;

  // Sync optionalDependencies versions for platform packages
  if (pkg.optionalDependencies) {
    for (const dep of Object.keys(pkg.optionalDependencies)) {
      if (dep.startsWith("@secure-exec/v8-")) {
        pkg.optionalDependencies[dep] = version;
      }
    }
  }

  // Preserve original formatting (indent detection)
  const indent = content.match(/^(\s+)"/m)?.[1] ?? "  ";
  writeFileSync(file, JSON.stringify(pkg, null, indent) + "\n");
}

// ── Main ──

async function main() {
  const { version, tag, noGitChecks } = parseArgs();
  const branch = run("git branch --show-current");

  if (!noGitChecks) {
    // Git checks
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
  } else {
    console.log("\x1b[33m⚠ Skipping git checks (--no-git-checks)\x1b[0m");
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
  run("git add -A");
  const staged = run("git diff --cached --name-only");
  if (staged) {
    run(`git commit -m "release: v${version}"`);
    run(`git push origin ${branch}`);
  } else {
    console.log("  No changes to commit, skipping.");
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

  console.log(`\n\x1b[32m✓ Tag v${version} pushed — CI will handle Docker build + publish.\x1b[0m`);
  console.log(`  Watch progress: \x1b[36mhttps://github.com/rivet-dev/secure-exec/actions/workflows/release.yml\x1b[0m`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
