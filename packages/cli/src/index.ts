import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseYaml,
  generatePlan,
  applyPlan,
  createEmptyState,
  parseState,
  serializeState,
  destroyOrder,
  LocalFileSystem,
  SdkApiClient,
} from "@agup/core";
import type { ApiClient, Operation, Plan, StateFile } from "@agup/core";

const DEFAULT_CONFIG_PATH = "agup.yaml";
const DEFAULT_STATE_PATH = "agup.state.json";

type CommandName = "plan" | "apply" | "destroy" | "state" | "version";

type CliOptions = {
  autoApprove: boolean;
  configPath: string;
  statePath: string;
};

type ParsedCliArgs = {
  command: CommandName | null;
  options: CliOptions;
  showHelp: boolean;
};

function isCommandName(value: string): value is CommandName {
  return value === "plan"
    || value === "apply"
    || value === "destroy"
    || value === "state"
    || value === "version";
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const options: CliOptions = {
    autoApprove: false,
    configPath: DEFAULT_CONFIG_PATH,
    statePath: DEFAULT_STATE_PATH,
  };
  let command: CommandName | null = null;
  let showHelp = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;

    if (arg === "-h" || arg === "--help") {
      if (command && command !== "version") {
        throw new Error("The help flag cannot be combined with another command.");
      }
      showHelp = true;
      continue;
    }

    if (arg === "-v" || arg === "--version") {
      if (showHelp) {
        throw new Error("The version flag cannot be combined with the help flag.");
      }
      if (command && command !== "version") {
        throw new Error("The version flag cannot be combined with another command.");
      }
      command = "version";
      continue;
    }

    if (arg === "-y" || arg === "--yes") {
      options.autoApprove = true;
      continue;
    }

    if (arg === "--config") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("Missing value for --config.");
      }
      options.configPath = value;
      i += 1;
      continue;
    }

    if (arg === "--state") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("Missing value for --state.");
      }
      options.statePath = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!isCommandName(arg)) {
      throw new Error(`Unknown command: ${arg}`);
    }

    if (command) {
      throw new Error(`Multiple commands specified: ${command} and ${arg}`);
    }

    command = arg;
  }

  return { command, options, showHelp };
}

async function main() {
  const { command, options, showHelp } = parseCliArgs(process.argv.slice(2));

  if (showHelp) {
    printUsage();
    return;
  }

  switch (command) {
    case "version":
      await printVersion();
      break;
    case "plan":
      await runPlan(options.configPath, options.statePath);
      break;
    case "apply":
      await runApply(options, options.autoApprove);
      break;
    case "destroy":
      await runDestroy(options.statePath, options.autoApprove);
      break;
    case "state":
      await runState(options.statePath);
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

function resolveCliPaths(configPath: string, statePath: string) {
  const resolvedConfigPath = path.resolve(configPath);
  const resolvedStatePath = path.resolve(statePath);
  const basePath = path.dirname(resolvedConfigPath);

  return {
    configPath: resolvedConfigPath,
    statePath: resolvedStatePath,
    basePath,
  };
}

async function runPlan(configPathArg: string, statePathArg: string) {
  const { configPath, statePath, basePath } = resolveCliPaths(configPathArg, statePathArg);

  const config = await loadConfig(configPath);
  const state = await loadState(statePath);
  const localFs = new LocalFileSystem();

  const plan = await generatePlan(config, state, { basePath, fs: localFs });
  printPlan(plan);
}

async function runApply(options: CliOptions, autoApprove = false) {
  const { configPath, statePath, basePath } = resolveCliPaths(options.configPath, options.statePath);

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

async function runDestroy(statePathArg: string, autoApprove = false) {
  const statePath = path.resolve(statePathArg);
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

async function runState(statePathArg: string) {
  const statePath = path.resolve(statePathArg);
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
  return new SdkApiClient();
}

async function printVersion() {
  const selfDir = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(selfDir, "..", "package.json");
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
  console.log(`agup ${pkg.version}`);
}

function printUsage() {
  console.log(`
Usage: agup <command> [options]

Commands:
  plan      Show execution plan
  apply     Apply changes
  destroy   Destroy all managed resources
  state     Show current state
  version   Show version

Options:
  -h, --help      Show help
  -v, --version   Show version
  -y, --yes       Skip confirmation prompts
  --config <path> Config file path (default: ./agup.yaml)
  --state <path>  State file path (default: ./agup.state.json)
`);
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  });
}
