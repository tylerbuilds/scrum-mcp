import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type {
  Sprint,
  SprintId,
  SprintMember,
  SprintShare,
  SprintShareId,
  SprintStatus,
  ShareType,
  SprintContext,
  Intent
} from '../types.js';
import { type BaseRepository, now } from './base.js';
import { nanoid } from 'nanoid';

// ==================== INPUT TYPES ====================

export interface SprintCreateInput {
  taskId: string;
  name?: string;
  goal?: string;
}

export interface SprintJoinInput {
  sprintId: string;
  agentId: string;
  workingOn: string;
  focusArea?: string;
}

export interface SprintShareInput {
  sprintId: string;
  agentId: string;
  shareType: ShareType;
  title: string;
  content: string;
  relatedFiles?: string[];
  replyToId?: string;
}

// ==================== DATABASE ROW TYPES ====================

interface SprintRow {
  id: string;
  task_id: string;
  name: string | null;
  goal: string | null;
  status: string;
  created_at: number;
  completed_at: number | null;
}

interface SprintMemberRow {
  sprint_id: string;
  agent_id: string;
  working_on: string;
  focus_area: string | null;
  joined_at: number;
  left_at: number | null;
}

interface SprintShareRow {
  id: string;
  sprint_id: string;
  agent_id: string;
  share_type: string;
  title: string;
  content: string;
  related_files_json: string | null;
  reply_to_id: string | null;
  created_at: number;
}

interface IntentRow {
  id: string;
  task_id: string;
  agent_id: string;
  files_json: string;
  boundaries: string | null;
  acceptance_criteria: string | null;
  sprint_id: string | null;
  created_at: number;
}

// ==================== REPOSITORY ====================

/**
 * Sprints Repository - Collaborative spaces for multi-agent work
 *
 * Philosophy: Sprint is NOT about control, it's about shared understanding.
 * Agents are incentivized to understand each other's work to create
 * better integrated systems.
 *
 * Key primitives:
 * - Sprint: A collaborative space tied to a task
 * - Members: Who's in the sprint and what they're working on
 * - Shares: Context, decisions, interfaces, discoveries shared between agents
 */
export class SprintsRepository implements BaseRepository {
  constructor(
    public readonly db: BetterSqlite3.Database,
    public readonly log: Logger
  ) {}

  // ==================== SPRINT CRUD ====================

