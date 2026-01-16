import type { FastifyRequest, FastifyReply } from 'fastify';

export interface AuthConfig {
  enabled: boolean;
  apiKeys: Set<string>;
}

let config: AuthConfig = {
  enabled: false,
  apiKeys: new Set()
};

export function configureAuth(options: { enabled?: boolean; keys?: string[] }): void {
  config.enabled = options.enabled ?? false;
  if (options.keys) {
    config.apiKeys = new Set(options.keys);
  }
}

export function isAuthEnabled(): boolean {
  return config.enabled;
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!config.enabled) return;

  const apiKey = request.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    reply.status(401).send({ ok: false, error: 'Missing API key' });
    return;
  }

  if (!config.apiKeys.has(apiKey)) {
    reply.status(403).send({ ok: false, error: 'Invalid API key' });
    return;
  }
}

// Load keys from environment
export function loadAuthFromEnv(): void {
  const enabled = process.env.SCRUM_AUTH_ENABLED === 'true';
  const keysStr = process.env.SCRUM_API_KEYS || '';
  const keys = keysStr.split(',').filter(k => k.trim().length > 0);

  configureAuth({ enabled, keys });
}
