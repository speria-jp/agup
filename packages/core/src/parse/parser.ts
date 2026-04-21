import YAML from "yaml";
import { AgentformConfigSchema } from "./schema.ts";
import { parseString, type StringWithExprs } from "./expression.ts";
import type { AgentformConfig } from "./schema.ts";

export interface ParsedConfig {
  raw: AgentformConfig;
  expressions: Map<string, StringWithExprs>;
}

export function parseYaml(yamlContent: string): ParsedConfig {
  const parsed = YAML.parse(yamlContent);
  const config = AgentformConfigSchema.parse(parsed);

  const expressions = new Map<string, StringWithExprs>();
  extractExpressions(config, "", expressions);

  return { raw: config, expressions };
}

function extractExpressions(
  obj: unknown,
  path: string,
  result: Map<string, StringWithExprs>,
): void {
  if (typeof obj === "string") {
    const parsed = parseString(obj);
    if (parsed.type === "template") {
      result.set(path, parsed);
    }
    return;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      extractExpressions(obj[i], `${path}[${i}]`, result);
    }
    return;
  }

  if (obj !== null && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      extractExpressions(value, path ? `${path}.${key}` : key, result);
    }
  }
}
