import { z } from 'zod';

const EnvSchema = z.object({
  SCRUM_PORT: z.coerce.number().int().positive().default(4177),
  SCRUM_BIND: z.string().default('127.0.0.1'),
  SCRUM_REPO_ROOT: z.string().default('.'),
  SCRUM_DB_PATH: z.string().default('.scrum/scrum.sqlite'),
  SCRUM_RATE_LIMIT_RPM: z.coerce.number().int().positive().default(300),
  SCRUM_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  // Strict mode: enforce compliance on REST API (not just MCP)
  // Default: true (recommended for production)
  // Set to false to allow dashboard/human overrides
  SCRUM_STRICT_MODE: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  // Sprint mode: enable collaborative Sprint features for multi-agent work
  // Default: true (recommended for teams with sub-agents)
  // When enabled, agents are prompted to use Sprint for coordinated work
  SCRUM_SPRINT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true')
});

export type ScrumConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): ScrumConfig {
  // If you use dotenv, load it before calling this function.
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${msg}`);
  }
  return parsed.data;
}
