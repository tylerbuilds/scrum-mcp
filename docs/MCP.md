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

Get current SCRUM server status and available tools. **v0.6.0+**: Use profile to filter tool recommendations.

```
Inputs:
  - profile (optional): Tool profile
    - "solo": Core tools for individual work (13 tools)
    - "team": + collaboration tools (22 tools)
    - "full": All tools including Sprint (32 tools) [default]

Returns: { tasks, intents, claims, evidence, now, profile, recommendedTools, toolCount }
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

Release your claims when done editing. **Enforces compliance check** - will reject if:
- You modified files not declared in your intent
- You touched files declared as boundaries (off-limits)

```
Inputs:
  - agentId (required): Your identifier
  - files (optional): Specific files to release (omit to release all)

Returns:
  - Success: { status: "ok", released }
  - Blocked: { status: "rejected", reason: "COMPLIANCE_FAILED", message, nextSteps }
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

#### `scrum_compliance_check`

**v0.4.0+** - Verify your work matches your declared intent. Call this before releasing claims to see your compliance status. Returns actionable feedback if violations are found.

```
Inputs:
  - taskId (required): Task ID to check
  - agentId (required): Your agent identifier

Returns:
  compliant: boolean       # Overall compliance status
  score: number           # 0-100 compliance score
  canComplete: boolean    # Whether task can be marked done
  checks:
    intentPosted:         # Did you post intent? (20 points)
    evidenceAttached:     # Did you attach evidence? (20 points)
    filesMatch:           # Modified files match declared? (30 points)
      declared: string[]  # Files you said you'd modify
      modified: string[]  # Files you actually modified
      undeclared: string[]# Modified but not declared (VIOLATION)
      unmodified: string[]# Declared but not modified (warning)
    boundariesRespected:  # Did you avoid boundary files? (20 points)
      boundaries: string[]# Files you said you wouldn't touch
      violations: string[]# Boundary files you touched (VIOLATION)
    claimsReleased:       # Claims released? (10 points)
  summary: string         # Human-readable summary
  nextSteps: string[]     # What to do to fix violations
```

**Scoring:**
- 100: Perfect compliance
- 70-99: Minor issues (warnings)
- <70: Blocked from completing

**Example workflow:**
```
1. scrum_compliance_check(taskId, agentId)
2. If violations found, fix them (update intent or revert changes)
3. Re-check until compliant
4. scrum_claim_release(agentId)  # Now succeeds
```

#### `scrum_overlap_check`

Check if files are claimed by other agents before starting work.

```
Inputs:
  - files (required): Array of file paths to check

Returns: { hasOverlaps, overlaps[], checkedFiles }
```

### Sprint Collaboration (v0.5.0)

Sprint is a shared context space where multiple agents working on the same task can coordinate. Use Sprint when orchestrating sub-agents or when multiple agents need to integrate their work.

**Configuration:** Set `SCRUM_SPRINT_ENABLED=false` to disable Sprint features.

#### `scrum_sprint_create`

Create a sprint for collaborative work on a task.

```
Inputs:
  - taskId (required): Task to associate with sprint
  - name (optional): Sprint name (max 200 chars)
  - goal (optional): Sprint goal description (max 2000 chars)

Returns: { id, taskId, name, goal, status, createdAt }
```

#### `scrum_sprint_join`

Join a sprint as a participating agent. Call this before starting work.

```
Inputs:
  - sprintId (required): Sprint to join
  - agentId (required): Your unique identifier
  - workingOn (required): What you're implementing
  - focusArea (optional): Your focus area (e.g., "backend", "frontend", "tests", "api", "auth")

Returns: { member, teamSize, teammates, message }
```

#### `scrum_sprint_context` (Consolidated - v0.6.0)

**CRITICAL: Call this before starting work.** Get full sprint context including what teammates are doing, decisions made, and interfaces defined. Combines the former `sprint_context` and `sprint_check` tools.

```
Inputs:
  - sprintId (required): Sprint ID
  - agentId (optional): Your agent ID for personalized info (teammates, relevant shares)
  - focusArea (optional): Filter shares relevant to your focus area
  - includeUpdates (optional): Include full share details (default: false for summary only)

Returns: {
  sprint: Sprint,
  members: SprintMember[],
  allFiles: string[],        # Files being worked on
  allBoundaries: string[],   # Files marked as off-limits
  summary: {
    memberCount, decisionsCount, interfacesCount,
    discoveriesCount, integrationsCount, unansweredQuestionsCount
  },
  decisions: SprintShare[],
  interfaces: SprintShare[],
  unansweredQuestions: SprintShare[],
  // If agentId provided:
  teammates: [{ agentId, workingOn, focusArea }],
  relevantToYourFocus: number | "no focus area set"
}
```

