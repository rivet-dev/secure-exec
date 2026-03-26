import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const docsPath = path.join(repoRoot, "docs/use-cases/code-mode.mdx");

const docsSource = await readFile(docsPath, "utf8");

// Verify the docs page links to the example
if (!docsSource.includes("examples/code-mode")) {
  console.error("Code Mode docs missing link to example");
  process.exit(1);
}

console.log("Code Mode docs verified.");
