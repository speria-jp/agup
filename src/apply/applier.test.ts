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
      create: overrides?.skillCreate ?? (async () => ({ id: "skill_new" })),
      createVersion: overrides?.skillCreateVersion ?? (async () => ({ skill_id: "skill_new", version_id: "v2" })),
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
          latest_version: "v1",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:old",
        },
      },
    };

    const plan: Plan = {
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
          latest_version: "v1",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:old",
        },
      },
    };

    const plan: Plan = {
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
          version: 1,
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:old",
        },
      },
    };

    const plan: Plan = {
      operations: [
        { type: "destroy", resource: "agent", name: "bot", id: "agent_123" },
      ],
    };

    const result = await applyPlan(plan, state, mockApiClient());
    expect(result.applied).toBe(1);
    expect(result.state.resources["agent.bot"]).toBeUndefined();
  });

  test("R-2: resource ref resolved from create result", async () => {
    const plan: Plan = {
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

  test("S-5: partial apply - first op saved on second failure", async () => {
    const plan: Plan = {
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
});
