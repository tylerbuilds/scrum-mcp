import { nanoid } from 'nanoid';
import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type { Intent } from '../types.js';
import { type BaseRepository, now } from './base.js';

// Database row types
interface IntentRow {
  id: string;
  task_id: string;
  agent_id: string;
  files_json: string;
  boundaries: string | null;
  acceptance_criteria: string | null;
  created_at: number;
}

/**
 * Callback interface for validating tasks exist
 */
export interface TaskValidator {
  getTask(id: string): { id: string } | null;
}

/**
 * Intents Repository - handles intent posting and listing
 */
export class IntentsRepository implements BaseRepository {
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

  private rowToIntent(row: IntentRow): Intent {
    return {
      id: row.id,
      taskId: row.task_id,
      agentId: row.agent_id,
      files: JSON.parse(row.files_json) as string[],
      boundaries: row.boundaries ?? undefined,
      acceptanceCriteria: row.acceptance_criteria ?? undefined,
      createdAt: row.created_at
    };
  }

  // ==================== INTENT MANAGEMENT ====================

  postIntent(input: {
    taskId: string;
    agentId: string;
    files: string[];
    boundaries?: string;
    acceptanceCriteria?: string;
  }): Intent {
    // Validate task exists if validator is set
    if (this.taskValidator) {
      const task = this.taskValidator.getTask(input.taskId);
      if (!task) throw new Error(`Unknown taskId: ${input.taskId}`);
    }

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
    return rows.map((r) => this.rowToIntent(r));
  }

  listAllIntents(limit = 100): Intent[] {
    const rows = this.db
      .prepare('SELECT id, task_id, agent_id, files_json, boundaries, acceptance_criteria, created_at FROM intents ORDER BY created_at DESC LIMIT ?')
      .all(limit) as IntentRow[];
    return rows.map((r) => this.rowToIntent(r));
  }

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
}
