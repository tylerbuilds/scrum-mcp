import { z } from 'zod';

// ==================== COMMON ENUMS ====================

export const TaskStatusEnum = z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatusEnum>;

export const TaskStatusEnumWithoutCancelled = z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']);
export type TaskStatusWithoutCancelled = z.infer<typeof TaskStatusEnumWithoutCancelled>;

export const TaskPriorityEnum = z.enum(['critical', 'high', 'medium', 'low']);
export type TaskPriority = z.infer<typeof TaskPriorityEnum>;

export const GateTypeEnum = z.enum(['lint', 'test', 'build', 'review', 'custom']);
export type GateType = z.infer<typeof GateTypeEnum>;

export const ChangeTypeEnum = z.enum([
  // File changes
  'create', 'modify', 'delete',
  // Task events
  'task_created', 'task_status_change', 'task_assigned', 'task_priority_change',
  'task_completed', 'blocker_added', 'blocker_resolved', 'dependency_added',
  'dependency_removed', 'comment_added'
]);
export type ChangeType = z.infer<typeof ChangeTypeEnum>;

export const WebhookEventTypeEnum = z.enum([
  'task.created', 'task.updated', 'task.completed',
  'intent.posted', 'claim.created', 'claim.conflict', 'claim.released',
  'evidence.attached', 'gate.passed', 'gate.failed'
]);
export type WebhookEventType = z.infer<typeof WebhookEventTypeEnum>;

// ==================== COMMON FIELD SCHEMAS ====================

export const AgentIdField = z.string().min(1).max(120);
export const TaskIdField = z.string().min(4);
export const FilesArrayField = z.array(z.string().min(1)).min(1).max(200);

// ==================== TASK SCHEMAS ====================

export const TaskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: TaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  assignedAgent: z.string().max(120).nullable().optional(),
  dueDate: z.number().nullable().optional(),
  labels: z.array(z.string()).optional(),
  storyPoints: z.number().int().min(1).max(21).nullable().optional()
});
export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;

export const TaskGetSchema = z.object({
  taskId: TaskIdField
});
export type TaskGetInput = z.infer<typeof TaskGetSchema>;

export const TaskListSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50).optional()
});
export type TaskListInput = z.infer<typeof TaskListSchema>;

export const TaskListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
});
export type TaskListQueryInput = z.infer<typeof TaskListQuerySchema>;

export const TaskIdParamsSchema = z.object({
  id: TaskIdField
});
export type TaskIdParams = z.infer<typeof TaskIdParamsSchema>;

export const TaskUpdateSchema = z.object({
  status: TaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  assignedAgent: z.string().max(120).nullable().optional(),
  dueDate: z.number().nullable().optional(),
  labels: z.array(z.string()).optional(),
  storyPoints: z.number().int().min(1).max(21).nullable().optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional()
});
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;

export const TaskUpdateWithIdSchema = TaskUpdateSchema.extend({
  taskId: TaskIdField
});
export type TaskUpdateWithIdInput = z.infer<typeof TaskUpdateWithIdSchema>;

export const BoardQuerySchema = z.object({
  assignedAgent: z.string().optional(),
  labels: z.string().optional() // comma-separated for query params
});
export type BoardQueryInput = z.infer<typeof BoardQuerySchema>;

export const BoardInputSchema = z.object({
  assignedAgent: z.string().optional(),
  labels: z.array(z.string()).optional() // array for MCP
});
export type BoardInput = z.infer<typeof BoardInputSchema>;

export const TaskReadySchema = z.object({
  taskId: TaskIdField
});
export type TaskReadyInput = z.infer<typeof TaskReadySchema>;

// ==================== INTENT SCHEMAS ====================

export const IntentPostSchema = z.object({
  taskId: TaskIdField,
  agentId: AgentIdField,
  files: FilesArrayField,
  boundaries: z.string().max(4000).optional(),
  acceptanceCriteria: z.string().min(10).max(4000)
});
export type IntentPostInput = z.infer<typeof IntentPostSchema>;

// ==================== CLAIM SCHEMAS ====================

export const ClaimCreateSchema = z.object({
  agentId: AgentIdField,
  files: FilesArrayField,
  ttlSeconds: z.coerce.number().int().positive().max(3600).default(900)
});
export type ClaimCreateInput = z.infer<typeof ClaimCreateSchema>;

