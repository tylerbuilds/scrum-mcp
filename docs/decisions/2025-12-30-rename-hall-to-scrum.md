# Decision: Rename HALL to SCRUM

**Date**: 2025-12-30
**Status**: Accepted

## Context

The project was originally named **HALL** (Holistic Agent Live Lobby). A rename was requested to **SCRUM** to better reflect the project's purpose.

## Decision

Rename the project from HALL to SCRUM.

**SCRUM** = **S**ynchronized **C**laims **R**egistry for **U**nified **M**ulti-agents

## Rationale

The new name better describes what the project does:

- **Synchronized** - Real-time coordination between agents
- **Claims** - Core feature: file locking/claiming mechanism
- **Registry** - Central database tracking intents, claims, evidence
- **Unified** - Brings multiple agents into one coordination layer
- **Multi-agents** - Target users: AI coding agents working in parallel

## Changes Required

### Naming Conventions

| Old | New |
|-----|-----|
| HALL | SCRUM |
| hall | scrum |
| hall_* (MCP tools) | scrum_* |
| HALL_* (env vars) | SCRUM_* |
| .hall/ (data dir) | .scrum/ |
| hall.sqlite | scrum.sqlite |

### Files Affected

- package.json (name, scripts)
- README.md
- Source code (src/*.ts)
- Frontend (frontend/)
- Documentation (docs/*.md)
- Templates (templates/)
- Marketing site (site/)
- Config files (.env.example, .gitignore)
- LICENSE

## Consequences

- Existing users will need to update their MCP configs to use `scrum_*` tools
- Database path changes from `.hall/` to `.scrum/`
- Environment variables change from `HALL_*` to `SCRUM_*`
- All documentation and website content updated

## Migration

Users should:
1. Update MCP server config paths
2. Rename `.hall/` directory to `.scrum/` (or let it recreate)
3. Update any `HALL_*` environment variables to `SCRUM_*`
