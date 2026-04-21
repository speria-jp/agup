import Anthropic from "@anthropic-ai/sdk";
import type { AgentCreateParams, AgentUpdateParams } from "@anthropic-ai/sdk/resources/beta/agents/agents.js";
import type { SkillCreateParams } from "@anthropic-ai/sdk/resources/beta/skills/skills.js";
import type { VersionCreateParams } from "@anthropic-ai/sdk/resources/beta/skills/versions.js";
import type { EnvironmentCreateParams, EnvironmentUpdateParams } from "@anthropic-ai/sdk/resources/beta/environments.js";
import type { ApiClient, ApiAgent, ApiSkill, ApiSkillVersion, ApiEnvironment } from "./interface.ts";

const MAX_RETRIES = 3;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

export class SdkApiClient implements ApiClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey });
  }

  agents = {
    create: async (params: Record<string, unknown>): Promise<ApiAgent> => {
      const result = await this.withRetry(() =>
        this.client.beta.agents.create(params as unknown as AgentCreateParams),
      );
      return { id: result.id, version: result.version };
    },

    update: async (id: string, params: Record<string, unknown>): Promise<ApiAgent> => {
      const result = await this.withRetry(() =>
        this.client.beta.agents.update(id, params as unknown as AgentUpdateParams),
      );
      return { id: result.id, version: result.version };
    },

    archive: async (id: string): Promise<void> => {
      await this.withRetry(() => this.client.beta.agents.archive(id));
    },
  };

  skills = {
    create: async (params: Record<string, unknown>): Promise<ApiSkill> => {
      const result = await this.withRetry(() =>
        this.client.beta.skills.create(params as SkillCreateParams),
      );
      return { id: result.id };
    },

    createVersion: async (skillId: string, params: Record<string, unknown>): Promise<ApiSkillVersion> => {
      const result = await this.withRetry(() =>
        this.client.beta.skills.versions.create(skillId, params as VersionCreateParams),
      );
      return { skill_id: result.skill_id, version_id: result.version };
    },

    delete: async (skillId: string): Promise<void> => {
      await this.withRetry(() => this.client.beta.skills.delete(skillId));
    },
  };

  environments = {
    create: async (params: Record<string, unknown>): Promise<ApiEnvironment> => {
      const result = await this.withRetry(() =>
        this.client.beta.environments.create(params as unknown as EnvironmentCreateParams),
      );
      return { id: result.id };
    },

    update: async (id: string, params: Record<string, unknown>): Promise<ApiEnvironment> => {
      const result = await this.withRetry(() =>
        this.client.beta.environments.update(id, params as EnvironmentUpdateParams),
      );
      return { id: result.id };
    },

    archive: async (id: string): Promise<void> => {
      await this.withRetry(() => this.client.beta.environments.archive(id));
    },
  };

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const status = (err as { status?: number }).status;

        if (status && !RETRY_STATUSES.has(status)) {
          throw err;
        }

        if (attempt < MAX_RETRIES) {
          const delay = Math.min(1000 * 2 ** attempt, 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}
