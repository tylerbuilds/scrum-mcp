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

  // Health endpoint for orchestration tools (Docker, PM2, k8s)
  app.get('/health', async (_, reply) => {
    try {
      const dbCheck = state.status();
      return {
        status: 'healthy',
        timestamp: Date.now(),
        version: '0.2.0',
        uptime: process.uptime(),
        db: { connected: true, tasks: dbCheck.tasks }
      };
    } catch (e) {
      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: Date.now(),
        error: 'Database connection failed'
      });
    }
  });

  app.get('/api/status', async () => ok(state.status()));

  app.get('/api/feed', async (req, reply) => {
    const parsed = FeedQuery.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    return ok(state.getFeed(parsed.data.limit ?? 100));
  });

  // Note: Agent registry endpoint is at POST /api/agents and GET /api/agents (see Agent Registry section below)

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

  // Extend claim TTL without releasing
  const ClaimExtendSchema = z.object({
    agentId: z.string().min(1).max(120),
    files: z.array(z.string().min(1)).min(1).max(200).optional(),
    additionalSeconds: z.coerce.number().int().min(30).max(3600).default(300)
  });

  app.patch('/api/claims/extend', async (req, reply) => {
    const parsed = ClaimExtendSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));

    const { agentId, files, additionalSeconds } = parsed.data;
    const result = state.extendClaims(agentId, additionalSeconds, files);

    if (result.extended === 0) {
      return reply.status(404).send(bad('No active claims found for this agent'));
    }

    return ok({
      extended: result.extended,
      newExpiresAt: result.newExpiresAt,
      expiresIn: Math.round((result.newExpiresAt - Date.now()) / 1000) + ' seconds'
    });
  });

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

  // ==================== AGENT REGISTRY ====================

  const AgentRegisterSchema = z.object({
    agentId: z.string().min(1).max(120),
    capabilities: z.array(z.string()).min(1).max(20),
    metadata: z.record(z.unknown()).optional()
  });

  app.post('/api/agents', async (req, reply) => {
    const parsed = AgentRegisterSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));

    const agent = state.registerAgent(parsed.data);
    return ok({ status: 'registered', agent });
  });

  app.get('/api/agents', async (req, reply) => {
    const parsed = z.object({
      includeOffline: z.coerce.boolean().optional()
    }).safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));

    const agents = state.listAgents({ includeOffline: parsed.data.includeOffline });
    return ok({ count: agents.length, agents });
  });

  app.post('/api/agents/:agentId/heartbeat', async (req) => {
    const agentId = (req.params as { agentId: string }).agentId;
    const success = state.agentHeartbeat(agentId);
    if (!success) {
      return { status: 'error', message: 'Agent not found' };
    }
    return ok({ status: 'ok', message: 'Heartbeat received' });
  });

  // ==================== DEAD WORK DETECTION ====================

  app.get('/api/dead-work', async (req, reply) => {
    const parsed = z.object({
      staleDays: z.coerce.number().min(0.5).max(30).optional()
    }).safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));

    const deadWork = state.findDeadWork({ staleDays: parsed.data.staleDays });
    return ok({
      count: deadWork.length,
      tasks: deadWork,
      message: deadWork.length > 0
        ? `Found ${deadWork.length} potentially abandoned task(s)`
        : 'No dead work detected'
    });
  });

  // ==================== APPROVAL GATES ====================

  const GateTypeSchema = z.enum(['lint', 'test', 'build', 'review', 'custom']);
  const TaskStatusEnumSchema = z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']);

  const GateDefineSchema = z.object({
    gateType: GateTypeSchema,
    command: z.string().min(1).max(2000),
    triggerStatus: TaskStatusEnumSchema,
    required: z.boolean().optional()
  });

  const GateRunSchema = z.object({
    agentId: z.string().min(1).max(120),
    passed: z.boolean(),
    output: z.string().max(500000).optional(),
    durationMs: z.number().optional()
  });

  const GateIdParams = z.object({
    gateId: z.string().min(4)
  });

  // Define a gate for a task
  app.post('/api/tasks/:id/gates', async (req, reply) => {
    const paramsParsed = TaskIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = GateDefineSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    try {
      const gate = state.defineGate({
        taskId: paramsParsed.data.id,
        gateType: bodyParsed.data.gateType,
        command: bodyParsed.data.command,
        triggerStatus: bodyParsed.data.triggerStatus,
        required: bodyParsed.data.required
      });
      return ok(gate);
    } catch (e: any) {
      if (e?.message?.includes('Unknown taskId')) {
        return reply.status(404).send(bad('Task not found'));
      }
      return reply.status(400).send(bad(e?.message ?? 'Failed to define gate'));
    }
  });

  // List gates for a task
  app.get('/api/tasks/:id/gates', async (req, reply) => {
    const paramsParsed = TaskIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const gates = state.listGates(paramsParsed.data.id);
    return ok({ count: gates.length, gates });
  });

  // Record a gate run result
  app.post('/api/gates/:gateId/runs', async (req, reply) => {
    const paramsParsed = GateIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = GateRunSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));

    // Require taskId in body to associate the run with the correct task
    const taskIdSchema = z.object({ taskId: z.string().min(4) });
    const taskIdParsed = taskIdSchema.safeParse(req.body);
    if (!taskIdParsed.success) return reply.status(400).send(bad('taskId is required'));

    try {
      const run = state.recordGateRun({
        gateId: paramsParsed.data.gateId,
        taskId: taskIdParsed.data.taskId,
        agentId: bodyParsed.data.agentId,
        passed: bodyParsed.data.passed,
        output: bodyParsed.data.output,
        durationMs: bodyParsed.data.durationMs
      });
      return ok(run);
    } catch (e: any) {
      if (e?.message?.includes('Unknown gateId')) {
        return reply.status(404).send(bad('Gate not found'));
      }
      return reply.status(400).send(bad(e?.message ?? 'Failed to record gate run'));
    }
  });

  // Get gate status for a task and target status
  app.get('/api/tasks/:id/gate-status', async (req, reply) => {
    const paramsParsed = TaskIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const queryParsed = z.object({
      forStatus: TaskStatusEnumSchema
    }).safeParse(req.query);
    if (!queryParsed.success) return reply.status(400).send(bad(queryParsed.error.message));

    const gateStatus = state.getGateStatus(paramsParsed.data.id, queryParsed.data.forStatus);
    return ok(gateStatus);
  });

  // ==================== TASK TEMPLATES ====================

  const TemplateCreateSchema = z.object({
    name: z.string().min(1).max(100),
    titlePattern: z.string().min(1).max(200),
    descriptionTemplate: z.string().max(5000).optional(),
    defaultStatus: TaskStatusEnumSchema.optional(),
    defaultPriority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    defaultLabels: z.array(z.string()).optional(),
    defaultStoryPoints: z.number().int().min(1).max(21).optional(),
    gates: z.array(z.object({
      gateType: GateTypeSchema,
      command: z.string(),
      triggerStatus: TaskStatusEnumSchema
    })).optional(),
    checklist: z.array(z.string()).optional()
  });

  const TemplateIdParams = z.object({
    nameOrId: z.string().min(1)
  });

  // Create a template
  app.post('/api/templates', async (req, reply) => {
    const bodyParsed = TemplateCreateSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    try {
      const template = state.createTemplate(bodyParsed.data);
      return ok(template);
    } catch (e: any) {
      if (e?.message?.includes('already exists')) {
        return reply.status(409).send(bad(`Template "${bodyParsed.data.name}" already exists`));
      }
      return reply.status(400).send(bad(e?.message ?? 'Failed to create template'));
    }
  });

  // List all templates
  app.get('/api/templates', async () => {
    const templates = state.listTemplates();
    return ok({ count: templates.length, templates });
  });

  // Get a template by name or ID
  app.get('/api/templates/:nameOrId', async (req, reply) => {
    const paramsParsed = TemplateIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const template = state.getTemplate(paramsParsed.data.nameOrId);
    if (!template) {
      return reply.status(404).send(bad('Template not found'));
    }
    return ok(template);
  });

  // Create a task from a template
  app.post('/api/templates/:nameOrId/create-task', async (req, reply) => {
    const paramsParsed = TemplateIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = z.object({
      variables: z.record(z.string()),
      overrides: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
        priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
        assignedAgent: z.string().optional(),
        labels: z.array(z.string()).optional(),
        storyPoints: z.number().optional()
      }).optional()
    }).safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));

    const template = state.getTemplate(paramsParsed.data.nameOrId);
    if (!template) {
      return reply.status(404).send(bad('Template not found'));
    }

    const task = state.createTaskFromTemplate(
      paramsParsed.data.nameOrId,
      bodyParsed.data.variables,
      bodyParsed.data.overrides
    );
    return ok({ task, fromTemplate: template.name });
  });

  // ==================== WEBHOOKS ====================

  const WebhookEventTypeSchema = z.enum([
    'task.created', 'task.updated', 'task.completed',
    'intent.posted', 'claim.created', 'claim.conflict', 'claim.released',
    'evidence.attached', 'gate.passed', 'gate.failed'
  ]);

  const WebhookRegisterSchema = z.object({
    name: z.string().min(1).max(100),
    url: z.string().url(),
    events: z.array(WebhookEventTypeSchema).min(1),
    headers: z.record(z.string()).optional(),
    secret: z.string().optional()
  });

  const WebhookUpdateSchema = z.object({
    url: z.string().url().optional(),
    events: z.array(WebhookEventTypeSchema).optional(),
    headers: z.record(z.string()).optional(),
    enabled: z.boolean().optional()
  });

  const WebhookIdParams = z.object({
    webhookId: z.string().min(4)
  });

  // Register a webhook
  app.post('/api/webhooks', async (req, reply) => {
    const bodyParsed = WebhookRegisterSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    const webhook = state.registerWebhook(bodyParsed.data);
    return ok(webhook);
  });

  // List webhooks
  app.get('/api/webhooks', async (req, reply) => {
    const parsed = z.object({
      enabledOnly: z.coerce.boolean().optional()
    }).safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const webhooks = state.listWebhooks({ enabledOnly: parsed.data.enabledOnly });
    return ok({ count: webhooks.length, webhooks });
  });

  // Update a webhook
  app.patch('/api/webhooks/:webhookId', async (req, reply) => {
    const paramsParsed = WebhookIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = WebhookUpdateSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    try {
      const webhook = state.updateWebhook(paramsParsed.data.webhookId, bodyParsed.data);
      if (!webhook) {
        return reply.status(404).send(bad('Webhook not found'));
      }
      return ok(webhook);
    } catch (e: any) {
      if (e?.message?.includes('Unknown webhookId')) {
        return reply.status(404).send(bad('Webhook not found'));
      }
      return reply.status(400).send(bad(e?.message ?? 'Failed to update webhook'));
    }
  });

  // Delete a webhook
  app.delete('/api/webhooks/:webhookId', async (req, reply) => {
    const paramsParsed = WebhookIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const deleted = state.deleteWebhook(paramsParsed.data.webhookId);
    if (!deleted) {
      return reply.status(404).send(bad('Webhook not found'));
    }
    return ok({ deleted: true });
  });

  // Get webhook deliveries
  app.get('/api/webhooks/:webhookId/deliveries', async (req, reply) => {
    const paramsParsed = WebhookIdParams.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const queryParsed = z.object({
      limit: z.coerce.number().int().min(1).max(100).optional()
    }).safeParse(req.query);
    if (!queryParsed.success) return reply.status(400).send(bad(queryParsed.error.message));

    const deliveries = state.listWebhookDeliveries(
      paramsParsed.data.webhookId,
      queryParsed.data.limit ?? 50
    );
    return ok({ count: deliveries.length, deliveries });
  });
}
