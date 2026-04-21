export type ResourceType = "environment" | "skill" | "agent";

export type Operation =
  | { type: "create"; resource: ResourceType; name: string; params: Record<string, unknown> }
  | { type: "update"; resource: ResourceType; name: string; id: string; params: Record<string, unknown> }
  | { type: "create_version"; resource: "skill"; name: string; id: string; params: Record<string, unknown> }
  | { type: "destroy"; resource: ResourceType; name: string; id: string };

export interface Plan {
  operations: Operation[];
  dependencies: Record<string, string[]>;
}

export interface StateFile {
  version: 1;
  resources: Record<string, ResourceEntry>;
}

export type ResourceEntry =
  | EnvironmentEntry
  | SkillEntry
  | AgentEntry;

interface BaseEntry {
  type: ResourceType;
  logical_name: string;
  id: string;
  depends_on: string[];
  created_at: string;
  last_applied_hash: string;
}

export interface EnvironmentEntry extends BaseEntry {
  type: "environment";
}

export interface SkillEntry extends BaseEntry {
  type: "skill";
  latest_version: string;
  display_title?: string;
}

export interface AgentEntry extends BaseEntry {
  type: "agent";
  version: number;
}
