import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type { Intent, Evidence, ChangelogEntry, Claim } from '../types.js';
import { type BaseRepository, now } from './base.js';

// ==================== COMPLIANCE TYPES ====================

export interface IntentCheckResult {
  passed: boolean;
  count: number;
  intents: Intent[];
}

export interface EvidenceCheckResult {
  passed: boolean;
  count: number;
}

export interface FilesMatchResult {
  passed: boolean;
  declared: string[];
  modified: string[];
  undeclared: string[];
  unmodified: string[];
}

export interface BoundariesResult {
  passed: boolean;
  boundaries: string[];
  violations: string[];
}

export interface ClaimsResult {
  passed: boolean;
  activeClaims: string[];
}

export interface ComplianceChecks {
  intentPosted: IntentCheckResult;
  evidenceAttached: EvidenceCheckResult;
  filesMatch: FilesMatchResult;
  boundariesRespected: BoundariesResult;
  claimsReleased: ClaimsResult;
}

export interface ComplianceCheck {
  taskId: string;
  agentId: string;
  compliant: boolean;
  score: number;
  checks: ComplianceChecks;
  summary: string;
  canComplete: boolean;
  checkedAt: number;
}

// ==================== DEPENDENCY INTERFACES ====================

export interface IntentsDependency {
  listIntents(taskId: string): Intent[];
}

export interface EvidenceDependency {
  listEvidence(taskId: string): Evidence[];
}

export interface ChangelogDependency {
  searchChangelog(options: { taskId?: string; agentId?: string }): ChangelogEntry[];
}

export interface ClaimsDependency {
  getAgentClaims(agentId: string): string[];
}

export interface ComplianceDependencies {
  intents: IntentsDependency;
  evidence: EvidenceDependency;
  changelog: ChangelogDependency;
  claims: ClaimsDependency;
}

// ==================== COMPLIANCE REPOSITORY ====================

/**
 * Compliance Repository - verifies agent work matches declared intent
 *
 * Checks:
 * 1. Intent posted for task
 * 2. Evidence attached
 * 3. Modified files match declared files
 * 4. Boundary files not touched
 * 5. Claims released
 */
export class ComplianceRepository implements BaseRepository {
  private deps: ComplianceDependencies | null = null;

  constructor(
    public readonly db: BetterSqlite3.Database,
    public readonly log: Logger
  ) {}

  /**
   * Set repository dependencies for cross-domain queries
   */
  setDependencies(deps: ComplianceDependencies): void {
    this.deps = deps;
  }

  /**
   * Run full compliance check for an agent's work on a task
   */
  checkCompliance(taskId: string, agentId: string): ComplianceCheck {
    if (!this.deps) {
      throw new Error('ComplianceRepository dependencies not set');
    }

    const intentCheck = this.checkIntentPosted(taskId, agentId);
    const evidenceCheck = this.checkEvidenceAttached(taskId, agentId);
    const filesMatch = this.checkFilesMatch(taskId, agentId, intentCheck.intents);
    const boundariesRespected = this.checkBoundariesRespected(taskId, agentId, intentCheck.intents);
    const claimsReleased = this.checkClaimsReleased(agentId);

    const checks: ComplianceChecks = {
      intentPosted: intentCheck,
      evidenceAttached: evidenceCheck,
      filesMatch,
      boundariesRespected,
      claimsReleased
    };

    const score = this.calculateScore(checks);
    const compliant = score >= 70;
    const canComplete = intentCheck.passed &&
                       evidenceCheck.passed &&
                       filesMatch.passed &&
                       boundariesRespected.passed;

    const summary = this.generateSummary(checks, score);

    return {
      taskId,
      agentId,
      compliant,
      score,
      checks,
      summary,
      canComplete,
      checkedAt: now()
    };
  }

  // ==================== INDIVIDUAL CHECKS ====================

  private checkIntentPosted(taskId: string, agentId: string): IntentCheckResult {
    const allIntents = this.deps!.intents.listIntents(taskId);
    const agentIntents = allIntents.filter(i => i.agentId === agentId);

    return {
      passed: agentIntents.length > 0,
      count: agentIntents.length,
      intents: agentIntents
    };
  }

  private checkEvidenceAttached(taskId: string, agentId: string): EvidenceCheckResult {
    const allEvidence = this.deps!.evidence.listEvidence(taskId);
    const agentEvidence = allEvidence.filter(e => e.agentId === agentId);

    return {
      passed: agentEvidence.length > 0,
      count: agentEvidence.length
    };
  }

  private checkFilesMatch(taskId: string, agentId: string, intents: Intent[]): FilesMatchResult {
    // Get all files declared in intents
    const declaredSet = new Set<string>();
    for (const intent of intents) {
      for (const file of intent.files) {
        declaredSet.add(file);
      }
    }
    const declared = [...declaredSet];

    // Get all files modified in changelog for this task by this agent
    // Only consider file modification change types (create, modify, delete)
    const fileChangeTypes = new Set(['create', 'modify', 'delete']);
    const changelog = this.deps!.changelog.searchChangelog({ taskId, agentId });
    const modifiedSet = new Set<string>();
    for (const entry of changelog) {
      if (fileChangeTypes.has(entry.changeType)) {
        modifiedSet.add(entry.filePath);
      }
    }
    const modified = [...modifiedSet];

    // Find undeclared modifications (modified but not declared)
    const undeclared = modified.filter(f => !declaredSet.has(f));

    // Find unmodified declarations (declared but not modified) - warning only
    const unmodified = declared.filter(f => !modifiedSet.has(f));

    // Pass if no undeclared modifications
    // Having unmodified files is OK (you don't have to modify everything you declared)
    const passed = undeclared.length === 0;

    return {
      passed,
      declared,
      modified,
      undeclared,
      unmodified
    };
  }

