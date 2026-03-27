import {
  NodeRuntime,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
} from "secure-exec";
import { createTypeScriptTools } from "@secure-exec/typescript";

const systemDriver = createNodeDriver();
const runtimeDriverFactory = createNodeRuntimeDriverFactory();

const runtime = new NodeRuntime({
  systemDriver,
  runtimeDriverFactory,
});
const ts = createTypeScriptTools({
  systemDriver,
  runtimeDriverFactory,
});

const sourceText = `
  export const message: string = "hello from typescript";
`;

const typecheck = await ts.typecheckSource({
  sourceText,
  filePath: "/root/example.ts",
  compilerOptions: {
    module: "esnext",
    target: "es2022",
  },
});

if (!typecheck.success) {
  throw new Error(typecheck.diagnostics.map((d) => d.message).join("\n"));
}

const compiled = await ts.compileSource({
  sourceText,
  filePath: "/root/example.ts",
  compilerOptions: {
    module: "esnext",
    target: "es2022",
  },
});

const result = await runtime.run<{ message: string }>(
  compiled.outputText ?? "",
  "/root/example.mjs"
);

const message = result.exports?.message;
// "hello from typescript"
