import { describe, expectTypeOf, it } from "vitest";
import type * as nodeChildProcess from "child_process";
import bridgeChildProcess from "../../src/bridge/child-process.js";
import type { NodePartial } from "./_helpers.js";

// Type-level assignability: bridge exports → NodePartial<node:child_process>
const _moduleCheck: NodePartial<typeof nodeChildProcess> = bridgeChildProcess;
void _moduleCheck;

describe("child_process type conformance", () => {
  it("module exports are assignable to NodePartial<typeof nodeChildProcess>", () => {
    expectTypeOf(bridgeChildProcess).not.toBeAny();
  });
});
