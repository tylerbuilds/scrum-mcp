/**
 * Domain module exports - all repositories and types.
 *
 * This module serves as the central export point for the SCRUM MCP domain layer.
 * It exposes all repository classes that implement the core business logic,
 * along with shared utilities and type definitions.
 *
 * @module domain
 *
 * @example
 * ```typescript
 * import { TasksRepository, ClaimsRepository } from './domain/index.js';
 *
 * const tasks = new TasksRepository(db, logger);
 * const claims = new ClaimsRepository(db, logger);
 * ```
 */

// Base utilities
export { type BaseRepository, type CountRow, now, clipOutput, MAX_OUTPUT_CHARS } from './base.js';

// Domain repositories

/**
 * Repository for managing SCRUM tasks, comments, blockers, dependencies, and WIP limits.
 * @see {@link TasksRepository}
 */
export { TasksRepository, type ChangelogCallback } from './tasks.js';

/**
 * Repository for managing file claims and preventing edit conflicts between agents.
 * @see {@link ClaimsRepository}
 */
export { ClaimsRepository } from './claims.js';

/**
 * Repository for attaching and querying verification evidence on tasks.
 * @see {@link EvidenceRepository}
 */
export { EvidenceRepository, type TaskValidator as EvidenceTaskValidator } from './evidence.js';

/**
 * Repository for managing approval gates (lint, test, build, review) on tasks.
 * @see {@link GatesRepository}
 */
export { GatesRepository, type TaskValidator as GatesTaskValidator } from './gates.js';

/**
 * Repository for registering and managing webhook subscriptions.
 * @see {@link WebhooksRepository}
 */
export { WebhooksRepository } from './webhooks.js';

/**
 * Repository for calculating board metrics, velocity, and detecting dead work.
 * @see {@link MetricsRepository}
 */
export { MetricsRepository, type MetricsDataProvider } from './metrics.js';

/**
 * Repository for agent registration and heartbeat tracking.
 * @see {@link AgentsRepository}
 */
export { AgentsRepository } from './agents.js';

/**
 * Repository for posting and querying agent intents before file modifications.
 * @see {@link IntentsRepository}
 */
export { IntentsRepository, type TaskValidator as IntentsTaskValidator } from './intents.js';

/**
 * Repository for logging and searching file change history.
 * @see {@link ChangelogRepository}
 */
export { ChangelogRepository } from './changelog.js';

/**
 * Repository for managing collaborative sprints where multiple agents work on the same task.
 * Sprints are about shared understanding, not control - agents share context, decisions,
 * interfaces, and discoveries to create better integrated systems.
 * @see {@link SprintsRepository}
 */
export { SprintsRepository } from './sprints.js';
