# SCRUM MCP Git Hooks

Git hooks provide client-side enforcement of SCRUM compliance. They validate your workflow before commits are created.

## Installation

```bash
# From the scrum-mcp directory
./scripts/install-hooks.sh

# Or force overwrite existing hooks
./scripts/install-hooks.sh --force
```

## Pre-Commit Hook

The pre-commit hook checks SCRUM compliance before each commit:

1. **Intent posted** - Did you declare what files you plan to modify?
2. **Files match** - Are you only modifying files you declared?
3. **Boundaries respected** - Did you avoid files marked as "DO NOT TOUCH"?
4. **Evidence attached** - Did you attach test output? (strict mode only)

### Configuration

Set these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SCRUM_API` | `http://localhost:4177/api` | SCRUM server endpoint |
| `SCRUM_TASK_ID` | (none) | **Required** for compliance check |
| `SCRUM_AGENT_ID` | `$USER-$HOSTNAME` | Your unique agent identifier |
| `SCRUM_STRICT` | `false` | Block commits without evidence |
| `SCRUM_PRECOMMIT_SKIP` | `false` | Bypass hook entirely |

### Usage

```bash
# 1. Start SCRUM server
npm run dev

# 2. Create a task and post intent
curl -X POST localhost:4177/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Add new feature"}'
# Returns: {"data": {"id": "task-abc123", ...}}

# 3. Set your task ID
export SCRUM_TASK_ID="task-abc123"

# 4. Post intent for files you'll modify
curl -X POST localhost:4177/api/intents \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task-abc123",
    "agentId": "myname-myhost",
    "files": ["src/feature.ts", "src/feature.test.ts"],
    "acceptanceCriteria": "Feature implemented with tests passing"
  }'

# 5. Make your changes and commit
git add src/feature.ts src/feature.test.ts
git commit -m "Add new feature"
# Hook runs compliance check automatically
```

### Compliance Check Output

**Success:**
```
🔍 Checking SCRUM compliance for task task-abc123...
✅ SCRUM compliance passed (score: 100/100)
   Fully compliant
```

**Failure - No intent:**
```
🔍 Checking SCRUM compliance for task task-abc123...
❌ COMPLIANCE FAILED: No intent posted

   Fix: Post intent with scrum_intent_post before making changes
        Include files you will modify and acceptance criteria
```

**Failure - Undeclared files:**
```
🔍 Checking SCRUM compliance for task task-abc123...
❌ COMPLIANCE FAILED: Undeclared files modified
   Undeclared: src/other.ts
   Declared:   src/feature.ts

   Fix: Update your intent with scrum_intent_post to include these files
        Or revert changes to undeclared files
```

**Failure - Boundary violation:**
```
🔍 Checking SCRUM compliance for task task-abc123...
❌ COMPLIANCE FAILED: Boundary violations
   Violated boundaries: config.ts, .env

   Fix: Revert changes to boundary files
        These files were marked as 'DO NOT TOUCH' in your intent
```

### Strict Mode

Enable strict mode to require evidence before commits:

```bash
export SCRUM_STRICT=true
```

In strict mode:
- Commits are blocked if no evidence is attached
- Commits are blocked if SCRUM server is not running
- Commits are blocked if task ID is not set but claims exist

### Bypassing the Hook

For emergency situations or non-SCRUM commits:

```bash
# Skip for one commit
SCRUM_PRECOMMIT_SKIP=true git commit -m "Emergency fix"

# Or use git's --no-verify
git commit --no-verify -m "Skip all hooks"
```

## Troubleshooting

### "SCRUM server not running"

The hook couldn't connect to the SCRUM API.

```bash
# Check if server is running
curl http://localhost:4177/api/status

# Start the server
npm run dev
```

### "jq not installed"

The hook uses `jq` for JSON parsing. Install it:

```bash
# Ubuntu/Debian
sudo apt install jq

# macOS
brew install jq

# Or skip detailed checks (hook will still validate connection)
```

### "Active claims found but SCRUM_TASK_ID not set"

You have claimed files but haven't set the task context.

```bash
# List your claims
curl http://localhost:4177/api/claims | jq '.data[] | select(.agentId=="your-agent-id")'

# Set the task ID from your claims
export SCRUM_TASK_ID="task-from-claims"
```

## Integration with AI Agents

When using Claude Code, Cursor, or other AI agents:

1. **Agent sets task ID** when starting work
2. **Agent posts intent** declaring files to modify
3. **Agent claims files** to prevent conflicts
4. **Human commits** with hook validating compliance
5. **Hook blocks** if agent modified undeclared files

This creates a verification layer between AI changes and git history.

## Uninstalling

```bash
rm .git/hooks/pre-commit
```
