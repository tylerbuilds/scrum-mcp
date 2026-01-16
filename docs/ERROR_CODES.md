# SCRUM MCP Error Codes Reference

This document provides a comprehensive reference for all error codes, messages, and recovery strategies when using SCRUM MCP tools.

## Error Categories

### 4xx Client Errors

#### NOT_FOUND (404)

**Error Code:** `NOT_FOUND`

**HTTP Status:** 404

**Pattern:** `{resource} not found: {id}`

**Examples:**
- `Task not found: abc123`
- `Template not found: bugfix`
- `Blocker not found: xyz789`
- `Gate not found: gate123`
- `Webhook not found: hook456`
- `Comment not found: com789`
- `Dependency not found: dep123`

**Cause:** The requested resource does not exist in the database. This can occur when:
- The ID was mistyped
- The resource was deleted
- The resource was never created
- Using an ID from a different SCRUM instance

**Recovery:**
1. Verify the ID is correct (check for typos)
2. Use the corresponding list tool to find valid IDs:
   - `scrum_task_list` for tasks
   - `scrum_templates_list` for templates
   - `scrum_blockers_list` for blockers
   - `scrum_gates_list` for gates
   - `scrum_webhooks_list` for webhooks
3. If the resource should exist, check if you're connected to the correct SCRUM server

---

#### CONFLICT (409)

**Error Code:** `CONFLICT`

**HTTP Status:** 409

**Scenarios:**

##### File Claim Conflict
**Message:** `Files already claimed by: {agentIds}`

**Cause:** Another agent has already claimed one or more of the files you're trying to claim.

**Recovery:**
1. Run `scrum_overlap_check(files)` to see which files are claimed and by whom
2. Wait for the other agent's claims to expire (check `expiresAt` timestamp)
3. Coordinate with the other agent to split the work
4. Use `scrum_claims_list` to monitor active claims

##### Dependency Already Exists
**Message:** `Dependency already exists: {taskId} -> {dependsOnTaskId}`

**Cause:** The dependency relationship you're trying to create already exists.

**Recovery:**
1. Use `scrum_dependencies_get` to view existing dependencies
2. No action needed if the dependency already exists as intended

##### Template Name Conflict
**Message:** `Template "{name}" already exists`

**Cause:** A template with the same name already exists.

**Recovery:**
1. Use a different template name
2. Or use `scrum_template_get` to retrieve the existing template

---

#### VALIDATION_ERROR (400)

**Error Code:** `VALIDATION_ERROR`

**HTTP Status:** 400

**Common Validation Errors:**

##### Missing Required Fields
**Message:** Varies based on field, e.g., `Required field missing: title`

**Affected Tools & Required Fields:**
| Tool | Required Fields |
|------|----------------|
| `scrum_task_create` | `title` |
| `scrum_intent_post` | `taskId`, `agentId`, `files`, `acceptanceCriteria` |
| `scrum_claim` | `agentId`, `files` |
| `scrum_evidence_attach` | `taskId`, `agentId`, `command`, `output` |
| `scrum_comment_add` | `taskId`, `agentId`, `content` |
| `scrum_blocker_add` | `taskId`, `description`, `createdBy` |
| `scrum_dependency_add` | `taskId`, `dependsOnTaskId` |
| `scrum_gate_define` | `taskId`, `gateType`, `command`, `triggerStatus` |
| `scrum_gate_run` | `gateId`, `taskId`, `agentId`, `passed` |
| `scrum_template_create` | `name`, `titlePattern` |
| `scrum_webhook_register` | `name`, `url`, `events` |
| `scrum_agent_register` | `agentId`, `capabilities` |

##### Field Length Violations
| Field | Min | Max |
|-------|-----|-----|
| `title` | 1 | 200 |
| `description` | - | 2000 |
| `agentId` | 1 | 120 |
| `taskId` | 4 | - |
| `summary` (changelog) | 1 | 500 |
| `diffSnippet` | - | 5000 |
| `content` (comment) | 1 | 10000 |
| `acceptanceCriteria` | 10 | 4000 |
| `command` | 1 | 2000 |
| `output` | 0 | 500000 |

