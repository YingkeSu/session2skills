import { describe, it, expect } from "vitest";
import {
  parseTemplate,
  loadTemplateMarkdown,
  AVAILABLE_TEMPLATES,
  type TemplateName,
} from "../../src/generate/templates.js";

describe("parseTemplate", () => {
  it.each(AVAILABLE_TEMPLATES)("accepts valid template: %s", (name) => {
    expect(parseTemplate(name)).toBe(name);
  });

  it("rejects invalid template name", () => {
    expect(() => parseTemplate("invalid")).toThrow("Invalid template: invalid");
  });

  it("rejects empty string", () => {
    expect(() => parseTemplate("")).toThrow("Invalid template:");
  });

  it("includes available templates in error message", () => {
    expect(() => parseTemplate("unknown")).toThrow("claude-skill, opencode-skill, cursor-mdc, copilot-instructions");
  });
});

describe("loadTemplateMarkdown", () => {
  it.each(AVAILABLE_TEMPLATES)("returns non-empty string for %s", async (name) => {
    const content = await loadTemplateMarkdown(name as TemplateName);
    expect(content).toBeTruthy();
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
  });

  it("claude-skill template contains YAML frontmatter", async () => {
    const content = await loadTemplateMarkdown("claude-skill");
    expect(content).toContain("---");
    expect(content).toContain("name:");
    expect(content).toContain("description:");
  });

  it("opencode-skill template contains metadata fields", async () => {
    const content = await loadTemplateMarkdown("opencode-skill");
    expect(content).toContain("---");
    expect(content).toContain("metadata:");
    expect(content).toContain("audience:");
  });

  it("cursor-mdc template contains globs field", async () => {
    const content = await loadTemplateMarkdown("cursor-mdc");
    expect(content).toContain("---");
    expect(content).toContain("globs:");
    expect(content).toContain("alwaysApply:");
  });

  it("copilot-instructions template has no frontmatter", async () => {
    const content = await loadTemplateMarkdown("copilot-instructions");
    expect(content).toContain("# Project Instructions");
    expect(content).not.toContain("---");
  });
});
