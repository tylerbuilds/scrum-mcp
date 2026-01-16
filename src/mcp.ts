#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './core/config.js';
import { createLogger } from './core/logger.js';
import { openDb } from './infra/db.js';
import { ScrumState } from './core/state.js';

// Import all schemas from consolidated schemas file
import {
  TaskCreateSchema,
  TaskGetSchema,
  TaskListSchema,
  TaskUpdateWithIdSchema,
  BoardInputSchema,
  TaskReadySchema,
  IntentPostSchema,
  ClaimCreateMcpSchema,
  ClaimReleaseSchema,
  ClaimExtendSchema,
  EvidenceAttachSchema,
  OverlapCheckSchema,
  ChangelogLogSchema,
  ChangelogSearchSchema,
  CommentAddSchema,
  CommentsListMcpSchema,
  BlockerAddSchema,
  BlockerResolveSchema,
  BlockersListMcpSchema,
  DependencyAddSchema,
  DependencyRemoveSchema,
  DependenciesGetSchema,
  WipLimitsSetMcpSchema,
  MetricsMcpSchema,
  VelocityMcpSchema,
  AgingWipMcpSchema,
  TaskMetricsSchema,
  AgentRegisterSchema,
  AgentHeartbeatSchema,
  AgentsListMcpSchema,
  DeadWorkMcpSchema,
  GateDefineSchema,
  GateListSchema,
  GateRunSchema,
  GateStatusSchema,
  TemplateCreateSchema,
  TemplateGetSchema,
  TaskFromTemplateSchema,
  WebhookRegisterSchema,
  WebhookUpdateSchema,
  WebhookDeleteSchema,
  WebhookDeliveriesSchema,
  WebhooksListMcpSchema,
  ComplianceCheckSchema,
  SprintCreateSchema,
  SprintGetSchema,
  SprintForTaskSchema,
  SprintListSchema,
  SprintJoinSchema,
  SprintLeaveSchema,
  SprintMembersSchema,
  SprintShareSchema,
  SprintSharesSchema,
  SprintContextSchema,
  SprintCheckSchema
} from './api/schemas.js';
import type { ComplianceCheck } from './core/domain/compliance.js';

/**
 * Generate actionable next steps based on compliance check results.
 * Helps agents understand exactly what they need to fix to become compliant.
 */
function getComplianceNextSteps(result: ComplianceCheck): string[] {
  const steps: string[] = [];

  if (!result.checks.intentPosted.passed) {
    steps.push('POST INTENT: Call scrum_intent_post() with the files you plan to modify');
  }

  if (!result.checks.evidenceAttached.passed) {
    steps.push('ATTACH EVIDENCE: Call scrum_evidence_attach() with test/build output proving your work');
  }

  if (!result.checks.filesMatch.passed && result.checks.filesMatch.undeclared.length > 0) {
    steps.push(`SCOPE VIOLATION: You modified files not in your intent: ${result.checks.filesMatch.undeclared.join(', ')}`);
    steps.push('FIX: Either post a new intent declaring these files, or revert changes to undeclared files');
  }

  if (!result.checks.boundariesRespected.passed) {
    steps.push(`BOUNDARY VIOLATION: You modified files you promised NOT to touch: ${result.checks.boundariesRespected.violations.join(', ')}`);
    steps.push('FIX: Revert changes to boundary files - these are off-limits per your declared intent');
  }

  if (!result.checks.claimsReleased.passed) {
    steps.push(`UNRELEASED CLAIMS: You still have claims on: ${result.checks.claimsReleased.activeClaims.join(', ')}`);
    steps.push('Note: Claims will be released after compliance is verified');
  }

  if (steps.length === 0) {
    steps.push('All checks passed - you are compliant!');
  }

  return steps;
}

const cfg = loadConfig(process.env);
const log = createLogger({ ...cfg, SCRUM_LOG_LEVEL: 'silent' });
const db = openDb(cfg);
const state = new ScrumState(db, log);

/**
 * Returns a disabled response for Sprint tools when SCRUM_SPRINT_ENABLED=false
 */
function sprintDisabledResponse() {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        status: 'disabled',
        message: 'Sprint features are disabled. Set SCRUM_SPRINT_ENABLED=true to enable collaborative multi-agent work.',
        hint: 'Use standard SCRUM workflow (intent, claim, evidence) for solo work.'
      }, null, 2)
    }]
  };
}