  private checkBoundariesRespected(taskId: string, agentId: string, intents: Intent[]): BoundariesResult {
    // Parse boundaries from all intents
    const boundarySet = new Set<string>();
    for (const intent of intents) {
      if (intent.boundaries) {
        const parsed = this.parseBoundaries(intent.boundaries);
        for (const b of parsed) {
          boundarySet.add(b);
        }
      }
    }
    const boundaries = [...boundarySet];

    if (boundaries.length === 0) {
      // No boundaries declared = no violations possible
      return {
        passed: true,
        boundaries: [],
        violations: []
      };
    }

    // Get all files modified in changelog
    const fileChangeTypes = new Set(['create', 'modify', 'delete']);
    const changelog = this.deps!.changelog.searchChangelog({ taskId, agentId });
    const modifiedFiles = new Set<string>();
    for (const entry of changelog) {
      if (fileChangeTypes.has(entry.changeType)) {
        modifiedFiles.add(entry.filePath);
      }
    }

    // Check for violations (modified files that match boundaries)
    const violations: string[] = [];
    for (const modified of modifiedFiles) {
      for (const boundary of boundaries) {
        if (this.matchesBoundary(modified, boundary)) {
          violations.push(modified);
          break;
        }
      }
    }

    return {
      passed: violations.length === 0,
      boundaries,
      violations
    };
  }

  private checkClaimsReleased(agentId: string): ClaimsResult {
    const activeClaims = this.deps!.claims.getAgentClaims(agentId);

    return {
      passed: activeClaims.length === 0,
      activeClaims
    };
  }

  // ==================== HELPERS ====================

  private calculateScore(checks: ComplianceChecks): number {
    let score = 0;

    // Intent posted: 20 points
    if (checks.intentPosted.passed) score += 20;

    // Evidence attached: 20 points
    if (checks.evidenceAttached.passed) score += 20;

    // Files match: 30 points (most important)
    if (checks.filesMatch.passed) score += 30;

    // Boundaries respected: 20 points
    if (checks.boundariesRespected.passed) score += 20;

    // Claims released: 10 points
    if (checks.claimsReleased.passed) score += 10;

    return score;
  }

  private generateSummary(checks: ComplianceChecks, score: number): string {
    const issues: string[] = [];

    if (!checks.intentPosted.passed) {
      issues.push('No intent posted for this task');
    }

    if (!checks.evidenceAttached.passed) {
      issues.push('No evidence attached');
    }

    if (!checks.filesMatch.passed) {
      issues.push(`Undeclared files modified: ${checks.filesMatch.undeclared.join(', ')}`);
    }

    if (!checks.boundariesRespected.passed) {
      issues.push(`Boundary violations: ${checks.boundariesRespected.violations.join(', ')}`);
    }

    if (!checks.claimsReleased.passed) {
      issues.push(`Active claims on: ${checks.claimsReleased.activeClaims.join(', ')}`);
    }

    if (issues.length === 0) {
      return `Fully compliant (score: ${score}/100)`;
    }

    return `Compliance issues (score: ${score}/100): ${issues.join('; ')}`;
  }

  /**
   * Parse boundaries string into array of file paths/patterns
   * Supports comma, newline, semicolon separators
   * Also extracts file paths from natural language like "DO NOT TOUCH src/foo.ts"
   */
  private parseBoundaries(boundaries: string): string[] {
    const results: string[] = [];

    // Split on common delimiters
    const parts = boundaries.split(/[,;\n]+/);

    for (let part of parts) {
      part = part.trim();
      if (!part) continue;

      // Check if it looks like a file path (contains / or . or starts with src/, etc.)
      if (this.looksLikeFilePath(part)) {
        results.push(part);
      } else {
        // Try to extract file paths from natural language
        const extracted = this.extractFilePaths(part);
        results.push(...extracted);
      }
    }

    return results;
  }

  private looksLikeFilePath(s: string): boolean {
    // Simple heuristics for file paths
    return /^[a-zA-Z0-9_\-./\\*]+\.[a-zA-Z0-9]+$/.test(s) || // Has extension
           /^[a-zA-Z0-9_\-]+\//.test(s) ||                    // Starts with dir/
           /^\.\//.test(s) ||                                  // Starts with ./
           /^\*/.test(s);                                      // Glob pattern
  }

  private extractFilePaths(text: string): string[] {
    // Extract file-like patterns from text
    // Matches things like: src/foo.ts, ./bar.js, components/Button.tsx
    const regex = /(?:^|[\s'"(])((?:\.\/|[a-zA-Z0-9_\-]+\/)*[a-zA-Z0-9_\-.*]+\.[a-zA-Z0-9]+)/g;
    const paths: string[] = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      paths.push(match[1]);
    }

    return paths;
  }

  /**
   * Check if a file path matches a boundary pattern
   * Supports exact match and simple glob patterns (* wildcard)
   */
  private matchesBoundary(filePath: string, boundary: string): boolean {
    // Exact match
    if (filePath === boundary) return true;

    // Glob pattern with *
    if (boundary.includes('*')) {
      const regex = new RegExp('^' + boundary.replace(/\*/g, '.*') + '$');
      return regex.test(filePath);
    }

    // Directory prefix (e.g., boundary="src/core/" matches "src/core/foo.ts")
    if (boundary.endsWith('/') && filePath.startsWith(boundary)) {
      return true;
    }

    return false;
  }
}
