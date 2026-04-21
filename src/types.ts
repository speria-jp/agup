import type { FileEntry } from "./fs/interface.ts";

export type ResourceType = "environment" | "skill" | "agent";

// --- Operation params types ---

export interface EnvironmentParams {
  name: string;
  description?: string;
  config: {
    type: "cloud";
    networking?:
      | { type: "unrestricted" }
      | {
          type: "limited";
          allowed_hosts?: string[];
          allow_mcp_servers?: boolean;
          allow_package_managers?: boolean;
        };
    packages?: {
      pip?: string[];
      npm?: string[];
      apt?: string[];
      cargo?: string[];
      gem?: string[];
      go?: string[];
    };
  };
  metadata?: Record<string, string>;
}

export interface SkillCreateParams {
  display_title?: string;
  files: FileEntry[];
}

export interface SkillUpdateParams {
  files: FileEntry[];
}

export interface AgentParams {
  name: string;
  description?: string;
  model: string | { id: string; speed?: "standard" | "fast" };
  system: string;
  mcp_servers?: { name: string; url: string }[];
  skills?: { type: "anthropic" | "custom"; skill_id: string; version?: string }[];
  tools?: unknown[];
  metadata?: Record<string, string>;
}

export type Operation =
  | { type: "create"; resource: "environment"; name: string; params: EnvironmentParams }
  | { type: "update"; resource: "environment"; name: string; id: string; params: EnvironmentParams }
  | { type: "create"; resource: "skill"; name: string; params: SkillCreateParams }
  | { type: "update"; resource: "skill"; name: string; id: string; params: SkillUpdateParams }
  | { type: "create"; resource: "agent"; name: string; params: AgentParams }
  | { type: "update"; resource: "agent"; name: string; id: string; params: AgentParams }
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
