import { nanoid } from 'nanoid';
import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type { Webhook, WebhookDelivery, WebhookEventType } from '../types.js';
import { type BaseRepository, now } from './base.js';

/**
 * Webhooks Repository - handles webhook registration, updates, and delivery logging
 */
export class WebhooksRepository implements BaseRepository {
  constructor(
    public readonly db: BetterSqlite3.Database,
    public readonly log: Logger
  ) {}

  // ==================== WEBHOOK REGISTRATION ====================

  registerWebhook(input: {
    name: string;
    url: string;
    events: WebhookEventType[];
    headers?: Record<string, string>;
    secret?: string;
  }): Webhook {
    const webhook: Webhook = {
      id: nanoid(12),
      name: input.name,
      url: input.url,
      events: input.events,
      headers: input.headers,
      secret: input.secret,
      enabled: true,
      createdAt: now()
    };

    this.db
      .prepare(`INSERT INTO webhooks
        (id, name, url, events_json, headers_json, secret, enabled, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        webhook.id,
        webhook.name,
        webhook.url,
        JSON.stringify(webhook.events),
        JSON.stringify(webhook.headers ?? {}),
        webhook.secret,
        1,
        webhook.createdAt
      );

    return webhook;
  }

  listWebhooks(options?: { event?: WebhookEventType; enabledOnly?: boolean }): Webhook[] {
    let query = 'SELECT * FROM webhooks';
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options?.enabledOnly) {
      conditions.push('enabled = 1');
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY created_at DESC';

    const rows = this.db.prepare(query).all(...params) as Array<{
      id: string;
      name: string;
      url: string;
      events_json: string;
      headers_json: string | null;
      secret: string | null;
      enabled: number;
      created_at: number;
      updated_at: number | null;
    }>;

    let webhooks = rows.map(r => ({
      id: r.id,
      name: r.name,
      url: r.url,
      events: JSON.parse(r.events_json) as WebhookEventType[],
      headers: r.headers_json ? JSON.parse(r.headers_json) : undefined,
      secret: r.secret ?? undefined,
      enabled: !!r.enabled,
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? undefined
    }));

    // Filter by event if specified
    if (options?.event) {
      webhooks = webhooks.filter(w => w.events.includes(options.event!));
    }

    return webhooks;
  }

  updateWebhook(webhookId: string, updates: {
    url?: string;
    events?: WebhookEventType[];
    headers?: Record<string, string>;
    enabled?: boolean;
  }): Webhook | null {
    const existing = this.db
      .prepare('SELECT * FROM webhooks WHERE id = ?')
      .get(webhookId);

    if (!existing) return null;

    const setClauses: string[] = [];
    const params: (string | number)[] = [];

    if (updates.url !== undefined) {
      setClauses.push('url = ?');
      params.push(updates.url);
    }
    if (updates.events !== undefined) {
      setClauses.push('events_json = ?');
      params.push(JSON.stringify(updates.events));
    }
    if (updates.headers !== undefined) {
      setClauses.push('headers_json = ?');
      params.push(JSON.stringify(updates.headers));
    }
    if (updates.enabled !== undefined) {
      setClauses.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }

    setClauses.push('updated_at = ?');
    params.push(now());
    params.push(webhookId);

    this.db
      .prepare(`UPDATE webhooks SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...params);

    return this.listWebhooks().find(w => w.id === webhookId) ?? null;
  }

  deleteWebhook(webhookId: string): boolean {
    const info = this.db.prepare('DELETE FROM webhooks WHERE id = ?').run(webhookId);
    return info.changes > 0;
  }

  // ==================== WEBHOOK DELIVERIES ====================

  recordWebhookDelivery(input: {
    webhookId: string;
    eventType: WebhookEventType;
    payload: Record<string, unknown>;
    statusCode?: number;
    response?: string;
    durationMs?: number;
    success: boolean;
  }): WebhookDelivery {
    const delivery: WebhookDelivery = {
      id: nanoid(12),
      webhookId: input.webhookId,
      eventType: input.eventType,
      payload: input.payload,
      statusCode: input.statusCode,
      response: input.response ? input.response.slice(0, 1000) : undefined,
      durationMs: input.durationMs,
      success: input.success,
      createdAt: now()
    };

    this.db
      .prepare(`INSERT INTO webhook_deliveries
        (id, webhook_id, event_type, payload_json, status_code, response, duration_ms, success, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        delivery.id,
        delivery.webhookId,
        delivery.eventType,
        JSON.stringify(delivery.payload),
        delivery.statusCode,
        delivery.response,
        delivery.durationMs,
        delivery.success ? 1 : 0,
        delivery.createdAt
      );

    return delivery;
  }

  listWebhookDeliveries(webhookId: string, limit: number = 50): WebhookDelivery[] {
    const rows = this.db
      .prepare(`SELECT * FROM webhook_deliveries
        WHERE webhook_id = ?
        ORDER BY created_at DESC
        LIMIT ?`)
      .all(webhookId, limit) as Array<{
        id: string;
        webhook_id: string;
        event_type: string;
        payload_json: string;
        status_code: number | null;
        response: string | null;
        duration_ms: number | null;
        success: number;
        created_at: number;
      }>;

    return rows.map(r => ({
      id: r.id,
      webhookId: r.webhook_id,
      eventType: r.event_type as WebhookEventType,
      payload: JSON.parse(r.payload_json),
      statusCode: r.status_code ?? undefined,
      response: r.response ?? undefined,
      durationMs: r.duration_ms ?? undefined,
      success: !!r.success,
      createdAt: r.created_at
    }));
  }
}
