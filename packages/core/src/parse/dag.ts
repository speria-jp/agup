import type { ParsedConfig } from "./parser.ts";
import type { Expr } from "./expression.ts";

export interface DagNode {
  key: string;
  dependencies: string[];
}

export interface Dag {
  nodes: Map<string, DagNode>;
  sorted: string[];
}

export function buildDag(config: ParsedConfig): Dag {
  const nodes = new Map<string, DagNode>();

  const resourceKeys: string[] = [];

  if (config.raw.environments) {
    for (const name of Object.keys(config.raw.environments)) {
      const key = `environment.${name}`;
      resourceKeys.push(key);
      nodes.set(key, { key, dependencies: [] });
    }
  }

  if (config.raw.skills) {
    for (const name of Object.keys(config.raw.skills)) {
      const key = `skill.${name}`;
      resourceKeys.push(key);
      nodes.set(key, { key, dependencies: [] });
    }
  }

  if (config.raw.agents) {
    for (const name of Object.keys(config.raw.agents)) {
      const key = `agent.${name}`;
      resourceKeys.push(key);
      nodes.set(key, { key, dependencies: [] });
    }
  }

  for (const [path, stringWithExprs] of config.expressions) {
    const ownerKey = resolveOwnerKey(path, resourceKeys);
    if (!ownerKey) continue;

    const node = nodes.get(ownerKey);
    if (!node) continue;

    if (stringWithExprs.type === "template") {
      for (const part of stringWithExprs.parts) {
        if (part.type === "expr") {
          const dep = exprToDependency(part.expr);
          if (dep && nodes.has(dep) && dep !== ownerKey) {
            if (!node.dependencies.includes(dep)) {
              node.dependencies.push(dep);
            }
          }
        }
      }
    }
  }

  const sorted = topologicalSort(nodes);

  return { nodes, sorted };
}

function resolveOwnerKey(path: string, resourceKeys: string[]): string | null {
  for (const key of resourceKeys) {
    const [type, name] = key.split(".");
    const prefix = `${type}s.${name}`;
    if (path === prefix || path.startsWith(`${prefix}.`)) {
      return key;
    }
  }
  return null;
}

function exprToDependency(expr: Expr): string | null {
  if (expr.type === "resource_ref") {
    return `${expr.resource}.${expr.name}`;
  }
  return null;
}

function topologicalSort(nodes: Map<string, DagNode>): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: string[] = [];

  function visit(key: string, path: string[]): void {
    if (visited.has(key)) return;

    if (visiting.has(key)) {
      const cycle = [...path.slice(path.indexOf(key)), key];
      throw new Error(`Circular dependency detected: ${cycle.join(" → ")}`);
    }

    visiting.add(key);
    path.push(key);

    const node = nodes.get(key);
    if (node) {
      for (const dep of node.dependencies) {
        visit(dep, path);
      }
    }

    path.pop();
    visiting.delete(key);
    visited.add(key);
    result.push(key);
  }

  for (const key of nodes.keys()) {
    visit(key, []);
  }

  return result;
}
