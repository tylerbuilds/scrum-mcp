# SCRUM Server (MCP)

This guide explains how to use SCRUM with AI coding agents via the Model Context Protocol (MCP).

## What is MCP?

MCP is a standard protocol that lets AI tools call external services. SCRUM exposes its coordination features as MCP tools, so agents like Claude Code, Cursor, or any MCP-compatible client can:

- Create and track tasks
- Declare intent before editing files
- Claim files to prevent conflicts
- Attach evidence (command output) to prove work
- Manage tasks through kanban workflow stages
- Track blockers, dependencies, and WIP limits
- Monitor team velocity and cycle time metrics

## Quick Start

```bash
# Build the project
npm run build

# Test the MCP server manually (Ctrl+C to exit)
npm run mcp
```

The MCP server uses stdio transport (stdin/stdout JSON-RPC).

## Setup by Tool

### Claude Code

Add to `~/.claude.json` (or use `claude mcp add`):

```json
{
  "mcpServers": {
    "scrum": {
      "command": "node",
      "args": ["/absolute/path/to/scrum/dist/mcp.js"],
      "env": {
        "SCRUM_DB_PATH": "/absolute/path/to/your/repo/.scrum/scrum.sqlite"
      }
    }
  }
}
```

Or via CLI:

```bash
claude mcp add scrum node /path/to/scrum/dist/mcp.js
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "scrum": {
      "command": "node",
      "args": ["./path/to/scrum/dist/mcp.js"]
    }
  }
}
```

### VS Code + Continue

Add to your Continue config:

```json
{
  "mcpServers": [
    {
      "name": "scrum",
      "command": "node",
      "args": ["/path/to/scrum/dist/mcp.js"]
    }
  ]
}
```

### Generic MCP Client

Any MCP client can connect via:

```bash
node /path/to/scrum/dist/mcp.js
```

Communication is JSON-RPC 2.0 over stdio.

## Available Tools

### Core Tools

These are the foundational SCRUM coordination tools.

#### `scrum_status`

Get current SCRUM server status.

```
Returns: { tasks, intents, claims, evidence, now }
```

#### `scrum_task_create`

Create a new task (top-level work item).

```
Inputs:
  - title (required): Task title (1-200 chars)
  - description (optional): Details (max 2000 chars)

Returns: { id, title, description, createdAt }
```

#### `scrum_task_get`

Get a task with all its intents and evidence.

```
Inputs:
  - taskId (required): Task ID

Returns: { task, intents[], evidence[] }
```

#### `scrum_task_list`

List recent tasks.

```
Inputs:
  - limit (optional): Max results (1-200, default 50)

Returns: Task[]
```

#### `scrum_intent_post`

Declare what you plan to change BEFORE editing. Required by SCRUM contract.

```
Inputs:
  - taskId (required): Task ID
  - agentId (required): Your identifier (e.g., "claude-code")
  - files (required): Array of file paths you'll modify
  - boundaries (optional): What you promise NOT to change
  - acceptanceCriteria (optional): How to verify the work

Returns: { id, taskId, agentId, files, boundaries, acceptanceCriteria, createdAt }
```

#### `scrum_claim`

Claim exclusive access to files. Required before editing.

```
Inputs:
  - agentId (required): Your identifier
  - files (required): Array of file paths to claim
  - ttlSeconds (optional): Claim duration (5-3600, default 900)

Returns:
  - If no conflicts: { status: "ok", claim, conflictsWith: [] }
  - If conflicts: { status: "conflict", claim, conflictsWith: ["other-agent"], message }
```

#### `scrum_claim_release`

Release your claims when done editing.

```
Inputs:
  - agentId (required): Your identifier
  - files (optional): Specific files to release (omit to release all)

Returns: { status: "ok", released }
```

#### `scrum_claims_list`

List all active claims across all agents.

```
Returns: Claim[] with { agentId, files[], expiresAt, createdAt }
```

