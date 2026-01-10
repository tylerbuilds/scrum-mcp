# SCRUM

SCRUM (Synchronized Claims Registry for Unified Multi-agents) is a local-first coordination layer for building a software dev team out of multiple coding agents.

The goal is simple: agents can work in chaos, but they can also see each other. SCRUM provides:

- **Kanban board** (status tracking: backlog, todo, in_progress, review, done)
- **Intent announcements** (what an agent plans to change)
- **Claims** (who owns which files for a short time)
- **Overlap detection** (conflicts before they become merge carnage)
- **Dependencies** (task ordering and readiness checks)
- **Comments & blockers** (collaboration and impediment tracking)
- **Evidence receipts** (commands run, outputs captured)
- **WIP limits** (prevent overloading columns)
- **Metrics** (cycle time, lead time, velocity, aging WIP)
- **Real-time events** (file change stream, task updates, gate results)

## No surprises policy

- SCRUM never auto-edits your repo.
- It never phones home.
- It logs what it is doing and why.
- Anything destructive is behind an explicit command.

## Quick start

Prereqs: Node.js 20+.

```bash
npm install
npm run dev
```

In a second terminal:

```bash
npm run build
npm run cli -- status
```

Default endpoints:

- API: `http://localhost:4177/api`
- WebSocket: `ws://localhost:4177/ws`
- Dashboard: `http://localhost:5174` (see Frontend section)

## Frontend Dashboard

SCRUM includes a web dashboard to visualise agent activity in real-time.

```bash
# Terminal 1: Start the backend
npm run dev

# Terminal 2: Start the frontend
cd frontend
npm install
npm run dev
```

Open `http://localhost:5174` to access:

**Agent Lobby** - A reddit-style feed showing:
- **Tasks** being worked on
- **Intents** declared by agents
- **Claims** on files (with expiry timers)
- **Evidence** attached as proof of work

**Kanban Board** - Visual task management:
- Drag-and-drop between columns (backlog, todo, in_progress, review, done)
- Priority indicators and assignee badges
- Dependency visualization
- WIP limit warnings

**Metrics Dashboard** - Team performance tracking:
- Cycle time and lead time charts
- Velocity trends
- Aging WIP alerts
- Throughput statistics

Filter by activity type or agent, with auto-refresh every 10 seconds.

## CLI examples

```bash
npm run cli -- task create --title "Fix failing integration test" --description "Repro + fix + evidence"

npm run cli -- intent post --taskId <taskId> --agentId claude-code --files "src/core/*" --acceptance "Tests pass; docs updated" --boundaries "No database schema changes"

npm run cli -- claim --agentId claude-code --files "src/core/router.ts" --ttl 900

npm run cli -- evidence attach --taskId <taskId> --agentId claude-code --command "pytest -q" --output "..."
```

## Architecture

- **Fastify** server with:
  - Helmet headers
  - Rate limiting
  - Zod validation
  - Pino structured logs
- **SQLite** (better-sqlite3) for state (tasks, intents, claims, evidence)
- **Chokidar** for repo file watching
- **WebSocket** for event broadcast to all connected agents

## Configuration

Copy and edit:

```bash
cp .env.example .env
```

Key settings:

- `SCRUM_PORT` (default `4177`)
- `SCRUM_REPO_ROOT` (default `.`)
- `SCRUM_DB_PATH` (default `./.scrum/scrum.sqlite`)
- `SCRUM_RATE_LIMIT_RPM` (default `300`)

## Security posture

Local-first, default-deny, least surprise:

- Only binds to `127.0.0.1` by default
- Rate limits enabled by default
- Helmet security headers enabled by default
- Input validation on all mutating endpoints
- Logs are structured and redactable

See `SECURITY.md` for more.

## MCP Server

SCRUM includes an MCP (Model Context Protocol) server so AI coding agents can coordinate through `scrum_*` tools.

```bash
npm run build
npm run mcp   # stdio transport
```

### IDE Setup

See [docs/IDE-SETUP.md](docs/IDE-SETUP.md) for detailed setup instructions for:
- Claude Code
- Cursor
- Google AntiGravity
- OpenCode
- VS Code with Continue

### Project Templates

Copy templates from `templates/` to enable SCRUM in your projects:

```bash
# For Claude Code
cp templates/CLAUDE.md.template /your/project/CLAUDE.md

# For Cursor
cp templates/.cursorrules.template /your/project/.cursorrules

# For project-level MCP config (any tool)
cp templates/.mcp.json.template /your/project/.mcp.json
# Then edit .mcp.json to set the correct path to SCRUM
```

