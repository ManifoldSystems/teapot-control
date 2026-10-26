import { app } from "./app";

export { Logs } from "./logs";
export { Presence } from "./presence";
export { app };

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<CloudflareBindings>;
