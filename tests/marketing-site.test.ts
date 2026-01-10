import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('marketing site', () => {
  const html = readFileSync(join(process.cwd(), 'site', 'index.html'), 'utf8');

  it('includes the SCRUM MCP hero copy', () => {
    expect(html).toContain('SCRUM MCP turns multi-agent chaos into a dependable dev team.');
  });

  it('includes the start section onboarding copy', () => {
    expect(html).toContain('From zero to coordinated in under 3 minutes.');
  });

  it('links to the GitHub repo', () => {
    expect(html).toContain('https://github.com/tylerbuilds/scrum-mcp');
  });

  it('includes the download ZIP link', () => {
    // Uses versioned release tag
    expect(html).toContain('https://github.com/tylerbuilds/scrum-mcp/archive/refs/tags/');
  });
});
