import { describe, expect, test } from "bun:test";
import { applyPlan } from "./applier.ts";
import { createEmptyState } from "../state/store.ts";
import type { ApiClient } from "../api/interface.ts";
import type { Plan, StateFile } from "../types.ts";

function mockApiClient(overrides?: Partial<{
  agentCreate: () => Promise<{ id: string; version: number }>;
  agentUpdate: () => Promise<{ id: string; version: number }>;
  skillCreate: () => Promise<{ id: string }>;
  skillCreateVersion: () => Promise<{ skill_id: string; version_id: string }>;
  envCreate: () => Promise<{ id: string }>;
}>): ApiClient {
  return {
    agents: {
      create: overrides?.agentCreate ?? (async () => ({ id: "agent_new", version: 1 })),
      update: overrides?.agentUpdate ?? (async () => ({ id: "agent_new", version: 2 })),
      archive: async () => {},
    },
    skills: {
      create: overrides?.skillCreate ?? (async (_name) => ({ id: "skill_new" })),
      createVersion: overrides?.skillCreateVersion ?? (async (_name, _id) => ({ skill_id: "skill_new", version_id: "v2" })),
      delete: async () => {},
    },
    environments: {
      create: overrides?.envCreate ?? (async () => ({ id: "env_new" })),
      update: async () => ({ id: "env_new" }),
      archive: async () => {},
    },
  };
}