#### `scrum_claim_extend`

Extend the TTL of your active claims without releasing them. Use when you need more time.

```
Inputs:
  - agentId (required): Your identifier
  - files (optional): Specific files to extend (omit for all)
  - additionalSeconds (optional): Seconds to add (30-3600, default 300)

Returns: { status: "ok", extended, newExpiresAt, expiresIn }
```

#### `scrum_evidence_attach`

Attach proof that your work is complete. Required by SCRUM contract.

```
Inputs:
  - taskId (required): Task ID
  - agentId (required): Your identifier
  - command (required): Command that was run
  - output (required): Command output (stdout/stderr)

Returns: { id, taskId, agentId, command, output, createdAt }
```

#### `scrum_overlap_check`

Check if files are claimed by other agents before starting work.

```
Inputs:
  - files (required): Array of file paths to check

Returns: { hasOverlaps, overlaps[], checkedFiles }
```

### Kanban Workflow

Tools for managing task status and visualizing work on the board.

#### `scrum_task_update`

Update task status, priority, assignment, due date, labels, or story points.

```
Inputs:
  - taskId (required): Task ID
  - status (optional): New status ("backlog", "todo", "in_progress", "review", "done")
  - priority (optional): Priority level ("low", "medium", "high", "critical")
  - assignee (optional): Agent or person assigned
  - dueDate (optional): Due date (ISO 8601 string)
  - labels (optional): Array of label strings
  - storyPoints (optional): Story point estimate (number)

Returns: { task } with updated fields
```

#### `scrum_board`

Get kanban board view with tasks grouped by status.

```
Inputs:
  - includeMetrics (optional): Include column metrics (default: false)

Returns: {
  columns: {
    backlog: Task[],
    todo: Task[],
    in_progress: Task[],
    review: Task[],
    done: Task[]
  },
  metrics?: { columnCounts, wipStatus }
}
```

### Comments and Blockers

Tools for collaboration and issue tracking on tasks.

#### `scrum_comment_add`

Add a comment to a task.

```
Inputs:
  - taskId (required): Task ID
  - agentId (required): Your identifier
  - content (required): Comment text (max 2000 chars)

Returns: { id, taskId, agentId, content, createdAt }
```

#### `scrum_comments_list`

List comments on a task.

```
Inputs:
  - taskId (required): Task ID
  - limit (optional): Max results (1-100, default 50)

Returns: Comment[]
```

#### `scrum_blocker_add`

Add a blocker to a task.

```
Inputs:
  - taskId (required): Task ID
  - agentId (required): Your identifier
  - description (required): What is blocking progress
  - blockerType (optional): Type ("technical", "dependency", "external", "resource")

Returns: { id, taskId, agentId, description, blockerType, resolved, createdAt }
```

#### `scrum_blocker_resolve`

Resolve a blocker on a task.

```
Inputs:
  - blockerId (required): Blocker ID
  - agentId (required): Your identifier
  - resolution (optional): How it was resolved

Returns: { blocker } with resolved: true and resolvedAt timestamp
```

#### `scrum_blockers_list`

List blockers for a task.

```
Inputs:
  - taskId (required): Task ID
  - includeResolved (optional): Include resolved blockers (default: false)

Returns: Blocker[]
```

### Dependencies

Tools for managing task dependencies and execution order.

#### `scrum_dependency_add`

Add a dependency between tasks (task A depends on task B).

```
Inputs:
  - taskId (required): Task that has the dependency
  - dependsOnTaskId (required): Task that must complete first
  - dependencyType (optional): Type ("blocks", "required_by", "related")

Returns: { id, taskId, dependsOnTaskId, dependencyType, createdAt }
```

#### `scrum_dependency_remove`

Remove a dependency between tasks.

```
Inputs:
  - taskId (required): Task with the dependency
  - dependsOnTaskId (required): Task to remove as dependency

Returns: { status: "ok", removed: true }
```

