# SCRUM MCP Agent Instructions

> Copy this section into your CLAUDE.md, .cursorrules, or agent system prompt.

---

## SCRUM MCP - Multi-Agent Coordination Protocol

**Use SCRUM MCP for ALL code changes** unless explicitly told "skip SCRUM" or "no coordination".

### Session Startup (Do First!)

```
scrum_status()           # Check server status
scrum_task_list()        # See pending/active tasks
scrum_claims_list()      # See what files are claimed
```

---

## Solo Agent Workflow

When working alone on a task:

### Before Any Code Changes

1. **Check for conflicts:**
   ```
   scrum_overlap_check(files: ["src/foo.ts", "src/bar.ts"])
   ```

2. **Create or use existing task:**
   ```
   scrum_task_create(title: "Fix login bug", description: "...")
   ```

3. **Declare your intent (REQUIRED):**
   ```
   scrum_intent_post(
     taskId: "task-123",
     agentId: "claude-code-abc123",
     files: ["src/auth.ts", "src/auth.test.ts"],
     boundaries: "DO NOT TOUCH config.ts, database.ts",
     acceptanceCriteria: "All tests pass, login works with special chars"
   )
   ```

4. **Claim files for exclusive editing:**
   ```
   scrum_claim(agentId: "claude-code-abc123", files: ["src/auth.ts"])
   ```

### After Each Edit

5. **Log your changes:**
   ```
   scrum_changelog_log(
     agentId: "claude-code-abc123",
     taskId: "task-123",
     filePath: "src/auth.ts",
     changeType: "modify",
     summary: "Added special character handling for passwords"
   )
   ```

### Before Releasing

6. **Attach evidence (REQUIRED):**
   ```
   scrum_evidence_attach(
     taskId: "task-123",
     agentId: "claude-code-abc123",
     command: "npm test",
     output: "All 42 tests passed"
   )
   ```

7. **Check compliance:**
   ```
   scrum_compliance_check(taskId: "task-123", agentId: "claude-code-abc123")
   ```

8. **Release claims:**
   ```
   scrum_claim_release(agentId: "claude-code-abc123")
   ```

---

## Multi-Agent Sprint Workflow

When multiple agents work on the same task (sub-agents, parallel work):

### Orchestrator Agent (Creates the Sprint)

```
# 1. Create task
task = scrum_task_create(title: "Implement auth system")

# 2. Create sprint for collaborative work
sprint = scrum_sprint_create(
  taskId: task.id,
  name: "Auth Implementation Sprint",
  goal: "Implement full auth with frontend and backend integration"
)

# 3. Share sprint ID with sub-agents
# Pass sprint.id to sub-agents when spawning them
```

### Sub-Agent Workflow (CRITICAL)

**Every sub-agent MUST follow this workflow:**

#### Step 1: Join the Sprint
```
scrum_sprint_join(
  sprintId: "sprint-abc",
  agentId: "claude-sub-123",
  workingOn: "Implementing JWT token validation in backend",
  focusArea: "backend"  # Options: backend, frontend, tests, auth, api, etc.
)
```

#### Step 2: Understand Before Coding (CRITICAL!)
```
# ALWAYS call this BEFORE starting work
context = scrum_sprint_context(sprintId: "sprint-abc")

# Review:
# - context.members: Who else is working and on what
# - context.decisions: Architectural choices already made
# - context.interfaces: API contracts to implement/use
# - context.discoveries: Things others learned
# - context.unansweredQuestions: Can you help answer any?
```

#### Step 3: Do Your Work (Standard SCRUM)
- Post intent
- Claim files
- Make changes
- Log to changelog

#### Step 4: Share Your Work
```
# Share decisions you made
scrum_sprint_share(
  sprintId: "sprint-abc",
  agentId: "claude-sub-123",
  shareType: "decision",
  title: "Using bcrypt for password hashing",
  content: "Chose bcrypt over argon2 because...",
  relatedFiles: ["src/auth/password.ts"]
)

# Share interfaces you created
scrum_sprint_share(
  sprintId: "sprint-abc",
  agentId: "claude-sub-123",
  shareType: "interface",
  title: "AuthService API",
  content: "export interface AuthService { login(...): Promise<Token>; ... }",
  relatedFiles: ["src/auth/types.ts"]
)

# Share discoveries
scrum_sprint_share(
  sprintId: "sprint-abc",
  agentId: "claude-sub-123",
  shareType: "discovery",
  title: "Existing session middleware",
  content: "Found existing session handling in src/middleware/session.ts that we should reuse"
)
```

