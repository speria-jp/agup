import { describe, expect, test } from "bun:test";
import { parseYaml } from "../../src/parse/parser.ts";
import { generatePlan } from "../../src/execute/planner.ts";
import { applyPlan } from "../../src/apply/applier.ts";
import { createEmptyState, destroyOrder } from "../../src/state/store.ts";
import type { Plan, StateFile, Operation } from "../../src/types.ts";
import { createSpyApiClient, createMockFs } from "./helpers.ts";

const BASE_PATH = "/project";

const FULL_YAML = `
environments:
  dev:
    name: Development
    config:
      type: cloud

skills:
  search:
    display_title: Search Tool
    directory: ./skills/search

agents:
  bot:
    name: Assistant Bot
    model: claude-sonnet-4-6-20250514
    system: "\${file('./prompts/bot.md')}"
    skills:
      - type: custom
        skill_id: "\${skill.search.id}"
`;

function fullMockFs() {
  return createMockFs({
    [`${BASE_PATH}/prompts/bot.md`]: "You are a helpful assistant.",
    [`${BASE_PATH}/skills/search`]: [
      { path: "SKILL.md", content: "# Search\nA search skill." },
    ],
  });
}

async function runFullPipeline(yaml: string, state: StateFile, fs: ReturnType<typeof createMockFs>, spy: ReturnType<typeof createSpyApiClient>) {
  const config = parseYaml(yaml);
  const plan = await generatePlan(config, state, { basePath: BASE_PATH, fs });
  if (plan.operations.length === 0) return { plan, result: null };
  const result = await applyPlan(plan, state, spy.client);
  return { plan, result };
}