  /**
   * Create a new sprint for collaborative work on a task
   */
  createSprint(input: SprintCreateInput): Sprint {
    const id = nanoid(12);
    const createdAt = now();

    this.db.prepare(`
      INSERT INTO sprints (id, task_id, name, goal, status, created_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(id, input.taskId, input.name || null, input.goal || null, createdAt);

    this.log.info({ sprintId: id, taskId: input.taskId }, 'Sprint created');

    return {
      id,
      taskId: input.taskId,
      name: input.name,
      goal: input.goal,
      status: 'active',
      createdAt
    };
  }

  /**
   * Get a sprint by ID
   */
  getSprint(sprintId: string): Sprint | null {
    const row = this.db.prepare(`SELECT * FROM sprints WHERE id = ?`).get(sprintId) as SprintRow | undefined;
    return row ? this.mapSprintRow(row) : null;
  }

  /**
   * Get sprint for a task (returns most recent active sprint)
   */
  getSprintForTask(taskId: string): Sprint | null {
    const row = this.db.prepare(`
      SELECT * FROM sprints
      WHERE task_id = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(taskId) as SprintRow | undefined;
    return row ? this.mapSprintRow(row) : null;
  }

  /**
   * List all active sprints
   */
  listSprints(filters?: { taskId?: string; status?: SprintStatus }): Sprint[] {
    let sql = 'SELECT * FROM sprints WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.taskId) {
      sql += ' AND task_id = ?';
      params.push(filters.taskId);
    }
    if (filters?.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY created_at DESC';

    const rows = this.db.prepare(sql).all(...params) as SprintRow[];
    return rows.map(r => this.mapSprintRow(r));
  }

  /**
   * Complete a sprint
   */
  completeSprint(sprintId: string): Sprint | null {
    const completedAt = now();
    this.db.prepare(`
      UPDATE sprints SET status = 'completed', completed_at = ? WHERE id = ?
    `).run(completedAt, sprintId);

    return this.getSprint(sprintId);
  }

  // ==================== MEMBERS ====================

  /**
   * Join a sprint - declare what you're working on
   */
  joinSprint(input: SprintJoinInput): SprintMember {
    const joinedAt = now();

    // Upsert: if already joined, update working_on
    this.db.prepare(`
      INSERT INTO sprint_members (sprint_id, agent_id, working_on, focus_area, joined_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(sprint_id, agent_id) DO UPDATE SET
        working_on = excluded.working_on,
        focus_area = excluded.focus_area,
        left_at = NULL
    `).run(
      input.sprintId,
      input.agentId,
      input.workingOn,
      input.focusArea || null,
      joinedAt
    );

    this.log.info({ sprintId: input.sprintId, agentId: input.agentId }, 'Agent joined sprint');

    return {
      sprintId: input.sprintId,
      agentId: input.agentId,
      workingOn: input.workingOn,
      focusArea: input.focusArea,
      joinedAt
    };
  }

  /**
   * Leave a sprint
   */
  leaveSprint(sprintId: string, agentId: string): boolean {
    const result = this.db.prepare(`
      UPDATE sprint_members SET left_at = ? WHERE sprint_id = ? AND agent_id = ? AND left_at IS NULL
    `).run(now(), sprintId, agentId);

    return result.changes > 0;
  }

  /**
   * Get all active members of a sprint
   */
  getMembers(sprintId: string): SprintMember[] {
    const rows = this.db.prepare(`
      SELECT * FROM sprint_members
      WHERE sprint_id = ? AND left_at IS NULL
      ORDER BY joined_at ASC
    `).all(sprintId) as SprintMemberRow[];

    return rows.map(r => this.mapMemberRow(r));
  }

  /**
   * Get sprint that an agent is currently in
   */
  getAgentSprint(agentId: string): Sprint | null {
    const row = this.db.prepare(`
      SELECT s.* FROM sprints s
      JOIN sprint_members m ON s.id = m.sprint_id
      WHERE m.agent_id = ? AND m.left_at IS NULL AND s.status = 'active'
      ORDER BY m.joined_at DESC
      LIMIT 1
    `).get(agentId) as SprintRow | undefined;

    return row ? this.mapSprintRow(row) : null;
  }

  // ==================== SHARES (THE KEY COLLABORATIVE PRIMITIVE) ====================

  /**
   * Share context with the sprint group
   *
   * This is how agents understand each other's work:
   * - context: Background info, codebase knowledge
   * - decision: Architectural/design decisions
   * - interface: API contracts, function signatures, exports
   * - discovery: "I found out that X works like Y"
   * - integration: "To integrate with my code, do X"
   * - question: Ask the group
   * - answer: Response to a question
   */
  share(input: SprintShareInput): SprintShare {
    const id = nanoid(12);
    const createdAt = now();

    this.db.prepare(`
      INSERT INTO sprint_shares (id, sprint_id, agent_id, share_type, title, content, related_files_json, reply_to_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.sprintId,
      input.agentId,
      input.shareType,
      input.title,
      input.content,
      input.relatedFiles ? JSON.stringify(input.relatedFiles) : null,
      input.replyToId || null,
      createdAt
    );

    this.log.info(
      { shareId: id, sprintId: input.sprintId, type: input.shareType },
      'Context shared in sprint'
    );

    return {
      id,
      sprintId: input.sprintId,
      agentId: input.agentId,
      shareType: input.shareType,
      title: input.title,
      content: input.content,
      relatedFiles: input.relatedFiles,
      replyToId: input.replyToId,
      createdAt
    };
  }

  /**
   * Get all shares for a sprint
   */
  getShares(sprintId: string, filters?: { shareType?: ShareType; limit?: number }): SprintShare[] {
    let sql = 'SELECT * FROM sprint_shares WHERE sprint_id = ?';
    const params: unknown[] = [sprintId];

    if (filters?.shareType) {
      sql += ' AND share_type = ?';
      params.push(filters.shareType);
    }

    sql += ' ORDER BY created_at ASC';

    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as SprintShareRow[];
    return rows.map(r => this.mapShareRow(r));
  }

  /**
   * Get unanswered questions in a sprint
   */
  getUnansweredQuestions(sprintId: string): SprintShare[] {
    const rows = this.db.prepare(`
      SELECT q.* FROM sprint_shares q
      LEFT JOIN sprint_shares a ON a.reply_to_id = q.id
      WHERE q.sprint_id = ? AND q.share_type = 'question' AND a.id IS NULL
      ORDER BY q.created_at ASC
    `).all(sprintId) as SprintShareRow[];

    return rows.map(r => this.mapShareRow(r));
  }

  // ==================== FULL CONTEXT ====================

  /**
   * Get complete sprint context - everything an agent needs to understand
   * what the team is doing
   */
  getContext(sprintId: string): SprintContext | null {
    const sprint = this.getSprint(sprintId);
    if (!sprint) return null;

    const members = this.getMembers(sprintId);
    const shares = this.getShares(sprintId);

    // Get all intents from sprint members for this task
    const memberAgentIds = members.map(m => m.agentId);
    const placeholders = memberAgentIds.map(() => '?').join(',');

    const intentRows = memberAgentIds.length > 0
      ? this.db.prepare(`
          SELECT * FROM intents
          WHERE task_id = ? AND agent_id IN (${placeholders})
          ORDER BY created_at ASC
        `).all(sprint.taskId, ...memberAgentIds) as IntentRow[]
      : [];

    // Aggregate all files and boundaries
    const allFilesSet = new Set<string>();
    const allBoundariesSet = new Set<string>();

    for (const row of intentRows) {
      const files = JSON.parse(row.files_json) as string[];
      files.forEach(f => allFilesSet.add(f));

      if (row.boundaries) {
        // Parse boundaries (comma/newline separated)
        row.boundaries.split(/[,\n;]+/).forEach(b => {
          const trimmed = b.trim();
          if (trimmed) allBoundariesSet.add(trimmed);
        });
      }
    }

    return {
      sprint,
      members,
      shares,
      allFiles: [...allFilesSet],
      allBoundaries: [...allBoundariesSet]
    };
  }

  /**
   * Link an intent to a sprint (for aggregated file tracking)
   */
  linkIntentToSprint(intentId: string, sprintId: string): void {
    this.db.prepare(`
      UPDATE intents SET sprint_id = ? WHERE id = ?
    `).run(sprintId, intentId);
  }

  // ==================== MAPPERS ====================

  private mapSprintRow(row: SprintRow): Sprint {
    return {
      id: row.id,
      taskId: row.task_id,
      name: row.name || undefined,
      goal: row.goal || undefined,
      status: row.status as SprintStatus,
      createdAt: row.created_at,
      completedAt: row.completed_at || undefined
    };
  }

  private mapMemberRow(row: SprintMemberRow): SprintMember {
    return {
      sprintId: row.sprint_id,
      agentId: row.agent_id,
      workingOn: row.working_on,
      focusArea: row.focus_area || undefined,
      joinedAt: row.joined_at,
      leftAt: row.left_at || undefined
    };
  }

  private mapShareRow(row: SprintShareRow): SprintShare {
    return {
      id: row.id,
      sprintId: row.sprint_id,
      agentId: row.agent_id,
      shareType: row.share_type as ShareType,
      title: row.title,
      content: row.content,
      relatedFiles: row.related_files_json ? JSON.parse(row.related_files_json) : undefined,
      replyToId: row.reply_to_id || undefined,
      createdAt: row.created_at
    };
  }
}
