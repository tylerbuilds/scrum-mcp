import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type { Agent, AgentStatus } from '../types.js';
import { type BaseRepository, now } from './base.js';

/**
 * Agents Repository - handles agent registration, heartbeats, and capabilities
 */
export class AgentsRepository implements BaseRepository {
  constructor(
    public readonly db: BetterSqlite3.Database,
    public readonly log: Logger
  ) {}

  // ==================== AGENT REGISTRATION ====================

  registerAgent(input: {
    agentId: string;
    capabilities: string[];
    metadata?: Record<string, unknown>;
  }): Agent {
    const t = now();
    const agent: Agent = {
      agentId: input.agentId,
      capabilities: input.capabilities,
      metadata: input.metadata,
      lastHeartbeat: t,
      registeredAt: t,
      status: 'active'
    };

    // Check if agent already exists
    const existing = this.db
      .prepare('SELECT registered_at FROM agents WHERE agent_id = ?')
      .get(input.agentId) as { registered_at: number } | undefined;

    if (existing) {
      // Update existing agent
      this.db
        .prepare(`UPDATE agents SET
          capabilities_json = ?,
          metadata_json = ?,
          last_heartbeat = ?,
          status = 'active'
          WHERE agent_id = ?`)
        .run(
          JSON.stringify(agent.capabilities),
          JSON.stringify(agent.metadata ?? {}),
          agent.lastHeartbeat,
          agent.agentId
        );
      agent.registeredAt = existing.registered_at;
    } else {
      // Insert new agent
      this.db
        .prepare(`INSERT INTO agents
          (agent_id, capabilities_json, metadata_json, last_heartbeat, registered_at, status)
          VALUES (?, ?, ?, ?, ?, ?)`)
        .run(
          agent.agentId,
          JSON.stringify(agent.capabilities),
          JSON.stringify(agent.metadata ?? {}),
          agent.lastHeartbeat,
          agent.registeredAt,
          agent.status
        );
    }

    return agent;
  }

  listAgents(options?: { status?: AgentStatus; includeOffline?: boolean }): Agent[] {
    // Mark agents as offline if no heartbeat in 5 minutes
    const offlineThreshold = now() - (5 * 60 * 1000);
    this.db
      .prepare("UPDATE agents SET status = 'offline' WHERE last_heartbeat < ? AND status != 'offline'")
      .run(offlineThreshold);

    let query = 'SELECT * FROM agents';
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (!options?.includeOffline) {
      conditions.push("status != 'offline'");
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY last_heartbeat DESC';

    const rows = this.db.prepare(query).all(...params) as Array<{
      agent_id: string;
      capabilities_json: string;
      metadata_json: string | null;
      last_heartbeat: number;
      registered_at: number;
      status: string;
    }>;

    return rows.map(r => ({
      agentId: r.agent_id,
      capabilities: JSON.parse(r.capabilities_json),
      metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
      lastHeartbeat: r.last_heartbeat,
      registeredAt: r.registered_at,
      status: r.status as AgentStatus
    }));
  }

  agentHeartbeat(agentId: string): boolean {
    const info = this.db
      .prepare("UPDATE agents SET last_heartbeat = ?, status = 'active' WHERE agent_id = ?")
      .run(now(), agentId);
    return info.changes > 0;
  }

  getAgent(agentId: string): Agent | null {
    const row = this.db
      .prepare('SELECT * FROM agents WHERE agent_id = ?')
      .get(agentId) as {
        agent_id: string;
        capabilities_json: string;
        metadata_json: string | null;
        last_heartbeat: number;
        registered_at: number;
        status: string;
      } | undefined;

    if (!row) return null;

    return {
      agentId: row.agent_id,
      capabilities: JSON.parse(row.capabilities_json),
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
      lastHeartbeat: row.last_heartbeat,
      registeredAt: row.registered_at,
      status: row.status as AgentStatus
    };
  }

  /**
   * Get list of unique agent IDs from all activity (legacy method for backwards compat)
   */
  getAgentIds(): string[] {
    const agents = new Set<string>();

    const intentAgents = this.db
      .prepare('SELECT DISTINCT agent_id FROM intents')
      .all() as Array<{ agent_id: string }>;
    for (const r of intentAgents) agents.add(r.agent_id);

    const evidenceAgents = this.db
      .prepare('SELECT DISTINCT agent_id FROM evidence')
      .all() as Array<{ agent_id: string }>;
    for (const r of evidenceAgents) agents.add(r.agent_id);

    const claimAgents = this.db
      .prepare('SELECT DISTINCT agent_id FROM claims')
      .all() as Array<{ agent_id: string }>;
    for (const r of claimAgents) agents.add(r.agent_id);

    return [...agents].sort();
  }
}
