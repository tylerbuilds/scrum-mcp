# Changelog

All notable changes to SCRUM MCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-17

### Added

**Governance Pillars: State, Policy, and Verification**

SCRUM MCP now serves as a full governance layer (pillars 3-5) for multi-agent systems.

**RBAC on Tools (Policy)**
- **`scrum_agent_set_role`** - Assign roles to agents (admin/lead/developer/reviewer/observer)
- **`scrum_agent_permissions`** - View effective tool permissions for any agent
- 5 built-in roles with default tool sets; custom per-agent overrides supported
- Permission guard blocks unauthorized tool calls at MCP level
- REST: `PATCH /api/agents/:agentId/role`, `GET /api/agents/:agentId/permissions`

**Budget Tracking (State + Policy)**
- **`scrum_budget_log`** - Log token/cost usage per agent per task
- **`scrum_budget_status`** - Check usage vs limits with exceeded/warning flags
- **`scrum_budget_limit_set`** - Set spending limits (per-agent, per-task, or global)
- Period support: task, daily, sprint with automatic aggregation
- Warning at 80% of limit, block at 100%
- REST: `POST/GET /api/budgets`, `POST/GET/DELETE /api/budgets/limits`, `GET /api/budgets/status/:agentId`

**Compliance History (Verification)**
- **`scrum_compliance_history`** - Query historical compliance data with trend analysis
- Every compliance check auto-recorded to `compliance_history` table
- Trend analysis: avg score, compliance rate, score timeline per agent
- REST: `GET /api/compliance/history`, `GET /api/compliance/trend/:agentId`

**Knowledge Base (State)**
- **`scrum_knowledge_add`** - Add persistent knowledge entries (lesson/sop/architecture/pitfall/decision)
- **`scrum_knowledge_search`** - Full-text search via SQLite FTS5 with ranked results
- **`scrum_knowledge_promote`** - Promote sprint shares to permanent knowledge
- Survives across sprints; soft-delete archiving
- REST: `POST/GET/PATCH/DELETE /api/knowledge`, `GET /api/knowledge/search`, `POST /api/knowledge/promote`

### Changed

- Total MCP tools: 35 → 44
- Database schema: 4 new tables (budget_entries, budget_limits, compliance_history, knowledge + knowledge_fts)
- Agents table extended with role and allowed_tools_json columns

---

## [0.6.1] - 2026-03-14

### Added

- **`paperclip-inbox-inject.timer`** — systemd timer runs inbox pre-processor every 9 minutes to keep agent context fresh between heartbeat cycles
- **Auto-unblock script** for sequential workflow dependencies — automatically progresses blocked issues when predecessor tasks complete

### Fixed

- **OpenClaw gateway 2026.3.13 scope enforcement** — patched `authorizeGatewayMethod` and `AgentParamsSchema` for backward compatibility with `operator.write` scope
- **Socrates quality auditor** now queries company-wide `in_review` items instead of only own assignments, enabling proper cross-agent auditing

### Changed

- **Quality gate pipeline enforced** — agents set status to `in_review` (never `done`), Socrates audits and approves/rejects before work is marked complete

---

## [0.6.0] - 2026-03-10

### Added

**Paperclip Integration**

Bridges SCRUM MCP coordination to Paperclip's autonomous agent platform, enabling receipt-based accountability for AI agents that operate on heartbeat cycles.

- **`paperclip-adapter`** module — bridges SCRUM MCP coordination primitives (intents, claims, evidence) to Paperclip's heartbeat system
- **Inbox pre-processor** (`scripts/inject-inbox.py`) — materializes agent inboxes into heartbeat prompts for agents that lack direct tool access (e.g., agents routed through chat gateways without API calling ability)
- **Agent prompt templates** with embedded heartbeat protocol — agents receive role-specific instructions + their issue queue in every heartbeat cycle
- **Sequential issue unblocking** — automatic status progression when predecessor tasks complete, removing manual dependency management
- **Ghost CMS Admin API integration guide** for content management agents (Muse, content pipeline)
- **Mandatory delegation rules** — configurable routing that forces specific skills to be handled by specialist agents (e.g., security audits always routed to Aegis)

### Changed

- Evidence receipt format now includes Paperclip issue IDs for cross-referencing between SCRUM MCP tasks and Paperclip issues
- Documentation updated with Paperclip integration guide (new page on marketing site)

### Performance

- Agent productivity improved from ~2.8KB/15s (empty pings) to 175KB/186s (real work output) per heartbeat cycle
- 12 issues completed in first 2 hours after integration activation (was 0 per cycle before)

---

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

### 0.5.0 → 0.6.0

No breaking changes to existing SCRUM MCP tools. The Paperclip adapter is additive.

To use the inbox pre-processor:
```bash
python3 scripts/inject-inbox.py
```

To enable the systemd timer (v0.6.1):
```bash
systemctl --user enable --now paperclip-inbox-inject.timer
```

### 0.6.0 → 0.6.1

No breaking changes. Stability fixes and automation additions.

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

### 0.5.x → 1.0.0

No breaking changes. All new features are additive. Existing agents default to 'developer' role with full backward compatibility.

New database tables are created automatically on first run. Existing SQLite databases are migrated seamlessly.
