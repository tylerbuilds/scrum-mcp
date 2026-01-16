import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../core/auth.js';
import {
  // Task schemas
  TaskCreateSchema,
  TaskListQuerySchema,
  TaskIdParamsSchema,
  TaskUpdateSchema,
  BoardQuerySchema,
  // Intent schemas
  IntentPostSchema,
  // Claim schemas
  ClaimCreateSchema,
  ClaimReleaseSchema,
  ClaimExtendRestSchema,
  // Evidence schemas
  EvidenceAttachSchema,
  // Comment schemas
  CommentAddSchema,
  CommentUpdateSchema,
  CommentListQuerySchema,
  CommentIdParamsSchema,
  // Blocker schemas
  BlockerAddSchema,
  BlockerQuerySchema,
  BlockerIdParamsSchema,
  // Dependency schemas
  DependencyAddBodySchema,
  DependencyIdParamsSchema,
  // WIP Limit schemas
  WipLimitSetSchema,
  // Metrics schemas
  MetricsQuerySchema,
  VelocityQuerySchema,
  AgingWipQuerySchema,
  // Agent schemas
  AgentRegisterSchema,
  AgentsListQuerySchema,
  // Dead Work schemas
  DeadWorkQuerySchema,
  // Gate schemas
  GateDefineRestSchema,
  GateRunRestSchema,
  GateIdParamsSchema,
  TaskStatusEnumWithoutCancelled,
  // Template schemas
  TemplateCreateSchema,
  TemplateIdParamsSchema,
  TaskFromTemplateRestSchema,
  // Webhook schemas
  WebhookRegisterSchema,
  WebhookUpdateRestSchema,
  WebhookIdParamsSchema,
  WebhooksListQuerySchema,
  // Misc schemas
  FeedQuerySchema,
  LimitQuerySchema,
  // Changelog schemas
  ChangelogLogSchema,
  // Compliance schemas
  ComplianceTaskParamsSchema,
  ComplianceAgentParamsSchema,
  // Sprint schemas
  SprintCreateSchema,
  SprintIdParamsSchema,
  SprintListQuerySchema,
  SprintJoinRestSchema,
  SprintLeaveRestSchema,
  SprintShareRestSchema,
  SprintSharesQuerySchema
} from './schemas.js';
import type { ScrumState } from '../core/state.js';
import type { ScrumConfig } from '../core/config.js';
import { z } from 'zod';

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function bad(message: string) {
  return { ok: false as const, error: message };
}

