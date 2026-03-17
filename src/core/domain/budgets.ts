import { nanoid } from 'nanoid';
import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type { BudgetEntry, BudgetLimit, BudgetStatus, BudgetCategory, BudgetPeriod } from '../types.js';
import { type BaseRepository, now } from './base.js';

interface BudgetEntryRow {
  id: string;
  agent_id: string;
  task_id: string | null;
  tokens_used: number;
  cost_usd: number;
  category: string;
  description: string | null;
  created_at: number;
}

interface BudgetLimitRow {
  id: string;
  agent_id: string | null;
  task_id: string | null;
  max_tokens: number | null;
  max_cost_usd: number | null;
  period: string;
  created_at: number;
  updated_at: number | null;
}

export class BudgetsRepository implements BaseRepository {
  constructor(
    public readonly db: BetterSqlite3.Database,
    public readonly log: Logger
  ) {}

  // Row mappers
  private rowToEntry(row: BudgetEntryRow): BudgetEntry {
    return {
      id: row.id,
      agentId: row.agent_id,
      taskId: row.task_id ?? undefined,
      tokensUsed: row.tokens_used,
      costUsd: row.cost_usd,
      category: row.category as BudgetCategory,
      description: row.description ?? undefined,
      createdAt: row.created_at
    };
  }

  private rowToLimit(row: BudgetLimitRow): BudgetLimit {
    return {
      id: row.id,
      agentId: row.agent_id ?? undefined,
      taskId: row.task_id ?? undefined,
      maxTokens: row.max_tokens ?? undefined,
      maxCostUsd: row.max_cost_usd ?? undefined,
      period: row.period as BudgetPeriod,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined
    };
  }

