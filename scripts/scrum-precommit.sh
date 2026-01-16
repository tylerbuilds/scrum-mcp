#!/bin/bash
# SCRUM MCP Pre-Commit Compliance Check
# Install: ./scripts/install-hooks.sh
# Docs: docs/HOOKS.md

set -e

SCRUM_API="${SCRUM_API:-http://localhost:4177/api}"
SCRUM_TASK_ID="${SCRUM_TASK_ID:-}"
SCRUM_AGENT_ID="${SCRUM_AGENT_ID:-$(whoami)-$(hostname)}"
SCRUM_STRICT="${SCRUM_STRICT:-false}"

# Skip if disabled
if [ "$SCRUM_PRECOMMIT_SKIP" = "true" ]; then
  exit 0
fi

# Get staged files
STAGED=$(git diff --cached --name-only)
if [ -z "$STAGED" ]; then
  exit 0  # Nothing to commit
fi

# Check if SCRUM server is running
if ! curl -s --connect-timeout 2 "$SCRUM_API/status" > /dev/null 2>&1; then
  if [ "$SCRUM_STRICT" = "true" ]; then
    echo "⚠️  SCRUM server not running at $SCRUM_API"
    echo "   Set SCRUM_PRECOMMIT_SKIP=true to bypass"
    exit 1
  fi
  # Non-strict mode: silently skip if server not running
  exit 0
fi

# If no task ID, check for active claims by this agent
if [ -z "$SCRUM_TASK_ID" ]; then
  # Try to find task from active claims
  CLAIMS_RESPONSE=$(curl -s "$SCRUM_API/claims")
  if command -v jq &> /dev/null; then
    AGENT_CLAIMS=$(echo "$CLAIMS_RESPONSE" | jq -r ".data[] | select(.agentId==\"$SCRUM_AGENT_ID\") | .files[]" 2>/dev/null || echo "")
    if [ -n "$AGENT_CLAIMS" ]; then
      echo "⚠️  Active claims found but SCRUM_TASK_ID not set"
      echo "   Claimed files: $AGENT_CLAIMS"
      echo "   Set SCRUM_TASK_ID to enable compliance check"
      if [ "$SCRUM_STRICT" = "true" ]; then
        exit 1
      fi
    fi
  fi
  exit 0
fi

# Check if jq is available for JSON parsing
if ! command -v jq &> /dev/null; then
  echo "⚠️  jq not installed - skipping detailed compliance check"
  exit 0
fi

# Run compliance check
echo "🔍 Checking SCRUM compliance for task $SCRUM_TASK_ID..."
COMPLIANCE=$(curl -s "$SCRUM_API/compliance/$SCRUM_TASK_ID/$SCRUM_AGENT_ID")

# Check for API error
if [ "$(echo "$COMPLIANCE" | jq -r '.ok')" != "true" ]; then
  ERROR=$(echo "$COMPLIANCE" | jq -r '.error // "Unknown error"')
  echo "⚠️  Compliance check failed: $ERROR"
  if [ "$SCRUM_STRICT" = "true" ]; then
    exit 1
  fi
  exit 0
fi

# Parse compliance result
COMPLIANT=$(echo "$COMPLIANCE" | jq -r '.data.compliant')
SCORE=$(echo "$COMPLIANCE" | jq -r '.data.score')
SUMMARY=$(echo "$COMPLIANCE" | jq -r '.data.summary')
FILES_PASSED=$(echo "$COMPLIANCE" | jq -r '.data.checks.filesMatch.passed')
BOUNDARIES_PASSED=$(echo "$COMPLIANCE" | jq -r '.data.checks.boundariesRespected.passed')
EVIDENCE_PASSED=$(echo "$COMPLIANCE" | jq -r '.data.checks.evidenceAttached.passed')
INTENT_PASSED=$(echo "$COMPLIANCE" | jq -r '.data.checks.intentPosted.passed')

# Check for critical failures
if [ "$INTENT_PASSED" = "false" ]; then
  echo "❌ COMPLIANCE FAILED: No intent posted"
  echo ""
  echo "   Fix: Post intent with scrum_intent_post before making changes"
  echo "        Include files you will modify and acceptance criteria"
  exit 1
fi

if [ "$FILES_PASSED" = "false" ]; then
  echo "❌ COMPLIANCE FAILED: Undeclared files modified"
  UNDECLARED=$(echo "$COMPLIANCE" | jq -r '.data.checks.filesMatch.undeclared | join(", ")')
  DECLARED=$(echo "$COMPLIANCE" | jq -r '.data.checks.filesMatch.declared | join(", ")')
  echo "   Undeclared: $UNDECLARED"
  echo "   Declared:   $DECLARED"
  echo ""
  echo "   Fix: Update your intent with scrum_intent_post to include these files"
  echo "        Or revert changes to undeclared files"
  exit 1
fi

if [ "$BOUNDARIES_PASSED" = "false" ]; then
  echo "❌ COMPLIANCE FAILED: Boundary violations"
  VIOLATIONS=$(echo "$COMPLIANCE" | jq -r '.data.checks.boundariesRespected.violations | join(", ")')
  echo "   Violated boundaries: $VIOLATIONS"
  echo ""
  echo "   Fix: Revert changes to boundary files"
  echo "        These files were marked as 'DO NOT TOUCH' in your intent"
  exit 1
fi

if [ "$EVIDENCE_PASSED" = "false" ]; then
  if [ "$SCRUM_STRICT" = "true" ]; then
    echo "❌ COMPLIANCE FAILED: No evidence attached"
    echo ""
    echo "   Fix: Run tests and attach evidence with scrum_evidence_attach"
    echo "        Evidence is required before committing in strict mode"
    exit 1
  else
    echo "⚠️  Warning: No evidence attached yet"
    echo "   Remember to attach evidence with scrum_evidence_attach before merging"
  fi
fi

# Success
echo "✅ SCRUM compliance passed (score: $SCORE/100)"
echo "   $SUMMARY"
exit 0
