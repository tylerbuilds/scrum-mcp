#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { loadConfig } from './core/config.js';
import { createLogger } from './core/logger.js';
import { openDb } from './infra/db.js';
import { ScrumState } from './core/state.js';

const cfg = loadConfig(process.env);
const log = createLogger({ ...cfg, SCRUM_LOG_LEVEL: 'silent' });
const db = openDb(cfg);
const state = new ScrumState(db, log);

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

// Tool input schemas
const TaskStatusSchema = z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']);
const TaskPrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);

const TaskCreateInput = z.object({
  title: z.string().min(1).max(200).describe('Task title'),
  description: z.string().max(2000).optional().describe('Task description'),
  status: TaskStatusSchema.optional().describe('Initial status (default: backlog)'),
  priority: TaskPrioritySchema.optional().describe('Priority level (default: medium)'),
  assignedAgent: z.string().max(120).optional().describe('Agent to assign'),
  dueDate: z.number().optional().describe('Due date as ms timestamp'),
  labels: z.array(z.string()).optional().describe('Labels/tags'),
  storyPoints: z.number().int().min(1).max(21).optional().describe('Story points (1,2,3,5,8,13)')
});

const TaskGetInput = z.object({
  taskId: z.string().min(4).describe('Task ID')
});

const TaskListInput = z.object({
  limit: z.number().int().min(1).max(200).default(50).optional().describe('Max tasks to return')
});

const IntentPostInput = z.object({
  taskId: z.string().min(4).describe('Task ID this intent belongs to'),
  agentId: z.string().min(1).max(120).describe('Your agent identifier'),
  files: z.array(z.string().min(1)).min(1).max(200).describe('Files you intend to modify'),
  boundaries: z.string().max(4000).optional().describe('What you promise NOT to change'),
  acceptanceCriteria: z.string().min(10).max(4000).describe('REQUIRED: How to verify the work is done (min 10 chars)')
});

const ClaimCreateInput = z.object({
  agentId: z.string().min(1).max(120).describe('Your agent identifier'),
  files: z.array(z.string().min(1)).min(1).max(200).describe('Files to claim exclusive access to'),
  ttlSeconds: z.number().int().min(5).max(3600).default(900).optional().describe('Claim duration in seconds')
});

const ClaimReleaseInput = z.object({
  agentId: z.string().min(1).max(120).describe('Your agent identifier'),
  files: z.array(z.string().min(1)).min(1).max(200).optional().describe('Files to release (all if omitted)')
});

const ClaimExtendInput = z.object({
  agentId: z.string().min(1).max(120).describe('Your agent identifier'),
  files: z.array(z.string().min(1)).min(1).max(200).optional().describe('Specific files to extend (all if omitted)'),
  additionalSeconds: z.number().int().min(30).max(3600).default(300).optional().describe('Additional seconds to add (default 300)')
});

const EvidenceAttachInput = z.object({
  taskId: z.string().min(4).describe('Task ID'),
  agentId: z.string().min(1).max(120).describe('Your agent identifier'),
  command: z.string().min(1).max(2000).describe('Command that was run'),
  output: z.string().min(0).max(500000).describe('Command output (stdout/stderr)')
});

const OverlapCheckInput = z.object({
  files: z.array(z.string().min(1)).min(1).max(200).describe('Files to check for overlaps')
});

const ChangelogLogInput = z.object({
  agentId: z.string().min(1).max(120).describe('Your agent identifier'),
  filePath: z.string().min(1).describe('File that was changed (or task:{taskId} for task events)'),
  changeType: z.enum([
    // File changes
    'create', 'modify', 'delete',
    // Task events
    'task_created', 'task_status_change', 'task_assigned', 'task_priority_change',
    'task_completed', 'blocker_added', 'blocker_resolved', 'dependency_added',
    'dependency_removed', 'comment_added'
  ]).describe('Type of change'),
  summary: z.string().min(1).max(500).describe('Brief description of what changed'),
  taskId: z.string().optional().describe('Associated task ID'),
  diffSnippet: z.string().max(5000).optional().describe('Key lines changed (optional)'),
  commitHash: z.string().max(100).optional().describe('Git commit hash if available')
});