#### `scrum_sprint_share`

Share context with your teammates. This is how you communicate decisions, interfaces, discoveries, and questions.

```
Inputs:
  - sprintId (required): Sprint ID
  - agentId (required): Your identifier
  - shareType (required): One of:
      - "context": Background information
      - "decision": Architectural/design choice
      - "interface": API contract or function signature
      - "discovery": Something learned about the codebase
      - "integration": How to connect with your code
      - "question": Ask teammates for help
      - "answer": Reply to a question
  - title (required): Short title (max 200 chars)
  - content (required): Detailed content (max 5000 chars)
  - relatedFiles (optional): Array of related file paths
  - replyToId (optional): Share ID this answers (for "answer" type)

Returns: { id, sprintId, agentId, shareType, title, content, createdAt }
```

#### `scrum_sprint_leave`

Leave a sprint when your work is complete.

```
Inputs:
  - sprintId (required): Sprint ID
  - agentId (required): Your identifier

Returns: { status, left, message }
```

#### `scrum_sprint_members`

List all agents currently in a sprint.

```
Inputs:
  - sprintId (required): Sprint ID

Returns: { sprintId, count, members }
```

#### `scrum_sprint_shares`

List shared context items, optionally filtered by type.

```
Inputs:
  - sprintId (required): Sprint ID
  - shareType (optional): Filter by type
  - limit (optional): Max results (default 100)

Returns: { sprintId, count, shares }
```

#### `scrum_sprint_get` (Consolidated - v0.6.0)

Get sprint by ID OR find active sprint for a task. Provide either `sprintId` or `taskId`.

```
Inputs:
  - sprintId (optional): Sprint ID to retrieve directly
  - taskId (optional): Task ID to find active sprint for

  NOTE: Provide sprintId OR taskId (not both)

Returns: { sprint, members } or { status: "no_sprint", message } if no sprint found for task
```

#### `scrum_sprint_list`

List sprints with optional filters.

```
Inputs:
  - taskId (optional): Filter by task
  - status (optional): Filter by status ("active", "completed", "abandoned")

Returns: { count, sprints }
```

#### `scrum_sprint_complete`

Mark a sprint as completed.

```
Inputs:
  - sprintId (required): Sprint ID

Returns: { status, sprint, message }
```

**Sprint Workflow Example:**

```
# Orchestrator creates sprint
sprint = scrum_sprint_create(taskId: "auth-task", goal: "Implement full auth")

# Sub-agents join with their focus
scrum_sprint_join(sprint.id, "agent-backend", workingOn: "JWT service", focusArea: "backend")
scrum_sprint_join(sprint.id, "agent-frontend", workingOn: "Login form", focusArea: "frontend")

# Backend agent shares decisions and interfaces
scrum_sprint_share(sprint.id, "agent-backend", "decision", "Using bcrypt for passwords", "...")
scrum_sprint_share(sprint.id, "agent-backend", "interface", "AuthService API", "POST /auth/signin...")

# Frontend agent checks context before coding (now includes personalized info)
context = scrum_sprint_context(sprint.id, agentId: "agent-frontend", focusArea: "frontend")
# → Now knows about bcrypt decision, API contract, and teammates

# Frontend agent asks a question
scrum_sprint_share(sprint.id, "agent-frontend", "question", "Where to store refresh token?", "...")

# Backend agent sees and answers
scrum_sprint_share(sprint.id, "agent-backend", "answer", "Use httpOnly cookies", "...", replyToId: question.id)

# Agents do their work (standard SCRUM: intent → claim → edit → changelog → evidence)
# Periodic check for updates (same consolidated tool)
scrum_sprint_context(sprint.id, agentId: "agent-frontend", includeUpdates: true)

# When done
scrum_sprint_leave(sprint.id, "agent-frontend")
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

#### `scrum_blocker` (Consolidated - v0.6.0)

Manage blockers on tasks. **Actions: add, resolve, list**.

```
Inputs:
  - action (required): "add", "resolve", or "list"

  For add:
    - taskId (required): Task ID
    - description (required): What is blocking progress
    - blockingTaskId (optional): Task causing the block
    - agentId (required): Your identifier

  For resolve:
    - blockerId (required): Blocker ID to resolve

  For list:
    - taskId (required): Task ID
    - unresolvedOnly (optional): Only show unresolved (default: false)

