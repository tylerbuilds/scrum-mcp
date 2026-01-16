# Changelog

All notable changes to SCRUM MCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-01-16

### Added

**Sprint: Multi-Agent Collaboration Layer**

Sprint is a shared context space where multiple sub-agents working on the same task can coordinate effectively.

- **`scrum_sprint_create`** - Create a sprint for collaborative work on a task
- **`scrum_sprint_join`** - Join a sprint as a sub-agent with focus area
- **`scrum_sprint_leave`** - Leave a sprint when work is complete
- **`scrum_sprint_members`** - List all agents in a sprint
- **`scrum_sprint_context`** - Get full sprint context (decisions, interfaces, discoveries)
- **`scrum_sprint_share`** - Share context with teammates (7 share types)
- **`scrum_sprint_shares`** - List shared context items
- **`scrum_sprint_check`** - Periodic sync to see teammate updates
- **`scrum_sprint_get`** - Get sprint details
- **`scrum_sprint_for_task`** - Get sprint for a specific task
- **`scrum_sprint_list`** - List sprints with optional filters
- **`scrum_sprint_complete`** - Mark sprint as completed

**Share Types for Sprint Context:**
- `context` - Background information
- `decision` - Architectural/design choices
- `interface` - API contracts and function signatures
- `discovery` - Things learned about the codebase
- `integration` - How to connect with your code
- `question` - Ask teammates for help
- `answer` - Reply to questions (with `replyToId` linking)

**Configuration:**
- `SCRUM_SPRINT_ENABLED` - Feature flag (default: `true`)
  - When disabled, Sprint tools return helpful message directing to standard workflow

**REST API Endpoints:**
- `POST /api/sprints` - Create sprint
- `GET /api/sprints` - List sprints
- `GET /api/sprints/:sprintId` - Get sprint
- `GET /api/tasks/:id/sprint` - Get sprint for task
- `POST /api/sprints/:sprintId/complete` - Complete sprint
- `POST /api/sprints/:sprintId/join` - Join sprint
- `POST /api/sprints/:sprintId/leave` - Leave sprint
- `GET /api/sprints/:sprintId/members` - List members
- `POST /api/sprints/:sprintId/share` - Share context
- `GET /api/sprints/:sprintId/shares` - Get shares
- `GET /api/sprints/:sprintId/context` - Get full context
- `GET /api/sprints/:sprintId/questions` - Get unanswered questions

**Documentation:**
- `docs/AGENT_INSTRUCTIONS.md` - Comprehensive agent workflow guide
- Updated `docs/CASE_STUDY.md` with Sprint section
- Updated `site/prompts.html` with Sprint workflow instructions

### Changed

- Marketing website prompts now include Sprint workflow for multi-agent collaboration
- Case study updated with v0.5 efficiency metrics

---

## [0.4.0] - 2026-01-15

### Added

**Compliance Verification System**

Ensures agents do what they say they will do - turns SCRUM from "trust but record" to "verify before proceed".

- **`scrum_compliance_check`** - Verify work matches declared intent
  - Returns compliance score (0-100)
  - Checks: intent posted, evidence attached, files match, boundaries respected, claims released
  - Provides actionable next steps for non-compliant work

**Enforcement Points:**
- `scrum_claim_release` now blocked if:
  - Files modified that weren't declared in intent (undeclared files)
  - Boundary files were touched (boundary violations)
- `scrum_task_update` (to 'done') blocked if any agent fails compliance

**Configuration:**
- `SCRUM_STRICT_MODE` - Feature flag (default: `true`)
  - When enabled, REST API enforces compliance like MCP tools
  - When disabled, allows human overrides via dashboard

**REST API Endpoints:**
- `GET /api/compliance/:taskId/:agentId` - Check specific agent compliance
- `GET /api/compliance/:taskId` - Check all agents on a task

### Changed

- Intent boundaries are now enforced, not just recorded
- Claim release requires passing compliance check
- Task completion requires all agents to be compliant

---

## [0.3.0] - 2026-01-10

### Added

**Kanban Board Features:**
- `scrum_board` - View tasks organized by status columns
- `scrum_comment_add` / `scrum_comments_list` - Task discussion
- `scrum_blocker_add` / `scrum_blocker_resolve` / `scrum_blockers_list` - Impediment tracking
- `scrum_dependency_add` / `scrum_dependency_remove` / `scrum_dependencies_get` - Task ordering
- `scrum_task_ready` - Check if dependencies are satisfied
- `scrum_wip_limits_get` / `scrum_wip_limits_set` / `scrum_wip_status` - WIP limit management

**Metrics:**
- `scrum_metrics` - Cycle time, lead time, throughput
- `scrum_velocity` - Velocity over sprints
- `scrum_aging_wip` - Find stuck tasks
- `scrum_task_metrics` - Per-task metrics

**Approval Gates:**
- `scrum_gate_define` - Define lint/test/build gates
- `scrum_gates_list` - List gates for a task
- `scrum_gate_run` - Record gate execution
- `scrum_gate_status` - Check if all gates pass

**Task Templates:**
- `scrum_template_create` - Create reusable templates with placeholders
- `scrum_templates_list` - List templates
- `scrum_template_use` - Create task from template

**Webhooks:**
- `scrum_webhook_register` / `scrum_webhooks_list` / `scrum_webhook_update` / `scrum_webhook_delete`

**Agent Registry:**
- `scrum_agent_register` / `scrum_agent_heartbeat` / `scrum_agents_list` / `scrum_dead_work`

**Orthanc Dashboard:**
- Lightweight zero-dependency dashboard on port 4398
- Live feed with auto-refresh
- Searchable across all entities

---

## [0.2.0] - 2026-01-05

### Added

**Enforced Workflow:**
- Intent required before claiming files
- Evidence required before releasing claims
- Acceptance criteria mandatory (min 10 chars)

**Changelog for Debugging:**
- `scrum_changelog_log` - Log file changes
- `scrum_changelog_search` - Search history by file, agent, time range
- Auto-logging of task events (status changes, assignments, blockers)

**Frontend Dashboard:**
- Agent Lobby (reddit-style feed)
- Kanban Board (drag-and-drop)
- Metrics Dashboard
- Real-time WebSocket updates

---

## [0.1.0] - 2026-01-01

### Added

Initial release with core coordination features:

- **Tasks** - Create, list, get, update tasks
- **Intents** - Declare planned changes before editing
- **Claims** - Lock files for exclusive editing
- **Evidence** - Attach proof of work
- **Overlap Detection** - Check for file conflicts

**MCP Server:**
- stdio transport for AI agent integration
- Works with Claude Code, Cursor, Continue, AntiGravity

**REST API:**
- Full CRUD for all entities
- Rate limiting
- Helmet security headers
- Zod validation

**WebSocket:**
- Real-time event broadcast
- File change notifications

---

## Migration Notes

### 0.4.0 → 0.5.0

No breaking changes. Sprint tools are additive.

To disable Sprint features:
```bash
SCRUM_SPRINT_ENABLED=false npm start
```

### 0.3.0 → 0.4.0

Breaking behavior change: `scrum_claim_release` now enforces compliance.

If you have scripts that release claims without proper intent/evidence:
1. Update to post intent with accurate file list
2. Log changes to changelog
3. Attach evidence before releasing

Or disable strict mode for REST API:
```bash
SCRUM_STRICT_MODE=false npm start
```

Note: MCP tools always enforce compliance regardless of strict mode.
