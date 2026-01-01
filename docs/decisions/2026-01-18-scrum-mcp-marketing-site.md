# Decision: Static marketing site for SCRUM MCP

Status: Accepted

## Context

SCRUM MCP needs a public marketing site with high-end visuals, strong copy, and clear
download and GitHub links. The existing `frontend/` app is a live dashboard and should
remain focused on runtime activity, not marketing content.

## Decision

Create a standalone static site in `site/` with plain HTML, CSS, and a small JS
animation hook. This keeps deployment simple for `scrum.tylerbuilds.com` and avoids
coupling marketing content to the dashboard.

## Consequences

- The marketing site can be served from any static host without a build step.
- Dashboard changes remain isolated from marketing content.
- Updates require direct edits to `site/` files.

