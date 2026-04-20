import { describe, expect, test } from "bun:test";
import { generatePlan } from "../../src/execute/planner.ts";
import { parseYaml } from "../../src/parse/parser.ts";
import { createEmptyState } from "../../src/state/store.ts";
import { computeHash } from "../../src/execute/hash.ts";
import type { FileSystem } from "../../src/fs/interface.ts";
import type { StateFile } from "../../src/types.ts";

function mockFs(files: Record<string, string> = {}): FileSystem {
  return {
    async readFile(path: string) {
      if (path in files) return files[path]!;
      throw new Error(`File not found: ${path}`);
    },
    async readDirectory(_path: string) {
      return [{ path: "SKILL.md", content: "# Skill content" }];
    },
  };
}

describe("generatePlan", () => {
  test("X-1: all new resources generate create operations", async () => {
    const config = parseYaml(`
environments:
  dev:
    name: Dev
    config:
      type: cloud
skills:
  search:
    directory: ./skills/search
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: Hello
`);
    const plan = await generatePlan(config, createEmptyState(), {
      basePath: "/project",
      fs: mockFs(),
    });

    expect(plan.operations.length).toBe(3);
    expect(plan.operations.filter((op) => op.type === "create").length).toBe(3);
  });

  test("X-2: no changes when hashes match", async () => {
    const config = parseYaml(`
environments:
  dev:
    name: Dev
    config:
      type: cloud
`);
    const envData = { name: "Dev", config: { type: "cloud" } };
    const hash = computeHash(envData);

    const state: StateFile = {
      version: 1,
      resources: {
        "environment.dev": {
          type: "environment",
          logical_name: "dev",
          id: "env_123",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: hash,
        },
      },
    };

    const plan = await generatePlan(config, state, {
      basePath: "/project",
      fs: mockFs(),
    });

    expect(plan.operations.length).toBe(0);
  });

  test("X-3: environment config change generates update", async () => {
    const config = parseYaml(`
environments:
  dev:
    name: Dev Updated
    config:
      type: cloud
`);
    const state: StateFile = {
      version: 1,
      resources: {
        "environment.dev": {
          type: "environment",
          logical_name: "dev",
          id: "env_123",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:old_hash",
        },
      },
    };

    const plan = await generatePlan(config, state, {
      basePath: "/project",
      fs: mockFs(),
    });

    expect(plan.operations.length).toBe(1);
    expect(plan.operations[0]!.type).toBe("update");
    expect(plan.operations[0]!.resource).toBe("environment");
  });

  test("X-4: skill file change generates create_version", async () => {
    const config = parseYaml(`
skills:
  search:
    directory: ./skills/search
`);
    const state: StateFile = {
      version: 1,
      resources: {
        "skill.search": {
          type: "skill",
          logical_name: "search",
          id: "skill_123",
          latest_version: "v1",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:old_hash",
        },
      },
    };

    const plan = await generatePlan(config, state, {
      basePath: "/project",
      fs: mockFs(),
    });

    expect(plan.operations.length).toBe(1);
    expect(plan.operations[0]!.type).toBe("create_version");
  });

  test("X-6: resource removed from YAML generates destroy", async () => {
    const config = parseYaml(`
environments:
  dev:
    name: Dev
    config:
      type: cloud
`);
    const envData = { name: "Dev", config: { type: "cloud" } };
    const hash = computeHash(envData);

    const state: StateFile = {
      version: 1,
      resources: {
        "environment.dev": {
          type: "environment",
          logical_name: "dev",
          id: "env_123",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: hash,
        },
        "agent.old-bot": {
          type: "agent",
          logical_name: "old-bot",
          id: "agent_456",
          version: 1,
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:xxx",
        },
      },
    };

    const plan = await generatePlan(config, state, {
      basePath: "/project",
      fs: mockFs(),
    });

    expect(plan.operations.length).toBe(1);
    expect(plan.operations[0]!.type).toBe("destroy");
    expect(plan.operations[0]!.name).toBe("old-bot");
  });

  test("X-7: agent system file change generates update", async () => {
    const fs = mockFs({ "/project/prompt.md": "Updated prompt content" });
    const config = parseYaml(`
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: "\${file('./prompt.md')}"
`);
    const state: StateFile = {
      version: 1,
      resources: {
        "agent.bot": {
          type: "agent",
          logical_name: "bot",
          id: "agent_123",
          version: 1,
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:old_hash",
        },
      },
    };

    const plan = await generatePlan(config, state, {
      basePath: "/project",
      fs,
    });

    expect(plan.operations.length).toBe(1);
    expect(plan.operations[0]!.type).toBe("update");
    expect(plan.operations[0]!.resource).toBe("agent");
  });

  test("F-2: file not found throws error", async () => {
    const config = parseYaml(`
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: "\${file('./missing.md')}"
`);
    await expect(
      generatePlan(config, createEmptyState(), {
        basePath: "/project",
        fs: mockFs(),
      }),
    ).rejects.toThrow("File not found");
  });
});
