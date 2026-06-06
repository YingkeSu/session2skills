export const REDACTED_SECRET = "[REDACTED_SECRET]";

const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret|secret|token|password|passwd|pwd|private[_-]?key)($|[_-])/i;

const PRIVATE_KEY_BLOCK_PATTERN =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;

const OPENAI_STYLE_TOKEN_PATTERN = /\bsk-[A-Za-z0-9_-]{8,}\b/g;
const GITHUB_STYLE_TOKEN_PATTERN = /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g;

const SENSITIVE_ENV_ASSIGNMENT_PATTERN =
  /(^|[\r\n])([A-Za-z_][A-Za-z0-9_]*(?:API_KEY|ACCESS_KEY|AUTH_TOKEN|CLIENT_SECRET|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY)[A-Za-z0-9_]*)\s*=\s*([^\r\n]*)/gi;

const GENERIC_SECRET_ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret|secret|token|password|passwd|private[_-]?key)\b\s*[:=]\s*("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi;

const JSON_SECRET_PROPERTY_PATTERN =
  /(["'])(api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret|secret|token|password|passwd|private[_-]?key)\1\s*:\s*(["'])(.*?)\3/gi;

export function redactSecretsFromString(value: string): string {
  return value
    .replace(PRIVATE_KEY_BLOCK_PATTERN, REDACTED_SECRET)
    .replace(OPENAI_STYLE_TOKEN_PATTERN, REDACTED_SECRET)
    .replace(GITHUB_STYLE_TOKEN_PATTERN, REDACTED_SECRET)
    .replace(SENSITIVE_ENV_ASSIGNMENT_PATTERN, (_match, prefix: string, key: string) => `${prefix}${key}=${REDACTED_SECRET}`)
    .replace(JSON_SECRET_PROPERTY_PATTERN, (_match, keyQuote: string, key: string, valueQuote: string) => `${keyQuote}${key}${keyQuote}:${valueQuote}${REDACTED_SECRET}${valueQuote}`)
    .replace(GENERIC_SECRET_ASSIGNMENT_PATTERN, (match: string, key: string) => {
      const separator = match.includes(":") ? ":" : "=";
      return `${key}${separator}${REDACTED_SECRET}`;
    });
}

export function containsSecretMaterial(value: unknown): boolean {
  if (typeof value === "string") {
    return redactSecretsFromString(value) !== value;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsSecretMaterial(item));
  }

  if (isRecord(value)) {
    return Object.entries(value).some(([key, item]) =>
      isSensitiveKey(key) || containsSecretMaterial(item),
    );
  }

  return false;
}

export function redactSecretsDeep<T>(value: T): T {
  return redactUnknown(value) as T;
}

export function stringifyRedactedJson(value: unknown): string {
  return JSON.stringify(redactSecretsDeep(value), null, 2);
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSecretsFromString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).map(([key, item]) => {
      if (isSensitiveKey(key)) {
        return [key, REDACTED_SECRET] as const;
      }
      return [key, redactUnknown(item)] as const;
    });
    return Object.fromEntries(entries);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
