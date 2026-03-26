import {
  NodeRuntime,
  allowAllFs,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
} from "../../../packages/secure-exec/src/index.ts";
import { createTypeScriptTools } from "../../../packages/typescript/src/index.ts";

const sourceText = `
  export const message: string = "hello from typescript";
`;

const systemDriver = createNodeDriver();
const runtimeDriverFactory = createNodeRuntimeDriverFactory();
const compilerSystemDriver = createNodeDriver({
  moduleAccess: {
    cwd: process.cwd(),
  },
  permissions: { ...allowAllFs },
});

const runtime = new NodeRuntime({
  systemDriver,
  runtimeDriverFactory,
});

const ts = createTypeScriptTools({
  systemDriver: compilerSystemDriver,
  runtimeDriverFactory,
  compilerSpecifier: "/root/node_modules/typescript/lib/typescript.js",
});

try {
  const typecheck = await ts.typecheckSource({
    sourceText,
    filePath: "/root/example.ts",
    compilerOptions: {
      module: "commonjs",
      target: "es2022",
    },
  });

  if (!typecheck.success) {
    throw new Error(typecheck.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }

  const compiled = await ts.compileSource({
    sourceText,
    filePath: "/root/example.ts",
    compilerOptions: {
      module: "commonjs",
      target: "es2022",
    },
  });

  if (!compiled.success || !compiled.outputText) {
    throw new Error(compiled.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }

  const result = await runtime.run<{ message: string }>(compiled.outputText, "/root/example.js");
  const message = result.exports?.message;

  if (result.code !== 0 || message !== "hello from typescript") {
    throw new Error(`Unexpected runtime result: ${JSON.stringify(result)}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      message,
      summary: "sandbox typechecked, compiled, and ran a TypeScript snippet",
    }),
  );
} finally {
  runtime.dispose();
}
