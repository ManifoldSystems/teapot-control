import { describe, expect, test } from "bun:test";
import { parseEntries, parseFilter } from "../src/helpers/logs";

const entry = {
  id: "session-1",
  timestamp: 123,
  level: "info" as const,
  source: "agent",
  message: "connected",
};

describe("log boundary validation", () => {
  test("publisher cannot supply stored identity or cursor", () => {
    expect(
      parseEntries({ entries: [{ ...entry, node_id: "victim", cursor: 1 }] })
    ).toEqual([entry]);
  });
  test("rejects malformed and oversized batches", () => {
    for (const body of [
      null,
      {},
      { entries: Array(51).fill(entry) },
      { entries: [{ ...entry, timestamp: NaN }] },
      { entries: [{ ...entry, message: "x".repeat(2049) }] },
      { entries: [{ ...entry, level: "fatal" }] },
    ]) {
      expect(() => parseEntries(body)).toThrow();
    }
  });
  test("filters have strict ids, levels, and safe monotonic cursors", () => {
    expect(
      parseFilter(new URL("https://logs/?device=control&level=warn&after=42"))
    ).toEqual({ device: "control", level: 2, after: 42 });
    for (const query of [
      "device=anything",
      "level=fatal",
      "after=-1",
      "after=NaN",
      "after=",
      "after=9007199254740992",
    ]) {
      expect(() => parseFilter(new URL(`https://logs/?${query}`))).toThrow();
    }
  });
});