#### `scrum_dependencies_get`

Get all dependencies for a task.

```
Inputs:
  - taskId (required): Task ID
  - direction (optional): "upstream" (what this depends on), "downstream" (what depends on this), or "both" (default)

Returns: {
  upstream: Dependency[],
  downstream: Dependency[]
}
```

#### `scrum_task_ready`

Check if a task is ready to start (all dependencies completed).

```
Inputs:
  - taskId (required): Task ID

Returns: {
  ready: boolean,
  blockedBy: Task[],
  message: string
}
```

### WIP Limits

Tools for managing work-in-progress limits to prevent overload.

#### `scrum_wip_limits_get`

Get WIP limits for all columns.

```
Returns: {
  backlog: number | null,
  todo: number | null,
  in_progress: number | null,
  review: number | null,
  done: number | null
}
```

#### `scrum_wip_limits_set`

Set WIP limit for a column.

```
Inputs:
  - column (required): Column name ("backlog", "todo", "in_progress", "review", "done")
  - limit (required): Max tasks allowed (number, or null to remove limit)

Returns: { column, limit, previous }
```

#### `scrum_wip_status`

Get current WIP status showing limits vs actual counts.

```
Returns: {
  columns: {
    [column]: {
      limit: number | null,
      current: number,
      available: number | null,
      overLimit: boolean
    }
  },
  totalOverLimit: number
}
```

### Metrics

Tools for tracking team performance and identifying bottlenecks.

#### `scrum_metrics`

Get board-level metrics including cycle time, lead time, and throughput.

```
Inputs:
  - days (optional): Number of days to analyze (default: 30)

Returns: {
  cycleTime: { average, median, p90 },
  leadTime: { average, median, p90 },
  throughput: { daily, weekly },
  completedTasks: number,
  period: { start, end }
}
```

#### `scrum_velocity`

Get velocity over time periods (story points completed).

```
Inputs:
  - periods (optional): Number of periods to return (default: 4)
  - periodType (optional): "week" or "sprint" (default: "week")

Returns: {
  periods: [{
    start, end,
    completedPoints: number,
    completedTasks: number
  }],
  averageVelocity: number
}
```

#### `scrum_aging_wip`

Get tasks that have been in progress for too long.

```
Inputs:
  - thresholdDays (optional): Days before considered aging (default: 3)

Returns: {
  agingTasks: [{
    task: Task,
    daysInProgress: number,
    status: string
  }],
  totalAging: number
}
```

#### `scrum_task_metrics`

Get metrics for a single task.

```
Inputs:
  - taskId (required): Task ID

Returns: {
  task: Task,
  cycleTime: number | null,
  leadTime: number | null,
  timeInStatus: { [status]: number },
  blockerCount: number,
  commentCount: number,
  dependencyCount: number
}
```

### Agent Registry

Tools for agent observability and coordination. Register your agent for visibility.

#### `scrum_agent_register`

Register your agent with SCRUM. Call at session start for observability.

```
Inputs:
  - agentId (required): Your unique identifier (e.g., "claude-code-a1b2c3")
  - capabilities (required): Array of capabilities (e.g., ["code_review", "testing"])
  - metadata (optional): Metadata object (e.g., {"model": "claude-opus"})

Returns: { status: "registered", agent }
```

#### `scrum_agents_list`

List all registered agents and their status.

```
Inputs:
  - includeOffline (optional): Include offline agents (default: false)

Returns: { count, agents[] }
```

#### `scrum_agent_heartbeat`

Send heartbeat to indicate agent is still active. Agents go offline after 5 minutes.

```
Inputs:
  - agentId (required): Your agent identifier

Returns: { status: "ok", message }
```

### Dead Work Detection

Tools for finding abandoned work that needs attention.

#### `scrum_dead_work`

Find tasks that are in_progress but appear abandoned.

