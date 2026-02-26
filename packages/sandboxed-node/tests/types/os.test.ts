import { describe, expectTypeOf, it } from "vitest";
import type * as nodeOs from "os";
import bridgeOs from "../../src/bridge/os.js";

// Type-level assignability: bridge exports → Partial<node:os>
const _moduleCheck: Partial<typeof nodeOs> = bridgeOs;
void _moduleCheck;

describe("os type conformance", () => {
  it("module exports are assignable to Partial<typeof nodeOs>", () => {
    expectTypeOf(bridgeOs).not.toBeAny();
  });
});
