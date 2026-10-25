import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { durationMs } from "./respond";

export const jsonOk = (
  c: Context,
  data: unknown,
  started = performance.now(),
  status: ContentfulStatusCode = 200
) =>
  c.json(
    {
      success: true,
      data,
      cached: false,
      duration_ms: durationMs(started),
    },
    status
  );

export const jsonError = (
  c: Context,
  message: string,
  status: ContentfulStatusCode,
  error = "ERROR",
  started = performance.now()
) =>
  c.json(
    {
      success: false,
      message,
      error,
      data: null,
      cached: false,
      duration_ms: durationMs(started),
    },
    status
  );
