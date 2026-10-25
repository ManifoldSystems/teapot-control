import { Hono } from "hono";
import { requireConfigured } from "./middlewares/configured";
import { notFound, onError } from "./middlewares/error";
import { logger } from "./middlewares/logger";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { deviceRoutes } from "./routes/devices";
import { healthRoutes } from "./routes/health";
import type { AppEnv } from "./types";

export const app = new Hono<AppEnv>();

app.use("*", logger);
app.route("/", healthRoutes);

app.use("*", requireConfigured);
app.route("/", authRoutes);
app.route("/", deviceRoutes);
app.route("/", adminRoutes);

app.notFound(notFound);
app.onError(onError);
