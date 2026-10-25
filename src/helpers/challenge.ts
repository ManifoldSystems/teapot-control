import { hmacHex, safeEqual } from "./crypto";
import { toHex } from "./hex";

/**
 * Stateless challenge: `teapot-auth-v1.<node_id>.<exp>.<nonce>.<mac>`.
 * The MAC proves we issued it, so nothing is stored between the two calls.
 * The device signs the whole string with its iroh secret key.
 */
const PREFIX = "teapot-auth-v1";
export const CHALLENGE_TTL_SECONDS = 60;

export const issueChallenge = async (
  secret: string,
  nodeId: string,
  now = Date.now()
) => {
  const exp = Math.floor(now / 1000) + CHALLENGE_TTL_SECONDS;
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const body = `${PREFIX}.${nodeId}.${exp}.${nonce}`;
  return {
    challenge: `${body}.${await hmacHex(secret, body)}`,
    expires_at: exp,
  };
};

export const checkChallenge = async (
  secret: string,
  nodeId: string,
  challenge: string,
  now = Date.now()
): Promise<string | null> => {
  const parts = challenge.split(".");
  if (parts.length !== 5) return "malformed challenge";
  const [prefix, id, exp, , mac] = parts;
  if (prefix !== PREFIX) return "malformed challenge";
  const body = parts.slice(0, 4).join(".");
  if (!safeEqual(mac, await hmacHex(secret, body))) return "unknown challenge";
  if (id !== nodeId) return "challenge issued for another node";
  if (Number(exp) < Math.floor(now / 1000)) return "challenge expired";
  return null;
};
