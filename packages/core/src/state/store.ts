import { z } from "zod";
import type { StateFile, ResourceEntry } from "../types.ts";

const BaseEntrySchema = z.object({
  logical_name: z.string(),
  id: z.string(),
  depends_on: z.array(z.string()),
  created_at: z.string(),
  last_applied_hash: z.string(),
});

const EnvironmentEntrySchema = BaseEntrySchema.extend({
  type: z.literal("environment"),
});

const SkillEntrySchema = BaseEntrySchema.extend({
  type: z.literal("skill"),
  latest_version: z.string(),
  display_title: z.string().optional(),
});

const AgentEntrySchema = BaseEntrySchema.extend({
  type: z.literal("agent"),
  version: z.number(),
});

const ResourceEntrySchema = z.discriminatedUnion("type", [
  EnvironmentEntrySchema,
  SkillEntrySchema,
  AgentEntrySchema,
]);

const StateFileSchema = z.object({
  version: z.literal(1),
  resources: z.record(z.string(), ResourceEntrySchema),
});

export function createEmptyState(): StateFile {
  return { version: 1, resources: {} };
}

export function parseState(json: string): StateFile {
  const raw = JSON.parse(json);
  return StateFileSchema.parse(raw);
}

export function serializeState(state: StateFile): string {
  return JSON.stringify(state, null, 2) + "\n";
}

export function getEntry(state: StateFile, key: string): ResourceEntry | undefined {
  return state.resources[key];
}

export function setEntry(state: StateFile, key: string, entry: ResourceEntry): StateFile {
  return {
    ...state,
    resources: { ...state.resources, [key]: entry },
  };
}

export function removeEntry(state: StateFile, key: string): StateFile {
  const { [key]: _, ...rest } = state.resources;
  return { ...state, resources: rest };
}

export function destroyOrder(state: StateFile): string[] {
  const keys = Object.keys(state.resources);
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(key: string): void {
    if (visited.has(key)) return;
    visited.add(key);

    const entry = state.resources[key];
    if (entry?.depends_on) {
      for (const dep of entry.depends_on) {
        visit(dep);
      }
    }
    result.push(key);
  }

  for (const key of keys) {
    visit(key);
  }

  return result.reverse();
}
