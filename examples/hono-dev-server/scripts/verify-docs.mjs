import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const docsPath = path.join(repoRoot, "docs/use-cases/dev-servers.mdx");
const examplePath = path.join(repoRoot, "examples/hono-dev-server/src/index.ts");

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

const docsSource = await readFile(docsPath, "utf8");
const match = docsSource.match(/^\s*```ts Hono Dev Server\n([\s\S]*?)^\s*```/m);
if (!match) {
  console.error("Missing docs snippet for Hono Dev Server");
  process.exit(1);
}

const docSource = normalizeCode(match[1] ?? "");
const fileSource = normalizeCode(await readFile(examplePath, "utf8"));

if (docSource !== fileSource) {
  console.error("Snippet mismatch for Hono Dev Server");
  process.exit(1);
}

console.log("Dev server docs match example source.");