##### Invalid Enum Values
**Message:** `Invalid enum value. Expected '{valid_values}', received '{actual_value}'`

**Valid Values:**
| Field | Valid Values |
|-------|-------------|
| `status` | `backlog`, `todo`, `in_progress`, `review`, `done`, `cancelled` |
| `priority` | `critical`, `high`, `medium`, `low` |
| `gateType` | `lint`, `test`, `build`, `review`, `custom` |
| `changeType` | `create`, `modify`, `delete`, `task_created`, `task_status_change`, `task_assigned`, `task_priority_change`, `task_completed`, `blocker_added`, `blocker_resolved`, `dependency_added`, `dependency_removed`, `comment_added` |
| `events` (webhook) | `task.created`, `task.updated`, `task.completed`, `intent.posted`, `claim.created`, `claim.conflict`, `claim.released`, `evidence.attached`, `gate.passed`, `gate.failed` |

##### Numeric Range Violations
| Field | Min | Max |
|-------|-----|-----|
| `ttlSeconds` | 5 | 3600 |
| `additionalSeconds` | 30 | 3600 |
| `storyPoints` | 1 | 21 |
| `limit` (WIP) | 1 | 100 |
| `limit` (query) | 1 | varies (50-500) |
| `periodDays` | 1 | 30 |
| `periods` | 1 | 12 |
| `thresholdDays` | 0.5 | 30 |

##### Files Array Validation
**Message:** `Files array must have at least 1 and at most 200 items`

**Recovery:** Ensure the `files` array contains between 1 and 200 file paths, each with at least 1 character.

---

#### UNAUTHORIZED (401)

**Error Code:** `UNAUTHORIZED`

**HTTP Status:** 401

**Message:** `Missing API key`

**Cause:** Authentication is enabled (`SCRUM_AUTH_ENABLED=true`) but no API key was provided in the request headers.

**Recovery:**
1. Include the `X-API-Key` header with a valid API key
2. Ensure `SCRUM_API_KEYS` environment variable contains your key
3. For MCP transport, authentication is typically not required

---

#### FORBIDDEN (403)

**Error Code:** `FORBIDDEN`

**HTTP Status:** 403

**Scenarios:**

##### Invalid API Key
**Message:** `Invalid API key`

**Cause:** The provided API key is not in the list of valid keys.

**Recovery:** Use a valid API key from `SCRUM_API_KEYS` environment variable.

##### No Intent Before Claim (SCRUM Contract Violation)
**Reason Code:** `NO_INTENT`

**Message:** `You must post an intent (scrum_intent_post) before claiming files. Missing intent for: {files}`

**Cause:** SCRUM contract requires posting an intent before claiming files. This is a deliberate enforcement to ensure agents declare their work plan.

**Recovery:**
1. Call `scrum_intent_post` first with:
   - `taskId`: The task you're working on
   - `agentId`: Your agent identifier
   - `files`: Files you intend to modify
   - `acceptanceCriteria`: How to verify the work (required, min 10 chars)
2. Then call `scrum_claim`

##### No Evidence Before Release (SCRUM Contract Violation)
**Reason Code:** `NO_EVIDENCE`

**Message:** `You must attach evidence (scrum_evidence_attach) proving your work before releasing claims. No receipts = no release.`

**Cause:** SCRUM contract requires attaching evidence before releasing claims. This ensures all work has proof.

**Recovery:**
1. Call `scrum_evidence_attach` first with:
   - `taskId`: The task you worked on
   - `agentId`: Your agent identifier
   - `command`: Command(s) you ran to verify
   - `output`: Command output proving it works
2. Then call `scrum_claim_release`

---

### Business Logic Errors

#### Dependency Errors

