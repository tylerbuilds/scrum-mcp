/**
 * Centralized SQL column definitions and common query templates.
 *
 * This file provides a single source of truth for:
 * - Column lists used in SELECT statements
 * - Common query patterns used across domain modules
 *
 * Usage:
 * ```typescript
 * import { COLUMNS, QUERIES } from './queries.js';
 *
 * // Use column definitions
 * db.prepare(`SELECT ${COLUMNS.TASK} FROM tasks WHERE id = ?`).get(id);
 *
 * // Or use pre-built queries
 * db.prepare(QUERIES.TASK_BY_ID).get(id);
 * ```
 */

// =============================================================================
// COLUMN DEFINITIONS
// =============================================================================

/**
 * Column definitions for consistent SELECT statements across all entities.
 * These match the database schema and row interface types in domain modules.
 */
export const COLUMNS = {
  /**
   * Task columns - used in tasks table queries
   * Maps to TaskRow interface in tasks.ts
   */
  TASK: `id, title, description, status, priority, assigned_agent, due_date, started_at, completed_at, updated_at, labels_json, story_points, created_at`,

  /**
   * Claim columns - used in claims table queries
   * Maps to ClaimRow interface in claims.ts
   */
  CLAIM: `agent_id, file_path, expires_at, created_at`,

  /**
   * Intent columns - used in intents table queries
   * Maps to IntentRow interface in intents.ts
   */
  INTENT: `id, task_id, agent_id, files_json, boundaries, acceptance_criteria, created_at`,

  /**
   * Evidence columns - used in evidence table queries
   * Maps to EvidenceRow interface in evidence.ts
   */
  EVIDENCE: `id, task_id, agent_id, command, output, created_at`,

  /**
   * Gate columns - used in gates table queries
   */
  GATE: `id, task_id, gate_type, command, trigger_status, required, created_at`,

  /**
   * Gate run columns - used in gate_runs table queries
   */
  GATE_RUN: `id, gate_id, task_id, agent_id, passed, output, duration_ms, created_at`,

  /**
   * Changelog columns - used in changelog table queries
   * Maps to ChangelogRow interface in changelog.ts
   */
  CHANGELOG: `id, task_id, agent_id, file_path, change_type, summary, diff_snippet, commit_hash, created_at`,

  /**
   * Comment columns - used in comments table queries
   * Maps to CommentRow interface in tasks.ts
   */
  COMMENT: `id, task_id, agent_id, content, created_at, updated_at`,

  /**
   * Blocker columns - used in blockers table queries
   * Maps to BlockerRow interface in tasks.ts
   */
  BLOCKER: `id, task_id, description, blocking_task_id, resolved_at, created_at, created_by`,

  /**
   * Task dependency columns - used in task_dependencies table queries
   * Maps to DependencyRow interface in tasks.ts
   */
  TASK_DEPENDENCY: `id, task_id, depends_on_task_id, created_at`,

  /**
   * WIP limit columns - used in wip_limits table queries
   * Maps to WipLimitRow interface in tasks.ts
   */
  WIP_LIMIT: `status, max_tasks, updated_at`,

  /**
   * Task template columns - used in task_templates table queries
   */
  TASK_TEMPLATE: `id, name, title_pattern, description_template, default_status, default_priority, default_labels_json, default_story_points, gates_json, checklist_json, created_at, updated_at`,

  /**
   * Agent columns - used in agents table queries
   */
  AGENT: `agent_id, capabilities_json, metadata_json, last_heartbeat, registered_at, status`,

  /**
   * Webhook columns - used in webhooks table queries
   */
  WEBHOOK: `id, name, url, events_json, headers_json, secret, enabled, created_at, updated_at`,

  /**
   * Webhook delivery columns - used in webhook_deliveries table queries
   */
  WEBHOOK_DELIVERY: `id, webhook_id, event_type, payload_json, status_code, response, duration_ms, success, created_at`,
} as const;

// =============================================================================
// COMMON QUERY TEMPLATES
// =============================================================================

/**
 * Common query templates using the column definitions above.
 * These provide ready-to-use SQL statements for frequent operations.
 */
