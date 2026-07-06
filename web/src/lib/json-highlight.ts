/**
 * Tiny dependency-free JSON syntax tokenizer for the raw-JSON viewer.
 *
 * Purposefully a scanner over raw text (not JSON.parse) so it also lights up
 * malformed/edited JSON without throwing, and preserves the original
 * whitespace so a pretty-printed document keeps its indentation. Correctness
 * target is "good enough for human syntax highlighting", not a validating
 * parser.
 */
export type JsonTokenType =
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "punct"
  | "ws";

export type JsonToken = {
  type: JsonTokenType;
  value: string;
};

const NUMBER_BODY = /[0-9eE+\-.]/;
const WHITESPACE = /\s/;

export function tokenizeJson(input: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  const n = input.length;
  let i = 0;

  while (i < n) {
    const c = input[i];

    if (WHITESPACE.test(c)) {
      let j = i + 1;
      while (j < n && WHITESPACE.test(input[j])) j++;
      tokens.push({ type: "ws", value: input.slice(i, j) });
      i = j;
      continue;
    }

    if (c === '"') {
      let j = i + 1;
      while (j < n) {
        const ch = input[j];
        if (ch === "\\") {
          j += 2;
          continue;
        }
        if (ch === '"') {
          j += 1;
          break;
        }
        j += 1;
      }
      const value = input.slice(i, j);
      // A string is a key when the next non-whitespace char is the colon.
      let k = j;
      while (k < n && WHITESPACE.test(input[k])) k++;
      const type: JsonTokenType = input[k] === ":" ? "key" : "string";
      tokens.push({ type, value });
      i = j;
      continue;
    }

    if (c === "-" || (c >= "0" && c <= "9")) {
      let j = i + 1;
      while (j < n && NUMBER_BODY.test(input[j])) j++;
      tokens.push({ type: "number", value: input.slice(i, j) });
      i = j;
      continue;
    }

    if (input.startsWith("true", i)) {
      tokens.push({ type: "boolean", value: "true" });
      i += 4;
      continue;
    }
    if (input.startsWith("false", i)) {
      tokens.push({ type: "boolean", value: "false" });
      i += 5;
      continue;
    }
    if (input.startsWith("null", i)) {
      tokens.push({ type: "null", value: "null" });
      i += 4;
      continue;
    }

    tokens.push({ type: "punct", value: c });
    i += 1;
  }

  return tokens;
}
