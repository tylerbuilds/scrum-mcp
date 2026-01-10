import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type { ScrumDb } from '../infra/db';
import type { AgingWipTask, Blocker, BoardMetrics, ChangelogEntry, ChangeType, Claim, Comment, Evidence, Intent, Task, TaskDependency, TaskMetrics, TaskStatus, TaskPriority, VelocityPeriod, WipLimits, WipStatus } from './types';

const MAX_OUTPUT_CHARS = 20000;

// Database row types for type safety
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

interface IntentRow {
  id: string;
  task_id: string;
  agent_id: string;
  files_json: string;
  boundaries: string | null;
  acceptance_criteria: string | null;
  created_at: number;
}

interface ClaimRow {
  agent_id: string;
  file_path: string;
  expires_at: number;
  created_at: number;
}

interface EvidenceRow {
  id: string;
  task_id: string;
  agent_id: string;
  command: string;
  output: string;
  created_at: number;
}

interface CountRow {
  n: number;
}

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

function now() {
  return Date.now();
}

function clipOutput(s: string) {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  return s.slice(0, MAX_OUTPUT_CHARS) + `\n[clipped to ${MAX_OUTPUT_CHARS} chars]`;
}

export class ScrumState {
  constructor(private db: ScrumDb, private log: Logger) {}

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
      // Filter tasks that have ANY of the specified labels
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
    enforceWipLimits?: boolean;  // default: false (soft check - warn but allow)
    enforceDependencies?: boolean;  // default: true (hard check - block)
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

