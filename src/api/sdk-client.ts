import Anthropic from "@anthropic-ai/sdk";
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
        (this.client.beta as unknown as { agents: { create: (p: Record<string, unknown>) => Promise<{ id: string; version: number }> } }).agents.create(params),
      );
      return { id: result.id, version: result.version };
    },

    update: async (id: string, params: Record<string, unknown>): Promise<ApiAgent> => {
      const result = await this.withRetry(() =>
        (this.client.beta as unknown as { agents: { update: (id: string, p: Record<string, unknown>) => Promise<{ id: string; version: number }> } }).agents.update(id, params),
      );
      return { id: result.id, version: result.version };
    },

    archive: async (id: string): Promise<void> => {
      await this.withRetry(() =>
        (this.client.beta as unknown as { agents: { archive: (id: string) => Promise<void> } }).agents.archive(id),
      );
    },
  };

  skills = {
    create: async (params: Record<string, unknown>): Promise<ApiSkill> => {
      const result = await this.withRetry(() =>
        (this.client.beta as unknown as { skills: { create: (p: Record<string, unknown>) => Promise<{ id: string }> } }).skills.create(params),
      );
      return { id: result.id };
    },

    createVersion: async (skillId: string, params: Record<string, unknown>): Promise<ApiSkillVersion> => {
      const result = await this.withRetry(() =>
        (this.client.beta as unknown as { skills: { versions: { create: (id: string, p: Record<string, unknown>) => Promise<{ skill_id: string; version_id: string }> } } }).skills.versions.create(skillId, params),
      );
      return { skill_id: result.skill_id, version_id: result.version_id };
    },

    delete: async (skillId: string): Promise<void> => {
      await this.withRetry(() =>
        (this.client.beta as unknown as { skills: { delete: (id: string) => Promise<void> } }).skills.delete(skillId),
      );
    },
  };

  environments = {
    create: async (params: Record<string, unknown>): Promise<ApiEnvironment> => {
      const result = await this.withRetry(() =>
        (this.client.beta as unknown as { environments: { create: (p: Record<string, unknown>) => Promise<{ id: string }> } }).environments.create(params),
      );
      return { id: result.id };
    },

    update: async (id: string, params: Record<string, unknown>): Promise<ApiEnvironment> => {
      const result = await this.withRetry(() =>
        (this.client.beta as unknown as { environments: { update: (id: string, p: Record<string, unknown>) => Promise<{ id: string }> } }).environments.update(id, params),
      );
      return { id: result.id };
    },

    archive: async (id: string): Promise<void> => {
      await this.withRetry(() =>
        (this.client.beta as unknown as { environments: { archive: (id: string) => Promise<void> } }).environments.archive(id),
      );
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