```
Inputs:
  - staleDays (optional): Days threshold for staleness (default: 1)

Returns: {
  count: number,
  tasks: [{
    taskId, title, status,
    assignedAgent, daysStale,
    hasActiveClaims, hasRecentEvidence,
    reason: "no_claims" | "no_activity" | "stale"
  }]
}
```

### Approval Gates

Tools for defining validation steps that must pass before status transitions.

> **⚠️ Security Warning:** Gate commands are stored but NOT automatically executed by SCRUM.
> Agents must execute gate commands themselves and report results via `scrum_gate_run`.
> **Never blindly execute gate commands** from untrusted sources. Validate that commands
> are safe before execution (e.g., reject commands containing shell metacharacters, pipes,
> or redirects unless explicitly allowed).

#### `scrum_gate_define`

Define an approval gate for a task. Gates run commands that must pass.

```
Inputs:
  - taskId (required): Task ID to attach gate to
  - gateType (required): Type ("lint", "test", "build", "review", "custom")
  - command (required): Command to run (e.g., "npm run lint")
  - triggerStatus (required): Status that triggers this gate
  - required (optional): Must pass to transition (default: true)

Returns: { id, taskId, gateType, command, triggerStatus, required, createdAt }
```

#### `scrum_gates_list`

List all gates defined for a task.

```
Inputs:
  - taskId (required): Task ID

Returns: { count, gates[] }
```

#### `scrum_gate_run`

Record a gate run result after executing the gate command.

```
Inputs:
  - gateId (required): Gate ID
  - taskId (required): Task ID
  - agentId (required): Your identifier
  - passed (required): Whether the gate passed
  - output (optional): Command output
  - durationMs (optional): Execution time in ms

Returns: { id, gateId, taskId, agentId, passed, output, durationMs, createdAt }
```

#### `scrum_gate_status`

Get gate status for a task and target status transition.

```
Inputs:
  - taskId (required): Task ID
  - forStatus (required): Status to check gates for

Returns: {
  allPassed: boolean,
  gates: [{ gate, lastRun, status }],
  blockedBy: Gate[]
}
```

### Task Templates

Tools for creating and using reusable task patterns.

#### `scrum_template_create`

Create a reusable task template with pre-configured settings.

```
Inputs:
  - name (required): Unique template name
  - titlePattern (required): Title with {{placeholders}}
  - descriptionTemplate (optional): Description with {{placeholders}}
  - defaultStatus (optional): Default status
  - defaultPriority (optional): Default priority
  - defaultLabels (optional): Default labels array
  - defaultStoryPoints (optional): Default story points
  - gates (optional): Pre-configured gates array
  - checklist (optional): Acceptance checklist items

Returns: { id, name, titlePattern, ... }
```

#### `scrum_template_get`

Get a task template by name or ID.

```
Inputs:
  - nameOrId (required): Template name or ID

Returns: { template }
```

#### `scrum_templates_list`

List all available task templates.

```
Returns: { count, templates[] }
```

#### `scrum_task_from_template`

Create a new task from a template with variable substitution.

```
Inputs:
  - template (required): Template name or ID
  - variables (required): Substitutions (e.g., {"issue": "Bug in login"})
  - overrides (optional): Override template defaults

Returns: { status: "ok", task, fromTemplate }
```

### Webhooks

Tools for event notifications to external systems.

> **⚠️ Security Notes:**
> - **SSRF Protection:** In production, validate webhook URLs to block internal/private IPs
>   (localhost, 10.x, 172.16-31.x, 192.168.x). SCRUM does not currently enforce this.
> - **HMAC Signing:** The `secret` field is stored but HMAC signing is not yet implemented.
>   Webhook payloads are sent unsigned. Future versions will add `X-SCRUM-Signature` header.

#### `scrum_webhook_register`

Register an outbound webhook for event notifications.