export const ClaimCreateMcpSchema = z.object({
  agentId: AgentIdField,
  files: FilesArrayField,
  ttlSeconds: z.number().int().min(5).max(3600).default(900).optional()
});
export type ClaimCreateMcpInput = z.infer<typeof ClaimCreateMcpSchema>;

export const ClaimReleaseSchema = z.object({
  agentId: AgentIdField,
  files: z.array(z.string().min(1)).min(1).max(200).optional()
});
export type ClaimReleaseInput = z.infer<typeof ClaimReleaseSchema>;

export const ClaimExtendSchema = z.object({
  agentId: AgentIdField,
  files: z.array(z.string().min(1)).min(1).max(200).optional(),
  additionalSeconds: z.number().int().min(30).max(3600).default(300).optional()
});
export type ClaimExtendInput = z.infer<typeof ClaimExtendSchema>;

export const ClaimExtendRestSchema = z.object({
  agentId: AgentIdField,
  files: z.array(z.string().min(1)).min(1).max(200).optional(),
  additionalSeconds: z.coerce.number().int().min(30).max(3600).default(300)
});
export type ClaimExtendRestInput = z.infer<typeof ClaimExtendRestSchema>;

// ==================== EVIDENCE SCHEMAS ====================

export const EvidenceAttachSchema = z.object({
  taskId: TaskIdField,
  agentId: AgentIdField,
  command: z.string().min(1).max(2000),
  output: z.string().min(0).max(500000)
});
export type EvidenceAttachInput = z.infer<typeof EvidenceAttachSchema>;

// ==================== OVERLAP CHECK SCHEMAS ====================

export const OverlapCheckSchema = z.object({
  files: FilesArrayField
});
export type OverlapCheckInput = z.infer<typeof OverlapCheckSchema>;

// ==================== CHANGELOG SCHEMAS ====================

export const ChangelogLogSchema = z.object({
  agentId: AgentIdField,
  filePath: z.string().min(1),
  changeType: ChangeTypeEnum,
  summary: z.string().min(1).max(500),
  taskId: z.string().optional(),
  diffSnippet: z.string().max(5000).optional(),
  commitHash: z.string().max(100).optional()
});
export type ChangelogLogInput = z.infer<typeof ChangelogLogSchema>;

export const ChangelogSearchSchema = z.object({
  filePath: z.string().optional(),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  changeType: ChangeTypeEnum.optional(),
  query: z.string().optional(),
  since: z.number().optional(),
  until: z.number().optional(),
  limit: z.number().int().min(1).max(500).default(50).optional()
});
export type ChangelogSearchInput = z.infer<typeof ChangelogSearchSchema>;

// ==================== COMMENT SCHEMAS ====================

export const CommentAddSchema = z.object({
  taskId: TaskIdField,
  agentId: AgentIdField,
  content: z.string().min(1).max(10000)
});
export type CommentAddInput = z.infer<typeof CommentAddSchema>;

export const CommentUpdateSchema = z.object({
  content: z.string().min(1).max(10000)
});
export type CommentUpdateInput = z.infer<typeof CommentUpdateSchema>;

export const CommentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional()
});
export type CommentListQueryInput = z.infer<typeof CommentListQuerySchema>;

export const CommentsListMcpSchema = z.object({
  taskId: TaskIdField,
  limit: z.number().int().min(1).max(500).default(50).optional()
});
export type CommentsListMcpInput = z.infer<typeof CommentsListMcpSchema>;

export const CommentIdParamsSchema = z.object({
  id: z.string().min(4)
});
export type CommentIdParams = z.infer<typeof CommentIdParamsSchema>;

// ==================== BLOCKER SCHEMAS ====================

export const BlockerAddSchema = z.object({
  taskId: TaskIdField,
  description: z.string().min(1).max(2000),
  blockingTaskId: z.string().min(4).optional(),
  agentId: AgentIdField
});
export type BlockerAddInput = z.infer<typeof BlockerAddSchema>;

export const BlockerResolveSchema = z.object({
  blockerId: z.string().min(4)
});
export type BlockerResolveInput = z.infer<typeof BlockerResolveSchema>;

export const BlockerQuerySchema = z.object({
  unresolvedOnly: z.coerce.boolean().optional()
});
export type BlockerQueryInput = z.infer<typeof BlockerQuerySchema>;