const ChangelogSearchInput = z.object({
  filePath: z.string().optional().describe('Filter by file path (partial match, use task:{taskId} for task events)'),
  agentId: z.string().optional().describe('Filter by agent'),
  taskId: z.string().optional().describe('Filter by task'),
  changeType: z.enum([
    // File changes
    'create', 'modify', 'delete',
    // Task events
    'task_created', 'task_status_change', 'task_assigned', 'task_priority_change',
    'task_completed', 'blocker_added', 'blocker_resolved', 'dependency_added',
    'dependency_removed', 'comment_added'
  ]).optional().describe('Filter by change type'),
  query: z.string().optional().describe('Search in summary and diff'),
  since: z.number().optional().describe('Changes after this timestamp'),
  until: z.number().optional().describe('Changes before this timestamp'),
  limit: z.number().int().min(1).max(500).default(50).optional().describe('Max results')
});

const TaskUpdateInput = z.object({
  taskId: z.string().min(4).describe('Task ID to update'),
  status: TaskStatusSchema.optional().describe('New status'),
  priority: TaskPrioritySchema.optional().describe('Priority level'),
  assignedAgent: z.string().max(120).nullable().optional().describe('Agent to assign (null to unassign)'),
  dueDate: z.number().nullable().optional().describe('Due date as ms timestamp'),
  labels: z.array(z.string()).optional().describe('Labels/tags'),
  storyPoints: z.number().int().min(1).max(21).nullable().optional().describe('Story points (1,2,3,5,8,13)'),
  title: z.string().min(1).max(200).optional().describe('New title'),
  description: z.string().max(2000).nullable().optional().describe('New description')
});

const BoardInput = z.object({
  assignedAgent: z.string().optional().describe('Filter by assigned agent'),
  labels: z.array(z.string()).optional().describe('Filter by labels')
});

// ==================== COMMENTS ====================

const CommentAddInput = z.object({
  taskId: z.string().min(4).describe('Task ID to comment on'),
  agentId: z.string().min(1).max(120).describe('Your agent identifier'),
  content: z.string().min(1).max(10000).describe('Comment content (max 10000 chars)')
});

const CommentsListInput = z.object({
  taskId: z.string().min(4).describe('Task ID'),
  limit: z.number().int().min(1).max(500).default(50).optional().describe('Max comments to return (default 50)')
});

// ==================== BLOCKERS ====================

const BlockerAddInput = z.object({
  taskId: z.string().min(4).describe('Task ID that is blocked'),
  description: z.string().min(1).max(2000).describe('What is blocking this task'),
  blockingTaskId: z.string().min(4).optional().describe('Optional: Task ID that is causing the block'),
  createdBy: z.string().min(1).max(120).describe('Your agent identifier')
});

const BlockerResolveInput = z.object({
  blockerId: z.string().min(4).describe('Blocker ID to resolve')
});

const BlockersListInput = z.object({
  taskId: z.string().min(4).describe('Task ID'),
  unresolvedOnly: z.boolean().default(false).optional().describe('Only show unresolved blockers')
});

// ==================== DEPENDENCIES ====================

const DependencyAddInput = z.object({
  taskId: z.string().min(4).describe('Task that depends on another'),
  dependsOnTaskId: z.string().min(4).describe('Task that must complete first')
});

const DependencyRemoveInput = z.object({
  dependencyId: z.string().min(4).describe('Dependency ID to remove')
});

const DependenciesGetInput = z.object({
  taskId: z.string().min(4).describe('Task ID')
});

const TaskReadyInput = z.object({
  taskId: z.string().min(4).describe('Task ID to check')
});

// ==================== WIP LIMITS ====================

const WipLimitsSetInput = z.object({
  status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']).describe('Column to set limit for'),
  limit: z.number().int().min(1).max(100).nullable().optional().describe('Max tasks allowed (null to remove limit)')
});

// ==================== METRICS ====================

const MetricsInput = z.object({
  since: z.number().optional().describe('Start timestamp (ms), default 30 days ago'),
  until: z.number().optional().describe('End timestamp (ms), default now')
});

const VelocityInput = z.object({
  periodDays: z.number().int().min(1).max(30).optional().describe('Days per period (default 7)'),
  periods: z.number().int().min(1).max(12).optional().describe('Number of periods (default 4)')
});

