import { describe, expectTypeOf, it } from "vitest";
import type * as nodeProcess from "process";
import bridgeProcess from "../../src/bridge/process.js";

// Type-level assignability: bridge exports → Partial<node:process>
const _moduleCheck: Partial<typeof nodeProcess> = bridgeProcess;
void _moduleCheck;

describe("process type conformance", () => {
  it("module exports are assignable to Partial<typeof nodeProcess>", () => {
    expectTypeOf(bridgeProcess).not.toBeAny();
  });
});
