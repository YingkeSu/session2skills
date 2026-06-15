import { describe, expect, it } from "vitest";

import { createTranslator } from "./translator.js";

describe("createTranslator", () => {
  it("returns Chinese text for zh locale", () => {
    const { t } = createTranslator("zh");
    expect(t("app.title")).toBe("测试运行记录");
  });

  it("returns English text for en locale", () => {
    const { t } = createTranslator("en");
    expect(t("app.title")).toBe("Harness Runs");
  });

  it("falls back to the key when translation is missing", () => {
    const { t } = createTranslator("zh");
    expect(t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("interpolates numeric parameters into the translated string", () => {
    const { t } = createTranslator("zh");
    expect(t("evidence.loadFailed", { status: 404 })).toBe(
      "加载证据失败: 404",
    );
  });

  it("interpolates string parameters in English locale", () => {
    const { t } = createTranslator("en");
    expect(t("detail.errorPrefix", { message: "network error" })).toBe(
      "Error loading run: network error",
    );
  });

  it("picks singular form when count is 1", () => {
    const { t } = createTranslator("en");
    expect(t("reports.skepticSummary", { count: 1, claims: 5 })).toBe(
      "1 issue across 5 claims",
    );
  });

  it("picks plural form when count is not 1", () => {
    const { t } = createTranslator("en");
    expect(t("reports.skepticSummary", { count: 3, claims: 5 })).toBe(
      "3 issues across 5 claims",
    );
  });

  it("Chinese plural key uses same form for any count", () => {
    const { t } = createTranslator("zh");
    expect(t("reports.skepticSummary", { count: 3, claims: 5 })).toBe(
      "5 条声明中有 3 个问题",
    );
  });

  it("tEnum resolves known enum values to localized labels", () => {
    const zh = createTranslator("zh");
    expect(zh.tEnum("status", "verified")).toBe("已验证");
    const en = createTranslator("en");
    expect(en.tEnum("severity", "high")).toBe("high");
  });

  it("tEnum falls back to raw value for unknown enum entries", () => {
    const { tEnum } = createTranslator("zh");
    expect(tEnum("status", "unknown")).toBe("unknown");
  });
});
