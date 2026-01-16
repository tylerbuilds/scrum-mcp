import { useEffect, useState } from 'react';
import { useScrumStore } from '../store/useScrumStore';
import { SystemHealth } from '../components/dashboard/SystemHealth';
import { AgentGrid } from '../components/dashboard/AgentGrid';
import { AgentOpsPanel } from '../components/dashboard/AgentOpsPanel';
import { ConflictRadar } from '../components/dashboard/ConflictRadar';
import { ComplianceSummary } from '../components/dashboard/ComplianceSummary';
import { TaskQueue } from '../components/dashboard/TaskQueue';
import { TaskDetailModal } from '../components/dashboard/TaskDetailModal';
import { PulseIndicator } from '../components/dashboard/AnimatedCard';
import { CommandPalette, useCommandPalette } from '../components/dashboard/CommandPalette';
import { LobbyFeed } from '../components/lobby/LobbyFeed';
import { SearchBar } from '../components/dashboard/SearchBar';
import { SearchResults } from '../components/dashboard/SearchResults';
import { Activity, Radar, Radio, Shield, Command } from 'lucide-react';
import { motion } from 'framer-motion';

export function ControlRoomPage() {
  const { connect, disconnect, isConnected, agents, tasks, claims } = useScrumStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const commandPalette = useCommandPalette();

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const activeAgents = agents.filter(a => Date.now() - a.lastHeartbeat < 5 * 60 * 1000).length;
  const activeTasks = tasks.filter(t => t.status === 'in_progress').length;
  const queuedTasks = tasks.filter(t => t.status === 'backlog' || t.status === 'todo').length;
  const claimCount = claims.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="relative min-h-screen overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(34,197,94,0.14),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(120,113,108,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(120,113,108,0.14)_1px,transparent_1px)] bg-[size:64px_64px] opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0b0a08]/40 to-[#0b0a08]" />
      </div>

      <div className="relative p-6 max-w-[1920px] mx-auto space-y-6">
        {/* Command Header */}
        <div className="relative overflow-hidden rounded-2xl border border-stone-800 bg-stone-950/70 p-6">
          <div className="absolute -right-20 -top-16 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-lime-500/10 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(251,191,36,0.08),transparent_55%)]" />

          <div className="relative flex flex-col gap-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                  className="relative"
                >
                  <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full" />
                  <Radar className="w-10 h-10 text-amber-400 relative z-10" />
                </motion.div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-stone-100">
                    CONTROL ROOM
                  </h1>
                  <p className="text-sm text-stone-400">SCRUM MCP // Situation Monitor</p>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-stone-500">
                    <span className="flex items-center gap-1">
                      <Shield className="w-3 h-3 text-amber-400" />
                      v0.5.2
                    </span>
                    <span className="text-stone-600">|</span>
                    <span className="flex items-center gap-1">
                      <Radio className="w-3 h-3 text-stone-400" />
                      Port 4177
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-stone-800 bg-stone-900/70 px-4 py-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-stone-500">Active Agents</p>
                    <p className="text-base font-semibold text-stone-100">{activeAgents}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-stone-800 bg-stone-900/70 px-4 py-2">
                  <Activity className="w-4 h-4 text-lime-400" />
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-stone-500">Active Tasks</p>
                    <p className="text-base font-semibold text-stone-100">{activeTasks}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-stone-800 bg-stone-900/70 px-4 py-2">
                  <Activity className="w-4 h-4 text-orange-400" />
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-stone-500">Queue</p>
                    <p className="text-base font-semibold text-stone-100">{queuedTasks}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-stone-800 bg-stone-900/70 px-4 py-2">
                  <Activity className="w-4 h-4 text-rose-400" />
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-stone-500">Claims</p>
                    <p className="text-base font-semibold text-stone-100">{claimCount}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 flex-1">
                <SearchBar onSearchChange={setSearchQuery} />
                <button
                  onClick={commandPalette.open}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-900/70 border border-stone-800 hover:border-amber-500/50 hover:bg-stone-800 transition-colors text-stone-400 hover:text-stone-200"
                  title="Command Palette (⌘K)"
                >
                  <Command className="w-4 h-4" />
                  <kbd className="text-[10px] font-mono bg-stone-800 px-1.5 py-0.5 rounded">⌘K</kbd>
                </button>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-900/70 border border-stone-800 whitespace-nowrap">
                <PulseIndicator color={isConnected ? 'emerald' : 'red'} />
                <span className={`text-xs font-semibold ${isConnected ? 'text-emerald-300' : 'text-red-300'}`}>
                  {isConnected ? 'LIVE LINK' : 'OFFLINE'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {searchQuery ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <SearchResults query={searchQuery} onClose={() => setSearchQuery('')} />
          </motion.div>
        ) : (
          <>
            <SystemHealth />

            <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6">
              <div className="space-y-6">
                <AgentOpsPanel />
                <AgentGrid />
              </div>

              <div className="space-y-6">
                <TaskQueue onTaskClick={setSelectedTaskId} />
                <ConflictRadar />
                <ComplianceSummary />
              </div>
            </div>

            {/* Full-width Recent Activity Feed at bottom */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-stone-950/70 border border-stone-800 rounded-lg overflow-hidden backdrop-blur-sm"
            >
              <div className="p-4 border-b border-stone-800">
                <h3 className="text-base font-semibold flex items-center gap-2 text-stone-100">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                  >
                    <Activity className="w-4 h-4 text-amber-400" />
                  </motion.div>
                  <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-lime-300 bg-clip-text text-transparent">
                    OPERATOR ACTIVITY LOG
                  </span>
                </h3>
              </div>
              <div className="p-4">
                <LobbyFeed />
              </div>
            </motion.div>
          </>
        )}

        {/* Task Detail Modal */}
        <TaskDetailModal taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />

        {/* Command Palette */}
        <CommandPalette isOpen={commandPalette.isOpen} onClose={commandPalette.close} />
      </div>
    </motion.div>
  );
}
