import { describe, it, expect } from 'vitest';
import pino from 'pino';
import Database from 'better-sqlite3';
import { ScrumState } from '../src/core/state';
import type { ScrumDb } from '../src/infra/db';

function makeDb(): ScrumDb {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'backlog',
      priority TEXT DEFAULT 'medium',
      assigned_agent TEXT,
      due_date INTEGER,
      started_at INTEGER,
      completed_at INTEGER,
      updated_at INTEGER,
      labels_json TEXT DEFAULT '[]',
      story_points INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE intents (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, files_json TEXT NOT NULL, boundaries TEXT, acceptance_criteria TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE claims (agent_id TEXT NOT NULL, file_path TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(agent_id, file_path));
    CREATE TABLE evidence (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, command TEXT NOT NULL, output TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE changelog (id TEXT PRIMARY KEY, task_id TEXT, agent_id TEXT NOT NULL, file_path TEXT NOT NULL, change_type TEXT NOT NULL, summary TEXT NOT NULL, diff_snippet TEXT, commit_hash TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE comments (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER);
    CREATE TABLE blockers (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, description TEXT NOT NULL, blocking_task_id TEXT, resolved_at INTEGER, created_at INTEGER NOT NULL, created_by TEXT NOT NULL);
    CREATE TABLE task_dependencies (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, depends_on_task_id TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(task_id, depends_on_task_id));
    CREATE TABLE wip_limits (status TEXT PRIMARY KEY, max_tasks INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX idx_intents_task_id ON intents(task_id);
    CREATE INDEX idx_dependencies_task_id ON task_dependencies(task_id);
    CREATE INDEX idx_dependencies_depends_on ON task_dependencies(depends_on_task_id);
    CREATE INDEX idx_evidence_task_id ON evidence(task_id);
    CREATE INDEX idx_claims_expires_at ON claims(expires_at);
    CREATE INDEX idx_claims_file_path ON claims(file_path);
    CREATE INDEX idx_changelog_file_path ON changelog(file_path);
    CREATE INDEX idx_changelog_created_at ON changelog(created_at);
    CREATE INDEX idx_changelog_agent_id ON changelog(agent_id);
    CREATE INDEX idx_tasks_status ON tasks(status);
    CREATE INDEX idx_tasks_assigned_agent ON tasks(assigned_agent);
    CREATE INDEX idx_tasks_priority ON tasks(priority);
    CREATE INDEX idx_comments_task_id ON comments(task_id);
    CREATE INDEX idx_comments_created_at ON comments(created_at);
    CREATE INDEX idx_blockers_task_id ON blockers(task_id);
  `);
  return db;
}

describe('ScrumState', () => {
  describe('tasks', () => {
    it('creates and retrieves tasks', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));

      const task = state.createTask('Test task', 'Description');
      expect(task.title).toBe('Test task');
      expect(task.description).toBe('Description');
      expect(task.id).toBeDefined();
      expect(task.status).toBe('backlog');
      expect(task.priority).toBe('medium');
      expect(task.labels).toEqual([]);

      const retrieved = state.getTask(task.id);
      expect(retrieved).toEqual(task);
    });

    it('lists tasks in descending order', async () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));

      const first = state.createTask('First');
      // Small delay to ensure different timestamps
      await new Promise(r => setTimeout(r, 5));
      const second = state.createTask('Second');

      const tasks = state.listTasks();
      expect(tasks.length).toBe(2);
      // Most recent (second) should be first in descending order
      expect(tasks[0].id).toBe(second.id);
      expect(tasks[1].id).toBe(first.id);
    });

    it('returns null for non-existent task', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));

      expect(state.getTask('nonexistent')).toBeNull();
    });
  });

  describe('claims', () => {
    it('detects conflicts when a different agent has an active claim', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));

      const a = state.createClaim('agentA', ['src/a.ts'], 900);
      expect(a.conflictsWith).toEqual([]);

      const b = state.createClaim('agentB', ['src/a.ts'], 900);
      expect(b.conflictsWith.length).toBe(1);
      expect(b.conflictsWith).toContain('agentA');
    });

    it('allows same agent to extend claim', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));

      state.createClaim('agentA', ['src/a.ts'], 900);
      const b = state.createClaim('agentA', ['src/a.ts'], 900);
      expect(b.conflictsWith).toEqual([]);
    });

    it('releases claims', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));

      state.createClaim('agentA', ['src/a.ts', 'src/b.ts'], 900);

      // Release specific file
      const released = state.releaseClaims('agentA', ['src/a.ts']);
      expect(released).toBe(1);

      // agentB can now claim src/a.ts
      const b = state.createClaim('agentB', ['src/a.ts'], 900);
      expect(b.conflictsWith).toEqual([]);

      // But not src/b.ts
      const c = state.createClaim('agentB', ['src/b.ts'], 900);
      expect(c.conflictsWith).toContain('agentA');
    });

    it('releases all claims for agent', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));

      state.createClaim('agentA', ['src/a.ts', 'src/b.ts'], 900);

      const released = state.releaseClaims('agentA');
      expect(released).toBe(2);

      const claims = state.listActiveClaims();
      expect(claims.length).toBe(0);
    });

    it('handles empty files array gracefully', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));

      // This should not throw
      const result = state.createClaim('agentA', [], 900);
      expect(result.conflictsWith).toEqual([]);
    });
  });

  describe('intents', () => {
    it('posts and lists intents', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));
      const task = state.createTask('Test');

      const intent = state.postIntent({
        taskId: task.id,
        agentId: 'claude-code',
        files: ['src/main.ts'],
        boundaries: 'Do not touch tests',
        acceptanceCriteria: 'Tests pass'
      });

      expect(intent.taskId).toBe(task.id);
      expect(intent.files).toEqual(['src/main.ts']);

      const intents = state.listIntents(task.id);
      expect(intents.length).toBe(1);
      expect(intents[0].id).toBe(intent.id);
    });

    it('throws for invalid taskId', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));

      expect(() => state.postIntent({
        taskId: 'nonexistent',
        agentId: 'test',
        files: ['a.ts']
      })).toThrow('Unknown taskId');
    });
  });

  describe('evidence', () => {
    it('attaches and lists evidence', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));
      const task = state.createTask('Test');

      const ev = state.attachEvidence({
        taskId: task.id,
        agentId: 'agentA',
        command: 'npm test',
        output: 'All tests passed'
      });

      expect(ev.taskId).toBe(task.id);
      expect(ev.command).toBe('npm test');

      const evidence = state.listEvidence(task.id);
      expect(evidence.length).toBe(1);
      expect(evidence[0].id).toBe(ev.id);
    });

    it('clips long output', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));
      const task = state.createTask('Test');

      const longOutput = 'x'.repeat(25000);
      const ev = state.attachEvidence({
        taskId: task.id,
        agentId: 'agentA',
        command: 'cat bigfile',
        output: longOutput
      });

      expect(ev.output.length).toBeLessThan(longOutput.length);
      expect(ev.output).toContain('[clipped');
    });
  });

  describe('status', () => {
    it('returns correct counts', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));

      const task = state.createTask('Test');
      state.postIntent({ taskId: task.id, agentId: 'a', files: ['x.ts'] });
      state.createClaim('a', ['x.ts'], 900);
      state.attachEvidence({ taskId: task.id, agentId: 'a', command: 'test', output: 'ok' });

      const status = state.status();
      expect(status.tasks).toBe(1);
      expect(status.intents).toBe(1);
      expect(status.claims).toBe(1);
      expect(status.evidence).toBe(1);
      expect(status.comments).toBe(0);
      expect(status.blockers).toBe(0);
      expect(status.unresolvedBlockers).toBe(0);
      expect(status.now).toBeGreaterThan(0);
    });
  });

  describe('comments', () => {
    it('adds and lists comments', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));
      const task = state.createTask('Test');

      const comment = state.addComment({
        taskId: task.id,
        agentId: 'claude-code',
        content: 'This is a test comment'
      });

      expect(comment.taskId).toBe(task.id);
      expect(comment.agentId).toBe('claude-code');
      expect(comment.content).toBe('This is a test comment');
      expect(comment.id).toBeDefined();

      const comments = state.listComments(task.id);
      expect(comments.length).toBe(1);
      expect(comments[0].id).toBe(comment.id);
    });

    it('updates comments', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));
      const task = state.createTask('Test');

      const comment = state.addComment({
        taskId: task.id,
        agentId: 'agent',
        content: 'Original content'
      });

      const updated = state.updateComment(comment.id, 'Updated content');
      expect(updated.content).toBe('Updated content');
      expect(updated.updatedAt).toBeDefined();
    });

    it('deletes comments', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));
      const task = state.createTask('Test');

      const comment = state.addComment({
        taskId: task.id,
        agentId: 'agent',
        content: 'To be deleted'
      });

      const deleted = state.deleteComment(comment.id);
      expect(deleted).toBe(true);

      const comments = state.listComments(task.id);
      expect(comments.length).toBe(0);
    });

    it('throws for invalid taskId', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));

      expect(() => state.addComment({
        taskId: 'nonexistent',
        agentId: 'test',
        content: 'test'
      })).toThrow('Unknown taskId');
    });
  });

  describe('blockers', () => {
    it('adds and lists blockers', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));
      const task = state.createTask('Test');

      const blocker = state.addBlocker({
        taskId: task.id,
        description: 'Waiting for API spec',
        createdBy: 'claude-code'
      });

      expect(blocker.taskId).toBe(task.id);
      expect(blocker.description).toBe('Waiting for API spec');
      expect(blocker.createdBy).toBe('claude-code');
      expect(blocker.resolvedAt).toBeUndefined();

      const blockers = state.listBlockers(task.id);
      expect(blockers.length).toBe(1);
      expect(blockers[0].id).toBe(blocker.id);
    });

    it('resolves blockers', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));
      const task = state.createTask('Test');

      const blocker = state.addBlocker({
        taskId: task.id,
        description: 'Waiting for review',
        createdBy: 'agent'
      });

      const resolved = state.resolveBlocker(blocker.id);
      expect(resolved.resolvedAt).toBeDefined();

      const count = state.getUnresolvedBlockersCount(task.id);
      expect(count).toBe(0);
    });

    it('filters unresolved blockers', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));
      const task = state.createTask('Test');

      const blocker1 = state.addBlocker({
        taskId: task.id,
        description: 'Blocker 1',
        createdBy: 'agent'
      });
      state.addBlocker({
        taskId: task.id,
        description: 'Blocker 2',
        createdBy: 'agent'
      });

      state.resolveBlocker(blocker1.id);

      const allBlockers = state.listBlockers(task.id);
      expect(allBlockers.length).toBe(2);

      const unresolvedOnly = state.listBlockers(task.id, { unresolvedOnly: true });
      expect(unresolvedOnly.length).toBe(1);
      expect(unresolvedOnly[0].description).toBe('Blocker 2');
    });

    it('supports blocking task reference', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));
      const task1 = state.createTask('Task 1');
      const task2 = state.createTask('Task 2');

      const blocker = state.addBlocker({
        taskId: task1.id,
        description: 'Blocked by Task 2',
        blockingTaskId: task2.id,
        createdBy: 'agent'
      });

      expect(blocker.blockingTaskId).toBe(task2.id);
    });

    it('throws for invalid taskId', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));

      expect(() => state.addBlocker({
        taskId: 'nonexistent',
        description: 'test',
        createdBy: 'agent'
      })).toThrow('Unknown taskId');
    });

    it('throws for invalid blockingTaskId', () => {
      const db = makeDb();
      const state = new ScrumState(db, pino({ level: 'silent' }));
      const task = state.createTask('Test');

      expect(() => state.addBlocker({
        taskId: task.id,
        description: 'test',
        blockingTaskId: 'nonexistent',
        createdBy: 'agent'
      })).toThrow('Unknown blockingTaskId');
    });
  });
});
