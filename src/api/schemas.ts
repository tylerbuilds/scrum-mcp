import { z } from 'zod';

export const TaskStatusEnum = z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']);
export const TaskPriorityEnum = z.enum(['critical', 'high', 'medium', 'low']);

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

export const IntentPostSchema = z.object({
  taskId: z.string().min(4),
  agentId: z.string().min(1).max(120),
  files: z.array(z.string().min(1)).min(1).max(200),
  boundaries: z.string().max(4000).optional(),
  acceptanceCriteria: z.string().min(10).max(4000)
});

export const ClaimCreateSchema = z.object({
  agentId: z.string().min(1).max(120),
  files: z.array(z.string().min(1)).min(1).max(200),
  ttlSeconds: z.coerce.number().int().positive().max(3600).default(900)
});

export const EvidenceAttachSchema = z.object({
  taskId: z.string().min(4),
  agentId: z.string().min(1).max(120),
  command: z.string().min(1).max(2000),
  output: z.string().min(0).max(500000)
});

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

export const BoardQuerySchema = z.object({
  assignedAgent: z.string().optional(),
  labels: z.string().optional() // comma-separated
});

// ==================== COMMENTS ====================

export const CommentAddSchema = z.object({
  taskId: z.string().min(4),
  agentId: z.string().min(1).max(120),
  content: z.string().min(1).max(10000)
});

export const CommentUpdateSchema = z.object({
  content: z.string().min(1).max(10000)
});

export const CommentListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional()
});

// ==================== BLOCKERS ====================

export const BlockerAddSchema = z.object({
  taskId: z.string().min(4),
  description: z.string().min(1).max(2000),
  blockingTaskId: z.string().min(4).optional(),
  createdBy: z.string().min(1).max(120)
});

export const BlockerQuerySchema = z.object({
  unresolvedOnly: z.coerce.boolean().optional()
});

// ==================== DEPENDENCIES ====================

export const DependencyAddSchema = z.object({
  taskId: z.string().min(4),
  dependsOnTaskId: z.string().min(4)
});

// ==================== WIP LIMITS ====================

export const WipLimitSetSchema = z.object({
  status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']),
  limit: z.number().int().min(1).max(100).nullable()
});

// ==================== METRICS ====================

export const MetricsQuerySchema = z.object({
  since: z.coerce.number().optional(),  // ms timestamp
  until: z.coerce.number().optional()
});

export const VelocityQuerySchema = z.object({
  periodDays: z.coerce.number().int().min(1).max(30).optional(),
  periods: z.coerce.number().int().min(1).max(12).optional()
});

export const AgingWipQuerySchema = z.object({
  thresholdDays: z.coerce.number().min(0.5).max(30).optional()
});
