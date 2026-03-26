import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const examplesRoot = path.resolve(__dirname, "..");

const docToExample = new Map([
  ["docs/features/child-processes.mdx", "src/child-processes.ts"],
  ["docs/features/filesystem.mdx", "src/filesystem.ts"],
  ["docs/features/module-loading.mdx", "src/module-loading.ts"],
  ["docs/features/networking.mdx", "src/networking.ts"],
  ["docs/features/output-capture.mdx", "src/output-capture.ts"],
  ["docs/features/permissions.mdx", "src/permissions.ts"],
  ["docs/features/resource-limits.mdx", "src/resource-limits.ts"],
  ["docs/features/typescript.mdx", "src/typescript.ts"],
]);

function normalizeCode(source) {
  const normalized = source.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
  const lines = normalized.split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const minIndent = nonEmptyLines.reduce((indent, line) => {
    const lineIndent = line.match(/^ */)?.[0].length ?? 0;
    return Math.min(indent, lineIndent);
  }, Number.POSITIVE_INFINITY);

  if (!Number.isFinite(minIndent) || minIndent === 0) {
    return normalized;
  }

  return lines.map((line) => line.slice(minIndent)).join("\n");
}

function getFirstTsBlock(source) {
  const match = source.match(/^\s*```ts(?: [^\n]+)?\n([\s\S]*?)^\s*```/m);
  if (!match?.[1]) {
    return null;
  }

  return normalizeCode(match[1]);
}

const mismatches = [];

for (const [docPath, examplePath] of docToExample) {
  const docsSource = await readFile(path.join(repoRoot, docPath), "utf8");
  const exampleSource = await readFile(path.join(examplesRoot, examplePath), "utf8");
  const docBlock = getFirstTsBlock(docsSource);
  const normalizedExample = normalizeCode(exampleSource);

  if (!docBlock) {
    mismatches.push(`Missing TypeScript example in ${docPath}`);
    continue;
  }

  if (docBlock !== normalizedExample) {
    mismatches.push(`Snippet mismatch: ${docPath}`);
  }
}

if (mismatches.length > 0) {
  console.error(mismatches.join("\n"));
  process.exit(1);
}

console.log("Feature docs match example sources.");
