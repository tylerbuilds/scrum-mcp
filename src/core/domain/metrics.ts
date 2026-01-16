import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type { AgingWipTask, BoardMetrics, DeadWork, DeadWorkReason, Task, TaskMetrics, TaskStatus, VelocityPeriod } from '../types.js';
import { type BaseRepository, now } from './base.js';

// Database row types
interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  assigned_agent: string | null;
  due_date: number | null;
  started_at: number | null;
  completed_at: number | null;
  updated_at: number | null;
  labels_json: string | null;
  story_points: number | null;
  created_at: number;
}

/**
 * Provider interface for accessing task and claim data
 */
export interface MetricsDataProvider {
  getTask(id: string): Task | null;
  getAgentClaims(agentId: string): string[];
  getAgingWip(options?: { thresholdDays?: number }): AgingWipTask[];
}

/**
 * Metrics Repository - handles Kanban metrics, throughput, velocity calculations
 */
export class MetricsRepository implements BaseRepository {
  private dataProvider: MetricsDataProvider | null = null;

  constructor(
    public readonly db: BetterSqlite3.Database,
    public readonly log: Logger
  ) {}

  /**
   * Set the data provider for accessing external data
   */
  setDataProvider(provider: MetricsDataProvider): void {
    this.dataProvider = provider;
  }

  // ==================== ROW MAPPERS ====================

