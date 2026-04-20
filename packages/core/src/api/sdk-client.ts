import Anthropic, { toFile } from "@anthropic-ai/sdk";
import type { AgentCreateParams, AgentUpdateParams } from "@anthropic-ai/sdk/resources/beta/agents/agents.js";
import type { SkillCreateParams as SdkSkillCreateParams } from "@anthropic-ai/sdk/resources/beta/skills/skills.js";
import type { VersionCreateParams as SdkVersionCreateParams } from "@anthropic-ai/sdk/resources/beta/skills/versions.js";
import type { EnvironmentCreateParams as SdkEnvCreateParams, EnvironmentUpdateParams as SdkEnvUpdateParams } from "@anthropic-ai/sdk/resources/beta/environments.js";
import type { ApiClient, ApiAgent, ApiSkill, ApiSkillVersion, ApiEnvironment } from "./interface.ts";
import type { EnvironmentParams, SkillCreateParams, SkillUpdateParams, AgentParams } from "../types.ts";

const MAX_RETRIES = 3;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

export class SdkApiClient implements ApiClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey });
  }

  agents = {
    create: async (params: AgentParams): Promise<ApiAgent> => {
      const result = await this.withRetry(() =>
        this.client.beta.agents.create(params as unknown as AgentCreateParams),
      );
      return { id: result.id, version: result.version };
    },

    update: async (id: string, params: AgentParams & { version: number }): Promise<ApiAgent> => {
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
    create: async (name: string, params: SkillCreateParams): Promise<ApiSkill> => {
      const sdkParams = await this.toSkillParams(name, params);
      const result = await this.withRetry(() =>
        this.client.beta.skills.create(sdkParams),
      );
      return { id: result.id };
    },

    createVersion: async (name: string, skillId: string, params: SkillUpdateParams): Promise<ApiSkillVersion> => {
      const formData = new FormData();
      for (const entry of params.files) {
        formData.append("files[]", new File([entry.content], `${name}/${entry.path}`));
      }
      const result = await this.withRetry(async () => {
        const resp = await fetch(
          `https://api.anthropic.com/v1/skills/${skillId}/versions?beta=true`,
          {
            method: "POST",
            headers: {
              "x-api-key": this.client.apiKey!,
              "anthropic-version": "2023-06-01",
              "anthropic-beta": "skills-2025-10-02",
            },
            body: formData,
          },
        );
        if (!resp.ok) {
          const text = await resp.text();
          const err = new Error(text) as Error & { status: number };
          err.status = resp.status;
          throw err;
        }
        return resp.json() as Promise<{ skill_id: string; version: string }>;
      });
      return { skill_id: result.skill_id, version_id: result.version };
    },

    delete: async (skillId: string): Promise<void> => {
      const versions = await this.client.beta.skills.versions.list(skillId);
      for await (const ver of versions) {
        await this.withRetry(() =>
          this.client.beta.skills.versions.delete(ver.version, { skill_id: skillId }),
        );
      }
      await this.withRetry(() => this.client.beta.skills.delete(skillId));
    },
  };

  environments = {
    create: async (params: EnvironmentParams): Promise<ApiEnvironment> => {
      const result = await this.withRetry(() =>
        this.client.beta.environments.create(params as unknown as SdkEnvCreateParams),
      );
      return { id: result.id };
    },

    update: async (id: string, params: EnvironmentParams): Promise<ApiEnvironment> => {
      const result = await this.withRetry(() =>
        this.client.beta.environments.update(id, params as unknown as SdkEnvUpdateParams),
      );
      return { id: result.id };
    },

    archive: async (id: string): Promise<void> => {
      await this.withRetry(() => this.client.beta.environments.archive(id));
    },
  };

  private async toSkillParams(name: string, params: SkillCreateParams): Promise<SdkSkillCreateParams & SdkVersionCreateParams> {
    const files = await Promise.all(
      params.files.map((entry) => toFile(Buffer.from(entry.content), `${name}/${entry.path}`)),
    );
    return {
      ...(params.display_title != null ? { display_title: params.display_title } : {}),
      files,
    };
  }

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
