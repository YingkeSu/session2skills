import { describe, expect, it } from "vitest";

import { tokenizeJson } from "./json-highlight.js";

describe("tokenizeJson", () => {
  it("tokenizes an empty object", () => {
    const tokens = tokenizeJson("{}");
    expect(tokens.map((t) => t.type)).toEqual(["punct", "punct"]);
    expect(tokens.map((t) => t.value)).toEqual(["{", "}"]);
  });

  it("classifies quoted strings followed by ':' as keys", () => {
    const tokens = tokenizeJson('{"a": 1}');
    expect(tokens).toContainEqual({ type: "key", value: '"a"' });
    expect(tokens).toContainEqual({ type: "number", value: "1" });
  });

  it("classifies quoted strings not followed by ':' as strings", () => {
    const tokens = tokenizeJson('["hello"]');
    expect(tokens).toContainEqual({ type: "string", value: '"hello"' });
  });

  it("handles escaped quotes inside strings", () => {
    const tokens = tokenizeJson('"a\\"b"');
    expect(tokens).toContainEqual({ type: "string", value: '"a\\"b"' });
  });

  it("tokenizes booleans and null", () => {
    const tokens = tokenizeJson("[true, false, null]");
    expect(tokens).toContainEqual({ type: "boolean", value: "true" });
    expect(tokens).toContainEqual({ type: "boolean", value: "false" });
    expect(tokens).toContainEqual({ type: "null", value: "null" });
  });

  it("tokenizes decimals and exponents as single numbers", () => {
    const tokens = tokenizeJson("[1.5, -2e3]");
    expect(tokens).toContainEqual({ type: "number", value: "1.5" });
    expect(tokens).toContainEqual({ type: "number", value: "-2e3" });
  });

  it("preserves whitespace so pretty-printed formatting survives", () => {
    const tokens = tokenizeJson('{\n  "a": 1\n}');
    const ws = tokens.filter((t) => t.type === "ws").map((t) => t.value);
    expect(ws.join("").includes("\n")).toBe(true);
  });

  it("tokenizes a nested pretty-printed object end-to-end", () => {
    const tokens = tokenizeJson(JSON.stringify({ a: { b: [1, "x"] } }, null, 2));
    const joined = tokens.map((t) => t.value).join("");
    // Round-trips back to identical text.
    expect(joined).toBe(JSON.stringify({ a: { b: [1, "x"] } }, null, 2));
    expect(tokens.some((t) => t.type === "key")).toBe(true);
    expect(tokens.some((t) => t.type === "string")).toBe(true);
    expect(tokens.some((t) => t.type === "number")).toBe(true);
  });
});
