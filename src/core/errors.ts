/**
 * Custom error classes for the SCRUM MCP system.
 *
 * All errors extend {@link ScrumError} which provides:
 * - A machine-readable `code` for programmatic handling
 * - An HTTP-compatible `statusCode` for API responses
 *
 * @module errors
 *
 * @example
 * ```typescript
 * import { NotFoundError, ValidationError } from './errors.js';
 *
 * function getTask(id: string) {
 *   const task = db.get(id);
 *   if (!task) throw new NotFoundError('Task', id);
 *   return task;
 * }
 * ```
 */

/**
 * Base error class for all SCRUM MCP errors.
 *
 * Provides a consistent error structure with:
 * - `code`: Machine-readable error code (e.g., 'NOT_FOUND', 'VALIDATION_ERROR')
 * - `statusCode`: HTTP status code for API responses
 *
 * @extends Error
 *
 * @example
 * ```typescript
 * try {
 *   throw new ScrumError('Something went wrong', 'INTERNAL_ERROR', 500);
 * } catch (err) {
 *   if (err instanceof ScrumError) {
 *     console.log(err.code);       // 'INTERNAL_ERROR'
 *     console.log(err.statusCode); // 500
 *   }
 * }
 * ```
 */
export class ScrumError extends Error {
  /**
   * Creates a new ScrumError.
   *
   * @param message - Human-readable error message
   * @param code - Machine-readable error code for programmatic handling
   * @param statusCode - HTTP status code (default: 500)
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'ScrumError';
  }
}

/**
 * Error thrown when a requested resource is not found.
 *
 * @extends ScrumError
 * @statusCode 404
 *
 * @example
 * ```typescript
 * const task = db.get(taskId);
 * if (!task) {
 *   throw new NotFoundError('Task', taskId);
 *   // message: "Task not found: abc123"
 * }
 * ```
 */
export class NotFoundError extends ScrumError {
  /**
   * Creates a NotFoundError for a specific resource.
   *
   * @param resource - The type of resource (e.g., 'Task', 'Intent', 'Agent')
   * @param id - The identifier that was not found
   */
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown when an operation conflicts with existing state.
 *
 * Common scenarios:
 * - File claim conflicts between agents
 * - Duplicate resource creation
 * - Concurrent modification conflicts
 *
 * @extends ScrumError
 * @statusCode 409
 *
 * @example
 * ```typescript
 * const existingClaim = claims.getClaimForFile(filePath);
 * if (existingClaim && existingClaim.agentId !== agentId) {
 *   throw new ConflictError(`File ${filePath} is claimed by ${existingClaim.agentId}`);
 * }
 * ```
 */
export class ConflictError extends ScrumError {
  /**
   * Creates a ConflictError.
   *
   * @param message - Description of the conflict
   */
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

/**
 * Error thrown when input validation fails.
 *
 * Common scenarios:
 * - Missing required fields
 * - Invalid field values
 * - Constraint violations
 *
 * @extends ScrumError
 * @statusCode 400
 *
 * @example
 * ```typescript
 * if (!title || title.trim() === '') {
 *   throw new ValidationError('Task title is required');
 * }
 *
 * if (storyPoints < 0) {
 *   throw new ValidationError('Story points must be non-negative');
 * }
 * ```
 */
export class ValidationError extends ScrumError {
  /**
   * Creates a ValidationError.
   *
   * @param message - Description of the validation failure
   */
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when authentication is required but not provided.
 *
 * @extends ScrumError
 * @statusCode 401
 *
 * @example
 * ```typescript
 * if (!request.headers.authorization) {
 *   throw new UnauthorizedError('Authentication required');
 * }
 * ```
 */
export class UnauthorizedError extends ScrumError {
  /**
   * Creates an UnauthorizedError.
   *
   * @param message - Description of why authentication failed (default: 'Unauthorized')
   */
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Error thrown when the user lacks permission for an operation.
 *
 * Unlike {@link UnauthorizedError}, this indicates the user is authenticated
 * but does not have sufficient privileges.
 *
 * @extends ScrumError
 * @statusCode 403
 *
 * @example
 * ```typescript
 * if (task.assignedAgent !== agentId) {
 *   throw new ForbiddenError('Only the assigned agent can complete this task');
 * }
 * ```
 */
export class ForbiddenError extends ScrumError {
  /**
   * Creates a ForbiddenError.
   *
   * @param message - Description of why access is forbidden (default: 'Forbidden')
   */
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}