export const BlockersListMcpSchema = z.object({
  taskId: TaskIdField,
  unresolvedOnly: z.boolean().default(false).optional()
});
export type BlockersListMcpInput = z.infer<typeof BlockersListMcpSchema>;

export const BlockerIdParamsSchema = z.object({
  id: z.string().min(4)
});
export type BlockerIdParams = z.infer<typeof BlockerIdParamsSchema>;

// ==================== DEPENDENCY SCHEMAS ====================

export const DependencyAddSchema = z.object({
  taskId: TaskIdField,
  dependsOnTaskId: TaskIdField
});
export type DependencyAddInput = z.infer<typeof DependencyAddSchema>;

export const DependencyAddBodySchema = z.object({
  dependsOnTaskId: TaskIdField
});
export type DependencyAddBodyInput = z.infer<typeof DependencyAddBodySchema>;

export const DependencyRemoveSchema = z.object({
  dependencyId: z.string().min(4)
});
export type DependencyRemoveInput = z.infer<typeof DependencyRemoveSchema>;

export const DependenciesGetSchema = z.object({
  taskId: TaskIdField
});
export type DependenciesGetInput = z.infer<typeof DependenciesGetSchema>;

export const DependencyIdParamsSchema = z.object({
  id: z.string().min(4)
});
export type DependencyIdParams = z.infer<typeof DependencyIdParamsSchema>;

// ==================== WIP LIMITS SCHEMAS ====================

export const WipLimitSetSchema = z.object({
  status: TaskStatusEnumWithoutCancelled,
  limit: z.number().int().min(1).max(100).nullable()
});
export type WipLimitSetInput = z.infer<typeof WipLimitSetSchema>;

export const WipLimitsSetMcpSchema = z.object({
  status: TaskStatusEnumWithoutCancelled,
  limit: z.number().int().min(1).max(100).nullable().optional()
});
export type WipLimitsSetMcpInput = z.infer<typeof WipLimitsSetMcpSchema>;

// ==================== METRICS SCHEMAS ====================

export const MetricsQuerySchema = z.object({
  since: z.coerce.number().optional(),  // ms timestamp
  until: z.coerce.number().optional()
});
export type MetricsQueryInput = z.infer<typeof MetricsQuerySchema>;

export const MetricsMcpSchema = z.object({
  since: z.number().optional(),
  until: z.number().optional()
});
export type MetricsMcpInput = z.infer<typeof MetricsMcpSchema>;

export const VelocityQuerySchema = z.object({
  periodDays: z.coerce.number().int().min(1).max(30).optional(),
  periods: z.coerce.number().int().min(1).max(12).optional()
});
export type VelocityQueryInput = z.infer<typeof VelocityQuerySchema>;

export const VelocityMcpSchema = z.object({
  periodDays: z.number().int().min(1).max(30).optional(),
  periods: z.number().int().min(1).max(12).optional()
});
export type VelocityMcpInput = z.infer<typeof VelocityMcpSchema>;

export const AgingWipQuerySchema = z.object({
  thresholdDays: z.coerce.number().min(0.5).max(30).optional()
});
export type AgingWipQueryInput = z.infer<typeof AgingWipQuerySchema>;

export const AgingWipMcpSchema = z.object({
  thresholdDays: z.number().min(0.5).max(30).optional()
});
export type AgingWipMcpInput = z.infer<typeof AgingWipMcpSchema>;

export const TaskMetricsSchema = z.object({
  taskId: TaskIdField
});
export type TaskMetricsInput = z.infer<typeof TaskMetricsSchema>;

// ==================== AGENT REGISTRY SCHEMAS ====================

export const AgentRegisterSchema = z.object({
  agentId: AgentIdField,
  capabilities: z.array(z.string()).min(1).max(20),
  metadata: z.record(z.unknown()).optional()
});
export type AgentRegisterInput = z.infer<typeof AgentRegisterSchema>;

export const AgentHeartbeatSchema = z.object({
  agentId: AgentIdField
});
export type AgentHeartbeatInput = z.infer<typeof AgentHeartbeatSchema>;

export const AgentsListQuerySchema = z.object({
  includeOffline: z.coerce.boolean().optional()
});
export type AgentsListQueryInput = z.infer<typeof AgentsListQuerySchema>;

