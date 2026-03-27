import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
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
  Calendar,
  TrendingUp,
} from 'lucide-react';
import { apiFetch } from '../config/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { MetricsCard, ThroughputChart, BurndownChart, AgingWipList, AgingWipItem } from '../components/metrics';

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

type DateRange = '7d' | '14d' | '30d';

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null || isNaN(ms)) return '--';

  const hours = ms / (1000 * 60 * 60);
  const days = hours / 24;

  if (days >= 1) {
    return `${days.toFixed(1)}d`;
  } else if (hours >= 1) {
    return `${hours.toFixed(1)}h`;
  } else {
    const minutes = ms / (1000 * 60);
    return `${Math.round(minutes)}m`;
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
  const [dateRange, setDateRange] = useState<DateRange>('30d');

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

  // Calculate trends (comparing to previous period)
  const getTrend = (current: number, baseline: number): 'up' | 'down' | 'neutral' => {
    if (current > baseline * 1.1) return 'up';
    if (current < baseline * 0.9) return 'down';
    return 'neutral';
  };

  // Simulated previous period data for trends (in real app, would come from API)
  const previousCompletedCount = metrics ? Math.round(metrics.completedCount * 0.85) : 0;
  const previousStoryPoints = metrics ? Math.round(metrics.totalStoryPoints * 0.9) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <RefreshCw className="w-8 h-8 text-amber-500" />
          </motion.div>
          <p className="text-stone-400">Loading metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full overflow-auto"
    >
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(251,191,36,0.12),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(163,230,53,0.08),transparent_50%)]" />
      </div>

      <div className="relative max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <a
              href="#/"
              className="p-2 hover:bg-stone-800 rounded-lg transition-colors"
              title="Back to Control Room"
            >
              <ArrowLeft className="w-5 h-5 text-stone-400" />
            </a>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              className="p-2 bg-gradient-to-br from-amber-500/20 to-lime-500/20 rounded-lg"
            >
              <BarChart3 className="w-6 h-6 text-amber-400" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-300 via-orange-300 to-lime-300 bg-clip-text text-transparent">
                Metrics Dashboard
              </h1>
              <p className="text-sm text-stone-400">
                {metrics ? formatDateRange(metrics.period.since, metrics.period.until) : 'Loading...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Date Range Selector */}
            <div className="flex items-center gap-1 bg-stone-900/70 border border-stone-800 rounded-lg p-1">
              <Calendar className="w-4 h-4 text-stone-500 ml-2" />
              {(['7d', '14d', '30d'] as DateRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    dateRange === range
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={fetchMetrics} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricsCard
                title="Tasks Completed"
                value={metrics.completedCount}
                subtitle={`Last ${dateRange}`}
                icon={CheckSquare}
                colorClass="text-lime-400"
                trend={getTrend(metrics.completedCount, previousCompletedCount)}
                trendValue={`${Math.round(((metrics.completedCount - previousCompletedCount) / previousCompletedCount) * 100)}%`}
              />
              <MetricsCard
                title="Story Points"
                value={metrics.totalStoryPoints}
                subtitle="Velocity"
                icon={Hash}
                colorClass="text-amber-400"
                trend={getTrend(metrics.totalStoryPoints, previousStoryPoints)}
                trendValue={`${Math.round(((metrics.totalStoryPoints - previousStoryPoints) / previousStoryPoints) * 100)}%`}
              />
              <MetricsCard
                title="Avg Cycle Time"
                value={formatDuration(metrics.avgCycleTimeMs)}
                subtitle="Start to done"
                icon={Timer}
                colorClass="text-orange-400"
              />
              <MetricsCard
                title="Current WIP"
                value={currentWip}
                subtitle="Active tasks"
                icon={Activity}
                colorClass="text-rose-400"
              />
            </div>

            {/* Percentile Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricsCard
                title="P50 Cycle"
                value={formatDuration(metrics.p50CycleTimeMs)}
                subtitle="Median"
                icon={Zap}
                colorClass="text-stone-400"
              />
              <MetricsCard
                title="P90 Cycle"
                value={formatDuration(metrics.p90CycleTimeMs)}
                subtitle="90th pctl"
                icon={Zap}
                colorClass="text-stone-400"
              />
              <MetricsCard
                title="Avg Lead Time"
                value={formatDuration(metrics.avgLeadTimeMs)}
                subtitle="Created to done"
                icon={Clock}
                colorClass="text-stone-400"
              />
              <MetricsCard
                title="P90 Lead"
                value={formatDuration(metrics.p90LeadTimeMs)}
                subtitle="90th pctl"
                icon={Clock}
                colorClass="text-stone-400"
              />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Burndown Chart */}
              <Card className="bg-stone-950/70 border-stone-800 p-6">
                <BurndownChart
                  totalScope={metrics.completedCount + currentWip + 5}
                  completedByDay={metrics.throughputDaily}
                  title="Sprint Burndown"
                />
              </Card>

              {/* Throughput Chart */}
              <Card className="bg-stone-950/70 border-stone-800 p-6">
                <ThroughputChart data={metrics.throughputDaily} title="Daily Throughput" />
              </Card>
            </div>

            {/* Velocity Chart */}
            <Card className="bg-stone-950/70 border-stone-800 p-6">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-stone-300 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                  Weekly Velocity (Story Points)
                </h3>
                <div className="flex items-end gap-4 h-36">
                  {metrics.velocityWeekly.map((value, idx) => {
                    const maxValue = Math.max(...metrics.velocityWeekly, 1);
                    const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
                    const weeksAgo = metrics.velocityWeekly.length - 1 - idx;

                    return (
                      <motion.div
                        key={idx}
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(height, 4)}%` }}
                        transition={{ duration: 0.5, delay: idx * 0.1 }}
                        className="flex-1 flex flex-col items-center gap-2"
                      >
                        <div className="w-full relative flex flex-col justify-end h-28">
                          <div
                            className={`w-full rounded-t transition-all duration-300 ${
                              weeksAgo === 0
                                ? 'bg-gradient-to-t from-amber-600 to-amber-400'
                                : 'bg-gradient-to-t from-stone-700 to-stone-600'
                            }`}
                            style={{ height: `${Math.max(height, 4)}%` }}
                            title={`${value} story points`}
                          />
                          {value > 0 && (
                            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-stone-400">
                              {value}
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-xs ${weeksAgo === 0 ? 'text-amber-400 font-medium' : 'text-stone-500'}`}
                        >
                          {weeksAgo === 0 ? 'This wk' : weeksAgo === 1 ? 'Last wk' : `${weeksAgo}w`}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center gap-4 text-xs text-stone-500">
                  <span>Last {metrics.velocityWeekly.length} weeks</span>
                  <span className="text-stone-600">|</span>
                  <span>
                    Avg: {Math.round(metrics.velocityWeekly.reduce((a, b) => a + b, 0) / metrics.velocityWeekly.length)} pts/week
                  </span>
                </div>
              </div>
            </Card>

            {/* Aging WIP Section */}
            <Card className="bg-stone-950/70 border-stone-800 p-6">
              <h3 className="text-lg font-medium text-stone-200 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-400" />
                Aging Work in Progress
              </h3>
              <AgingWipList items={metrics.wipAging} onTaskClick={handleTaskClick} />
            </Card>

            {/* WIP by Status */}
            {Object.keys(metrics.wipByStatus).length > 0 && (
              <Card className="bg-stone-950/70 border-stone-800 p-6">
                <h3 className="text-lg font-medium text-stone-200 mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-amber-400" />
                  WIP by Status
                </h3>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(metrics.wipByStatus).map(([status, count]) => (
                    <div
                      key={status}
                      className="flex items-center gap-3 bg-stone-900/70 border border-stone-800 px-4 py-3 rounded-lg"
                    >
                      <span className="text-sm text-stone-400 capitalize">
                        {status.replace('_', ' ')}
                      </span>
                      <span className="text-xl font-bold text-stone-100">{count}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
