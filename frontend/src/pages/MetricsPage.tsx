import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  RefreshCw,
  ArrowLeft,
  AlertCircle,
  CheckSquare,
  Hash,
  Clock,
  Zap,
  Timer,
  Activity,
} from 'lucide-react';
import { apiFetch } from '../config/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { MetricsCard, ThroughputChart, AgingWipList, AgingWipItem } from '../components/metrics';

interface BoardMetrics {
  period: { since: number; until: number };
  completedCount: number;
  totalStoryPoints: number;
  avgLeadTimeMs?: number;
  avgCycleTimeMs?: number;
  p50LeadTimeMs?: number;
  p90LeadTimeMs?: number;
  p50CycleTimeMs?: number;
  p90CycleTimeMs?: number;
  throughputDaily: number[];
  velocityWeekly: number[];
  wipByStatus: Record<string, number>;
  wipAging: AgingWipItem[];
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null || isNaN(ms)) return '--';

  const hours = ms / (1000 * 60 * 60);
  const days = hours / 24;

  if (days >= 1) {
    return `${days.toFixed(1)} days`;
  } else if (hours >= 1) {
    return `${hours.toFixed(1)} hours`;
  } else {
    const minutes = ms / (1000 * 60);
    return `${Math.round(minutes)} min`;
  }
}

function formatDateRange(since: number, until: number): string {
  const sinceDate = new Date(since);
  const untilDate = new Date(until);
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

  return `${sinceDate.toLocaleDateString('en-US', options)} - ${untilDate.toLocaleDateString('en-US', options)}`;
}

export function MetricsPage() {
  const [metrics, setMetrics] = useState<BoardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<BoardMetrics>('/api/metrics');
      setMetrics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const handleTaskClick = (taskId: string) => {
    window.location.hash = `#/task/${taskId}`;
  };

  // Calculate current WIP
  const currentWip = metrics
    ? Object.entries(metrics.wipByStatus)
        .filter(([status]) => status === 'in_progress' || status === 'review')
        .reduce((sum, [, count]) => sum + count, 0)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
          <p className="text-slate-400">Loading metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <a
              href="#/board"
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              title="Back to Board"
            >
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </a>
            <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-lg">
              <BarChart3 className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Metrics Dashboard</h1>
              <p className="text-sm text-slate-400">
                {metrics ? formatDateRange(metrics.period.since, metrics.period.until) : 'Loading...'}
              </p>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={fetchMetrics} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <Card className="bg-red-500/10 border-red-500/30 p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          </Card>
        )}

        {metrics && (
          <>
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <MetricsCard
                title="Tasks Completed"
                value={metrics.completedCount}
                subtitle="Last 30 days"
                icon={CheckSquare}
                colorClass="text-green-400"
              />
              <MetricsCard
                title="Story Points"
                value={metrics.totalStoryPoints}
                subtitle="Velocity (30d)"
                icon={Hash}
                colorClass="text-purple-400"
              />
              <MetricsCard
                title="Avg Cycle Time"
                value={formatDuration(metrics.avgCycleTimeMs)}
                subtitle="Start to done"
                icon={Timer}
                colorClass="text-cyan-400"
              />
              <MetricsCard
                title="Avg Lead Time"
                value={formatDuration(metrics.avgLeadTimeMs)}
                subtitle="Created to done"
                icon={Clock}
                colorClass="text-amber-400"
              />
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricsCard
                title="P50 Cycle Time"
                value={formatDuration(metrics.p50CycleTimeMs)}
                subtitle="Median"
                icon={Zap}
                colorClass="text-slate-400"
              />
              <MetricsCard
                title="P90 Cycle Time"
                value={formatDuration(metrics.p90CycleTimeMs)}
                subtitle="90th percentile"
                icon={Zap}
                colorClass="text-slate-400"
              />
              <MetricsCard
                title="P90 Lead Time"
                value={formatDuration(metrics.p90LeadTimeMs)}
                subtitle="90th percentile"
                icon={Clock}
                colorClass="text-slate-400"
              />
              <MetricsCard
                title="Current WIP"
                value={currentWip}
                subtitle="In progress + review"
                icon={Activity}
                colorClass="text-orange-400"
              />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Throughput Chart */}
              <Card className="bg-slate-800/50 border-slate-700 p-6">
                <ThroughputChart data={metrics.throughputDaily} title="Daily Throughput (Tasks Completed)" />
              </Card>

              {/* Velocity Chart */}
              <Card className="bg-slate-800/50 border-slate-700 p-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-slate-300">Weekly Velocity (Story Points)</h3>
                  <div className="flex items-end gap-3 h-32">
                    {metrics.velocityWeekly.map((value, idx) => {
                      const maxValue = Math.max(...metrics.velocityWeekly, 1);
                      const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
                      const weeksAgo = metrics.velocityWeekly.length - 1 - idx;

                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full relative flex flex-col justify-end h-24">
                            <div
                              className={`w-full rounded-t transition-all duration-300 ${
                                weeksAgo === 0
                                  ? 'bg-gradient-to-t from-purple-600 to-purple-400'
                                  : 'bg-gradient-to-t from-slate-600 to-slate-500'
                              }`}
                              style={{ height: `${Math.max(height, 4)}%` }}
                              title={`${value} story points`}
                            />
                            {value > 0 && (
                              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-slate-400">
                                {value}
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-xs ${weeksAgo === 0 ? 'text-purple-400 font-medium' : 'text-slate-500'}`}
                          >
                            {weeksAgo === 0 ? 'This wk' : weeksAgo === 1 ? 'Last wk' : `${weeksAgo}w ago`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
                    <span>Last {metrics.velocityWeekly.length} weeks</span>
                    <span className="text-slate-600">|</span>
                    <span>Total: {metrics.velocityWeekly.reduce((a, b) => a + b, 0)} points</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Aging WIP Section */}
            <Card className="bg-slate-800/50 border-slate-700 p-6">
              <h3 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                Aging Work in Progress
              </h3>
              <AgingWipList items={metrics.wipAging} onTaskClick={handleTaskClick} />
            </Card>

            {/* WIP by Status */}
            {Object.keys(metrics.wipByStatus).length > 0 && (
              <Card className="bg-slate-800/50 border-slate-700 p-6">
                <h3 className="text-lg font-medium text-slate-200 mb-4">WIP by Status</h3>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(metrics.wipByStatus).map(([status, count]) => (
                    <div
                      key={status}
                      className="flex items-center gap-2 bg-slate-700/50 px-3 py-2 rounded-lg"
                    >
                      <span className="text-sm text-slate-400 capitalize">
                        {status.replace('_', ' ')}:
                      </span>
                      <span className="text-lg font-semibold text-slate-200">{count}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
