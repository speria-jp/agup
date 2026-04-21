import { describe, expect, test } from "bun:test";
import { destroyOrder } from "./store.ts";
import type { StateFile } from "../types.ts";

describe("destroyOrder", () => {
  test("returns dependent resources before their dependencies", () => {
    const state: StateFile = {
      version: 1,
      resources: {
        "environment.dev": {
          type: "environment",
          logical_name: "dev",
          id: "env_1",
          depends_on: [],
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:a",
        },
        "skill.search": {
          type: "skill",
          logical_name: "search",
          id: "skill_1",
          depends_on: [],
          latest_version: "v1",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:b",
        },
        "agent.bot": {
          type: "agent",
          logical_name: "bot",
          id: "agent_1",
          depends_on: ["skill.search"],
          version: 1,
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:c",
        },
      },
    };

    const order = destroyOrder(state);
    const agentIdx = order.indexOf("agent.bot");
    const skillIdx = order.indexOf("skill.search");
    expect(agentIdx).toBeLessThan(skillIdx);
  });

  test("handles multiple dependencies", () => {
    const state: StateFile = {
      version: 1,
      resources: {
        "skill.a": {
          type: "skill",
          logical_name: "a",
          id: "skill_a",
          depends_on: [],
          latest_version: "v1",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:a",
        },
        "skill.b": {
          type: "skill",
          logical_name: "b",
          id: "skill_b",
          depends_on: [],
          latest_version: "v1",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:b",
        },
        "agent.bot": {
          type: "agent",
          logical_name: "bot",
          id: "agent_1",
          depends_on: ["skill.a", "skill.b"],
          version: 1,
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:c",
        },
      },
    };

    const order = destroyOrder(state);
    const agentIdx = order.indexOf("agent.bot");
    const skillAIdx = order.indexOf("skill.a");
    const skillBIdx = order.indexOf("skill.b");
    expect(agentIdx).toBeLessThan(skillAIdx);
    expect(agentIdx).toBeLessThan(skillBIdx);
  });

  test("returns empty array for empty state", () => {
    const state: StateFile = { version: 1, resources: {} };
    expect(destroyOrder(state)).toEqual([]);
  });
});