#### Step 5: Check for Updates (Periodically)
```
# Call this every few changes to stay coordinated
scrum_sprint_check(sprintId: "sprint-abc", agentId: "claude-sub-123")

# Returns:
# - teammates: What others are working on now
# - unansweredQuestions: Questions you might answer
# - interfaces: APIs you might need to implement
# - integrations: How to connect with others' code
```

#### Step 6: Ask Questions / Answer Others
```
# Ask a question
scrum_sprint_share(
  sprintId: "sprint-abc",
  agentId: "claude-sub-123",
  shareType: "question",
  title: "How should I handle refresh tokens?",
  content: "Should refresh tokens be stored in httpOnly cookies or localStorage?"
)

# Answer a question (link via replyToId)
scrum_sprint_share(
  sprintId: "sprint-abc",
  agentId: "claude-sub-456",
  shareType: "answer",
  title: "Use httpOnly cookies for security",
  content: "Store refresh tokens in httpOnly cookies to prevent XSS...",
  replyToId: "question-share-id"
)
```

#### Step 7: Complete and Leave
```
# After finishing your part
scrum_evidence_attach(...)
scrum_compliance_check(...)
scrum_claim_release(...)
scrum_sprint_leave(sprintId: "sprint-abc", agentId: "claude-sub-123")
```

---

## Share Types Reference

| Type | When to Use | Example |
|------|-------------|---------|
| `context` | Background info others need | "The codebase uses TypeScript strict mode" |
| `decision` | Architectural/design choices | "Using JWT with 15min expiry" |
| `interface` | API contracts, function signatures | "export interface UserService { ... }" |
| `discovery` | Things you learned about the codebase | "Found existing validation utils in src/utils" |
| `integration` | How to connect with your code | "To use my auth, import from src/auth and call..." |
| `question` | Ask the team | "Should we use Redis for sessions?" |
| `answer` | Respond to a question | "Yes, Redis because..." |

---

## Agent Identity

Use unique agent IDs to track your work:

- Claude Code: `claude-code-{session-hash}`
- Cursor: `cursor-{timestamp}`
- Sub-agents: `{parent-id}-sub-{n}`
- Custom: `{tool}-{unique-id}`

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────┐
│                  SCRUM AGENT WORKFLOW                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  SOLO WORK:                                             │
│  1. scrum_overlap_check(files)                          │
│  2. scrum_intent_post(taskId, agentId, files, ...)      │
│  3. scrum_claim(agentId, files)                         │
│  4. [make changes]                                      │
│  5. scrum_changelog_log(agentId, filePath, ...)         │
│  6. scrum_evidence_attach(taskId, agentId, ...)         │
│  7. scrum_compliance_check(taskId, agentId)             │
│  8. scrum_claim_release(agentId)                        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  SPRINT (MULTI-AGENT):                                  │
│  1. scrum_sprint_join(sprintId, agentId, workingOn)     │
│  2. scrum_sprint_context(sprintId)  ← BEFORE CODING!   │
│  3. [solo workflow above]                               │
│  4. scrum_sprint_share(sprintId, shareType, ...)        │
│  5. scrum_sprint_check(sprintId, agentId)  ← PERIODIC  │
│  6. scrum_sprint_leave(sprintId, agentId)               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Why This Matters

**Without SCRUM:**
- Agents overwrite each other's work
- No audit trail of changes
- Merge conflicts everywhere
- Sub-agents duplicate effort

**With SCRUM:**
- Claims prevent file conflicts
- Changelog tracks every change
- Compliance verifies work matches intent

**With Sprint:**
- Sub-agents understand each other's code
- Shared decisions prevent conflicts
- Interfaces enable clean integration
- Questions get answered
- Better integrated systems

---

## Troubleshooting

**"Claim conflict"** → Another agent has the file. Wait or coordinate.

**"Compliance failed"** → Your changes don't match your intent. Either:
- Update your intent to include the files you modified
- Revert changes to files you didn't declare

**"No intent posted"** → You must call `scrum_intent_post` before claiming files.

**"No evidence"** → You must call `scrum_evidence_attach` before releasing claims.