const server = new Server(
  {
    name: 'scrum',
    version: '0.1.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {}
    }
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'scrum_status',
        description:
          'Get SCRUM server status including counts of tasks, intents, claims, and evidence. Use this to see the current state of the coordination layer.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'scrum_task_create',
        description:
          'Create a new task in SCRUM. Tasks are the top-level work items that intents and evidence attach to. Returns the created task with its ID.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task title (1-200 chars)' },
            description: { type: 'string', description: 'Task description (optional, max 2000 chars)' },
            status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled'], description: 'Initial status (default: backlog)' },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Priority level (default: medium)' },
            assignedAgent: { type: 'string', description: 'Agent to assign (optional)' },
            dueDate: { type: 'number', description: 'Due date as ms timestamp (optional)' },
            labels: { type: 'array', items: { type: 'string' }, description: 'Labels/tags (optional)' },
            storyPoints: { type: 'number', description: 'Story points estimate (1,2,3,5,8,13) (optional)' }
          },
          required: ['title']
        }
      },
      {
        name: 'scrum_task_get',
        description:
          'Get a task by ID, including all its intents and evidence. Use this to see the full context of a task.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' }
          },
          required: ['taskId']
        }
      },
      {
        name: 'scrum_task_list',
        description: 'List recent tasks. Returns tasks ordered by creation time (newest first).',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max tasks to return (1-200, default 50)' }
          },
          required: []
        }
      },
      {
        name: 'scrum_intent_post',
        description:
          'Post an intent declaring what you plan to change. SCRUM contract requires posting intent BEFORE claiming files. Include files you will touch, boundaries (what you promise NOT to change), and acceptance criteria. NOTE: acceptanceCriteria is REQUIRED.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID this intent belongs to' },
            agentId: { type: 'string', description: 'Your agent identifier (e.g., "claude-code")' },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files you intend to modify'
            },
            boundaries: { type: 'string', description: 'What you promise NOT to change (optional)' },
            acceptanceCriteria: { type: 'string', description: 'REQUIRED: How to verify the work is done (min 10 chars)' }
          },
          required: ['taskId', 'agentId', 'files', 'acceptanceCriteria']
        }
      },
      {
        name: 'scrum_claim',
        description:
          'Claim exclusive access to files. REQUIRES: You must have posted an intent (scrum_intent_post) for these files first. Returns conflicts if another agent already has a claim. Claims expire after TTL.',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Your agent identifier' },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files to claim exclusive access to'
            },
            ttlSeconds: { type: 'number', description: 'Claim duration in seconds (5-3600, default 900)' }
          },
          required: ['agentId', 'files']
        }
      },
      {
        name: 'scrum_claim_release',
        description: 'Release your claims on files. REQUIRES: You must have attached evidence (scrum_evidence_attach) before releasing. No receipts = no release.',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Your agent identifier' },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files to release (omit to release all your claims)'
            }
          },
          required: ['agentId']
        }
      },
      {
        name: 'scrum_claims_list',
        description: 'List all active claims. Use this to see what files are claimed by which agents.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'scrum_claim_extend',
        description: 'Extend the TTL of your active claims without releasing them. Use this when you need more time to complete work and don\'t want to release and re-claim (which would require re-attaching evidence).',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Your agent identifier' },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific files to extend (omit to extend all your claims)'
            },
            additionalSeconds: { type: 'number', description: 'Additional seconds to add (30-3600, default 300)' }
          },
          required: ['agentId']
        }
      },
      {
        name: 'scrum_evidence_attach',
        description:
          'Attach evidence (command + output) to a task. SCRUM contract requires evidence for all claims. No receipts = no merge.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' },
            agentId: { type: 'string', description: 'Your agent identifier' },
            command: { type: 'string', description: 'Command that was run' },
            output: { type: 'string', description: 'Command output (stdout/stderr)' }
          },
          required: ['taskId', 'agentId', 'command', 'output']
        }
      },
      {
        name: 'scrum_overlap_check',
        description:
          'Check if any files have active claims by other agents. Use this before starting work to avoid conflicts.',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files to check for overlaps'
            }
          },
          required: ['files']
        }
      },
      {
        name: 'scrum_changelog_log',
        description:
          'Log a file change or task event to the changelog. Call this AFTER making any file edit to maintain a searchable history of all changes. Task events (status changes, assignments, etc.) are logged automatically by the system. This enables git-bisect-like debugging to find when issues were introduced.',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Your agent identifier' },
            filePath: { type: 'string', description: 'File that was changed (or task:{taskId} for task events)' },
            changeType: {
              type: 'string',
              enum: [
                'create', 'modify', 'delete',
                'task_created', 'task_status_change', 'task_assigned', 'task_priority_change',
                'task_completed', 'blocker_added', 'blocker_resolved', 'dependency_added',
                'dependency_removed', 'comment_added'
              ],
              description: 'Type of change (file changes: create/modify/delete, task events: task_created, task_status_change, etc.)'
            },
            summary: { type: 'string', description: 'Brief description of what changed (max 500 chars)' },
            taskId: { type: 'string', description: 'Associated task ID (optional)' },
            diffSnippet: { type: 'string', description: 'Key lines changed (optional, max 5000 chars)' },
            commitHash: { type: 'string', description: 'Git commit hash if available (optional)' }
          },
          required: ['agentId', 'filePath', 'changeType', 'summary']
        }
      },
      {
        name: 'scrum_changelog_search',
        description:
          'Search the changelog to find file changes and task events (status changes, assignments, blockers, dependencies, comments). Use this to debug issues by tracing file history, finding which agent made changes, tracking task transitions, or searching for specific modifications.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Filter by file path (partial match, use task:{taskId} for task events)' },
            agentId: { type: 'string', description: 'Filter by agent' },
            taskId: { type: 'string', description: 'Filter by task' },
            changeType: {
              type: 'string',
              enum: [
                'create', 'modify', 'delete',
                'task_created', 'task_status_change', 'task_assigned', 'task_priority_change',
                'task_completed', 'blocker_added', 'blocker_resolved', 'dependency_added',
                'dependency_removed', 'comment_added'
              ],
              description: 'Filter by change type (file changes: create/modify/delete, task events: task_created, task_status_change, etc.)'
            },
            query: { type: 'string', description: 'Search in summary and diff' },
            since: { type: 'number', description: 'Changes after this timestamp (ms)' },
            until: { type: 'number', description: 'Changes before this timestamp (ms)' },
            limit: { type: 'number', description: 'Max results (1-500, default 50)' }
          },
          required: []
        }
      },
      {
        name: 'scrum_task_update',
        description:
          'Update a task status, priority, assignment, or other fields. Use this to move tasks between kanban columns or assign them to agents.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID to update' },
            status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled'], description: 'New status' },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Priority level' },
            assignedAgent: { type: 'string', description: 'Agent ID to assign (null to unassign)' },
            dueDate: { type: 'number', description: 'Due date as ms timestamp' },
            labels: { type: 'array', items: { type: 'string' }, description: 'Labels/tags' },
            storyPoints: { type: 'number', description: 'Story points estimate (1,2,3,5,8,13)' },
            title: { type: 'string', description: 'New task title' },
            description: { type: 'string', description: 'New task description' }
          },
          required: ['taskId']
        }
      },
      {
        name: 'scrum_board',
        description:
          'Get the kanban board view with tasks grouped by status columns (backlog, todo, in_progress, review, done).',
        inputSchema: {
          type: 'object',
          properties: {
            assignedAgent: { type: 'string', description: 'Filter by assigned agent' },
            labels: { type: 'array', items: { type: 'string' }, description: 'Filter by labels' }
          },
          required: []
        }
      },
      {
        name: 'scrum_comment_add',
        description: 'Add a comment to a task for discussion or notes.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID to comment on' },
            agentId: { type: 'string', description: 'Your agent identifier' },
            content: { type: 'string', description: 'Comment content (max 10000 chars)' }
          },
          required: ['taskId', 'agentId', 'content']
        }
      },
      {
        name: 'scrum_comments_list',
        description: 'List comments on a task.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' },
            limit: { type: 'number', description: 'Max comments (default 50)' }
          },
          required: ['taskId']
        }
      },
      {
        name: 'scrum_blocker_add',
        description: 'Add a blocker to a task. Blockers indicate why work cannot proceed.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID that is blocked' },
            description: { type: 'string', description: 'What is blocking this task' },
            blockingTaskId: { type: 'string', description: 'Optional: Task ID that is causing the block' },
            agentId: { type: 'string', description: 'Your agent identifier' }
          },
          required: ['taskId', 'description', 'agentId']
        }
      },
      {
        name: 'scrum_blocker_resolve',
        description: 'Mark a blocker as resolved.',
        inputSchema: {
          type: 'object',
          properties: {
            blockerId: { type: 'string', description: 'Blocker ID to resolve' }
          },
          required: ['blockerId']
        }
      },
      {
        name: 'scrum_blockers_list',
        description: 'List blockers for a task.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' },
            unresolvedOnly: { type: 'boolean', description: 'Only show unresolved blockers' }
          },
          required: ['taskId']
        }
      },
      // ==================== DEPENDENCIES ====================
      {
        name: 'scrum_dependency_add',
        description: 'Add a dependency between tasks. The first task depends on the second (must complete before). Prevents circular dependencies.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task that depends on another' },
            dependsOnTaskId: { type: 'string', description: 'Task that must complete first' }
          },
          required: ['taskId', 'dependsOnTaskId']
        }
      },
      {
        name: 'scrum_dependency_remove',
        description: 'Remove a dependency between tasks.',
        inputSchema: {
          type: 'object',
          properties: {
            dependencyId: { type: 'string', description: 'Dependency ID to remove' }
          },
          required: ['dependencyId']
        }
      },
      {
        name: 'scrum_dependencies_get',
        description: 'Get dependencies for a task. Returns tasks that block this task (blockedBy) and tasks blocked by this task (blocking).',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' }
          },
          required: ['taskId']
        }
      },
      {
        name: 'scrum_task_ready',
        description: 'Check if a task is ready to start (all dependencies are done). Checks transitive dependencies recursively.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID to check' }
          },
          required: ['taskId']
        }
      },
      // ==================== WIP LIMITS ====================
      {
        name: 'scrum_wip_limits_get',
        description: 'Get current WIP (Work In Progress) limits for all columns.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'scrum_wip_limits_set',
        description: 'Set WIP limit for a status column. Pass null to remove limit. WIP limits help prevent overloading columns.',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done'], description: 'Column to set limit for' },
            limit: { type: 'number', description: 'Max tasks allowed (null to remove limit)' }
          },
          required: ['status']
        }
      },
      {
        name: 'scrum_wip_status',
        description: 'Get current WIP status showing task count vs limit for each column. Shows which columns are at or over their limits.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      // ==================== METRICS ====================
      {
        name: 'scrum_metrics',
        description: 'Get board-level metrics including cycle time, lead time, throughput, and velocity. Returns aggregate stats for completed tasks in the specified period.',
        inputSchema: {
          type: 'object',
          properties: {
            since: { type: 'number', description: 'Start timestamp (ms), default 30 days ago' },
            until: { type: 'number', description: 'End timestamp (ms), default now' }
          },
          required: []
        }
      },
      {
        name: 'scrum_velocity',
        description: 'Get velocity (story points completed) over time periods. Returns an array of periods with completed task counts and story points.',
        inputSchema: {
          type: 'object',
          properties: {
            periodDays: { type: 'number', description: 'Days per period (default 7)' },
            periods: { type: 'number', description: 'Number of periods (default 4)' }
          },
          required: []
        }
      },
      {
        name: 'scrum_aging_wip',
        description: 'Get tasks that have been in progress for too long. Helps identify stuck work that needs attention.',
        inputSchema: {
          type: 'object',
          properties: {
            thresholdDays: { type: 'number', description: 'Days threshold (default 2)' }
          },
          required: []
        }
      },
      {
        name: 'scrum_task_metrics',
        description: 'Get metrics for a specific task including lead time (creation to completion) and cycle time (started to completion).',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' }
          },
          required: ['taskId']
        }
      },
      // ==================== AGENT REGISTRY ====================
      {
        name: 'scrum_agent_register',
        description: 'Register your agent with SCRUM for observability and coordination. Call this at the start of a session.',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Your unique agent identifier (e.g., "claude-code-a1b2c3")' },
            capabilities: {
              type: 'array',
              items: { type: 'string' },
              description: 'Your capabilities (e.g., ["code_review", "testing", "debugging"])'
            },
            metadata: {
              type: 'object',
              description: 'Optional metadata (e.g., {"model": "claude-opus", "session": "xyz"})'
            }
          },
          required: ['agentId', 'capabilities']
        }
      },
      {
        name: 'scrum_agents_list',
        description: 'List all registered agents and their status. Shows who is active, idle, or offline.',
        inputSchema: {
          type: 'object',
          properties: {
            includeOffline: { type: 'boolean', description: 'Include offline agents (default false)' }
          },
          required: []
        }
      },
      {
        name: 'scrum_agent_heartbeat',
        description: 'Send a heartbeat to indicate your agent is still active. Agents are marked offline after 5 minutes without heartbeat.',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Your agent identifier' }
          },
          required: ['agentId']
        }
      },
      // ==================== DEAD WORK DETECTION ====================
      {
        name: 'scrum_dead_work',
        description: 'Find tasks that are in_progress but appear abandoned (no active claims, no recent activity). Use this to identify stale work that needs attention.',
        inputSchema: {
          type: 'object',
          properties: {
            staleDays: { type: 'number', description: 'Days threshold for staleness (default 1)' }
          },
          required: []
        }
      },
      // ==================== APPROVAL GATES ====================
      {
        name: 'scrum_gate_define',
        description: 'Define an approval gate for a task. Gates run commands (lint, test, build) that must pass before status transitions.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID to attach gate to' },
            gateType: { type: 'string', enum: ['lint', 'test', 'build', 'review', 'custom'], description: 'Type of gate' },
            command: { type: 'string', description: 'Command to run (e.g., "npm run lint")' },
            triggerStatus: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done'], description: 'Status that triggers this gate' },
            required: { type: 'boolean', description: 'Must pass to transition (default true)' }
          },
          required: ['taskId', 'gateType', 'command', 'triggerStatus']
        }
      },
      {
        name: 'scrum_gates_list',
        description: 'List all gates defined for a task.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' }
          },
          required: ['taskId']
        }
      },
      {
        name: 'scrum_gate_run',
        description: 'Record a gate run result. Call this after running the gate command to record whether it passed or failed.',
        inputSchema: {
          type: 'object',
          properties: {
            gateId: { type: 'string', description: 'Gate ID' },
            taskId: { type: 'string', description: 'Task ID' },
            agentId: { type: 'string', description: 'Your agent identifier' },
            passed: { type: 'boolean', description: 'Whether the gate passed' },
            output: { type: 'string', description: 'Command output' },
            durationMs: { type: 'number', description: 'Execution time in ms' }
          },
          required: ['gateId', 'taskId', 'agentId', 'passed']
        }
      },
      {
        name: 'scrum_gate_status',
        description: 'Get gate status for a task. Shows which gates have passed/failed for a specific status transition.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' },
            forStatus: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done'], description: 'Status to check gates for' }
          },
          required: ['taskId', 'forStatus']
        }
      },
      // ==================== TASK TEMPLATES ====================
      {
        name: 'scrum_template_create',
        description: 'Create a reusable task template with pre-configured settings, gates, and checklists. Use {{placeholders}} in title and description.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Unique template name' },
            titlePattern: { type: 'string', description: 'Title pattern with {{placeholders}}' },
            descriptionTemplate: { type: 'string', description: 'Description template with {{placeholders}}' },
            defaultStatus: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done'], description: 'Default status' },
            defaultPriority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Default priority' },
            defaultLabels: { type: 'array', items: { type: 'string' }, description: 'Default labels' },
            defaultStoryPoints: { type: 'number', description: 'Default story points' },
            gates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  gateType: { type: 'string', enum: ['lint', 'test', 'build', 'review', 'custom'] },
                  command: { type: 'string' },
                  triggerStatus: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done'] }
                }
              },
              description: 'Pre-configured gates'
            },
            checklist: { type: 'array', items: { type: 'string' }, description: 'Acceptance checklist items' }
          },
          required: ['name', 'titlePattern']
        }
      },
      {
        name: 'scrum_template_get',
        description: 'Get a task template by name or ID.',
        inputSchema: {
          type: 'object',
          properties: {
            nameOrId: { type: 'string', description: 'Template name or ID' }
          },
          required: ['nameOrId']
        }
      },
      {
        name: 'scrum_templates_list',
        description: 'List all available task templates.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'scrum_task_from_template',
        description: 'Create a new task from a template. Variables are substituted into {{placeholders}} in the title and description.',
        inputSchema: {
          type: 'object',
          properties: {
            template: { type: 'string', description: 'Template name or ID' },
            variables: {
              type: 'object',
              description: 'Variable substitutions (e.g., {"issue": "Bug in login"})'
            },
            overrides: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled'] },
                priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                assignedAgent: { type: 'string' },
                labels: { type: 'array', items: { type: 'string' } },
                storyPoints: { type: 'number' }
              },
              description: 'Override template defaults'
            }
          },
          required: ['template', 'variables']
        }
      },
      // ==================== WEBHOOKS ====================
      {
        name: 'scrum_webhook_register',
        description: 'Register an outbound webhook to receive event notifications. Events are POSTed to the URL with HMAC signature if secret is provided.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Webhook name' },
            url: { type: 'string', description: 'Webhook URL' },
            events: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['task.created', 'task.updated', 'task.completed', 'intent.posted', 'claim.created', 'claim.conflict', 'claim.released', 'evidence.attached', 'gate.passed', 'gate.failed']
              },
              description: 'Events to subscribe to'
            },
            headers: { type: 'object', description: 'Custom headers' },
            secret: { type: 'string', description: 'Secret for HMAC signing' }
          },
          required: ['name', 'url', 'events']
        }
      },
      {
        name: 'scrum_webhooks_list',
        description: 'List all registered webhooks.',
        inputSchema: {
          type: 'object',
          properties: {
            enabledOnly: { type: 'boolean', description: 'Only show enabled webhooks' }
          },
          required: []
        }
      },
      {
        name: 'scrum_webhook_update',
        description: 'Update a webhook (URL, events, enabled status).',
        inputSchema: {
          type: 'object',
          properties: {
            webhookId: { type: 'string', description: 'Webhook ID' },
            url: { type: 'string', description: 'New URL' },
            events: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['task.created', 'task.updated', 'task.completed', 'intent.posted', 'claim.created', 'claim.conflict', 'claim.released', 'evidence.attached', 'gate.passed', 'gate.failed']
              },
              description: 'New events'
            },
            headers: { type: 'object', description: 'New headers' },
            enabled: { type: 'boolean', description: 'Enable/disable webhook' }
          },
          required: ['webhookId']
        }
      },
      {
        name: 'scrum_webhook_delete',
        description: 'Delete a webhook.',
        inputSchema: {
          type: 'object',
          properties: {
            webhookId: { type: 'string', description: 'Webhook ID to delete' }
          },
          required: ['webhookId']
        }
      },
      {
        name: 'scrum_webhook_deliveries',
        description: 'Get recent delivery history for a webhook. Use this to debug webhook issues.',
        inputSchema: {
          type: 'object',
          properties: {
            webhookId: { type: 'string', description: 'Webhook ID' },
            limit: { type: 'number', description: 'Max deliveries (default 50)' }
          },
          required: ['webhookId']
        }
      },
      // ==================== COMPLIANCE ====================
      {
        name: 'scrum_compliance_check',
        description: 'Verify your work matches your declared intent. Returns compliance score and specific violations. MUST call before releasing claims or completing tasks. Blocks release if undeclared files modified or boundaries violated. Returns actionable feedback so you can iterate to fix issues.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID to check compliance for' },
            agentId: { type: 'string', description: 'Your agent ID' }
          },
          required: ['taskId', 'agentId']
        }
      },
      // ==================== SPRINT (Collaborative Multi-Agent Work) ====================
      {
        name: 'scrum_sprint_create',
        description: 'Create a sprint for collaborative multi-agent work on a task. Sprints are NOT about control - they are about shared understanding. Use when multiple agents need to coordinate on the same task.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID to create sprint for' },
            name: { type: 'string', description: 'Sprint name (optional)' },
            goal: { type: 'string', description: 'What we are trying to achieve together (optional)' }
          },
          required: ['taskId']
        }
      },
      {
        name: 'scrum_sprint_get',
        description: 'Get a sprint by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'string', description: 'Sprint ID' }
          },
          required: ['sprintId']
        }
      },
      {
        name: 'scrum_sprint_for_task',
        description: 'Get the active sprint for a task, if one exists.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' }
          },
          required: ['taskId']
        }
      },
      {
        name: 'scrum_sprint_list',
        description: 'List sprints with optional filters.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Filter by task ID (optional)' },
            status: { type: 'string', enum: ['active', 'completed', 'abandoned'], description: 'Filter by status (optional)' }
          },
          required: []
        }
      },
      {
        name: 'scrum_sprint_complete',
        description: 'Mark a sprint as completed.',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'string', description: 'Sprint ID to complete' }
          },
          required: ['sprintId']
        }
      },
      {
        name: 'scrum_sprint_join',
        description: 'Join a sprint and declare what you are working on. Other agents can see your focus and coordinate. CALL THIS when starting work in a multi-agent task.',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'string', description: 'Sprint ID to join' },
            agentId: { type: 'string', description: 'Your agent ID' },
            workingOn: { type: 'string', description: 'Human-readable description of what you are building (e.g., "Implementing JWT authentication in backend")' },
            focusArea: { type: 'string', description: 'Your focus area: backend, frontend, tests, auth, api, etc. (optional)' }
          },
          required: ['sprintId', 'agentId', 'workingOn']
        }
      },
      {
        name: 'scrum_sprint_leave',
        description: 'Leave a sprint when done with your work.',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'string', description: 'Sprint ID to leave' },
            agentId: { type: 'string', description: 'Your agent ID' }
          },
          required: ['sprintId', 'agentId']
        }
      },
      {
        name: 'scrum_sprint_members',
        description: 'Get all active members of a sprint and what they are working on.',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'string', description: 'Sprint ID' }
          },
          required: ['sprintId']
        }
      },
      {
        name: 'scrum_sprint_share',
        description: 'Share context, decisions, interfaces, or discoveries with the sprint group. This is how agents understand each other\'s work. Share types: context (background info), decision (architectural choices), interface (API contracts), discovery (findings), integration (how to connect), question (ask the group), answer (respond to question).',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'string', description: 'Sprint ID' },
            agentId: { type: 'string', description: 'Your agent ID' },
            shareType: { type: 'string', enum: ['context', 'decision', 'interface', 'discovery', 'integration', 'question', 'answer'], description: 'Type of share' },
            title: { type: 'string', description: 'Short summary (max 200 chars)' },
            content: { type: 'string', description: 'Full detail - code, explanations, etc.' },
            relatedFiles: { type: 'array', items: { type: 'string' }, description: 'Files this relates to (optional)' },
            replyToId: { type: 'string', description: 'If answering a question, the question share ID (optional)' }
          },
          required: ['sprintId', 'agentId', 'shareType', 'title', 'content']
        }
      },
      {
        name: 'scrum_sprint_shares',
        description: 'Get all shares in a sprint, optionally filtered by type.',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'string', description: 'Sprint ID' },
            shareType: { type: 'string', enum: ['context', 'decision', 'interface', 'discovery', 'integration', 'question', 'answer'], description: 'Filter by share type (optional)' },
            limit: { type: 'number', description: 'Max shares to return (optional)' }
          },
          required: ['sprintId']
        }
      },
      {
        name: 'scrum_sprint_context',
        description: 'Get complete sprint context - CALL THIS BEFORE STARTING WORK to understand what the team is doing. Returns: members and their focus, all decisions/interfaces/discoveries, unanswered questions, and files being touched.',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'string', description: 'Sprint ID' }
          },
          required: ['sprintId']
        }
      },
      {
        name: 'scrum_sprint_check',
        description: 'Check sprint status and get relevant updates for your work. CALL THIS PERIODICALLY during work to stay coordinated. Returns new shares since you last checked, unanswered questions you might help with, and integration points relevant to your focus area.',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'string', description: 'Sprint ID' },
            agentId: { type: 'string', description: 'Your agent ID' },
            focusArea: { type: 'string', description: 'Your focus area to filter relevant shares (optional)' }
          },
          required: ['sprintId', 'agentId']
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'scrum_status': {
        const status = state.status();
        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }]
        };
      }

      case 'scrum_task_create': {
        const input = TaskCreateSchema.parse(args);
        const task = state.createTask(input.title, input.description, {
          status: input.status,
          priority: input.priority,
          assignedAgent: input.assignedAgent ?? undefined,
          dueDate: input.dueDate ?? undefined,
          labels: input.labels,
          storyPoints: input.storyPoints ?? undefined
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(task, null, 2) }]
        };
      }

      case 'scrum_task_get': {
        const input = TaskGetSchema.parse(args);
        const task = state.getTask(input.taskId);
        if (!task) {
          return {
            content: [{ type: 'text', text: `Task not found: ${input.taskId}` }],
            isError: true
          };
        }
        const intents = state.listIntents(input.taskId);
        const evidence = state.listEvidence(input.taskId);
        const comments = state.listComments(input.taskId);
        const blockers = state.listBlockers(input.taskId);
        const unresolvedBlockersCount = state.getUnresolvedBlockersCount(input.taskId);
        const dependencies = state.getDependencies(input.taskId);
        const readiness = state.isTaskReady(input.taskId);
        return {
          content: [{ type: 'text', text: JSON.stringify({
            task,
            intents,
            evidence,
            comments,
            blockers,
            unresolvedBlockersCount,
            dependencies,
            readiness
          }, null, 2) }]
        };
      }

      case 'scrum_task_list': {
        const input = TaskListSchema.parse(args ?? {});
        const tasks = state.listTasks(input.limit ?? 50);
        return {
          content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }]
        };
      }

      case 'scrum_intent_post': {
        const input = IntentPostSchema.parse(args);
        const intent = state.postIntent(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(intent, null, 2) }]
        };
      }

      case 'scrum_claim': {
        const input = ClaimCreateMcpSchema.parse(args);

        // ENFORCEMENT: Must have declared intent for these files first
        const intentCheck = state.hasIntentForFiles(input.agentId, input.files);
        if (!intentCheck.hasIntent) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'rejected',
                    reason: 'NO_INTENT',
                    message: `You must post an intent (scrum_intent_post) before claiming files. Missing intent for: ${intentCheck.missingFiles.join(', ')}`,
                    missingFiles: intentCheck.missingFiles
                  },
                  null,
                  2
                )
              }
            ],
            isError: true
          };
        }

        const result = state.createClaim(input.agentId, input.files, input.ttlSeconds ?? 900);
        if (result.conflictsWith.length > 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'conflict',
                    claim: result.claim,
                    conflictsWith: result.conflictsWith,
                    message: `Files already claimed by: ${result.conflictsWith.join(', ')}`
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ status: 'ok', claim: result.claim, conflictsWith: [] }, null, 2)
            }
          ]
        };
      }

      case 'scrum_claim_release': {
        const input = ClaimReleaseSchema.parse(args);

        // ENFORCEMENT: Must have attached evidence before releasing claims
        const activeClaims = state.getAgentClaims(input.agentId);
        if (activeClaims.length > 0) {
          const evidenceCheck = state.hasEvidenceForTask(input.agentId);
          if (!evidenceCheck.hasEvidence) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'rejected',
                      reason: 'NO_EVIDENCE',
                      message: 'You must attach evidence (scrum_evidence_attach) proving your work before releasing claims. No receipts = no release.',
                      activeClaims: activeClaims
                    },
                    null,
                    2
                  )
                }
              ],
              isError: true
            };
          }

          // ENFORCEMENT: Must pass compliance check for each task
          for (const taskId of evidenceCheck.taskIds) {
            const compliance = state.checkCompliance(taskId, input.agentId);

            // Block on scope violations (undeclared file modifications)
            if (!compliance.checks.filesMatch.passed && compliance.checks.filesMatch.undeclared.length > 0) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    status: 'rejected',
                    reason: 'COMPLIANCE_FAILED',
                    message: `Scope violation: You modified files not declared in your intent: ${compliance.checks.filesMatch.undeclared.join(', ')}`,
                    compliance,
                    nextSteps: getComplianceNextSteps(compliance)
                  }, null, 2)
                }],
                isError: true
              };
            }

            // Block on boundary violations
            if (!compliance.checks.boundariesRespected.passed) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    status: 'rejected',
                    reason: 'BOUNDARY_VIOLATION',
                    message: `Boundary violation: You modified files you promised NOT to touch: ${compliance.checks.boundariesRespected.violations.join(', ')}`,
                    compliance,
                    nextSteps: getComplianceNextSteps(compliance)
                  }, null, 2)
                }],
                isError: true
              };
            }
          }
        }

        const released = state.releaseClaims(input.agentId, input.files);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ status: 'ok', released, files: input.files ?? 'all' }, null, 2)
            }
          ]
        };
      }

      case 'scrum_claims_list': {
        const claims = state.listActiveClaims();
        return {
          content: [{ type: 'text', text: JSON.stringify(claims, null, 2) }]
        };
      }

      case 'scrum_claim_extend': {
        const input = ClaimExtendSchema.parse(args);
        const result = state.extendClaims(input.agentId, input.additionalSeconds ?? 300, input.files);
        if (result.extended === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'no_claims',
                message: 'No active claims found for this agent'
              }, null, 2)
            }],
            isError: true
          };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              extended: result.extended,
              newExpiresAt: result.newExpiresAt,
              expiresIn: Math.round((result.newExpiresAt - Date.now()) / 1000) + ' seconds'
            }, null, 2)
          }]
        };
      }

      case 'scrum_evidence_attach': {
        const input = EvidenceAttachSchema.parse(args);
        const evidence = state.attachEvidence(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(evidence, null, 2) }]
        };
      }

      case 'scrum_overlap_check': {
        const input = OverlapCheckSchema.parse(args);
        const claims = state.listActiveClaims();
        const overlaps: { file: string; claimedBy: string; expiresAt: number }[] = [];
        for (const claim of claims) {
          for (const file of input.files) {
            if (claim.files.includes(file)) {
              overlaps.push({ file, claimedBy: claim.agentId, expiresAt: claim.expiresAt });
            }
          }
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  hasOverlaps: overlaps.length > 0,
                  overlaps,
                  checkedFiles: input.files
                },
                null,
                2
              )
            }
          ]
        };
      }

      case 'scrum_changelog_log': {
        const input = ChangelogLogSchema.parse(args);
        const entry = state.logChange(input);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ status: 'logged', entry }, null, 2)
            }
          ]
        };
      }

      case 'scrum_changelog_search': {
        const input = ChangelogSearchSchema.parse(args ?? {});
        const entries = state.searchChangelog(input);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: entries.length,
                  entries,
                  filters: input
                },
                null,
                2
              )
            }
          ]
        };
      }

      case 'scrum_task_update': {
        const input = TaskUpdateWithIdSchema.parse(args);
        const { taskId, ...updates } = input;

        // ENFORCEMENT: When transitioning to 'done', check compliance for all agents
        if (updates.status === 'done') {
          const agents = state.getTaskAgents(taskId);
          for (const agentId of agents) {
            const compliance = state.checkCompliance(taskId, agentId);
            if (!compliance.canComplete) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    status: 'rejected',
                    reason: 'COMPLIANCE_BLOCKED',
                    message: `Cannot complete task: ${compliance.summary}`,
                    agentId,
                    compliance,
                    nextSteps: getComplianceNextSteps(compliance)
                  }, null, 2)
                }],
                isError: true
              };
            }
          }
        }

        try {
          const task = state.updateTask(taskId, updates);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ status: 'updated', task }, null, 2)
              }
            ]
          };
        } catch (e: any) {
          if (e?.message?.includes('Unknown taskId')) {
            return {
              content: [{ type: 'text', text: `Task not found: ${taskId}` }],
              isError: true
            };
          }
          throw e;
        }
      }

      case 'scrum_board': {
        const input = BoardInputSchema.parse(args ?? {});
        const board = state.getBoard(input);
        const counts = {
          backlog: board.backlog.length,
          todo: board.todo.length,
          in_progress: board.in_progress.length,
          review: board.review.length,
          done: board.done.length,
          total: board.backlog.length + board.todo.length + board.in_progress.length + board.review.length + board.done.length
        };
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ counts, board }, null, 2)
            }
          ]
        };
      }

      // ==================== COMMENTS ====================

      case 'scrum_comment_add': {
        const input = CommentAddSchema.parse(args);
        try {
          const comment = state.addComment(input);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ status: 'ok', comment }, null, 2)
              }
            ]
          };
        } catch (e: any) {
          if (e?.message?.includes('Unknown taskId')) {
            return {
              content: [{ type: 'text', text: `Task not found: ${input.taskId}` }],
              isError: true
            };
          }
          throw e;
        }
      }

      case 'scrum_comments_list': {
        const input = CommentsListMcpSchema.parse(args);
        const comments = state.listComments(input.taskId, input.limit ?? 50);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: comments.length, comments }, null, 2)
            }
          ]
        };
      }

      // ==================== BLOCKERS ====================

      case 'scrum_blocker_add': {
        const input = BlockerAddSchema.parse(args);
        try {
          const blocker = state.addBlocker(input);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ status: 'ok', blocker }, null, 2)
              }
            ]
          };
        } catch (e: any) {
          if (e?.message?.includes('Unknown taskId')) {
            return {
              content: [{ type: 'text', text: `Task not found: ${input.taskId}` }],
              isError: true
            };
          }
          if (e?.message?.includes('Unknown blockingTaskId')) {
            return {
              content: [{ type: 'text', text: `Blocking task not found: ${input.blockingTaskId}` }],
              isError: true
            };
          }
          throw e;
        }
      }

      case 'scrum_blocker_resolve': {
        const input = BlockerResolveSchema.parse(args);
        try {
          const blocker = state.resolveBlocker(input.blockerId);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ status: 'resolved', blocker }, null, 2)
              }
            ]
          };
        } catch (e: any) {
          if (e?.message?.includes('Unknown blockerId')) {
            return {
              content: [{ type: 'text', text: `Blocker not found: ${input.blockerId}` }],
              isError: true
            };
          }
          throw e;
        }
      }

      case 'scrum_blockers_list': {
        const input = BlockersListMcpSchema.parse(args);
        const blockers = state.listBlockers(input.taskId, { unresolvedOnly: input.unresolvedOnly });
        const unresolvedCount = state.getUnresolvedBlockersCount(input.taskId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: blockers.length,
                unresolvedCount,
                blockers
              }, null, 2)
            }
          ]
        };
      }

      // ==================== DEPENDENCIES ====================

      case 'scrum_dependency_add': {
        const input = DependencyAddSchema.parse(args);
        try {
          const dependency = state.addDependency(input.taskId, input.dependsOnTaskId);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ status: 'ok', dependency }, null, 2)
              }
            ]
          };
        } catch (e: any) {
          if (e?.message?.includes('Unknown taskId')) {
            return {
              content: [{ type: 'text', text: `Task not found: ${input.taskId}` }],
              isError: true
            };
          }
          if (e?.message?.includes('Unknown dependsOnTaskId')) {
            return {
              content: [{ type: 'text', text: `Dependency task not found: ${input.dependsOnTaskId}` }],
              isError: true
            };
          }
          if (e?.message?.includes('cannot depend on itself') || e?.message?.includes('Circular dependency') || e?.message?.includes('Dependency already exists')) {
            return {
              content: [{ type: 'text', text: e.message }],
              isError: true
            };
          }
          throw e;
        }
      }

      case 'scrum_dependency_remove': {
        const input = DependencyRemoveSchema.parse(args);
        const deleted = state.removeDependency(input.dependencyId);
        if (!deleted) {
          return {
            content: [{ type: 'text', text: `Dependency not found: ${input.dependencyId}` }],
            isError: true
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ status: 'ok', deleted: true, dependencyId: input.dependencyId }, null, 2)
            }
          ]
        };
      }

      case 'scrum_dependencies_get': {
        const input = DependenciesGetSchema.parse(args);
        const task = state.getTask(input.taskId);
        if (!task) {
          return {
            content: [{ type: 'text', text: `Task not found: ${input.taskId}` }],
            isError: true
          };
        }
        const deps = state.getDependencies(input.taskId);
        const records = state.getDependencyRecords(input.taskId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                taskId: input.taskId,
                blockedBy: deps.blockedBy,
                blocking: deps.blocking,
                dependencyRecords: records
              }, null, 2)
            }
          ]
        };
      }

      case 'scrum_task_ready': {
        const input = TaskReadySchema.parse(args);
        const task = state.getTask(input.taskId);
        if (!task) {
          return {
            content: [{ type: 'text', text: `Task not found: ${input.taskId}` }],
            isError: true
          };
        }
        const readiness = state.isTaskReady(input.taskId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                taskId: input.taskId,
                ready: readiness.ready,
                blockingTasks: readiness.blockingTasks,
                message: readiness.ready
                  ? 'Task is ready to start (all dependencies are done)'
                  : `Task is blocked by ${readiness.blockingTasks.length} incomplete dependencies`
              }, null, 2)
            }
          ]
        };
      }

      // ==================== WIP LIMITS ====================

      case 'scrum_wip_limits_get': {
        const limits = state.getWipLimits();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ limits }, null, 2)
            }
          ]
        };
      }

      case 'scrum_wip_limits_set': {
        const input = WipLimitsSetMcpSchema.parse(args);
        try {
          state.setWipLimit(input.status, input.limit ?? null);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'ok',
                  column: input.status,
                  limit: input.limit ?? null,
                  message: input.limit === null || input.limit === undefined
                    ? `WIP limit removed for ${input.status}`
                    : `WIP limit set to ${input.limit} for ${input.status}`
                }, null, 2)
              }
            ]
          };
        } catch (e: any) {
          return {
            content: [{ type: 'text', text: e.message }],
            isError: true
          };
        }
      }

      case 'scrum_wip_status': {
        const wipStatus = state.getWipStatus();
        const exceededColumns = wipStatus.filter(s => s.exceeded);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                columns: wipStatus,
                exceededCount: exceededColumns.length,
                exceeded: exceededColumns.map(s => s.status),
                message: exceededColumns.length > 0
                  ? `WIP limits exceeded for: ${exceededColumns.map(s => s.status).join(', ')}`
                  : 'All columns within WIP limits'
              }, null, 2)
            }
          ]
        };
      }

      // ==================== METRICS ====================

      case 'scrum_metrics': {
        const input = MetricsMcpSchema.parse(args ?? {});
        const metrics = state.getBoardMetrics({
          since: input.since,
          until: input.until
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(metrics, null, 2)
            }
          ]
        };
      }

      case 'scrum_velocity': {
        const input = VelocityMcpSchema.parse(args ?? {});
        const velocity = state.getVelocity({
          periodDays: input.periodDays,
          periods: input.periods
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                periodDays: input.periodDays ?? 7,
                periods: velocity,
                summary: `Velocity over ${velocity.length} periods: ${velocity.map(v => v.storyPoints).join(', ')} story points`
              }, null, 2)
            }
          ]
        };
      }

      case 'scrum_aging_wip': {
        const input = AgingWipMcpSchema.parse(args ?? {});
        const aging = state.getAgingWip({
          thresholdDays: input.thresholdDays
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                thresholdDays: input.thresholdDays ?? 2,
                count: aging.length,
                tasks: aging,
                message: aging.length > 0
                  ? `${aging.length} task(s) have been in progress for more than ${input.thresholdDays ?? 2} days`
                  : 'No aging WIP tasks found'
              }, null, 2)
            }
          ]
        };
      }

      case 'scrum_task_metrics': {
        const input = TaskMetricsSchema.parse(args);
        const metrics = state.getTaskMetrics(input.taskId);
        if (!metrics) {
          return {
            content: [{ type: 'text', text: `Task not found: ${input.taskId}` }],
            isError: true
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...metrics,
                leadTimeDays: metrics.leadTimeMs ? Math.round(metrics.leadTimeMs / (24 * 60 * 60 * 1000) * 10) / 10 : undefined,
                cycleTimeDays: metrics.cycleTimeMs ? Math.round(metrics.cycleTimeMs / (24 * 60 * 60 * 1000) * 10) / 10 : undefined
              }, null, 2)
            }
          ]
        };
      }

      // ==================== AGENT REGISTRY ====================

      case 'scrum_agent_register': {
        const input = AgentRegisterSchema.parse(args);
        const agent = state.registerAgent(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'registered',
              agent,
              message: `Agent ${input.agentId} registered with ${input.capabilities.length} capabilities`
            }, null, 2)
          }]
        };
      }

      case 'scrum_agents_list': {
        const input = AgentsListMcpSchema.parse(args ?? {});
        const agents = state.listAgents({ includeOffline: input.includeOffline });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: agents.length,
              agents,
              message: agents.length > 0
                ? `${agents.length} agent(s) registered`
                : 'No agents registered'
            }, null, 2)
          }]
        };
      }

      case 'scrum_agent_heartbeat': {
        const input = AgentHeartbeatSchema.parse(args);
        const success = state.agentHeartbeat(input.agentId);
        if (!success) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'not_found',
                message: `Agent ${input.agentId} not found. Register first with scrum_agent_register.`
              }, null, 2)
            }],
            isError: true
          };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              agentId: input.agentId,
              message: 'Heartbeat received'
            }, null, 2)
          }]
        };
      }

      // ==================== DEAD WORK DETECTION ====================

      case 'scrum_dead_work': {
        const input = DeadWorkMcpSchema.parse(args ?? {});
        const deadWork = state.findDeadWork({ staleDays: input.staleDays });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              staleDays: input.staleDays ?? 1,
              count: deadWork.length,
              tasks: deadWork,
              message: deadWork.length > 0
                ? `Found ${deadWork.length} potentially abandoned task(s)`
                : 'No dead work detected'
            }, null, 2)
          }]
        };
      }

      // ==================== APPROVAL GATES ====================

      case 'scrum_gate_define': {
        const input = GateDefineSchema.parse(args);
        try {
          const gate = state.defineGate(input);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'ok',
                gate,
                message: `Gate "${input.gateType}" defined for status "${input.triggerStatus}"`
              }, null, 2)
            }]
          };
        } catch (e: any) {
          if (e?.message?.includes('Unknown taskId')) {
            return {
              content: [{ type: 'text', text: `Task not found: ${input.taskId}` }],
              isError: true
            };
          }
          throw e;
        }
      }

      case 'scrum_gates_list': {
        const input = GateListSchema.parse(args);
        const gates = state.listGates(input.taskId);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              taskId: input.taskId,
              count: gates.length,
              gates
            }, null, 2)
          }]
        };
      }

      case 'scrum_gate_run': {
        const input = GateRunSchema.parse(args);
        try {
          const run = state.recordGateRun(input);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: input.passed ? 'passed' : 'failed',
                run,
                message: `Gate ${input.passed ? 'passed' : 'failed'}`
              }, null, 2)
            }]
          };
        } catch (e: any) {
          if (e?.message?.includes('Unknown gateId')) {
            return {
              content: [{ type: 'text', text: `Gate not found: ${input.gateId}` }],
              isError: true
            };
          }
          throw e;
        }
      }

      case 'scrum_gate_status': {
        const input = GateStatusSchema.parse(args);
        const gateStatus = state.getGateStatus(input.taskId, input.forStatus);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              taskId: input.taskId,
              forStatus: input.forStatus,
              allPassed: gateStatus.allPassed,
              gateCount: gateStatus.gates.length,
              gates: gateStatus.gates,
              blockedBy: gateStatus.blockedBy,
              message: gateStatus.allPassed
                ? `All ${gateStatus.gates.length} gate(s) passed for "${input.forStatus}"`
                : `Blocked by ${gateStatus.blockedBy.length} gate(s)`
            }, null, 2)
          }]
        };
      }

      // ==================== TASK TEMPLATES ====================

      case 'scrum_template_create': {
        const input = TemplateCreateSchema.parse(args);
        try {
          const template = state.createTemplate(input);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'ok',
                template,
                message: `Template "${input.name}" created`
              }, null, 2)
            }]
          };
        } catch (e: any) {
          if (e?.message?.includes('already exists')) {
            return {
              content: [{ type: 'text', text: `Template "${input.name}" already exists` }],
              isError: true
            };
          }
          throw e;
        }
      }

      case 'scrum_template_get': {
        const input = TemplateGetSchema.parse(args);
        const template = state.getTemplate(input.nameOrId);
        if (!template) {
          return {
            content: [{ type: 'text', text: `Template not found: ${input.nameOrId}` }],
            isError: true
          };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ template }, null, 2)
          }]
        };
      }

      case 'scrum_templates_list': {
        const templates = state.listTemplates();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: templates.length,
              templates
            }, null, 2)
          }]
        };
      }

      case 'scrum_task_from_template': {
        const input = TaskFromTemplateSchema.parse(args);
        // Verify template exists first
        const template = state.getTemplate(input.template);
        if (!template) {
          return {
            content: [{ type: 'text', text: `Template not found: ${input.template}` }],
            isError: true
          };
        }
        const task = state.createTaskFromTemplate(input.template, input.variables, input.overrides);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              task,
              fromTemplate: template.name,
              message: `Task created from template "${template.name}"`
            }, null, 2)
          }]
        };
      }

      // ==================== WEBHOOKS ====================

      case 'scrum_webhook_register': {
        const input = WebhookRegisterSchema.parse(args);
        const webhook = state.registerWebhook(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              webhook,
              message: `Webhook "${input.name}" registered for ${input.events.length} event(s)`
            }, null, 2)
          }]
        };
      }

      case 'scrum_webhooks_list': {
        const input = WebhooksListMcpSchema.parse(args ?? {});
        const webhooks = state.listWebhooks({ enabledOnly: input.enabledOnly });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: webhooks.length,
              webhooks
            }, null, 2)
          }]
        };
      }

      case 'scrum_webhook_update': {
        const input = WebhookUpdateSchema.parse(args);
        try {
          const webhook = state.updateWebhook(input.webhookId, {
            url: input.url,
            events: input.events,
            headers: input.headers,
            enabled: input.enabled
          });
          if (!webhook) {
            return {
              content: [{ type: 'text', text: `Webhook not found: ${input.webhookId}` }],
              isError: true
            };
          }
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'ok',
                webhook,
                message: `Webhook "${webhook.name}" updated`
              }, null, 2)
            }]
          };
        } catch (e: any) {
          if (e?.message?.includes('Unknown webhookId')) {
            return {
              content: [{ type: 'text', text: `Webhook not found: ${input.webhookId}` }],
              isError: true
            };
          }
          throw e;
        }
      }

      case 'scrum_webhook_delete': {
        const input = WebhookDeleteSchema.parse(args);
        const deleted = state.deleteWebhook(input.webhookId);
        if (!deleted) {
          return {
            content: [{ type: 'text', text: `Webhook not found: ${input.webhookId}` }],
            isError: true
          };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              deleted: true,
              webhookId: input.webhookId
            }, null, 2)
          }]
        };
      }

      case 'scrum_webhook_deliveries': {
        const input = WebhookDeliveriesSchema.parse(args);
        const deliveries = state.listWebhookDeliveries(input.webhookId, input.limit ?? 50);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              webhookId: input.webhookId,
              count: deliveries.length,
              deliveries
            }, null, 2)
          }]
        };
      }

      // ==================== COMPLIANCE ====================

      case 'scrum_compliance_check': {
        const input = ComplianceCheckSchema.parse(args);

        // Verify task exists
        const task = state.getTask(input.taskId);
        if (!task) {
          return {
            content: [{ type: 'text', text: `Task not found: ${input.taskId}` }],
            isError: true
          };
        }

        const result = state.checkCompliance(input.taskId, input.agentId);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: result.canComplete ? 'ok' : 'blocked',
              ...result,
              // Add actionable next steps if not compliant
              nextSteps: !result.canComplete ? getComplianceNextSteps(result) : undefined
            }, null, 2)
          }]
        };
      }

      // ==================== SPRINT (Collaborative Multi-Agent Work) ====================

      case 'scrum_sprint_create': {
        if (!cfg.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse();
        const input = SprintCreateSchema.parse(args);

        // Verify task exists
        const task = state.getTask(input.taskId);
        if (!task) {
          return {
            content: [{ type: 'text', text: `Task not found: ${input.taskId}` }],
            isError: true
          };
        }

        const sprint = state.createSprint(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              sprint,
              message: `Sprint created for task "${task.title}". Agents can now join with scrum_sprint_join.`
            }, null, 2)
          }]
        };
      }

      case 'scrum_sprint_get': {
        if (!cfg.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse();
        const input = SprintGetSchema.parse(args);
        const sprint = state.getSprint(input.sprintId);
        if (!sprint) {
          return {
            content: [{ type: 'text', text: `Sprint not found: ${input.sprintId}` }],
            isError: true
          };
        }

        const members = state.getSprintMembers(input.sprintId);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ sprint, members }, null, 2)
          }]
        };
      }

      case 'scrum_sprint_for_task': {
        if (!cfg.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse();
        const input = SprintForTaskSchema.parse(args);

        // Verify task exists
        const task = state.getTask(input.taskId);
        if (!task) {
          return {
            content: [{ type: 'text', text: `Task not found: ${input.taskId}` }],
            isError: true
          };
        }

        const sprint = state.getSprintForTask(input.taskId);
        if (!sprint) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'no_sprint',
                taskId: input.taskId,
                message: 'No active sprint for this task. Create one with scrum_sprint_create if needed.'
              }, null, 2)
            }]
          };
        }

        const members = state.getSprintMembers(sprint.id);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ sprint, members }, null, 2)
          }]
        };
      }

      case 'scrum_sprint_list': {
        if (!cfg.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse();
        const input = SprintListSchema.parse(args ?? {});
        const sprints = state.listSprints({
          taskId: input.taskId,
          status: input.status
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: sprints.length,
              sprints
            }, null, 2)
          }]
        };
      }

      case 'scrum_sprint_complete': {
        if (!cfg.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse();
        const input = SprintGetSchema.parse(args);
        const sprint = state.completeSprint(input.sprintId);
        if (!sprint) {
          return {
            content: [{ type: 'text', text: `Sprint not found: ${input.sprintId}` }],
            isError: true
          };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              sprint,
              message: 'Sprint completed.'
            }, null, 2)
          }]
        };
      }

      case 'scrum_sprint_join': {
        if (!cfg.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse();
        const input = SprintJoinSchema.parse(args);

        // Verify sprint exists
        const sprint = state.getSprint(input.sprintId);
        if (!sprint) {
          return {
            content: [{ type: 'text', text: `Sprint not found: ${input.sprintId}` }],
            isError: true
          };
        }

        const member = state.joinSprint(input);
        const members = state.getSprintMembers(input.sprintId);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              member,
              teamSize: members.length,
              teammates: members.filter(m => m.agentId !== input.agentId).map(m => ({
                agentId: m.agentId,
                workingOn: m.workingOn,
                focusArea: m.focusArea
              })),
              message: `Joined sprint. ${members.length} agent(s) now active. Call scrum_sprint_context to understand what others are doing.`
            }, null, 2)
          }]
        };
      }

      case 'scrum_sprint_leave': {
        if (!cfg.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse();
        const input = SprintLeaveSchema.parse(args);
        const left = state.leaveSprint(input.sprintId, input.agentId);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: left ? 'ok' : 'not_in_sprint',
              left,
              message: left ? 'Left sprint.' : 'You were not in this sprint.'
            }, null, 2)
          }]
        };
      }

      case 'scrum_sprint_members': {
        if (!cfg.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse();
        const input = SprintMembersSchema.parse(args);

        // Verify sprint exists
        const sprint = state.getSprint(input.sprintId);
        if (!sprint) {
          return {
            content: [{ type: 'text', text: `Sprint not found: ${input.sprintId}` }],
            isError: true
          };
        }

        const members = state.getSprintMembers(input.sprintId);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              sprintId: input.sprintId,
              count: members.length,
              members
            }, null, 2)
          }]
        };
      }

      case 'scrum_sprint_share': {
        if (!cfg.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse();
        const input = SprintShareSchema.parse(args);

        // Verify sprint exists
        const sprint = state.getSprint(input.sprintId);
        if (!sprint) {
          return {
            content: [{ type: 'text', text: `Sprint not found: ${input.sprintId}` }],
            isError: true
          };
        }

        const share = state.shareWithSprint(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              share,
              message: `Shared ${input.shareType}: "${input.title}". Other agents will see this in sprint context.`
            }, null, 2)
          }]
        };
      }

      case 'scrum_sprint_shares': {
        if (!cfg.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse();
        const input = SprintSharesSchema.parse(args);

        // Verify sprint exists
        const sprint = state.getSprint(input.sprintId);
        if (!sprint) {
          return {
            content: [{ type: 'text', text: `Sprint not found: ${input.sprintId}` }],
            isError: true
          };
        }

        const shares = state.getSprintShares(input.sprintId, {
          shareType: input.shareType,
          limit: input.limit
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              sprintId: input.sprintId,
              count: shares.length,
              shares
            }, null, 2)
          }]
        };
      }

      case 'scrum_sprint_context': {
        if (!cfg.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse();
        const input = SprintContextSchema.parse(args);

        const context = state.getSprintContext(input.sprintId);
        if (!context) {
          return {
            content: [{ type: 'text', text: `Sprint not found: ${input.sprintId}` }],
            isError: true
          };
        }

        // Organize shares by type for easier consumption
        const decisions = context.shares.filter(s => s.shareType === 'decision');
        const interfaces = context.shares.filter(s => s.shareType === 'interface');
        const discoveries = context.shares.filter(s => s.shareType === 'discovery');
        const integrations = context.shares.filter(s => s.shareType === 'integration');
        const unansweredQuestions = state.getUnansweredQuestions(input.sprintId);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              sprint: context.sprint,
              members: context.members,
              allFiles: context.allFiles,
              allBoundaries: context.allBoundaries,
              summary: {
                memberCount: context.members.length,
                decisionsCount: decisions.length,
                interfacesCount: interfaces.length,
                discoveriesCount: discoveries.length,
                integrationsCount: integrations.length,
                unansweredQuestionsCount: unansweredQuestions.length
              },
              // Key information for understanding team work
              decisions,
              interfaces,
              discoveries,
              integrations,
              unansweredQuestions,
              message: `${context.members.length} agent(s) in sprint. Review decisions and interfaces before starting work.`
            }, null, 2)
          }]
        };
      }

      case 'scrum_sprint_check': {
        if (!cfg.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse();
        const input = SprintCheckSchema.parse(args);

        const context = state.getSprintContext(input.sprintId);
        if (!context) {
          return {
            content: [{ type: 'text', text: `Sprint not found: ${input.sprintId}` }],
            isError: true
          };
        }

        // Find the agent's focus area from their membership
        const myMembership = context.members.find(m => m.agentId === input.agentId);
        const focusArea = input.focusArea || myMembership?.focusArea;

        // Get unanswered questions
        const unansweredQuestions = state.getUnansweredQuestions(input.sprintId);

        // Filter shares relevant to this agent's focus area
        const relevantShares = focusArea
          ? context.shares.filter(s => {
              // Check if share content mentions focus area
              const content = (s.title + ' ' + s.content).toLowerCase();
              const focus = focusArea.toLowerCase();
              return content.includes(focus);
            })
          : [];

        // Find interfaces that might need implementation
        const interfaces = context.shares.filter(s => s.shareType === 'interface');

        // Find integration points
        const integrations = context.shares.filter(s => s.shareType === 'integration');

        // What other agents are working on
        const teammates = context.members
          .filter(m => m.agentId !== input.agentId)
          .map(m => ({
            agentId: m.agentId,
            workingOn: m.workingOn,
            focusArea: m.focusArea
          }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              teammates,
              unansweredQuestions: unansweredQuestions.map(q => ({
                id: q.id,
                title: q.title,
                agentId: q.agentId,
                createdAt: q.createdAt
              })),
              interfaces: interfaces.map(i => ({
                id: i.id,
                title: i.title,
                agentId: i.agentId,
                relatedFiles: i.relatedFiles
              })),
              integrations: integrations.map(i => ({
                id: i.id,
                title: i.title,
                agentId: i.agentId
              })),
              relevantToYourFocus: focusArea ? relevantShares.length : 'no focus area set',
              message: unansweredQuestions.length > 0
                ? `${unansweredQuestions.length} unanswered question(s) - can you help?`
                : 'Team is coordinated. Check interfaces and integrations for connection points.'
            }, null, 2)
          }]
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true
        };
    }
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error: ${err?.message ?? String(err)}` }],
      isError: true
    };
  }
});

// Resources: expose SCRUM contract and agent rules
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'scrum://contract',
        name: 'SCRUM Contract',
        description: 'The SCRUM agent rules - the law of the room',
        mimeType: 'text/markdown'
      },
      {
        uri: 'scrum://status',
        name: 'SCRUM Status',
        description: 'Current SCRUM server status',
        mimeType: 'application/json'
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'scrum://contract') {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: `# SCRUM Contract

## The Law of the Room

### 1) Evidence is the currency
If you claim something works, you must attach receipts:
- Command(s) run
- Output (or pointer to logs)
- What you expected
- What actually happened

No receipts, no merge.

### 2) Intent before edits
Before touching code, post an intent with:
- Task ID
- Files likely to change
- Boundaries (what you promise not to change)
- Acceptance criteria
- Risks you can already see

### 3) Claims prevent collisions
You must claim a file before editing it.
- Claims expire (TTL)
- If a claim exists, you either wait, split the work, or negotiate

### 4) No silent failure
Forbidden patterns:
- bare \`except\`
- \`except Exception: pass\` without logging
- swallowing errors in background tasks
- returning success when failure occurred

### 5) Small changes win
If a change touches more than needed, split it.

## Workflow
1. \`scrum_task_create\` - Create a task
2. \`scrum_intent_post\` - Declare what you'll change
3. \`scrum_claim\` - Lock the files
4. Make your changes
5. \`scrum_evidence_attach\` - Prove it works
6. \`scrum_claim_release\` - Release the files`
        }
      ]
    };
  }

  if (uri === 'scrum://status') {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(state.status(), null, 2)
        }
      ]
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('SCRUM MCP server error:', err);
  process.exit(1);
});