### Available Tools

**Core Workflow**

| Tool | Description |
|------|-------------|
| `scrum_status` | Get server status (tasks, intents, claims, evidence, changelog) |
| `scrum_task_create` | Create a new task |
| `scrum_task_list` | List recent tasks |
| `scrum_task_get` | Get task with intents and evidence |
| `scrum_task_update` | Update task status, priority, assignee, labels, story points |
| `scrum_intent_post` | Declare intent before editing (required) |
| `scrum_claim` | Claim exclusive file access (requires intent) |
| `scrum_claim_release` | Release claims (requires evidence) |
| `scrum_claims_list` | List all active claims |
| `scrum_overlap_check` | Check for conflicts before claiming |
| `scrum_evidence_attach` | Attach proof of work |
| `scrum_changelog_log` | Log file changes for debugging |
| `scrum_changelog_search` | Search change history |

**Kanban Board**

| Tool | Description |
|------|-------------|
| `scrum_board` | View tasks organized by status column |

**Dependencies**

| Tool | Description |
|------|-------------|
| `scrum_dependency_add` | Add dependency between tasks |
| `scrum_dependency_remove` | Remove a dependency |
| `scrum_dependencies_get` | List dependencies for a task |
| `scrum_task_ready` | Check if all dependencies are done |

**Comments & Blockers**

| Tool | Description |
|------|-------------|
| `scrum_comment_add` | Add comment to a task |
| `scrum_comments_list` | List comments on a task |
| `scrum_blocker_add` | Report a blocker on a task |
| `scrum_blocker_resolve` | Mark a blocker as resolved |
| `scrum_blockers_list` | List blockers on a task |

**WIP Limits**

| Tool | Description |
|------|-------------|
| `scrum_wip_limits_get` | Get current WIP limits |
| `scrum_wip_limits_set` | Configure WIP limits per column |
| `scrum_wip_status` | Check current WIP vs limits |

**Metrics**

| Tool | Description |
|------|-------------|
| `scrum_metrics` | Board metrics (cycle time, lead time, throughput) |
| `scrum_velocity` | Velocity over recent sprints |
| `scrum_aging_wip` | Find tasks stuck in progress too long |
| `scrum_task_metrics` | Metrics for a specific task |

See [docs/MCP.md](docs/MCP.md) for detailed tool documentation.

## Enforced Workflow

SCRUM enforces quality at the server level:

1. **Intent before claim** - `scrum_claim` rejects if no intent declared
2. **Evidence before release** - `scrum_claim_release` rejects if no evidence attached
3. **Acceptance criteria required** - `scrum_intent_post` requires criteria (min 10 chars)
4. **Dependency check** - `scrum_task_ready` verifies all dependencies are done before starting
5. **WIP limit warnings** - `scrum_task_update` warns when column limits are exceeded

This prevents agents from cutting corners.

## Changelog Feature

Track all agent changes for git-bisect-like debugging:

```bash
# Log a change
scrum_changelog_log(agentId, filePath, changeType, summary)

# Search history
scrum_changelog_search(filePath: "broken/file.ts", since: timestamp)
```

Find exactly when and who introduced an issue.

### Auto-Logged Events

The changelog automatically captures:
- `task_created` - New task added
- `task_status_change` - Task moved between columns
- `task_assigned` - Agent assigned to task
- `task_priority_change` - Priority updated
- `task_completed` - Task marked done
- `blocker_added` - Impediment reported
- `blocker_resolved` - Impediment cleared
- `dependency_added` - Task dependency created
- `dependency_removed` - Task dependency removed
- `comment_added` - Discussion comment posted

## Next steps

1. ~~Add MCP server wrapper so Claude Code, Cursor, OpenCode, Codex, AntiGravity can call `scrum.*` tools.~~ Done!
2. ~~Add changelog for debugging when issues were introduced.~~ Done!
3. ~~Add kanban board with status, priority, dependencies, comments, blockers, WIP limits, and metrics.~~ Done!
4. Add a gate runner that can execute your repo-specific checks and publish receipts.
5. Add symbol-level overlap detection (tree-sitter) once file-level is proving useful.

## Author

Created by **Tyler Casey**

- X/Twitter: [x.com/TylerIsBuilding](https://x.com/TylerIsBuilding)
- More projects: [tylerbuilds.com](https://tylerbuilds.com)

