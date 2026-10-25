import type { Bindings, OnlineDevice } from "../types";

/** Single-tenant: one Presence object holds every device socket. */
export const presenceStub = (env: Bindings) =>
  env.PRESENCE.get(env.PRESENCE.idFromName("global"));

export const fetchOnline = async (env: Bindings): Promise<OnlineDevice[]> => {
  const res = await presenceStub(env).fetch("https://presence/online");
  return res.json();
};

/** Tells connected devices to refetch peers/allowlist. */
export const broadcastPeersChanged = (env: Bindings) =>
  presenceStub(env).fetch("https://presence/broadcast", {
    method: "POST",
    body: JSON.stringify({ type: "peers_changed" }),
  });
