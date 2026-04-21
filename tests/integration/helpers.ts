import type { ApiClient } from "../../src/api/interface.ts";
import type { FileSystem, FileEntry } from "../../src/fs/interface.ts";

export interface ApiCall {
  method: string;
  args: unknown[];
}

export interface SpyApiClientOptions {
  failOn?: { method: string; error: Error };
}

export function createSpyApiClient(options: SpyApiClientOptions = {}) {
  const calls: ApiCall[] = [];
  let envCounter = 0;
  let skillCounter = 0;
  let agentCounter = 0;
  let agentVersion = 1;
  let skillVersionCounter = 0;

  function record(method: string, args: unknown[]) {
    calls.push({ method, args });
    if (options.failOn?.method === method) {
      throw options.failOn.error;
    }
  }

  const client: ApiClient = {
    environments: {
      async create(params) {
        record("environments.create", [params]);
        envCounter++;
        return { id: `env_${envCounter}` };
      },
      async update(id, params) {
        record("environments.update", [id, params]);
        return { id };
      },
      async archive(id) {
        record("environments.archive", [id]);
      },
    },
    skills: {
      async create(params) {
        record("skills.create", [params]);
        skillCounter++;
        return { id: `skill_${skillCounter}` };
      },
      async createVersion(skillId, params) {
        record("skills.createVersion", [skillId, params]);
        skillVersionCounter++;
        return { skill_id: skillId, version_id: `ver_${skillVersionCounter}` };
      },
      async delete(skillId) {
        record("skills.delete", [skillId]);
      },
    },
    agents: {
      async create(params) {
        record("agents.create", [params]);
        agentCounter++;
        agentVersion = 1;
        return { id: `agent_${agentCounter}`, version: agentVersion };
      },
      async update(id, params) {
        record("agents.update", [id, params]);
        agentVersion++;
        return { id, version: agentVersion };
      },
      async archive(id) {
        record("agents.archive", [id]);
      },
    },
  };

  return { client, calls };
}

export function createMockFs(files: Record<string, string | FileEntry[]>): FileSystem {
  return {
    async readFile(path: string) {
      const content = files[path];
      if (typeof content === "string") return content;
      throw new Error(`File not found: ${path}`);
    },
    async readDirectory(path: string) {
      const entries = files[path];
      if (Array.isArray(entries)) return entries;
      throw new Error(`Directory not found: ${path}`);
    },
  };
}
