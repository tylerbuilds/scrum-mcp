import { useState, useEffect, useCallback, useMemo } from 'react';
import { Activity, Bot, ClipboardList, FileCheck, Lock, Target } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { apiFetch } from '../../config/api';
import { Card } from '../ui/card';
import { AgentBadge } from './AgentBadge';
import { PulseIndicator } from '../dashboard/AnimatedCard';
import { useScrumStore } from '../../store/useScrumStore';

interface RawFeedItem {
  type: string;
  ts: number;
  data: any;
}

type ActivityStatus = 'active' | 'idle' | 'offline' | 'unknown';

const GROUP_UNASSIGNED = 'unassigned';
const GROUP_SYSTEM = 'system';

const AGENT_ACCENTS = [
  {
    border: 'border-amber-500/40',
    glow: 'from-amber-500/15 via-orange-500/10 to-transparent',
    text: 'text-amber-300',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    bar: 'bg-amber-500'
  },
  {
    border: 'border-lime-500/40',
    glow: 'from-lime-500/15 via-emerald-500/10 to-transparent',
    text: 'text-lime-300',
    chip: 'bg-lime-500/15 text-lime-300 border-lime-500/40',
    bar: 'bg-lime-500'
  },
  {
    border: 'border-orange-500/40',
    glow: 'from-orange-500/15 via-rose-500/10 to-transparent',
    text: 'text-orange-300',
    chip: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
    bar: 'bg-orange-500'
  },
  {
    border: 'border-rose-500/40',
    glow: 'from-rose-500/15 via-red-500/10 to-transparent',
    text: 'text-rose-300',
    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    bar: 'bg-rose-500'
  },
  {
    border: 'border-yellow-500/40',
    glow: 'from-yellow-500/15 via-amber-500/10 to-transparent',
    text: 'text-yellow-300',
    chip: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
    bar: 'bg-yellow-500'
  }
];

