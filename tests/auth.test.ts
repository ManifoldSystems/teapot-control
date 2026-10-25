import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { checkChallenge, issueChallenge } from "../src/helpers/challenge";
import { verifyEd25519 } from "../src/helpers/crypto";
import { fromHex, isNodeId, toHex } from "../src/helpers/hex";

const SECRET = "s".repeat(32);

/** A device key the way iroh has it: raw 32-byte public key as hex. */
const device = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  const nodeId = toHex(der.subarray(der.length - 32));
  return {
    nodeId,
    sign: (msg: string) => toHex(sign(null, Buffer.from(msg), privateKey)),
  };
};

describe("hex", () => {
  test("roundtrip", () => {
    const bytes = new Uint8Array([0, 1, 254, 255]);
    expect(toHex(bytes)).toBe("0001feff");
    expect(fromHex("0001feff")).toEqual(bytes);
  });
  test("node id shape", () => {
    expect(isNodeId("a".repeat(64))).toBe(true);
    expect(isNodeId("A".repeat(64))).toBe(false);
    expect(isNodeId("a".repeat(63))).toBe(false);
  });
});

describe("challenge", () => {
  test("accepts what it issued", async () => {
    const { nodeId } = device();
    const { challenge } = await issueChallenge(SECRET, nodeId);
    expect(await checkChallenge(SECRET, nodeId, challenge)).toBeNull();
  });

  test("rejects another node, tampering, expiry, other secret", async () => {
    const a = device();
    const b = device();
    const { challenge } = await issueChallenge(SECRET, a.nodeId);
    expect(await checkChallenge(SECRET, b.nodeId, challenge)).toBe(
      "challenge issued for another node"
    );
    expect(
      await checkChallenge(
        SECRET,
        a.nodeId,
        challenge.replace(a.nodeId, b.nodeId)
      )
    ).toBe("unknown challenge");
    expect(await checkChallenge("x".repeat(32), a.nodeId, challenge)).toBe(
      "unknown challenge"
    );
    expect(
      await checkChallenge(SECRET, a.nodeId, challenge, Date.now() + 120_000)
    ).toBe("challenge expired");
  });
});

describe("ed25519", () => {
  test("verifies a signature from the node key", async () => {
    const d = device();
    expect(await verifyEd25519(d.nodeId, "hello", d.sign("hello"))).toBe(true);
  });

  test("rejects wrong key, wrong message, garbage", async () => {
    const a = device();
    const b = device();
    expect(await verifyEd25519(b.nodeId, "hello", a.sign("hello"))).toBe(false);
    expect(await verifyEd25519(a.nodeId, "bye", a.sign("hello"))).toBe(false);
    expect(await verifyEd25519(a.nodeId, "hello", "zz")).toBe(false);
  });
});
