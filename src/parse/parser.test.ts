import { describe, expect, test } from "bun:test";
import { parseYaml } from "./parser.ts";

describe("parseYaml", () => {
  test("parses valid YAML and extracts expressions", () => {
    const yaml = `
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: "\${file('./prompt.md')}"
    skills:
      - type: custom
        skill_id: "\${skill.search.id}"
`;
    const result = parseYaml(yaml);
    expect(result.raw.agents!["bot"]!.name).toBe("Bot");
    expect(result.expressions.size).toBe(2);
  });

  test("no expressions in plain YAML", () => {
    const yaml = `
environments:
  dev:
    name: Dev Environment
    config:
      type: cloud
`;
    const result = parseYaml(yaml);
    expect(result.expressions.size).toBe(0);
  });

  test("throws on invalid YAML structure", () => {
    const yaml = `
agents:
  bot:
    model: claude-sonnet-4-6-20250514
    system: Hi
`;
    expect(() => parseYaml(yaml)).toThrow();
  });
});
