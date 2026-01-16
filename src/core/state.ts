/**
 * ScrumState - Thin facade that composes domain repositories.
 *
 * This class provides a unified API for all SCRUM MCP operations by
 * delegating to focused domain repositories. It serves as the main
 * entry point for interacting with the SCRUM system.
 *
 * Key responsibilities:
 * - Initializes and wires up all domain repositories
 * - Provides backwards-compatible public API
 * - Handles cross-repository dependencies (e.g., changelog callbacks)
 *
 * @module state
 *
 * @example
 * ```typescript
 * import { ScrumState } from './state.js';
 * import { createDb } from './infra/db.js';
 * import pino from 'pino';
 *
 * const db = createDb('./scrum.db');
 * const logger = pino();
 * const scrum = new ScrumState(db, logger);
 *
 * // Create a task
 * const task = scrum.createTask('Fix login bug', 'Users cannot login');
 *
 * // Post intent before modifying files
 * scrum.postIntent({
 *   taskId: task.id,
 *   agentId: 'claude-code-abc123',
 *   files: ['src/auth.ts']
 * });
 *
 * // Claim files for exclusive editing
 * scrum.createClaim('claude-code-abc123', ['src/auth.ts'], 3600);
 * ```
 */

import type { Logger } from 'pino';
import type { ScrumDb } from '../infra/db';
import type {
  Agent,
  AgentStatus,
  AgingWipTask,
  Blocker,
  BoardMetrics,
  ChangelogEntry,
  ChangeType,
  Claim,
  Comment,
  DeadWork,
  Evidence,
  Gate,
  GateConfig,
  GateRun,
  GateStatus,
  GateType,
  Intent,
  Task,
  TaskDependency,
  TaskMetrics,
  TaskPriority,
  TaskStatus,
  TaskTemplate,
  VelocityPeriod,
  Webhook,
  WebhookDelivery,
  WebhookEventType,
  WipLimits,
  WipStatus,
  Sprint,
  SprintMember,
  SprintShare,
  SprintContext,
  SprintStatus,
  ShareType
} from './types';

// Domain repository imports
import {
  TasksRepository,
  ClaimsRepository,
  EvidenceRepository,
  GatesRepository,
  WebhooksRepository,
  MetricsRepository,
  AgentsRepository,
  IntentsRepository,
  ChangelogRepository,
  SprintsRepository
} from './domain/index.js';
import { ComplianceRepository, type ComplianceCheck } from './domain/compliance.js';

/**
 * Activity feed item representing a recent action in the SCRUM system.
 * Used by {@link ScrumState.getFeed} to return a unified activity timeline.
 */
interface FeedItem {
  /** The type of activity */
  type: 'task' | 'intent' | 'evidence' | 'claim' | 'changelog';
  /** Timestamp of the activity (epoch milliseconds) */
  ts: number;
  /** The data associated with this activity */
  data: Task | Intent | Evidence | Claim | ChangelogEntry;
}

/** Internal type for COUNT queries */
interface CountRow {
  n: number;
}

/**
 * ScrumState composes all domain repositories and provides a unified API.
 *
 * This is the main class for interacting with the SCRUM MCP system.
 * It provides methods for managing tasks, claims, intents, evidence,
 * gates, webhooks, metrics, and agents.
 *
 * All business logic lives in the underlying repositories; this class
 * serves as a thin facade that wires them together.
 */
export class ScrumState {
  // Domain repositories
  private readonly tasks: TasksRepository;
  private readonly claims: ClaimsRepository;
  private readonly evidence: EvidenceRepository;
  private readonly gates: GatesRepository;
  private readonly webhooks: WebhooksRepository;
  private readonly metrics: MetricsRepository;
  private readonly agents: AgentsRepository;
  private readonly intents: IntentsRepository;
  private readonly changelog: ChangelogRepository;
  private readonly compliance: ComplianceRepository;
  private readonly sprints: SprintsRepository;

  /**
   * Creates a new ScrumState instance.
   *
   * Initializes all domain repositories and wires up cross-repository
   * dependencies for changelog callbacks and task validation.
   *
   * @param db - The SQLite database connection
   * @param log - Pino logger instance for logging operations
   */
  constructor(private db: ScrumDb, private log: Logger) {
    // Initialize all repositories
    this.tasks = new TasksRepository(db, log);
    this.claims = new ClaimsRepository(db, log);
    this.evidence = new EvidenceRepository(db, log);
    this.gates = new GatesRepository(db, log);
    this.webhooks = new WebhooksRepository(db, log);
    this.metrics = new MetricsRepository(db, log);
    this.agents = new AgentsRepository(db, log);
    this.intents = new IntentsRepository(db, log);
    this.changelog = new ChangelogRepository(db, log);
    this.compliance = new ComplianceRepository(db, log);
    this.sprints = new SprintsRepository(db, log);

    // Wire up cross-repository dependencies
    this.tasks.setChangelogCallback({
      logChange: (input) => this.changelog.logChange(input as Parameters<typeof this.changelog.logChange>[0])
    });

    this.evidence.setTaskValidator({ getTask: (id) => this.tasks.getTask(id) });
    this.gates.setTaskValidator({ getTask: (id) => this.tasks.getTask(id) });
    this.intents.setTaskValidator({ getTask: (id) => this.tasks.getTask(id) });
    this.metrics.setDataProvider({
      getTask: (id) => this.tasks.getTask(id),
      getAgentClaims: (agentId) => this.claims.getAgentClaims(agentId),
      getAgingWip: (opts) => this.metrics.getAgingWip(opts)
    });

    // Wire up compliance dependencies
    this.compliance.setDependencies({
      intents: this.intents,
      evidence: this.evidence,
      changelog: this.changelog,
      claims: this.claims
    });
  }

  // ==================== STATUS ====================

