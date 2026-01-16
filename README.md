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
- **Compliance verification** (ensure agents do what they declared)
- **Sprint collaboration** (shared context for multi-agent teams)

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

### Autostart on Boot (Linux systemd)

```bash
# Install the API service
sudo cp dashboard/scrum-api.service /etc/systemd/system/
sudo systemctl daemon-reload

# Enable autostart on boot
sudo systemctl enable scrum-api

# Start now
sudo systemctl start scrum-api

# Check status
systemctl status scrum-api

# View logs
journalctl -u scrum-api -f

# Optional: React dashboard service (production preview)
sudo cp dashboard/scrum-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable scrum-frontend
sudo systemctl start scrum-frontend
systemctl status scrum-frontend
journalctl -u scrum-frontend -f
```

The services run on:
- **SCRUM API**: http://localhost:4177
- **React Dashboard**: http://localhost:5174

## Frontend Dashboard (Full React)

SCRUM also includes a full React dashboard with more features.

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
- `SCRUM_STRICT_MODE` (default `true`) - Enforce compliance on REST API
- `SCRUM_SPRINT_ENABLED` (default `true`) - Enable Sprint collaboration features

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

**Approval Gates** (v0.3.0)

| Tool | Description |
|------|-------------|
| `scrum_gate_define` | Define lint/test/build/review gate for a task |
| `scrum_gates_list` | List gates for a task |
| `scrum_gate_run` | Record gate execution result |
| `scrum_gate_status` | Check if all gates pass for status transition |

**Task Templates** (v0.3.0)

| Tool | Description |
|------|-------------|
| `scrum_template_create` | Create reusable task template with placeholders |
| `scrum_templates_list` | List available templates |
| `scrum_template_use` | Create task from template with variables |

**Webhooks** (v0.3.0)

| Tool | Description |
|------|-------------|
| `scrum_webhook_register` | Register webhook for event notifications |
| `scrum_webhooks_list` | List registered webhooks |
| `scrum_webhook_update` | Update webhook (enable/disable, change events) |
| `scrum_webhook_delete` | Delete a webhook |

**Agent Registry** (v0.3.0)

| Tool | Description |
|------|-------------|
| `scrum_agent_register` | Register agent with capabilities and metadata |
| `scrum_agent_heartbeat` | Send heartbeat to maintain online status |
| `scrum_agents_list` | List registered agents with status |
| `scrum_dead_work` | Find abandoned tasks and stale claims |

**Compliance Verification** (v0.4.0)

| Tool | Description |
|------|-------------|
| `scrum_compliance_check` | Verify work matches declared intent (score, violations, next steps) |

**Sprint Collaboration** (v0.5.0)

| Tool | Description |
|------|-------------|
| `scrum_sprint_create` | Create a sprint for multi-agent collaboration on a task |
| `scrum_sprint_join` | Join a sprint with your focus area |
| `scrum_sprint_context` | Get full sprint context (decisions, interfaces, discoveries) |
| `scrum_sprint_share` | Share decisions, interfaces, discoveries, questions with teammates |
| `scrum_sprint_check` | Periodic sync to see teammate updates and unanswered questions |
| `scrum_sprint_leave` | Leave sprint when your work is complete |
| `scrum_sprint_members` | List all agents in a sprint |
| `scrum_sprint_shares` | List shared context items (filtered by type) |

See [docs/MCP.md](docs/MCP.md) for detailed tool documentation.
See [docs/AGENT_INSTRUCTIONS.md](docs/AGENT_INSTRUCTIONS.md) for agent workflow guide.

## Enforced Workflow

SCRUM enforces quality at the server level:

1. **Intent before claim** - `scrum_claim` rejects if no intent declared
2. **Evidence before release** - `scrum_claim_release` rejects if no evidence attached
3. **Acceptance criteria required** - `scrum_intent_post` requires criteria (min 10 chars)
4. **Dependency check** - `scrum_task_ready` verifies all dependencies are done before starting
5. **WIP limit warnings** - `scrum_task_update` warns when column limits are exceeded
6. **Compliance verification** (v0.4) - `scrum_claim_release` checks that modified files match declared intent
7. **Boundary protection** (v0.4) - Files marked as boundaries cannot be touched
8. **Sprint context** (v0.5) - Multi-agent teams share decisions and interfaces before coding

This prevents agents from cutting corners and ensures multi-agent coordination.

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
4. ~~Add approval gates that define validation steps before status transitions.~~ Done! (v0.3.0)
5. ~~Add task templates with placeholder interpolation.~~ Done! (v0.3.0)
6. ~~Add webhooks for event notifications.~~ Done! (v0.3.0)
7. ~~Add agent registry for observability.~~ Done! (v0.3.0)
8. ~~Add compliance verification to ensure agents do what they declared.~~ Done! (v0.4.0)
9. ~~Add Sprint collaboration for multi-agent teams.~~ Done! (v0.5.0)
10. Add symbol-level overlap detection (tree-sitter) once file-level is proving useful.
11. Add HMAC signing for webhook payloads.

## Documentation

- [MCP Tool Reference](docs/MCP.md) - Complete tool documentation
- [Agent Instructions](docs/AGENT_INSTRUCTIONS.md) - Workflow guide for AI agents
- [Case Study](docs/CASE_STUDY.md) - Multi-agent coordination evolution
- [IDE Setup](docs/IDE-SETUP.md) - Setup guides for Claude Code, Cursor, etc.
- [Operations Guide](docs/OPERATIONS.md) - Production deployment

## Author

Created by **Tyler Casey**

- X/Twitter: [x.com/TylerIsBuilding](https://x.com/TylerIsBuilding)
- More projects: [tylerbuilds.com](https://tylerbuilds.com)
