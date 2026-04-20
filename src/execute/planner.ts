import type { FileSystem } from "../fs/interface.ts";
import type { StateFile } from "../types.ts";
import type { Operation, Plan } from "../types.ts";
import type { ParsedConfig } from "../parse/parser.ts";
import type { StringWithExprs, Expr } from "../parse/expression.ts";
import { computeHash, computeSkillHash } from "./hash.ts";
import { buildDag } from "../parse/dag.ts";
import { getEntry } from "../state/store.ts";
import * as path from "node:path";

export interface PlannerOptions {
  basePath: string;
  fs: FileSystem;
}

export async function generatePlan(
  config: ParsedConfig,
  state: StateFile,
  options: PlannerOptions,
): Promise<Plan> {
  const dag = buildDag(config);
  const operations: Operation[] = [];

  const resolvedConfigs = await resolveFileRefs(config, options);

  if (config.raw.environments) {
    for (const [name, envConfig] of Object.entries(config.raw.environments)) {
      const key = `environment.${name}`;
      const hash = computeHash(envConfig as unknown as Record<string, unknown>);
      const existing = getEntry(state, key);

      if (!existing) {
        operations.push({
          type: "create",
          resource: "environment",
          name,
          params: envConfig as unknown as Record<string, unknown>,
        });
      } else if (existing.last_applied_hash !== hash) {
        operations.push({
          type: "update",
          resource: "environment",
          name,
          id: existing.id,
          params: envConfig as unknown as Record<string, unknown>,
        });
      }
    }
  }

  if (config.raw.skills) {
    for (const [name, skillConfig] of Object.entries(config.raw.skills)) {
      const key = `skill.${name}`;
      const dirPath = path.resolve(options.basePath, skillConfig.directory);
      const files = await options.fs.readDirectory(dirPath);
      const hash = computeSkillHash(skillConfig.display_title, files);
      const existing = getEntry(state, key);

      if (!existing) {
        operations.push({
          type: "create",
          resource: "skill",
          name,
          params: {
            display_title: skillConfig.display_title,
            files,
          },
        });
      } else {
        const oldTitle = (existing as { display_title?: string }).display_title;
        const newTitle = skillConfig.display_title;
        const titleChanged = oldTitle !== newTitle;

        if (titleChanged) {
          operations.push({
            type: "destroy",
            resource: "skill",
            name,
            id: existing.id,
          });
          operations.push({
            type: "create",
            resource: "skill",
            name,
            params: {
              display_title: skillConfig.display_title,
              files,
            },
          });
        } else if (existing.last_applied_hash !== hash) {
          operations.push({
            type: "create_version",
            resource: "skill",
            name,
            id: existing.id,
            params: { files },
          });
        }
      }
    }
  }

  if (config.raw.agents) {
    for (const [name, agentConfig] of Object.entries(config.raw.agents)) {
      const key = `agent.${name}`;
      const resolved = resolvedConfigs.get(key) ?? (agentConfig as unknown as Record<string, unknown>);
      const hash = computeHash(resolved as Record<string, unknown>);
      const existing = getEntry(state, key);

      if (!existing) {
        operations.push({
          type: "create",
          resource: "agent",
          name,
          params: injectResourceRefs(resolved as Record<string, unknown>, config, state),
        });
      } else if (existing.last_applied_hash !== hash) {
        operations.push({
          type: "update",
          resource: "agent",
          name,
          id: existing.id,
          params: injectResourceRefs(resolved as Record<string, unknown>, config, state),
        });
      }
    }
  }

  for (const key of Object.keys(state.resources)) {
    const [type, name] = key.split(".");
    if (!type || !name) continue;

    const section = `${type}s` as keyof typeof config.raw;
    const sectionData = config.raw[section];
    if (!sectionData || !(name in sectionData)) {
      const entry = state.resources[key]!;
      operations.push({
        type: "destroy",
        resource: type as Operation["resource"],
        name,
        id: entry.id,
      });
    }
  }

  const sortedOps = sortOperations(operations, dag.sorted);
  return { operations: sortedOps };
}

