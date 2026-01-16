#!/bin/bash
# Install SCRUM MCP git hooks
# Usage: ./scripts/install-hooks.sh [--force]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK_SOURCE="$SCRIPT_DIR/scrum-precommit.sh"
HOOK_TARGET="$REPO_ROOT/.git/hooks/pre-commit"

# Check we're in a git repo
if [ ! -d "$REPO_ROOT/.git" ]; then
  echo "Error: Not a git repository"
  echo "Run this from the root of a git repository"
  exit 1
fi

# Check hook source exists
if [ ! -f "$HOOK_SOURCE" ]; then
  echo "Error: Hook script not found at $HOOK_SOURCE"
  exit 1
fi

# Check for existing hook
if [ -f "$HOOK_TARGET" ]; then
  if [ "$1" = "--force" ]; then
    echo "Overwriting existing pre-commit hook..."
  else
    echo "Warning: pre-commit hook already exists at $HOOK_TARGET"
    echo ""
    read -p "Overwrite? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Cancelled. Use --force to overwrite without prompting."
      exit 1
    fi
  fi
fi

# Install hook
cp "$HOOK_SOURCE" "$HOOK_TARGET"
chmod +x "$HOOK_TARGET"

echo ""
echo "✅ SCRUM pre-commit hook installed successfully!"
echo ""
echo "Configuration (environment variables):"
echo "  SCRUM_API=http://localhost:4177/api  # SCRUM server endpoint"
echo "  SCRUM_TASK_ID=<task-id>              # Current task ID (required for compliance check)"
echo "  SCRUM_AGENT_ID=<agent-id>            # Your agent ID (defaults to user@hostname)"
echo "  SCRUM_STRICT=true                    # Block commits without evidence"
echo "  SCRUM_PRECOMMIT_SKIP=true            # Bypass hook entirely"
echo ""
echo "Usage:"
echo "  1. Start SCRUM server: npm run dev"
echo "  2. Set task ID: export SCRUM_TASK_ID=<your-task-id>"
echo "  3. Make changes and commit normally"
echo ""
echo "The hook will check compliance before each commit."
echo "See docs/HOOKS.md for full documentation."