##### Self-Dependency
**Message:** `A task cannot depend on itself`

**Cause:** Attempted to create a dependency where a task depends on itself.

**Recovery:** Use different task IDs for the dependent and dependency tasks.

##### Circular Dependency
**Message:** `Circular dependency detected: {dependsOnTaskId} already depends on {taskId}`

**Cause:** Creating this dependency would create a circular chain (A depends on B, B depends on A).

**Recovery:**
1. Use `scrum_dependencies_get` to view existing dependencies
2. Restructure your dependency graph to avoid cycles
3. Consider breaking tasks into smaller units

##### Blocked by Dependencies
**Message:** `Cannot move to in_progress: task is blocked by incomplete dependencies: {taskIds}`

**Cause:** Attempted to move a task to `in_progress` but it has dependencies that are not yet `done`.

**Recovery:**
1. Use `scrum_task_ready` to check if a task can start
2. Complete the blocking tasks first
3. Or set `enforceDependencies: false` to bypass (warnings will be issued)

---

#### WIP Limit Errors

##### WIP Limit Exceeded
**Message:** `WIP limit exceeded for {status}: {count}/{limit} tasks`

**Cause:** Moving a task to this status would exceed the configured WIP limit.

**Recovery:**
1. Use `scrum_wip_status` to check current WIP status
2. Complete or move tasks out of the target status first
3. Use `scrum_wip_limits_set` to adjust limits if appropriate
4. Or set `enforceWipLimits: true` to enforce (default is false, just warns)

##### Invalid WIP Limit Status
**Message:** `Cannot set WIP limit for cancelled status`

**Cause:** WIP limits cannot be set for the `cancelled` status.

**Recovery:** Set WIP limits for: `backlog`, `todo`, `in_progress`, `review`, or `done`.

##### Invalid WIP Limit Value
**Message:** `WIP limit must be between 1 and 100`

**Cause:** WIP limit value is outside the valid range.

**Recovery:** Use a value between 1 and 100, or `null` to remove the limit.

---

#### Gate Errors

##### Gate Command Security Violation
**Message:** `Gate command contains prohibited shell metacharacters`

**Cause:** Gate commands cannot contain shell metacharacters like `; & | \` $ ( ) { } [ ] < > ! \n`

**Safe Prefixes Required:**
- `npm `, `pnpm `, `yarn `, `bun `
- `pytest `, `jest `, `vitest `, `mocha `
- `eslint `, `tsc `, `prettier `
- `cargo `, `go `, `make `
- `docker `, `kubectl `

**Message:** `Gate command must start with a safe prefix: {prefixes}`

**Recovery:**
1. Use simple, direct commands without shell features
2. Start commands with one of the safe prefixes
3. Examples of valid commands:
   - `npm run test`
   - `pytest tests/`
   - `eslint src/`
   - `cargo test`

##### Unknown Gate
**Message:** `Unknown gateId: {gateId}`

**Cause:** The gate ID does not exist.

**Recovery:** Use `scrum_gates_list` to get valid gate IDs for a task.

---

#### Webhook Errors

##### Invalid Webhook URL
**Message:** `Webhook URL must use HTTPS and cannot point to private/internal addresses`

**Cause:** Webhook URLs must use HTTPS and cannot point to:
- `localhost`
- `127.x.x.x`
- `::1`
- `10.x.x.x`
- `172.16-31.x.x`
- `192.168.x.x`
- `169.254.x.x`
- `0.0.0.0`

**Recovery:** Use a publicly accessible HTTPS URL for webhooks.

---

### 5xx Server Errors

#### Internal Server Error (500)

**Error Code:** `ScrumError`

**HTTP Status:** 500

**Cause:** An unexpected error occurred in the server.

**Recovery:**
1. Check server logs for detailed error information
2. Retry the request
3. If persistent, report the issue with reproduction steps

#### Database Connection Failed (503)

**Message:** `Database connection failed`

