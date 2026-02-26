import { describe, expectTypeOf, it } from "vitest";
import type * as nodeFs from "fs";
import bridgeFs from "../../src/bridge/fs.js";
import type { NodePartial } from "./_helpers.js";

// Type-level assignability: bridge exports → NodePartial<node:fs>
const _moduleCheck: NodePartial<typeof nodeFs> = bridgeFs;
void _moduleCheck;

describe("fs type conformance", () => {
  it("module exports are assignable to NodePartial<typeof nodeFs>", () => {
    expectTypeOf(bridgeFs).not.toBeAny();
  });

  it("Stats conforms to fs.Stats", () => {
    expectTypeOf<InstanceType<typeof bridgeFs.Stats>>().toMatchTypeOf<nodeFs.Stats>();
  });

  it("Dirent conforms to fs.Dirent", () => {
    expectTypeOf<InstanceType<typeof bridgeFs.Dirent>>().toMatchTypeOf<nodeFs.Dirent>();
  });
});
