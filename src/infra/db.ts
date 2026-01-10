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