export const AgentsListMcpSchema = z.object({
  includeOffline: z.boolean().optional()
});
export type AgentsListMcpInput = z.infer<typeof AgentsListMcpSchema>;

// ==================== DEAD WORK SCHEMAS ====================

export const DeadWorkQuerySchema = z.object({
  staleDays: z.coerce.number().min(0.5).max(30).optional()
});
export type DeadWorkQueryInput = z.infer<typeof DeadWorkQuerySchema>;

export const DeadWorkMcpSchema = z.object({
  staleDays: z.number().min(0.5).max(30).optional()
});
export type DeadWorkMcpInput = z.infer<typeof DeadWorkMcpSchema>;

// ==================== GATE SCHEMAS ====================

export const GateDefineSchema = z.object({
  taskId: TaskIdField,
  gateType: GateTypeEnum,
  command: z.string().min(1).max(2000),
  triggerStatus: TaskStatusEnumWithoutCancelled,
  required: z.boolean().optional()
});
export type GateDefineInput = z.infer<typeof GateDefineSchema>;

export const GateDefineRestSchema = z.object({
  gateType: GateTypeEnum,
  command: z.string().min(1).max(2000),
  triggerStatus: TaskStatusEnumWithoutCancelled,
  required: z.boolean().optional()
});
export type GateDefineRestInput = z.infer<typeof GateDefineRestSchema>;

export const GateListSchema = z.object({
  taskId: TaskIdField
});
export type GateListInput = z.infer<typeof GateListSchema>;

export const GateRunSchema = z.object({
  gateId: z.string().min(4),
  taskId: TaskIdField,
  agentId: AgentIdField,
  passed: z.boolean(),
  output: z.string().max(500000).optional(),
  durationMs: z.number().optional()
});
export type GateRunInput = z.infer<typeof GateRunSchema>;

export const GateRunRestSchema = z.object({
  agentId: AgentIdField,
  passed: z.boolean(),
  output: z.string().max(500000).optional(),
  durationMs: z.number().optional()
});
export type GateRunRestInput = z.infer<typeof GateRunRestSchema>;

export const GateStatusSchema = z.object({
  taskId: TaskIdField,
  forStatus: TaskStatusEnumWithoutCancelled
});
export type GateStatusInput = z.infer<typeof GateStatusSchema>;

export const GateIdParamsSchema = z.object({
  gateId: z.string().min(4)
});
export type GateIdParams = z.infer<typeof GateIdParamsSchema>;

// ==================== TEMPLATE SCHEMAS ====================

export const TemplateGateSchema = z.object({
  gateType: GateTypeEnum,
  command: z.string(),
  triggerStatus: TaskStatusEnumWithoutCancelled
});
export type TemplateGate = z.infer<typeof TemplateGateSchema>;

export const TemplateCreateSchema = z.object({
  name: z.string().min(1).max(100),
  titlePattern: z.string().min(1).max(200),
  descriptionTemplate: z.string().max(5000).optional(),
  defaultStatus: TaskStatusEnumWithoutCancelled.optional(),
  defaultPriority: TaskPriorityEnum.optional(),
  defaultLabels: z.array(z.string()).optional(),
  defaultStoryPoints: z.number().int().min(1).max(21).optional(),
  gates: z.array(TemplateGateSchema).optional(),
  checklist: z.array(z.string()).optional()
});
export type TemplateCreateInput = z.infer<typeof TemplateCreateSchema>;

export const TemplateGetSchema = z.object({
  nameOrId: z.string().min(1)
});
export type TemplateGetInput = z.infer<typeof TemplateGetSchema>;

export const TemplateIdParamsSchema = z.object({
  nameOrId: z.string().min(1)
});
export type TemplateIdParams = z.infer<typeof TemplateIdParamsSchema>;

export const TaskFromTemplateOverridesSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: TaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  assignedAgent: z.string().optional(),
  labels: z.array(z.string()).optional(),
  storyPoints: z.number().optional()
});
export type TaskFromTemplateOverrides = z.infer<typeof TaskFromTemplateOverridesSchema>;

export const TaskFromTemplateSchema = z.object({
  template: z.string().min(1),
  variables: z.record(z.string()),
  overrides: TaskFromTemplateOverridesSchema.optional()
});
export type TaskFromTemplateInput = z.infer<typeof TaskFromTemplateSchema>;

