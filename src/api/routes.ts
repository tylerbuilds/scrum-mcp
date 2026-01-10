import type { FastifyInstance, FastifyRequest } from 'fastify';
import { TaskCreateSchema, IntentPostSchema, ClaimCreateSchema, EvidenceAttachSchema, TaskUpdateSchema, BoardQuerySchema, CommentAddSchema, CommentUpdateSchema, CommentListQuery, BlockerAddSchema, BlockerQuerySchema, DependencyAddSchema, WipLimitSetSchema, MetricsQuerySchema, VelocityQuerySchema, AgingWipQuerySchema } from './schemas';
import type { ScrumState } from '../core/state';
import { z } from 'zod';

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function bad(message: string) {
  return { ok: false as const, error: message };
}

// Query/Param schemas
const TaskListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
});

const TaskIdParams = z.object({
  id: z.string().min(4)
});

const ClaimReleaseSchema = z.object({
  agentId: z.string().min(1).max(120),
  files: z.array(z.string().min(1)).optional()
});

const FeedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional()
});

const CommentIdParams = z.object({
  id: z.string().min(4)
});

const BlockerIdParams = z.object({
  id: z.string().min(4)
});

const DependencyIdParams = z.object({
  id: z.string().min(4)
});

const DependencyAddBody = z.object({
  dependsOnTaskId: z.string().min(4)
});