export async function registerRoutes(app: FastifyInstance, state: ScrumState, config: ScrumConfig) {
  // Enable CORS for frontend
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
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

  // ==================== AUTO-REGISTRATION HELPER ====================
  // Automatically register agents when they first use SCRUM (intent, claim, evidence)
  const ensureAgentRegistered = (agentId: string, capabilities: string[] = []) => {
    if (state.agentHeartbeat(agentId)) return;
    state.registerAgent({
      agentId,
      capabilities: capabilities.length > 0 ? capabilities : ['working'],
      metadata: { autoRegistered: true, registeredAt: Date.now() }
    });
  };

  app.get('/api/feed', async (req, reply) => {
    const parsed = FeedQuerySchema.safeParse(req.query);
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
    const parsed = TaskListQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    return ok(state.listTasks(parsed.data.limit ?? 50));
  });

  app.get('/api/tasks/:id', async (req, reply) => {
    const parsed = TaskIdParamsSchema.safeParse(req.params);
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
    const paramsParsed = TaskIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = TaskUpdateSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));

    // STRICT MODE: Compliance enforcement for done transitions
    if (config.SCRUM_STRICT_MODE && bodyParsed.data.status === 'done') {
      const taskId = paramsParsed.data.id;
      const agents = state.getTaskAgents(taskId);

      for (const agentId of agents) {
        const compliance = state.checkCompliance(taskId, agentId);
        if (!compliance.canComplete) {
          return reply.status(403).send(bad(
            `COMPLIANCE_BLOCKED: Agent ${agentId} has not met compliance requirements. ${compliance.summary}. ` +
            `All agents must be compliant before marking task as done.`
          ));
        }
      }
    }

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

    // Auto-register agent if not exists
    ensureAgentRegistered(parsed.data.agentId, parsed.data.files);

    try {
      const intent = state.postIntent(parsed.data);
      return ok(intent);
    } catch (e: any) {
      return reply.status(400).send(bad(e?.message ?? 'Failed to post intent'));
    }
  });

  // GET all intents (for dashboard)
  app.get('/api/intents', async (req, reply) => {
    const parsed = LimitQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const intents = state.listAllIntents(parsed.data.limit ?? 100);
    return ok(intents);
  });

  // GET all evidence (for dashboard)
  app.get('/api/evidence', async (req, reply) => {
    const parsed = LimitQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const evidence = state.listAllEvidence(parsed.data.limit ?? 100);
    return ok(evidence);
  });

  // GET changelog (for dashboard)
  app.get('/api/changelog', async (req, reply) => {
    const parsed = LimitQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const entries = state.searchChangelog({ limit: parsed.data.limit ?? 100 });
    return ok({ count: entries.length, entries });
  });

  // POST changelog entry
  app.post('/api/changelog', async (req, reply) => {
    const parsed = ChangelogLogSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    ensureAgentRegistered(parsed.data.agentId, ['changelog']);
    const entry = state.logChange(parsed.data);
    return ok(entry);
  });

  app.post('/api/claims', async (req, reply) => {
    const parsed = ClaimCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));

    // Auto-register agent if not exists
    ensureAgentRegistered(parsed.data.agentId, parsed.data.files);

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
  app.patch('/api/claims/extend', async (req, reply) => {
    const parsed = ClaimExtendRestSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));

    const { agentId, files, additionalSeconds } = parsed.data;
    ensureAgentRegistered(agentId, files ?? []);
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
    ensureAgentRegistered(parsed.data.agentId);

    // ENFORCEMENT: Must have attached evidence before releasing claims
    const activeClaims = state.getAgentClaims(parsed.data.agentId);
    if (activeClaims.length > 0) {
      const evidenceCheck = state.hasEvidenceForTask(parsed.data.agentId);
      if (!evidenceCheck.hasEvidence) {
        return reply.status(403).send(bad(
          'You must attach evidence (POST /api/evidence) proving your work before releasing claims. No receipts = no release.'
        ));
      }

      // STRICT MODE: Compliance enforcement on REST API (default: on)
      if (config.SCRUM_STRICT_MODE) {
        for (const taskId of evidenceCheck.taskIds) {
          const compliance = state.checkCompliance(taskId, parsed.data.agentId);

          // Block if undeclared files modified
          if (!compliance.checks.filesMatch.passed && compliance.checks.filesMatch.undeclared.length > 0) {
            return reply.status(403).send(bad(
              `COMPLIANCE_FAILED: Undeclared files modified: ${compliance.checks.filesMatch.undeclared.join(', ')}. ` +
              `Update your intent to include these files, or revert the changes.`
            ));
          }

          // Block if boundary violations
          if (!compliance.checks.boundariesRespected.passed) {
            return reply.status(403).send(bad(
              `BOUNDARY_VIOLATION: You modified files you declared as off-limits: ${compliance.checks.boundariesRespected.violations.join(', ')}. ` +
              `Revert these changes before releasing.`
            ));
          }
        }
      }
    }

    const released = state.releaseClaims(parsed.data.agentId, parsed.data.files);
    return ok({ released, agentId: parsed.data.agentId });
  });

  app.post('/api/evidence', async (req, reply) => {
    const parsed = EvidenceAttachSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));

    // Auto-register agent if not exists
    ensureAgentRegistered(parsed.data.agentId, ['evidence']);

    try {
      const ev = state.attachEvidence(parsed.data);
      return ok(ev);
    } catch (e: any) {
      return reply.status(400).send(bad(e?.message ?? 'Failed to attach evidence'));
    }
  });

  // ==================== COMMENTS ====================

  app.post('/api/tasks/:id/comments', async (req, reply) => {
    const paramsParsed = TaskIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = CommentAddSchema.omit({ taskId: true }).safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    ensureAgentRegistered(bodyParsed.data.agentId, ['comment']);
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
    const paramsParsed = TaskIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const queryParsed = CommentListQuerySchema.safeParse(req.query);
    if (!queryParsed.success) return reply.status(400).send(bad(queryParsed.error.message));
    const comments = state.listComments(paramsParsed.data.id, queryParsed.data.limit ?? 50);
    return ok(comments);
  });

  app.patch('/api/comments/:id', async (req, reply) => {
    const paramsParsed = CommentIdParamsSchema.safeParse(req.params);
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
    const paramsParsed = CommentIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const deleted = state.deleteComment(paramsParsed.data.id);
    if (!deleted) {
      return reply.status(404).send(bad('Comment not found'));
    }
    return ok({ deleted: true });
  });

  // ==================== BLOCKERS ====================

  app.post('/api/tasks/:id/blockers', async (req, reply) => {
    const paramsParsed = TaskIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = BlockerAddSchema.omit({ taskId: true }).safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    ensureAgentRegistered(bodyParsed.data.agentId, ['blocker']);
    try {
      const blocker = state.addBlocker({
        taskId: paramsParsed.data.id,
        description: bodyParsed.data.description,
        blockingTaskId: bodyParsed.data.blockingTaskId,
        agentId: bodyParsed.data.agentId
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
    const paramsParsed = TaskIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const queryParsed = BlockerQuerySchema.safeParse(req.query);
    if (!queryParsed.success) return reply.status(400).send(bad(queryParsed.error.message));
    const blockers = state.listBlockers(paramsParsed.data.id, {
      unresolvedOnly: queryParsed.data.unresolvedOnly
    });
    return ok(blockers);
  });

  app.patch('/api/blockers/:id', async (req, reply) => {
    const paramsParsed = BlockerIdParamsSchema.safeParse(req.params);
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
    const paramsParsed = TaskIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = DependencyAddBodySchema.safeParse(req.body);
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
    const paramsParsed = TaskIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const task = state.getTask(paramsParsed.data.id);
    if (!task) return reply.status(404).send(bad('Task not found'));
    const deps = state.getDependencies(paramsParsed.data.id);
    const records = state.getDependencyRecords(paramsParsed.data.id);
    return ok({ ...deps, dependencyRecords: records });
  });

  app.delete('/api/dependencies/:id', async (req, reply) => {
    const paramsParsed = DependencyIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const deleted = state.removeDependency(paramsParsed.data.id);
    if (!deleted) {
      return reply.status(404).send(bad('Dependency not found'));
    }
    return ok({ deleted: true });
  });

  app.get('/api/tasks/:id/ready', async (req, reply) => {
    const paramsParsed = TaskIdParamsSchema.safeParse(req.params);
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
    const paramsParsed = TaskIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const metrics = state.getTaskMetrics(paramsParsed.data.id);
    if (!metrics) {
      return reply.status(404).send(bad('Task not found'));
    }
    return ok(metrics);
  });

  // ==================== AGENT REGISTRY ====================

  app.post('/api/agents', async (req, reply) => {
    const parsed = AgentRegisterSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));

    const agent = state.registerAgent(parsed.data);
    return ok({ status: 'registered', agent });
  });

  app.get('/api/agents', async (req, reply) => {
    const parsed = AgentsListQuerySchema.safeParse(req.query);
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
    const parsed = DeadWorkQuerySchema.safeParse(req.query);
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

  // Define a gate for a task
  app.post('/api/tasks/:id/gates', async (req, reply) => {
    const paramsParsed = TaskIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = GateDefineRestSchema.safeParse(req.body);
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
    const paramsParsed = TaskIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const gates = state.listGates(paramsParsed.data.id);
    return ok({ count: gates.length, gates });
  });

  // Record a gate run result
  app.post('/api/gates/:gateId/runs', async (req, reply) => {
    const paramsParsed = GateIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = GateRunRestSchema.safeParse(req.body);
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
    const paramsParsed = TaskIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const queryParsed = z.object({
      forStatus: TaskStatusEnumWithoutCancelled
    }).safeParse(req.query);
    if (!queryParsed.success) return reply.status(400).send(bad(queryParsed.error.message));

    const gateStatus = state.getGateStatus(paramsParsed.data.id, queryParsed.data.forStatus);
    return ok(gateStatus);
  });

  // ==================== TASK TEMPLATES ====================

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
    const paramsParsed = TemplateIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const template = state.getTemplate(paramsParsed.data.nameOrId);
    if (!template) {
      return reply.status(404).send(bad('Template not found'));
    }
    return ok(template);
  });

  // Create a task from a template
  app.post('/api/templates/:nameOrId/create-task', async (req, reply) => {
    const paramsParsed = TemplateIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = TaskFromTemplateRestSchema.safeParse(req.body);
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

  // Register a webhook
  app.post('/api/webhooks', async (req, reply) => {
    const bodyParsed = WebhookRegisterSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    const webhook = state.registerWebhook(bodyParsed.data);
    return ok(webhook);
  });

  // List webhooks
  app.get('/api/webhooks', async (req, reply) => {
    const parsed = WebhooksListQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send(bad(parsed.error.message));
    const webhooks = state.listWebhooks({ enabledOnly: parsed.data.enabledOnly });
    return ok({ count: webhooks.length, webhooks });
  });

  // Update a webhook
  app.patch('/api/webhooks/:webhookId', async (req, reply) => {
    const paramsParsed = WebhookIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const bodyParsed = WebhookUpdateRestSchema.safeParse(req.body);
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
    const paramsParsed = WebhookIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const deleted = state.deleteWebhook(paramsParsed.data.webhookId);
    if (!deleted) {
      return reply.status(404).send(bad('Webhook not found'));
    }
    return ok({ deleted: true });
  });

  // Get webhook deliveries
  app.get('/api/webhooks/:webhookId/deliveries', async (req, reply) => {
    const paramsParsed = WebhookIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));
    const queryParsed = LimitQuerySchema.safeParse(req.query);
    if (!queryParsed.success) return reply.status(400).send(bad(queryParsed.error.message));

    const deliveries = state.listWebhookDeliveries(
      paramsParsed.data.webhookId,
      queryParsed.data.limit ?? 50
    );
    return ok({ count: deliveries.length, deliveries });
  });

  // ==================== COMPLIANCE ====================

  // Check compliance for a specific agent on a task
  app.get('/api/compliance/:taskId/:agentId', async (req, reply) => {
    const paramsParsed = ComplianceAgentParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));

    const task = state.getTask(paramsParsed.data.taskId);
    if (!task) {
      return reply.status(404).send(bad('Task not found'));
    }

    const result = state.checkCompliance(paramsParsed.data.taskId, paramsParsed.data.agentId);
    return ok(result);
  });

  // Check compliance for all agents on a task
  app.get('/api/compliance/:taskId', async (req, reply) => {
    const paramsParsed = ComplianceTaskParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));

    const task = state.getTask(paramsParsed.data.taskId);
    if (!task) {
      return reply.status(404).send(bad('Task not found'));
    }

    const agents = state.getTaskAgents(paramsParsed.data.taskId);
    const results = agents.map(agentId => {
      const check = state.checkCompliance(paramsParsed.data.taskId, agentId);
      return check;
    });

    return ok({
      taskId: paramsParsed.data.taskId,
      taskTitle: task.title,
      agentCount: agents.length,
      allCompliant: results.every(r => r.canComplete),
      agents: results
    });
  });

  // ==================== SPRINTS (Collaborative Multi-Agent Work) ====================

  // Helper function for Sprint disabled response
  const sprintDisabledResponse = (reply: any) => {
    return reply.status(503).send({
      ok: false,
      error: 'Sprint features are disabled',
      message: 'Set SCRUM_SPRINT_ENABLED=true to enable collaborative multi-agent work.',
      hint: 'Use standard SCRUM workflow (intent, claim, evidence) for solo work.'
    });
  };

  // Create a sprint
  app.post('/api/sprints', async (req, reply) => {
    if (!config.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse(reply);
    const bodyParsed = SprintCreateSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));

    const task = state.getTask(bodyParsed.data.taskId);
    if (!task) {
      return reply.status(404).send(bad('Task not found'));
    }

    const sprint = state.createSprint(bodyParsed.data);
    return ok({ sprint, task: { id: task.id, title: task.title } });
  });

  // List sprints
  app.get('/api/sprints', async (req, reply) => {
    if (!config.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse(reply);
    const queryParsed = SprintListQuerySchema.safeParse(req.query);
    if (!queryParsed.success) return reply.status(400).send(bad(queryParsed.error.message));

    const sprints = state.listSprints({
      taskId: queryParsed.data.taskId,
      status: queryParsed.data.status
    });
    return ok({ count: sprints.length, sprints });
  });

  // Get a sprint by ID
  app.get('/api/sprints/:sprintId', async (req, reply) => {
    if (!config.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse(reply);
    const paramsParsed = SprintIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));

    const sprint = state.getSprint(paramsParsed.data.sprintId);
    if (!sprint) {
      return reply.status(404).send(bad('Sprint not found'));
    }

    const members = state.getSprintMembers(paramsParsed.data.sprintId);
    return ok({ sprint, members });
  });

  // Get sprint for a task
  app.get('/api/tasks/:id/sprint', async (req, reply) => {
    if (!config.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse(reply);
    const paramsParsed = TaskIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));

    const task = state.getTask(paramsParsed.data.id);
    if (!task) {
      return reply.status(404).send(bad('Task not found'));
    }

    const sprint = state.getSprintForTask(paramsParsed.data.id);
    if (!sprint) {
      return ok({ sprint: null, message: 'No active sprint for this task' });
    }

    const members = state.getSprintMembers(sprint.id);
    return ok({ sprint, members });
  });

  // Complete a sprint
  app.post('/api/sprints/:sprintId/complete', async (req, reply) => {
    if (!config.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse(reply);
    const paramsParsed = SprintIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));

    const sprint = state.completeSprint(paramsParsed.data.sprintId);
    if (!sprint) {
      return reply.status(404).send(bad('Sprint not found'));
    }

    return ok({ sprint, message: 'Sprint completed' });
  });

  // Join a sprint
  app.post('/api/sprints/:sprintId/join', async (req, reply) => {
    if (!config.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse(reply);
    const paramsParsed = SprintIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));

    const bodyParsed = SprintJoinRestSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    ensureAgentRegistered(bodyParsed.data.agentId, ['sprint']);

    const sprint = state.getSprint(paramsParsed.data.sprintId);
    if (!sprint) {
      return reply.status(404).send(bad('Sprint not found'));
    }

    const member = state.joinSprint({
      sprintId: paramsParsed.data.sprintId,
      ...bodyParsed.data
    });

    const members = state.getSprintMembers(paramsParsed.data.sprintId);
    return ok({ member, teamSize: members.length });
  });

  // Leave a sprint
  app.post('/api/sprints/:sprintId/leave', async (req, reply) => {
    if (!config.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse(reply);
    const paramsParsed = SprintIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));

    const bodyParsed = SprintLeaveRestSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    ensureAgentRegistered(bodyParsed.data.agentId, ['sprint']);

    const left = state.leaveSprint(paramsParsed.data.sprintId, bodyParsed.data.agentId);
    return ok({ left });
  });

  // Get sprint members
  app.get('/api/sprints/:sprintId/members', async (req, reply) => {
    if (!config.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse(reply);
    const paramsParsed = SprintIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));

    const sprint = state.getSprint(paramsParsed.data.sprintId);
    if (!sprint) {
      return reply.status(404).send(bad('Sprint not found'));
    }

    const members = state.getSprintMembers(paramsParsed.data.sprintId);
    return ok({ count: members.length, members });
  });

  // Share with sprint
  app.post('/api/sprints/:sprintId/share', async (req, reply) => {
    if (!config.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse(reply);
    const paramsParsed = SprintIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));

    const bodyParsed = SprintShareRestSchema.safeParse(req.body);
    if (!bodyParsed.success) return reply.status(400).send(bad(bodyParsed.error.message));
    ensureAgentRegistered(bodyParsed.data.agentId, ['sprint']);

    const sprint = state.getSprint(paramsParsed.data.sprintId);
    if (!sprint) {
      return reply.status(404).send(bad('Sprint not found'));
    }

    const share = state.shareWithSprint({
      sprintId: paramsParsed.data.sprintId,
      ...bodyParsed.data
    });

    return ok({ share });
  });

  // Get sprint shares
  app.get('/api/sprints/:sprintId/shares', async (req, reply) => {
    if (!config.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse(reply);
    const paramsParsed = SprintIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));

    const queryParsed = SprintSharesQuerySchema.safeParse(req.query);
    if (!queryParsed.success) return reply.status(400).send(bad(queryParsed.error.message));

    const sprint = state.getSprint(paramsParsed.data.sprintId);
    if (!sprint) {
      return reply.status(404).send(bad('Sprint not found'));
    }

    const shares = state.getSprintShares(paramsParsed.data.sprintId, {
      shareType: queryParsed.data.shareType,
      limit: queryParsed.data.limit
    });

    return ok({ count: shares.length, shares });
  });

  // Get sprint context (full state)
  app.get('/api/sprints/:sprintId/context', async (req, reply) => {
    if (!config.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse(reply);
    const paramsParsed = SprintIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));

    const context = state.getSprintContext(paramsParsed.data.sprintId);
    if (!context) {
      return reply.status(404).send(bad('Sprint not found'));
    }

    // Organize shares by type
    const decisions = context.shares.filter(s => s.shareType === 'decision');
    const interfaces = context.shares.filter(s => s.shareType === 'interface');
    const discoveries = context.shares.filter(s => s.shareType === 'discovery');
    const integrations = context.shares.filter(s => s.shareType === 'integration');
    const unansweredQuestions = state.getUnansweredQuestions(paramsParsed.data.sprintId);

    return ok({
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
      decisions,
      interfaces,
      discoveries,
      integrations,
      unansweredQuestions
    });
  });

  // Get unanswered questions in sprint
  app.get('/api/sprints/:sprintId/questions', async (req, reply) => {
    if (!config.SCRUM_SPRINT_ENABLED) return sprintDisabledResponse(reply);
    const paramsParsed = SprintIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return reply.status(400).send(bad(paramsParsed.error.message));

    const sprint = state.getSprint(paramsParsed.data.sprintId);
    if (!sprint) {
      return reply.status(404).send(bad('Sprint not found'));
    }

    const questions = state.getUnansweredQuestions(paramsParsed.data.sprintId);
    return ok({ count: questions.length, questions });
  });

  // ==================== AUTH MIDDLEWARE ====================
  // Register auth middleware AFTER routes - opt-in via SCRUM_AUTH_ENABLED
  app.addHook('preHandler', authMiddleware);
}
