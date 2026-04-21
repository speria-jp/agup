import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import Anthropic from "@anthropic-ai/sdk";

const CLI_PATH = path.resolve(import.meta.dir, "../../src/index.ts");

let tmpDir: string;
let apiClient: Anthropic;
let resourceIds: { envId: string; skillId: string; agentId: string };

function ensureApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is required for E2E tests. Set it in your environment.",
    );
  }
}

async function runCli(command: string, cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const args = command.split(" ");
  const proc = Bun.spawn(["bun", "run", CLI_PATH, ...args], {
    cwd,
    env: { ...process.env },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { exitCode, stdout, stderr };
}

async function readState(cwd: string) {
  const content = await fs.readFile(path.join(cwd, "agup.state.json"), "utf-8");
  return JSON.parse(content);
}

const AGUP_YAML = `
environments:
  e2e-test:
    name: agup E2E Test Environment
    config:
      type: cloud

skills:
  e2e-greeting:
    display_title: E2E Greeting Skill
    directory: ./skills/greeting

agents:
  e2e-bot:
    name: agup E2E Test Agent
    model: claude-sonnet-4-6-20250514
    system: "\${file('./prompts/system.md')}"
    skills:
      - type: custom
        skill_id: "\${skill.e2e-greeting.id}"
`;

const SYSTEM_PROMPT = "You are a test agent created by agup E2E tests. Respond briefly.";
const SKILL_CONTENT = "# Greeting Skill\n\nA simple greeting skill for E2E testing.";
const SKILL_CONTENT_UPDATED = "# Greeting Skill\n\nUpdated content for version test.";

async function setupFixtures(dir: string) {
  await fs.mkdir(path.join(dir, "skills", "greeting"), { recursive: true });
  await fs.mkdir(path.join(dir, "prompts"), { recursive: true });
  await fs.writeFile(path.join(dir, "agup.yaml"), AGUP_YAML.trimStart());
  await fs.writeFile(path.join(dir, "prompts", "system.md"), SYSTEM_PROMPT);
  await fs.writeFile(path.join(dir, "skills", "greeting", "SKILL.md"), SKILL_CONTENT);
}

describe("E2E: Full Lifecycle", () => {
  beforeAll(async () => {
    ensureApiKey();
    apiClient = new Anthropic();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agup-e2e-"));
    await setupFixtures(tmpDir);
  });

  afterAll(async () => {
    if (!tmpDir) return;

    try {
      const state = await readState(tmpDir);
      if (Object.keys(state.resources).length > 0) {
        console.warn(
          `\n⚠️  E2E test left resources behind. State file preserved at:\n` +
          `   ${path.join(tmpDir, "agup.state.json")}\n` +
          `   Run 'cd ${tmpDir} && bun run ${CLI_PATH} destroy --yes' to clean up.\n`,
        );
        return;
      }
    } catch {
      // No state file or empty - safe to clean up
    }

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("E2E-1: plan shows create operations", async () => {
    const { exitCode, stdout } = await runCli("plan", tmpDir);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("+ environment.e2e-test (create)");
    expect(stdout).toContain("+ skill.e2e-greeting (create)");
    expect(stdout).toContain("+ agent.e2e-bot (create)");
  }, 30_000);

  test("E2E-1: apply creates all resources", async () => {
    const { exitCode, stdout, stderr } = await runCli("apply --yes", tmpDir);

    if (exitCode !== 0) {
      console.error("apply failed:", stderr, stdout);
    }
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Apply complete!");

    const state = await readState(tmpDir);
    expect(state.resources["environment.e2e-test"]).toBeDefined();
    expect(state.resources["skill.e2e-greeting"]).toBeDefined();
    expect(state.resources["agent.e2e-bot"]).toBeDefined();

    resourceIds = {
      envId: state.resources["environment.e2e-test"].id,
      skillId: state.resources["skill.e2e-greeting"].id,
      agentId: state.resources["agent.e2e-bot"].id,
    };
  }, 60_000);

  test("E2E-1: verify resources exist on remote", async () => {
    const env = await apiClient.beta.environments.retrieve(resourceIds.envId);
    expect(env.id).toBe(resourceIds.envId);
    expect(env.name).toBe("agup E2E Test Environment");
    expect(env.archived_at).toBeNull();

    const skill = await apiClient.beta.skills.retrieve(resourceIds.skillId);
    expect(skill.id).toBe(resourceIds.skillId);
    expect(skill.display_title).toBe("E2E Greeting Skill");

    const agent = await apiClient.beta.agents.retrieve(resourceIds.agentId);
    expect(agent.id).toBe(resourceIds.agentId);
    expect(agent.name).toBe("agup E2E Test Agent");
    expect(agent.system).toBe(SYSTEM_PROMPT);
    expect(agent.archived_at).toBeNull();
  }, 30_000);

  test("E2E-2: idempotent - no changes on re-plan", async () => {
    const { exitCode, stdout } = await runCli("plan", tmpDir);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("No changes. Infrastructure is up-to-date.");
  }, 30_000);

  test("E2E-2: idempotent - apply reports no changes", async () => {
    const { exitCode, stdout } = await runCli("apply --yes", tmpDir);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("No changes. Infrastructure is up-to-date.");
  }, 30_000);

  test("E2E-1: skill file update shows create_version", async () => {
    await fs.writeFile(
      path.join(tmpDir, "skills", "greeting", "SKILL.md"),
      SKILL_CONTENT_UPDATED,
    );

    const { exitCode, stdout } = await runCli("plan", tmpDir);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("^ skill.e2e-greeting (new version)");
  }, 30_000);

  test("E2E-1: apply creates new skill version", async () => {
    const { exitCode, stdout, stderr } = await runCli("apply --yes", tmpDir);

    if (exitCode !== 0) {
      console.error("apply failed:", stderr, stdout);
    }
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Apply complete!");

    const state = await readState(tmpDir);
    expect(state.resources["skill.e2e-greeting"].latest_version).toBeTruthy();
  }, 60_000);

  test("E2E-1: destroy removes all resources", async () => {
    const { exitCode, stdout, stderr } = await runCli("destroy --yes", tmpDir);

    if (exitCode !== 0) {
      console.error("destroy failed:", stderr, stdout);
    }
    expect(exitCode).toBe(0);
    expect(stdout).toContain("All resources destroyed.");

    const state = await readState(tmpDir);
    expect(Object.keys(state.resources)).toHaveLength(0);
  }, 60_000);

  test("E2E-1: verify resources archived on remote after destroy", async () => {
    const agent = await apiClient.beta.agents.retrieve(resourceIds.agentId);
    expect(agent.archived_at).not.toBeNull();

    const env = await apiClient.beta.environments.retrieve(resourceIds.envId);
    expect(env.archived_at).not.toBeNull();
  }, 30_000);
});
