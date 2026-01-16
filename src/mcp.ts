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
  ComplianceCheckSchema,
  DeadWorkMcpSchema,
  // Consolidated schemas (v0.6.0)
  BlockerActionSchema,
  DependencyActionSchema,
  MetricsUnifiedSchema,
  SprintGetUnifiedSchema,
  SprintContextUnifiedSchema,
  StatusSchema,
  // Sprint schemas (kept for non-consolidated tools)
  SprintCreateSchema,
  SprintGetSchema,
  SprintListSchema,
  SprintJoinSchema,
  SprintLeaveSchema,
  SprintMembersSchema,
  SprintShareSchema,
  SprintSharesSchema,
  // Convenience schemas (v0.5.2) - token optimization
  ContextSchema,
  StartWorkSchema,
  FinishWorkSchema,
  // Orchestration schemas (v0.5.2)
  OrchestrateStartSchema,
  WorkerCompleteSchema,
  OrchestrateStatusSchema
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
          'Get SCRUM server status and available tools. Use profile to filter: solo (12 core tools), team (+ collaboration), full (all tools). Default shows all.',
        inputSchema: {
          type: 'object',
          properties: {
            profile: { type: 'string', enum: ['solo', 'team', 'full'], description: 'Tool profile: solo (core), team (+ collab), full (all)' }
          },
          required: []
        }
      },
      {
        name: 'scrum_task_create',
        description: 'Create a new task. Returns task with ID.',
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
        description: 'Get task by ID with intents and evidence.',
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
        description: 'List recent tasks. Returns newest-first.',
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
        description: 'Declare intent BEFORE claiming. Required: files to modify, acceptanceCriteria.',
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
        description: 'Claim files. REQUIRES intent first. Returns conflicts if claimed.',
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
        description: 'Release claims. REQUIRES evidence first.',
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
        description: 'List all active claims.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'scrum_claim_extend',
        description: 'Extend claim TTL without releasing.',
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
        description: 'Attach evidence (command + output). Required before release.',
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
        description: 'Check if files are claimed by others.',
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
        description: 'Log a file change. Call AFTER each edit.',
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
        description: 'Search changelog for file changes and events.',
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
        description: 'Get kanban board. Tasks grouped by status.',
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
        description: 'Add comment to task for discussion.',
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
      // ==================== BLOCKERS (Consolidated) ====================
      {
        name: 'scrum_blocker',
        description: 'Manage blockers that prevent task progress. Actions: add (report why task is stuck - include description), resolve (clear blocker when fixed), list (see all blockers on a task). Blockers are visible on the board and in task detail.',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['add', 'resolve', 'list'], description: 'Action to perform' },
            taskId: { type: 'string', description: 'Task ID (required for add/list)' },
            description: { type: 'string', description: 'What is blocking (required for add)' },
            blockingTaskId: { type: 'string', description: 'Task causing the block (optional for add)' },
            agentId: { type: 'string', description: 'Your agent ID (required for add)' },
            blockerId: { type: 'string', description: 'Blocker ID (required for resolve)' },
            unresolvedOnly: { type: 'boolean', description: 'Only show unresolved (for list)' }
          },
          required: ['action']
        }
      },
      // ==================== DEPENDENCIES (Consolidated) ====================
      {
        name: 'scrum_dependency',
        description: 'Manage task dependencies (task X requires task Y to complete first). Actions: add (create dependency), remove (delete), get (list what this task depends on), check (verify all dependencies are done - call BEFORE starting work on a task).',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['add', 'remove', 'get', 'check'], description: 'Action to perform' },
            taskId: { type: 'string', description: 'Task ID (required for add/get/check)' },
            dependsOnTaskId: { type: 'string', description: 'Task that must complete first (required for add)' },
            dependencyId: { type: 'string', description: 'Dependency ID (required for remove)' }
          },
          required: ['action']
        }
      },
      // ==================== METRICS (Consolidated) ====================
      {
        name: 'scrum_metrics',
        description: 'Get workflow metrics to monitor team health. Types: board (cycle time and throughput for flow optimization), velocity (story points over time for capacity planning), aging (tasks stuck too long for bottleneck detection), task (single task analysis with time breakdowns).',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['board', 'velocity', 'aging', 'task'], description: 'Metric type (default: board)' },
            since: { type: 'number', description: 'Start timestamp for board metrics' },
            until: { type: 'number', description: 'End timestamp for board metrics' },
            periodDays: { type: 'number', description: 'Days per period for velocity (default 7)' },
            periods: { type: 'number', description: 'Number of periods for velocity (default 4)' },
            thresholdDays: { type: 'number', description: 'Days threshold for aging (default 2)' },
            taskId: { type: 'string', description: 'Task ID (required for type=task)' }
          },
          required: []
        }
      },
      // ==================== DEAD WORK DETECTION ====================
      {
        name: 'scrum_dead_work',
        description: 'Find stale/abandoned claims.',
        inputSchema: {
          type: 'object',
          properties: {
            staleDays: { type: 'number', description: 'Days of inactivity to flag (default 1)' }
          },
          required: []
        }
      },
      // ==================== COMPLIANCE ====================
      {
        name: 'scrum_compliance_check',
        description: 'Check compliance before release. Returns score and violations.',
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
        description: 'Get sprint details including members, goal, and status. Provide sprintId for direct lookup, or taskId to find the active sprint for a task. Returns full sprint with member list, share counts, and progress summary.',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'string', description: 'Sprint ID (provide this OR taskId)' },
            taskId: { type: 'string', description: 'Task ID to find sprint for (provide this OR sprintId)' }
          },
          required: []
        }
      },
      {
        name: 'scrum_sprint_list',
        description: 'List sprints to find active collaborations. Use to check if a sprint already exists for a task before creating a new one. Filter by status (active/completed) or taskId.',
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
        description: 'Complete a sprint when multi-agent work is finished. Completed sprints preserve all decisions, interfaces, and discoveries for future reference. Call this AFTER all agents have left.',
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
        description: 'Get sprint context. Returns members, decisions, interfaces, discoveries, and unanswered questions. Add agentId to also get updates since your last check and integration points for your focus area.',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'string', description: 'Sprint ID' },
            agentId: { type: 'string', description: 'Your agent ID (adds personalized updates)' },
            focusArea: { type: 'string', description: 'Your focus area to filter relevant shares' },
            includeUpdates: { type: 'boolean', description: 'Include new shares since last check' }
          },
          required: ['sprintId']
        }
      },
      // ==================== CONVENIENCE TOOLS (v0.5.2) ====================
      // Token-optimized tools that combine common workflow steps
      {
        name: 'scrum_context',
        description: 'Get full session context in ONE call. Returns: server status, recent tasks, active claims, and board. Use at SESSION START instead of calling status/task_list/claims_list/board separately. Saves ~450 tokens.',
        inputSchema: {
          type: 'object',
          properties: {
            taskLimit: { type: 'number', description: 'Max tasks to return (1-50, default 10)' },
            includeBoard: { type: 'boolean', description: 'Include kanban board (default true)' }
          },
          required: []
        }
      },
      {
        name: 'scrum_start_work',
        description: 'Start work on files in ONE call. Does: overlap_check → intent_post → claim. Use instead of calling these 3 tools separately. Saves ~200 tokens. Returns conflict info if files are claimed.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' },
            agentId: { type: 'string', description: 'Your agent ID' },
            files: { type: 'array', items: { type: 'string' }, description: 'Files to claim' },
            acceptanceCriteria: { type: 'string', description: 'How to verify work is done (min 10 chars)' },
            boundaries: { type: 'string', description: 'What you promise NOT to touch (optional)' },
            ttlSeconds: { type: 'number', description: 'Claim duration (5-3600, default 900)' }
          },
          required: ['taskId', 'agentId', 'files', 'acceptanceCriteria']
        }
      },
      {
        name: 'scrum_finish_work',
        description: 'Finish work in ONE call. Does: evidence_attach → compliance_check → claim_release. Use instead of calling these tools separately. Saves ~100 tokens. Fails if compliance check fails.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' },
            agentId: { type: 'string', description: 'Your agent ID' },
            command: { type: 'string', description: 'Command that proves work (e.g., "npm test")' },
            output: { type: 'string', description: 'Command output as evidence' },
            files: { type: 'array', items: { type: 'string' }, description: 'Files to release (omit for all)' }
          },
          required: ['taskId', 'agentId', 'command', 'output']
        }
      },

      // ==================== ORCHESTRATION TOOLS (v0.5.2) ====================
      // Tools for multi-agent orchestration patterns
      {
        name: 'scrum_orchestrate_start',
        description: 'Start orchestrated parallel work. Creates sprint, generates worker IDs, and returns worker configs. Use when spawning multiple sub-agents for a task. Each worker gets: agentId, files, focus, instructions.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID to work on' },
            orchestratorId: { type: 'string', description: 'Your agent ID as orchestrator (e.g., "claude-orchestrator-main")' },
            goal: { type: 'string', description: 'Sprint goal describing integration objective' },
            workers: {
              type: 'array',
              description: 'Worker definitions',
              items: {
                type: 'object',
                properties: {
                  focus: { type: 'string', description: 'Worker focus area (e.g., "backend", "tests")' },
                  files: { type: 'array', items: { type: 'string' }, description: 'Files for this worker' },
                  instructions: { type: 'string', description: 'Specific instructions (optional)' }
                },
                required: ['focus', 'files']
              }
            }
          },
          required: ['taskId', 'orchestratorId', 'goal', 'workers']
        }
      },
      {
        name: 'scrum_worker_complete',
        description: 'Signal worker completion. Call this when a worker finishes (success/failed/blocked). Orchestrator sees status via scrum_orchestrate_status.',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'string', description: 'Sprint ID from orchestrate_start' },
            agentId: { type: 'string', description: 'Worker agent ID' },
            status: { type: 'string', enum: ['success', 'failed', 'blocked'], description: 'Outcome' },
            result: { type: 'string', description: 'Summary of work done or failure reason' },
            filesModified: { type: 'array', items: { type: 'string' }, description: 'Files actually changed' }
          },
          required: ['sprintId', 'agentId', 'status', 'result']
        }
      },
      {
        name: 'scrum_orchestrate_status',
        description: 'Get orchestration progress. Returns worker states, completion counts, and any issues. Use to monitor parallel workers.',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'string', description: 'Sprint ID from orchestrate_start' }
          },
          required: ['sprintId']
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
        const input = StatusSchema.parse(args ?? {});
        const status = state.status();

        // Tool profiles for discoverability
        const soloTools = [
          'scrum_status', 'scrum_task_create', 'scrum_task_get', 'scrum_task_list', 'scrum_task_update',
          'scrum_intent_post', 'scrum_claim', 'scrum_claim_release', 'scrum_claims_list',
          'scrum_evidence_attach', 'scrum_overlap_check', 'scrum_board', 'scrum_compliance_check',
          // Convenience tools (v0.5.2) - token optimized
          'scrum_context', 'scrum_start_work', 'scrum_finish_work'
        ];
        const teamTools = [
          ...soloTools,
          'scrum_claim_extend', 'scrum_changelog_log', 'scrum_changelog_search',
          'scrum_comment_add', 'scrum_comments_list', 'scrum_blocker', 'scrum_dependency', 'scrum_metrics',
          'scrum_dead_work'
        ];
        const sprintTools = [
          'scrum_sprint_create', 'scrum_sprint_get', 'scrum_sprint_list', 'scrum_sprint_complete',
          'scrum_sprint_join', 'scrum_sprint_leave', 'scrum_sprint_members',
          'scrum_sprint_share', 'scrum_sprint_shares', 'scrum_sprint_context'
        ];
        const orchestrationTools = [
          'scrum_orchestrate_start', 'scrum_worker_complete', 'scrum_orchestrate_status'
        ];
        const fullTools = [...teamTools, ...sprintTools, ...orchestrationTools];

        let recommendedTools: string[];
        if (input.profile === 'solo') {
          recommendedTools = soloTools;
        } else if (input.profile === 'team') {
          recommendedTools = teamTools;
        } else {
          recommendedTools = fullTools;
        }

        return {
          content: [{ type: 'text', text: JSON.stringify({
            ...status,
            profile: input.profile ?? 'full',
            recommendedTools,
            toolCount: recommendedTools.length
          }, null, 2) }]
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

      // ==================== BLOCKERS (Consolidated) ====================

      case 'scrum_blocker': {
        const input = BlockerActionSchema.parse(args);

        if (input.action === 'add') {
          try {
            const blocker = state.addBlocker({
              taskId: input.taskId!,
              description: input.description!,
              blockingTaskId: input.blockingTaskId,
              agentId: input.agentId!
            });
            return {
              content: [{ type: 'text', text: JSON.stringify({ status: 'ok', action: 'add', blocker }, null, 2) }]
            };
          } catch (e: any) {
            if (e?.message?.includes('Unknown taskId')) {
              return { content: [{ type: 'text', text: `Task not found: ${input.taskId}` }], isError: true };
            }
            if (e?.message?.includes('Unknown blockingTaskId')) {
              return { content: [{ type: 'text', text: `Blocking task not found: ${input.blockingTaskId}` }], isError: true };
            }
            throw e;
          }
        }

        if (input.action === 'resolve') {
          try {
            const blocker = state.resolveBlocker(input.blockerId!);
            return {
              content: [{ type: 'text', text: JSON.stringify({ status: 'ok', action: 'resolve', blocker }, null, 2) }]
            };
          } catch (e: any) {
            if (e?.message?.includes('Unknown blockerId')) {
              return { content: [{ type: 'text', text: `Blocker not found: ${input.blockerId}` }], isError: true };
            }
            throw e;
          }
        }

        if (input.action === 'list') {
          const task = state.getTask(input.taskId!);
          if (!task) {
            return { content: [{ type: 'text', text: `Task not found: ${input.taskId}` }], isError: true };
          }
          const blockers = state.listBlockers(input.taskId!, { unresolvedOnly: input.unresolvedOnly });
          const unresolvedCount = state.getUnresolvedBlockersCount(input.taskId!);
          return {
            content: [{ type: 'text', text: JSON.stringify({ action: 'list', count: blockers.length, unresolvedCount, blockers }, null, 2) }]
          };
        }

        return { content: [{ type: 'text', text: 'Invalid action' }], isError: true };
      }

      case 'scrum_dependency': {
        const input = DependencyActionSchema.parse(args);

        if (input.action === 'add') {
          try {
            const dependency = state.addDependency(input.taskId!, input.dependsOnTaskId!);
            return {
              content: [{ type: 'text', text: JSON.stringify({ status: 'ok', action: 'add', dependency }, null, 2) }]
            };
          } catch (e: any) {
            if (e?.message?.includes('Unknown taskId')) {
              return { content: [{ type: 'text', text: `Task not found: ${input.taskId}` }], isError: true };
            }
            if (e?.message?.includes('Unknown dependsOnTaskId')) {
              return { content: [{ type: 'text', text: `Dependency task not found: ${input.dependsOnTaskId}` }], isError: true };
            }
            if (e?.message?.includes('cannot depend on itself') || e?.message?.includes('Circular dependency') || e?.message?.includes('Dependency already exists')) {
              return { content: [{ type: 'text', text: e.message }], isError: true };
            }
            throw e;
          }
        }

        if (input.action === 'remove') {
          const deleted = state.removeDependency(input.dependencyId!);
          if (!deleted) {
            return { content: [{ type: 'text', text: `Dependency not found: ${input.dependencyId}` }], isError: true };
          }
          return {
            content: [{ type: 'text', text: JSON.stringify({ status: 'ok', action: 'remove', deleted: true, dependencyId: input.dependencyId }, null, 2) }]
          };
        }

        if (input.action === 'get') {
          const task = state.getTask(input.taskId!);
          if (!task) {
            return { content: [{ type: 'text', text: `Task not found: ${input.taskId}` }], isError: true };
          }
          const deps = state.getDependencies(input.taskId!);
          const records = state.getDependencyRecords(input.taskId!);
          return {
            content: [{ type: 'text', text: JSON.stringify({ action: 'get', taskId: input.taskId, blockedBy: deps.blockedBy, blocking: deps.blocking, dependencyRecords: records }, null, 2) }]
          };
        }

        if (input.action === 'check') {
          const task = state.getTask(input.taskId!);
          if (!task) {
            return { content: [{ type: 'text', text: `Task not found: ${input.taskId}` }], isError: true };
          }
          const readiness = state.isTaskReady(input.taskId!);
          return {
            content: [{ type: 'text', text: JSON.stringify({
              action: 'check', taskId: input.taskId, ready: readiness.ready, blockingTasks: readiness.blockingTasks,
              message: readiness.ready ? 'Task is ready to start (all dependencies are done)' : `Task is blocked by ${readiness.blockingTasks.length} incomplete dependencies`
            }, null, 2) }]
          };
        }

        return { content: [{ type: 'text', text: 'Invalid action' }], isError: true };
      }

      // ==================== METRICS (Consolidated) ====================

      case 'scrum_metrics': {
        const input = MetricsUnifiedSchema.parse(args ?? {});

        if (input.type === 'board') {
          const metrics = state.getBoardMetrics({
            since: input.since,
            until: input.until
          });
          return {
            content: [{ type: 'text', text: JSON.stringify({ type: 'board', ...metrics }, null, 2) }]
          };
        }

        if (input.type === 'velocity') {
          const velocity = state.getVelocity({
            periodDays: input.periodDays,
            periods: input.periods
          });
          return {
            content: [{ type: 'text', text: JSON.stringify({
              type: 'velocity',
              periodDays: input.periodDays ?? 7,
              periods: velocity,
              summary: `Velocity over ${velocity.length} periods: ${velocity.map(v => v.storyPoints).join(', ')} story points`
            }, null, 2) }]
          };
        }

        if (input.type === 'aging') {
          const aging = state.getAgingWip({
            thresholdDays: input.thresholdDays
          });
          return {
            content: [{ type: 'text', text: JSON.stringify({
              type: 'aging',
              thresholdDays: input.thresholdDays ?? 2,
              count: aging.length,
              tasks: aging,
              message: aging.length > 0
                ? `${aging.length} task(s) have been in progress for more than ${input.thresholdDays ?? 2} days`
                : 'No aging WIP tasks found'
            }, null, 2) }]
          };
        }

        if (input.type === 'task') {
          const metrics = state.getTaskMetrics(input.taskId!);
          if (!metrics) {
            return {
              content: [{ type: 'text', text: `Task not found: ${input.taskId}` }],
              isError: true
            };
          }
          return {
            content: [{ type: 'text', text: JSON.stringify({
              type: 'task',
              ...metrics,
              leadTimeDays: metrics.leadTimeMs ? Math.round(metrics.leadTimeMs / (24 * 60 * 60 * 1000) * 10) / 10 : undefined,
              cycleTimeDays: metrics.cycleTimeMs ? Math.round(metrics.cycleTimeMs / (24 * 60 * 60 * 1000) * 10) / 10 : undefined
            }, null, 2) }]
          };
        }

        return { content: [{ type: 'text', text: 'Invalid metrics type' }], isError: true };
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
        const input = SprintGetUnifiedSchema.parse(args);

        // If taskId provided, look up sprint by task
        if (input.taskId) {
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

        // Otherwise, look up by sprintId
        const sprint = state.getSprint(input.sprintId!);
        if (!sprint) {
          return {
            content: [{ type: 'text', text: `Sprint not found: ${input.sprintId}` }],
            isError: true
          };
        }

        const members = state.getSprintMembers(input.sprintId!);
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
        const input = SprintContextUnifiedSchema.parse(args);

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

        // If agentId provided, include personalized teammate/focus info
        let personalizedInfo = {};
        if (input.agentId) {
          const myMembership = context.members.find(m => m.agentId === input.agentId);
          const focusArea = input.focusArea || myMembership?.focusArea;

          const relevantShares = focusArea
            ? context.shares.filter(s => {
                const content = (s.title + ' ' + s.content).toLowerCase();
                return content.includes(focusArea.toLowerCase());
              })
            : [];

          const teammates = context.members
            .filter(m => m.agentId !== input.agentId)
            .map(m => ({
              agentId: m.agentId,
              workingOn: m.workingOn,
              focusArea: m.focusArea
            }));

          personalizedInfo = {
            teammates,
            relevantToYourFocus: focusArea ? relevantShares.length : 'no focus area set'
          };
        }

        // If includeUpdates is true, include full share details
        const sharesOutput = input.includeUpdates
          ? { decisions, interfaces, discoveries, integrations, unansweredQuestions }
          : {
              decisions: decisions.slice(0, 5),
              interfaces: interfaces.slice(0, 5),
              unansweredQuestions: unansweredQuestions.slice(0, 5)
            };

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
              ...sharesOutput,
              ...personalizedInfo,
              message: unansweredQuestions.length > 0
                ? `${context.members.length} agent(s) in sprint. ${unansweredQuestions.length} unanswered question(s) - can you help?`
                : `${context.members.length} agent(s) in sprint. Review decisions and interfaces before starting work.`
            }, null, 2)
          }]
        };
      }

      // ==================== CONVENIENCE TOOLS (v0.5.2) ====================

      case 'scrum_context': {
        const input = ContextSchema.parse(args ?? {});
        const taskLimit = input.taskLimit ?? 10;
        const includeBoard = input.includeBoard ?? true;

        // Gather all context in one call
        const status = state.status();
        const tasks = state.listTasks(taskLimit);
        const claims = state.listActiveClaims();
        const board = includeBoard ? state.getBoard() : null;

        // Auto-detect suggested profile based on state
        const activeSprints = state.listSprints({ status: 'active' });
        const hasActiveSprint = activeSprints.length > 0;
        const hasOtherClaims = claims.length > 0;

        let suggestedProfile: 'solo' | 'team' | 'full' = 'solo';
        let profileReason: string;

        if (hasActiveSprint) {
          suggestedProfile = 'full';
          profileReason = `Active sprint detected (${activeSprints.length} sprint${activeSprints.length > 1 ? 's' : ''}). Use full profile for collaboration.`;
        } else if (hasOtherClaims) {
          suggestedProfile = 'team';
          profileReason = `Other agents have claims (${claims.length} active). Use team profile for coordination.`;
        } else {
          suggestedProfile = 'solo';
          profileReason = 'No sprints or other claims. Solo profile is sufficient.';
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: {
                ok: true,
                tasks: status.tasks,
                claims: status.claims
              },
              recentTasks: tasks,
              activeClaims: claims,
              board: board,
              summary: {
                taskCount: tasks.length,
                claimCount: claims.length,
                inProgressCount: board?.in_progress?.length ?? 0
              },
              profile: {
                suggested: suggestedProfile,
                reason: profileReason,
                toolCounts: { solo: 16, team: 25, full: 38 }
              },
              hint: 'Use scrum_start_work(taskId, agentId, files, acceptanceCriteria) to begin work'
            }, null, 2)
          }]
        };
      }

      case 'scrum_start_work': {
        const input = StartWorkSchema.parse(args);

        // Step 1: Check for overlaps (same logic as scrum_overlap_check)
        const existingClaims = state.listActiveClaims();
        const overlaps: { file: string; claimedBy: string; expiresAt: number }[] = [];
        for (const claim of existingClaims) {
          for (const file of input.files) {
            if (claim.files.includes(file)) {
              overlaps.push({ file, claimedBy: claim.agentId, expiresAt: claim.expiresAt });
            }
          }
        }
        if (overlaps.length > 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'conflict',
                reason: 'FILES_CLAIMED',
                message: `Files already claimed by other agents`,
                conflicts: overlaps,
                hint: 'Wait for claims to be released or work on different files'
              }, null, 2)
            }],
            isError: true
          };
        }

        // Step 2: Post intent
        const intent = state.postIntent({
          taskId: input.taskId,
          agentId: input.agentId,
          files: input.files,
          boundaries: input.boundaries,
          acceptanceCriteria: input.acceptanceCriteria
        });

        // Step 3: Create claim
        const claimResult = state.createClaim(
          input.agentId,
          input.files,
          input.ttlSeconds ?? 900
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              message: 'Work started successfully',
              intent: intent,
              claim: claimResult.claim,
              expiresIn: `${input.ttlSeconds ?? 900} seconds`,
              nextSteps: [
                'Make your changes to the claimed files',
                'Log changes with scrum_changelog_log()',
                'When done: scrum_finish_work(taskId, agentId, command, output)'
              ]
            }, null, 2)
          }]
        };
      }

      case 'scrum_finish_work': {
        const input = FinishWorkSchema.parse(args);

        // Step 1: Attach evidence
        const evidence = state.attachEvidence({
          taskId: input.taskId,
          agentId: input.agentId,
          command: input.command,
          output: input.output
        });

        // Step 2: Check compliance
        const compliance = state.checkCompliance(input.taskId, input.agentId);

        // Block on scope violations
        if (!compliance.checks.filesMatch.passed && compliance.checks.filesMatch.undeclared.length > 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'rejected',
                reason: 'SCOPE_VIOLATION',
                message: `Modified files not in intent: ${compliance.checks.filesMatch.undeclared.join(', ')}`,
                evidence: evidence,
                compliance: compliance,
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
                message: `Modified files you promised NOT to touch: ${compliance.checks.boundariesRespected.violations.join(', ')}`,
                evidence: evidence,
                compliance: compliance,
                nextSteps: getComplianceNextSteps(compliance)
              }, null, 2)
            }],
            isError: true
          };
        }

        // Step 3: Release claims
        const released = state.releaseClaims(input.agentId, input.files);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              message: 'Work finished successfully',
              evidence: evidence,
              compliance: {
                compliant: compliance.compliant,
                score: compliance.score,
                summary: compliance.summary
              },
              released: released,
              hint: 'Ready to commit. Pre-commit hook will verify compliance.'
            }, null, 2)
          }]
        };
      }

      // ==================== ORCHESTRATION TOOLS (v0.5.2) ====================

      case 'scrum_orchestrate_start': {
        const input = OrchestrateStartSchema.parse(args);

        // Step 1: Create sprint for the task
        const sprint = state.createSprint({
          taskId: input.taskId,
          goal: input.goal
        });

        // Step 2: Join as orchestrator
        state.joinSprint({
          sprintId: sprint.id,
          agentId: input.orchestratorId,
          workingOn: 'Orchestrating parallel workers',
          focusArea: 'orchestration'
        });

        // Step 3: Generate worker configs with deterministic IDs
        const workerConfigs = input.workers.map((worker, index) => {
          // Generate agentId from orchestrator ID + focus + sequence
          const baseId = input.orchestratorId.replace(/^[^-]+-/, '').split('-')[0] || 'main';
          const agentId = `${baseId}-${worker.focus}-${index + 1}`;

          return {
            agentId,
            sprintId: sprint.id,
            taskId: input.taskId,
            focus: worker.focus,
            files: worker.files,
            instructions: worker.instructions || `Work on ${worker.focus} for task ${input.taskId}`,
            // Include context needed to start work
            startCommand: {
              tool: 'scrum_start_work',
              args: {
                taskId: input.taskId,
                agentId,
                files: worker.files,
                acceptanceCriteria: `Complete ${worker.focus} work as part of sprint ${sprint.id}`
              }
            },
            // Include completion command
            completeCommand: {
              tool: 'scrum_worker_complete',
              args: {
                sprintId: sprint.id,
                agentId,
                status: 'success',
                result: '(fill in with actual result)'
              }
            }
          };
        });

        // Step 4: Share orchestration plan
        state.shareWithSprint({
          sprintId: sprint.id,
          agentId: input.orchestratorId,
          shareType: 'context',
          title: 'Orchestration Plan',
          content: `Workers: ${workerConfigs.map(w => `${w.agentId} (${w.focus})`).join(', ')}`
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              message: `Orchestration started with ${workerConfigs.length} workers`,
              sprint: {
                id: sprint.id,
                taskId: input.taskId,
                goal: input.goal
              },
              workers: workerConfigs,
              orchestrator: {
                agentId: input.orchestratorId,
                role: 'orchestrator'
              },
              hint: 'Pass each worker config to a sub-agent. Workers call scrum_start_work then scrum_worker_complete when done.'
            }, null, 2)
          }]
        };
      }

      case 'scrum_worker_complete': {
        const input = WorkerCompleteSchema.parse(args);

        // Step 1: Share completion status
        const share = state.shareWithSprint({
          sprintId: input.sprintId,
          agentId: input.agentId,
          shareType: input.status === 'success' ? 'discovery' : 'context',
          title: `Worker ${input.status}: ${input.agentId}`,
          content: input.result
        });

        // Step 2: Leave the sprint
        state.leaveSprint(input.sprintId, input.agentId);

        // Step 3: Get current sprint status for response
        const members = state.getSprintMembers(input.sprintId);
        const shares = state.getSprintShares(input.sprintId);

        // Count completion statuses from shares
        const completionShares = shares.filter(s => s.title.startsWith('Worker '));
        const successCount = completionShares.filter(s => s.title.includes('success')).length;
        const failedCount = completionShares.filter(s => s.title.includes('failed')).length;
        const blockedCount = completionShares.filter(s => s.title.includes('blocked')).length;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              message: `Worker ${input.agentId} marked as ${input.status}`,
              worker: {
                agentId: input.agentId,
                status: input.status,
                result: input.result,
                filesModified: input.filesModified
              },
              sprintProgress: {
                activeMembers: members.length,
                completed: successCount + failedCount + blockedCount,
                success: successCount,
                failed: failedCount,
                blocked: blockedCount
              },
              hint: members.length === 1 ? 'Only orchestrator remains. Sprint may be ready to complete.' : `${members.length} members still active.`
            }, null, 2)
          }]
        };
      }

      case 'scrum_orchestrate_status': {
        const input = OrchestrateStatusSchema.parse(args);

        // Gather all sprint information
        const sprint = state.getSprint(input.sprintId);
        if (!sprint) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'error',
                message: `Sprint not found: ${input.sprintId}`
              }, null, 2)
            }],
            isError: true
          };
        }

        const members = state.getSprintMembers(input.sprintId);
        const shares = state.getSprintShares(input.sprintId);

        // Parse worker completion statuses from shares
        const completionShares = shares.filter(s => s.title.startsWith('Worker '));
        const workerStatuses = completionShares.map(s => {
          const match = s.title.match(/Worker (success|failed|blocked): (.+)/);
          return match ? { status: match[1], agentId: match[2], result: s.content } : null;
        }).filter(Boolean);

        const successCount = workerStatuses.filter(w => w?.status === 'success').length;
        const failedCount = workerStatuses.filter(w => w?.status === 'failed').length;
        const blockedCount = workerStatuses.filter(w => w?.status === 'blocked').length;

        // Find orchestrator (focus = 'orchestration')
        const orchestrator = members.find(m => m.focusArea === 'orchestration');
        const activeWorkers = members.filter(m => m.focusArea !== 'orchestration');

        // Get any unanswered questions
        const questions = shares.filter(s => s.shareType === 'question');
        const answers = shares.filter(s => s.shareType === 'answer');
        const answeredIds = new Set(answers.map(a => a.replyToId).filter(Boolean));
        const unansweredQuestions = questions.filter(q => !answeredIds.has(q.id));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              sprint: {
                id: sprint.id,
                taskId: sprint.taskId,
                goal: sprint.goal,
                status: sprint.status
              },
              orchestrator: orchestrator ? {
                agentId: orchestrator.agentId
              } : null,
              progress: {
                totalWorkers: workerStatuses.length + activeWorkers.length,
                completed: workerStatuses.length,
                success: successCount,
                failed: failedCount,
                blocked: blockedCount,
                active: activeWorkers.length
              },
              activeWorkers: activeWorkers.map(w => ({
                agentId: w.agentId,
                focus: w.focusArea,
                workingOn: w.workingOn
              })),
              completedWorkers: workerStatuses,
              issues: {
                hasFailures: failedCount > 0,
                hasBlocked: blockedCount > 0,
                unansweredQuestions: unansweredQuestions.length
              },
              hint: activeWorkers.length === 0 && workerStatuses.length > 0
                ? 'All workers complete. Review results and call scrum_sprint_complete if satisfied.'
                : `${activeWorkers.length} workers still active.`
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
