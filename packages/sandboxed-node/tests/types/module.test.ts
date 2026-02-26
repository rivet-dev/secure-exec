import { describe, expectTypeOf, it } from "vitest";
import type * as nodeModule from "module";
import bridgeModule from "../../src/bridge/module.js";
import type { NodePartial } from "./_helpers.js";

// Type-level assignability: bridge exports → NodePartial<node:module>
const _moduleCheck: NodePartial<typeof nodeModule> = bridgeModule;
void _moduleCheck;

describe("module type conformance", () => {
  it("module exports are assignable to NodePartial<typeof nodeModule>", () => {
    expectTypeOf(bridgeModule).not.toBeAny();
  });
});
