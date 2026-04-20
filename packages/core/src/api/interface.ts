import type { EnvironmentParams, SkillCreateParams, SkillUpdateParams, AgentParams } from "../types.ts";

export interface ApiAgent {
  id: string;
  version: number;
}

export interface ApiSkill {
  id: string;
}

export interface ApiSkillVersion {
  skill_id: string;
  version_id: string;
}

export interface ApiEnvironment {
  id: string;
}

export interface ApiClient {
  agents: {
    create(params: AgentParams): Promise<ApiAgent>;
    update(id: string, params: AgentParams & { version: number }): Promise<ApiAgent>;
    archive(id: string): Promise<void>;
  };
  skills: {
    create(name: string, params: SkillCreateParams): Promise<ApiSkill>;
    createVersion(name: string, skillId: string, params: SkillUpdateParams): Promise<ApiSkillVersion>;
    delete(skillId: string): Promise<void>;
  };
  environments: {
    create(params: EnvironmentParams): Promise<ApiEnvironment>;
    update(id: string, params: EnvironmentParams): Promise<ApiEnvironment>;
    archive(id: string): Promise<void>;
  };
}
