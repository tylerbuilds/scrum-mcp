import { nanoid } from 'nanoid';
import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type { KnowledgeEntry, KnowledgeCategory, KnowledgeSearchResult } from '../types.js';
import { type BaseRepository, now } from './base.js';

interface KnowledgeRow {
  id: string;
  title: string;
  content: string;
  category: string;
  tags_json: string;
  source_sprint_id: string | null;
  source_task_id: string | null;
  created_by: string;
  created_at: number;
  updated_at: number | null;
  archived_at: number | null;
}

export class KnowledgeRepository implements BaseRepository {
  private ftsAvailable = false;

  constructor(
    public readonly db: BetterSqlite3.Database,
    public readonly log: Logger
  ) {
    // Check if FTS5 table exists
    try {
      const result = this.db.prepare("SELECT count(*) as n FROM sqlite_master WHERE type='table' AND name='knowledge_fts'").get() as { n: number };
      this.ftsAvailable = result.n > 0;
    } catch {
      this.ftsAvailable = false;
    }
  }

  private rowToEntry(row: KnowledgeRow): KnowledgeEntry {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      category: row.category as KnowledgeCategory,
      tags: JSON.parse(row.tags_json || '[]'),
      sourceSprintId: row.source_sprint_id ?? undefined,
      sourceTaskId: row.source_task_id ?? undefined,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
      archivedAt: row.archived_at ?? undefined
    };
  }

  add(input: {
    title: string;
    content: string;
    category?: KnowledgeCategory;
    tags?: string[];
    sourceSprintId?: string;
    sourceTaskId?: string;
    createdBy: string;
  }): KnowledgeEntry {
    const entry: KnowledgeEntry = {
      id: nanoid(12),
      title: input.title,
      content: input.content,
      category: input.category ?? 'lesson',
      tags: input.tags ?? [],
      sourceSprintId: input.sourceSprintId,
      sourceTaskId: input.sourceTaskId,
      createdBy: input.createdBy,
      createdAt: now()
    };

    this.db.prepare(`INSERT INTO knowledge
      (id, title, content, category, tags_json, source_sprint_id, source_task_id, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(entry.id, entry.title, entry.content, entry.category,
           JSON.stringify(entry.tags), entry.sourceSprintId ?? null,
           entry.sourceTaskId ?? null, entry.createdBy, entry.createdAt);

    return entry;
  }

  get(id: string): KnowledgeEntry | null {
    const row = this.db.prepare('SELECT * FROM knowledge WHERE id = ?').get(id) as KnowledgeRow | undefined;
    return row ? this.rowToEntry(row) : null;
  }

  update(id: string, input: {
    title?: string;
    content?: string;
    category?: KnowledgeCategory;
    tags?: string[];
  }): KnowledgeEntry | null {
    const existing = this.get(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (input.title !== undefined) { updates.push('title = ?'); params.push(input.title); }
    if (input.content !== undefined) { updates.push('content = ?'); params.push(input.content); }
    if (input.category !== undefined) { updates.push('category = ?'); params.push(input.category); }
    if (input.tags !== undefined) { updates.push('tags_json = ?'); params.push(JSON.stringify(input.tags)); }

    if (updates.length === 0) return existing;

    updates.push('updated_at = ?');
    params.push(now());
    params.push(id);

    this.db.prepare(`UPDATE knowledge SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.get(id);
  }

  archive(id: string): boolean {
    const info = this.db.prepare('UPDATE knowledge SET archived_at = ? WHERE id = ? AND archived_at IS NULL')
      .run(now(), id);
    return info.changes > 0;
  }

  search(query: string, options?: {
    category?: KnowledgeCategory;
    tags?: string[];
    limit?: number;
    includeArchived?: boolean;
  }): KnowledgeSearchResult[] {
    if (this.ftsAvailable) {
      return this.searchFts(query, options);
    }
    return this.searchLike(query, options);
  }

  private searchFts(query: string, options?: {
    category?: KnowledgeCategory;
    tags?: string[];
    limit?: number;
    includeArchived?: boolean;
  }): KnowledgeSearchResult[] {
    const limit = options?.limit ?? 20;

    // Build FTS5 query
    let sql = `SELECT k.*, rank FROM knowledge_fts fts
      JOIN knowledge k ON k.rowid = fts.rowid
      WHERE knowledge_fts MATCH ?`;
    const params: (string | number)[] = [query];

    if (!options?.includeArchived) {
      sql += ' AND k.archived_at IS NULL';
    }
    if (options?.category) {
      sql += ' AND k.category = ?';
      params.push(options.category);
    }

    sql += ' ORDER BY rank LIMIT ?';
    params.push(limit);

    try {
      const rows = this.db.prepare(sql).all(...params) as (KnowledgeRow & { rank: number })[];
      return rows.map(r => ({
        entry: this.rowToEntry(r),
        rank: r.rank,
        snippet: r.content.slice(0, 200)
      }));
    } catch (e) {
      // FTS5 query syntax error, fall back to LIKE
      this.log.warn({ err: e, query }, 'FTS5 search failed, falling back to LIKE');
      return this.searchLike(query, options);
    }
  }

  private searchLike(query: string, options?: {
    category?: KnowledgeCategory;
    tags?: string[];
    limit?: number;
    includeArchived?: boolean;
  }): KnowledgeSearchResult[] {
    const limit = options?.limit ?? 20;
    const pattern = `%${query}%`;

    let sql = 'SELECT * FROM knowledge WHERE (title LIKE ? OR content LIKE ? OR tags_json LIKE ?)';
    const params: (string | number)[] = [pattern, pattern, pattern];

    if (!options?.includeArchived) {
      sql += ' AND archived_at IS NULL';
    }
    if (options?.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as KnowledgeRow[];
    return rows.map(r => ({
      entry: this.rowToEntry(r),
      snippet: r.content.slice(0, 200)
    }));
  }

  list(options?: {
    category?: KnowledgeCategory;
    createdBy?: string;
    limit?: number;
    includeArchived?: boolean;
  }): KnowledgeEntry[] {
    let sql = 'SELECT * FROM knowledge WHERE 1=1';
    const params: (string | number)[] = [];

    if (!options?.includeArchived) {
      sql += ' AND archived_at IS NULL';
    }
    if (options?.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }
    if (options?.createdBy) {
      sql += ' AND created_by = ?';
      params.push(options.createdBy);
    }

    sql += ' ORDER BY created_at DESC';
    sql += ` LIMIT ${options?.limit ?? 50}`;

    const rows = this.db.prepare(sql).all(...params) as KnowledgeRow[];
    return rows.map(r => this.rowToEntry(r));
  }
}
