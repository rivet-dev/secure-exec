import { describe, expectTypeOf, it } from "vitest";
import type * as nodeHttp from "http";
import type * as nodeDns from "dns";
import { http, dns } from "../../src/bridge/network.js";
import type { NodePartial } from "./_helpers.js";

// Type-level assignability
const _httpCheck: NodePartial<typeof nodeHttp> = http;
void _httpCheck;
const _dnsCheck: NodePartial<typeof nodeDns> = dns;
void _dnsCheck;

describe("network type conformance", () => {
  it("http exports are assignable to NodePartial<typeof nodeHttp>", () => {
    expectTypeOf(http).not.toBeAny();
  });

  it("dns exports are assignable to NodePartial<typeof nodeDns>", () => {
    expectTypeOf(dns).not.toBeAny();
  });
});
