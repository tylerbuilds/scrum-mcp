import { nanoid } from 'nanoid';
import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type { Gate, GateResult, GateResultStatus, GateRun, GateStatus, GateType, TaskStatus } from '../types.js';
import { type BaseRepository, clipOutput, now } from './base.js';

// ==================== COMMAND VALIDATION ====================

const SAFE_PREFIXES = [
  'npm ', 'pnpm ', 'yarn ', 'bun ',
  'pytest ', 'jest ', 'vitest ', 'mocha ',
  'eslint ', 'tsc ', 'prettier ',
  'cargo ', 'go ', 'make ',
  'docker ', 'kubectl '
];

const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>\\!\n]/;

function validateGateCommand(command: string): void {
  // Check for shell metacharacters
  if (SHELL_METACHARACTERS.test(command)) {
    throw new Error('Gate command contains prohibited shell metacharacters');
  }

  // Check for safe prefix
  const hasSafePrefix = SAFE_PREFIXES.some(prefix => command.startsWith(prefix));
  if (!hasSafePrefix) {
    throw new Error(`Gate command must start with a safe prefix: ${SAFE_PREFIXES.join(', ')}`);
  }
}

/**
 * Callback interface for validating tasks exist
 */
export interface TaskValidator {
  getTask(id: string): { id: string } | null;
}

/**
 * Gates Repository - handles gate definitions, runs, and status checks
 */
export class GatesRepository implements BaseRepository {
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

  // ==================== GATE DEFINITIONS ====================

  defineGate(input: {
    taskId: string;
    gateType: GateType;
    command: string;
    triggerStatus: TaskStatus;
    required?: boolean;
  }): Gate {
    // Validate command for security (prevent command injection)
    validateGateCommand(input.command);

    // Validate task exists if validator is set
    if (this.taskValidator) {
      const task = this.taskValidator.getTask(input.taskId);
      if (!task) throw new Error(`Unknown taskId: ${input.taskId}`);
    }

    const gate: Gate = {
      id: nanoid(12),
      taskId: input.taskId,
      gateType: input.gateType,
      command: input.command,
      triggerStatus: input.triggerStatus,
      required: input.required ?? true,
      createdAt: now()
    };

    this.db
      .prepare(`INSERT INTO gates (id, task_id, gate_type, command, trigger_status, required, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(gate.id, gate.taskId, gate.gateType, gate.command, gate.triggerStatus, gate.required ? 1 : 0, gate.createdAt);

    return gate;
  }

  listGates(taskId: string): Gate[] {
    const rows = this.db
      .prepare('SELECT * FROM gates WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as Array<{
        id: string;
        task_id: string;
        gate_type: string;
        command: string;
        trigger_status: string;
        required: number;
        created_at: number;
      }>;

    return rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      gateType: r.gate_type as GateType,
      command: r.command,
      triggerStatus: r.trigger_status as TaskStatus,
      required: !!r.required,
      createdAt: r.created_at
    }));
  }

  // ==================== GATE RUNS ====================

  recordGateRun(input: {
    gateId: string;
    taskId: string;
    agentId: string;
    passed: boolean;
    output?: string;
    durationMs?: number;
  }): GateRun {
    // Validate gate exists
    const gate = this.db.prepare('SELECT id FROM gates WHERE id = ?').get(input.gateId);
    if (!gate) {
      throw new Error(`Unknown gateId: ${input.gateId}`);
    }

    const run: GateRun = {
      id: nanoid(12),
      gateId: input.gateId,
      taskId: input.taskId,
      agentId: input.agentId,
      passed: input.passed,
      output: input.output ? clipOutput(input.output) : undefined,
      durationMs: input.durationMs,
      createdAt: now()
    };

    this.db
      .prepare(`INSERT INTO gate_runs (id, gate_id, task_id, agent_id, passed, output, duration_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(run.id, run.gateId, run.taskId, run.agentId, run.passed ? 1 : 0, run.output, run.durationMs, run.createdAt);

    return run;
  }

  // ==================== GATE STATUS ====================

  getGateStatus(taskId: string, forStatus: TaskStatus): GateStatus {
    const gates = this.listGates(taskId).filter(g => g.triggerStatus === forStatus);
    const results: GateResult[] = [];
    const blockedBy: Gate[] = [];

    for (const gate of gates) {
      const lastRunRow = this.db
        .prepare('SELECT * FROM gate_runs WHERE gate_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(gate.id) as {
          id: string;
          gate_id: string;
          task_id: string;
          agent_id: string;
          passed: number;
          output: string | null;
          duration_ms: number | null;
          created_at: number;
        } | undefined;

      let status: GateResultStatus = 'not_run';
      let lastRun: GateRun | undefined;

      if (lastRunRow) {
        status = lastRunRow.passed ? 'passed' : 'failed';
        lastRun = {
          id: lastRunRow.id,
          gateId: lastRunRow.gate_id,
          taskId: lastRunRow.task_id,
          agentId: lastRunRow.agent_id,
          passed: !!lastRunRow.passed,
          output: lastRunRow.output ?? undefined,
          durationMs: lastRunRow.duration_ms ?? undefined,
          createdAt: lastRunRow.created_at
        };
      }

      results.push({ gate, lastRun, status });

      if (gate.required && status !== 'passed') {
        blockedBy.push(gate);
      }
    }

    return {
      allPassed: blockedBy.length === 0,
      gates: results,
      blockedBy
    };
  }
}
