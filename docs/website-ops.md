# Marketing Site Operations

This covers the static marketing site served from `site/`.

## Detection

- HTTP 200 on `/` for `scrum.tylerbuilds.com`
- Page title shows "SCRUM MCP - Local-first multi-agent coordination"
- Hero CTA buttons link to GitHub and the download ZIP
- "Start here" section renders with quickstart commands

## Verification

- `curl -I https://scrum.tylerbuilds.com` returns 200
- Browser check: hero, start section, and footer links render
- Clickthrough: GitHub repo and MCP docs open correctly
  - https://github.com/tylerbuilds/scrum-mcp
  - https://github.com/tylerbuilds/scrum-mcp/blob/main/docs/MCP.md

## Rollback

- Restore the previous `site/` directory from backup or git
- Restart the web server if needed