export async function registerRoutes(app: FastifyInstance, state: ScrumState) {
  // Enable CORS for frontend
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') {
      return reply.status(204).send();
    }
  });

  app.get('/api/status', async () => ok(state.status()));

  app.get('/api/feed', async (req, reply) => {
    const parsed = FeedQuery.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    return ok(state.getFeed(parsed.data.limit ?? 100));
  });

  app.get('/api/agents', async () => ok({ agents: state.getAgents() }));

  app.post('/api/tasks', async (req, reply) => {
    const parsed = TaskCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const { title, description, ...options } = parsed.data;
    const t = state.createTask(title, description, {
      status: options.status,
      priority: options.priority,
      assignedAgent: options.assignedAgent ?? undefined,
      dueDate: options.dueDate ?? undefined,
      labels: options.labels,
      storyPoints: options.storyPoints ?? undefined
    });
    return ok(t);
  });

  app.get('/api/tasks', async (req, reply) => {
    const parsed = TaskListQuery.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    return ok(state.listTasks(parsed.data.limit ?? 50));
  });

  app.get('/api/tasks/:id', async (req, reply) => {
    const parsed = TaskIdParams.safeParse(req.params);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const task = state.getTask(parsed.data.id);
    if (!task) return reply.status(404).send(bad('Task not found'));
    return ok({
      task,
      intents: state.listIntents(parsed.data.id),
      evidence: state.listEvidence(parsed.data.id),
      comments: state.listComments(parsed.data.id),
      blockers: state.listBlockers(parsed.data.id),
      unresolvedBlockersCount: state.getUnresolvedBlockersCount(parsed.data.id),
      dependencies: state.getDependencies(parsed.data.id),
      readiness: state.isTaskReady(parsed.data.id)
    });
  });

  app.patch('/api/tasks/:id', async (req, reply) => {
    const paramsParsed = TaskIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = TaskUpdateSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    try {
      const task = state.updateTask(paramsParsed.data.id, bodyParsed.data);
      return ok(task);
    } catch (e: any) {
      if (e?.message?.includes('Unknown taskId')) {
        return reply.status(404).send(bad('Task not found'));
      }
      return reply.status(400).send(bad(e?.message ?? 'Failed to update task'));
    }
  });

  app.get('/api/board', async (req, reply) => {
    const parsed = BoardQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const filters = {
      assignedAgent: parsed.data.assignedAgent,
      labels: parsed.data.labels ? parsed.data.labels.split(',').map(l => l.trim()).filter(Boolean) : undefined
    };
    const board = state.getBoard(filters);
    return ok(board);
  });

  app.post('/api/intents', async (req, reply) => {
    const parsed = IntentPostSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    try {
      const intent = state.postIntent(parsed.data);
      return ok(intent);
    } catch (e: any) {
      return reply.status(400).send(bad(e?.message ?? 'Failed to post intent'));
    }
  });

  app.post('/api/claims', async (req, reply) => {
    const parsed = ClaimCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));

    // ENFORCEMENT: Must have declared intent for these files first
    const intentCheck = state.hasIntentForFiles(parsed.data.agentId, parsed.data.files);
    if (!intentCheck.hasIntent) {
      return reply.status(403).send(bad(
        `You must post an intent before claiming files. Missing intent for: ${intentCheck.missingFiles.join(', ')}`
      ));
    }

    const { claim, conflictsWith } = state.createClaim(parsed.data.agentId, parsed.data.files, parsed.data.ttlSeconds);
    if (conflictsWith.length > 0) {
      return reply.status(409).send(bad(
        `Files already claimed by: ${conflictsWith.join(', ')}`
      ));
    }

    return ok({ claim, conflictsWith: [] });
  });

  app.get('/api/claims', async () => ok(state.listActiveClaims()));

  app.delete('/api/claims', async (req, reply) => {
    const parsed = ClaimReleaseSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));

    // ENFORCEMENT: Must have attached evidence before releasing claims
    const activeClaims = state.getAgentClaims(parsed.data.agentId);
    if (activeClaims.length > 0) {
      const evidenceCheck = state.hasEvidenceForTask(parsed.data.agentId);
      if (!evidenceCheck.hasEvidence) {
        return reply.status(403).send(bad(
          'You must attach evidence (POST /api/evidence) proving your work before releasing claims. No receipts = no release.'
        ));
      }
    }

    const released = state.releaseClaims(parsed.data.agentId, parsed.data.files);
    return ok({ released, agentId: parsed.data.agentId });
  });

  app.post('/api/evidence', async (req, reply) => {
    const parsed = EvidenceAttachSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    try {
      const ev = state.attachEvidence(parsed.data);
      return ok(ev);
    } catch (e: any) {
      return reply.status(400).send(bad(e?.message ?? 'Failed to attach evidence'));
    }
  });

  // ==================== COMMENTS ====================

  app.post('/api/tasks/:id/comments', async (req, reply) => {
    const paramsParsed = TaskIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = CommentAddSchema.omit({ taskId: true }).safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    try {
      const comment = state.addComment({
        taskId: paramsParsed.data.id,
        agentId: bodyParsed.data.agentId,
        content: bodyParsed.data.content
      });
      return ok(comment);
    } catch (e: any) {
      if (e?.message?.includes('Unknown taskId')) {
        return reply.status(404).send(bad('Task not found'));
      }
      return reply.status(400).send(bad(e?.message ?? 'Failed to add comment'));
    }
  });

  app.get('/api/tasks/:id/comments', async (req, reply) => {
    const paramsParsed = TaskIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const queryParsed = CommentListQuery.safeParse(req.query);
    if (!queryParsed.success) return reply.status(400).send(bad(queryParsed.error.message));
    const comments = state.listComments(paramsParsed.data.id, queryParsed.data.limit ?? 50);
    return ok(comments);
  });

  app.patch('/api/comments/:id', async (req, reply) => {
    const paramsParsed = CommentIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = CommentUpdateSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    try {
      const comment = state.updateComment(paramsParsed.data.id, bodyParsed.data.content);
      return ok(comment);
    } catch (e: any) {
      if (e?.message?.includes('Unknown commentId')) {
        return reply.status(404).send(bad('Comment not found'));
      }
      return reply.status(400).send(bad(e?.message ?? 'Failed to update comment'));
    }
  });

  app.delete('/api/comments/:id', async (req, reply) => {
    const paramsParsed = CommentIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const deleted = state.deleteComment(paramsParsed.data.id);
    if (!deleted) {
      return reply.status(404).send(bad('Comment not found'));
    }
    return ok({ deleted: true });
  });

  // ==================== BLOCKERS ====================

  app.post('/api/tasks/:id/blockers', async (req, reply) => {
    const paramsParsed = TaskIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = BlockerAddSchema.omit({ taskId: true }).safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    try {
      const blocker = state.addBlocker({
        taskId: paramsParsed.data.id,
        description: bodyParsed.data.description,
        blockingTaskId: bodyParsed.data.blockingTaskId,
        createdBy: bodyParsed.data.createdBy
      });
      return ok(blocker);
    } catch (e: any) {
      if (e?.message?.includes('Unknown taskId')) {
        return reply.status(404).send(bad('Task not found'));
      }
      if (e?.message?.includes('Unknown blockingTaskId')) {
        return reply.status(400).send(bad('Blocking task not found'));
      }
      return reply.status(400).send(bad(e?.message ?? 'Failed to add blocker'));
    }
  });

  app.get('/api/tasks/:id/blockers', async (req, reply) => {
    const paramsParsed = TaskIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const queryParsed = BlockerQuerySchema.safeParse(req.query);
    if (!queryParsed.success) return reply.status(400).send(bad(queryParsed.error.message));
    const blockers = state.listBlockers(paramsParsed.data.id, {
      unresolvedOnly: queryParsed.data.unresolvedOnly
    });
    return ok(blockers);
  });

  app.patch('/api/blockers/:id', async (req, reply) => {
    const paramsParsed = BlockerIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    try {
      const blocker = state.resolveBlocker(paramsParsed.data.id);
      return ok(blocker);
    } catch (e: any) {
      if (e?.message?.includes('Unknown blockerId')) {
        return reply.status(404).send(bad('Blocker not found'));
      }
      return reply.status(400).send(bad(e?.message ?? 'Failed to resolve blocker'));
    }
  });

  // ==================== DEPENDENCIES ====================

  app.post('/api/tasks/:id/dependencies', async (req, reply) => {
    const paramsParsed = TaskIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = DependencyAddBody.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    try {
      const dependency = state.addDependency(paramsParsed.data.id, bodyParsed.data.dependsOnTaskId);
      return ok(dependency);
    } catch (e: any) {
      if (e?.message?.includes('Unknown taskId')) {
        return reply.status(404).send(bad('Task not found'));
      }
      if (e?.message?.includes('Unknown dependsOnTaskId')) {
        return reply.status(400).send(bad('Dependency task not found'));
      }
      if (e?.message?.includes('cannot depend on itself')) {
        return reply.status(400).send(bad('A task cannot depend on itself'));
      }
      if (e?.message?.includes('Circular dependency')) {
        return reply.status(400).send(bad(e.message));
      }
      if (e?.message?.includes('Dependency already exists')) {
        return reply.status(409).send(bad(e.message));
      }
      return reply.status(400).send(bad(e?.message ?? 'Failed to add dependency'));
    }
  });

  app.get('/api/tasks/:id/dependencies', async (req, reply) => {
    const paramsParsed = TaskIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const task = state.getTask(paramsParsed.data.id);
    if (!task) return reply.status(404).send(bad('Task not found'));
    const deps = state.getDependencies(paramsParsed.data.id);
    const records = state.getDependencyRecords(paramsParsed.data.id);
    return ok({ ...deps, dependencyRecords: records });
  });

  app.delete('/api/dependencies/:id', async (req, reply) => {
    const paramsParsed = DependencyIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const deleted = state.removeDependency(paramsParsed.data.id);
    if (!deleted) {
      return reply.status(404).send(bad('Dependency not found'));
    }
    return ok({ deleted: true });
  });

  app.get('/api/tasks/:id/ready', async (req, reply) => {
    const paramsParsed = TaskIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const task = state.getTask(paramsParsed.data.id);
    if (!task) return reply.status(404).send(bad('Task not found'));
    const readiness = state.isTaskReady(paramsParsed.data.id);
    return ok(readiness);
  });

  // ==================== WIP LIMITS ====================

  app.get('/api/wip-limits', async () => {
    return ok(state.getWipLimits());
  });

  app.put('/api/wip-limits', async (req, reply) => {
    const bodyParsed = WipLimitSetSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    try {
      state.setWipLimit(bodyParsed.data.status, bodyParsed.data.limit);
      return ok({ status: bodyParsed.data.status, limit: bodyParsed.data.limit });
    } catch (e: any) {
      return reply.status(400).send(bad(e?.message ?? 'Failed to set WIP limit'));
    }
  });

  app.get('/api/wip-status', async () => {
    return ok(state.getWipStatus());
  });

  // ==================== METRICS ====================

  app.get('/api/metrics', async (req, reply) => {
    const parsed = MetricsQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const metrics = state.getBoardMetrics({
      since: parsed.data.since,
      until: parsed.data.until
    });
    return ok(metrics);
  });

  app.get('/api/metrics/velocity', async (req, reply) => {
    const parsed = VelocityQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const velocity = state.getVelocity({
      periodDays: parsed.data.periodDays,
      periods: parsed.data.periods
    });
    return ok(velocity);
  });

  app.get('/api/metrics/aging', async (req, reply) => {
    const parsed = AgingWipQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const aging = state.getAgingWip({
      thresholdDays: parsed.data.thresholdDays
    });
    return ok(aging);
  });

  app.get('/api/tasks/:id/metrics', async (req, reply) => {
    const paramsParsed = TaskIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const metrics = state.getTaskMetrics(paramsParsed.data.id);
    if (!metrics) {
      return reply.status(404).send(bad('Task not found'));
    }
    return ok(metrics);
  });
}
