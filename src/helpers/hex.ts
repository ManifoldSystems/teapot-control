export const NODE_ID_RE = /^[0-9a-f]{64}$/;

export const isNodeId = (value: unknown): value is string =>
  typeof value === "string" && NODE_ID_RE.test(value);

export const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");

export const fromHex = (hex: string): Uint8Array | null => {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};
