import { fromHex, toHex } from "./hex";

const encoder = new TextEncoder();

const hmacKey = (secret: string) =>
  crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

export const hmacHex = async (secret: string, message: string) =>
  toHex(
    await crypto.subtle.sign(
      "HMAC",
      await hmacKey(secret),
      encoder.encode(message)
    )
  );

/** Length-independent comparison for secrets and MACs. */
export const safeEqual = (a: string, b: string) => {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
};

/** Verifies an Ed25519 signature made with the iroh secret key behind nodeId. */
export const verifyEd25519 = async (
  nodeId: string,
  message: string,
  signatureHex: string
) => {
  const publicKey = fromHex(nodeId);
  const signature = fromHex(signatureHex);
  if (publicKey?.length !== 32 || signature?.length !== 64) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      publicKey,
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      signature,
      encoder.encode(message)
    );
  } catch {
    return false;
  }
};
