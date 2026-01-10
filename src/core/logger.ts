import pino from 'pino';
import type { ScrumConfig } from './config';

export function createLogger(cfg: ScrumConfig) {
  return pino({
    level: cfg.SCRUM_LOG_LEVEL,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      remove: true
    }
  });
}
