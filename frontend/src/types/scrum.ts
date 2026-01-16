export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type AgentStatus = 'active' | 'idle' | 'offline';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgent?: string;
  dueDate?: number;
  startedAt?: number;
  completedAt?: number;
  updatedAt?: number;
  labels: string[];
  storyPoints?: number;
  createdAt: number;
}

export interface Agent {
  agentId: string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
  lastHeartbeat: number;
  registeredAt: number;
  status: AgentStatus;
}

export interface Claim {
  agentId: string;
  files: string[];
  expiresAt: number;
  createdAt: number;
}

export interface ScrumEvent {
  type: string;
  ts: number;
  [key: string]: any;
}

export interface BoardMetrics {
  period: { since: number; until: number };
  completedCount: number;
  totalStoryPoints: number;
  avgLeadTimeMs?: number;
  avgCycleTimeMs?: number;
  p50CycleTimeMs?: number;
  throughputDaily: number[];
  wipByStatus: Record<TaskStatus, number>;
}
