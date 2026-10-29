import type { Bindings, OnlineDevice, StoredPath } from "../types";

/** A deploy gets a fresh object even while the previous one has busy sockets. */
export const presenceStub = (
  env: Bindings,
  generation = env.PRESENCE_GENERATION || "global"
) => env.PRESENCE.get(env.PRESENCE.idFromName(generation));

export const presenceState = async (env: Bindings) => {
  const generation = env.PRESENCE_GENERATION || "global";
  const previous = env.PREVIOUS_PRESENCE_GENERATION || null;
  let remaining = 0;
  if (previous && previous !== generation) {
    const res = await presenceStub(env, previous).fetch(
      "https://presence/online"
    );
    if (!res.ok) throw new Error("previous presence unavailable");
    remaining = ((await res.json()) as OnlineDevice[]).length;
  }
  return {
    control_version: env.WORKER_VERSION?.id ?? "local",
    generation,
    previous,
    remaining,
  };
};

export const retirePresence = async (env: Bindings) => {
  const state = await presenceState(env);
  if (state.previous && state.previous !== state.generation) {
    const stub = presenceStub(env, state.previous);
    const res = await stub.fetch("https://presence/online");
    if (!res.ok) throw new Error("previous presence unavailable");
    for (const device of (await res.json()) as OnlineDevice[]) {
      const kicked = await stub.fetch("https://presence/kick", {
        method: "POST",
        body: device.node_id,
      });
      if (!kicked.ok) throw new Error("presence retirement failed");
    }
  }
  return presenceState(env);
};

export const fetchOnline = async (env: Bindings): Promise<OnlineDevice[]> => {
  const res = await presenceStub(env).fetch("https://presence/online");
  return res.json();
};

/** The last path per (device, peer), kept across reconnects, grouped by device. */
export const fetchLastPaths = async (
  env: Bindings
): Promise<Record<string, StoredPath[]>> => {
  const res = await presenceStub(env).fetch("https://presence/lastpaths");
  return res.json();
};

/** Tells connected devices to refetch peers/allowlist. */
export const broadcastPeersChanged = (env: Bindings) =>
  presenceStub(env).fetch("https://presence/broadcast", {
    method: "POST",
    body: JSON.stringify({ type: "peers_changed" }),
  });