  private rowToTask(row: TaskRow): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: (row.status as TaskStatus) ?? 'backlog',
      priority: (row.priority as 'critical' | 'high' | 'medium' | 'low') ?? 'medium',
      assignedAgent: row.assigned_agent ?? undefined,
      dueDate: row.due_date ?? undefined,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
      labels: row.labels_json ? JSON.parse(row.labels_json) : [],
      storyPoints: row.story_points ?? undefined,
      createdAt: row.created_at
    };
  }

  // ==================== TASK METRICS ====================

  getTaskMetrics(taskId: string): TaskMetrics | null {
    const row = this.db
      .prepare(`SELECT id, title, description, status, priority, assigned_agent, due_date,
        started_at, completed_at, updated_at, labels_json, story_points, created_at
        FROM tasks WHERE id = ?`)
      .get(taskId) as TaskRow | undefined;

    if (!row) return null;

    const task = this.rowToTask(row);
    const metrics: TaskMetrics = {
      taskId: task.id,
      storyPoints: task.storyPoints
    };

    // Lead time: createdAt to completedAt
    if (task.completedAt) {
      metrics.leadTimeMs = task.completedAt - task.createdAt;
    }

    // Cycle time: startedAt to completedAt
    if (task.startedAt && task.completedAt) {
      metrics.cycleTimeMs = task.completedAt - task.startedAt;
    }

    return metrics;
  }

  // ==================== BOARD METRICS ====================

  getBoardMetrics(options?: {
    since?: number;
    until?: number;
  }): BoardMetrics {
    const until = options?.until ?? now();
    const since = options?.since ?? (until - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago

    // Get completed tasks in the period
    const completedRows = this.db
      .prepare(`SELECT id, title, description, status, priority, assigned_agent, due_date,
        started_at, completed_at, updated_at, labels_json, story_points, created_at
        FROM tasks
        WHERE status = 'done' AND completed_at >= ? AND completed_at <= ?
        ORDER BY completed_at DESC`)
      .all(since, until) as TaskRow[];

    const completedTasks = completedRows.map(r => this.rowToTask(r));

    // Calculate metrics from completed tasks
    const leadTimes: number[] = [];
    const cycleTimes: number[] = [];
    let totalStoryPoints = 0;

    for (const task of completedTasks) {
      if (task.completedAt) {
        leadTimes.push(task.completedAt - task.createdAt);
        if (task.startedAt) {
          cycleTimes.push(task.completedAt - task.startedAt);
        }
      }
      totalStoryPoints += task.storyPoints ?? 0;
    }

    // Calculate WIP by status
    const wipByStatus: Record<TaskStatus, number> = {
      backlog: 0,
      todo: 0,
      in_progress: 0,
      review: 0,
      done: 0,
      cancelled: 0
    };

    const statusCounts = this.db
      .prepare(`SELECT status, COUNT(*) as count FROM tasks GROUP BY status`)
      .all() as Array<{ status: string; count: number }>;

    for (const row of statusCounts) {
      wipByStatus[row.status as TaskStatus] = row.count;
    }

    // Get aging WIP (default 2 days threshold)
    const wipAging = this.getAgingWip({ thresholdDays: 2 });

    // Calculate daily throughput for last 7 days
    const throughputDaily = this.calculateDailyThroughput(7);

    // Calculate weekly velocity for last 4 weeks
    const velocityWeekly = this.calculateWeeklyVelocity(4);

    return {
      period: { since, until },
      completedCount: completedTasks.length,
      totalStoryPoints,
      avgLeadTimeMs: leadTimes.length > 0 ? this.average(leadTimes) : undefined,
      avgCycleTimeMs: cycleTimes.length > 0 ? this.average(cycleTimes) : undefined,
      p50LeadTimeMs: leadTimes.length > 0 ? this.percentile(leadTimes, 50) : undefined,
      p90LeadTimeMs: leadTimes.length > 0 ? this.percentile(leadTimes, 90) : undefined,
      p50CycleTimeMs: cycleTimes.length > 0 ? this.percentile(cycleTimes, 50) : undefined,
      p90CycleTimeMs: cycleTimes.length > 0 ? this.percentile(cycleTimes, 90) : undefined,
      throughputDaily,
      velocityWeekly,
      wipByStatus,
      wipAging: wipAging.map(w => ({
        taskId: w.taskId,
        title: w.title,
        daysInProgress: w.daysInProgress,
        assignedAgent: w.assignedAgent
      }))
    };
  }

  // ==================== VELOCITY ====================

  getVelocity(options?: {
    periodDays?: number;
    periods?: number;
  }): VelocityPeriod[] {
    const periodDays = options?.periodDays ?? 7;
    const periodsCount = options?.periods ?? 4;
    const periodMs = periodDays * 24 * 60 * 60 * 1000;
    const currentTime = now();

    const result: VelocityPeriod[] = [];

    for (let i = 0; i < periodsCount; i++) {
      const periodEnd = currentTime - (i * periodMs);
      const periodStart = periodEnd - periodMs;

      const rows = this.db
        .prepare(`SELECT COUNT(*) as count, COALESCE(SUM(story_points), 0) as points
          FROM tasks
          WHERE status = 'done' AND completed_at >= ? AND completed_at < ?`)
        .get(periodStart, periodEnd) as { count: number; points: number } | undefined;

      result.push({
        periodStart,
        periodEnd,
        completedTasks: rows?.count ?? 0,
        storyPoints: rows?.points ?? 0
      });
    }

    // Reverse so oldest is first
    return result.reverse();
  }

  // ==================== AGING WIP ====================

  getAgingWip(options?: {
    thresholdDays?: number;
  }): AgingWipTask[] {
    const thresholdDays = options?.thresholdDays ?? 2;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const cutoff = now() - thresholdMs;

    const rows = this.db
      .prepare(`SELECT id, title, started_at, assigned_agent
        FROM tasks
        WHERE status = 'in_progress' AND started_at IS NOT NULL AND started_at < ?
        ORDER BY started_at ASC`)
      .all(cutoff) as Array<{ id: string; title: string; started_at: number; assigned_agent: string | null }>;

    const currentTime = now();
    return rows.map(r => ({
      taskId: r.id,
      title: r.title,
      startedAt: r.started_at,
      daysInProgress: Math.floor((currentTime - r.started_at) / (24 * 60 * 60 * 1000)),
      assignedAgent: r.assigned_agent ?? undefined
    }));
  }

  // ==================== DEAD WORK DETECTION ====================

  findDeadWork(options?: { staleDays?: number }): DeadWork[] {
    const staleDays = options?.staleDays ?? 1;
    const staleThreshold = now() - (staleDays * 24 * 60 * 60 * 1000);
    const currentTime = now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Single JOIN query to fetch all in_progress tasks with their activity timestamps
    // This eliminates N+1 queries by computing max evidence/changelog times in one pass
    const rows = this.db
      .prepare(`
        SELECT
          t.id,
          t.title,
          t.status,
          t.assigned_agent,
          t.started_at,
          t.created_at,
          COALESCE(e.latest_evidence, 0) as latest_evidence,
          COALESCE(c.latest_changelog, 0) as latest_changelog,
          CASE WHEN cl.agent_id IS NOT NULL THEN 1 ELSE 0 END as has_active_claims
        FROM tasks t
        LEFT JOIN (
          SELECT task_id, MAX(created_at) as latest_evidence
          FROM evidence
          GROUP BY task_id
        ) e ON e.task_id = t.id
        LEFT JOIN (
          SELECT task_id, MAX(created_at) as latest_changelog
          FROM changelog
          GROUP BY task_id
        ) c ON c.task_id = t.id
        LEFT JOIN (
          SELECT DISTINCT agent_id
          FROM claims
          WHERE expires_at > ?
        ) cl ON cl.agent_id = t.assigned_agent
        WHERE t.status = 'in_progress'
        ORDER BY COALESCE(
          NULLIF(MAX(COALESCE(e.latest_evidence, 0), COALESCE(c.latest_changelog, 0)), 0),
          t.started_at,
          t.created_at
        ) ASC
      `)
      .all(currentTime) as Array<{
        id: string;
        title: string;
        status: string;
        assigned_agent: string | null;
        started_at: number | null;
        created_at: number;
        latest_evidence: number;
        latest_changelog: number;
        has_active_claims: number;
      }>;

    const deadWork: DeadWork[] = [];

    for (const task of rows) {
      const lastEvidenceAt = task.latest_evidence;
      const lastChangelogAt = task.latest_changelog;
      const lastActivityAt = Math.max(
        lastEvidenceAt,
        lastChangelogAt,
        task.started_at ?? task.created_at
      );

      const hasActiveClaims = task.has_active_claims === 1;
      const hasRecentEvidence = lastEvidenceAt > staleThreshold;
      const isStale = lastActivityAt < staleThreshold;

      // Determine if this is dead work
      let reason: DeadWorkReason | null = null;

      if (!hasActiveClaims && isStale) {
        reason = 'no_claims';
      } else if (!hasRecentEvidence && isStale) {
        reason = 'no_activity';
      } else if (isStale) {
        reason = 'stale';
      }

      if (reason) {
        deadWork.push({
          taskId: task.id,
          title: task.title,
          status: task.status as TaskStatus,
          assignedAgent: task.assigned_agent ?? undefined,
          startedAt: task.started_at ?? undefined,
          daysStale: Math.floor((currentTime - lastActivityAt) / oneDayMs),
          lastActivityAt,
          hasActiveClaims,
          hasRecentEvidence,
          reason
        });
      }
    }

    return deadWork;
  }

  // ==================== PRIVATE HELPERS ====================

  private calculateDailyThroughput(days: number): number[] {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const result: number[] = [];

    // Start of today (midnight)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = todayMs - (i * oneDayMs);
      const dayEnd = dayStart + oneDayMs;

      const row = this.db
        .prepare(`SELECT COUNT(*) as count FROM tasks
          WHERE status = 'done' AND completed_at >= ? AND completed_at < ?`)
        .get(dayStart, dayEnd) as { count: number } | undefined;

      result.push(row?.count ?? 0);
    }

    return result;
  }

  private calculateWeeklyVelocity(weeks: number): number[] {
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const result: number[] = [];

    // Start of this week (Sunday)
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const thisWeekStart = weekStart.getTime();

    for (let i = weeks - 1; i >= 0; i--) {
      const start = thisWeekStart - (i * oneWeekMs);
      const end = start + oneWeekMs;

      const row = this.db
        .prepare(`SELECT COALESCE(SUM(story_points), 0) as points FROM tasks
          WHERE status = 'done' AND completed_at >= ? AND completed_at < ?`)
        .get(start, end) as { points: number } | undefined;

      result.push(row?.points ?? 0);
    }

    return result;
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}
