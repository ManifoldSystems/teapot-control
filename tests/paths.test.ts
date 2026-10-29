import { describe, expect, test } from "bun:test";
import { isTailnet, sanitizePaths } from "../src/helpers/paths";

describe("sanitizePaths", () => {
  test("keeps well-formed paths and the optional address", () => {
    expect(
      sanitizePaths(
        [
          {
            peer: "a".repeat(64),
            kind: "direct",
            rtt_ms: 14,
            addr: "1.2.3.4:5",
          },
        ],
        64
      )
    ).toEqual([
      { peer: "a".repeat(64), kind: "direct", rtt_ms: 14, addr: "1.2.3.4:5" },
    ]);
  });

  test("accepts a legacy path with no address", () => {
    expect(
      sanitizePaths([{ peer: "b".repeat(64), kind: "relay", rtt_ms: 30 }], 64)
    ).toEqual([{ peer: "b".repeat(64), kind: "relay", rtt_ms: 30 }]);
  });

  test("drops a bad kind, non-string addr, and oversized addr", () => {
    expect(sanitizePaths([{ peer: "p", kind: "mesh", rtt_ms: 1 }], 64)).toEqual(
      []
    );
    const [onlyPeer] = sanitizePaths(
      [{ peer: "p", kind: "direct", rtt_ms: 1, addr: 42 }],
      64
    );
    expect(onlyPeer).toEqual({ peer: "p", kind: "direct", rtt_ms: 1 });
    const [capped] = sanitizePaths(
      [{ peer: "p", kind: "direct", rtt_ms: 1, addr: "x".repeat(200) }],
      64
    );
    expect(capped.addr).toBeUndefined();
  });

  test("ignores a non-array and caps the count", () => {
    expect(sanitizePaths("nope", 64)).toEqual([]);
    const many = Array.from({ length: 5 }, (_, i) => ({
      peer: String(i),
      kind: "direct" as const,
      rtt_ms: 0,
    }));
    expect(sanitizePaths(many, 2)).toHaveLength(2);
  });
});

describe("isTailnet", () => {
  test("flags the 100.64.0.0/10 CGNAT range", () => {
    expect(isTailnet("100.64.0.1:443")).toBe(true);
    expect(isTailnet("100.127.255.255:1")).toBe(true);
    expect(isTailnet("100.100.1.2")).toBe(true);
  });

  test("leaves public and private addresses alone", () => {
    expect(isTailnet("103.59.160.195:46324")).toBe(false);
    expect(isTailnet("100.63.0.1:1")).toBe(false);
    expect(isTailnet("100.128.0.1:1")).toBe(false);
    expect(isTailnet("10.0.0.1:1")).toBe(false);
    expect(isTailnet("use1-1.relay.iroh.network")).toBe(false);
    expect(isTailnet(null)).toBe(false);
    expect(isTailnet(undefined)).toBe(false);
  });
});