describe("applyPlan", () => {
  test("A-1: environment create", async () => {
    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "create",
          resource: "environment",
          name: "dev",
          params: { name: "Dev", config: { type: "cloud" } },
        },
      ],
    };

    const result = await applyPlan(plan, createEmptyState(), mockApiClient());
    expect(result.applied).toBe(1);
    expect(result.error).toBeNull();
    expect(result.state.resources["environment.dev"]).toBeDefined();
    expect(result.state.resources["environment.dev"]!.id).toBe("env_new");
  });

  test("A-6: agent create", async () => {
    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "create",
          resource: "agent",
          name: "bot",
          params: { name: "Bot", model: "claude-sonnet-4-6-20250514", system: "Hi" },
        },
      ],
    };

    const result = await applyPlan(plan, createEmptyState(), mockApiClient());
    expect(result.applied).toBe(1);
    expect(result.state.resources["agent.bot"]!.id).toBe("agent_new");
  });

  test("A-3: skill create", async () => {
    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "create",
          resource: "skill",
          name: "search",
          params: { files: [{ path: "SKILL.md", content: "# Skill" }] },
        },
      ],
    };

    const result = await applyPlan(plan, createEmptyState(), mockApiClient());
    expect(result.applied).toBe(1);
    expect(result.state.resources["skill.search"]!.id).toBe("skill_new");
  });

  test("A-4: skill create_version", async () => {
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
          last_applied_hash: "sha256:old",
        },
      },
    };

    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "create_version",
          resource: "skill",
          name: "search",
          id: "skill_123",
          params: { files: [{ path: "SKILL.md", content: "# Updated" }] },
        },
      ],
    };

    const result = await applyPlan(plan, state, mockApiClient());
    expect(result.applied).toBe(1);
    const entry = result.state.resources["skill.search"] as { latest_version: string };
    expect(entry.latest_version).toBe("v2");
  });

  test("A-5: skill destroy", async () => {
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
          last_applied_hash: "sha256:old",
        },
      },
    };

    const plan: Plan = {
      dependencies: {},
      operations: [
        { type: "destroy", resource: "skill", name: "search", id: "skill_123" },
      ],
    };

    const result = await applyPlan(plan, state, mockApiClient());
    expect(result.applied).toBe(1);
    expect(result.state.resources["skill.search"]).toBeUndefined();
  });

  test("A-8: agent archive", async () => {
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
          last_applied_hash: "sha256:old",
        },
      },
    };

    const plan: Plan = {
      dependencies: {},
      operations: [
        { type: "destroy", resource: "agent", name: "bot", id: "agent_123" },
      ],
    };

    const result = await applyPlan(plan, state, mockApiClient());
    expect(result.applied).toBe(1);
    expect(result.state.resources["agent.bot"]).toBeUndefined();
  });

  test("A-2: environment update", async () => {
    const state: StateFile = {
      version: 1,
      resources: {
        "environment.dev": {
          type: "environment",
          logical_name: "dev",
          id: "env_123",
          depends_on: [],
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:old",
        },
      },
    };

    const calls: { id: string; params: Record<string, unknown> }[] = [];
    const client = mockApiClient();
    client.environments.update = async (id, params) => {
      calls.push({ id, params });
      return { id };
    };

    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "update",
          resource: "environment",
          name: "dev",
          id: "env_123",
          params: { name: "Dev Updated", config: { type: "cloud" } },
        },
      ],
    };

    const result = await applyPlan(plan, state, client);
    expect(result.applied).toBe(1);
    expect(result.error).toBeNull();
    expect(calls[0]!.id).toBe("env_123");
    expect(calls[0]!.params.name).toBe("Dev Updated");
    const entry = result.state.resources["environment.dev"]!;
    expect(entry.id).toBe("env_123");
    expect(entry.last_applied_hash).not.toBe("sha256:old");
  });

  test("A-7: agent update with version", async () => {
    const state: StateFile = {
      version: 1,
      resources: {
        "agent.bot": {
          type: "agent",
          logical_name: "bot",
          id: "agent_123",
          depends_on: [],
          version: 3,
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:old",
        },
      },
    };

    const calls: Record<string, unknown>[] = [];
    const client = mockApiClient();
    client.agents.update = async (_id, params) => {
      calls.push(params);
      return { id: "agent_123", version: 4 };
    };

    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "update",
          resource: "agent",
          name: "bot",
          id: "agent_123",
          params: { name: "Bot", model: "claude-sonnet-4-6-20250514", system: "Updated" },
        },
      ],
    };

    const result = await applyPlan(plan, state, client);
    expect(result.applied).toBe(1);
    expect(result.error).toBeNull();
    expect(calls[0]!.version).toBe(3);
    const entry = result.state.resources["agent.bot"] as { version: number; last_applied_hash: string };
    expect(entry.version).toBe(4);
    expect(entry.last_applied_hash).not.toBe("sha256:old");
  });

  test("S-1: create stores complete state entry", async () => {
    const plan: Plan = {
      dependencies: { "agent.bot": ["skill.search"] },
      operations: [
        {
          type: "create",
          resource: "agent",
          name: "bot",
          params: { name: "Bot", model: "claude-sonnet-4-6-20250514", system: "Hi" },
        },
      ],
    };

    const result = await applyPlan(plan, createEmptyState(), mockApiClient());
    const entry = result.state.resources["agent.bot"]!;
    expect(entry.id).toBe("agent_new");
    expect(entry.logical_name).toBe("bot");
    expect(entry.type).toBe("agent");
    expect(entry.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.last_applied_hash).toMatch(/^sha256:/);
    expect(entry.depends_on).toEqual(["skill.search"]);
    expect((entry as { version: number }).version).toBe(1);
  });

  test("S-2: agent update increments version", async () => {
    const state: StateFile = {
      version: 1,
      resources: {
        "agent.bot": {
          type: "agent",
          logical_name: "bot",
          id: "agent_123",
          depends_on: [],
          version: 5,
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:old",
        },
      },
    };

    const client = mockApiClient({
      agentUpdate: async () => ({ id: "agent_123", version: 6 }),
    });

    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "update",
          resource: "agent",
          name: "bot",
          id: "agent_123",
          params: { name: "Bot", model: "m", system: "New" },
        },
      ],
    };

    const result = await applyPlan(plan, state, client);
    const entry = result.state.resources["agent.bot"] as { version: number; created_at: string };
    expect(entry.version).toBe(6);
    expect(entry.created_at).toBe("2026-04-20T10:00:00Z");
  });

  test("R-2: resource ref resolved from create result", async () => {
    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "create",
          resource: "skill",
          name: "search",
          params: { files: [{ path: "SKILL.md", content: "# Skill" }] },
        },
        {
          type: "create",
          resource: "agent",
          name: "bot",
          params: {
            name: "Bot",
            model: "claude-sonnet-4-6-20250514",
            system: "Hi",
            skills: [{
              type: "custom",
              skill_id: { __expr: "resource_ref", resource: "skill", name: "search", attr: "id" },
            }],
          },
        },
      ],
    };

    const calls: Record<string, unknown>[] = [];
    const client: ApiClient = {
      ...mockApiClient(),
      agents: {
        ...mockApiClient().agents,
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          return { id: "agent_new", version: 1 };
        },
      },
    };

    const result = await applyPlan(plan, createEmptyState(), client);
    expect(result.applied).toBe(2);
    const agentParams = calls[0] as Record<string, unknown>;
    const skills = agentParams.skills as { skill_id: string }[];
    expect(skills[0]!.skill_id).toBe("skill_new");
  });

  test("R-3: unresolved reference throws error", async () => {
    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "create",
          resource: "agent",
          name: "bot",
          params: {
            name: "Bot",
            model: "claude-sonnet-4-6-20250514",
            system: "Hi",
            skills: [{
              type: "custom",
              skill_id: { __expr: "resource_ref", resource: "skill", name: "missing", attr: "id" },
            }],
          },
        },
      ],
    };

    const result = await applyPlan(plan, createEmptyState(), mockApiClient());
    expect(result.applied).toBe(0);
    expect(result.error).not.toBeNull();
    expect(result.error!.message).toContain("Cannot resolve reference");
  });

  test("R-4: template marker resolved from state", async () => {
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
          last_applied_hash: "sha256:old",
        },
      },
    };

    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "create",
          resource: "agent",
          name: "bot",
          params: {
            name: "Bot",
            model: "claude-sonnet-4-6-20250514",
            system: {
              __expr: "template",
              parts: [
                { type: "text", value: "Uses " },
                { type: "expr", ast: { type: "resource_ref", resource: "skill", name: "search", attr: "id" } },
                { type: "text", value: " for lookup" },
              ],
            },
          },
        },
      ],
    };

    const calls: Record<string, unknown>[] = [];
    const client: ApiClient = {
      ...mockApiClient(),
      agents: {
        ...mockApiClient().agents,
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          return { id: "agent_new", version: 1 };
        },
      },
    };

    const result = await applyPlan(plan, state, client);
    expect(result.applied).toBe(1);
    expect((calls[0] as { system: string }).system).toBe("Uses skill_abc for lookup");
  });

  test("R-5: template with multiple refs resolved", async () => {
    const state: StateFile = {
      version: 1,
      resources: {
        "skill.a": {
          type: "skill",
          logical_name: "a",
          id: "skill_aaa",
          depends_on: [],
          latest_version: "v1",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:old",
        },
        "skill.b": {
          type: "skill",
          logical_name: "b",
          id: "skill_bbb",
          depends_on: [],
          latest_version: "v1",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:old",
        },
      },
    };

    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "create",
          resource: "agent",
          name: "bot",
          params: {
            name: "Bot",
            model: "m",
            system: {
              __expr: "template",
              parts: [
                { type: "expr", ast: { type: "resource_ref", resource: "skill", name: "a", attr: "id" } },
                { type: "text", value: " and " },
                { type: "expr", ast: { type: "resource_ref", resource: "skill", name: "b", attr: "id" } },
              ],
            },
          },
        },
      ],
    };

    const calls: Record<string, unknown>[] = [];
    const client: ApiClient = {
      ...mockApiClient(),
      agents: {
        ...mockApiClient().agents,
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          return { id: "agent_new", version: 1 };
        },
      },
    };

    const result = await applyPlan(plan, state, client);
    expect(result.applied).toBe(1);
    expect((calls[0] as { system: string }).system).toBe("skill_aaa and skill_bbb");
  });

  test("R-6: template with unresolved ref throws error", async () => {
    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "create",
          resource: "agent",
          name: "bot",
          params: {
            name: "Bot",
            model: "m",
            system: {
              __expr: "template",
              parts: [
                { type: "text", value: "Uses " },
                { type: "expr", ast: { type: "resource_ref", resource: "skill", name: "missing", attr: "id" } },
              ],
            },
          },
        },
      ],
    };

    const result = await applyPlan(plan, createEmptyState(), mockApiClient());
    expect(result.applied).toBe(0);
    expect(result.error).not.toBeNull();
    expect(result.error!.message).toContain("Cannot resolve reference");
  });

  test("R-7: template nested in params resolved recursively", async () => {
    const state: StateFile = {
      version: 1,
      resources: {
        "environment.dev": {
          type: "environment",
          logical_name: "dev",
          id: "env_123",
          depends_on: [],
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:old",
        },
      },
    };

    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "create",
          resource: "agent",
          name: "bot",
          params: {
            name: "Bot",
            model: "m",
            system: "Hi",
            metadata: {
              env_info: {
                __expr: "template",
                parts: [
                  { type: "text", value: "env:" },
                  { type: "expr", ast: { type: "resource_ref", resource: "environment", name: "dev", attr: "id" } },
                ],
              },
            },
          },
        },
      ],
    };

    const calls: Record<string, unknown>[] = [];
    const client: ApiClient = {
      ...mockApiClient(),
      agents: {
        ...mockApiClient().agents,
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          return { id: "agent_new", version: 1 };
        },
      },
    };

    const result = await applyPlan(plan, state, client);
    expect(result.applied).toBe(1);
    const metadata = (calls[0] as { metadata: Record<string, string> }).metadata;
    expect(metadata.env_info).toBe("env:env_123");
  });

  test("S-5: partial apply - first op saved on second failure", async () => {
    const plan: Plan = {
      dependencies: {},
      operations: [
        {
          type: "create",
          resource: "environment",
          name: "dev",
          params: { name: "Dev", config: { type: "cloud" } },
        },
        {
          type: "create",
          resource: "skill",
          name: "search",
          params: { files: [] },
        },
        {
          type: "create",
          resource: "agent",
          name: "bot",
          params: { name: "Bot", model: "m", system: "Hi" },
        },
      ],
    };

    const client = mockApiClient({
      skillCreate: async () => {
        throw new Error("API error");
      },
    });

    const result = await applyPlan(plan, createEmptyState(), client);
    expect(result.applied).toBe(1);
    expect(result.state.resources["environment.dev"]).toBeDefined();
    expect(result.state.resources["skill.search"]).toBeUndefined();
    expect(result.failed!.name).toBe("search");
  });

  test("S-6: depends_on stored in state entry", async () => {
    const plan: Plan = {
      dependencies: {
        "skill.search": [],
        "agent.bot": ["skill.search"],
      },
      operations: [
        {
          type: "create",
          resource: "skill",
          name: "search",
          params: { files: [{ path: "SKILL.md", content: "# Skill" }] },
        },
        {
          type: "create",
          resource: "agent",
          name: "bot",
          params: {
            name: "Bot",
            model: "claude-sonnet-4-6-20250514",
            system: "Hi",
          },
        },
      ],
    };

    const result = await applyPlan(plan, createEmptyState(), mockApiClient());
    expect(result.applied).toBe(2);
    expect(result.state.resources["skill.search"]!.depends_on).toEqual([]);
    expect(result.state.resources["agent.bot"]!.depends_on).toEqual(["skill.search"]);
  });
});
