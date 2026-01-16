import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type { Claim } from '../types.js';
import { type BaseRepository, now } from './base.js';

// Database row types
interface ClaimRow {
  agent_id: string;
  file_path: string;
  expires_at: number;
  created_at: number;
}

/**
 * Claims Repository - handles file claims, overlap checking, and expiration
 */
export class ClaimsRepository implements BaseRepository {
  constructor(
    public readonly db: BetterSqlite3.Database,
    public readonly log: Logger
  ) {}

  // ==================== CLAIM MANAGEMENT ====================

  createClaim(agentId: string, files: string[], ttlSeconds: number): { claim: Claim; conflictsWith: string[] } {
    this.pruneExpiredClaims();

    const ttlMs = Math.max(5, ttlSeconds) * 1000;
    const createdAt = now();
    const expiresAt = createdAt + ttlMs;

    const conflicts = this.findConflicts(agentId, files);

    if (conflicts.length > 0) {
      this.log.warn({ agentId, files, conflicts }, 'claim.conflict');
      return {
        claim: { agentId, files, expiresAt, createdAt },
        conflictsWith: conflicts
      };
    }

    const stmt = this.db.prepare('INSERT OR REPLACE INTO claims (agent_id, file_path, expires_at, created_at) VALUES (?, ?, ?, ?)');
    const tx = this.db.transaction((paths: string[]) => {
      for (const p of paths) stmt.run(agentId, p, expiresAt, createdAt);
    });
    tx(files);

    return {
      claim: { agentId, files, expiresAt, createdAt },
      conflictsWith: []
    };
  }

  listActiveClaims(): Claim[] {
    this.pruneExpiredClaims();
    const rows = this.db.prepare('SELECT agent_id, file_path, expires_at, created_at FROM claims ORDER BY created_at DESC').all() as ClaimRow[];
    const byAgent = new Map<string, { files: string[]; expiresAt: number; createdAt: number }>();
    for (const r of rows) {
      let entry = byAgent.get(r.agent_id);
      if (!entry) {
        entry = { files: [], expiresAt: r.expires_at, createdAt: r.created_at };
        byAgent.set(r.agent_id, entry);
      }
      entry.files.push(r.file_path);
      entry.expiresAt = Math.max(entry.expiresAt, r.expires_at);
      entry.createdAt = Math.min(entry.createdAt, r.created_at);
    }
    return [...byAgent.entries()].map(([agentId, v]) => ({ agentId, files: v.files, expiresAt: v.expiresAt, createdAt: v.createdAt }));
  }

  releaseClaims(agentId: string, files?: string[]): number {
    if (files && files.length > 0) {
      const placeholders = files.map(() => '?').join(',');
      const info = this.db
        .prepare(`DELETE FROM claims WHERE agent_id = ? AND file_path IN (${placeholders})`)
        .run(agentId, ...files);
      return info.changes;
    }
    const info = this.db.prepare('DELETE FROM claims WHERE agent_id = ?').run(agentId);
    return info.changes;
  }

  extendClaims(agentId: string, additionalSeconds: number, files?: string[]): { extended: number; newExpiresAt: number } {
    this.pruneExpiredClaims();

    const additionalMs = additionalSeconds * 1000;
    const newExpiresAt = now() + additionalMs;

    let info: { changes: number };
    if (files && files.length > 0) {
      const placeholders = files.map(() => '?').join(',');
      info = this.db
        .prepare(`UPDATE claims SET expires_at = ? WHERE agent_id = ? AND file_path IN (${placeholders})`)
        .run(newExpiresAt, agentId, ...files);
    } else {
      info = this.db
        .prepare('UPDATE claims SET expires_at = ? WHERE agent_id = ?')
        .run(newExpiresAt, agentId);
    }

    return { extended: info.changes, newExpiresAt };
  }

  getAgentClaims(agentId: string): string[] {
    this.pruneExpiredClaims();
    const rows = this.db
      .prepare('SELECT file_path FROM claims WHERE agent_id = ?')
      .all(agentId) as Array<{ file_path: string }>;
    return rows.map(r => r.file_path);
  }

  // ==================== PRIVATE HELPERS ====================

  pruneExpiredClaims(): void {
    const t = now();
    const info = this.db.prepare('DELETE FROM claims WHERE expires_at <= ?').run(t);
    if (info.changes > 0) this.log.debug({ changes: info.changes }, 'Pruned expired claims');
  }

  private findConflicts(agentId: string, files: string[]): string[] {
    if (files.length === 0) return [];
    const t = now();
    const placeholders = files.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT DISTINCT agent_id FROM claims WHERE agent_id != ? AND expires_at > ? AND file_path IN (${placeholders})`
      )
      .all(agentId, t, ...files) as Array<{ agent_id: string }>;
    return rows.map((r) => r.agent_id);
  }
}