  // Log a budget usage entry
  logUsage(input: {
    agentId: string;
    taskId?: string;
    tokensUsed?: number;
    costUsd?: number;
    category?: BudgetCategory;
    description?: string;
  }): BudgetEntry {
    const entry: BudgetEntry = {
      id: nanoid(12),
      agentId: input.agentId,
      taskId: input.taskId,
      tokensUsed: input.tokensUsed ?? 0,
      costUsd: input.costUsd ?? 0,
      category: input.category ?? 'tool_use',
      description: input.description,
      createdAt: now()
    };

    this.db.prepare(`INSERT INTO budget_entries
      (id, agent_id, task_id, tokens_used, cost_usd, category, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(entry.id, entry.agentId, entry.taskId ?? null, entry.tokensUsed,
           entry.costUsd, entry.category, entry.description ?? null, entry.createdAt);

    return entry;
  }

  // Set or update a budget limit (upsert on unique constraint)
  setLimit(input: {
    agentId?: string;
    taskId?: string;
    maxTokens?: number;
    maxCostUsd?: number;
    period?: BudgetPeriod;
  }): BudgetLimit {
    const period = input.period ?? 'task';
    const t = now();

    // Check for existing limit
    const existing = this.db.prepare(
      `SELECT id FROM budget_limits WHERE agent_id IS ? AND task_id IS ? AND period = ?`
    ).get(input.agentId ?? null, input.taskId ?? null, period) as { id: string } | undefined;

    if (existing) {
      this.db.prepare(
        `UPDATE budget_limits SET max_tokens = ?, max_cost_usd = ?, updated_at = ? WHERE id = ?`
      ).run(input.maxTokens ?? null, input.maxCostUsd ?? null, t, existing.id);
      return this.getLimit(existing.id)!;
    }

    const limit: BudgetLimit = {
      id: nanoid(12),
      agentId: input.agentId,
      taskId: input.taskId,
      maxTokens: input.maxTokens,
      maxCostUsd: input.maxCostUsd,
      period,
      createdAt: t
    };

    this.db.prepare(`INSERT INTO budget_limits
      (id, agent_id, task_id, max_tokens, max_cost_usd, period, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(limit.id, limit.agentId ?? null, limit.taskId ?? null,
           limit.maxTokens ?? null, limit.maxCostUsd ?? null, limit.period, limit.createdAt);

    return limit;
  }

  getLimit(id: string): BudgetLimit | null {
    const row = this.db.prepare('SELECT * FROM budget_limits WHERE id = ?').get(id) as BudgetLimitRow | undefined;
    return row ? this.rowToLimit(row) : null;
  }

  removeLimit(id: string): boolean {
    const info = this.db.prepare('DELETE FROM budget_limits WHERE id = ?').run(id);
    return info.changes > 0;
  }

  listLimits(agentId?: string): BudgetLimit[] {
    let query = 'SELECT * FROM budget_limits';
    const params: (string | null)[] = [];
    if (agentId) {
      query += ' WHERE agent_id = ? OR agent_id IS NULL';
      params.push(agentId);
    }
    query += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(query).all(...params) as BudgetLimitRow[];
    return rows.map(r => this.rowToLimit(r));
  }

  // Get aggregated usage for period
  private getUsageForPeriod(agentId: string, taskId: string | undefined, period: BudgetPeriod): { tokensUsed: number; costUsd: number } {
    let query = 'SELECT COALESCE(SUM(tokens_used), 0) as total_tokens, COALESCE(SUM(cost_usd), 0) as total_cost FROM budget_entries WHERE agent_id = ?';
    const params: (string | number)[] = [agentId];

    if (taskId) {
      query += ' AND task_id = ?';
      params.push(taskId);
    }

    if (period === 'daily') {
      // Entries since midnight UTC today
      const midnightUtc = new Date();
      midnightUtc.setUTCHours(0, 0, 0, 0);
      query += ' AND created_at >= ?';
      params.push(midnightUtc.getTime());
    }
    // 'task' period = all entries for the task (no time filter)
    // 'sprint' period = all entries (sprint-scoped by task association)

    const row = this.db.prepare(query).get(...params) as { total_tokens: number; total_cost: number };
    return { tokensUsed: row.total_tokens, costUsd: row.total_cost };
  }

  // Find the applicable limit for an agent/task/period
  private findLimit(agentId: string, taskId: string | undefined, period: BudgetPeriod): BudgetLimit | undefined {
    // Try specific first (agent+task), then agent-only, then global
    const candidates = [
      taskId ? this.db.prepare('SELECT * FROM budget_limits WHERE agent_id = ? AND task_id = ? AND period = ?')
        .get(agentId, taskId, period) : undefined,
      this.db.prepare('SELECT * FROM budget_limits WHERE agent_id = ? AND task_id IS NULL AND period = ?')
        .get(agentId, period),
      this.db.prepare('SELECT * FROM budget_limits WHERE agent_id IS NULL AND task_id IS NULL AND period = ?')
        .get(period)
    ];

    for (const row of candidates) {
      if (row) return this.rowToLimit(row as BudgetLimitRow);
    }
    return undefined;
  }

  // Get budget status for an agent
  getStatus(agentId: string, options?: { taskId?: string; period?: BudgetPeriod }): BudgetStatus {
    const period = options?.period ?? 'task';
    const taskId = options?.taskId;

    const usage = this.getUsageForPeriod(agentId, taskId, period);
    const limit = this.findLimit(agentId, taskId, period);

    let exceeded = false;
    let warning = false;
    let tokensRemaining: number | undefined;
    let costRemaining: number | undefined;

    if (limit) {
      if (limit.maxTokens != null) {
        tokensRemaining = limit.maxTokens - usage.tokensUsed;
        if (tokensRemaining <= 0) exceeded = true;
        if (usage.tokensUsed >= limit.maxTokens * 0.8) warning = true;
      }
      if (limit.maxCostUsd != null) {
        costRemaining = limit.maxCostUsd - usage.costUsd;
        if (costRemaining <= 0) exceeded = true;
        if (usage.costUsd >= limit.maxCostUsd * 0.8) warning = true;
      }
    }

    return {
      agentId,
      taskId,
      period,
      tokensUsed: usage.tokensUsed,
      costUsd: usage.costUsd,
      limit,
      tokensRemaining,
      costRemaining,
      exceeded,
      warning
    };
  }

  // Quick check: is agent within budget?
  checkBudget(agentId: string, taskId?: string): { allowed: boolean; warnings: string[] } {
    const warnings: string[] = [];
    let allowed = true;

    for (const period of ['task', 'daily'] as BudgetPeriod[]) {
      const status = this.getStatus(agentId, { taskId, period });
      if (status.exceeded) {
        allowed = false;
        warnings.push(`Budget exceeded for ${period} period: ${status.tokensUsed} tokens used` +
          (status.limit?.maxTokens ? ` (limit: ${status.limit.maxTokens})` : '') +
          `, $${status.costUsd.toFixed(4)} spent` +
          (status.limit?.maxCostUsd ? ` (limit: $${status.limit.maxCostUsd})` : ''));
      } else if (status.warning) {
        warnings.push(`Budget warning for ${period} period: approaching limit`);
      }
    }

    return { allowed, warnings };
  }

  // Query budget entries with filters
  getUsage(options: {
    agentId?: string;
    taskId?: string;
    since?: number;
    until?: number;
    category?: BudgetCategory;
    limit?: number;
  }): BudgetEntry[] {
    let query = 'SELECT * FROM budget_entries WHERE 1=1';
    const params: (string | number)[] = [];

    if (options.agentId) { query += ' AND agent_id = ?'; params.push(options.agentId); }
    if (options.taskId) { query += ' AND task_id = ?'; params.push(options.taskId); }
    if (options.since) { query += ' AND created_at >= ?'; params.push(options.since); }
    if (options.until) { query += ' AND created_at <= ?'; params.push(options.until); }
    if (options.category) { query += ' AND category = ?'; params.push(options.category); }

    query += ' ORDER BY created_at DESC';
    if (options.limit) { query += ' LIMIT ?'; params.push(options.limit); }

    const rows = this.db.prepare(query).all(...params) as BudgetEntryRow[];
    return rows.map(r => this.rowToEntry(r));
  }
}
