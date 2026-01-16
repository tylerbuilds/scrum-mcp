import { nanoid } from 'nanoid';
import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type { ChangelogEntry, ChangeType } from '../types.js';
import { type BaseRepository, clipOutput, now } from './base.js';

// Database row types
interface ChangelogRow {
  id: string;
  task_id: string | null;
  agent_id: string;
  file_path: string;
  change_type: string;
  summary: string;
  diff_snippet: string | null;
  commit_hash: string | null;
  created_at: number;
}

/**
 * Changelog Repository - handles changelog logging and search
 */
export class ChangelogRepository implements BaseRepository {
  constructor(
    public readonly db: BetterSqlite3.Database,
    public readonly log: Logger
  ) {}

  // ==================== ROW MAPPERS ====================

  private rowToEntry(row: ChangelogRow): ChangelogEntry {
    return {
      id: row.id,
      taskId: row.task_id ?? undefined,
      agentId: row.agent_id,
      filePath: row.file_path,
      changeType: row.change_type as ChangeType,
      summary: row.summary,
      diffSnippet: row.diff_snippet ?? undefined,
      commitHash: row.commit_hash ?? undefined,
      createdAt: row.created_at
    };
  }

  // ==================== CHANGELOG MANAGEMENT ====================

  logChange(input: {
    taskId?: string;
    agentId: string;
    filePath: string;
    changeType: ChangeType;
    summary: string;
    diffSnippet?: string;
    commitHash?: string;
  }): ChangelogEntry {
    const entry: ChangelogEntry = {
      id: nanoid(12),
      taskId: input.taskId,
      agentId: input.agentId,
      filePath: input.filePath,
      changeType: input.changeType,
      summary: input.summary,
      diffSnippet: input.diffSnippet ? clipOutput(input.diffSnippet) : undefined,
      commitHash: input.commitHash,
      createdAt: now()
    };

    this.db
      .prepare(
        'INSERT INTO changelog (id, task_id, agent_id, file_path, change_type, summary, diff_snippet, commit_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        entry.id,
        entry.taskId ?? null,
        entry.agentId,
        entry.filePath,
        entry.changeType,
        entry.summary,
        entry.diffSnippet ?? null,
        entry.commitHash ?? null,
        entry.createdAt
      );

    return entry;
  }

  searchChangelog(options: {
    filePath?: string;
    agentId?: string;
    taskId?: string;
    changeType?: ChangeType;
    since?: number;
    until?: number;
    query?: string;
    limit?: number;
  }): ChangelogEntry[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.filePath) {
      conditions.push('file_path LIKE ?');
      params.push(`%${options.filePath}%`);
    }
    if (options.agentId) {
      conditions.push('agent_id = ?');
      params.push(options.agentId);
    }
    if (options.taskId) {
      conditions.push('task_id = ?');
      params.push(options.taskId);
    }
    if (options.changeType) {
      conditions.push('change_type = ?');
      params.push(options.changeType);
    }
    if (options.since) {
      conditions.push('created_at >= ?');
      params.push(options.since);
    }
    if (options.until) {
      conditions.push('created_at <= ?');
      params.push(options.until);
    }
    if (options.query) {
      conditions.push('(summary LIKE ? OR diff_snippet LIKE ?)');
      params.push(`%${options.query}%`, `%${options.query}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit ?? 100;

    const rows = this.db
      .prepare(`SELECT * FROM changelog ${whereClause} ORDER BY created_at DESC LIMIT ?`)
      .all(...params, limit) as ChangelogRow[];

    return rows.map((r) => this.rowToEntry(r));
  }

  getFileHistory(filePath: string, limit = 50): ChangelogEntry[] {
    return this.searchChangelog({ filePath, limit });
  }
}