const AgingWipInput = z.object({
  thresholdDays: z.number().min(0.5).max(30).optional().describe('Days threshold (default 2)')
});

const TaskMetricsInput = z.object({
  taskId: z.string().min(4).describe('Task ID')
});

// ==================== AGENT REGISTRY ====================

const AgentRegisterInput = z.object({
  agentId: z.string().min(1).max(120).describe('Your unique agent identifier'),
  capabilities: z.array(z.string()).min(1).max(20).describe('List of capabilities (e.g., ["code_review", "testing"])'),
  metadata: z.record(z.unknown()).optional().describe('Optional metadata (e.g., {"model": "claude-opus"})')
});

const AgentHeartbeatInput = z.object({
  agentId: z.string().min(1).max(120).describe('Your agent identifier')
});

// ==================== DEAD WORK DETECTION ====================

const DeadWorkInput = z.object({
  staleDays: z.number().min(0.5).max(30).optional().describe('Days threshold for staleness (default 1)')
});

// ==================== APPROVAL GATES ====================

const GateTypeSchema = z.enum(['lint', 'test', 'build', 'review', 'custom']);

const GateDefineInput = z.object({
  taskId: z.string().min(4).describe('Task ID to attach gate to'),
  gateType: GateTypeSchema.describe('Type of gate'),
  command: z.string().min(1).max(2000).describe('Command to run (e.g., "npm run lint")'),
  triggerStatus: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']).describe('Status that triggers this gate'),
  required: z.boolean().optional().describe('Must pass to transition (default true)')
});

const GateListInput = z.object({
  taskId: z.string().min(4).describe('Task ID')
});

const GateRunInput = z.object({
  gateId: z.string().min(4).describe('Gate ID'),
  taskId: z.string().min(4).describe('Task ID'),
  agentId: z.string().min(1).max(120).describe('Your agent identifier'),
  passed: z.boolean().describe('Whether the gate passed'),
  output: z.string().max(500000).optional().describe('Command output'),
  durationMs: z.number().optional().describe('Execution time in ms')
});

const GateStatusInput = z.object({
  taskId: z.string().min(4).describe('Task ID'),
  forStatus: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']).describe('Status to check gates for')
});

// ==================== TASK TEMPLATES ====================

const TemplateCreateInput = z.object({
  name: z.string().min(1).max(100).describe('Unique template name'),
  titlePattern: z.string().min(1).max(200).describe('Title pattern with {{placeholders}}'),
  descriptionTemplate: z.string().max(5000).optional().describe('Description template with {{placeholders}}'),
  defaultStatus: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']).optional().describe('Default status'),
  defaultPriority: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Default priority'),
  defaultLabels: z.array(z.string()).optional().describe('Default labels'),
  defaultStoryPoints: z.number().int().min(1).max(21).optional().describe('Default story points'),
  gates: z.array(z.object({
    gateType: GateTypeSchema,
    command: z.string(),
    triggerStatus: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done'])
  })).optional().describe('Pre-configured gates'),
  checklist: z.array(z.string()).optional().describe('Acceptance checklist items')
});

const TemplateGetInput = z.object({
  nameOrId: z.string().min(1).describe('Template name or ID')
});

const TaskFromTemplateInput = z.object({
  template: z.string().min(1).describe('Template name or ID'),
  variables: z.record(z.string()).describe('Variable substitutions (e.g., {"issue": "Bug in login"})'),
  overrides: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
    priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    assignedAgent: z.string().optional(),
    labels: z.array(z.string()).optional(),
    storyPoints: z.number().optional()
  }).optional().describe('Override template defaults')
});

// ==================== WEBHOOKS ====================

const WebhookEventTypeSchema = z.enum([
  'task.created', 'task.updated', 'task.completed',
  'intent.posted', 'claim.created', 'claim.conflict', 'claim.released',
  'evidence.attached', 'gate.passed', 'gate.failed'
]);

const WebhookRegisterInput = z.object({
  name: z.string().min(1).max(100).describe('Webhook name'),
  url: z.string().url().describe('Webhook URL'),
  events: z.array(WebhookEventTypeSchema).min(1).describe('Events to subscribe to'),
  headers: z.record(z.string()).optional().describe('Custom headers'),
  secret: z.string().optional().describe('Secret for HMAC signing')
});

