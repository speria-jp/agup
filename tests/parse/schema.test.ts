import { describe, expect, test } from "bun:test";
import { AgentformConfigSchema } from "../../src/parse/schema.ts";

describe("AgentformConfigSchema", () => {
  test("P-1: full config with all resource types", () => {
    const input = {
      environments: {
        "python-data": {
          name: "Python Data Env",
          description: "For data processing",
          config: {
            type: "cloud",
            networking: { type: "unrestricted" },
            packages: { pip: ["pandas", "numpy"] },
          },
          metadata: { team: "data" },
        },
      },
      skills: {
        "search-knowledge": {
          display_title: "Search Knowledge",
          directory: "./skills/search",
        },
      },
      agents: {
        "support-bot": {
          name: "Support Bot",
          description: "Customer support agent",
          model: "claude-sonnet-4-6-20250514",
          system: "You are a helpful assistant.",
          mcp_servers: [{ name: "docs", url: "https://example.com/mcp" }],
          skills: [{ type: "custom", skill_id: "skill_123" }],
          metadata: { version: "1" },
        },
      },
    };

    const result = AgentformConfigSchema.parse(input);
    expect(result.environments!["python-data"]!.name).toBe("Python Data Env");
    expect(result.skills!["search-knowledge"]!.directory).toBe("./skills/search");
    expect(result.agents!["support-bot"]!.name).toBe("Support Bot");
  });

  test("P-2: empty section", () => {
    const result = AgentformConfigSchema.parse({ environments: {} });
    expect(result.environments).toEqual({});
  });

  test("P-3: only agents defined", () => {
    const result = AgentformConfigSchema.parse({
      agents: {
        bot: {
          name: "Bot",
          model: "claude-sonnet-4-6-20250514",
          system: "Hello",
        },
      },
    });
    expect(result.environments).toBeUndefined();
    expect(result.skills).toBeUndefined();
    expect(result.agents!["bot"]!.name).toBe("Bot");
  });

  test("P-4: agent missing required name", () => {
    expect(() =>
      AgentformConfigSchema.parse({
        agents: {
          bot: { model: "claude-sonnet-4-6-20250514", system: "Hi" },
        },
      }),
    ).toThrow();
  });

  test("P-5: agent name too long (257 chars)", () => {
    expect(() =>
      AgentformConfigSchema.parse({
        agents: {
          bot: {
            name: "a".repeat(257),
            model: "claude-sonnet-4-6-20250514",
            system: "Hi",
          },
        },
      }),
    ).toThrow();
  });

  test("P-6: invalid networking type", () => {
    expect(() =>
      AgentformConfigSchema.parse({
        environments: {
          env: {
            name: "Env",
            config: {
              type: "cloud",
              networking: { type: "invalid" },
            },
          },
        },
      }),
    ).toThrow();
  });

  test("P-7: model as object", () => {
    const result = AgentformConfigSchema.parse({
      agents: {
        bot: {
          name: "Bot",
          model: { id: "claude-sonnet-4-6-20250514", speed: "fast" },
          system: "Hello",
        },
      },
    });
    expect(result.agents!["bot"]!.model).toEqual({
      id: "claude-sonnet-4-6-20250514",
      speed: "fast",
    });
  });

  test("P-8: metadata with non-string value", () => {
    expect(() =>
      AgentformConfigSchema.parse({
        agents: {
          bot: {
            name: "Bot",
            model: "claude-sonnet-4-6-20250514",
            system: "Hi",
            metadata: { key: 123 },
          },
        },
      }),
    ).toThrow();
  });
});