      // Set started_at when moving TO in_progress (if not already set)
      if (updates.status === 'in_progress' && existing.status !== 'in_progress' && !existing.startedAt) {
        setClauses.push('started_at = ?');
        params.push(now());
      }
      // Set completed_at when moving TO done (if not already set)
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
      return existing; // No updates provided
    }

    // Always set updated_at
    setClauses.push('updated_at = ?');
    params.push(now());

    params.push(taskId);

    this.db
      .prepare(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...params);

    // Auto-log task events to changelog
    // Log status changes
    if (updates.status !== undefined && updates.status !== existing.status) {
      this.logChange({
        taskId,
        agentId: 'system',
        filePath: `task:${taskId}`,
        changeType: updates.status === 'done' ? 'task_completed' : 'task_status_change',
        summary: `Status: ${existing.status} → ${updates.status}`
      });
    }

    // Log assignment changes
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

    // Log priority changes
    if (updates.priority !== undefined && updates.priority !== existing.priority) {
      this.logChange({
        taskId,
        agentId: 'system',
        filePath: `task:${taskId}`,
        changeType: 'task_priority_change',
        summary: `Priority: ${existing.priority} → ${updates.priority}`
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

    // Exclude cancelled from board view
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

  postIntent(input: {
    taskId: string;
    agentId: string;
    files: string[];
    boundaries?: string;
    acceptanceCriteria?: string;
  }): Intent {
    const task = this.getTask(input.taskId);
    if (!task) throw new Error(`Unknown taskId: ${input.taskId}`);

    const intent: Intent = {
      id: nanoid(12),
      taskId: input.taskId,
      agentId: input.agentId,
      files: input.files,
      boundaries: input.boundaries,
      acceptanceCriteria: input.acceptanceCriteria,
      createdAt: now()
    };

    this.db
      .prepare(
        'INSERT INTO intents (id, task_id, agent_id, files_json, boundaries, acceptance_criteria, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        intent.id,
        intent.taskId,
        intent.agentId,
        JSON.stringify(intent.files),
        intent.boundaries ?? null,
        intent.acceptanceCriteria ?? null,
        intent.createdAt
      );

    return intent;
  }

  listIntents(taskId: string): Intent[] {
    const rows = this.db
      .prepare('SELECT id, task_id, agent_id, files_json, boundaries, acceptance_criteria, created_at FROM intents WHERE task_id = ? ORDER BY created_at DESC')
      .all(taskId) as IntentRow[];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      agentId: r.agent_id,
      files: JSON.parse(r.files_json) as string[],
      boundaries: r.boundaries ?? undefined,
      acceptanceCriteria: r.acceptance_criteria ?? undefined,
      createdAt: r.created_at
    }));
  }

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

  attachEvidence(input: { taskId: string; agentId: string; command: string; output: string }): Evidence {
    const task = this.getTask(input.taskId);
    if (!task) throw new Error(`Unknown taskId: ${input.taskId}`);

    const ev: Evidence = {
      id: nanoid(12),
      taskId: input.taskId,
      agentId: input.agentId,
      command: input.command,
      output: clipOutput(input.output),
      createdAt: now()
    };

    this.db
      .prepare('INSERT INTO evidence (id, task_id, agent_id, command, output, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ev.id, ev.taskId, ev.agentId, ev.command, ev.output, ev.createdAt);

    return ev;
  }

  listEvidence(taskId: string): Evidence[] {
    const rows = this.db
      .prepare('SELECT id, task_id, agent_id, command, output, created_at FROM evidence WHERE task_id = ? ORDER BY created_at DESC')
      .all(taskId) as EvidenceRow[];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      agentId: r.agent_id,
      command: r.command,
      output: r.output,
      createdAt: r.created_at
    }));
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

  /** Check if agent has declared intent for the given files (any intent covering all files) */
  hasIntentForFiles(agentId: string, files: string[]): { hasIntent: boolean; missingFiles: string[] } {
    if (files.length === 0) return { hasIntent: true, missingFiles: [] };

    // Get all files this agent has declared intent for
    const rows = this.db
      .prepare('SELECT files_json FROM intents WHERE agent_id = ?')
      .all(agentId) as Array<{ files_json: string }>;

    const declaredFiles = new Set<string>();
    for (const row of rows) {
      const intentFiles = JSON.parse(row.files_json) as string[];
      for (const f of intentFiles) declaredFiles.add(f);
    }

    const missingFiles = files.filter(f => !declaredFiles.has(f));
    return { hasIntent: missingFiles.length === 0, missingFiles };
  }

  /** Check if agent has attached evidence for a task */
  hasEvidenceForTask(agentId: string): { hasEvidence: boolean; taskIds: string[] } {
    const rows = this.db
      .prepare('SELECT DISTINCT task_id FROM evidence WHERE agent_id = ?')
      .all(agentId) as Array<{ task_id: string }>;

    return { hasEvidence: rows.length > 0, taskIds: rows.map(r => r.task_id) };
  }

  /** Get agent's active claims */
  getAgentClaims(agentId: string): string[] {
    this.pruneExpiredClaims();
    const rows = this.db
      .prepare('SELECT file_path FROM claims WHERE agent_id = ?')
      .all(agentId) as Array<{ file_path: string }>;
    return rows.map(r => r.file_path);
  }

  status() {
    this.pruneExpiredClaims();
    const taskCount = (this.db.prepare('SELECT COUNT(1) AS n FROM tasks').get() as CountRow | undefined)?.n ?? 0;
    const intentCount = (this.db.prepare('SELECT COUNT(1) AS n FROM intents').get() as CountRow | undefined)?.n ?? 0;
    const claimCount = (this.db.prepare('SELECT COUNT(1) AS n FROM claims').get() as CountRow | undefined)?.n ?? 0;
    const evidenceCount = (this.db.prepare('SELECT COUNT(1) AS n FROM evidence').get() as CountRow | undefined)?.n ?? 0;
    const changelogCount = (this.db.prepare('SELECT COUNT(1) AS n FROM changelog').get() as CountRow | undefined)?.n ?? 0;
    const commentCount = (this.db.prepare('SELECT COUNT(1) AS n FROM comments').get() as CountRow | undefined)?.n ?? 0;
    const blockerCount = (this.db.prepare('SELECT COUNT(1) AS n FROM blockers').get() as CountRow | undefined)?.n ?? 0;
    const unresolvedBlockerCount = (this.db.prepare('SELECT COUNT(1) AS n FROM blockers WHERE resolved_at IS NULL').get() as CountRow | undefined)?.n ?? 0;

    return {
      tasks: taskCount,
      intents: intentCount,
      claims: claimCount,
      evidence: evidenceCount,
      changelog: changelogCount,
      comments: commentCount,
      blockers: blockerCount,
      unresolvedBlockers: unresolvedBlockerCount,
      now: now()
    };
  }

  /** Log a file change to the changelog for debugging/tracing */
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

  /** Search changelog entries */
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

    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id ?? undefined,
      agentId: r.agent_id,
      filePath: r.file_path,
      changeType: r.change_type as ChangeType,
      summary: r.summary,
      diffSnippet: r.diff_snippet ?? undefined,
      commitHash: r.commit_hash ?? undefined,
      createdAt: r.created_at
    }));
  }

  /** Get file history - all changes to a specific file */
  getFileHistory(filePath: string, limit = 50): ChangelogEntry[] {
    return this.searchChangelog({ filePath, limit });
  }

  // ==================== COMMENTS ====================

  /** Add a comment to a task */
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

    // Auto-log comment added to changelog
    this.logChange({
      taskId: input.taskId,
      agentId: input.agentId,
      filePath: `task:${input.taskId}`,
      changeType: 'comment_added',
      summary: `Comment: ${input.content.slice(0, 100)}${input.content.length > 100 ? '...' : ''}`
    });

    return comment;
  }

  /** List comments for a task */
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

  /** Update a comment */
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

  /** Delete a comment */
  deleteComment(commentId: string): boolean {
    const info = this.db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
    return info.changes > 0;
  }

  // ==================== BLOCKERS ====================

  /** Add a blocker to a task */
  addBlocker(input: {
    taskId: string;
    description: string;
    blockingTaskId?: string;
    createdBy: string;
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
      createdBy: input.createdBy
    };

    this.db
      .prepare('INSERT INTO blockers (id, task_id, description, blocking_task_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(blocker.id, blocker.taskId, blocker.description, blocker.blockingTaskId ?? null, blocker.createdAt, blocker.createdBy);

    // Auto-log blocker added to changelog
    this.logChange({
      taskId: input.taskId,
      agentId: input.createdBy,
      filePath: `task:${input.taskId}`,
      changeType: 'blocker_added',
      summary: `Blocker added: ${input.description.slice(0, 100)}${input.description.length > 100 ? '...' : ''}`
    });

    return blocker;
  }

  /** Resolve a blocker */
  resolveBlocker(blockerId: string): Blocker {
    const row = this.db
      .prepare('SELECT id, task_id, description, blocking_task_id, resolved_at, created_at, created_by FROM blockers WHERE id = ?')
      .get(blockerId) as BlockerRow | undefined;
    if (!row) throw new Error(`Unknown blockerId: ${blockerId}`);

    const resolvedAt = now();
    this.db
      .prepare('UPDATE blockers SET resolved_at = ? WHERE id = ?')
      .run(resolvedAt, blockerId);

    // Auto-log blocker resolved to changelog
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
      createdBy: row.created_by
    };
  }

  /** List blockers for a task */
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
      createdBy: r.created_by
    }));
  }

  /** Get count of unresolved blockers for a task */
  getUnresolvedBlockersCount(taskId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(1) AS n FROM blockers WHERE task_id = ? AND resolved_at IS NULL')
      .get(taskId) as CountRow | undefined;
    return row?.n ?? 0;
  }

  /** Get combined feed of all activity for the dashboard */
  getFeed(limit = 100): Array<{
    id: string;
    type: 'task' | 'intent' | 'evidence' | 'claim';
    title: string;
    content: string | null;
    agent_id: string | null;
    task_id: string | null;
    created_at: number;
    metadata: Record<string, unknown>;
  }> {
    this.pruneExpiredClaims();
    const feed: Array<{
      id: string;
      type: 'task' | 'intent' | 'evidence' | 'claim';
      title: string;
      content: string | null;
      agent_id: string | null;
      task_id: string | null;
      created_at: number;
      metadata: Record<string, unknown>;
    }> = [];

    // Get tasks
    const tasks = this.db
      .prepare(`SELECT id, title, description, status, priority, assigned_agent, due_date,
        started_at, completed_at, updated_at, labels_json, story_points, created_at
        FROM tasks ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as TaskRow[];
    for (const t of tasks) {
      feed.push({
        id: t.id,
        type: 'task',
        title: t.title,
        content: t.description,
        agent_id: t.assigned_agent,
        task_id: t.id,
        created_at: t.created_at,
        metadata: {
          status: t.status ?? 'backlog',
          priority: t.priority ?? 'medium',
          labels: t.labels_json ? JSON.parse(t.labels_json) : [],
          storyPoints: t.story_points,
          dueDate: t.due_date,
          startedAt: t.started_at,
          completedAt: t.completed_at
        }
      });
    }

    // Get intents
    const intents = this.db
      .prepare('SELECT id, task_id, agent_id, files_json, boundaries, acceptance_criteria, created_at FROM intents ORDER BY created_at DESC LIMIT ?')
      .all(limit) as IntentRow[];
    for (const i of intents) {
      const files = JSON.parse(i.files_json) as string[];
      feed.push({
        id: i.id,
        type: 'intent',
        title: `Intent: ${files.length} file${files.length !== 1 ? 's' : ''}`,
        content: i.acceptance_criteria,
        agent_id: i.agent_id,
        task_id: i.task_id,
        created_at: i.created_at,
        metadata: { files, boundaries: i.boundaries }
      });
    }

    // Get evidence
    const evidence = this.db
      .prepare('SELECT id, task_id, agent_id, command, output, created_at FROM evidence ORDER BY created_at DESC LIMIT ?')
      .all(limit) as EvidenceRow[];
    for (const e of evidence) {
      feed.push({
        id: e.id,
        type: 'evidence',
        title: `Evidence: ${e.command.slice(0, 50)}${e.command.length > 50 ? '...' : ''}`,
        content: e.command,
        agent_id: e.agent_id,
        task_id: e.task_id,
        created_at: e.created_at,
        metadata: { output: e.output.slice(0, 500), output_length: e.output.length }
      });
    }

    // Get active claims
    const claims = this.db
      .prepare('SELECT agent_id, file_path, expires_at, created_at FROM claims ORDER BY created_at DESC')
      .all() as ClaimRow[];
    const claimsByAgent = new Map<string, { files: string[]; expires_at: number; created_at: number }>();
    for (const c of claims) {
      let entry = claimsByAgent.get(c.agent_id);
      if (!entry) {
        entry = { files: [], expires_at: c.expires_at, created_at: c.created_at };
        claimsByAgent.set(c.agent_id, entry);
      }
      entry.files.push(c.file_path);
      entry.expires_at = Math.max(entry.expires_at, c.expires_at);
      entry.created_at = Math.min(entry.created_at, c.created_at);
    }
    for (const [agentId, data] of claimsByAgent) {
      feed.push({
        id: `claim-${agentId}-${data.created_at}`,
        type: 'claim',
        title: `Claim: ${data.files.length} file${data.files.length !== 1 ? 's' : ''}`,
        content: null,
        agent_id: agentId,
        task_id: null,
        created_at: data.created_at,
        metadata: { files: data.files, expires_at: data.expires_at }
      });
    }

    // Sort by created_at descending
    feed.sort((a, b) => b.created_at - a.created_at);
    return feed.slice(0, limit);
  }

  /** Get list of unique agent IDs */
  getAgents(): string[] {
    const agents = new Set<string>();

    const intentAgents = this.db
      .prepare('SELECT DISTINCT agent_id FROM intents')
      .all() as Array<{ agent_id: string }>;
    for (const r of intentAgents) agents.add(r.agent_id);

    const evidenceAgents = this.db
      .prepare('SELECT DISTINCT agent_id FROM evidence')
      .all() as Array<{ agent_id: string }>;
    for (const r of evidenceAgents) agents.add(r.agent_id);

    const claimAgents = this.db
      .prepare('SELECT DISTINCT agent_id FROM claims')
      .all() as Array<{ agent_id: string }>;
    for (const r of claimAgents) agents.add(r.agent_id);

    return [...agents].sort();
  }

  // ==================== DEPENDENCIES ====================

  /** Add a dependency between tasks. taskId depends on dependsOnTaskId (must complete before) */
  addDependency(taskId: string, dependsOnTaskId: string): TaskDependency {
    // Validate both tasks exist
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Unknown taskId: ${taskId}`);
    const dependsOnTask = this.getTask(dependsOnTaskId);
    if (!dependsOnTask) throw new Error(`Unknown dependsOnTaskId: ${dependsOnTaskId}`);

    // Cannot depend on self
    if (taskId === dependsOnTaskId) {
      throw new Error('A task cannot depend on itself');
    }

    // Check for circular dependencies
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

    // Auto-log dependency added to changelog
    this.logChange({
      taskId,
      agentId: 'system',
      filePath: `task:${taskId}`,
      changeType: 'dependency_added',
      summary: `Now depends on task ${dependsOnTaskId}`
    });

    return dependency;
  }

  /** Remove a dependency by ID */
  removeDependency(dependencyId: string): boolean {
    // First get the dependency to log it
    const row = this.db
      .prepare('SELECT id, task_id, depends_on_task_id FROM task_dependencies WHERE id = ?')
      .get(dependencyId) as DependencyRow | undefined;

    const info = this.db
      .prepare('DELETE FROM task_dependencies WHERE id = ?')
      .run(dependencyId);

    // Auto-log dependency removed to changelog (only if it existed)
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

  /** Get dependencies for a task (what blocks it and what it blocks) */
  getDependencies(taskId: string): { blockedBy: Task[]; blocking: Task[] } {
    // Tasks that this task depends on (blockedBy)
    const blockedByRows = this.db
      .prepare(`SELECT t.id, t.title, t.description, t.status, t.priority, t.assigned_agent, t.due_date,
        t.started_at, t.completed_at, t.updated_at, t.labels_json, t.story_points, t.created_at
        FROM tasks t
        INNER JOIN task_dependencies d ON t.id = d.depends_on_task_id
        WHERE d.task_id = ?`)
      .all(taskId) as TaskRow[];

    // Tasks that depend on this task (blocking)
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

  /** Get raw dependency records for a task */
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

  /** Check if a task is ready to start (all dependencies are done) */
  isTaskReady(taskId: string): { ready: boolean; blockingTasks: Task[] } {
    const { blockedBy } = this.getDependencies(taskId);

    // Recursively check all dependencies (including transitive)
    const allBlocking: Task[] = [];
    const checked = new Set<string>();

    const checkDependencies = (tasks: Task[]) => {
      for (const task of tasks) {
        if (checked.has(task.id)) continue;
        checked.add(task.id);

        if (task.status !== 'done') {
          allBlocking.push(task);
        }

        // Check transitive dependencies
        const { blockedBy: transitive } = this.getDependencies(task.id);
        checkDependencies(transitive);
      }
    };

    checkDependencies(blockedBy);

    return {
      ready: allBlocking.length === 0,
      blockingTasks: allBlocking
    };
  }

  // ==================== WIP LIMITS ====================

  /** Set WIP limit for a status column. Pass null to remove limit. */
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

  /** Get all WIP limits */
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

  /** Get current WIP status (count vs limit) for all columns */
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

  /** Check if WIP limit allows adding a task to a status */
  checkWipLimit(status: TaskStatus): { allowed: boolean; count: number; limit?: number } {
    if (status === 'cancelled') {
      return { allowed: true, count: 0 };
    }

    const limits = this.getWipLimits();
    const limit = limits[status as keyof WipLimits];

    if (limit === undefined) {
      // No limit set, always allowed
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

  // ==================== METRICS ====================

  /** Get metrics for a single task */
  getTaskMetrics(taskId: string): TaskMetrics | null {
    const task = this.getTask(taskId);
    if (!task) return null;

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

  /** Get board-level metrics */
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

  /** Get velocity data (story points completed per period) */
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

  /** Get aging WIP tasks (in_progress for too long) */
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

  // Helper: Calculate daily throughput for last N days
  private calculateDailyThroughput(days: number): number[] {
    const currentTime = now();
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

  // Helper: Calculate weekly velocity for last N weeks
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

  // Helper: Calculate average
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  // Helper: Calculate percentile
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private pruneExpiredClaims() {
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

  /** Check if adding a dependency would create a circular reference */
  private wouldCreateCircularDependency(taskId: string, dependsOnTaskId: string): boolean {
    // Check if dependsOnTaskId already depends on taskId (directly or transitively)
    const visited = new Set<string>();

    const checkPath = (fromTaskId: string): boolean => {
      if (fromTaskId === taskId) return true;
      if (visited.has(fromTaskId)) return false;
      visited.add(fromTaskId);

      // Get all tasks that fromTaskId depends on
      const deps = this.db
        .prepare('SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?')
        .all(fromTaskId) as Array<{ depends_on_task_id: string }>;

      for (const dep of deps) {
        if (checkPath(dep.depends_on_task_id)) return true;
      }

      return false;
    };

    return checkPath(dependsOnTaskId);
  }
}