const STATUS_STYLES: Record<ActivityStatus, { label: string; chip: string; pulse: 'emerald' | 'amber' | 'red' | 'orange' }> = {
  active: { label: 'ACTIVE', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', pulse: 'emerald' },
  idle: { label: 'IDLE', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/40', pulse: 'amber' },
  offline: { label: 'OFFLINE', chip: 'bg-red-500/15 text-red-300 border-red-500/40', pulse: 'red' },
  unknown: { label: 'UNKNOWN', chip: 'bg-stone-700/30 text-stone-300 border-stone-600/40', pulse: 'orange' }
};

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getGroupKey(item: RawFeedItem): string {
  const data = item.data ?? {};
  if (data.agentId) return data.agentId;
  if (item.type === 'task') {
    return data.assignedAgent || GROUP_UNASSIGNED;
  }
  return GROUP_SYSTEM;
}

function getGroupLabel(key: string): string {
  if (key === GROUP_UNASSIGNED) return 'Unassigned Queue';
  if (key === GROUP_SYSTEM) return 'System Channel';
  return key;
}

function getAccent(key: string) {
  if (key === GROUP_UNASSIGNED) {
    return {
      border: 'border-stone-600/40',
      glow: 'from-stone-500/20 via-stone-700/10 to-transparent',
      text: 'text-stone-300',
      chip: 'bg-stone-800/60 text-stone-300 border-stone-700',
      bar: 'bg-stone-500'
    };
  }
  if (key === GROUP_SYSTEM) {
    return {
      border: 'border-stone-500/40',
      glow: 'from-stone-600/20 via-stone-800/10 to-transparent',
      text: 'text-stone-300',
      chip: 'bg-stone-800/60 text-stone-300 border-stone-700',
      bar: 'bg-stone-500'
    };
  }
  const index = hashString(key) % AGENT_ACCENTS.length;
  return AGENT_ACCENTS[index];
}

function getEventMeta(item: RawFeedItem): {
  label: string;
  summary: string;
  detail?: string;
  icon: typeof Activity;
  accent: string;
  dot: string;
} {
  const data = item.data ?? {};

  if (item.type === 'task') {
    return {
      label: (data.status ?? 'task').toString().replace('_', ' ').toUpperCase(),
      summary: data.title || 'Task updated',
      detail: data.description || `Status: ${data.status ?? 'backlog'}`,
      icon: ClipboardList,
      accent: 'text-amber-300',
      dot: 'bg-amber-400'
    };
  }

  if (item.type === 'intent') {
    const taskId = typeof data.taskId === 'string' ? data.taskId.slice(0, 8) : 'unknown';
    return {
      label: 'INTENT',
      summary: `Intent posted for ${taskId}`,
      detail: data.acceptanceCriteria || `${data.files?.length ?? 0} file(s)`,
      icon: Target,
      accent: 'text-orange-300',
      dot: 'bg-orange-400'
    };
  }

  if (item.type === 'evidence') {
    return {
      label: 'EVIDENCE',
      summary: 'Evidence attached',
      detail: typeof data.command === 'string' ? data.command : 'Command captured',
      icon: FileCheck,
      accent: 'text-emerald-300',
      dot: 'bg-emerald-400'
    };
  }

  if (item.type === 'claim') {
    const count = data.files?.length ?? 0;
    return {
      label: 'CLAIM',
      summary: `Claimed ${count} file${count === 1 ? '' : 's'}`,
      detail: data.files?.[0] ? `e.g. ${data.files[0]}` : 'Exclusive edit lock',
      icon: Lock,
      accent: 'text-rose-300',
      dot: 'bg-rose-400'
    };
  }

  if (item.type === 'changelog') {
    return {
      label: (data.changeType ?? 'change').toString().replace('_', ' ').toUpperCase(),
      summary: data.summary || 'Change logged',
      detail: data.filePath || 'File update',
      icon: Activity,
      accent: 'text-yellow-300',
      dot: 'bg-yellow-400'
    };
  }

  return {
    label: item.type.toUpperCase(),
    summary: 'Activity captured',
    icon: Activity,
    accent: 'text-stone-300',
    dot: 'bg-stone-500'
  };
}

export function LobbyFeed() {
  const { lastUpdate, agents, tasks } = useScrumStore();
  const [feed, setFeed] = useState<RawFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const feedData = await apiFetch<RawFeedItem[]>('/api/feed?limit=80');

      // Only update if data actually changed
      setFeed(prev => {
        const feedStr = JSON.stringify(feedData);
        const prevStr = JSON.stringify(prev);
        if (feedStr === prevStr) return prev;
        return feedData;
      });

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch feed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!lastUpdate) return;
    const timer = window.setTimeout(() => {
      fetchData();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [lastUpdate, fetchData]);

  const grouped = useMemo(() => {
    const map = new Map<string, RawFeedItem[]>();
    feed.forEach((item) => {
      const key = getGroupKey(item);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    });

    return Array.from(map.entries())
      .map(([key, items]) => {
        const sorted = [...items].sort((a, b) => b.ts - a.ts);
        const counts: Record<string, number> = {};
        sorted.forEach((item) => {
          counts[item.type] = (counts[item.type] ?? 0) + 1;
        });
        return {
          key,
          items: sorted,
          counts,
          latest: sorted[0]?.ts ?? 0
        };
      })
      .sort((a, b) => b.latest - a.latest);
  }, [feed]);

  const agentMap = useMemo(() => {
    return new Map(agents.map(agent => [agent.agentId, agent]));
  }, [agents]);

  const taskMap = useMemo(() => {
    const map = new Map<string, { activeCount: number; assignedCount: number; activeTask?: string }>();
    tasks.forEach(task => {
      if (!task.assignedAgent) return;
      const entry = map.get(task.assignedAgent) ?? { activeCount: 0, assignedCount: 0 };
      entry.assignedCount += 1;
      if (task.status === 'in_progress') {
        entry.activeCount += 1;
        if (!entry.activeTask) entry.activeTask = task.title;
      }
      map.set(task.assignedAgent, entry);
    });
    return map;
  }, [tasks]);

  const activeAgentCount = useMemo(() => {
    const now = Date.now();
    return agents.filter(agent => now - agent.lastHeartbeat < 5 * 60 * 1000).length;
  }, [agents]);

  const lastPulseLabel = lastUpdate
    ? formatDistanceToNow(lastUpdate, { addSuffix: true })
    : 'no signals yet';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-stone-500">Agent Signal Map</p>
          <h3 className="text-xl font-semibold text-stone-100">Live MCP activity grouped by operator</h3>
          <p className="text-xs text-stone-500 mt-1">
            Every intent, claim, evidence, and change log shows up here in real time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg border border-stone-800 bg-stone-950/70 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Operators Active</p>
            <p className="text-lg font-semibold text-stone-100">{activeAgentCount}</p>
          </div>
          <div className="rounded-lg border border-stone-800 bg-stone-950/70 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Signals Captured</p>
            <p className="text-lg font-semibold text-stone-100">{feed.length}</p>
          </div>
          <div className="rounded-lg border border-stone-800 bg-stone-950/70 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Last Pulse</p>
            <p className="text-sm font-semibold text-stone-200">{lastPulseLabel}</p>
          </div>
        </div>
      </div>

      {error && (
        <Card className="bg-red-500/10 border-red-500/30 p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </Card>
      )}

      {!loading && feed.length === 0 && (
        <Card className="bg-stone-900/40 border-stone-700 p-8 text-center">
          <Bot className="w-12 h-12 text-stone-600 mx-auto mb-4" />
          <p className="text-stone-500">No activity yet</p>
        </Card>
      )}

      <div className="space-y-4">
        {grouped.map((group, index) => {
          const isAgentGroup = group.key !== GROUP_UNASSIGNED && group.key !== GROUP_SYSTEM;
          const accent = getAccent(group.key);
          const agent = agentMap.get(group.key);
          const agentTasks = taskMap.get(group.key);
          const now = Date.now();
          const isOffline = agent ? now - agent.lastHeartbeat > 5 * 60 * 1000 : false;
          const status: ActivityStatus = !isAgentGroup
            ? 'unknown'
            : agent
              ? isOffline
                ? 'offline'
                : (agentTasks?.activeCount ?? 0) > 0
                  ? 'active'
                  : 'idle'
              : 'unknown';
          const statusStyle = STATUS_STYLES[status];
          const latestSignal = group.latest
            ? formatDistanceToNow(group.latest, { addSuffix: true })
            : 'no signals';
          const itemsToShow = group.items.slice(0, 6);

          return (
            <motion.div
              key={group.key}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.005 }}
              transition={{ duration: 0.3, delay: index * 0.04 }}
              className={`relative overflow-hidden rounded-xl border ${accent.border} bg-stone-950/70 hover:shadow-lg hover:shadow-black/20`}
            >
              <div className={`absolute inset-0 bg-gradient-to-r ${accent.glow}`} />
              <div className="relative p-4 space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3">
                    {isAgentGroup ? (
                      <AgentBadge agentId={group.key} size="md" />
                    ) : (
                      <div className="flex items-center gap-2 rounded-full border border-stone-700 bg-stone-900/70 px-3 py-1.5">
                        <Bot className="w-4 h-4 text-stone-400" />
                        <span className="text-sm text-stone-200">{getGroupLabel(group.key)}</span>
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <PulseIndicator color={statusStyle.pulse} />
                        <span className={`text-[10px] uppercase tracking-wider border rounded-full px-2 py-0.5 ${statusStyle.chip}`}>
                          {statusStyle.label}
                        </span>
                        <span className="text-xs text-stone-500">Latest signal {latestSignal}</span>
                      </div>
                      {isAgentGroup && agentTasks?.activeTask ? (
                        <p className="text-sm text-stone-200">
                          Working on: <span className={accent.text}>{agentTasks.activeTask}</span>
                        </p>
                      ) : isAgentGroup ? (
                        <p className="text-sm text-stone-500">Standing by - no active task in progress</p>
                      ) : (
                        <p className="text-sm text-stone-500">System intake and queue updates</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {Object.entries(group.counts).map(([type, count]) => (
                      <span
                        key={`${group.key}-${type}`}
                        className={`text-[11px] uppercase tracking-wider border rounded-full px-2 py-1 ${accent.chip}`}
                      >
                        {type} {count}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="h-1 rounded-full bg-stone-900/70 overflow-hidden border border-stone-800">
                  <div
                    className={`h-full ${accent.bar}`}
                    style={{ width: `${Math.min(100, group.items.length * 12)}%` }}
                  />
                </div>

                <div className="space-y-2">
                  {itemsToShow.map((item) => {
                    const meta = getEventMeta(item);
                    const timeAgo = formatDistanceToNow(item.ts, { addSuffix: true });
                    const Icon = meta.icon;
                    return (
                      <motion.div
                        key={`${item.type}-${item.ts}-${meta.summary}`}
                        layout
                        whileHover={{ x: 4, backgroundColor: 'rgba(68, 64, 60, 0.15)' }}
                        transition={{ duration: 0.15 }}
                        className="flex items-start gap-3 rounded-lg border border-stone-800/80 bg-stone-950/40 px-3 py-2 cursor-default"
                      >
                        <div className={`mt-1 h-2 w-2 rounded-full ${meta.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs text-stone-500">
                            <Icon className={`w-3 h-3 ${meta.accent}`} />
                            <span className={`text-[10px] uppercase tracking-wider ${meta.accent}`}>{meta.label}</span>
                            <span className="text-stone-600">|</span>
                            <span>{timeAgo}</span>
                          </div>
                          <p className="text-sm text-stone-100 line-clamp-2">{meta.summary}</p>
                          {meta.detail && (
                            <p className="text-xs text-stone-500 truncate">{meta.detail}</p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}

                  {group.items.length > itemsToShow.length && (
                    <p className="text-xs text-stone-500">
                      + {group.items.length - itemsToShow.length} more signals in this channel
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
