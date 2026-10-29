import type { PeerPath } from "../types";

const MAX_ADDR = 128;

/**
 * Keep only well-formed paths from a status message, with a validated optional
 * address. Unknown or oversized `addr` values are dropped, not stored.
 */
export const sanitizePaths = (raw: unknown, max: number): PeerPath[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is PeerPath =>
        typeof p?.peer === "string" &&
        (p.kind === "direct" || p.kind === "relay") &&
        typeof p.rtt_ms === "number"
    )
    .map((p) => {
      const path: PeerPath = { peer: p.peer, kind: p.kind, rtt_ms: p.rtt_ms };
      if (
        typeof p.addr === "string" &&
        p.addr.length > 0 &&
        p.addr.length <= MAX_ADDR
      )
        path.addr = p.addr;
      return path;
    })
    .slice(0, max);
};

/**
 * True when `addr` is a Tailscale CGNAT address (`100.64.0.0/10`). iroh often
 * picks such an address as "direct" because the whole fleet shares a tailnet,
 * so a direct path over the tailnet looks identical to one over a public IP.
 */
export const isTailnet = (addr: string | null | undefined): boolean => {
  if (!addr) return false;
  // Strip an `:port` suffix and any IPv6 brackets to get the bare host.
  const host = addr.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  const m = /^(\d{1,3})\.(\d{1,3})\./.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 100 && b >= 64 && b <= 127;
};
