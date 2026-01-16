import { nanoid } from 'nanoid';
import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type { Evidence } from '../types.js';
import { type BaseRepository, clipOutput, now } from './base.js';

// Database row types
interface EvidenceRow {
  id: string;
  task_id: string;
  agent_id: string;
  command: string;
  output: string;
  created_at: number;
}

/**
 * Callback interface for validating tasks exist
 */
export interface TaskValidator {
  getTask(id: string): { id: string } | null;
}

/**
 * Evidence Repository - handles evidence attachment and retrieval
 */
export class EvidenceRepository implements BaseRepository {
  private taskValidator: TaskValidator | null = null;

  constructor(
    public readonly db: BetterSqlite3.Database,
    public readonly log: Logger
  ) {}

  /**
   * Set the task validator for checking task existence
   */
  setTaskValidator(validator: TaskValidator): void {
    this.taskValidator = validator;
  }

  // ==================== ROW MAPPERS ====================

  private rowToEvidence(row: EvidenceRow): Evidence {
    return {
      id: row.id,
      taskId: row.task_id,
      agentId: row.agent_id,
      command: row.command,
      output: row.output,
      createdAt: row.created_at
    };
  }

  // ==================== EVIDENCE MANAGEMENT ====================

  attachEvidence(input: { taskId: string; agentId: string; command: string; output: string }): Evidence {
    // Validate task exists if validator is set
    if (this.taskValidator) {
      const task = this.taskValidator.getTask(input.taskId);
      if (!task) throw new Error(`Unknown taskId: ${input.taskId}`);
    }

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
    return rows.map((r) => this.rowToEvidence(r));
  }

  listAllEvidence(limit = 100): Evidence[] {
    const rows = this.db
      .prepare('SELECT id, task_id, agent_id, command, output, created_at FROM evidence ORDER BY created_at DESC LIMIT ?')
      .all(limit) as EvidenceRow[];
    return rows.map((r) => this.rowToEvidence(r));
  }

  hasEvidenceForTask(agentId: string): { hasEvidence: boolean; taskIds: string[] } {
    const rows = this.db
      .prepare('SELECT DISTINCT task_id FROM evidence WHERE agent_id = ?')
      .all(agentId) as Array<{ task_id: string }>;

    return { hasEvidence: rows.length > 0, taskIds: rows.map(r => r.task_id) };
  }
}
