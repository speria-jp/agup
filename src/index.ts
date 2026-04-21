import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseYaml } from "./parse/parser.ts";
import { generatePlan } from "./execute/planner.ts";
import { applyPlan } from "./apply/applier.ts";
import { createEmptyState, parseState, serializeState, destroyOrder } from "./state/store.ts";
import { LocalFileSystem } from "./fs/local.ts";
import type { ApiClient } from "./api/interface.ts";
import type { Operation, Plan, StateFile } from "./types.ts";

const DEFAULT_CONFIG_PATH = "agup.yaml";
const DEFAULT_STATE_PATH = "agup.state.json";

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const command = process.argv[2];
  const autoApprove = hasFlag("--yes");

  switch (command) {
    case "plan":
      await runPlan();
      break;
    case "apply":
      await runApply(autoApprove);
      break;
    case "destroy":
      await runDestroy(autoApprove);
      break;
    case "state":
      await runState();
      break;
    default:
      printUsage();
      process.exit(1);
  }
}

async function loadConfig(configPath: string) {
  const yamlContent = await fs.readFile(configPath, "utf-8");
  return parseYaml(yamlContent);
}

async function loadState(statePath: string): Promise<StateFile> {
  try {
    const content = await fs.readFile(statePath, "utf-8");
    return parseState(content);
  } catch {
    return createEmptyState();
  }
}

async function saveState(statePath: string, state: StateFile): Promise<void> {
  await fs.writeFile(statePath, serializeState(state));
}

async function runPlan() {
  const configPath = path.resolve(DEFAULT_CONFIG_PATH);
  const statePath = path.resolve(DEFAULT_STATE_PATH);
  const basePath = path.dirname(configPath);

  const config = await loadConfig(configPath);
  const state = await loadState(statePath);
  const localFs = new LocalFileSystem();

  const plan = await generatePlan(config, state, { basePath, fs: localFs });
  printPlan(plan);
}

async function runApply(autoApprove = false) {
  const configPath = path.resolve(DEFAULT_CONFIG_PATH);
  const statePath = path.resolve(DEFAULT_STATE_PATH);
  const basePath = path.dirname(configPath);

  const config = await loadConfig(configPath);
  const state = await loadState(statePath);
  const localFs = new LocalFileSystem();

  const plan = await generatePlan(config, state, { basePath, fs: localFs });

  if (plan.operations.length === 0) {
    console.log("\nNo changes. Infrastructure is up-to-date.");
    return;
  }

  printPlan(plan);
  console.log("");

  if (!autoApprove) {
    const confirmed = await confirm("Do you want to apply these changes?");
    if (!confirmed) {
      console.log("Apply cancelled.");
      return;
    }
  }

  const apiClient = await createApiClient();
  const result = await applyPlan(plan, state, apiClient);
  await saveState(statePath, result.state);

  if (result.error) {
    console.error(`\nError applying ${result.failed!.resource}.${result.failed!.name}: ${result.error.message}`);
    console.log(`Applied ${result.applied}/${plan.operations.length} operations (partial apply).`);
    process.exit(1);
  }

  console.log(`\nApply complete! ${result.applied} operation(s) applied.`);
}

async function runDestroy(autoApprove = false) {
  const statePath = path.resolve(DEFAULT_STATE_PATH);
  const state = await loadState(statePath);

  const keys = Object.keys(state.resources);
  if (keys.length === 0) {
    console.log("No resources to destroy.");
    return;
  }

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
  printPlan(plan);
  console.log("");

  if (!autoApprove) {
    const confirmed = await confirm("Do you want to destroy all resources?");
    if (!confirmed) {
      console.log("Destroy cancelled.");
      return;
    }
  }

  const apiClient = await createApiClient();
  const result = await applyPlan(plan, state, apiClient);
  await saveState(statePath, result.state);

  if (result.error) {
    console.error(`\nError: ${result.error.message}`);
    process.exit(1);
  }

  console.log("\nAll resources destroyed.");
}

async function runState() {
  const statePath = path.resolve(DEFAULT_STATE_PATH);
  const state = await loadState(statePath);
  console.log(JSON.stringify(state, null, 2));
}

function printPlan(plan: Plan) {
  if (plan.operations.length === 0) {
    console.log("\nNo changes. Infrastructure is up-to-date.");
    return;
  }

  console.log(`\nPlan: ${plan.operations.length} operation(s)\n`);
  for (const op of plan.operations) {
    const symbol = operationSymbol(op);
    const label = `${op.resource}.${op.name}`;
    const detail = operationDetail(op);
    console.log(`  ${symbol} ${label}${detail}`);
  }
}

function operationSymbol(op: Operation): string {
  switch (op.type) {
    case "create": return "+";
    case "update": return "~";
    case "destroy": return "-";
  }
}

function operationDetail(op: Operation): string {
  switch (op.type) {
    case "create": return " (create)";
    case "update": return " (update)";
    case "destroy": return " (destroy)";
  }
}

async function confirm(message: string): Promise<boolean> {
  process.stdout.write(`${message} [y/N] `);
  for await (const line of console) {
    const answer = (line as string).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  }
  return false;
}

async function createApiClient(): Promise<ApiClient> {
  const { SdkApiClient } = await import("./api/sdk-client.ts");
  return new SdkApiClient();
}

function printUsage() {
  console.log(`
Usage: agup <command>

Commands:
  plan      Show execution plan
  apply     Apply changes
  destroy   Destroy all managed resources
  state     Show current state
`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