export const TaskFromTemplateRestSchema = z.object({
  variables: z.record(z.string()),
  overrides: TaskFromTemplateOverridesSchema.optional()
});
export type TaskFromTemplateRestInput = z.infer<typeof TaskFromTemplateRestSchema>;

// ==================== WEBHOOK SCHEMAS ====================

// Private/internal IP patterns for SSRF protection
const PRIVATE_IP_PATTERNS = [
  /^https?:\/\/localhost(:|\/|$)/i,
  /^https?:\/\/127\.\d+\.\d+\.\d+/i,
  /^https?:\/\/\[?::1\]?(:|\/|$)/i,
  /^https?:\/\/10\.\d+\.\d+\.\d+/i,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/i,
  /^https?:\/\/192\.168\.\d+\.\d+/i,
  /^https?:\/\/169\.254\.\d+\.\d+/i,
  /^https?:\/\/0\.0\.0\.0/i,
];

export const SafeWebhookUrlSchema = z.string().url().refine(
  (url) => {
    // Must be HTTPS
    if (!url.startsWith('https://')) {
      return false;
    }
    // Must not be a private IP
    return !PRIVATE_IP_PATTERNS.some(pattern => pattern.test(url));
  },
  { message: 'Webhook URL must use HTTPS and cannot point to private/internal addresses' }
);

export const WebhookRegisterSchema = z.object({
  name: z.string().min(1).max(100),
  url: SafeWebhookUrlSchema,
  events: z.array(WebhookEventTypeEnum).min(1),
  headers: z.record(z.string()).optional(),
  secret: z.string().optional()
});
export type WebhookRegisterInput = z.infer<typeof WebhookRegisterSchema>;

export const WebhookUpdateSchema = z.object({
  webhookId: z.string().min(4),
  url: SafeWebhookUrlSchema.optional(),
  events: z.array(WebhookEventTypeEnum).optional(),
  headers: z.record(z.string()).optional(),
  enabled: z.boolean().optional()
});
export type WebhookUpdateInput = z.infer<typeof WebhookUpdateSchema>;

export const WebhookUpdateRestSchema = z.object({
  url: SafeWebhookUrlSchema.optional(),
  events: z.array(WebhookEventTypeEnum).optional(),
  headers: z.record(z.string()).optional(),
  enabled: z.boolean().optional()
});
export type WebhookUpdateRestInput = z.infer<typeof WebhookUpdateRestSchema>;

export const WebhookDeleteSchema = z.object({
  webhookId: z.string().min(4)
});
export type WebhookDeleteInput = z.infer<typeof WebhookDeleteSchema>;

export const WebhookDeliveriesSchema = z.object({
  webhookId: z.string().min(4),
  limit: z.number().int().min(1).max(100).optional()
});
export type WebhookDeliveriesInput = z.infer<typeof WebhookDeliveriesSchema>;

export const WebhookIdParamsSchema = z.object({
  webhookId: z.string().min(4)
});
export type WebhookIdParams = z.infer<typeof WebhookIdParamsSchema>;

export const WebhooksListQuerySchema = z.object({
  enabledOnly: z.coerce.boolean().optional()
});
export type WebhooksListQueryInput = z.infer<typeof WebhooksListQuerySchema>;

export const WebhooksListMcpSchema = z.object({
  enabledOnly: z.boolean().optional()
});
export type WebhooksListMcpInput = z.infer<typeof WebhooksListMcpSchema>;

// ==================== COMPLIANCE SCHEMAS ====================

export const ComplianceCheckSchema = z.object({
  taskId: TaskIdField,
  agentId: AgentIdField
});
export type ComplianceCheckInput = z.infer<typeof ComplianceCheckSchema>;

export const ComplianceTaskParamsSchema = z.object({
  taskId: TaskIdField
});
export type ComplianceTaskParams = z.infer<typeof ComplianceTaskParamsSchema>;

export const ComplianceAgentParamsSchema = z.object({
  taskId: TaskIdField,
  agentId: AgentIdField
});
export type ComplianceAgentParams = z.infer<typeof ComplianceAgentParamsSchema>;

// ==================== SPRINT SCHEMAS ====================

export const SprintStatusEnum = z.enum(['active', 'completed', 'abandoned']);
export type SprintStatusInput = z.infer<typeof SprintStatusEnum>;

