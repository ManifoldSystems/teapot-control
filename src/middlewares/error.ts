import type { ErrorHandler, NotFoundHandler } from "hono";
import { jsonError } from "../helpers/json";
import type { AppEnv } from "../types";

export const notFound: NotFoundHandler<AppEnv> = (c) =>
  jsonError(c, "not found", 404, "NOT_FOUND");

export const onError: ErrorHandler<AppEnv> = (error, c) => {
  console.error("[ERROR]", error);
  return jsonError(
    c,
    error instanceof Error ? error.message : "internal error",
    500,
    "INTERNAL_ERROR"
  );
};
