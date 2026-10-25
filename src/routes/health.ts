import { Hono } from "hono";
import { durationMs } from "../helpers/respond";
import type { AppEnv } from "../types";

export const healthRoutes = new Hono<AppEnv>().get("/health", async (c) => {
  const started = performance.now();
  let d1: "ok" | "error" = "ok";
  try {
    await c.env.DB.prepare("SELECT 1").first();
  } catch {
    d1 = "error";
  }
  return c.json({
    status: d1 === "ok" ? "ok" : "degraded",
    service: "teapot-control",
    version: "0.1.0",
    d1,
    duration_ms: durationMs(started),
  });
});
