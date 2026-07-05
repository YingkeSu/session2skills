import { Command } from "commander";
import { parsePositiveInteger, parseTonePreset, type TonePreset } from "../../shared/cli.js";
import { CliUsageError } from "../../shared/errors.js";
import { resolveGeneratedSkillsDirectory, resolveProjectDirectory, validateProjectDirectory } from "../../shared/paths.js";
import { generateSkillRun } from "../../generate/service.js";
import { parseTemplate, type TemplateName } from "../../generate/templates.js";
import { parseSkillType, type SkillType } from "../../generate/skill-types.js";
import type { LlmRunConfig } from "../../llm/selection.js";

type GenerateOptions = {
  directory?: string;
  workspace?: string;
  recent: number;
  output?: string;
  force: boolean;
  tone: TonePreset;
  template: TemplateName;
  skillType: SkillType;
  evidenceBudget: number;
  evidenceMaxChars: number;
  evidenceMaxItems: number;
  llmProvider?: string;
  llmBaseUrl?: string;
  llmModel?: string;
  llmModelVersion?: string;
  llmApiKey?: string;
  llmApiKeyEnv?: string;
  llmPath?: string;
  preferJsonObject?: boolean;
};

export type { GenerateSkillRunInput, GenerateSkillRunResult } from "../../generate/service.js";

/**
 * Translate the parsed `generate` LLM options into a serializable
 * {@link LlmRunConfig}. Returns `undefined` when no LLM option was supplied,
 * so existing invocations keep using the `SESSION2SKILLS_LLM_*` env defaults.
 */
export function buildLlmConfigFromOptions(options: GenerateOptions): LlmRunConfig | undefined {
  const config: LlmRunConfig = {};
  if (options.llmProvider) config.provider = options.llmProvider;
  if (options.llmBaseUrl) config.baseUrl = options.llmBaseUrl;
  if (options.llmModel) config.model = options.llmModel;
  if (options.llmModelVersion) config.modelVersion = options.llmModelVersion;
  if (options.llmApiKey) config.apiKey = options.llmApiKey;
  if (options.llmApiKeyEnv) config.apiKeyEnv = options.llmApiKeyEnv;
  if (options.llmPath) config.path = options.llmPath;
  if (options.preferJsonObject !== undefined) config.preferJsonObject = options.preferJsonObject;
  return Object.keys(config).length > 0 ? config : undefined;
}

function parsePreferJsonObject(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  throw new CliUsageError(`--prefer-json-object expects true|false, received: ${value}`);
}

export function registerGenerateCommand(program: Command): void {
  program
    .command("generate")
    .description("Generate summary and SKILL markdown artifacts from OpenCode sessions via the harness pipeline")
    .option("-d, --directory <path>", "Target project directory")
    .option("-w, --workspace <id>", "Optional OpenCode workspace id")
    .option("-r, --recent <number>", "Number of recent sessions to analyze", parsePositiveInteger, 10)
    .option("-o, --output <path>", "Directory where generated skill artifacts should be written")
    .option("--tone <preset>", "Output tone: concise, balanced, or detailed", parseTonePreset, "balanced")
    .option("--template <name>", "Output template: claude-skill, opencode-skill, cursor-mdc, copilot-instructions", parseTemplate, "claude-skill")
    .option("--skill-type <type>", "Skill type focus: workflow, testing, code-style, debugging, review", parseSkillType, "workflow")
    .option("--evidence-budget <number>", "Evidence token budget for analyst (default: 160000)", parsePositiveInteger, 160000)
    .option("--evidence-max-chars <number>", "Max chars per evidence item in prompt (default: 5000)", parsePositiveInteger, 5000)
    .option("--evidence-max-items <number>", "Max evidence items in prompt (default: 3000)", parsePositiveInteger, 3000)
    .option("--force", "Allow overwriting existing generated outputs", false)
    .option("--llm-provider <id>", "LLM provider id (defaults to env / openai-compatible)")
    .option("--llm-base-url <url>", "OpenAI-compatible base URL (defaults to env)")
    .option("--llm-model <model>", "Model id (defaults to env)")
    .option("--llm-model-version <version>", "Optional model version label")
    .option("--llm-api-key-env <name>", "Env var holding the LLM API key (preferred over --llm-api-key)")
    .option("--llm-api-key <key>", "LLM API key for local use (prefer --llm-api-key-env)")
    .option("--llm-path <path>", "Path appended to the base URL for chat completions")
    .option(
      "--prefer-json-object <boolean>",
      "Force json_object structured output (true) or disable it (false). Omit to use the provider default (on for DeepSeek/ZhipuAI).",
      parsePreferJsonObject,
    )
    .action(async (options: GenerateOptions) => {
      const directory = validateProjectDirectory(resolveProjectDirectory(options.directory));
      const outputDirectory = resolveGeneratedSkillsDirectory(directory, options.output);
      const llmConfig = buildLlmConfigFromOptions(options);

      const result = await generateSkillRun({
        projectDirectory: directory,
        outputDirectory,
        workspace: options.workspace,
        recent: options.recent,
        force: options.force,
        tone: options.tone,
        template: options.template,
        skillType: options.skillType,
        evidenceConfig: {
          tokenBudget: options.evidenceBudget,
          maxChars: options.evidenceMaxChars,
          maxItems: options.evidenceMaxItems,
        },
        ...(llmConfig !== undefined ? { llmConfig } : {}),
      });

      if (result === null) {
        console.log(`No OpenCode sessions found for ${directory}.`);
        return;
      }

      console.log(JSON.stringify(result, null, 2));
    });
}