Returns: Action-specific result with blocker details
```

#### `scrum_dependency` (Consolidated - v0.6.0)

Manage task dependencies. **Actions: add, remove, get, check**.

```
Inputs:
  - action (required): "add", "remove", "get", or "check"

  For add:
    - taskId (required): Task that has the dependency
    - dependsOnTaskId (required): Task that must complete first

  For remove:
    - dependencyId (required): Dependency ID to remove

  For get:
    - taskId (required): Task ID to get dependencies for

  For check:
    - taskId (required): Task ID to check readiness

Returns: Action-specific result with dependency/readiness info
```

### Metrics (Consolidated - v0.6.0)

**`scrum_metrics`** - Unified metrics tool with multiple types.

```
Inputs:
  - type (optional): "board", "velocity", "aging", or "task" (default: "board")

  For board:
    - since (optional): Start timestamp
    - until (optional): End timestamp
  Returns: { cycleTime, leadTime, throughput, completedTasks, period }

  For velocity:
    - periodDays (optional): Days per period (default: 7)
    - periods (optional): Number of periods (default: 4)
  Returns: { periodDays, periods[], summary }

  For aging:
    - thresholdDays (optional): Days threshold (default: 2)
  Returns: { thresholdDays, count, tasks[], message }

  For task:
    - taskId (required): Task ID
  Returns: { taskId, cycleTime, leadTime, timeInStatus, ... }
```

### Dead Work Detection

Find abandoned work that needs attention.

#### `scrum_dead_work`

Find tasks that are in_progress but appear abandoned.

```
Inputs:
  - staleDays (optional): Days threshold for staleness (default: 1)

Returns: {
  staleDays: number,
  count: number,
  tasks: Task[],
  message: string
}
```

### REST-Only Admin Tools (v0.6.0)

The following features are available via REST API only (not MCP) to reduce agent tool count:

- **WIP Limits**: `/api/wip-limits` - GET, PUT
- **Agent Registry**: `/api/agents` - GET, POST (register, list, heartbeat)
- **Approval Gates**: `/api/gates` - CRUD operations
- **Task Templates**: `/api/templates` - CRUD operations
- **Webhooks**: `/api/webhooks` - CRUD operations

See the REST API documentation for details.

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
| `SCRUM_STRICT_MODE` | `true` | Enable compliance enforcement on REST API (see below) |
| `SCRUM_PORT` | `4177` | HTTP/WebSocket server port |
| `SCRUM_BIND` | `127.0.0.1` | Server bind address |
| `SCRUM_LOG_LEVEL` | `info` | Log level (fatal/error/warn/info/debug/trace/silent) |
| `SCRUM_RATE_LIMIT_RPM` | `300` | API rate limit per minute |
| `SCRUM_AUTH_ENABLED` | `false` | Enable API key authentication |
| `SCRUM_API_KEYS` | - | Comma-separated API keys (if auth enabled) |

### Strict Mode

When `SCRUM_STRICT_MODE=true` (the default), the REST API enforces compliance on:

1. **Claim Release** (`DELETE /api/claims`) - Blocked if:
   - Modified files not declared in intent
   - Boundary files (declared as off-limits) were touched

2. **Task Completion** (`PATCH /api/tasks/:id` to status `done`) - Blocked if:
   - Any agent working on the task has failed compliance

Set `SCRUM_STRICT_MODE=false` to allow dashboard/human overrides for edge cases.

**Note:** MCP tools always enforce compliance regardless of this setting.

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

### Sprint Collaboration (v0.5.0)

For complex tasks requiring multiple agents to integrate:

1. **Orchestrator** creates a Sprint: `scrum_sprint_create(taskId, goal)`
2. **Sub-agents** join with focus areas: `scrum_sprint_join(sprintId, agentId, workingOn, focusArea)`
3. **Before coding**, check context: `scrum_sprint_context(sprintId)`
4. **Share decisions** and interfaces: `scrum_sprint_share(sprintId, agentId, shareType, title, content)`
5. **Check periodically**: `scrum_sprint_check(sprintId, agentId)`
6. **Answer questions** from teammates via `shareType: "answer"` with `replyToId`
7. **Leave when done**: `scrum_sprint_leave(sprintId, agentId)`

This prevents integration mismatches where agents build incompatible code.

See [docs/AGENT_INSTRUCTIONS.md](AGENT_INSTRUCTIONS.md) for the complete agent workflow guide.

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