export const ShareTypeEnum = z.enum([
  'context',
  'decision',
  'interface',
  'discovery',
  'integration',
  'question',
  'answer'
]);
export type ShareTypeInput = z.infer<typeof ShareTypeEnum>;

export const SprintCreateSchema = z.object({
  taskId: TaskIdField,
  name: z.string().max(200).optional(),
  goal: z.string().max(2000).optional()
});
export type SprintCreateInput = z.infer<typeof SprintCreateSchema>;

export const SprintGetSchema = z.object({
  sprintId: z.string().min(4)
});
export type SprintGetInput = z.infer<typeof SprintGetSchema>;

export const SprintForTaskSchema = z.object({
  taskId: TaskIdField
});
export type SprintForTaskInput = z.infer<typeof SprintForTaskSchema>;

export const SprintListSchema = z.object({
  taskId: TaskIdField.optional(),
  status: SprintStatusEnum.optional()
});
export type SprintListInput = z.infer<typeof SprintListSchema>;

export const SprintJoinSchema = z.object({
  sprintId: z.string().min(4),
  agentId: AgentIdField,
  workingOn: z.string().min(1).max(500),
  focusArea: z.string().max(100).optional()
});
export type SprintJoinInput = z.infer<typeof SprintJoinSchema>;

export const SprintLeaveSchema = z.object({
  sprintId: z.string().min(4),
  agentId: AgentIdField
});
export type SprintLeaveInput = z.infer<typeof SprintLeaveSchema>;

export const SprintMembersSchema = z.object({
  sprintId: z.string().min(4)
});
export type SprintMembersInput = z.infer<typeof SprintMembersSchema>;

export const SprintShareSchema = z.object({
  sprintId: z.string().min(4),
  agentId: AgentIdField,
  shareType: ShareTypeEnum,
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  relatedFiles: z.array(z.string()).optional(),
  replyToId: z.string().optional()
});
export type SprintShareInput = z.infer<typeof SprintShareSchema>;

export const SprintSharesSchema = z.object({
  sprintId: z.string().min(4),
  shareType: ShareTypeEnum.optional(),
  limit: z.number().int().min(1).max(500).optional()
});
export type SprintSharesInput = z.infer<typeof SprintSharesSchema>;

export const SprintContextSchema = z.object({
  sprintId: z.string().min(4)
});
export type SprintContextInput = z.infer<typeof SprintContextSchema>;

export const SprintCheckSchema = z.object({
  sprintId: z.string().min(4),
  agentId: AgentIdField,
  focusArea: z.string().optional()
});
export type SprintCheckInput = z.infer<typeof SprintCheckSchema>;

// REST-specific Sprint schemas
export const SprintIdParamsSchema = z.object({
  sprintId: z.string().min(4)
});
export type SprintIdParams = z.infer<typeof SprintIdParamsSchema>;

export const SprintListQuerySchema = z.object({
  taskId: z.string().optional(),
  status: SprintStatusEnum.optional()
});
export type SprintListQueryInput = z.infer<typeof SprintListQuerySchema>;

export const SprintSharesQuerySchema = z.object({
  shareType: ShareTypeEnum.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional()
});
export type SprintSharesQueryInput = z.infer<typeof SprintSharesQuerySchema>;

export const SprintJoinRestSchema = z.object({
  agentId: AgentIdField,
  workingOn: z.string().min(1).max(500),
  focusArea: z.string().max(100).optional()
});
export type SprintJoinRestInput = z.infer<typeof SprintJoinRestSchema>;

export const SprintLeaveRestSchema = z.object({
  agentId: AgentIdField
});
export type SprintLeaveRestInput = z.infer<typeof SprintLeaveRestSchema>;

export const SprintShareRestSchema = z.object({
  agentId: AgentIdField,
  shareType: ShareTypeEnum,
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  relatedFiles: z.array(z.string()).optional(),
  replyToId: z.string().optional()
});
export type SprintShareRestInput = z.infer<typeof SprintShareRestSchema>;

// ==================== MISC QUERY SCHEMAS ====================

export const FeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional()
});
export type FeedQueryInput = z.infer<typeof FeedQuerySchema>;

export const LimitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional()
});
export type LimitQueryInput = z.infer<typeof LimitQuerySchema>;

// Legacy aliases for backward compatibility
export const CommentListQuery = CommentListQuerySchema;
