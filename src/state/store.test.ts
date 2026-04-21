import { describe, expect, test } from "bun:test";
import { destroyOrder, parseState } from "./store.ts";
import type { StateFile } from "../types.ts";

describe("parseState", () => {
  test("parses valid state file", () => {
    const json = JSON.stringify({
      version: 1,
      resources: {
        "environment.dev": {
          type: "environment",
          logical_name: "dev",
          id: "env_1",
          depends_on: [],
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:abc",
        },
      },
    });
    const state = parseState(json);
    expect(state.version).toBe(1);
    expect(state.resources["environment.dev"]?.id).toBe("env_1");
  });

  test("rejects invalid version", () => {
    const json = JSON.stringify({ version: 2, resources: {} });
    expect(() => parseState(json)).toThrow();
  });

  test("rejects missing version field", () => {
    const json = JSON.stringify({ resources: {} });
    expect(() => parseState(json)).toThrow();
  });

  test("rejects invalid resource type", () => {
    const json = JSON.stringify({
      version: 1,
      resources: {
        "unknown.x": {
          type: "unknown",
          logical_name: "x",
          id: "id_1",
          depends_on: [],
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:abc",
        },
      },
    });
    expect(() => parseState(json)).toThrow();
  });

  test("rejects agent entry missing version field", () => {
    const json = JSON.stringify({
      version: 1,
      resources: {
        "agent.bot": {
          type: "agent",
          logical_name: "bot",
          id: "agent_1",
          depends_on: [],
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:abc",
        },
      },
    });
    expect(() => parseState(json)).toThrow();
  });

  test("rejects invalid JSON", () => {
    expect(() => parseState("not json")).toThrow();
  });
});

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
