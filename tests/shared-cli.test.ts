import { describe, expect, it } from "vitest";

import { CliUsageError } from "../src/shared/errors.js";
import { parsePositiveInteger, parseTonePreset } from "../src/shared/cli.js";

describe("parsePositiveInteger", () => {
  it("parses valid positive integers", () => {
    expect(parsePositiveInteger("1")).toBe(1);
    expect(parsePositiveInteger("10")).toBe(10);
    expect(parsePositiveInteger("999")).toBe(999);
  });

  it("rejects zero", () => {
    expect(() => parsePositiveInteger("0")).toThrow(CliUsageError);
    expect(() => parsePositiveInteger("0")).toThrow("positive integer");
  });

  it("rejects negative numbers", () => {
    expect(() => parsePositiveInteger("-1")).toThrow(CliUsageError);
  });

  it("rejects decimals", () => {
    expect(() => parsePositiveInteger("3.5")).toThrow(CliUsageError);
    expect(() => parsePositiveInteger("10.9")).toThrow(CliUsageError);
  });

  it("rejects partially numeric strings", () => {
    expect(() => parsePositiveInteger("3abc")).toThrow(CliUsageError);
    expect(() => parsePositiveInteger("1e3")).toThrow(CliUsageError);
  });

  it("rejects non-numeric strings", () => {
    expect(() => parsePositiveInteger("abc")).toThrow(CliUsageError);
    expect(() => parsePositiveInteger("")).toThrow(CliUsageError);
  });
});

describe("parseTonePreset", () => {
  it("accepts valid presets", () => {
    expect(parseTonePreset("concise")).toBe("concise");
    expect(parseTonePreset("balanced")).toBe("balanced");
    expect(parseTonePreset("detailed")).toBe("detailed");
  });

  it("rejects invalid presets", () => {
    expect(() => parseTonePreset("verbose")).toThrow(CliUsageError);
    expect(() => parseTonePreset("chatty")).toThrow(CliUsageError);
    expect(() => parseTonePreset("UNKNOWN")).toThrow(CliUsageError);
  });
});
