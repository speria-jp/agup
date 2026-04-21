import Anthropic, { toFile } from "@anthropic-ai/sdk";
import type { AgentCreateParams, AgentUpdateParams } from "@anthropic-ai/sdk/resources/beta/agents/agents.js";
import type { SkillCreateParams } from "@anthropic-ai/sdk/resources/beta/skills/skills.js";
import type { VersionCreateParams } from "@anthropic-ai/sdk/resources/beta/skills/versions.js";
import type { EnvironmentCreateParams, EnvironmentUpdateParams } from "@anthropic-ai/sdk/resources/beta/environments.js";
import type { ApiClient, ApiAgent, ApiSkill, ApiSkillVersion, ApiEnvironment } from "./interface.ts";
import type { FileEntry } from "../fs/interface.ts";

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
    create: async (name: string, params: Record<string, unknown>): Promise<ApiSkill> => {
      const sdkParams = await this.toSkillParams(name, params);
      const result = await this.withRetry(() =>
        this.client.beta.skills.create(sdkParams),
      );
      return { id: result.id };
    },

    // Workaround: SDK's versions.create serializes files incorrectly (uses "files" instead of "files[]"),
    // causing the API to reject uploads. Use raw fetch with FormData until the SDK is fixed.
    createVersion: async (name: string, skillId: string, params: Record<string, unknown>): Promise<ApiSkillVersion> => {
      const fileEntries = (params.files ?? []) as FileEntry[];
      const formData = new FormData();
      for (const entry of fileEntries) {
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

  private async toSkillParams(name: string, params: Record<string, unknown>): Promise<SkillCreateParams & VersionCreateParams> {
    const fileEntries = (params.files ?? []) as FileEntry[];
    const files = await Promise.all(
      fileEntries.map((entry) => toFile(Buffer.from(entry.content), `${name}/${entry.path}`)),
    );
    return {
      ...(params.display_title != null ? { display_title: params.display_title as string } : {}),
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
