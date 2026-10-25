export const durationMs = (started: number) =>
  Math.round((performance.now() - started) * 100) / 100;