**Cause:** The SQLite database is unavailable or corrupted.

**Recovery:**
1. Check that the `SCRUM_DATA_DIR` path exists and is writable
2. Check disk space
3. Restart the SCRUM server
4. Check database file permissions

---

## MCP Tool-Specific Error Reference

### scrum_task_create

| Error | Code | Recovery |
|-------|------|----------|
| Missing title | VALIDATION_ERROR | Provide `title` field |
| Title too long | VALIDATION_ERROR | Keep title under 200 characters |
| Invalid status | VALIDATION_ERROR | Use valid status enum |
| Invalid priority | VALIDATION_ERROR | Use valid priority enum |

### scrum_task_get

| Error | Code | Recovery |
|-------|------|----------|
| Task not found | NOT_FOUND | Verify task ID exists |
| Missing taskId | VALIDATION_ERROR | Provide `taskId` field |

### scrum_task_update

| Error | Code | Recovery |
|-------|------|----------|
| Task not found | NOT_FOUND | Verify task ID exists |
| WIP limit exceeded | Business Logic | Complete tasks in target column |
| Blocked by dependencies | Business Logic | Complete blocking tasks |

### scrum_intent_post

| Error | Code | Recovery |
|-------|------|----------|
| Unknown taskId | NOT_FOUND | Create task first or verify ID |
| Missing acceptanceCriteria | VALIDATION_ERROR | Provide criteria (min 10 chars) |
| Empty files array | VALIDATION_ERROR | Include at least one file |

### scrum_claim

| Error | Code | Recovery |
|-------|------|----------|
| NO_INTENT | FORBIDDEN | Post intent first |
| Files claimed | CONFLICT | Wait or coordinate |
| Invalid ttlSeconds | VALIDATION_ERROR | Use 5-3600 seconds |

### scrum_claim_release

| Error | Code | Recovery |
|-------|------|----------|
| NO_EVIDENCE | FORBIDDEN | Attach evidence first |

### scrum_claim_extend

| Error | Code | Recovery |
|-------|------|----------|
| No active claims | Business Logic | Claim files first |
| Invalid additionalSeconds | VALIDATION_ERROR | Use 30-3600 seconds |

### scrum_evidence_attach

| Error | Code | Recovery |
|-------|------|----------|
| Unknown taskId | NOT_FOUND | Verify task exists |
| Missing command | VALIDATION_ERROR | Provide command string |
| Output too long | VALIDATION_ERROR | Truncate to 500KB |

### scrum_blocker_add

| Error | Code | Recovery |
|-------|------|----------|
| Unknown taskId | NOT_FOUND | Verify task exists |
| Unknown blockingTaskId | NOT_FOUND | Verify blocking task exists |
| Missing description | VALIDATION_ERROR | Provide blocker description |

### scrum_blocker_resolve

| Error | Code | Recovery |
|-------|------|----------|
| Unknown blockerId | NOT_FOUND | Use `scrum_blockers_list` to find valid IDs |

### scrum_dependency_add

| Error | Code | Recovery |
|-------|------|----------|
| Unknown taskId | NOT_FOUND | Verify task exists |
| Unknown dependsOnTaskId | NOT_FOUND | Verify dependency task exists |
| Self-dependency | Business Logic | Use different task IDs |
| Circular dependency | Business Logic | Restructure dependencies |
| Already exists | CONFLICT | Dependency already recorded |

### scrum_gate_define

| Error | Code | Recovery |
|-------|------|----------|
| Unknown taskId | NOT_FOUND | Verify task exists |
| Invalid command | VALIDATION_ERROR | Use safe prefix, no shell chars |

### scrum_gate_run

| Error | Code | Recovery |
|-------|------|----------|
| Unknown gateId | NOT_FOUND | Use `scrum_gates_list` to find valid IDs |
| Missing passed | VALIDATION_ERROR | Provide boolean `passed` field |

### scrum_template_create

