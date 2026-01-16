import { nanoid } from 'nanoid';
import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type { Blocker, Comment, GateConfig, Task, TaskDependency, TaskPriority, TaskStatus, TaskTemplate, WipLimits, WipStatus } from '../types.js';
import { type BaseRepository, type CountRow, now } from './base.js';

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

interface CommentRow {
  id: string;
  task_id: string;
  agent_id: string;
  content: string;
  created_at: number;
  updated_at: number | null;
}

interface BlockerRow {
  id: string;
  task_id: string;
  description: string;
  blocking_task_id: string | null;
  resolved_at: number | null;
  created_at: number;
  created_by: string;
}

interface DependencyRow {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  created_at: number;
}

interface WipLimitRow {
  status: string;
  max_tasks: number;
  updated_at: number;
}

/**
 * Callback interface for logging changes (injected by facade)
 */
export interface ChangelogCallback {
  logChange(input: {
    taskId?: string;
    agentId: string;
    filePath: string;
    changeType: string;
    summary: string;
    diffSnippet?: string;
    commitHash?: string;
  }): void;
}

/**
 * Tasks Repository - handles task CRUD, comments, blockers, dependencies, WIP limits, and templates
 */
export class TasksRepository implements BaseRepository {
  private changelogCallback: ChangelogCallback | null = null;

  constructor(
    public readonly db: BetterSqlite3.Database,
    public readonly log: Logger
  ) {}

  /**
   * Set the changelog callback for logging task events
   */
  setChangelogCallback(callback: ChangelogCallback): void {
    this.changelogCallback = callback;
  }

  private logChange(input: {
    taskId?: string;
    agentId: string;
    filePath: string;
    changeType: string;
    summary: string;
  }): void {
    if (this.changelogCallback) {
      this.changelogCallback.logChange(input);
    }
  }

  // ==================== ROW MAPPERS ====================

  private rowToTask(row: TaskRow): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: (row.status as TaskStatus) ?? 'backlog',
      priority: (row.priority as TaskPriority) ?? 'medium',
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

  // ==================== TASK CRUD ====================

