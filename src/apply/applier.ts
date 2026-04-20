import type { ApiClient } from "../api/interface.ts";
import type { Operation, Plan, StateFile, ResourceEntry, SkillEntry, AgentEntry } from "../types.ts";
import { setEntry, removeEntry } from "../state/store.ts";
import { computeHash } from "../execute/hash.ts";

export interface ApplyResult {
  state: StateFile;
  applied: number;
  failed: Operation | null;
  error: Error | null;
}

export async function applyPlan(
  plan: Plan,
  state: StateFile,
  apiClient: ApiClient,
): Promise<ApplyResult> {
  let currentState = state;
  let applied = 0;

  for (const operation of plan.operations) {
    try {
      currentState = await applyOperation(operation, currentState, apiClient);
      applied++;
    } catch (err) {
      return {
        state: currentState,
        applied,
        failed: operation,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  return { state: currentState, applied, failed: null, error: null };
}

async function applyOperation(
  operation: Operation,
  state: StateFile,
  apiClient: ApiClient,
): Promise<StateFile> {
  const key = `${operation.resource}.${operation.name}`;
  const params = resolveParams(operation, state);

  switch (operation.type) {
    case "create": {
      const entry = await createResource(operation.resource, operation.name, params, apiClient);
      return setEntry(state, key, entry);
    }
    case "update": {
      const entry = await updateResource(operation.resource, operation.id, params, state, apiClient);
      return setEntry(state, key, entry);
    }
    case "create_version": {
      const result = await apiClient.skills.createVersion(operation.id, params);
      const existing = state.resources[key] as SkillEntry;
      const updated: SkillEntry = {
        ...existing,
        latest_version: result.version_id,
        last_applied_hash: computeHash(params),
      };
      return setEntry(state, key, updated);
    }
    case "destroy": {
      await destroyResource(operation.resource, operation.id, apiClient);
      return removeEntry(state, key);
    }
  }
}

function resolveParams(
  operation: Operation,
  state: StateFile,
): Record<string, unknown> {
  if (operation.type === "destroy") return {};
  return deepResolveRefs(operation.params, state);
}

function deepResolveRefs(obj: unknown, state: StateFile): Record<string, unknown> {
  if (obj === null || obj === undefined) return obj as never;

  if (Array.isArray(obj)) {
    return obj.map((item) => deepResolveRefs(item, state)) as never;
  }

  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    if (record.__expr === "resource_ref") {
      return resolveResourceRef(record, state) as never;
    }
    if (record.__expr === "template") {
      return resolveTemplate(record, state) as never;
    }

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      result[k] = deepResolveRefs(v, state);
    }
    return result;
  }

  return obj as never;
}

function resolveResourceRef(record: Record<string, unknown>, state: StateFile): unknown {
  const key = `${record.resource}.${record.name}`;
  const entry = state.resources[key];
  if (!entry) {
    throw new Error(`Cannot resolve reference: \${${key}.${record.attr}}`);
  }
  const attr = record.attr as string;
  return (entry as unknown as Record<string, unknown>)[attr];
}

function resolveTemplate(record: Record<string, unknown>, state: StateFile): string {
  const parts = record.parts as Array<{ type: string; value?: string; ast?: Record<string, unknown> }>;
  return parts.map((part) => {
    if (part.type === "text") return part.value!;
    return String(resolveResourceRef(part.ast!, state));
  }).join("");
}

async function createResource(
  resource: string,
  name: string,
  params: Record<string, unknown>,
  apiClient: ApiClient,
): Promise<ResourceEntry> {
  const now = new Date().toISOString();
  const hash = computeHash(params);

  switch (resource) {
    case "environment": {
      const result = await apiClient.environments.create(params);
      return {
        type: "environment",
        logical_name: name,
        id: result.id,
        created_at: now,
        last_applied_hash: hash,
      };
    }
    case "skill": {
      const result = await apiClient.skills.create(params);
      const displayTitle = (params.display_title as string | undefined) ?? undefined;
      return {
        type: "skill",
        logical_name: name,
        id: result.id,
        latest_version: "",
        display_title: displayTitle,
        created_at: now,
        last_applied_hash: hash,
      };
    }
    case "agent": {
      const result = await apiClient.agents.create(params);
      return {
        type: "agent",
        logical_name: name,
        id: result.id,
        version: result.version,
        created_at: now,
        last_applied_hash: hash,
      };
    }
    default:
      throw new Error(`Unknown resource type: ${resource}`);
  }
}

async function updateResource(
  resource: string,
  id: string,
  params: Record<string, unknown>,
  state: StateFile,
  apiClient: ApiClient,
): Promise<ResourceEntry> {
  const key = Object.keys(state.resources).find((k) => state.resources[k]!.id === id);
  const existing = key ? state.resources[key] : undefined;
  const hash = computeHash(params);

  switch (resource) {
    case "environment": {
      await apiClient.environments.update(id, params);
      return { ...existing!, last_applied_hash: hash } as ResourceEntry;
    }
    case "agent": {
      const agentEntry = existing as AgentEntry;
      const result = await apiClient.agents.update(id, {
        ...params,
        version: agentEntry.version,
      });
      return {
        ...agentEntry,
        version: result.version,
        last_applied_hash: hash,
      };
    }
    default:
      throw new Error(`Update not supported for: ${resource}`);
  }
}

async function destroyResource(
  resource: string,
  id: string,
  apiClient: ApiClient,
): Promise<void> {
  switch (resource) {
    case "environment":
      await apiClient.environments.archive(id);
      break;
    case "skill":
      await apiClient.skills.delete(id);
      break;
    case "agent":
      await apiClient.agents.archive(id);
      break;
  }
}