const WebhookUpdateInput = z.object({
  webhookId: z.string().min(4).describe('Webhook ID'),
  url: z.string().url().optional().describe('New URL'),
  events: z.array(WebhookEventTypeSchema).optional().describe('New events'),
  headers: z.record(z.string()).optional().describe('New headers'),
  enabled: z.boolean().optional().describe('Enable/disable webhook')
});

const WebhookDeleteInput = z.object({
  webhookId: z.string().min(4).describe('Webhook ID to delete')
});

const WebhookDeliveriesInput = z.object({
  webhookId: z.string().min(4).describe('Webhook ID'),
  limit: z.number().int().min(1).max(100).optional().describe('Max deliveries (default 50)')
});

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
            createdBy: { type: 'string', description: 'Your agent identifier' }
          },
          required: ['taskId', 'description', 'createdBy']
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
        const input = TaskCreateInput.parse(args);
        const task = state.createTask(input.title, input.description, {
          status: input.status,
          priority: input.priority,
          assignedAgent: input.assignedAgent,
          dueDate: input.dueDate,
          labels: input.labels,
          storyPoints: input.storyPoints
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(task, null, 2) }]
        };
      }

      case 'scrum_task_get': {
        const input = TaskGetInput.parse(args);
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
        const input = TaskListInput.parse(args ?? {});
        const tasks = state.listTasks(input.limit ?? 50);
        return {
          content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }]
        };
      }

      case 'scrum_intent_post': {
        const input = IntentPostInput.parse(args);
        const intent = state.postIntent(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(intent, null, 2) }]
        };
      }

      case 'scrum_claim': {
        const input = ClaimCreateInput.parse(args);

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
        const input = ClaimReleaseInput.parse(args);

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
        const input = ClaimExtendInput.parse(args);
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
        const input = EvidenceAttachInput.parse(args);
        const evidence = state.attachEvidence(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(evidence, null, 2) }]
        };
      }

      case 'scrum_overlap_check': {
        const input = OverlapCheckInput.parse(args);
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
        const input = ChangelogLogInput.parse(args);
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
        const input = ChangelogSearchInput.parse(args ?? {});
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
        const input = TaskUpdateInput.parse(args);
        const { taskId, ...updates } = input;
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
        const input = BoardInput.parse(args ?? {});
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
        const input = CommentAddInput.parse(args);
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
        const input = CommentsListInput.parse(args);
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
        const input = BlockerAddInput.parse(args);
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
        const input = BlockerResolveInput.parse(args);
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
        const input = BlockersListInput.parse(args);
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
        const input = DependencyAddInput.parse(args);
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
        const input = DependencyRemoveInput.parse(args);
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
        const input = DependenciesGetInput.parse(args);
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
        const input = TaskReadyInput.parse(args);
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
        const input = WipLimitsSetInput.parse(args);
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
        const input = MetricsInput.parse(args ?? {});
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
        const input = VelocityInput.parse(args ?? {});
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
        const input = AgingWipInput.parse(args ?? {});
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
        const input = TaskMetricsInput.parse(args);
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
        const input = AgentRegisterInput.parse(args);
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
        const input = z.object({
          includeOffline: z.boolean().optional()
        }).parse(args ?? {});
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
        const input = AgentHeartbeatInput.parse(args);
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
        const input = DeadWorkInput.parse(args ?? {});
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
        const input = GateDefineInput.parse(args);
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
        const input = GateListInput.parse(args);
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
        const input = GateRunInput.parse(args);
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
        const input = GateStatusInput.parse(args);
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
        const input = TemplateCreateInput.parse(args);
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
        const input = TemplateGetInput.parse(args);
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
        const input = TaskFromTemplateInput.parse(args);
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
        const input = WebhookRegisterInput.parse(args);
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
        const input = z.object({
          enabledOnly: z.boolean().optional()
        }).parse(args ?? {});
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
        const input = WebhookUpdateInput.parse(args);
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
        const input = WebhookDeleteInput.parse(args);
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
        const input = WebhookDeliveriesInput.parse(args);
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
