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
    create(params: Record<string, unknown>): Promise<ApiAgent>;
    update(id: string, params: Record<string, unknown>): Promise<ApiAgent>;
    archive(id: string): Promise<void>;
  };
  skills: {
    create(name: string, params: Record<string, unknown>): Promise<ApiSkill>;
    createVersion(name: string, skillId: string, params: Record<string, unknown>): Promise<ApiSkillVersion>;
    delete(skillId: string): Promise<void>;
  };
  environments: {
    create(params: Record<string, unknown>): Promise<ApiEnvironment>;
    update(id: string, params: Record<string, unknown>): Promise<ApiEnvironment>;
    archive(id: string): Promise<void>;
  };
}
