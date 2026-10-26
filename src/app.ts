import { Hono } from "hono";
import { requireConfigured } from "./middlewares/configured";
import { notFound, onError } from "./middlewares/error";
import { logger } from "./middlewares/logger";
import { rateLimit } from "./middlewares/rate-limit";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { deviceRoutes } from "./routes/devices";
import { healthRoutes } from "./routes/health";
import { logRoutes } from "./routes/logs";
import type { AppEnv } from "./types";

export const app = new Hono<AppEnv>();

app.use("*", logger);
app.route("/", healthRoutes);

app.use("*", requireConfigured);
app.post("/login", rateLimit("LOGIN_LIMITER"));
app.use("/v1/auth/*", rateLimit("AUTH_LIMITER"));
app.route("/", authRoutes);
app.route("/", deviceRoutes);
app.route("/", logRoutes);
app.route("/", adminRoutes);

app.notFound(notFound);
app.onError(onError);
