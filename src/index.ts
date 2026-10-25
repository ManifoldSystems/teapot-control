import { app } from "./app";

export { Presence } from "./presence";
export { app };

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<CloudflareBindings>;