export const QUERIES = {
  // -------------------------------------------------------------------------
  // TASK QUERIES
  // -------------------------------------------------------------------------

  /** Get a single task by ID */
  TASK_BY_ID: `SELECT ${COLUMNS.TASK} FROM tasks WHERE id = ?`,

  /** List all tasks ordered by creation date (descending), with limit */
  TASKS_LIST: `SELECT ${COLUMNS.TASK} FROM tasks ORDER BY created_at DESC LIMIT ?`,

  /** List tasks by status with limit */
  TASKS_BY_STATUS: `SELECT ${COLUMNS.TASK} FROM tasks WHERE status = ? ORDER BY created_at DESC LIMIT ?`,

  /** List tasks by assigned agent with limit */
  TASKS_BY_AGENT: `SELECT ${COLUMNS.TASK} FROM tasks WHERE assigned_agent = ? ORDER BY created_at DESC LIMIT ?`,

  /** List tasks by priority with limit */
  TASKS_BY_PRIORITY: `SELECT ${COLUMNS.TASK} FROM tasks WHERE priority = ? ORDER BY created_at DESC LIMIT ?`,

  /** Get all non-cancelled tasks for board view, ordered by priority and creation */
  TASKS_FOR_BOARD: `SELECT ${COLUMNS.TASK} FROM tasks WHERE status != 'cancelled' ORDER BY priority DESC, created_at ASC`,

  /** Get completed tasks within a date range */
  TASKS_COMPLETED_IN_RANGE: `SELECT ${COLUMNS.TASK} FROM tasks WHERE status = 'done' AND completed_at >= ? AND completed_at <= ? ORDER BY completed_at DESC`,

  /** Count tasks by status */
  TASK_COUNT_BY_STATUS: `SELECT status, COUNT(*) as count FROM tasks GROUP BY status`,

  /** Count tasks for a specific status */
  TASK_COUNT_FOR_STATUS: `SELECT COUNT(*) as n FROM tasks WHERE status = ?`,

  // -------------------------------------------------------------------------
  // CLAIM QUERIES
  // -------------------------------------------------------------------------

  /** List all active claims ordered by creation date */
  CLAIMS_LIST: `SELECT ${COLUMNS.CLAIM} FROM claims ORDER BY created_at DESC`,

  /** Get claims for a specific agent */
  CLAIMS_BY_AGENT: `SELECT file_path FROM claims WHERE agent_id = ?`,

  /** Find conflicting claims (other agents holding files) */
  CLAIMS_CONFLICTS: `SELECT DISTINCT agent_id FROM claims WHERE agent_id != ? AND expires_at > ? AND file_path IN`,

  /** Delete expired claims */
  CLAIMS_PRUNE_EXPIRED: `DELETE FROM claims WHERE expires_at <= ?`,

  // -------------------------------------------------------------------------
  // INTENT QUERIES
  // -------------------------------------------------------------------------

  /** List intents for a task */
  INTENTS_BY_TASK: `SELECT ${COLUMNS.INTENT} FROM intents WHERE task_id = ? ORDER BY created_at DESC`,

  /** List all intents with limit */
  INTENTS_LIST: `SELECT ${COLUMNS.INTENT} FROM intents ORDER BY created_at DESC LIMIT ?`,

  /** Get files declared in intents for an agent */
  INTENT_FILES_BY_AGENT: `SELECT files_json FROM intents WHERE agent_id = ?`,

  // -------------------------------------------------------------------------
  // EVIDENCE QUERIES
  // -------------------------------------------------------------------------

  /** List evidence for a task */
  EVIDENCE_BY_TASK: `SELECT ${COLUMNS.EVIDENCE} FROM evidence WHERE task_id = ? ORDER BY created_at DESC`,

  /** List all evidence with limit */
  EVIDENCE_LIST: `SELECT ${COLUMNS.EVIDENCE} FROM evidence ORDER BY created_at DESC LIMIT ?`,

  /** Get distinct task IDs with evidence from an agent */
  EVIDENCE_TASKS_BY_AGENT: `SELECT DISTINCT task_id FROM evidence WHERE agent_id = ?`,

  // -------------------------------------------------------------------------
  // GATE QUERIES
  // -------------------------------------------------------------------------

  /** List gates for a task */
  GATES_BY_TASK: `SELECT ${COLUMNS.GATE} FROM gates WHERE task_id = ? ORDER BY created_at ASC`,

  /** Get gate by ID */
  GATE_BY_ID: `SELECT id FROM gates WHERE id = ?`,

  /** Get latest gate run for a gate */
  GATE_RUN_LATEST: `SELECT ${COLUMNS.GATE_RUN} FROM gate_runs WHERE gate_id = ? ORDER BY created_at DESC LIMIT 1`,

  // -------------------------------------------------------------------------
  // CHANGELOG QUERIES
  // -------------------------------------------------------------------------

  /** Search changelog with ordering and limit (base query, conditions added dynamically) */
  CHANGELOG_SEARCH_BASE: `SELECT * FROM changelog`,

  /** Get latest changelog activity for a task */
  CHANGELOG_LATEST_FOR_TASK: `SELECT MAX(created_at) as latest FROM changelog WHERE task_id = ?`,

  // -------------------------------------------------------------------------
  // COMMENT QUERIES
  // -------------------------------------------------------------------------

  /** List comments for a task */
  COMMENTS_BY_TASK: `SELECT ${COLUMNS.COMMENT} FROM comments WHERE task_id = ? ORDER BY created_at DESC LIMIT ?`,

  /** Get comment by ID */
  COMMENT_BY_ID: `SELECT ${COLUMNS.COMMENT} FROM comments WHERE id = ?`,

  // -------------------------------------------------------------------------
  // BLOCKER QUERIES
  // -------------------------------------------------------------------------

  /** List blockers for a task */
  BLOCKERS_BY_TASK: `SELECT ${COLUMNS.BLOCKER} FROM blockers WHERE task_id = ?`,

  /** List unresolved blockers for a task */
  BLOCKERS_UNRESOLVED_BY_TASK: `SELECT ${COLUMNS.BLOCKER} FROM blockers WHERE task_id = ? AND resolved_at IS NULL ORDER BY created_at DESC`,

  /** Get blocker by ID */
  BLOCKER_BY_ID: `SELECT ${COLUMNS.BLOCKER} FROM blockers WHERE id = ?`,

  /** Count unresolved blockers for a task */
  BLOCKER_COUNT_UNRESOLVED: `SELECT COUNT(1) AS n FROM blockers WHERE task_id = ? AND resolved_at IS NULL`,

  // -------------------------------------------------------------------------
  // DEPENDENCY QUERIES
  // -------------------------------------------------------------------------

  /** Get dependencies for a task (tasks it depends on) */
  DEPENDENCIES_BLOCKED_BY: `SELECT t.${COLUMNS.TASK.split(', ').map(c => `t.${c}`).join(', ')}
    FROM tasks t
    INNER JOIN task_dependencies d ON t.id = d.depends_on_task_id
    WHERE d.task_id = ?`,

  /** Get dependents of a task (tasks that depend on it) */
  DEPENDENCIES_BLOCKING: `SELECT t.${COLUMNS.TASK.split(', ').map(c => `t.${c}`).join(', ')}
    FROM tasks t
    INNER JOIN task_dependencies d ON t.id = d.task_id
    WHERE d.depends_on_task_id = ?`,

  /** Get dependency records for a task */
  DEPENDENCY_RECORDS_BY_TASK: `SELECT ${COLUMNS.TASK_DEPENDENCY} FROM task_dependencies WHERE task_id = ?`,

  /** Check for circular dependency path */
  DEPENDENCY_PATH_CHECK: `SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?`,

  // -------------------------------------------------------------------------
  // WIP LIMIT QUERIES
  // -------------------------------------------------------------------------

  /** Get all WIP limits */
  WIP_LIMITS_ALL: `SELECT ${COLUMNS.WIP_LIMIT} FROM wip_limits`,

  // -------------------------------------------------------------------------
  // AGENT QUERIES
  // -------------------------------------------------------------------------

  /** List all agents */
  AGENTS_LIST: `SELECT ${COLUMNS.AGENT} FROM agents ORDER BY last_heartbeat DESC`,

  /** Get agent by ID */
  AGENT_BY_ID: `SELECT ${COLUMNS.AGENT} FROM agents WHERE agent_id = ?`,

  /** Get distinct agent IDs from intents */
  AGENT_IDS_FROM_INTENTS: `SELECT DISTINCT agent_id FROM intents`,

  /** Get distinct agent IDs from evidence */
  AGENT_IDS_FROM_EVIDENCE: `SELECT DISTINCT agent_id FROM evidence`,

  /** Get distinct agent IDs from claims */
  AGENT_IDS_FROM_CLAIMS: `SELECT DISTINCT agent_id FROM claims`,

  // -------------------------------------------------------------------------
  // WEBHOOK QUERIES
  // -------------------------------------------------------------------------

  /** List all webhooks */
  WEBHOOKS_LIST: `SELECT ${COLUMNS.WEBHOOK} FROM webhooks ORDER BY created_at DESC`,

  /** Get webhook by ID */
  WEBHOOK_BY_ID: `SELECT ${COLUMNS.WEBHOOK} FROM webhooks WHERE id = ?`,

  /** List webhook deliveries for a webhook */
  WEBHOOK_DELIVERIES_BY_WEBHOOK: `SELECT ${COLUMNS.WEBHOOK_DELIVERY} FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ?`,

  // -------------------------------------------------------------------------
  // METRICS QUERIES
  // -------------------------------------------------------------------------

  /** Get in-progress tasks for dead work detection */
  TASKS_IN_PROGRESS: `SELECT id, title, status, assigned_agent, started_at, created_at FROM tasks WHERE status = 'in_progress'`,

  /** Get aging WIP tasks (in_progress for longer than threshold) */
  TASKS_AGING_WIP: `SELECT id, title, started_at, assigned_agent FROM tasks WHERE status = 'in_progress' AND started_at IS NOT NULL AND started_at < ? ORDER BY started_at ASC`,

  /** Get latest evidence timestamp for a task */
  EVIDENCE_LATEST_FOR_TASK: `SELECT MAX(created_at) as latest FROM evidence WHERE task_id = ?`,

  /** Count completed tasks in date range */
  TASK_COUNT_COMPLETED_IN_RANGE: `SELECT COUNT(*) as count FROM tasks WHERE status = 'done' AND completed_at >= ? AND completed_at < ?`,

  /** Sum story points for completed tasks in date range */
  TASK_POINTS_COMPLETED_IN_RANGE: `SELECT COUNT(*) as count, COALESCE(SUM(story_points), 0) as points FROM tasks WHERE status = 'done' AND completed_at >= ? AND completed_at < ?`,
} as const;

// =============================================================================
// TYPE EXPORTS
// =============================================================================

/** Type for column definition keys */
export type ColumnKey = keyof typeof COLUMNS;

/** Type for query keys */
export type QueryKey = keyof typeof QUERIES;
