import { useScrumStore } from '../../store/useScrumStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Activity, Clock, Database, Wifi, WifiOff, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PulseIndicator, MetricValue } from './AnimatedCard';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';

// Agent type detection with color coding
function getAgentConfig(agentId: string) {
  const id = agentId.toLowerCase();

  // Claude Code / Claude (anthropic)
  if (id.includes('claude') || id.includes('anthropic') || id.includes('opus')) {
    return {
      name: 'Claude',
      color: 'text-amber-300',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
      gradient: 'rgba(251, 191, 36, 0.18), rgba(249, 115, 22, 0.12)',
      icon: 'Cpu',
      badge: 'CLAUDE'
    };
  }

  // Cursor
  if (id.includes('cursor')) {
    return {
      name: 'Cursor',
      color: 'text-lime-300',
      bgColor: 'bg-lime-500/10',
      borderColor: 'border-lime-500/30',
      gradient: 'rgba(163, 230, 53, 0.18), rgba(16, 185, 129, 0.12)',
      icon: 'Cpu',
      badge: 'CURSOR'
    };
  }

  // Windsurf
  if (id.includes('windsurf')) {
    return {
      name: 'Windsurf',
      color: 'text-rose-300',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/30',
      gradient: 'rgba(251, 113, 133, 0.18), rgba(249, 115, 22, 0.12)',
      icon: 'Cpu',
      badge: 'WINDSURF'
    };
  }

  // Copilot
  if (id.includes('copilot') || id.includes('github')) {
    return {
      name: 'Copilot',
      color: 'text-emerald-300',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
      gradient: 'rgba(16, 185, 129, 0.18), rgba(190, 242, 100, 0.12)',
      icon: 'Cpu',
      badge: 'COPILOT'
    };
  }

  // Codeium
  if (id.includes('codeium')) {
    return {
      name: 'Codeium',
      color: 'text-orange-300',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/30',
      gradient: 'rgba(249, 115, 22, 0.18), rgba(251, 191, 36, 0.12)',
      icon: 'Cpu',
      badge: 'CODEIUM'
    };
  }

  // Tabnine
  if (id.includes('tabnine')) {
    return {
      name: 'Tabnine',
      color: 'text-yellow-300',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/30',
      gradient: 'rgba(253, 224, 71, 0.18), rgba(251, 191, 36, 0.12)',
      icon: 'Cpu',
      badge: 'TABNINE'
    };
  }

  // Continue
  if (id.includes('continue')) {
    return {
      name: 'Continue',
      color: 'text-red-300',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
      gradient: 'rgba(248, 113, 113, 0.18), rgba(249, 115, 22, 0.12)',
      icon: 'Cpu',
      badge: 'CONTINUE'
    };
  }

  // Generic / Custom
  const parts = id.split('-');
  const toolName = parts[0]?.substring(0, 8).toUpperCase() || 'AI';
  return {
    name: toolName,
    color: 'text-stone-400',
    bgColor: 'bg-stone-500/10',
    borderColor: 'border-stone-500/30',
    gradient: 'rgba(120, 113, 108, 0.18), rgba(87, 83, 78, 0.12)',
    icon: 'Cpu',
    badge: toolName.substring(0, 6)
  };
}