describe("Integration Scenarios", () => {
  test("S-1: initial deploy creates all resources in dependency order", async () => {
    const fs = fullMockFs();
    const spy = createSpyApiClient();
    const state = createEmptyState();

    const { plan, result } = await runFullPipeline(FULL_YAML, state, fs, spy);

    expect(plan.operations.length).toBe(3);
    expect(result!.applied).toBe(3);
    expect(result!.error).toBeNull();

    expect(result!.state.resources["environment.dev"]).toBeDefined();
    expect(result!.state.resources["skill.search"]).toBeDefined();
    expect(result!.state.resources["agent.bot"]).toBeDefined();

    expect(result!.state.resources["environment.dev"]!.id).toBe("env_1");
    expect(result!.state.resources["skill.search"]!.id).toBe("skill_1");
    expect(result!.state.resources["agent.bot"]!.id).toBe("agent_1");

    const methods = spy.calls.map((c) => c.method);
    const envIdx = methods.indexOf("environments.create");
    const skillIdx = methods.indexOf("skills.create");
    const agentIdx = methods.indexOf("agents.create");
    expect(envIdx).toBeLessThan(agentIdx);
    expect(skillIdx).toBeLessThan(agentIdx);

    const agentCall = spy.calls.find((c) => c.method === "agents.create");
    const agentParams = agentCall!.args[0] as Record<string, unknown>;
    expect(agentParams.system).toBe("You are a helpful assistant.");
    const skills = agentParams.skills as { skill_id: string }[];
    expect(skills[0]!.skill_id).toBe("skill_1");
  });

  test("S-2: skill file update triggers create_version", async () => {
    const state: StateFile = {
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
        "skill.search": {
          type: "skill",
          logical_name: "search",
          id: "skill_1",
          depends_on: [],
          latest_version: "ver_1",
          display_title: "Search Tool",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:def",
        },
        "agent.bot": {
          type: "agent",
          logical_name: "bot",
          id: "agent_1",
          depends_on: ["skill.search"],
          version: 1,
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:ghi",
        },
      },
    };

    const fs = createMockFs({
      [`${BASE_PATH}/prompts/bot.md`]: "You are a helpful assistant.",
      [`${BASE_PATH}/skills/search`]: [
        { path: "SKILL.md", content: "# Search\nUpdated content here." },
      ],
    });
    const spy = createSpyApiClient();

    const { plan, result } = await runFullPipeline(FULL_YAML, state, fs, spy);

    const ops = plan.operations.map((o) => `${o.type}:${o.resource}.${o.name}`);
    expect(ops).toContain("create_version:skill.search");

    expect(result!.applied).toBeGreaterThanOrEqual(1);
    expect(result!.error).toBeNull();

    const skillEntry = result!.state.resources["skill.search"] as { latest_version: string };
    expect(skillEntry.latest_version).toBe("ver_1");

    const versionCall = spy.calls.find((c) => c.method === "skills.createVersion");
    expect(versionCall).toBeDefined();
    expect(versionCall!.args[0]).toBe("search");
    expect(versionCall!.args[1]).toBe("skill_1");
  });

  test("S-3: agent references newly created skill", async () => {
    const yamlWithNewSkill = `
environments:
  dev:
    name: Development
    config:
      type: cloud

skills:
  search:
    display_title: Search Tool
    directory: ./skills/search
  summarize:
    display_title: Summarizer
    directory: ./skills/summarize

agents:
  bot:
    name: Assistant Bot
    model: claude-sonnet-4-6-20250514
    system: "\${file('./prompts/bot.md')}"
    skills:
      - type: custom
        skill_id: "\${skill.search.id}"
      - type: custom
        skill_id: "\${skill.summarize.id}"
`;

    const state: StateFile = {
      version: 1,
      resources: {
        "environment.dev": {
          type: "environment",
          logical_name: "dev",
          id: "env_existing",
          depends_on: [],
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:abc",
        },
        "skill.search": {
          type: "skill",
          logical_name: "search",
          id: "skill_existing",
          depends_on: [],
          latest_version: "ver_1",
          display_title: "Search Tool",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:def",
        },
        "agent.bot": {
          type: "agent",
          logical_name: "bot",
          id: "agent_existing",
          depends_on: ["skill.search"],
          version: 1,
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:ghi",
        },
      },
    };

    const fs = createMockFs({
      [`${BASE_PATH}/prompts/bot.md`]: "You are a helpful assistant.",
      [`${BASE_PATH}/skills/search`]: [
        { path: "SKILL.md", content: "# Search\nA search skill." },
      ],
      [`${BASE_PATH}/skills/summarize`]: [
        { path: "SKILL.md", content: "# Summarize\nA summarizer." },
      ],
    });
    const spy = createSpyApiClient();

    const { plan, result } = await runFullPipeline(yamlWithNewSkill, state, fs, spy);

    const ops = plan.operations.map((o) => `${o.type}:${o.resource}.${o.name}`);
    expect(ops).toContain("create:skill.summarize");
    expect(ops).toContain("update:agent.bot");

    expect(result!.error).toBeNull();

    const agentUpdate = spy.calls.find((c) => c.method === "agents.update");
    expect(agentUpdate).toBeDefined();
    const params = agentUpdate!.args[1] as Record<string, unknown>;
    const skills = params.skills as { skill_id: string }[];
    expect(skills[0]!.skill_id).toBe("skill_existing");
    expect(skills[1]!.skill_id).toBe("skill_1");

    expect(result!.state.resources["skill.summarize"]).toBeDefined();
    expect(result!.state.resources["skill.summarize"]!.id).toBe("skill_1");
  });

  test("S-4: removing resource from YAML triggers destroy", async () => {
    const yamlWithoutAgent = `
environments:
  dev:
    name: Development
    config:
      type: cloud

skills:
  search:
    display_title: Search Tool
    directory: ./skills/search
`;

    const state: StateFile = {
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
        "skill.search": {
          type: "skill",
          logical_name: "search",
          id: "skill_1",
          depends_on: [],
          latest_version: "ver_1",
          display_title: "Search Tool",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:def",
        },
        "agent.bot": {
          type: "agent",
          logical_name: "bot",
          id: "agent_1",
          depends_on: ["skill.search"],
          version: 1,
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:ghi",
        },
      },
    };

    const fs = createMockFs({
      [`${BASE_PATH}/skills/search`]: [
        { path: "SKILL.md", content: "# Search\nA search skill." },
      ],
    });
    const spy = createSpyApiClient();

    const { plan, result } = await runFullPipeline(yamlWithoutAgent, state, fs, spy);

    const ops = plan.operations.map((o) => `${o.type}:${o.resource}.${o.name}`);
    expect(ops).toContain("destroy:agent.bot");

    expect(result!.error).toBeNull();
    expect(result!.state.resources["agent.bot"]).toBeUndefined();

    const archiveCall = spy.calls.find((c) => c.method === "agents.archive");
    expect(archiveCall).toBeDefined();
    expect(archiveCall!.args[0]).toBe("agent_1");
  });

  test("S-5: destroy all resources in reverse dependency order", async () => {
    const state: StateFile = {
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
        "skill.search": {
          type: "skill",
          logical_name: "search",
          id: "skill_1",
          depends_on: [],
          latest_version: "ver_1",
          display_title: "Search Tool",
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:def",
        },
        "agent.bot": {
          type: "agent",
          logical_name: "bot",
          id: "agent_1",
          depends_on: ["skill.search"],
          version: 1,
          created_at: "2026-04-20T10:00:00Z",
          last_applied_hash: "sha256:ghi",
        },
      },
    };

    const sortedKeys = destroyOrder(state);
    const operations: Operation[] = sortedKeys.map((key) => {
      const entry = state.resources[key]!;
      return {
        type: "destroy" as const,
        resource: entry.type,
        name: entry.logical_name,
        id: entry.id,
      };
    });
    const plan: Plan = { operations, dependencies: {} };

    const spy = createSpyApiClient();
    const result = await applyPlan(plan, state, spy.client);

    expect(result.error).toBeNull();
    expect(result.applied).toBe(3);
    expect(Object.keys(result.state.resources)).toHaveLength(0);

    const methods = spy.calls.map((c) => c.method);
    const agentIdx = methods.indexOf("agents.archive");
    const skillIdx = methods.indexOf("skills.delete");
    const envIdx = methods.indexOf("environments.archive");
    expect(agentIdx).toBeLessThan(skillIdx);
    expect(skillIdx).toBeLessThan(envIdx);
  });

  test("S-6: partial apply recovery - re-plan after failure", async () => {
    const fs = fullMockFs();
    const state = createEmptyState();

    const failingSpy = createSpyApiClient({
      failOn: { method: "skills.create", error: new Error("API 500") },
    });

    const config = parseYaml(FULL_YAML);
    const plan = await generatePlan(config, state, { basePath: BASE_PATH, fs });
    const result = await applyPlan(plan, state, failingSpy.client);

    expect(result.error).not.toBeNull();
    expect(result.error!.message).toBe("API 500");
    expect(result.applied).toBeGreaterThanOrEqual(1);

    const savedState = result.state;
    expect(Object.keys(savedState.resources).length).toBeGreaterThan(0);
    expect(savedState.resources["skill.search"]).toBeUndefined();

    const retrySpy = createSpyApiClient();
    const rePlan = await generatePlan(config, savedState, { basePath: BASE_PATH, fs });

    const reOps = rePlan.operations.map((o) => `${o.type}:${o.resource}.${o.name}`);
    expect(reOps).toContain("create:skill.search");
    expect(reOps).toContain("create:agent.bot");
    expect(reOps).not.toContain("create:environment.dev");

    const retryResult = await applyPlan(rePlan, savedState, retrySpy.client);
    expect(retryResult.error).toBeNull();
    expect(retryResult.state.resources["skill.search"]).toBeDefined();
    expect(retryResult.state.resources["agent.bot"]).toBeDefined();
  });

  test("S-7: no changes when config and state match", async () => {
    const fs = fullMockFs();
    const spy = createSpyApiClient();
    const state = createEmptyState();

    const { result: firstResult } = await runFullPipeline(FULL_YAML, state, fs, spy);
    const appliedState = firstResult!.state;

    const config = parseYaml(FULL_YAML);
    const secondPlan = await generatePlan(config, appliedState, { basePath: BASE_PATH, fs });

    expect(secondPlan.operations).toHaveLength(0);
  });
});