```
Inputs:
  - name (required): Webhook name
  - url (required): Webhook URL
  - events (required): Events to subscribe to:
    - "task.created", "task.updated", "task.completed"
    - "intent.posted", "claim.created", "claim.conflict", "claim.released"
    - "evidence.attached", "gate.passed", "gate.failed"
  - headers (optional): Custom headers
  - secret (optional): Secret for HMAC signing

Returns: { id, name, url, events, enabled, createdAt }
```

#### `scrum_webhooks_list`

List all registered webhooks.

```
Inputs:
  - enabledOnly (optional): Only show enabled webhooks

Returns: { count, webhooks[] }
```

#### `scrum_webhook_update`

Update a webhook configuration.

```
Inputs:
  - webhookId (required): Webhook ID
  - url (optional): New URL
  - events (optional): New events
  - headers (optional): New headers
  - enabled (optional): Enable/disable webhook

Returns: { webhook }
```

#### `scrum_webhook_delete`

Delete a webhook.

```
Inputs:
  - webhookId (required): Webhook ID

Returns: { deleted: true }
```

#### `scrum_webhook_deliveries`

Get recent delivery history for a webhook.

```
Inputs:
  - webhookId (required): Webhook ID
  - limit (optional): Max deliveries (default: 50)

Returns: { count, deliveries[] }
```

### Changelog Extensions

The changelog tools now support task-related event types.

#### `scrum_changelog_log`

Log a change event. Now supports task workflow events.

```
Inputs:
  - taskId (required): Task ID
  - agentId (required): Your identifier
  - eventType (required): Event type including:
    - Core: "file_edit", "test_run", "build", "deploy"
    - Task: "status_change", "assignment", "blocker_added", "blocker_resolved",
            "dependency_added", "comment_added", "priority_change"
  - details (required): Event details (object)
  - files (optional): Related file paths

Returns: { id, taskId, agentId, eventType, details, createdAt }
```

#### `scrum_changelog_search`

Search changelog entries. Can filter by task event types.

```
Inputs:
  - taskId (optional): Filter by task
  - agentId (optional): Filter by agent
  - eventType (optional): Filter by event type
  - since (optional): ISO 8601 timestamp for start of range
  - limit (optional): Max results (default: 100)

Returns: ChangelogEntry[]
```

## Resources

The MCP server also exposes these resources:

- `scrum://contract` - The SCRUM agent rules (markdown)
- `scrum://status` - Current server status (JSON)

## Typical Workflow

Here's how an agent should use SCRUM for basic file coordination:

```
1. Check status
   -> scrum_status

2. Create or find task
   -> scrum_task_create { title: "Fix auth bug" }
   -> Returns: { id: "abc123", ... }

3. Check for conflicts
   -> scrum_overlap_check { files: ["src/auth.ts"] }
   -> Returns: { hasOverlaps: false, ... }

4. Declare intent
   -> scrum_intent_post {
       taskId: "abc123",
       agentId: "claude-code",
       files: ["src/auth.ts"],
       boundaries: "No changes to session handling",
       acceptanceCriteria: "Auth tests pass"
     }

5. Claim files
   -> scrum_claim {
       agentId: "claude-code",
       files: ["src/auth.ts"],
       ttlSeconds: 900
     }

6. Make your changes (edit the files)

7. Attach evidence
   -> scrum_evidence_attach {
       taskId: "abc123",
       agentId: "claude-code",
       command: "npm test -- --grep auth",
       output: "12 tests passed"
     }

8. Release claims
   -> scrum_claim_release { agentId: "claude-code" }
```

## Kanban Workflow

For teams using the full kanban workflow:

