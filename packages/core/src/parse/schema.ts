import { z } from "zod";

export const EnvironmentConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  config: z.object({
    type: z.literal("cloud"),
    networking: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("unrestricted") }),
        z.object({
          type: z.literal("limited"),
          allowed_hosts: z.array(z.string()).optional(),
          allow_mcp_servers: z.boolean().optional(),
          allow_package_managers: z.boolean().optional(),
        }),
      ])
      .optional(),
    packages: z
      .object({
        pip: z.array(z.string()).optional(),
        npm: z.array(z.string()).optional(),
        apt: z.array(z.string()).optional(),
        cargo: z.array(z.string()).optional(),
        gem: z.array(z.string()).optional(),
        go: z.array(z.string()).optional(),
      })
      .optional(),
  }),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const SkillConfigSchema = z.object({
  display_title: z.string().optional(),
  directory: z.string(),
});

export const AgentConfigSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(2048).optional(),
  model: z.union([
    z.string(),
    z.object({
      id: z.string(),
      speed: z.enum(["standard", "fast"]).optional(),
    }),
  ]),
  system: z.string(),
  mcp_servers: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
      }),
    )
    .optional(),
  skills: z
    .array(
      z.object({
        type: z.enum(["anthropic", "custom"]),
        skill_id: z.string(),
        version: z.string().optional(),
      }),
    )
    .optional(),
  tools: z.array(z.unknown()).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const AgentformConfigSchema = z.object({
  environments: z.record(z.string(), EnvironmentConfigSchema).optional(),
  skills: z.record(z.string(), SkillConfigSchema).optional(),
  agents: z.record(z.string(), AgentConfigSchema).optional(),
});

export type AgentformConfig = z.infer<typeof AgentformConfigSchema>;
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;
export type SkillConfig = z.infer<typeof SkillConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