export function AgentGrid() {
  const { agents, tasks } = useScrumStore();

  const getAgentActiveTask = (agentId: string) => {
    return tasks.find(t => t.assignedAgent === agentId && t.status === 'in_progress');
  };

  return (
    <Card className="bg-stone-950/60 border-stone-800 backdrop-blur-sm relative overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            >
              <Database className="w-5 h-5 text-amber-400" />
            </motion.div>
            <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-lime-300 bg-clip-text text-transparent font-bold">
              OPERATOR ARRAY
            </span>
          </div>
          <motion.div
            className="ml-auto"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Badge variant="secondary" className="bg-amber-500/20 text-amber-300 border-amber-500/50">
              <MetricValue value={agents.length} /> Online
            </Badge>
          </motion.div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <AnimatePresence mode="popLayout">
          {agents.length === 0 ? (
            <motion.div
              key="no-agents"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-12 text-center"
            >
              <Cpu className="w-12 h-12 text-stone-600 mx-auto mb-4" />
              <p className="text-stone-500 mb-2">No active operators deployed</p>
              <p className="text-xs text-stone-600">
                Agents appear when they register via heartbeat
              </p>
              <div className="mt-4 p-3 bg-stone-950/60 rounded border border-stone-800 inline-block">
                <p className="text-xs text-stone-400 mb-2 font-mono">
                  To test agents, run:
                </p>
                <code className="text-xs bg-stone-900 text-amber-300 px-2 py-1 rounded block text-left">
                  curl -X POST http://localhost:4177/api/agents/test-agent-1 \<br />
                    -H "Content-Type: application/json" \<br />
                    -d {'{"capabilities": ["test"]}'}
                </code>
              </div>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent, index) => {
                const config = getAgentConfig(agent.agentId);
                const activeTask = getAgentActiveTask(agent.agentId);
                const isOffline = Date.now() - agent.lastHeartbeat > 5 * 60 * 1000;

                return (
                  <motion.div
                    key={agent.agentId}
                    layout
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    whileHover={isOffline ? {} : { y: -2, scale: 1.01 }}
                    transition={{
                      duration: 0.3,
                      delay: index * 0.05,
                      layout: { duration: 0.2 }
                    }}
                    className={clsx(
                      "relative p-4 rounded-lg border overflow-hidden group cursor-default",
                      isOffline
                        ? "bg-stone-950/60 border-stone-800 opacity-60"
                        : "bg-stone-900/80 border-stone-800 hover:border-amber-500/50 transition-all hover:shadow-lg hover:shadow-amber-500/5"
                    )}
                  >
                    {/* Gradient glow effect based on agent type */}
                    {!isOffline && (
                      <motion.div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{
                          background: `linear-gradient(135deg, ${config.gradient})`,
                        }}
                      />
                    )}

                    <div className="relative">
                      {/* Agent Type Badge */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <PulseIndicator color={isOffline ? 'red' : 'emerald'} />
                          <div>
                            <div className={`text-xs font-semibold ${config.color} mb-0.5`}>
                              {config.badge}
                            </div>
                            <div className="text-xs text-stone-500 font-mono">
                              {agent.agentId.split('-')[0].substring(0, 10)}
                            </div>
                          </div>
                        </div>
                        <motion.div
                          animate={isOffline ? { opacity: 0.5 } : { opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          {isOffline ? (
                            <WifiOff className="w-4 h-4 text-stone-500" />
                          ) : (
                            <Wifi className={`w-4 h-4 ${config.color}`} />
                          )}
                        </motion.div>
                      </div>

                      <div className="space-y-3">
                        {/* Capabilities */}
                        <div className="flex flex-wrap gap-1">
                          {agent.capabilities.map((cap) => (
                            <motion.span
                              key={cap}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className={clsx(
                                "px-2 py-0.5 rounded text-xs border",
                                config.bgColor,
                                config.color
                              )}
                            >
                              {cap}
                            </motion.span>
                          ))}
                        </div>

                        {/* Active Task or Idle */}
                        <AnimatePresence mode="wait">
                          {activeTask ? (
                            <motion.div
                              key="working"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className={clsx(
                                "p-2 rounded border",
                                "bg-amber-500/10 border-amber-500/30"
                              )}
                            >
                              <div className="text-xs text-amber-300 mb-1 flex items-center gap-1 font-medium">
                                <motion.div
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                >
                                  <Activity className="w-3 h-3" />
                                </motion.div>
                                EXECUTING
                              </div>
                              <div className="text-sm text-stone-100 line-clamp-2" title={activeTask.title}>
                                {activeTask.title}
                              </div>
                              {activeTask.assignedAgent && (
                                <div className="text-xs text-stone-500 mt-1 flex items-center gap-1">
                                  <div className={`w-2 h-2 rounded-full ${config.color.replace('text-', 'bg-').replace('/400', '')}`} />
                                  <span className="truncate">{activeTask.assignedAgent}</span>
                                </div>
                              )}
                            </motion.div>
                          ) : (
                            <motion.div
                              key="idle"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="text-xs text-stone-500 italic flex items-center gap-1"
                            >
                              <Clock className="w-3 h-3" /> STANDBY
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Heartbeat info */}
                        <div className="text-xs text-stone-600 font-mono flex items-center justify-between">
                          <span>HB: {formatDistanceToNow(agent.lastHeartbeat, { addSuffix: true })}</span>
                          <span className={config.color}>●</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