| Error | Code | Recovery |
|-------|------|----------|
| Already exists | CONFLICT | Use different name |
| Missing name | VALIDATION_ERROR | Provide template name |
| Missing titlePattern | VALIDATION_ERROR | Provide title pattern |

### scrum_task_from_template

| Error | Code | Recovery |
|-------|------|----------|
| Template not found | NOT_FOUND | Use `scrum_templates_list` to find valid templates |

### scrum_webhook_register

| Error | Code | Recovery |
|-------|------|----------|
| Invalid URL | VALIDATION_ERROR | Use HTTPS, public URL |
| Missing events | VALIDATION_ERROR | Provide at least one event |

### scrum_agent_heartbeat

| Error | Code | Recovery |
|-------|------|----------|
| Agent not found | NOT_FOUND | Register with `scrum_agent_register` first |

### scrum_wip_limits_set

| Error | Code | Recovery |
|-------|------|----------|
| Cancelled status | VALIDATION_ERROR | Use non-cancelled status |
| Invalid limit | VALIDATION_ERROR | Use 1-100 or null |

---

## Recovery Patterns

### Conflict Resolution

When you encounter a `CONFLICT` error for file claims:

```
1. scrum_overlap_check(files)     # See who has claims
2. scrum_claims_list()            # Get claim details
3. Wait for expiration OR coordinate with other agent
4. Retry scrum_claim()
```

### SCRUM Contract Workflow

Always follow this sequence to avoid `FORBIDDEN` errors:

```
1. scrum_task_create() OR scrum_task_list() to get taskId
2. scrum_intent_post(taskId, agentId, files, acceptanceCriteria)
3. scrum_claim(agentId, files)
4. Make your changes
5. scrum_changelog_log(agentId, filePath, changeType, summary)
6. scrum_evidence_attach(taskId, agentId, command, output)
7. scrum_claim_release(agentId)
```

### Retry Logic

For transient errors (5xx or network issues):

1. Wait 1 second
2. Retry the request
3. If still failing after 3 retries, check server health with `/health` endpoint
4. Examine server logs for root cause

### Dependency Management

Before starting work on a task:

```
1. scrum_task_ready(taskId)           # Check if ready
2. If not ready, examine blockingTasks
3. Complete blocking tasks first
4. Or remove unnecessary dependencies with scrum_dependency_remove
```

### Handling Unknown IDs

When you get a `NOT_FOUND` error:

```
1. Use the list tool for that resource type
2. Search for similar names/titles
3. Verify you're using the correct SCRUM instance
4. If resource was deleted, recreate it
```

---

## Error Response Format

### MCP Tool Response (Error)

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error message or JSON details"
    }
  ],
  "isError": true
}
```

### MCP Tool Response (Conflict with Details)

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"status\":\"conflict\",\"claim\":{...},\"conflictsWith\":[\"agent-1\"],\"message\":\"Files already claimed by: agent-1\"}"
    }
  ]
}
```

### REST API Response (Error)

```json
{
  "ok": false,
  "error": "Error message"
}
```

### REST API Response (Health Check - Unhealthy)

```json
{
  "status": "unhealthy",
  "timestamp": 1704067200000,
  "error": "Database connection failed"
}
```

---

## Debugging Tips

1. **Enable verbose logging**: Set `SCRUM_LOG_LEVEL=debug` for detailed logs
2. **Check server status**: Use `scrum_status()` to verify connectivity
3. **Inspect claims**: Use `scrum_claims_list()` before claiming files
4. **Verify resources**: Always use get/list tools to confirm IDs exist
5. **Review changelog**: Use `scrum_changelog_search` to trace what happened
6. **Monitor agents**: Use `scrum_agents_list` to see active agents

---

## Related Documentation

- [MCP.md](./MCP.md) - MCP tool reference
- [agents.md](./agents.md) - Agent coordination patterns
- [OPERATIONS.md](./OPERATIONS.md) - Server operations guide