async function resolveFileRefs(
  config: ParsedConfig,
  options: PlannerOptions,
): Promise<Map<string, Record<string, unknown>>> {
  const resolved = new Map<string, Record<string, unknown>>();

  if (config.raw.agents) {
    for (const [name, agentConfig] of Object.entries(config.raw.agents)) {
      const key = `agent.${name}`;
      const obj = { ...agentConfig } as Record<string, unknown>;

      for (const [exprPath, strExpr] of config.expressions) {
        if (!exprPath.startsWith(`agents.${name}.`)) continue;
        const resolvedValue = await resolveStringWithExprs(strExpr, options);
        const fieldPath = exprPath.slice(`agents.${name}.`.length);
        setNestedValue(obj, fieldPath, resolvedValue);
      }

      resolved.set(key, obj);
    }
  }

  return resolved;
}

async function resolveStringWithExprs(
  strExpr: StringWithExprs,
  options: PlannerOptions,
): Promise<string | { __expr: string; resource: string; name: string; attr: string }> {
  if (strExpr.type === "literal") return strExpr.value;

  const parts: string[] = [];
  let hasUnresolved = false;

  for (const part of strExpr.parts) {
    if (part.type === "text") {
      parts.push(part.value);
    } else if (part.expr.type === "file_ref") {
      const filePath = path.resolve(options.basePath, part.expr.path);
      const content = await options.fs.readFile(filePath);
      parts.push(content);
    } else {
      hasUnresolved = true;
      parts.push(`\${${part.expr.resource}.${part.expr.name}.${part.expr.attr}}`);
    }
  }

  if (hasUnresolved && strExpr.parts.length === 1 && strExpr.parts[0]!.type === "expr") {
    const expr = strExpr.parts[0]!.expr as Expr & { type: "resource_ref" };
    return {
      __expr: "resource_ref",
      resource: expr.resource,
      name: expr.name,
      attr: expr.attr,
    };
  }

  return parts.join("");
}

function injectResourceRefs(
  params: Record<string, unknown>,
  _config: ParsedConfig,
  _state: StateFile,
): Record<string, unknown> {
  return params;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const arr = current[arrayMatch[1]!] as unknown[];
      current = arr[parseInt(arrayMatch[2]!)] as Record<string, unknown>;
    } else {
      if (!(part in current) || typeof current[part] !== "object") {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
  }
  const last = parts[parts.length - 1]!;
  const arrayMatch = last.match(/^(.+)\[(\d+)\]$/);
  if (arrayMatch) {
    const arr = current[arrayMatch[1]!] as unknown[];
    arr[parseInt(arrayMatch[2]!)] = value;
  } else {
    current[last] = value;
  }
}

function sortOperations(operations: Operation[], dagOrder: string[]): Operation[] {
  const createKeys = new Set(
    operations.filter((op) => op.type === "create").map((op) => `${op.resource}.${op.name}`),
  );

  const isRecreateDestroy = (op: Operation) =>
    op.type === "destroy" && createKeys.has(`${op.resource}.${op.name}`);

  const pureDestroys = operations.filter((op) => op.type === "destroy" && !isRecreateDestroy(op));
  const nonDestroyOps = operations.filter((op) => op.type !== "destroy");
  const recreateDestroyMap = new Map(
    operations.filter(isRecreateDestroy).map((op) => [`${op.resource}.${op.name}`, op]),
  );

  nonDestroyOps.sort((a, b) => {
    const aIdx = dagOrder.indexOf(`${a.resource}.${a.name}`);
    const bIdx = dagOrder.indexOf(`${b.resource}.${b.name}`);
    return aIdx - bIdx;
  });

  pureDestroys.sort((a, b) => {
    const aIdx = dagOrder.indexOf(`${a.resource}.${a.name}`);
    const bIdx = dagOrder.indexOf(`${b.resource}.${b.name}`);
    return bIdx - aIdx;
  });

  const result: Operation[] = [];
  for (const op of nonDestroyOps) {
    const key = `${op.resource}.${op.name}`;
    const destroy = recreateDestroyMap.get(key);
    if (op.type === "create" && destroy) {
      result.push(destroy);
    }
    result.push(op);
  }
  result.push(...pureDestroys);
  return result;
}