  /**
   * Returns current system status with counts of all entities.
   *
   * Also prunes expired claims as a side effect to keep the system clean.
   *
   * @returns Object containing counts for tasks, intents, claims, evidence, etc.
   *
   * @example
   * ```typescript
   * const status = scrum.status();
   * console.log(`Tasks: ${status.tasks}, Active claims: ${status.claims}`);
   * ```
   */
  status(): {
    tasks: number;
    intents: number;
    claims: number;
    evidence: number;
    changelog: number;
    comments: number;
    blockers: number;
    unresolvedBlockers: number;
    now: number;
  } {
    this.claims.pruneExpiredClaims();

    const tasksCount = (this.db.prepare('SELECT COUNT(1) AS n FROM tasks').get() as CountRow)?.n ?? 0;
    const intentsCount = (this.db.prepare('SELECT COUNT(1) AS n FROM intents').get() as CountRow)?.n ?? 0;
    const claimsCount = (this.db.prepare('SELECT COUNT(1) AS n FROM claims').get() as CountRow)?.n ?? 0;
    const evidenceCount = (this.db.prepare('SELECT COUNT(1) AS n FROM evidence').get() as CountRow)?.n ?? 0;
    const changelogCount = (this.db.prepare('SELECT COUNT(1) AS n FROM changelog').get() as CountRow)?.n ?? 0;
    const commentCount = (this.db.prepare('SELECT COUNT(1) AS n FROM comments').get() as CountRow)?.n ?? 0;
    const blockerCount = (this.db.prepare('SELECT COUNT(1) AS n FROM blockers').get() as CountRow)?.n ?? 0;
    const unresolvedBlockerCount = (this.db.prepare('SELECT COUNT(1) AS n FROM blockers WHERE resolved_at IS NULL').get() as CountRow)?.n ?? 0;

    return {
      tasks: tasksCount,
      intents: intentsCount,
      claims: claimsCount,
      evidence: evidenceCount,
      changelog: changelogCount,
      comments: commentCount,
      blockers: blockerCount,
      unresolvedBlockers: unresolvedBlockerCount,
      now: Date.now()
    };
  }

  // ==================== FEED ====================