```
1. View the board
   -> scrum_board { includeMetrics: true }

2. Check WIP limits before starting
   -> scrum_wip_status
   -> Ensure in_progress column has capacity

3. Pick a task from todo
   -> scrum_task_ready { taskId: "abc123" }
   -> Verify dependencies are satisfied

4. Move task to in_progress
   -> scrum_task_update {
       taskId: "abc123",
       status: "in_progress",
       assignee: "claude-code"
     }

5. Log the status change
   -> scrum_changelog_log {
       taskId: "abc123",
       agentId: "claude-code",
       eventType: "status_change",
       details: { from: "todo", to: "in_progress" }
     }

6. If blocked, record it
   -> scrum_blocker_add {
       taskId: "abc123",
       agentId: "claude-code",
       description: "Waiting for API spec",
       blockerType: "dependency"
     }

7. Add comments for context
   -> scrum_comment_add {
       taskId: "abc123",
       agentId: "claude-code",
       content: "Started investigation, auth module needs refactor first"
     }

8. When blocker resolved
   -> scrum_blocker_resolve {
       blockerId: "blocker-456",
       agentId: "claude-code",
       resolution: "API spec received and reviewed"
     }

9. Complete work and move to review
   -> scrum_task_update {
       taskId: "abc123",
       status: "review"
     }

10. After review, move to done
    -> scrum_task_update {
        taskId: "abc123",
        status: "done"
      }

11. Check team metrics
    -> scrum_metrics { days: 7 }
    -> scrum_velocity { periods: 4, periodType: "week" }
```

## Multi-Agent Coordination

When multiple agents work on related tasks:

```
1. Set up dependencies
   -> scrum_dependency_add {
       taskId: "frontend-task",
       dependsOnTaskId: "api-task",
       dependencyType: "blocks"
     }

2. Check what you're waiting on
   -> scrum_dependencies_get {
       taskId: "frontend-task",
       direction: "upstream"
     }

3. Find tasks ready to work on
   -> scrum_board
   -> For each candidate: scrum_task_ready { taskId }

4. Monitor aging work
   -> scrum_aging_wip { thresholdDays: 2 }

5. Coordinate via comments
   -> scrum_comment_add {
       taskId: "shared-task",
       agentId: "agent-1",
       content: "@agent-2 I've finished the model layer, you can start the controller"
     }
```

## Environment Variables

The MCP server respects these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SCRUM_DB_PATH` | `.scrum/scrum.sqlite` | SQLite database path |
| `SCRUM_REPO_ROOT` | `.` | Repository root for file watching |

## Troubleshooting

### "Database is locked"

Only one process can write to SQLite at a time. Make sure you're not running multiple SCRUM servers against the same database.

### Claims not working

Claims are per-agent, identified by `agentId`. Make sure each agent uses a consistent, unique identifier.

### Tool not appearing

1. Check your MCP config path is absolute
2. Verify the build: `npm run build`
3. Test manually: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm run mcp`

### WIP limit exceeded

If `scrum_wip_status` shows a column over limit, you have options:
1. Complete or move existing tasks before adding new ones
2. Increase the limit with `scrum_wip_limits_set`
3. The system warns but doesn't block - use team discipline

### Dependencies blocking progress

Use `scrum_task_ready` to check if a task can start. If blocked:
1. Check `blockedBy` array in the response
2. Prioritize completing blocking tasks
3. Or remove the dependency if no longer needed

## Multi-Agent Setup

When running multiple agents:

1. Each agent needs a unique `agentId` (e.g., "claude-code-1", "cursor-agent")
2. All agents should point to the same `SCRUM_DB_PATH`
3. Use `scrum_overlap_check` before claiming to avoid conflicts
4. Keep claim TTLs short (5-15 minutes) to avoid blocking others
5. Use dependencies to coordinate work order between agents
6. Add comments to communicate status and handoffs

## The SCRUM Contract

See [agents.md](agents.md) for the full contract, but the key rules are:

1. **Evidence is currency** - No receipts, no merge
2. **Intent before edits** - Declare what you'll change
3. **Claims prevent collisions** - Lock files before editing
4. **No silent failure** - Log errors, don't swallow them
5. **Small changes win** - Split large changes
6. **Respect WIP limits** - Don't overload the system
7. **Dependencies matter** - Check readiness before starting
8. **Document blockers** - Make impediments visible