  createTask(title: string, description?: string, options?: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assignedAgent?: string;
    dueDate?: number;
    labels?: string[];
    storyPoints?: number;
  }): Task {
    const task: Task = {
      id: nanoid(12),
      title,
      description,
      status: options?.status ?? 'backlog',
      priority: options?.priority ?? 'medium',
      assignedAgent: options?.assignedAgent,
      dueDate: options?.dueDate,
      startedAt: options?.status === 'in_progress' ? now() : undefined,
      completedAt: options?.status === 'done' ? now() : undefined,
      updatedAt: undefined,
      labels: options?.labels ?? [],
      storyPoints: options?.storyPoints,
      createdAt: now()
    };
    this.db
      .prepare(`INSERT INTO tasks (
        id, title, description, status, priority, assigned_agent, due_date,
        started_at, completed_at, updated_at, labels_json, story_points, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        task.id,
        task.title,
        task.description ?? null,
        task.status,
        task.priority,
        task.assignedAgent ?? null,
        task.dueDate ?? null,
        task.startedAt ?? null,
        task.completedAt ?? null,
        task.updatedAt ?? null,
        JSON.stringify(task.labels),
        task.storyPoints ?? null,
        task.createdAt
      );

    // Auto-log task creation to changelog
    this.logChange({
      taskId: task.id,
      agentId: 'system',
      filePath: `task:${task.id}`,
      changeType: 'task_created',
      summary: `Created task: ${task.title.slice(0, 100)}${task.title.length > 100 ? '...' : ''}`
    });

    return task;
  }

  getTask(id: string): Task | null {
    const row = this.db
      .prepare(`SELECT id, title, description, status, priority, assigned_agent, due_date,
        started_at, completed_at, updated_at, labels_json, story_points, created_at
        FROM tasks WHERE id = ?`)
      .get(id) as TaskRow | undefined;
    if (!row) return null;
    return this.rowToTask(row);
  }

  listTasks(limit = 50, filters?: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assignedAgent?: string;
    labels?: string[];
  }): Task[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters?.priority) {
      conditions.push('priority = ?');
      params.push(filters.priority);
    }
    if (filters?.assignedAgent) {
      conditions.push('assigned_agent = ?');
      params.push(filters.assignedAgent);
    }
    if (filters?.labels && filters.labels.length > 0) {
      const labelConditions = filters.labels.map(() => "labels_json LIKE ?");
      conditions.push(`(${labelConditions.join(' OR ')})`);
      for (const label of filters.labels) {
        params.push(`%"${label}"%`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);

    const rows = this.db
      .prepare(`SELECT id, title, description, status, priority, assigned_agent, due_date,
        started_at, completed_at, updated_at, labels_json, story_points, created_at
        FROM tasks ${whereClause} ORDER BY created_at DESC LIMIT ?`)
      .all(...params) as TaskRow[];
    return rows.map((r) => this.rowToTask(r));
  }

  updateTask(taskId: string, updates: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assignedAgent?: string | null;
    dueDate?: number | null;
    labels?: string[];
    storyPoints?: number | null;
    title?: string;
    description?: string | null;
  }, options?: {
    enforceWipLimits?: boolean;
    enforceDependencies?: boolean;
  }): Task & { warnings?: string[] } {
    const existing = this.getTask(taskId);
    if (!existing) throw new Error(`Unknown taskId: ${taskId}`);

    const warnings: string[] = [];
    const enforceWip = options?.enforceWipLimits ?? false;
    const enforceDeps = options?.enforceDependencies ?? true;

    // Check dependencies before allowing move to in_progress
    if (updates.status !== undefined && updates.status === 'in_progress' && existing.status !== 'in_progress') {
      const readyCheck = this.isTaskReady(taskId);
      if (!readyCheck.ready) {
        const blockingTaskIds = readyCheck.blockingTasks.map(t => t.id).join(', ');
        const msg = `Cannot move to in_progress: task is blocked by incomplete dependencies: ${blockingTaskIds}`;
        if (enforceDeps) {
          throw new Error(msg);
        }
        warnings.push(msg);
      }
    }

    // Check WIP limits before allowing status change
    if (updates.status !== undefined && updates.status !== existing.status) {
      const wipCheck = this.checkWipLimit(updates.status);
      if (!wipCheck.allowed) {
        const msg = `WIP limit exceeded for ${updates.status}: ${wipCheck.count}/${wipCheck.limit} tasks`;
        if (enforceWip) {
          throw new Error(msg);
        }
        warnings.push(msg);
      }
    }

    const setClauses: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.title !== undefined) {
      setClauses.push('title = ?');
      params.push(updates.title);
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?');
      params.push(updates.description);
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      params.push(updates.status);

      if (updates.status === 'in_progress' && existing.status !== 'in_progress' && !existing.startedAt) {
        setClauses.push('started_at = ?');
        params.push(now());
      }
      if (updates.status === 'done' && existing.status !== 'done' && !existing.completedAt) {
        setClauses.push('completed_at = ?');
        params.push(now());
      }
    }
    if (updates.priority !== undefined) {
      setClauses.push('priority = ?');
      params.push(updates.priority);
    }
    if (updates.assignedAgent !== undefined) {
      setClauses.push('assigned_agent = ?');
      params.push(updates.assignedAgent);
    }
    if (updates.dueDate !== undefined) {
      setClauses.push('due_date = ?');
      params.push(updates.dueDate);
    }
    if (updates.labels !== undefined) {
      setClauses.push('labels_json = ?');
      params.push(JSON.stringify(updates.labels));
    }
    if (updates.storyPoints !== undefined) {
      setClauses.push('story_points = ?');
      params.push(updates.storyPoints);
    }

    if (setClauses.length === 0) {
      return existing;
    }

    setClauses.push('updated_at = ?');
    params.push(now());
    params.push(taskId);

    this.db
      .prepare(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...params);

    // Auto-log task events
    if (updates.status !== undefined && updates.status !== existing.status) {
      this.logChange({
        taskId,
        agentId: 'system',
        filePath: `task:${taskId}`,
        changeType: updates.status === 'done' ? 'task_completed' : 'task_status_change',
        summary: `Status: ${existing.status} -> ${updates.status}`
      });
    }

    if (updates.assignedAgent !== undefined && updates.assignedAgent !== existing.assignedAgent) {
      this.logChange({
        taskId,
        agentId: 'system',
        filePath: `task:${taskId}`,
        changeType: 'task_assigned',
        summary: updates.assignedAgent
          ? `Assigned to ${updates.assignedAgent}`
          : 'Unassigned'
      });
    }

    if (updates.priority !== undefined && updates.priority !== existing.priority) {
      this.logChange({
        taskId,
        agentId: 'system',
        filePath: `task:${taskId}`,
        changeType: 'task_priority_change',
        summary: `Priority: ${existing.priority} -> ${updates.priority}`
      });
    }

    const updated = this.getTask(taskId)!;
    if (warnings.length > 0) {
      return { ...updated, warnings };
    }
    return updated;
  }

  getBoard(filters?: { assignedAgent?: string; labels?: string[] }): {
    backlog: Task[];
    todo: Task[];
    in_progress: Task[];
    review: Task[];
    done: Task[];
  } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    conditions.push("status != 'cancelled'");

    if (filters?.assignedAgent) {
      conditions.push('assigned_agent = ?');
      params.push(filters.assignedAgent);
    }
    if (filters?.labels && filters.labels.length > 0) {
      const labelConditions = filters.labels.map(() => "labels_json LIKE ?");
      conditions.push(`(${labelConditions.join(' OR ')})`);
      for (const label of filters.labels) {
        params.push(`%"${label}"%`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.db
      .prepare(`SELECT id, title, description, status, priority, assigned_agent, due_date,
        started_at, completed_at, updated_at, labels_json, story_points, created_at
        FROM tasks ${whereClause} ORDER BY priority DESC, created_at ASC`)
      .all(...params) as TaskRow[];

    const tasks = rows.map((r) => this.rowToTask(r));

    return {
      backlog: tasks.filter(t => t.status === 'backlog'),
      todo: tasks.filter(t => t.status === 'todo'),
      in_progress: tasks.filter(t => t.status === 'in_progress'),
      review: tasks.filter(t => t.status === 'review'),
      done: tasks.filter(t => t.status === 'done')
    };
  }

  // ==================== COMMENTS ====================

  addComment(input: { taskId: string; agentId: string; content: string }): Comment {
    const task = this.getTask(input.taskId);
    if (!task) throw new Error(`Unknown taskId: ${input.taskId}`);

    const comment: Comment = {
      id: nanoid(12),
      taskId: input.taskId,
      agentId: input.agentId,
      content: input.content,
      createdAt: now()
    };

    this.db
      .prepare('INSERT INTO comments (id, task_id, agent_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(comment.id, comment.taskId, comment.agentId, comment.content, comment.createdAt);

    this.logChange({
      taskId: input.taskId,
      agentId: input.agentId,
      filePath: `task:${input.taskId}`,
      changeType: 'comment_added',
      summary: `Comment: ${input.content.slice(0, 100)}${input.content.length > 100 ? '...' : ''}`
    });

    return comment;
  }

  listComments(taskId: string, limit = 50): Comment[] {
    const rows = this.db
      .prepare('SELECT id, task_id, agent_id, content, created_at, updated_at FROM comments WHERE task_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(taskId, limit) as CommentRow[];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      agentId: r.agent_id,
      content: r.content,
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? undefined
    }));
  }

  updateComment(commentId: string, content: string): Comment {
    const row = this.db
      .prepare('SELECT id, task_id, agent_id, content, created_at, updated_at FROM comments WHERE id = ?')
      .get(commentId) as CommentRow | undefined;
    if (!row) throw new Error(`Unknown commentId: ${commentId}`);

    const updatedAt = now();
    this.db
      .prepare('UPDATE comments SET content = ?, updated_at = ? WHERE id = ?')
      .run(content, updatedAt, commentId);

    return {
      id: row.id,
      taskId: row.task_id,
      agentId: row.agent_id,
      content,
      createdAt: row.created_at,
      updatedAt
    };
  }

  deleteComment(commentId: string): boolean {
    const info = this.db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
    return info.changes > 0;
  }

  // ==================== BLOCKERS ====================

  addBlocker(input: {
    taskId: string;
    description: string;
    blockingTaskId?: string;
    agentId: string;
  }): Blocker {
    const task = this.getTask(input.taskId);
    if (!task) throw new Error(`Unknown taskId: ${input.taskId}`);

    if (input.blockingTaskId) {
      const blockingTask = this.getTask(input.blockingTaskId);
      if (!blockingTask) throw new Error(`Unknown blockingTaskId: ${input.blockingTaskId}`);
    }

    const blocker: Blocker = {
      id: nanoid(12),
      taskId: input.taskId,
      description: input.description,
      blockingTaskId: input.blockingTaskId,
      createdAt: now(),
      agentId: input.agentId
    };

    this.db
      .prepare('INSERT INTO blockers (id, task_id, description, blocking_task_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(blocker.id, blocker.taskId, blocker.description, blocker.blockingTaskId ?? null, blocker.createdAt, blocker.agentId);

    this.logChange({
      taskId: input.taskId,
      agentId: input.agentId,
      filePath: `task:${input.taskId}`,
      changeType: 'blocker_added',
      summary: `Blocker added: ${input.description.slice(0, 100)}${input.description.length > 100 ? '...' : ''}`
    });

    return blocker;
  }

  resolveBlocker(blockerId: string): Blocker {
    const row = this.db
      .prepare('SELECT id, task_id, description, blocking_task_id, resolved_at, created_at, created_by FROM blockers WHERE id = ?')
      .get(blockerId) as BlockerRow | undefined;
    if (!row) throw new Error(`Unknown blockerId: ${blockerId}`);

    const resolvedAt = now();
    this.db
      .prepare('UPDATE blockers SET resolved_at = ? WHERE id = ?')
      .run(resolvedAt, blockerId);

    this.logChange({
      taskId: row.task_id,
      agentId: 'system',
      filePath: `task:${row.task_id}`,
      changeType: 'blocker_resolved',
      summary: `Blocker resolved: ${row.description.slice(0, 100)}${row.description.length > 100 ? '...' : ''}`
    });

    return {
      id: row.id,
      taskId: row.task_id,
      description: row.description,
      blockingTaskId: row.blocking_task_id ?? undefined,
      resolvedAt,
      createdAt: row.created_at,
      agentId: row.created_by
    };
  }

  listBlockers(taskId: string, options?: { unresolvedOnly?: boolean }): Blocker[] {
    let query = 'SELECT id, task_id, description, blocking_task_id, resolved_at, created_at, created_by FROM blockers WHERE task_id = ?';
    if (options?.unresolvedOnly) {
      query += ' AND resolved_at IS NULL';
    }
    query += ' ORDER BY created_at DESC';

    const rows = this.db.prepare(query).all(taskId) as BlockerRow[];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      description: r.description,
      blockingTaskId: r.blocking_task_id ?? undefined,
      resolvedAt: r.resolved_at ?? undefined,
      createdAt: r.created_at,
      agentId: r.created_by
    }));
  }

  getUnresolvedBlockersCount(taskId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(1) AS n FROM blockers WHERE task_id = ? AND resolved_at IS NULL')
      .get(taskId) as CountRow | undefined;
    return row?.n ?? 0;
  }

  // ==================== DEPENDENCIES ====================

  addDependency(taskId: string, dependsOnTaskId: string): TaskDependency {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Unknown taskId: ${taskId}`);
    const dependsOnTask = this.getTask(dependsOnTaskId);
    if (!dependsOnTask) throw new Error(`Unknown dependsOnTaskId: ${dependsOnTaskId}`);

    if (taskId === dependsOnTaskId) {
      throw new Error('A task cannot depend on itself');
    }

    if (this.wouldCreateCircularDependency(taskId, dependsOnTaskId)) {
      throw new Error(`Circular dependency detected: ${dependsOnTaskId} already depends on ${taskId}`);
    }

    const dependency: TaskDependency = {
      id: nanoid(12),
      taskId,
      dependsOnTaskId,
      createdAt: now()
    };

    try {
      this.db
        .prepare('INSERT INTO task_dependencies (id, task_id, depends_on_task_id, created_at) VALUES (?, ?, ?, ?)')
        .run(dependency.id, dependency.taskId, dependency.dependsOnTaskId, dependency.createdAt);
    } catch (e: any) {
      if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE' || e?.message?.includes('UNIQUE constraint failed')) {
        throw new Error(`Dependency already exists: ${taskId} -> ${dependsOnTaskId}`);
      }
      throw e;
    }

    this.logChange({
      taskId,
      agentId: 'system',
      filePath: `task:${taskId}`,
      changeType: 'dependency_added',
      summary: `Now depends on task ${dependsOnTaskId}`
    });

    return dependency;
  }

  removeDependency(dependencyId: string): boolean {
    const row = this.db
      .prepare('SELECT id, task_id, depends_on_task_id FROM task_dependencies WHERE id = ?')
      .get(dependencyId) as DependencyRow | undefined;

    const info = this.db
      .prepare('DELETE FROM task_dependencies WHERE id = ?')
      .run(dependencyId);

    if (info.changes > 0 && row) {
      this.logChange({
        taskId: row.task_id,
        agentId: 'system',
        filePath: `task:${row.task_id}`,
        changeType: 'dependency_removed',
        summary: `Dependency removed on task ${row.depends_on_task_id}`
      });
    }

    return info.changes > 0;
  }

  getDependencies(taskId: string): { blockedBy: Task[]; blocking: Task[] } {
    const blockedByRows = this.db
      .prepare(`SELECT t.id, t.title, t.description, t.status, t.priority, t.assigned_agent, t.due_date,
        t.started_at, t.completed_at, t.updated_at, t.labels_json, t.story_points, t.created_at
        FROM tasks t
        INNER JOIN task_dependencies d ON t.id = d.depends_on_task_id
        WHERE d.task_id = ?`)
      .all(taskId) as TaskRow[];

    const blockingRows = this.db
      .prepare(`SELECT t.id, t.title, t.description, t.status, t.priority, t.assigned_agent, t.due_date,
        t.started_at, t.completed_at, t.updated_at, t.labels_json, t.story_points, t.created_at
        FROM tasks t
        INNER JOIN task_dependencies d ON t.id = d.task_id
        WHERE d.depends_on_task_id = ?`)
      .all(taskId) as TaskRow[];

    return {
      blockedBy: blockedByRows.map(r => this.rowToTask(r)),
      blocking: blockingRows.map(r => this.rowToTask(r))
    };
  }

  getDependencyRecords(taskId: string): TaskDependency[] {
    const rows = this.db
      .prepare('SELECT id, task_id, depends_on_task_id, created_at FROM task_dependencies WHERE task_id = ?')
      .all(taskId) as DependencyRow[];
    return rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      dependsOnTaskId: r.depends_on_task_id,
      createdAt: r.created_at
    }));
  }

  isTaskReady(taskId: string): { ready: boolean; blockingTasks: Task[] } {
    // Use recursive CTE to fetch all transitive dependencies in a single query
    // This eliminates N+1 queries when checking deep dependency chains
    const rows = this.db
      .prepare(`
        WITH RECURSIVE transitive_deps(dep_id, depth) AS (
          -- Base case: direct dependencies of the target task
          SELECT depends_on_task_id, 1
          FROM task_dependencies
          WHERE task_id = ?

          UNION

          -- Recursive case: dependencies of dependencies
          SELECT td.depends_on_task_id, td2.depth + 1
          FROM task_dependencies td
          INNER JOIN transitive_deps td2 ON td.task_id = td2.dep_id
          WHERE td2.depth < 100  -- Prevent infinite recursion
        )
        SELECT DISTINCT t.id, t.title, t.description, t.status, t.priority,
               t.assigned_agent, t.due_date, t.started_at, t.completed_at,
               t.updated_at, t.labels_json, t.story_points, t.created_at
        FROM transitive_deps td
        INNER JOIN tasks t ON t.id = td.dep_id
        WHERE t.status != 'done'
      `)
      .all(taskId) as TaskRow[];

    const blockingTasks = rows.map(r => this.rowToTask(r));

    return {
      ready: blockingTasks.length === 0,
      blockingTasks
    };
  }

  private wouldCreateCircularDependency(taskId: string, dependsOnTaskId: string): boolean {
    // Use recursive CTE to check if taskId is reachable from dependsOnTaskId
    // This eliminates N+1 queries when traversing the dependency graph
    const result = this.db
      .prepare(`
        WITH RECURSIVE reachable(task_id, depth) AS (
          -- Base case: start from dependsOnTaskId's dependencies
          SELECT depends_on_task_id, 1
          FROM task_dependencies
          WHERE task_id = ?

          UNION

          -- Recursive case: follow dependency chain
          SELECT td.depends_on_task_id, r.depth + 1
          FROM task_dependencies td
          INNER JOIN reachable r ON td.task_id = r.task_id
          WHERE r.depth < 100  -- Prevent infinite recursion
        )
        SELECT 1 AS found
        FROM reachable
        WHERE task_id = ?
        LIMIT 1
      `)
      .get(dependsOnTaskId, taskId) as { found: number } | undefined;

    return result !== undefined;
  }

  // ==================== WIP LIMITS ====================

  setWipLimit(status: TaskStatus, limit: number | null): void {
    if (status === 'cancelled') {
      throw new Error('Cannot set WIP limit for cancelled status');
    }

    if (limit === null) {
      this.db.prepare('DELETE FROM wip_limits WHERE status = ?').run(status);
    } else {
      if (limit < 1 || limit > 100) {
        throw new Error('WIP limit must be between 1 and 100');
      }
      this.db
        .prepare('INSERT OR REPLACE INTO wip_limits (status, max_tasks, updated_at) VALUES (?, ?, ?)')
        .run(status, limit, now());
    }
  }

  getWipLimits(): WipLimits {
    const rows = this.db
      .prepare('SELECT status, max_tasks FROM wip_limits')
      .all() as WipLimitRow[];

    const limits: WipLimits = {};
    for (const row of rows) {
      const status = row.status as keyof WipLimits;
      limits[status] = row.max_tasks;
    }
    return limits;
  }

  getWipStatus(): WipStatus[] {
    const limits = this.getWipLimits();
    const statuses: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done'];

    const counts = this.db
      .prepare(`SELECT status, COUNT(*) as count FROM tasks WHERE status != 'cancelled' GROUP BY status`)
      .all() as Array<{ status: string; count: number }>;

    const countMap = new Map<string, number>();
    for (const row of counts) {
      countMap.set(row.status, row.count);
    }

    return statuses.map(status => {
      const count = countMap.get(status) ?? 0;
      const limit = limits[status as keyof WipLimits];
      return {
        status,
        count,
        limit,
        exceeded: limit !== undefined && count >= limit
      };
    });
  }

  checkWipLimit(status: TaskStatus): { allowed: boolean; count: number; limit?: number } {
    if (status === 'cancelled') {
      return { allowed: true, count: 0 };
    }

    const limits = this.getWipLimits();
    const limit = limits[status as keyof WipLimits];

    if (limit === undefined) {
      const count = (this.db
        .prepare('SELECT COUNT(*) as n FROM tasks WHERE status = ?')
        .get(status) as CountRow | undefined)?.n ?? 0;
      return { allowed: true, count };
    }

    const count = (this.db
      .prepare('SELECT COUNT(*) as n FROM tasks WHERE status = ?')
      .get(status) as CountRow | undefined)?.n ?? 0;

    return {
      allowed: count < limit,
      count,
      limit
    };
  }

  // ==================== TASK TEMPLATES ====================

  createTemplate(input: {
    name: string;
    titlePattern: string;
    descriptionTemplate?: string;
    defaultStatus?: TaskStatus;
    defaultPriority?: TaskPriority;
    defaultLabels?: string[];
    defaultStoryPoints?: number;
    gates?: GateConfig[];
    checklist?: string[];
  }): TaskTemplate {
    const template: TaskTemplate = {
      id: nanoid(12),
      name: input.name,
      titlePattern: input.titlePattern,
      descriptionTemplate: input.descriptionTemplate,
      defaultStatus: input.defaultStatus ?? 'backlog',
      defaultPriority: input.defaultPriority ?? 'medium',
      defaultLabels: input.defaultLabels ?? [],
      defaultStoryPoints: input.defaultStoryPoints,
      gates: input.gates,
      checklist: input.checklist,
      createdAt: now()
    };

    this.db
      .prepare(`INSERT INTO task_templates
        (id, name, title_pattern, description_template, default_status, default_priority,
         default_labels_json, default_story_points, gates_json, checklist_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        template.id,
        template.name,
        template.titlePattern,
        template.descriptionTemplate,
        template.defaultStatus,
        template.defaultPriority,
        JSON.stringify(template.defaultLabels),
        template.defaultStoryPoints,
        JSON.stringify(template.gates ?? []),
        JSON.stringify(template.checklist ?? []),
        template.createdAt
      );

    return template;
  }

  getTemplate(nameOrId: string): TaskTemplate | null {
    const row = this.db
      .prepare('SELECT * FROM task_templates WHERE id = ? OR name = ?')
      .get(nameOrId, nameOrId) as {
        id: string;
        name: string;
        title_pattern: string;
        description_template: string | null;
        default_status: string;
        default_priority: string;
        default_labels_json: string;
        default_story_points: number | null;
        gates_json: string | null;
        checklist_json: string | null;
        created_at: number;
        updated_at: number | null;
      } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      titlePattern: row.title_pattern,
      descriptionTemplate: row.description_template ?? undefined,
      defaultStatus: row.default_status as TaskStatus,
      defaultPriority: row.default_priority as TaskPriority,
      defaultLabels: JSON.parse(row.default_labels_json),
      defaultStoryPoints: row.default_story_points ?? undefined,
      gates: row.gates_json ? JSON.parse(row.gates_json) : undefined,
      checklist: row.checklist_json ? JSON.parse(row.checklist_json) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined
    };
  }

  listTemplates(): TaskTemplate[] {
    const rows = this.db
      .prepare('SELECT * FROM task_templates ORDER BY name ASC')
      .all() as Array<{
        id: string;
        name: string;
        title_pattern: string;
        description_template: string | null;
        default_status: string;
        default_priority: string;
        default_labels_json: string;
        default_story_points: number | null;
        gates_json: string | null;
        checklist_json: string | null;
        created_at: number;
        updated_at: number | null;
      }>;

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      titlePattern: row.title_pattern,
      descriptionTemplate: row.description_template ?? undefined,
      defaultStatus: row.default_status as TaskStatus,
      defaultPriority: row.default_priority as TaskPriority,
      defaultLabels: JSON.parse(row.default_labels_json),
      defaultStoryPoints: row.default_story_points ?? undefined,
      gates: row.gates_json ? JSON.parse(row.gates_json) : undefined,
      checklist: row.checklist_json ? JSON.parse(row.checklist_json) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined
    }));
  }
}
