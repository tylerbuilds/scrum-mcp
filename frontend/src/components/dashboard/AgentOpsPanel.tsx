import { useMemo } from 'react';
import { useScrumStore } from '../../store/useScrumStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Activity, Signal, Shield } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { PulseIndicator } from './AnimatedCard';

type AgentStatus = 'active' | 'idle' | 'offline';

const statusStyles: Record<AgentStatus, { label: string; dot: 'emerald' | 'amber' | 'red'; chip: string; text: string }> = {
  active: {
    label: 'ACTIVE',
    dot: 'emerald',
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    text: 'text-emerald-300',
  },
  idle: {
    label: 'IDLE',
    dot: 'amber',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    text: 'text-amber-300',
  },
  offline: {
    label: 'OFFLINE',
    dot: 'red',
    chip: 'bg-red-500/15 text-red-300 border-red-500/30',
    text: 'text-red-300',
  },
};

export function AgentOpsPanel() {
  const { agents, tasks, claims } = useScrumStore();

  const rows = useMemo(() => {
    const now = Date.now();
    return agents.map(agent => {
      const assigned = tasks.filter(task => task.assignedAgent === agent.agentId);
      const activeTasks = assigned.filter(task => task.status === 'in_progress');
      const claimCount = claims.filter(claim => claim.agentId === agent.agentId).length;
      const isOffline = now - agent.lastHeartbeat > 5 * 60 * 1000;
      const status: AgentStatus = isOffline ? 'offline' : activeTasks.length > 0 ? 'active' : 'idle';
      const primaryTask = activeTasks[0] || assigned[0];

      return {
        agent,
        status,
        claimCount,
        assignedCount: assigned.length,
        activeCount: activeTasks.length,
        primaryTask,
      };
    }).sort((a, b) => {
      const order = { active: 0, idle: 1, offline: 2 };
      const statusDiff = order[a.status] - order[b.status];
      if (statusDiff !== 0) return statusDiff;
      return b.agent.lastHeartbeat - a.agent.lastHeartbeat;
    });
  }, [agents, tasks, claims]);

  return (
    <Card className="bg-stone-950/70 border-stone-800">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Signal className="w-5 h-5 text-amber-400" />
            <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-lime-300 bg-clip-text text-transparent font-bold">
              OPERATOR TELEMETRY
            </span>
          </div>
          <Badge variant="secondary" className="bg-stone-900 text-stone-300 border border-stone-700">
            {agents.length} Signals
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <div className="py-10 text-center">
            <Shield className="w-10 h-10 text-stone-600 mx-auto mb-3" />
            <p className="text-stone-400">No operators reporting in</p>
          </div>
        ) : (
          <>
            <div className="hidden lg:grid grid-cols-[1.6fr_1.1fr_0.7fr_0.7fr] gap-3 text-[11px] uppercase tracking-wider text-stone-500">
              <span>Operator</span>
              <span>Active Task</span>
              <span>Claims</span>
              <span>Heartbeat</span>
            </div>
            <AnimatePresence mode="popLayout">
              {rows.map((row, index) => {
                const status = statusStyles[row.status];
                const loadPct = Math.min(100, row.assignedCount * 25);
                return (
                  <motion.div
                    key={row.agent.agentId}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                    className="grid grid-cols-1 lg:grid-cols-[1.6fr_1.1fr_0.7fr_0.7fr] gap-3 items-center p-3 rounded-lg border border-stone-800 bg-stone-950/60 hover:border-stone-600 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <PulseIndicator color={status.dot} />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-stone-100 truncate">
                            {row.agent.agentId}
                          </span>
                          <Badge className={clsx('text-[10px] px-2 py-0.5 border', status.chip)}>
                            {status.label}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {row.agent.capabilities.slice(0, 3).map(capability => (
                            <span
                              key={capability}
                              className="text-[11px] px-2 py-0.5 rounded border border-stone-700 text-stone-300 bg-stone-900/70"
                            >
                              {capability}
                            </span>
                          ))}
                          {row.agent.capabilities.length === 0 && (
                            <span className="text-[11px] text-stone-500">No capabilities</span>
                          )}
                        </div>
                        <div className="h-1.5 rounded-full bg-stone-900 border border-stone-800 overflow-hidden">
                          <div
                            className={clsx('h-full rounded-full', row.status === 'active' && 'bg-emerald-500', row.status === 'idle' && 'bg-amber-500', row.status === 'offline' && 'bg-stone-600')}
                            style={{ width: `${loadPct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="text-sm text-stone-300">
                      {row.primaryTask ? (
                        <div className="flex items-start gap-2">
                          <Activity className={clsx('w-4 h-4 mt-0.5', status.text)} />
                          <div>
                            <p className="font-medium text-stone-100 line-clamp-2">{row.primaryTask.title}</p>
                            <p className="text-xs text-stone-500">
                              {row.activeCount} active / {row.assignedCount} assigned
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-stone-500 italic">Standing by</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-stone-400">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-stone-700 bg-stone-900 text-stone-200">
                        {row.claimCount}
                      </span>
                      <span>locks</span>
                    </div>

                    <div className="text-xs text-stone-500">
                      {formatDistanceToNow(row.agent.lastHeartbeat, { addSuffix: true })}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </>
        )}
      </CardContent>
    </Card>
  );
}
