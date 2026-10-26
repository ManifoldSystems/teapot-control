import type { Bindings } from "../types";
import { isNodeId } from "./hex";

export const levels = ["debug", "info", "warn", "error"] as const;
export type LogEntry = {
  id: string;
  timestamp: number;
  level: (typeof levels)[number];
  source: string;
  message: string;
};
export type StoredLog = LogEntry & {
  cursor: number;
  node_id: string;
  received_at: number;
};
export type LogFilter = { device: string; level: number; after: number | null };

export function parseEntries(body: unknown): LogEntry[] {
  const entries = (body as { entries?: unknown })?.entries;
  if (!Array.isArray(entries) || entries.length > 50)
    throw new Error("Expected up to 50 entries");
  return entries.map((e) => {
    if (
      !e ||
      typeof e.id !== "string" ||
      !/^[\w.:-]{1,96}$/.test(e.id) ||
      !Number.isSafeInteger(e.timestamp) ||
      e.timestamp < 0 ||
      e.timestamp > 8640000000000000 ||
      !levels.includes(e.level) ||
      typeof e.source !== "string" ||
      e.source.length > 128 ||
      typeof e.message !== "string" ||
      e.message.length > 2048
    )
      throw new Error("Invalid log entry");
    return {
      id: e.id,
      timestamp: e.timestamp,
      level: e.level,
      source: e.source,
      message: e.message,
    };
  });
}

export function parseFilter(url: URL): LogFilter {
  const device = url.searchParams.get("device") || "";
  const level = levels.indexOf(
    (url.searchParams.get("level") || "debug") as LogEntry["level"]
  );
  const raw = url.searchParams.get("after");
  const after = raw === null ? null : Number(raw);
  if (
    (device && device !== "control" && !isNodeId(device)) ||
    level < 0 ||
    (after !== null &&
      (!/^\d+$/.test(raw ?? "") || !Number.isSafeInteger(after)))
  )
    throw new Error("Invalid log filter");
  return { device, level, after };
}

export function logsStub(env: Bindings) {
  return env.LOGS.get(env.LOGS.idFromName("global"));
}

export async function controlLog(
  env: Bindings,
  source: string,
  message: string,
  level: LogEntry["level"] = "info"
) {
  const entry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    level,
    source,
    message: message.slice(0, 2048),
  };
  console.log(JSON.stringify({ node_id: "control", ...entry }));
  const response = await logsStub(env).fetch("https://logs/append", {
    method: "POST",
    headers: { "x-teapot-node": "control" },
    body: JSON.stringify({ entries: [entry] }),
  });
  if (!response.ok)
    console.error("Could not store control log", response.status);
}
