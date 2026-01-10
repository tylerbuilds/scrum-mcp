import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Inbox,
  Filter,
  Bot,
  ClipboardList,
  Target,
  FileCheck,
  Lock,
} from 'lucide-react';
import { apiFetch } from '../../config/api';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { FeedCard } from './FeedCard';
import { AgentBadge } from './AgentBadge';

interface FeedItem {
  id: string;
  type: 'task' | 'intent' | 'evidence' | 'claim';
  title: string;
  content: string | null;
  agent_id: string | null;
  task_id: string | null;
  created_at: number;
  metadata: Record<string, unknown>;
}

interface ScrumStatus {
  tasks: number;
  intents: number;
  claims: number;
  evidence: number;
  changelog: number;
  now: number;
}

type FilterType = 'all' | 'task' | 'intent' | 'evidence' | 'claim';

export function LobbyFeed() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [status, setStatus] = useState<ScrumStatus | null>(null);
  const [agents, setAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [feedData, statusData, agentsData] = await Promise.all([
        apiFetch<FeedItem[]>('/api/feed?limit=100'),
        apiFetch<ScrumStatus>('/api/status'),
        apiFetch<{ agents: string[] }>('/api/agents'),
      ]);

      setFeed(feedData);
      setStatus(statusData);
      setAgents(agentsData.agents);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch lobby data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 10 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchData();
    }, 10000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const filteredFeed = feed.filter((item) => {
    if (filter !== 'all' && item.type !== filter) return false;
    if (selectedAgent && item.agent_id !== selectedAgent) return false;
    return true;
  });

  const filterButtons: { type: FilterType; label: string; icon: typeof ClipboardList }[] = [
    { type: 'all', label: 'All', icon: Inbox },
    { type: 'task', label: 'Tasks', icon: ClipboardList },
    { type: 'intent', label: 'Intents', icon: Target },
    { type: 'evidence', label: 'Evidence', icon: FileCheck },
    { type: 'claim', label: 'Claims', icon: Lock },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
          <p className="text-slate-400">Loading agent activity...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      {status && (
        <Card className="bg-slate-800/50 border-slate-700 p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-cyan-400" />
                <span className="text-sm text-slate-300">
                  <span className="text-cyan-400 font-semibold">{status.tasks}</span> tasks
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-slate-300">
                  <span className="text-purple-400 font-semibold">{status.intents}</span> intents
                </span>
              </div>
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-green-400" />
                <span className="text-sm text-slate-300">
                  <span className="text-green-400 font-semibold">{status.evidence}</span> evidence
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-orange-400" />
                <span className="text-sm text-slate-300">
                  <span className="text-orange-400 font-semibold">{status.claims}</span> active
                  claims
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={autoRefresh ? 'text-green-400' : 'text-slate-400'}
              >
                <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="outline" size="sm" onClick={fetchData}>
                Refresh
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Card className="bg-red-500/10 border-red-500/30 p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Type Filter */}
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
          {filterButtons.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${
                filter === type
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Agent Filter */}
        {agents.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setSelectedAgent(null)}
                className={`px-2 py-1 rounded text-xs ${
                  selectedAgent === null
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                All Agents
              </button>
              {agents.map((agent) => (
                <button
                  key={agent}
                  onClick={() => setSelectedAgent(selectedAgent === agent ? null : agent)}
                  className={`transition-opacity ${
                    selectedAgent === agent ? 'opacity-100' : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  <AgentBadge agentId={agent} size="sm" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="space-y-3">
        {filteredFeed.length === 0 ? (
          <Card className="bg-slate-800/30 border-slate-700 p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <Bot className="w-12 h-12 text-slate-600" />
              <div>
                <h3 className="text-lg font-medium text-slate-400">No Activity Yet</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {filter !== 'all' || selectedAgent
                    ? 'No matching activity found. Try adjusting your filters.'
                    : 'When AI agents coordinate through SCRUM, their activity will appear here.'}
                </p>
              </div>
            </div>
          </Card>
        ) : (
          filteredFeed.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              onTaskClick={(taskId) => {
                window.location.hash = `#/task/${taskId}`;
              }}
            />
          ))
        )}
      </div>

      {/* Load More / Stats */}
      {filteredFeed.length > 0 && (
        <div className="text-center py-4">
          <p className="text-sm text-slate-500">
            Showing {filteredFeed.length} of {feed.length} activities
          </p>
        </div>
      )}
    </div>
  );
}
