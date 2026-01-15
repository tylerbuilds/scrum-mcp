import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { ScrumConfig } from '../core/config';

export type ScrumDb = Database.Database;

export function openDb(cfg: ScrumConfig): ScrumDb {
  const dbPath = cfg.SCRUM_DB_PATH;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrate(db);
  return db;
}

function migrate(db: ScrumDb) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS intents (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      files_json TEXT NOT NULL,
      boundaries TEXT,
      acceptance_criteria TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS claims (
      agent_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(agent_id, file_path)
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      command TEXT NOT NULL,
      output TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- Changelog for tracking all agent changes (git-bisect-like debugging)
    CREATE TABLE IF NOT EXISTS changelog (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      agent_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      change_type TEXT NOT NULL,  -- 'create', 'modify', 'delete'
      summary TEXT NOT NULL,      -- Brief description of change
      diff_snippet TEXT,          -- Optional: key lines changed
      commit_hash TEXT,           -- Optional: git commit if available
      created_at INTEGER NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );

    -- Comments for task discussions
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- Blockers for tracking impediments
    CREATE TABLE IF NOT EXISTS blockers (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      description TEXT NOT NULL,
      blocking_task_id TEXT,  -- Optional: blocked BY another task
      resolved_at INTEGER,    -- NULL = still blocking
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,  -- agent_id who created the blocker
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY(blocking_task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );

    -- Task dependencies for workflow ordering
    CREATE TABLE IF NOT EXISTS task_dependencies (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,           -- The task that depends on another
      depends_on_task_id TEXT NOT NULL, -- The task it depends on
      created_at INTEGER NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY(depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      UNIQUE(task_id, depends_on_task_id)
    );

    -- WIP (Work In Progress) limits per column
    CREATE TABLE IF NOT EXISTS wip_limits (
      status TEXT PRIMARY KEY,
      max_tasks INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Agent registry for observability and coordination
    CREATE TABLE IF NOT EXISTS agents (
      agent_id TEXT PRIMARY KEY,
      capabilities_json TEXT NOT NULL,   -- e.g., ["code_review", "testing", "debugging"]
      metadata_json TEXT,                -- e.g., {"model": "claude-3-opus", "session": "abc123"}
      last_heartbeat INTEGER NOT NULL,   -- ms timestamp
      registered_at INTEGER NOT NULL,
      status TEXT DEFAULT 'active'       -- 'active', 'idle', 'offline'
    );

    -- Approval gates define validation steps before status transitions
    CREATE TABLE IF NOT EXISTS gates (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      gate_type TEXT NOT NULL,           -- 'lint', 'test', 'build', 'review', 'custom'
      command TEXT NOT NULL,             -- e.g., "npm run lint", "pytest -q"
      trigger_status TEXT NOT NULL,      -- Status that triggers this gate (e.g., 'done')
      required INTEGER DEFAULT 1,        -- 1=must pass to transition, 0=optional
      created_at INTEGER NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- Gate run history for audit trail
    CREATE TABLE IF NOT EXISTS gate_runs (
      id TEXT PRIMARY KEY,
      gate_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      passed INTEGER NOT NULL,           -- 1=passed, 0=failed
      output TEXT,                       -- Command output (clipped)
      duration_ms INTEGER,               -- How long the gate took
      created_at INTEGER NOT NULL,
      FOREIGN KEY(gate_id) REFERENCES gates(id) ON DELETE CASCADE,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- Task templates for reusable task patterns
    CREATE TABLE IF NOT EXISTS task_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      title_pattern TEXT NOT NULL,       -- e.g., "Fix: {{issue}}"
      description_template TEXT,         -- Markdown with {{placeholders}}
      default_status TEXT DEFAULT 'backlog',
      default_priority TEXT DEFAULT 'medium',
      default_labels_json TEXT DEFAULT '[]',
      default_story_points INTEGER,
      gates_json TEXT,                   -- Pre-configured gates as JSON array
      checklist_json TEXT,               -- Acceptance checklist items
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    );

    -- Outbound webhooks for event notifications
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      events_json TEXT NOT NULL,         -- ["task.created", "task.completed", "claim.conflict"]
      headers_json TEXT,                 -- Custom headers (e.g., authorization)
      secret TEXT,                       -- For HMAC signing
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    );

    -- Webhook delivery history for debugging
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status_code INTEGER,
      response TEXT,
      duration_ms INTEGER,
      success INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
    );

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_intents_task_id ON intents(task_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_task_id ON evidence(task_id);
    CREATE INDEX IF NOT EXISTS idx_claims_expires_at ON claims(expires_at);
    CREATE INDEX IF NOT EXISTS idx_claims_file_path ON claims(file_path);
    CREATE INDEX IF NOT EXISTS idx_changelog_file_path ON changelog(file_path);
    CREATE INDEX IF NOT EXISTS idx_changelog_created_at ON changelog(created_at);
    CREATE INDEX IF NOT EXISTS idx_changelog_agent_id ON changelog(agent_id);
    CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);
    CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
    CREATE INDEX IF NOT EXISTS idx_blockers_task_id ON blockers(task_id);
    CREATE INDEX IF NOT EXISTS idx_dependencies_task_id ON task_dependencies(task_id);
    CREATE INDEX IF NOT EXISTS idx_dependencies_depends_on ON task_dependencies(depends_on_task_id);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_agents_last_heartbeat ON agents(last_heartbeat);
    CREATE INDEX IF NOT EXISTS idx_gates_task_id ON gates(task_id);
    CREATE INDEX IF NOT EXISTS idx_gate_runs_task_id ON gate_runs(task_id);
    CREATE INDEX IF NOT EXISTS idx_gate_runs_gate_id ON gate_runs(gate_id);
    CREATE INDEX IF NOT EXISTS idx_templates_name ON task_templates(name);
    CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);
  `);

  // Kanban columns migration - add columns if they don't exist
  migrateKanbanColumns(db);
}

function migrateKanbanColumns(db: ScrumDb) {
  // Check which columns exist
  const tableInfo = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
  const existingColumns = new Set(tableInfo.map(col => col.name));

  // Add each new column if it doesn't exist
  const columnsToAdd: Array<{ name: string; definition: string }> = [
    { name: 'status', definition: "TEXT DEFAULT 'backlog'" },
    { name: 'priority', definition: "TEXT DEFAULT 'medium'" },
    { name: 'assigned_agent', definition: 'TEXT' },
    { name: 'due_date', definition: 'INTEGER' },
    { name: 'started_at', definition: 'INTEGER' },
    { name: 'completed_at', definition: 'INTEGER' },
    { name: 'updated_at', definition: 'INTEGER' },
    { name: 'labels_json', definition: "TEXT DEFAULT '[]'" },
    { name: 'story_points', definition: 'INTEGER' }
  ];

  for (const col of columnsToAdd) {
    if (!existingColumns.has(col.name)) {
      db.exec(`ALTER TABLE tasks ADD COLUMN ${col.name} ${col.definition}`);
    }
  }

  // Add indexes for kanban queries (IF NOT EXISTS works for indexes)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
  `);
}
