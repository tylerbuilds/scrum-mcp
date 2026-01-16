import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';

/**
 * Base interface for domain repositories.
 * All repositories have access to the database and logger.
 */
export interface BaseRepository {
  readonly db: BetterSqlite3.Database;
  readonly log: Logger;
}

/**
 * Common database row type for counting
 */
export interface CountRow {
  n: number;
}

/**
 * Utility: Get current timestamp in milliseconds
 */
export function now(): number {
  return Date.now();
}

/**
 * Maximum characters for output fields (evidence, diffs, etc.)
 */
export const MAX_OUTPUT_CHARS = 20000;

/**
 * Utility: Clip output to MAX_OUTPUT_CHARS
 */
export function clipOutput(s: string): string {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  return s.slice(0, MAX_OUTPUT_CHARS) + `\n[clipped to ${MAX_OUTPUT_CHARS} chars]`;
}
