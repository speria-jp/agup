import { describe, expect, test } from "bun:test";
import { generatePlan } from "./planner.ts";
import { parseYaml } from "../parse/parser.ts";
import { createEmptyState } from "../state/store.ts";
import { computeHash } from "./hash.ts";
import type { FileSystem } from "../fs/interface.ts";
import type { StateFile } from "../types.ts";

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
          depends_on: [],
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
          depends_on: [],
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

  test("X-4: skill file change generates update", async () => {
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
          depends_on: [],
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
    expect(plan.operations[0]!.type).toBe("update");
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
          depends_on: [],
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: hash,
        },
        "agent.old-bot": {
          type: "agent",
          logical_name: "old-bot",
          id: "agent_456",
          depends_on: [],
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
          depends_on: [],
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

  test("X-5: skill display_title change generates destroy + create", async () => {
    const config = parseYaml(`
skills:
  search:
    display_title: New Title
    directory: ./skills/search
`);
    const state: StateFile = {
      version: 1,
      resources: {
        "skill.search": {
          type: "skill",
          logical_name: "search",
          id: "skill_123",
          depends_on: [],
          latest_version: "v1",
          display_title: "Old Title",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:old_hash",
        },
      },
    };

    const plan = await generatePlan(config, state, {
      basePath: "/project",
      fs: mockFs(),
    });

    expect(plan.operations.length).toBe(2);
    expect(plan.operations[0]!.type).toBe("destroy");
    expect(plan.operations[1]!.type).toBe("create");
  });

  test("T-1: single resource_ref produces resource_ref marker", async () => {
    const config = parseYaml(`
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: Hello
    skills:
      - type: custom
        skill_id: "\${skill.search.id}"
`);
    const plan = await generatePlan(config, createEmptyState(), {
      basePath: "/project",
      fs: mockFs(),
    });

    const op = plan.operations[0] as unknown as { params: Record<string, unknown> };
    const skills = op.params.skills as { skill_id: unknown }[];
    expect(skills[0]!.skill_id).toEqual({
      __expr: "resource_ref",
      resource: "skill",
      name: "search",
      attr: "id",
    });
  });

  test("T-2: resource_ref mixed with text produces template marker", async () => {
    const config = parseYaml(`
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: "Uses \${skill.search.id} for lookup"
`);
    const plan = await generatePlan(config, createEmptyState(), {
      basePath: "/project",
      fs: mockFs(),
    });

    const { params } = plan.operations[0] as unknown as { params: Record<string, unknown> };
    expect(params.system).toEqual({
      __expr: "template",
      parts: [
        { type: "text", value: "Uses " },
        { type: "expr", ast: { type: "resource_ref", resource: "skill", name: "search", attr: "id" } },
        { type: "text", value: " for lookup" },
      ],
    });
  });

  test("T-3: multiple resource_refs produce template marker", async () => {
    const config = parseYaml(`
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: "\${skill.a.id} and \${skill.b.id}"
`);
    const plan = await generatePlan(config, createEmptyState(), {
      basePath: "/project",
      fs: mockFs(),
    });

    const { params } = plan.operations[0] as unknown as { params: Record<string, unknown> };
    const tmpl = params.system as { __expr: string; parts: unknown[] };
    expect(tmpl.__expr).toBe("template");
    expect(tmpl.parts).toEqual([
      { type: "expr", ast: { type: "resource_ref", resource: "skill", name: "a", attr: "id" } },
      { type: "text", value: " and " },
      { type: "expr", ast: { type: "resource_ref", resource: "skill", name: "b", attr: "id" } },
    ]);
  });

  test("T-4: file_ref + resource_ref mixed produces template with resolved file", async () => {
    const fs = mockFs({ "/project/intro.md": "Hello" });
    const config = parseYaml(`
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: "\${file('./intro.md')} uses \${skill.s.id}"
`);
    const plan = await generatePlan(config, createEmptyState(), {
      basePath: "/project",
      fs,
    });

    const { params } = plan.operations[0] as unknown as { params: Record<string, unknown> };
    expect(params.system).toEqual({
      __expr: "template",
      parts: [
        { type: "text", value: "Hello" },
        { type: "text", value: " uses " },
        { type: "expr", ast: { type: "resource_ref", resource: "skill", name: "s", attr: "id" } },
      ],
    });
  });

  test("T-5: template with only file_refs resolves to plain string", async () => {
    const fs = mockFs({
      "/project/a.md": "AAA",
      "/project/b.md": "BBB",
    });
    const config = parseYaml(`
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: "\${file('./a.md')} and \${file('./b.md')}"
`);
    const plan = await generatePlan(config, createEmptyState(), {
      basePath: "/project",
      fs,
    });

    const { params } = plan.operations[0] as unknown as { params: Record<string, unknown> };
    expect(params.system).toBe("AAA and BBB");
  });

  test("R-1: existing resource ref resolved from state at plan time", async () => {
    const config = parseYaml(`
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: Hello
    skills:
      - type: custom
        skill_id: "\${skill.search.id}"
`);
    const state: StateFile = {
      version: 1,
      resources: {
        "skill.search": {
          type: "skill",
          logical_name: "search",
          id: "skill_real_id_123",
          depends_on: [],
          latest_version: "v1",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:abc",
        },
      },
    };

    const plan = await generatePlan(config, state, {
      basePath: "/project",
      fs: mockFs(),
    });

    const createOp = plan.operations.find((op) => op.resource === "agent")!;
    const params = (createOp as unknown as { params: Record<string, unknown> }).params;
    const skills = params.skills as { skill_id: unknown }[];
    expect(skills[0]!.skill_id).toBe("skill_real_id_123");
  });

  test("R-1: template with existing ref resolves to string at plan time", async () => {
    const config = parseYaml(`
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: "Uses \${skill.search.id} for lookup"
`);
    const state: StateFile = {
      version: 1,
      resources: {
        "skill.search": {
          type: "skill",
          logical_name: "search",
          id: "skill_abc",
          depends_on: [],
          latest_version: "v1",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:abc",
        },
      },
    };

    const plan = await generatePlan(config, state, {
      basePath: "/project",
      fs: mockFs(),
    });

    const createOp = plan.operations.find((op) => op.resource === "agent")!;
    const params = (createOp as unknown as { params: Record<string, unknown> }).params;
    expect(params.system).toBe("Uses skill_abc for lookup");
  });

  test("R-1: unresolvable ref stays as marker", async () => {
    const config = parseYaml(`
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: Hello
    skills:
      - type: custom
        skill_id: "\${skill.unknown.id}"
`);
    const plan = await generatePlan(config, createEmptyState(), {
      basePath: "/project",
      fs: mockFs(),
    });

    const { params } = plan.operations[0] as unknown as { params: Record<string, unknown> };
    const skills = params.skills as { skill_id: unknown }[];
    expect(skills[0]!.skill_id).toEqual({
      __expr: "resource_ref",
      resource: "skill",
      name: "unknown",
      attr: "id",
    });
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