  /**
   * Returns a unified activity feed of recent actions across all entity types.
   *
   * Combines tasks, intents, evidence, claims, and changelog entries
   * into a single timeline sorted by timestamp (newest first).
   *
   * @param limit - Maximum number of items to return (default: 100)
   * @returns Array of FeedItem objects sorted by timestamp descending
   *
   * @example
   * ```typescript
   * const feed = scrum.getFeed(50);
   * for (const item of feed) {
   *   console.log(`${item.type} at ${new Date(item.ts).toISOString()}`);
   * }
   * ```
   */
  getFeed(limit = 100): FeedItem[] {
    // Use UNION ALL with a single ORDER BY to fetch most feed items in one efficient query
    // This eliminates multiple separate queries and sorts in a single pass
    // Note: Claims are fetched separately since they need aggregation by agent
    const rows = this.db
      .prepare(`
        SELECT 'task' as type, id, created_at as ts,
               id as item_id, title, description, status, priority, assigned_agent,
               due_date, started_at, completed_at, updated_at, labels_json, story_points,
               NULL as task_id, NULL as agent_id, NULL as files_json, NULL as boundaries,
               NULL as acceptance_criteria, NULL as command, NULL as output, NULL as file_path,
               NULL as change_type, NULL as summary, NULL as diff_snippet, NULL as commit_hash
        FROM tasks

        UNION ALL

        SELECT 'intent' as type, id, created_at as ts,
               id as item_id, NULL as title, NULL as description, NULL as status, NULL as priority, NULL as assigned_agent,
               NULL as due_date, NULL as started_at, NULL as completed_at, NULL as updated_at, NULL as labels_json, NULL as story_points,
               task_id, agent_id, files_json, boundaries, acceptance_criteria,
               NULL as command, NULL as output, NULL as file_path,
               NULL as change_type, NULL as summary, NULL as diff_snippet, NULL as commit_hash
        FROM intents

        UNION ALL

        SELECT 'evidence' as type, id, created_at as ts,
               id as item_id, NULL as title, NULL as description, NULL as status, NULL as priority, NULL as assigned_agent,
               NULL as due_date, NULL as started_at, NULL as completed_at, NULL as updated_at, NULL as labels_json, NULL as story_points,
               task_id, agent_id, NULL as files_json, NULL as boundaries, NULL as acceptance_criteria,
               command, output, NULL as file_path,
               NULL as change_type, NULL as summary, NULL as diff_snippet, NULL as commit_hash
        FROM evidence

        UNION ALL

        SELECT 'changelog' as type, id, created_at as ts,
               id as item_id, NULL as title, NULL as description, NULL as status, NULL as priority, NULL as assigned_agent,
               NULL as due_date, NULL as started_at, NULL as completed_at, NULL as updated_at, NULL as labels_json, NULL as story_points,
               task_id, agent_id, NULL as files_json, NULL as boundaries, NULL as acceptance_criteria,
               NULL as command, NULL as output, file_path,
               change_type, summary, diff_snippet, commit_hash
        FROM changelog

        ORDER BY ts DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        type: string;
        id: string;
        ts: number;
        item_id: string;
        title: string | null;
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
        task_id: string | null;
        agent_id: string | null;
        files_json: string | null;
        boundaries: string | null;
        acceptance_criteria: string | null;
        command: string | null;
        output: string | null;
        file_path: string | null;
        change_type: string | null;
        summary: string | null;
        diff_snippet: string | null;
        commit_hash: string | null;
      }>;

    const items: FeedItem[] = rows.map(row => {
      const type = row.type as 'task' | 'intent' | 'evidence' | 'changelog';

      switch (type) {
        case 'task':
          return {
            type,
            ts: row.ts,
            data: {
              id: row.item_id,
              title: row.title!,
              description: row.description ?? undefined,
              status: (row.status ?? 'backlog') as TaskStatus,
              priority: (row.priority ?? 'medium') as TaskPriority,
              assignedAgent: row.assigned_agent ?? undefined,
              dueDate: row.due_date ?? undefined,
              startedAt: row.started_at ?? undefined,
              completedAt: row.completed_at ?? undefined,
              updatedAt: row.updated_at ?? undefined,
              labels: row.labels_json ? JSON.parse(row.labels_json) : [],
              storyPoints: row.story_points ?? undefined,
              createdAt: row.ts
            } as Task
          };

        case 'intent':
          return {
            type,
            ts: row.ts,
            data: {
              id: row.item_id,
              taskId: row.task_id!,
              agentId: row.agent_id!,
              files: row.files_json ? JSON.parse(row.files_json) : [],
              boundaries: row.boundaries ?? undefined,
              acceptanceCriteria: row.acceptance_criteria ?? undefined,
              createdAt: row.ts
            } as Intent
          };

        case 'evidence':
          return {
            type,
            ts: row.ts,
            data: {
              id: row.item_id,
              taskId: row.task_id!,
              agentId: row.agent_id!,
              command: row.command!,
              output: row.output!,
              createdAt: row.ts
            } as Evidence
          };

        case 'changelog':
          return {
            type,
            ts: row.ts,
            data: {
              id: row.item_id,
              taskId: row.task_id ?? undefined,
              agentId: row.agent_id!,
              filePath: row.file_path!,
              changeType: row.change_type!,
              summary: row.summary!,
              diffSnippet: row.diff_snippet ?? undefined,
              commitHash: row.commit_hash ?? undefined,
              createdAt: row.ts
            } as ChangelogEntry
          };

        default:
          throw new Error(`Unknown feed item type: ${type}`);
      }
    });

    // Add active claims (requires aggregation by agent, so separate query)
    const activeClaims = this.claims.listActiveClaims();
    for (const c of activeClaims) {
      items.push({ type: 'claim', ts: c.createdAt, data: c });
    }

    // Sort by timestamp descending and limit
    items.sort((a, b) => b.ts - a.ts);
    return items.slice(0, limit);
  }

  // ==================== TASK DELEGATION ====================

  /**
   * Creates a new task in the SCRUM system.
   *
   * @param title - The task title (required)
   * @param description - Optional detailed description
   * @param options - Optional task configuration
   * @param options.status - Initial status (default: 'backlog')
   * @param options.priority - Priority level (default: 'medium')
   * @param options.assignedAgent - Agent ID to assign the task to
   * @param options.dueDate - Due date as epoch milliseconds
   * @param options.labels - Array of label strings
   * @param options.storyPoints - Estimated story points
   * @returns The created Task with generated ID
   *
   * @example
   * ```typescript
   * const task = scrum.createTask('Fix login bug', 'Users cannot login', {
   *   priority: 'high',
   *   labels: ['bug', 'auth'],
   *   storyPoints: 3
   * });
   * ```
   */
  createTask(title: string, description?: string, options?: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assignedAgent?: string;
    dueDate?: number;
    labels?: string[];
    storyPoints?: number;
  }): Task {
    return this.tasks.createTask(title, description, options);
  }

  /**
   * Retrieves a task by ID.
   *
   * @param id - The task ID
   * @returns The Task if found, null otherwise
   */
  getTask(id: string): Task | null {
    return this.tasks.getTask(id);
  }

  /**
   * Lists tasks with optional filters.
   *
   * @param limit - Maximum number of tasks to return
   * @param filters - Optional filters to narrow results
   * @param filters.status - Filter by task status
   * @param filters.priority - Filter by priority level
   * @param filters.assignedAgent - Filter by assigned agent ID
   * @param filters.labels - Filter by labels (tasks must have all specified labels)
   * @returns Array of matching tasks
   *
   * @example
   * ```typescript
   * // Get high priority in-progress tasks
   * const tasks = scrum.listTasks(50, {
   *   status: 'in_progress',
   *   priority: 'high'
   * });
   * ```
   */
  listTasks(limit?: number, filters?: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assignedAgent?: string;
    labels?: string[];
  }): Task[] {
    return this.tasks.listTasks(limit, filters);
  }

  /**
   * Updates an existing task.
   *
   * Can optionally enforce WIP limits and dependency constraints when
   * changing status.
   *
   * @param taskId - The task ID to update
   * @param updates - Fields to update (only specified fields are changed)
   * @param options - Update behavior options
   * @param options.enforceWipLimits - Block status changes that exceed WIP limits
   * @param options.enforceDependencies - Block starting tasks with incomplete dependencies
   * @returns The updated task, potentially with warnings array
   * @throws {NotFoundError} If task does not exist
   *
   * @example
   * ```typescript
   * const task = scrum.updateTask(taskId, {
   *   status: 'in_progress',
   *   assignedAgent: 'claude-code-abc123'
   * }, { enforceWipLimits: true });
   *
   * if (task.warnings) {
   *   console.log('Warnings:', task.warnings);
   * }
   * ```
   */
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
    return this.tasks.updateTask(taskId, updates, options);
  }

  /**
   * Returns tasks organized by status columns (Kanban board view).
   *
   * @param filters - Optional filters to narrow results
   * @param filters.assignedAgent - Filter by assigned agent
   * @param filters.labels - Filter by labels
   * @returns Object with arrays of tasks for each status column
   *
   * @example
   * ```typescript
   * const board = scrum.getBoard({ assignedAgent: 'claude-code-abc' });
   * console.log(`In progress: ${board.in_progress.length}`);
   * console.log(`Done: ${board.done.length}`);
   * ```
   */
  getBoard(filters?: { assignedAgent?: string; labels?: string[] }): {
    backlog: Task[];
    todo: Task[];
    in_progress: Task[];
    review: Task[];
    done: Task[];
  } {
    return this.tasks.getBoard(filters);
  }

  // ==================== COMMENT DELEGATION ====================

  /**
   * Adds a comment to a task.
   *
   * @param input - Comment creation parameters
   * @param input.taskId - The task to comment on
   * @param input.agentId - The commenting agent's ID
   * @param input.content - The comment text
   * @returns The created Comment
   * @throws {NotFoundError} If task does not exist
   */
  addComment(input: { taskId: string; agentId: string; content: string }): Comment {
    return this.tasks.addComment(input);
  }

  /**
   * Lists comments on a task.
   *
   * @param taskId - The task ID
   * @param limit - Maximum number of comments to return
   * @returns Array of comments, newest first
   */
  listComments(taskId: string, limit?: number): Comment[] {
    return this.tasks.listComments(taskId, limit);
  }

  /**
   * Updates a comment's content.
   *
   * @param commentId - The comment ID to update
   * @param content - New comment content
   * @returns The updated Comment
   * @throws {NotFoundError} If comment does not exist
   */
  updateComment(commentId: string, content: string): Comment {
    return this.tasks.updateComment(commentId, content);
  }

  /**
   * Deletes a comment.
   *
   * @param commentId - The comment ID to delete
   * @returns True if deleted, false if not found
   */
  deleteComment(commentId: string): boolean {
    return this.tasks.deleteComment(commentId);
  }

  // ==================== BLOCKER DELEGATION ====================

  /**
   * Adds a blocker to a task.
   *
   * Blockers represent issues preventing task progress. They can
   * optionally reference another task that is causing the block.
   *
   * @param input - Blocker creation parameters
   * @param input.taskId - The task being blocked
   * @param input.description - Description of the blocker
   * @param input.blockingTaskId - Optional ID of task causing the block
   * @param input.agentId - ID of the agent reporting the blocker
   * @returns The created Blocker
   * @throws {NotFoundError} If task does not exist
   */
  addBlocker(input: {
    taskId: string;
    description: string;
    blockingTaskId?: string;
    agentId: string;
  }): Blocker {
    return this.tasks.addBlocker(input);
  }

  /**
   * Resolves (closes) a blocker.
   *
   * @param blockerId - The blocker ID to resolve
   * @returns The updated Blocker with resolvedAt timestamp
   * @throws {NotFoundError} If blocker does not exist
   */
  resolveBlocker(blockerId: string): Blocker {
    return this.tasks.resolveBlocker(blockerId);
  }

  /**
   * Lists blockers for a task.
   *
   * @param taskId - The task ID
   * @param options - Filter options
   * @param options.unresolvedOnly - If true, only return unresolved blockers
   * @returns Array of blockers
   */
  listBlockers(taskId: string, options?: { unresolvedOnly?: boolean }): Blocker[] {
    return this.tasks.listBlockers(taskId, options);
  }

  /**
   * Gets the count of unresolved blockers for a task.
   *
   * @param taskId - The task ID
   * @returns Number of unresolved blockers
   */
  getUnresolvedBlockersCount(taskId: string): number {
    return this.tasks.getUnresolvedBlockersCount(taskId);
  }

  // ==================== DEPENDENCY DELEGATION ====================

  /**
   * Adds a dependency between tasks.
   *
   * The task cannot start until the dependency task is completed.
   *
   * @param taskId - The task that depends on another
   * @param dependsOnTaskId - The task that must complete first
   * @returns The created TaskDependency
   * @throws {NotFoundError} If either task does not exist
   * @throws {ValidationError} If dependency would create a cycle
   */
  addDependency(taskId: string, dependsOnTaskId: string): TaskDependency {
    return this.tasks.addDependency(taskId, dependsOnTaskId);
  }

  /**
   * Removes a task dependency.
   *
   * @param dependencyId - The dependency record ID
   * @returns True if removed, false if not found
   */
  removeDependency(dependencyId: string): boolean {
    return this.tasks.removeDependency(dependencyId);
  }

  /**
   * Gets dependency relationships for a task.
   *
   * @param taskId - The task ID
   * @returns Object with blockedBy (tasks this depends on) and blocking (tasks depending on this)
   */
  getDependencies(taskId: string): { blockedBy: Task[]; blocking: Task[] } {
    return this.tasks.getDependencies(taskId);
  }

  /**
   * Gets raw dependency records for a task.
   *
   * @param taskId - The task ID
   * @returns Array of TaskDependency records where this task is the dependent
   */
  getDependencyRecords(taskId: string): TaskDependency[] {
    return this.tasks.getDependencyRecords(taskId);
  }

  /**
   * Checks if a task is ready to start (all dependencies completed).
   *
   * @param taskId - The task ID
   * @returns Object indicating if ready and which tasks are blocking
   */
  isTaskReady(taskId: string): { ready: boolean; blockingTasks: Task[] } {
    return this.tasks.isTaskReady(taskId);
  }

  // ==================== WIP LIMITS DELEGATION ====================

  /**
   * Sets a Work-In-Progress limit for a status column.
   *
   * @param status - The status to limit
   * @param limit - Maximum tasks allowed, or null to remove limit
   *
   * @example
   * ```typescript
   * // Limit in_progress to 3 tasks
   * scrum.setWipLimit('in_progress', 3);
   *
   * // Remove limit
   * scrum.setWipLimit('in_progress', null);
   * ```
   */
  setWipLimit(status: TaskStatus, limit: number | null): void {
    return this.tasks.setWipLimit(status, limit);
  }

  /**
   * Gets all configured WIP limits.
   *
   * @returns Object mapping status to limit (undefined means no limit)
   */
  getWipLimits(): WipLimits {
    return this.tasks.getWipLimits();
  }

  /**
   * Gets current WIP status for all columns.
   *
   * @returns Array of WipStatus objects showing count vs limit for each status
   */
  getWipStatus(): WipStatus[] {
    return this.tasks.getWipStatus();
  }

  /**
   * Checks if adding a task to a status would exceed WIP limit.
   *
   * @param status - The status to check
   * @returns Object with allowed flag, current count, and limit if set
   */
  checkWipLimit(status: TaskStatus): { allowed: boolean; count: number; limit?: number } {
    return this.tasks.checkWipLimit(status);
  }

  // ==================== TEMPLATE DELEGATION ====================

  /**
   * Creates a task template for reusable task patterns.
   *
   * Templates support variable substitution using {{variableName}} syntax
   * in title and description patterns.
   *
   * @param input - Template configuration
   * @param input.name - Unique template name
   * @param input.titlePattern - Title with {{variables}} for substitution
   * @param input.descriptionTemplate - Optional description with {{variables}}
   * @param input.defaultStatus - Default status for created tasks
   * @param input.defaultPriority - Default priority
   * @param input.defaultLabels - Default labels array
   * @param input.defaultStoryPoints - Default story points
   * @param input.gates - Gates to create with the task
   * @param input.checklist - Checklist items
   * @returns The created TaskTemplate
   *
   * @example
   * ```typescript
   * const template = scrum.createTemplate({
   *   name: 'bug-fix',
   *   titlePattern: 'Fix: {{issue}}',
   *   descriptionTemplate: 'Bug report: {{description}}',
   *   defaultPriority: 'high',
   *   defaultLabels: ['bug'],
   *   gates: [{ gateType: 'test', command: 'npm test', triggerStatus: 'review' }]
   * });
   * ```
   */
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
    return this.tasks.createTemplate(input);
  }

  /**
   * Retrieves a template by name or ID.
   *
   * @param nameOrId - Template name or ID
   * @returns The TaskTemplate if found, null otherwise
   */
  getTemplate(nameOrId: string): TaskTemplate | null {
    return this.tasks.getTemplate(nameOrId);
  }

  /**
   * Lists all task templates.
   *
   * @returns Array of all TaskTemplate objects
   */
  listTemplates(): TaskTemplate[] {
    return this.tasks.listTemplates();
  }

  /**
   * Creates a task from a template with variable substitution.
   *
   * @param templateNameOrId - Template to use
   * @param variables - Variables to substitute in title/description
   * @param overrides - Optional field overrides
   * @returns The created Task with template defaults and gates
   * @throws {Error} If template not found
   *
   * @example
   * ```typescript
   * const task = scrum.createTaskFromTemplate('bug-fix', {
   *   issue: 'Login fails with special characters',
   *   description: 'Users report login fails when password contains @'
   * }, {
   *   assignedAgent: 'claude-code-abc123'
   * });
   * // Creates: "Fix: Login fails with special characters"
   * ```
   */
  createTaskFromTemplate(
    templateNameOrId: string,
    variables: Record<string, string>,
    overrides?: {
      title?: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      assignedAgent?: string;
      labels?: string[];
      storyPoints?: number;
    }
  ): Task {
    const template = this.getTemplate(templateNameOrId);
    if (!template) throw new Error(`Template not found: ${templateNameOrId}`);

    // Substitute variables in title
    let title = template.titlePattern;
    for (const [key, value] of Object.entries(variables)) {
      title = title.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    // Substitute variables in description
    let description = template.descriptionTemplate;
    if (description) {
      for (const [key, value] of Object.entries(variables)) {
        description = description.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
    }

    // Create task with template defaults + overrides
    const task = this.createTask(
      overrides?.title ?? title,
      overrides?.description ?? description,
      {
        status: overrides?.status ?? template.defaultStatus,
        priority: overrides?.priority ?? template.defaultPriority,
        assignedAgent: overrides?.assignedAgent,
        labels: overrides?.labels ?? template.defaultLabels,
        storyPoints: overrides?.storyPoints ?? template.defaultStoryPoints
      }
    );

    // Create gates from template
    if (template.gates) {
      for (const gateConfig of template.gates) {
        this.defineGate({
          taskId: task.id,
          gateType: gateConfig.gateType,
          command: gateConfig.command,
          triggerStatus: gateConfig.triggerStatus
        });
      }
    }

    return task;
  }

  // ==================== INTENT DELEGATION ====================

  /**
   * Posts an intent declaring files an agent plans to modify.
   *
   * Intents should be posted BEFORE claiming files. They document
   * what the agent intends to do and help coordinate work.
   *
   * @param input - Intent parameters
   * @param input.taskId - The task this work relates to
   * @param input.agentId - The agent posting the intent
   * @param input.files - Array of file paths to be modified
   * @param input.boundaries - Optional scope/boundary description
   * @param input.acceptanceCriteria - Optional success criteria
   * @returns The created Intent
   * @throws {NotFoundError} If task does not exist
   *
   * @example
   * ```typescript
   * const intent = scrum.postIntent({
   *   taskId: task.id,
   *   agentId: 'claude-code-abc123',
   *   files: ['src/auth.ts', 'src/auth.test.ts'],
   *   boundaries: 'Only modify authentication logic',
   *   acceptanceCriteria: 'All tests pass, login works with special chars'
   * });
   * ```
   */
  postIntent(input: {
    taskId: string;
    agentId: string;
    files: string[];
    boundaries?: string;
    acceptanceCriteria?: string;
  }): Intent {
    return this.intents.postIntent(input);
  }

  /**
   * Lists intents for a specific task.
   *
   * @param taskId - The task ID
   * @returns Array of intents for the task
   */
  listIntents(taskId: string): Intent[] {
    return this.intents.listIntents(taskId);
  }

  /**
   * Lists all intents across all tasks.
   *
   * @param limit - Maximum number of intents to return
   * @returns Array of all intents, newest first
   */
  listAllIntents(limit?: number): Intent[] {
    return this.intents.listAllIntents(limit);
  }

  /**
   * Checks if an agent has posted intent for specific files.
   *
   * Use this before claiming files to verify proper workflow.
   *
   * @param agentId - The agent ID
   * @param files - Files to check
   * @returns Object indicating if intent exists and which files are missing
   */
  hasIntentForFiles(agentId: string, files: string[]): { hasIntent: boolean; missingFiles: string[] } {
    return this.intents.hasIntentForFiles(agentId, files);
  }

  // ==================== CLAIM DELEGATION ====================

  /**
   * Creates file claims for exclusive editing rights.
   *
   * Claims prevent other agents from modifying the same files.
   * Returns any existing conflicting claims.
   *
   * @param agentId - The agent claiming files
   * @param files - Array of file paths to claim
   * @param ttlSeconds - Time-to-live in seconds before claim expires
   * @returns Object with the claim and any conflicting agent IDs
   *
   * @example
   * ```typescript
   * const { claim, conflictsWith } = scrum.createClaim(
   *   'claude-code-abc123',
   *   ['src/auth.ts'],
   *   3600  // 1 hour
   * );
   *
   * if (conflictsWith.length > 0) {
   *   console.log('Files claimed by:', conflictsWith);
   * }
   * ```
   */
  createClaim(agentId: string, files: string[], ttlSeconds: number): { claim: Claim; conflictsWith: string[] } {
    return this.claims.createClaim(agentId, files, ttlSeconds);
  }

  /**
   * Lists all active (non-expired) claims.
   *
   * @returns Array of Claim objects grouped by agent
   */
  listActiveClaims(): Claim[] {
    return this.claims.listActiveClaims();
  }

  /**
   * Releases file claims held by an agent.
   *
   * @param agentId - The agent releasing claims
   * @param files - Specific files to release (all if omitted)
   * @returns Number of files released
   */
  releaseClaims(agentId: string, files?: string[]): number {
    return this.claims.releaseClaims(agentId, files);
  }

  /**
   * Extends the TTL of existing claims.
   *
   * @param agentId - The agent whose claims to extend
   * @param additionalSeconds - Seconds to add to current TTL
   * @param files - Specific files to extend (all if omitted)
   * @returns Object with count of extended claims and new expiry time
   */
  extendClaims(agentId: string, additionalSeconds: number, files?: string[]): { extended: number; newExpiresAt: number } {
    return this.claims.extendClaims(agentId, additionalSeconds, files);
  }

  /**
   * Gets list of files currently claimed by an agent.
   *
   * @param agentId - The agent ID
   * @returns Array of claimed file paths
   */
  getAgentClaims(agentId: string): string[] {
    return this.claims.getAgentClaims(agentId);
  }

  // ==================== EVIDENCE DELEGATION ====================

  /**
   * Attaches verification evidence to a task.
   *
   * Evidence records prove that work was completed correctly,
   * typically by capturing command output (tests, builds, etc.).
   *
   * @param input - Evidence parameters
   * @param input.taskId - The task to attach evidence to
   * @param input.agentId - The agent providing evidence
   * @param input.command - The command that was executed
   * @param input.output - The command output/result
   * @returns The created Evidence record
   * @throws {NotFoundError} If task does not exist
   *
   * @example
   * ```typescript
   * scrum.attachEvidence({
   *   taskId: task.id,
   *   agentId: 'claude-code-abc123',
   *   command: 'npm test',
   *   output: 'All 42 tests passed'
   * });
   * ```
   */
  attachEvidence(input: { taskId: string; agentId: string; command: string; output: string }): Evidence {
    return this.evidence.attachEvidence(input);
  }

  /**
   * Lists evidence attached to a task.
   *
   * @param taskId - The task ID
   * @returns Array of Evidence records
   */
  listEvidence(taskId: string): Evidence[] {
    return this.evidence.listEvidence(taskId);
  }

  /**
   * Lists all evidence across all tasks.
   *
   * @param limit - Maximum number of records to return
   * @returns Array of Evidence records, newest first
   */
  listAllEvidence(limit?: number): Evidence[] {
    return this.evidence.listAllEvidence(limit);
  }

  /**
   * Checks if an agent has attached evidence to any tasks.
   *
   * @param agentId - The agent ID
   * @returns Object indicating if evidence exists and which task IDs
   */
  hasEvidenceForTask(agentId: string): { hasEvidence: boolean; taskIds: string[] } {
    return this.evidence.hasEvidenceForTask(agentId);
  }

  // ==================== CHANGELOG DELEGATION ====================

  /**
   * Logs a file change to the changelog.
   *
   * Use this after modifying files to maintain an audit trail.
   *
   * @param input - Change details
   * @param input.taskId - Optional related task ID
   * @param input.agentId - The agent making the change
   * @param input.filePath - Path to the modified file
   * @param input.changeType - Type of change (create, modify, delete, etc.)
   * @param input.summary - Brief description of the change
   * @param input.diffSnippet - Optional diff excerpt
   * @param input.commitHash - Optional git commit hash
   * @returns The created ChangelogEntry
   *
   * @example
   * ```typescript
   * scrum.logChange({
   *   taskId: task.id,
   *   agentId: 'claude-code-abc123',
   *   filePath: 'src/auth.ts',
   *   changeType: 'modify',
   *   summary: 'Added special character handling for passwords',
   *   commitHash: 'abc123f'
   * });
   * ```
   */
  logChange(input: {
    taskId?: string;
    agentId: string;
    filePath: string;
    changeType: ChangeType;
    summary: string;
    diffSnippet?: string;
    commitHash?: string;
  }): ChangelogEntry {
    return this.changelog.logChange(input);
  }

  /**
   * Searches the changelog with various filters.
   *
   * @param options - Search filters (all optional)
   * @param options.filePath - Filter by file path (partial match)
   * @param options.agentId - Filter by agent ID
   * @param options.taskId - Filter by task ID
   * @param options.changeType - Filter by change type
   * @param options.since - Only changes after this timestamp
   * @param options.until - Only changes before this timestamp
   * @param options.query - Text search in summary
   * @param options.limit - Maximum results to return
   * @returns Array of matching ChangelogEntry records
   */
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
    return this.changelog.searchChangelog(options);
  }

  // ==================== GATE DELEGATION ====================

  /**
   * Defines an approval gate for a task.
   *
   * Gates are checkpoints that must pass before a task can transition
   * to certain statuses. Common types: lint, test, build, review.
   *
   * @param input - Gate configuration
   * @param input.taskId - The task to add the gate to
   * @param input.gateType - Type of gate (lint, test, build, review, custom)
   * @param input.command - Command to run for the gate
   * @param input.triggerStatus - Status that triggers gate check
   * @param input.required - Whether gate must pass (default: true)
   * @returns The created Gate
   * @throws {NotFoundError} If task does not exist
   *
   * @example
   * ```typescript
   * scrum.defineGate({
   *   taskId: task.id,
   *   gateType: 'test',
   *   command: 'npm test',
   *   triggerStatus: 'review',
   *   required: true
   * });
   * ```
   */
  defineGate(input: {
    taskId: string;
    gateType: GateType;
    command: string;
    triggerStatus: TaskStatus;
    required?: boolean;
  }): Gate {
    return this.gates.defineGate(input);
  }

  /**
   * Lists gates defined for a task.
   *
   * @param taskId - The task ID
   * @returns Array of Gate definitions
   */
  listGates(taskId: string): Gate[] {
    return this.gates.listGates(taskId);
  }

  /**
   * Records the result of running a gate.
   *
   * @param input - Gate run result
   * @param input.gateId - The gate that was run
   * @param input.taskId - The task ID
   * @param input.agentId - The agent that ran the gate
   * @param input.passed - Whether the gate passed
   * @param input.output - Optional command output
   * @param input.durationMs - Optional execution duration
   * @returns The created GateRun record
   */
  recordGateRun(input: {
    gateId: string;
    taskId: string;
    agentId: string;
    passed: boolean;
    output?: string;
    durationMs?: number;
  }): GateRun {
    return this.gates.recordGateRun(input);
  }

  /**
   * Gets the gate status for a task transitioning to a status.
   *
   * @param taskId - The task ID
   * @param forStatus - The target status to check gates for
   * @returns GateStatus with allPassed flag and blocking gates
   */
  getGateStatus(taskId: string, forStatus: TaskStatus): GateStatus {
    return this.gates.getGateStatus(taskId, forStatus);
  }

  // ==================== WEBHOOK DELEGATION ====================

  /**
   * Registers a webhook for event notifications.
   *
   * @param input - Webhook configuration
   * @param input.name - Friendly webhook name
   * @param input.url - URL to POST events to
   * @param input.events - Event types to subscribe to
   * @param input.headers - Optional custom headers
   * @param input.secret - Optional secret for HMAC signing
   * @returns The created Webhook
   *
   * @example
   * ```typescript
   * scrum.registerWebhook({
   *   name: 'Slack notifications',
   *   url: 'https://hooks.slack.com/...',
   *   events: ['task.created', 'task.completed'],
   *   secret: 'webhook-secret-123'
   * });
   * ```
   */
  registerWebhook(input: {
    name: string;
    url: string;
    events: WebhookEventType[];
    headers?: Record<string, string>;
    secret?: string;
  }): Webhook {
    return this.webhooks.registerWebhook(input);
  }

  /**
   * Lists registered webhooks.
   *
   * @param options - Filter options
   * @param options.event - Filter by subscribed event type
   * @param options.enabledOnly - Only return enabled webhooks
   * @returns Array of Webhook objects
   */
  listWebhooks(options?: { event?: WebhookEventType; enabledOnly?: boolean }): Webhook[] {
    return this.webhooks.listWebhooks(options);
  }

  /**
   * Updates a webhook configuration.
   *
   * @param webhookId - The webhook ID to update
   * @param updates - Fields to update
   * @returns The updated Webhook, or null if not found
   */
  updateWebhook(webhookId: string, updates: {
    url?: string;
    events?: WebhookEventType[];
    headers?: Record<string, string>;
    enabled?: boolean;
  }): Webhook | null {
    return this.webhooks.updateWebhook(webhookId, updates);
  }

  /**
   * Deletes a webhook.
   *
   * @param webhookId - The webhook ID to delete
   * @returns True if deleted, false if not found
   */
  deleteWebhook(webhookId: string): boolean {
    return this.webhooks.deleteWebhook(webhookId);
  }

  /**
   * Lists delivery history for a webhook.
   *
   * @param webhookId - The webhook ID
   * @param limit - Maximum deliveries to return
   * @returns Array of WebhookDelivery records
   */
  listWebhookDeliveries(webhookId: string, limit?: number): WebhookDelivery[] {
    return this.webhooks.listWebhookDeliveries(webhookId, limit);
  }

  // ==================== METRICS DELEGATION ====================

  /**
   * Gets metrics for a specific task.
   *
   * @param taskId - The task ID
   * @returns TaskMetrics with lead/cycle time, or null if not found
   */
  getTaskMetrics(taskId: string): TaskMetrics | null {
    return this.metrics.getTaskMetrics(taskId);
  }

  /**
   * Gets aggregate board metrics for a time period.
   *
   * Includes throughput, velocity, cycle time percentiles, and WIP status.
   *
   * @param options - Time range options
   * @param options.since - Start of period (epoch ms)
   * @param options.until - End of period (epoch ms)
   * @returns BoardMetrics with comprehensive statistics
   */
  getBoardMetrics(options?: { since?: number; until?: number }): BoardMetrics {
    return this.metrics.getBoardMetrics(options);
  }

  /**
   * Gets velocity data over multiple periods.
   *
   * @param options - Configuration
   * @param options.periodDays - Days per period (default: 7)
   * @param options.periods - Number of periods (default: 4)
   * @returns Array of VelocityPeriod objects
   */
  getVelocity(options?: { periodDays?: number; periods?: number }): VelocityPeriod[] {
    return this.metrics.getVelocity(options);
  }

  /**
   * Finds tasks that have been in progress for too long.
   *
   * @param options - Configuration
   * @param options.thresholdDays - Days before task is considered aging (default: 3)
   * @returns Array of AgingWipTask objects
   */
  getAgingWip(options?: { thresholdDays?: number }): AgingWipTask[] {
    return this.metrics.getAgingWip(options);
  }

  /**
   * Finds potentially dead/stale work items.
   *
   * Dead work includes tasks that are in progress but have no recent
   * activity, claims, or evidence.
   *
   * @param options - Configuration
   * @param options.staleDays - Days without activity to flag (default: 7)
   * @returns Array of DeadWork items with reason
   */
  findDeadWork(options?: { staleDays?: number }): DeadWork[] {
    return this.metrics.findDeadWork(options);
  }

  // ==================== AGENT DELEGATION ====================

  /**
   * Registers an agent in the system.
   *
   * @param input - Agent registration details
   * @param input.agentId - Unique agent identifier
   * @param input.capabilities - List of agent capabilities (e.g., 'code', 'test')
   * @param input.metadata - Optional additional metadata
   * @returns The registered Agent
   *
   * @example
   * ```typescript
   * scrum.registerAgent({
   *   agentId: 'claude-code-abc123',
   *   capabilities: ['code', 'test', 'review'],
   *   metadata: { model: 'claude-opus-4' }
   * });
   * ```
   */
  registerAgent(input: {
    agentId: string;
    capabilities: string[];
    metadata?: Record<string, unknown>;
  }): Agent {
    return this.agents.registerAgent(input);
  }

  /**
   * Lists registered agents.
   *
   * @param options - Filter options
   * @param options.status - Filter by agent status
   * @param options.includeOffline - Include offline agents (default: false)
   * @returns Array of Agent objects
   */
  listAgents(options?: { status?: AgentStatus; includeOffline?: boolean }): Agent[] {
    return this.agents.listAgents(options);
  }

  /**
   * Sends a heartbeat for an agent to indicate it is still active.
   *
   * Agents that don't heartbeat will be marked as offline.
   *
   * @param agentId - The agent ID
   * @returns True if agent exists and was updated
   */
  agentHeartbeat(agentId: string): boolean {
    return this.agents.agentHeartbeat(agentId);
  }

  // ==================== COMPLIANCE ====================

  /**
   * Checks compliance for an agent's work on a task.
   *
   * Verifies that the agent's actual work matches their declared intent:
   * - Intent was posted
   * - Evidence was attached
   * - Modified files match declared files
   * - Boundary files were not touched
   * - Claims have been released
   *
   * @param taskId - The task to check
   * @param agentId - The agent whose work to check
   * @returns ComplianceCheck with score, checks, and summary
   *
   * @example
   * ```typescript
   * const result = scrum.checkCompliance('task-123', 'claude-code-abc');
   * if (!result.canComplete) {
   *   console.log('Issues:', result.summary);
   *   // Agent can iterate to fix issues
   * }
   * ```
   */
  checkCompliance(taskId: string, agentId: string): ComplianceCheck {
    return this.compliance.checkCompliance(taskId, agentId);
  }

  /**
   * Gets all agents who have worked on a task.
   *
   * Checks intents, evidence, and changelog for agent activity.
   *
   * @param taskId - The task ID
   * @returns Array of unique agent IDs
   */
  getTaskAgents(taskId: string): string[] {
    const agentIds = new Set<string>();

    // Check intents
    const intents = this.intents.listIntents(taskId);
    for (const intent of intents) {
      agentIds.add(intent.agentId);
    }

    // Check evidence
    const evidence = this.evidence.listEvidence(taskId);
    for (const ev of evidence) {
      agentIds.add(ev.agentId);
    }

    // Check changelog
    const changelog = this.changelog.searchChangelog({ taskId });
    for (const entry of changelog) {
      agentIds.add(entry.agentId);
    }

    // Filter out "system" agent - it's internal and not subject to compliance
    agentIds.delete('system');

    return [...agentIds];
  }

  // ==================== SPRINT DELEGATION ====================

  /**
   * Creates a new sprint for collaborative multi-agent work.
   *
   * A Sprint is NOT about control - it's about shared understanding.
   * Agents in a sprint are incentivized to understand each other's code
   * to create better integrated systems.
   *
   * @param input - Sprint creation parameters
   * @param input.taskId - The task this sprint is for
   * @param input.name - Optional sprint name
   * @param input.goal - Optional goal describing what we're trying to achieve
   * @returns The created Sprint
   *
   * @example
   * ```typescript
   * const sprint = scrum.createSprint({
   *   taskId: 'task-123',
   *   name: 'Auth Implementation',
   *   goal: 'Implement full authentication system with frontend and backend'
   * });
   * ```
   */
  createSprint(input: { taskId: string; name?: string; goal?: string }): Sprint {
    return this.sprints.createSprint(input);
  }

  /**
   * Gets a sprint by ID.
   *
   * @param sprintId - The sprint ID
   * @returns The Sprint if found, null otherwise
   */
  getSprint(sprintId: string): Sprint | null {
    return this.sprints.getSprint(sprintId);
  }

  /**
   * Gets the active sprint for a task.
   *
   * Returns the most recent active sprint if multiple exist.
   *
   * @param taskId - The task ID
   * @returns The active Sprint if found, null otherwise
   */
  getSprintForTask(taskId: string): Sprint | null {
    return this.sprints.getSprintForTask(taskId);
  }

  /**
   * Lists sprints with optional filters.
   *
   * @param filters - Optional filters
   * @param filters.taskId - Filter by task ID
   * @param filters.status - Filter by sprint status
   * @returns Array of matching sprints
   */
  listSprints(filters?: { taskId?: string; status?: SprintStatus }): Sprint[] {
    return this.sprints.listSprints(filters);
  }

  /**
   * Completes a sprint.
   *
   * @param sprintId - The sprint ID to complete
   * @returns The updated Sprint, or null if not found
   */
  completeSprint(sprintId: string): Sprint | null {
    return this.sprints.completeSprint(sprintId);
  }

  /**
   * Joins a sprint - declare what you're working on.
   *
   * This is how agents register their presence and focus area in a sprint.
   * Other agents can see what you're working on and coordinate accordingly.
   *
   * @param input - Join parameters
   * @param input.sprintId - The sprint to join
   * @param input.agentId - Your agent ID
   * @param input.workingOn - Human-readable description of your focus
   * @param input.focusArea - Optional area like "backend", "frontend", "tests"
   * @returns The created SprintMember record
   *
   * @example
   * ```typescript
   * scrum.joinSprint({
   *   sprintId: 'sprint-abc',
   *   agentId: 'claude-code-123',
   *   workingOn: 'Implementing JWT authentication in backend',
   *   focusArea: 'backend'
   * });
   * ```
   */
  joinSprint(input: {
    sprintId: string;
    agentId: string;
    workingOn: string;
    focusArea?: string;
  }): SprintMember {
    return this.sprints.joinSprint(input);
  }

  /**
   * Leaves a sprint.
   *
   * @param sprintId - The sprint to leave
   * @param agentId - Your agent ID
   * @returns True if left successfully, false if not in sprint
   */
  leaveSprint(sprintId: string, agentId: string): boolean {
    return this.sprints.leaveSprint(sprintId, agentId);
  }

  /**
   * Gets all active members of a sprint.
   *
   * @param sprintId - The sprint ID
   * @returns Array of SprintMember records
   */
  getSprintMembers(sprintId: string): SprintMember[] {
    return this.sprints.getMembers(sprintId);
  }

  /**
   * Gets the sprint that an agent is currently in.
   *
   * @param agentId - The agent ID
   * @returns The Sprint if agent is in one, null otherwise
   */
  getAgentSprint(agentId: string): Sprint | null {
    return this.sprints.getAgentSprint(agentId);
  }

  /**
   * Shares context with the sprint group.
   *
   * This is the key collaborative primitive - how agents understand each other:
   * - context: Background info, codebase knowledge
   * - decision: Architectural/design decisions
   * - interface: API contracts, function signatures, exports
   * - discovery: "I found out that X works like Y"
   * - integration: "To integrate with my code, do X"
   * - question: Ask the group
   * - answer: Response to a question
   *
   * @param input - Share parameters
   * @param input.sprintId - The sprint to share with
   * @param input.agentId - Your agent ID
   * @param input.shareType - Type of share (context, decision, interface, etc.)
   * @param input.title - Short summary
   * @param input.content - Full detail
   * @param input.relatedFiles - Optional related file paths
   * @param input.replyToId - If answering a question, the question's ID
   * @returns The created SprintShare record
   *
   * @example
   * ```typescript
   * // Share an interface
   * scrum.shareWithSprint({
   *   sprintId: 'sprint-abc',
   *   agentId: 'claude-code-123',
   *   shareType: 'interface',
   *   title: 'Auth service API',
   *   content: `export interface AuthService {
   *     login(email: string, password: string): Promise<Token>;
   *     logout(): void;
   *     isAuthenticated(): boolean;
   *   }`,
   *   relatedFiles: ['src/auth/types.ts']
   * });
   * ```
   */
  shareWithSprint(input: {
    sprintId: string;
    agentId: string;
    shareType: ShareType;
    title: string;
    content: string;
    relatedFiles?: string[];
    replyToId?: string;
  }): SprintShare {
    return this.sprints.share(input);
  }

  /**
   * Gets all shares in a sprint.
   *
   * @param sprintId - The sprint ID
   * @param filters - Optional filters
   * @param filters.shareType - Filter by share type
   * @param filters.limit - Maximum shares to return
   * @returns Array of SprintShare records
   */
  getSprintShares(sprintId: string, filters?: { shareType?: ShareType; limit?: number }): SprintShare[] {
    return this.sprints.getShares(sprintId, filters);
  }

  /**
   * Gets unanswered questions in a sprint.
   *
   * Use this to find questions from other agents you might be able to help with.
   *
   * @param sprintId - The sprint ID
   * @returns Array of question SprintShare records without answers
   */
  getUnansweredQuestions(sprintId: string): SprintShare[] {
    return this.sprints.getUnansweredQuestions(sprintId);
  }

  /**
   * Gets complete sprint context - everything an agent needs to understand
   * what the team is doing.
   *
   * Call this before starting work to understand:
   * - Who else is in the sprint and what they're working on
   * - Decisions that have been made
   * - Interfaces/APIs that have been defined
   * - Questions you might be able to answer
   * - Discoveries that could help your work
   *
   * @param sprintId - The sprint ID
   * @returns SprintContext with full team state, or null if not found
   *
   * @example
   * ```typescript
   * const ctx = scrum.getSprintContext('sprint-abc');
   * if (ctx) {
   *   console.log(`${ctx.members.length} agents in sprint`);
   *   console.log(`Files being touched: ${ctx.allFiles.join(', ')}`);
   *
   *   // Check for interfaces to implement
   *   const interfaces = ctx.shares.filter(s => s.shareType === 'interface');
   *
   *   // Check for unanswered questions
   *   const questions = ctx.shares.filter(s => s.shareType === 'question');
   * }
   * ```
   */
  getSprintContext(sprintId: string): SprintContext | null {
    return this.sprints.getContext(sprintId);
  }

  /**
   * Links an intent to a sprint for aggregated file tracking.
   *
   * @param intentId - The intent ID
   * @param sprintId - The sprint ID
   */
  linkIntentToSprint(intentId: string, sprintId: string): void {
    return this.sprints.linkIntentToSprint(intentId, sprintId);
  }
}
